import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { decrypt } from '../encryption.util';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getCaregiverOverview(caregiverId: string) {
    const caregiverRelations = await this.prisma.patientCaregiver.findMany({
      where: {
        caregiverId: caregiverId,
      },
      include: {
        patient: true,
      },
    });

    return caregiverRelations.map((relation) => {
      const patient = relation.patient;

      return {
        id: patient.id,
        name: decrypt(patient.name),       //decrypted
        surname: decrypt(patient.surname), //decrypted
        age: patient.age,
        isPrimary: relation.isPrimary,
        patientJoinCode: patient.patientJoinCode,
        paired: patient.paired,
        createdAt: patient.createdAt,
      };
    });
  }
}