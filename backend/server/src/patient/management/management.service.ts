import { Injectable, ForbiddenException, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { decrypt } from '../encryption.util';

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
    const myRelationship = await this.prisma.patientCaregiver.findFirst({
      where: { patientId, caregiverId },
    });

    if (!myRelationship) throw new NotFoundException('You do not have a relationship with this patient');
    if (!myRelationship.isPrimary) throw new ForbiddenException('Only the Primary Caregiver can delete this patient');

    // Gather secondary caregivers, patient name, and primary caregiver name BEFORE deleting
    const [secondaryLinks, patient, primaryCaregiver] = await Promise.all([
      this.prisma.patientCaregiver.findMany({
        where: { patientId, isPrimary: false },
        select: { caregiverId: true },
      }),
      this.prisma.patient.findUnique({ where: { id: patientId }, select: { name: true, surname: true } }),
      this.prisma.caregiver.findUnique({ where: { id: caregiverId }, select: { name: true, surname: true } }),
    ]);

    // ── C9: Void any pending delegation requests for this patient ──
    const pendingDelegations = await this.prisma.delegationRequest.findMany({
      where: { patientId, status: 'PENDING' },
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Notify all secondary caregivers that the patient profile is gone
        if (secondaryLinks.length > 0 && patient) {
          const patientName = `${decrypt(patient.name)} ${decrypt(patient.surname)}`;
          const deleterName = primaryCaregiver ? `${primaryCaregiver.name} ${primaryCaregiver.surname}` : 'The primary caregiver';
          await tx.notification.createMany({
            data: secondaryLinks.map(link => ({
              caregiverId: link.caregiverId,
              type: 'PATIENT_DELETED' as const,
              title: 'Patient profile removed',
              body: `${deleterName} has deleted the profile for ${patientName}.`,
            })),
          });
        }

        // Notify secondaries who had pending delegation requests that the request is void
        if (pendingDelegations.length > 0 && patient) {
          const patientName = `${decrypt(patient.name)} ${decrypt(patient.surname)}`;
          const uniqueSecondaryIds = [...new Set(pendingDelegations.map(d => d.toCaregiverId))];
          await tx.notification.createMany({
            data: uniqueSecondaryIds.map(secId => ({
              caregiverId: secId,
              type: 'DELEGATION_CANCELLED' as any,
              title: 'Transfer request void',
              body: `The profile for ${patientName} has been deleted. The pending transfer request is no longer valid.`,
            })),
          });
        }

        // Mark delegation requests as declined before cascade deletes them
        await tx.delegationRequest.updateMany({
          where: { patientId, status: 'PENDING' },
          data: { status: 'DECLINED', respondedAt: new Date() },
        });

        await tx.patientCaregiver.deleteMany({ where: { patientId } });
        await tx.patient.delete({ where: { id: patientId } });

        return { message: 'Patient profile and all caregiver links deleted successfully' };
      });
    } catch (error) {
      console.error('DATABASE ERROR:', error);
      throw new InternalServerErrorException('Failed to delete patient from database');
    }
  }
}