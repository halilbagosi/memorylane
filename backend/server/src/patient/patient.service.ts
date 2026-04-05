import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { randomBytes } from 'crypto';
import { encrypt, decrypt } from './encryption.util';

@Injectable()
export class PatientService {
  constructor(private prisma: PrismaService) {}

  async create(createPatientDto: CreatePatientDto, caregiverId: string) {
    //generate unique 6-character code as eg: 7B2A91
    const patientJoinCode = randomBytes(3).toString('hex').toUpperCase();

    return this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.create({
        data: {
          name: encrypt(createPatientDto.name),
          surname: encrypt(createPatientDto.surname),
          dateOfBirth: new Date(createPatientDto.dateOfBirth),
          patientJoinCode: patientJoinCode,
          createdBy: caregiverId,
        },
      });

      //link the creator of the patient as primary
      await tx.patientCaregiver.create({
        data: {
          caregiverId: caregiverId,
          patientId: patient.id,
          isPrimary: true,
        },
      });

      return {
        message: 'Patient profile created successfully with encryption',
        patient: {
          ...patient,
          name: createPatientDto.name, //decrypted, readable name for ui
          surname: createPatientDto.surname,
        },
      };
    });
  }

  async joinWithCode(joinCode: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { patientJoinCode: joinCode },
      include: { creator: true },
    });

    if (!patient) {
      throw new NotFoundException('Invalid join code');
    }

    await this.prisma.patient.update({
      where: { id: patient.id },
      data: { paired: true },
    });

    return {
      id: patient.id,
      name: decrypt(patient.name),
      surname: decrypt(patient.surname),
      dateOfBirth: patient.dateOfBirth,
      caregiver: {
        name: patient.creator.name,
        surname: patient.creator.surname,
      },
    };
  }
}