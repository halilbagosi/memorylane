import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';
import { decryptPatientNamesWithOptionalReencrypt } from '../patient/encryption.util';

@Injectable()
export class QuizReminderScheduler {
  private readonly logger = new Logger(QuizReminderScheduler.name);
  /** patientId:HH:MM → last sent minute bucket */
  private readonly sentThisMinute = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

  @Cron('* * * * *')
  async handleQuizReminders(): Promise<void> {
    const patients = await this.prisma.patient.findMany({
      where: {
        paired: true,
        deviceToken: { not: null },
        quizReminderTimes: { isEmpty: false },
      },
      select: {
        id: true,
        name: true,
        surname: true,
        quizReminderTimes: true,
        reminderTimezone: true,
      },
    });

    const now = new Date();
    for (const patient of patients) {
      const tz = patient.reminderTimezone || 'UTC';
      const currentHm = this.formatHmInTimezone(now, tz);
      if (!patient.quizReminderTimes.includes(currentHm)) continue;

      const dedupeKey = `${patient.id}:${currentHm}`;
      const minuteBucket = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`;
      if (this.sentThisMinute.get(dedupeKey) === minuteBucket) continue;
      this.sentThisMinute.set(dedupeKey, minuteBucket);

      if (this.sentThisMinute.size > 5000) {
        this.sentThisMinute.clear();
      }

      try {
        const { name, surname } = await decryptPatientNamesWithOptionalReencrypt(
          this.prisma,
          patient,
        );
        const displayName = [name, surname].filter(Boolean).join(' ').trim() || 'your loved one';
        await this.pushService.sendToPatientDevice(patient.id, {
          title: 'Time for your quiz',
          body: `Ready for a memory quiz, ${displayName}?`,
          data: { screen: 'quiz' },
        });
      } catch (err) {
        this.logger.error(`Quiz reminder failed for patient ${patient.id}`, err);
      }
    }
  }

  private formatHmInTimezone(date: Date, timeZone: string): string {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(date);
      const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
      const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
      return `${hour}:${minute}`;
    } catch {
      const h = date.getUTCHours().toString().padStart(2, '0');
      const m = date.getUTCMinutes().toString().padStart(2, '0');
      return `${h}:${m}`;
    }
  }
}
