import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { PrismaService } from '../prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly expo: Expo;

  constructor(private readonly prisma: PrismaService) {
    this.expo = new Expo({
      accessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
    });
  }

  async sendToCaregiver(caregiverId: string, payload: PushPayload): Promise<void> {
    const caregiver = await this.prisma.caregiver.findUnique({
      where: { id: caregiverId },
      select: { pushToken: true },
    });
    if (!caregiver?.pushToken) return;
    await this.sendToTokens([caregiver.pushToken], payload);
  }

  async sendToCaregivers(
    caregiverIds: string[],
    payload: PushPayload,
  ): Promise<void> {
    const uniqueIds = [...new Set(caregiverIds.filter(Boolean))];
    if (uniqueIds.length === 0) return;

    const caregivers = await this.prisma.caregiver.findMany({
      where: { id: { in: uniqueIds } },
      select: { pushToken: true },
    });
    const tokens = caregivers
      .map((c) => c.pushToken)
      .filter((t): t is string => Boolean(t));
    await this.sendToTokens(tokens, payload);
  }

  async sendToPatientDevice(patientId: string, payload: PushPayload): Promise<void> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { deviceToken: true },
    });
    if (!patient?.deviceToken) return;
    await this.sendToTokens([patient.deviceToken], payload);
  }

  private async sendToTokens(tokens: string[], payload: PushPayload): Promise<void> {
    const validTokens = tokens.filter((token) => Expo.isExpoPushToken(token));
    if (validTokens.length === 0) return;

    const messages: ExpoPushMessage[] = validTokens.map((to) => ({
      to,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data,
    }));

    const chunks = this.expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        for (const ticket of tickets) {
          if (ticket.status === 'error') {
            this.logger.warn(`Push ticket error: ${ticket.message}`);
          }
        }
      } catch (err) {
        this.logger.error('Failed to send push notifications', err);
      }
    }
  }
}
