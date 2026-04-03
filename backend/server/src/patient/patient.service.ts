import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class PatientService {
  constructor(private prisma: PrismaService) {}

  //create patient logic
  async create(createPatientDto: CreatePatientDto, caregiverId: string) {
    //generate a unique 6-character code as eg: 7B2A91
    const patientJoinCode = randomBytes(3).toString('hex').toUpperCase();

    return this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.create({
        data: {
          ...createPatientDto,
          patientJoinCode: patientJoinCode,
          createdBy: caregiverId,
        },
      });

      // make the creator as the primary caregiver
      await tx.patientCaregiver.create({
        data: {
          caregiverId: caregiverId,
          patientId: patient.id,
          isPrimary: true,
        },
      });

      return {
        message: 'Patient profile and family space created',
        patient,
      };
    });
  }
}