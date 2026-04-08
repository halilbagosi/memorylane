import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
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

  async joinAsCaregiver(joinCode: string, caregiverId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { patientJoinCode: joinCode },
    });

    if (!patient) {
      throw new NotFoundException('Invalid join code');
    }

    const existing = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId: patient.id } },
    });

    if (existing) {
      throw new ConflictException('You are already linked to this patient');
    }

    await this.prisma.patientCaregiver.create({
      data: { caregiverId, patientId: patient.id, isPrimary: false },
    });

    return {
      id: patient.id,
      name: decrypt(patient.name),
      surname: decrypt(patient.surname),
    };
  }

  async leaveCareTeam(patientId: string, caregiverId: string) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId } },
    });

    if (!link) throw new NotFoundException('Patient not found in your list');
    if (link.isPrimary) throw new ForbiddenException('Primary caregivers cannot leave — transfer the role first or delete the patient');

    await this.prisma.patientCaregiver.delete({
      where: { caregiverId_patientId: { caregiverId, patientId } },
    });

    return { message: 'You have left the care team' };
  }

  async getCaregivers(patientId: string, requestingCaregiverId: string) {
    const access = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId: requestingCaregiverId, patientId } },
    });
    if (!access) throw new ForbiddenException('Access denied');

    const links = await this.prisma.patientCaregiver.findMany({
      where: { patientId },
      include: { caregiver: true },
    });

    return links.map(l => ({
      id: l.caregiver.id,
      name: l.caregiver.name,
      surname: l.caregiver.surname,
      isPrimary: l.isPrimary,
    }));
  }

  async getPairedStatus(patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { paired: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return { paired: patient.paired };
  }

  async unpairDevice(patientId: string, caregiverId: string) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId } },
    });

    if (!link) throw new NotFoundException('Patient not found in your list');
    if (!link.isPrimary) throw new ForbiddenException('Only the primary caregiver can unpair a device');

    await this.prisma.patient.update({
      where: { id: patientId },
      data: { paired: false, deviceToken: null },
    });

    return { message: 'Device unpaired successfully' };
  }

  async updatePatient(patientId: string, caregiverId: string, data: { name?: string; surname?: string }) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId } },
    });
    if (!link) throw new NotFoundException('Patient not found');
    if (!link.isPrimary) throw new ForbiddenException('Only the primary caregiver can edit patient details');

    const updateData: Record<string, string> = {};
    if (data.name) updateData.name = encrypt(data.name);
    if (data.surname) updateData.surname = encrypt(data.surname);

    await this.prisma.patient.update({ where: { id: patientId }, data: updateData });
    return { message: 'Patient updated successfully' };
  }

  async removeCaregiver(patientId: string, primaryCaregiverId: string, targetCaregiverId: string) {
    const primaryLink = await this.prisma.patientCaregiver.findFirst({
      where: { patientId, caregiverId: primaryCaregiverId, isPrimary: true },
    });
    if (!primaryLink) throw new ForbiddenException('Only the primary caregiver can remove others');

    const targetLink = await this.prisma.patientCaregiver.findFirst({
      where: { patientId, caregiverId: targetCaregiverId, isPrimary: false },
    });
    if (!targetLink) throw new NotFoundException('Caregiver not found in care team');

    await this.prisma.patientCaregiver.delete({
      where: { caregiverId_patientId: { caregiverId: targetCaregiverId, patientId } },
    });
    return { message: 'Caregiver removed from care team' };
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