import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptPatientNamesWithOptionalReencrypt } from '../encryption.util';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getCaregiverOverview(caregiverId: string) {
    const caregiverRelations = await this.prisma.patientCaregiver.findMany({
      where: { caregiverId },
      include: {
        patient: {
          include: {
            patientCaregivers: {
              include: { caregiver: true },
            },
          },
        },
      },
    });

    return Promise.all(
      caregiverRelations.map(async (relation) => {
        const patient = relation.patient;
        const primaryLink = patient.patientCaregivers.find(pc => pc.isPrimary);
        const secondaryLinks = patient.patientCaregivers.filter(pc => !pc.isPrimary);

        const { name, surname } = await decryptPatientNamesWithOptionalReencrypt(this.prisma, {
          id: patient.id,
          name: patient.name,
          surname: patient.surname,
        });

        return {
          id: patient.id,
          name,
          surname,
          dateOfBirth: patient.dateOfBirth,
          avatarUrl: patient.avatarUrl ?? null,
          isPrimary: relation.isPrimary,
          patientJoinCode: patient.patientJoinCode,
          paired: patient.paired,
          createdAt: patient.createdAt,
          primaryCaregiver: primaryLink
            ? {
                id: primaryLink.caregiver.id,
                name: primaryLink.caregiver.name,
                surname: primaryLink.caregiver.surname,
                avatarUrl: primaryLink.caregiver.avatarUrl ?? null,
              }
            : null,
          secondaryCaregivers: secondaryLinks.map(pc => ({
            id: pc.caregiver.id,
            name: pc.caregiver.name,
            surname: pc.caregiver.surname,
            avatarUrl: pc.caregiver.avatarUrl ?? null,
          })),
        };
      }),
    );
  }
}