import { Injectable, ForbiddenException, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptPatientNamesWithOptionalReencrypt } from '../encryption.util';
import { PushService } from '../../push/push.service';

@Injectable()
export class ManagementService {
  constructor(
    private prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

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
      this.prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, name: true, surname: true } }),
      this.prisma.caregiver.findUnique({ where: { id: caregiverId }, select: { name: true, surname: true } }),
    ]);

    // ── C9: Void any pending delegation requests for this patient ──
    const pendingDelegations = await this.prisma.delegationRequest.findMany({
      where: { patientId, status: 'PENDING' },
    });

    const pushAfterDelete: Array<{ caregiverId: string; title: string; body: string }> = [];
    let deletedNotifications: Array<{
      caregiverId: string;
      type: 'PATIENT_DELETED';
      title: string;
      body: string;
    }> = [];
    let voidedDelegationNotifications: Array<{
      caregiverId: string;
      type: 'DELEGATION_CANCELLED';
      title: string;
      body: string;
    }> = [];

    if (patient) {
      const { name: pn, surname: ps } = await decryptPatientNamesWithOptionalReencrypt(this.prisma, patient);
      const patientName = `${pn} ${ps}`;
      const deleterName = primaryCaregiver
        ? `${primaryCaregiver.name} ${primaryCaregiver.surname}`
        : 'The primary caregiver';

      if (secondaryLinks.length > 0) {
        const title = 'Patient profile removed';
        const body = `${deleterName} has deleted the profile for ${patientName}.`;
        deletedNotifications = secondaryLinks.map((link) => ({
          caregiverId: link.caregiverId,
          type: 'PATIENT_DELETED' as const,
          title,
          body,
        }));
        pushAfterDelete.push(...deletedNotifications);
      }

      if (pendingDelegations.length > 0) {
        const title = 'Transfer request void';
        const body = `The profile for ${patientName} has been deleted. The pending transfer request is no longer valid.`;
        const uniqueSecondaryIds = [...new Set(pendingDelegations.map((d) => d.toCaregiverId))];
        voidedDelegationNotifications = uniqueSecondaryIds.map((caregiverId) => ({
          caregiverId,
          type: 'DELEGATION_CANCELLED' as const,
          title,
          body,
        }));
        pushAfterDelete.push(...voidedDelegationNotifications);
      }
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        if (deletedNotifications.length > 0) {
          await tx.notification.createMany({ data: deletedNotifications });
        }

        if (voidedDelegationNotifications.length > 0) {
          await tx.notification.createMany({ data: voidedDelegationNotifications });
        }

        // Mark delegation requests as declined before cascade deletes them
        await tx.delegationRequest.updateMany({
          where: { patientId, status: 'PENDING' },
          data: { status: 'DECLINED', respondedAt: new Date() },
        });

        // Manually cascade delete all related records to satisfy foreign key constraints
        const sessions = await tx.quizSession.findMany({ where: { patientId }, select: { id: true } });
        const sessionIds = sessions.map(s => s.id);
        
        await tx.quizAttempt.deleteMany({ where: { sessionId: { in: sessionIds } } });
        await tx.quizSession.deleteMany({ where: { patientId } });
        await tx.media.deleteMany({ where: { patientId } });
        await tx.analyticsSnapshot.deleteMany({ where: { patientId } });
        await tx.delegationRequest.deleteMany({ where: { patientId } });
        await tx.roleRequest.deleteMany({ where: { patientId } });
        await tx.patientCaregiver.deleteMany({ where: { patientId } });
        await tx.patient.delete({ where: { id: patientId } });

        return { message: 'Patient profile and all caregiver links deleted successfully' };
      });

      for (const item of pushAfterDelete) {
        await this.pushService.sendToCaregiver(item.caregiverId, {
          title: item.title,
          body: item.body,
        });
      }

      return result;
    } catch (error) {
      console.error('DATABASE ERROR:', error);
      throw new InternalServerErrorException('Failed to delete patient from database');
    }
  }
}