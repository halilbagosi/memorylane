import { Injectable, ForbiddenException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ManagementService {
  constructor(private prisma: PrismaService) {}

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