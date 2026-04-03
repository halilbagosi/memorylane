import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { randomBytes } from 'crypto';
import { encrypt } from './encryption.util';

@Injectable()
export class PatientService {
  constructor(private prisma: PrismaService) {}

  async create(createPatientDto: CreatePatientDto, caregiverId: string) {
    //generate unique 6-character code as eg: 7B2A91
    const patientJoinCode = randomBytes(3).toString('hex').toUpperCase();

    return this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.create({
        data: {
          name: encrypt(createPatientDto.name), // encrypted name
          surname: encrypt(createPatientDto.surname), // encrypted surname
          age: createPatientDto.age,
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
}