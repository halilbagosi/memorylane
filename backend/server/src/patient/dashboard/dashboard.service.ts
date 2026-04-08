import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { decrypt } from '../encryption.util';

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

    return caregiverRelations.map((relation) => {
      const patient = relation.patient;
      const primaryLink = patient.patientCaregivers.find(pc => pc.isPrimary);
      const secondaryLinks = patient.patientCaregivers.filter(pc => !pc.isPrimary);

      return {
        id: patient.id,
        name: decrypt(patient.name),
        surname: decrypt(patient.surname),
        dateOfBirth: patient.dateOfBirth,
        isPrimary: relation.isPrimary,
        patientJoinCode: patient.patientJoinCode,
        paired: patient.paired,
        createdAt: patient.createdAt,
        primaryCaregiver: primaryLink
          ? { name: primaryLink.caregiver.name, surname: primaryLink.caregiver.surname }
          : null,
        secondaryCaregivers: secondaryLinks.map(pc => ({
          id: pc.caregiver.id,
          name: pc.caregiver.name,
          surname: pc.caregiver.surname,
        })),
      };
    });
  }
}