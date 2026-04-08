import { Injectable, ForbiddenException, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ManagementService {
  constructor(private prisma: PrismaService) {}

  async delegatePrimaryRole(patientId: string, currentPrimaryId: string, targetCaregiverId: string) {
    return this.prisma.$transaction(async (tx) => {
      const currentRel = await tx.patientCaregiver.findFirst({
        where: { patientId, caregiverId: currentPrimaryId, isPrimary: true },
      });
      if (!currentRel) throw new ForbiddenException('Only the Primary Caregiver can delegate this role.');

      const targetRel = await tx.patientCaregiver.findFirst({
        where: { patientId, caregiverId: targetCaregiverId, isPrimary: false },
      });
      if (!targetRel) throw new BadRequestException('Target user must be a member of the Care Team first.');

      await tx.patientCaregiver.update({
        where: { caregiverId_patientId: { caregiverId: currentPrimaryId, patientId } },
        data: { isPrimary: false },
      });

      await tx.patientCaregiver.update({
        where: { caregiverId_patientId: { caregiverId: targetCaregiverId, patientId } },
        data: { isPrimary: true },
      });

      return { message: 'Role successfully delegated. You are now a Secondary Caregiver.' };
    });
  }

  async deletePatient(patientId: string, caregiverId: string) {
    // 1. First, check if the current user is actually the PRIMARY for this patient
    const myRelationship = await this.prisma.patientCaregiver.findFirst({
      where: { patientId, caregiverId },
    });

    if (!myRelationship) {
      throw new NotFoundException('You do not have a relationship with this patient');
    }

    if (!myRelationship.isPrimary) {
      throw new ForbiddenException('Only the Primary Caregiver can delete this patient');
    }

    // 2. Action: Delete the records using a Transaction
    try {
      return await this.prisma.$transaction(async (tx) => {
        
        // STEP A: Delete ALL links in the junction table for this patient
        // This removes the "glue" for you AND any secondary caregivers
        await tx.patientCaregiver.deleteMany({
          where: { patientId: patientId },
        });

        // STEP B: Now the patient is "free," so we can delete the patient record
        await tx.patient.delete({
          where: { id: patientId },
        });

        return { message: 'Patient profile and all caregiver links deleted successfully' };
      });
    } catch (error) {
      console.error('DATABASE ERROR:', error);
      throw new InternalServerErrorException('Failed to delete patient from database');
    }
  }
}