import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  //find all patients for a specific user
  async getCaregiverOverview(caregiverId: string) {
    return this.prisma.patientCaregiver.findMany({
      where: { caregiverId },
      include: { 
        patient: {
          select: {
            id: true,
            name: true,
            surname: true,
            age: true,
            patientJoinCode: true,
            paired: true,
          }
        } 
      },
    });
  }
}