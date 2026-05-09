import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { randomBytes } from 'crypto';
import { encrypt, decryptPatientNamesWithOptionalReencrypt } from './encryption.util';

const QUIZ_MODE_LABELS: Record<string, { label: string; description: string }> = {
  NAME: { label: 'Type A', description: 'Name recognition' },
  AGE: { label: 'Type B', description: 'Age recognition' },
  RELATIONSHIP: { label: 'Type C', description: 'Relationship recognition' },
};

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
          avatarUrl: createPatientDto.avatarUrl ?? null,
          patientJoinCode: patientJoinCode,
          createdBy: caregiverId,
          ...(createPatientDto.dementiaLevel ? { dementiaLevel: createPatientDto.dementiaLevel } : {}),
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
          name: createPatientDto.name,
          surname: createPatientDto.surname,
          avatarUrl: patient.avatarUrl ?? null,
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

    // Notify the primary caregiver that a new secondary was added
    const primaryLink = await this.prisma.patientCaregiver.findFirst({
      where: { patientId: patient.id, isPrimary: true },
      include: { caregiver: { select: { id: true } } },
    });
    const joiner = await this.prisma.caregiver.findUnique({
      where: { id: caregiverId },
      select: { name: true, surname: true },
    });
    if (primaryLink && joiner && primaryLink.caregiverId !== caregiverId) {
      const { name: pn, surname: ps } = await decryptPatientNamesWithOptionalReencrypt(this.prisma, patient);
      await this.prisma.notification.create({
        data: {
          caregiverId: primaryLink.caregiverId,
          type: 'SECONDARY_ADDED' as any,
          title: 'New team member',
          body: `${joiner.name} ${joiner.surname} joined the care team for ${pn} ${ps}.`,
        },
      });
    }

    const shown = await decryptPatientNamesWithOptionalReencrypt(this.prisma, patient);
    return {
      id: patient.id,
      name: shown.name,
      surname: shown.surname,
    };
  }

  async leaveCareTeam(patientId: string, caregiverId: string) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId } },
    });

    if (!link) throw new NotFoundException('Patient not found in your list');
    if (link.isPrimary) throw new ForbiddenException('Primary caregivers cannot leave — transfer the role first or delete the patient');

    // ── C7: Void any pending delegation requests targeting this caregiver ──
    const pendingDelegations = await this.prisma.delegationRequest.findMany({
      where: { toCaregiverId: caregiverId, patientId, status: 'PENDING' },
      include: { patient: { select: { id: true, name: true, surname: true } } },
    });

    if (pendingDelegations.length > 0) {
      // Mark them as declined (this caregiver is leaving)
      await this.prisma.delegationRequest.updateMany({
        where: { toCaregiverId: caregiverId, patientId, status: 'PENDING' },
        data: { status: 'DECLINED', respondedAt: new Date() },
      });

      // Get the departing caregiver's name
      const leavingCaregiver = await this.prisma.caregiver.findUnique({
        where: { id: caregiverId },
        select: { name: true, surname: true },
      });
      const leaverName = leavingCaregiver
        ? `${leavingCaregiver.name} ${leavingCaregiver.surname}`
        : 'A caregiver';

      // Notify each primary caregiver that this secondary is no longer available
      for (const del of pendingDelegations) {
        const { name: pn, surname: ps } = await decryptPatientNamesWithOptionalReencrypt(this.prisma, del.patient);
        const patientName = `${pn} ${ps}`;
        await this.prisma.notification.create({
          data: {
            caregiverId: del.fromCaregiverId,
            type: 'DELEGATION_DECLINED' as any,
            title: 'Caregiver unavailable',
            body: `${leaverName} has left the care team for ${patientName} and is no longer available to take over. Please select a new successor.`,
          },
        });
      }
    }

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

  async getWelcomeCard(patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, name: true, surname: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const patientName = (await decryptPatientNamesWithOptionalReencrypt(this.prisma, patient)).name;

    const primaryLink = await this.prisma.patientCaregiver.findFirst({
      where: { patientId, isPrimary: true },
      include: { caregiver: { select: { name: true, avatarUrl: true } } },
    });

    return {
      patientName,
      caregiverName: primaryLink?.caregiver.name ?? null,
      caregiverAvatarUrl: primaryLink?.caregiver.avatarUrl ?? null,
    };
  }

  async getPairedStatus(patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { paired: true, biometricRecoveryEnabled: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return {
      paired: patient.paired,
      biometricRecoveryEnabled: patient.biometricRecoveryEnabled,
    };
  }

  async getGreetingSpark(patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, name: true, surname: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const patientName = (await decryptPatientNamesWithOptionalReencrypt(this.prisma, patient)).name;
    const [quizMedia, memoryMedia, latestAnalytics] = await Promise.all([
      this.prisma.media.findMany({
        where: {
          patientId,
          collection: 'QUIZ',
          isActive: true,
          firstName: { not: null },
          relationshipType: { not: null },
        },
        select: { firstName: true, relationshipType: true },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.prisma.media.findMany({
        where: {
          patientId,
          collection: 'MEMORY',
          isActive: true,
          note: { not: null },
        },
        select: { note: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.analyticsSnapshot.findFirst({
        where: { patientId },
        orderBy: { date: 'desc' },
        select: { totalCorrect: true, totalAttempts: true },
      }),
    ]);

    const messages: { kind: 'PERSONAL_FACT' | 'MOTIVATIONAL_SPARK' | 'DAILY_FACT'; message: string }[] = [];

    for (const media of quizMedia) {
      if (media.firstName && media.relationshipType) {
        messages.push({
          kind: 'PERSONAL_FACT',
          message: `${media.firstName} is your ${media.relationshipType}.`,
        });
      }
    }

    for (const media of memoryMedia) {
      const note = media.note?.trim();
      if (note) {
        const shortNote = note.length > 90 ? `${note.slice(0, 87)}...` : note;
        messages.push({ kind: 'PERSONAL_FACT', message: shortNote });
      }
    }

    if (latestAnalytics && latestAnalytics.totalAttempts > 0) {
      messages.push({
        kind: 'MOTIVATIONAL_SPARK',
        message: `You got ${latestAnalytics.totalCorrect}/${latestAnalytics.totalAttempts} right on your last quiz. Great job.`,
      });
    }

    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    messages.push({
      kind: 'DAILY_FACT',
      message: `Today is ${dayName}, ${patientName}. A good day to enjoy your memories.`,
    });
    messages.push({
      kind: 'MOTIVATIONAL_SPARK',
      message: `Good to see you, ${patientName}. You are loved.`,
    });

    return messages[Math.floor(Math.random() * messages.length)];
  }

  async unpairDevice(patientId: string, caregiverId: string) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId } },
    });

    if (!link) throw new NotFoundException('Patient not found in your list');
    if (!link.isPrimary) throw new ForbiddenException('Only the primary caregiver can unpair a device');

    await this.prisma.patient.update({
      where: { id: patientId },
      data: { paired: false, deviceToken: null, biometricRecoveryEnabled: false },
    });

    return { message: 'Device unpaired successfully' };
  }

  async getQuizModes(patientId: string, caregiverId: string): Promise<{ quizModes: string[] }> {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId } },
    });
    if (!link) throw new ForbiddenException('Not a caregiver for this patient');
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { quizModes: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return { quizModes: patient.quizModes };
  }

  async updateQuizModes(patientId: string, caregiverId: string, modes: string[]): Promise<{ quizModes: string[] }> {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId } },
    });
    if (!link) throw new ForbiddenException('Not a caregiver for this patient');

    const VALID = ['NAME', 'AGE', 'RELATIONSHIP'];
    const sanitized = [...new Set(modes.filter((m) => VALID.includes(m)))];
    if (sanitized.length === 0) throw new BadRequestException('At least one quiz mode must remain active');

    const patient = await this.prisma.patient.update({
      where: { id: patientId },
      data: { quizModes: sanitized },
      select: { quizModes: true },
    });
    return { quizModes: patient.quizModes };
  }

  async recordQuizSession(patientId: string, body: any) {
    const mode = typeof body?.mode === 'string' ? body.mode : '';
    const attempts = Array.isArray(body?.attempts) ? body.attempts : [];
    const validModes = Object.keys(QUIZ_MODE_LABELS);
    if (!validModes.includes(mode)) throw new BadRequestException('Invalid quiz mode');
    if (attempts.length === 0) throw new BadRequestException('At least one quiz attempt is required');

    const mediaPublicIds = [...new Set(
      attempts
        .map((attempt: any) => typeof attempt?.mediaPublicId === 'string' ? attempt.mediaPublicId : null)
        .filter(Boolean),
    )] as string[];
    if (mediaPublicIds.length === 0) throw new BadRequestException('Quiz attempts need mediaPublicId values');

    const mediaRows = await this.prisma.media.findMany({
      where: {
        patientId,
        publicId: { in: mediaPublicIds },
        collection: 'QUIZ',
        status: 'READY',
        isActive: true,
      },
      select: { id: true, publicId: true },
    });
    const mediaByPublicId = new Map(mediaRows.map((media) => [media.publicId, media.id]));
    const now = new Date();

    const sanitized = attempts.flatMap((attempt: any) => {
      const mediaId = mediaByPublicId.get(attempt?.mediaPublicId);
      if (!mediaId) return [];
      const attemptedAt = attempt?.attemptedAt ? new Date(attempt.attemptedAt) : now;
      const timeToCorrectMs = Number.isFinite(Number(attempt?.timeToCorrectMs))
        ? Math.max(0, Math.round(Number(attempt.timeToCorrectMs)))
        : 0;
      const totalTaps = Number.isFinite(Number(attempt?.totalTaps))
        ? Math.max(1, Math.round(Number(attempt.totalTaps)))
        : 1;
      return [{
        mediaId,
        mode,
        firstTapCorrect: attempt?.firstTapCorrect === true,
        totalTaps,
        timeToCorrectMs,
        attemptedAt: Number.isNaN(attemptedAt.getTime()) ? now : attemptedAt,
        endAttemptAt: now,
      }];
    });

    if (sanitized.length === 0) throw new BadRequestException('No valid quiz attempts were provided');

    const startedAt = sanitized.reduce(
      (earliest, attempt) => attempt.attemptedAt < earliest ? attempt.attemptedAt : earliest,
      sanitized[0].attemptedAt,
    );
    const correct = sanitized.filter((attempt) => attempt.firstTapCorrect).length;
    const averageTimeMs = Math.round(
      sanitized.reduce((sum, attempt) => sum + attempt.timeToCorrectMs, 0) / sanitized.length,
    );

    await this.prisma.$transaction(async (tx) => {
      const session = await tx.quizSession.create({
        data: { patientId, startedAt, endedAt: now },
      });
      await tx.quizAttempt.createMany({
        data: sanitized.map((attempt) => ({
          sessionId: session.id,
          mediaId: attempt.mediaId,
          mode: attempt.mode,
          firstTapCorrect: attempt.firstTapCorrect,
          totalTaps: attempt.totalTaps,
          timeToCorrectMs: attempt.timeToCorrectMs,
          attemptedAt: attempt.attemptedAt,
          endAttemptAt: attempt.endAttemptAt,
        } as any)),
      });
      await tx.analyticsSnapshot.create({
        data: {
          patientId,
          date: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          totalCorrect: correct,
          totalIncorrect: sanitized.length - correct,
          totalAttempts: sanitized.length,
          accuracyPercentage: sanitized.length > 0 ? (correct / sanitized.length) * 100 : 0,
          averageTimeMs,
        },
      });
    });

    return {
      recorded: sanitized.length,
      totalCorrect: correct,
      totalAttempts: sanitized.length,
      accuracyPercentage: Math.round((correct / sanitized.length) * 100),
    };
  }

  async getQuizProgress(patientId: string, caregiverId: string) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId } },
    });
    if (!link) throw new ForbiddenException('Not a caregiver for this patient');

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { quizModes: true, createdAt: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const [mediaRows, attemptRows] = await Promise.all([
      this.prisma.media.findMany({
        where: {
          patientId,
          collection: 'QUIZ',
          status: 'READY',
          isActive: true,
        },
        select: {
          id: true,
          publicId: true,
          firstName: true,
          lastName: true,
          relationshipType: true,
          birthYear: true,
          eventYear: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.quizAttempt.findMany({
        where: { session: { patientId } },
        select: {
          id: true,
          mediaId: true,
          mode: true,
          firstTapCorrect: true,
          totalTaps: true,
          timeToCorrectMs: true,
          attemptedAt: true,
          endAttemptAt: true,
        } as any,
        orderBy: { attemptedAt: 'desc' },
      }),
    ]);

    const attemptsByKey = new Map<string, typeof attemptRows>();
    for (const attempt of attemptRows as any[]) {
      const key = `${attempt.mode ?? 'NAME'}:${attempt.mediaId}`;
      const list = attemptsByKey.get(key) ?? [];
      list.push(attempt);
      attemptsByKey.set(key, list);
    }

    const modeEligible = (mode: string, media: typeof mediaRows[number]) => {
      if (mode === 'NAME') return Boolean(media.firstName);
      if (mode === 'AGE') return Boolean(media.birthYear && media.eventYear);
      if (mode === 'RELATIONSHIP') return Boolean(media.relationshipType);
      return false;
    };
    const displayName = (media: typeof mediaRows[number]) => {
      const fullName = [media.firstName, media.lastName].filter(Boolean).join(' ').trim();
      return fullName || media.relationshipType || 'Quiz item';
    };
    const formatDuration = (ms: number) => {
      const totalSeconds = Math.max(0, Math.round(ms / 1000));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    const modes = patient.quizModes.filter((mode) => QUIZ_MODE_LABELS[mode]);
    const quizTypes = modes.map((mode) => {
      const config = QUIZ_MODE_LABELS[mode];
      const quizzes = mediaRows.filter((media) => modeEligible(mode, media)).map((media) => {
        const attempts = (attemptsByKey.get(`${mode}:${media.id}`) ?? []) as any[];
        const correct = attempts.filter((attempt) => attempt.firstTapCorrect).length;
        const averageMs = attempts.length > 0
          ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.timeToCorrectMs, 0) / attempts.length)
          : 0;
        const averagePercent = attempts.length > 0 ? Math.round((correct / attempts.length) * 100) : 0;

        return {
          id: `${mode}:${media.publicId}`,
          mode,
          mediaPublicId: media.publicId,
          name: displayName(media),
          attempts: attempts.length,
          averagePercent,
          pointsEarned: correct,
          pointsTotal: attempts.length,
          completed: attempts.length,
          averageTimeMs: averageMs,
          createdAt: media.createdAt.toISOString(),
          questionOutcomes: attempts.map((attempt, index) => ({
            id: attempt.id,
            prompt: `${config.description}: ${displayName(media)}`,
            status: attempt.firstTapCorrect ? 'Correct' : 'Wrong',
            attemptsUntilResult: attempt.totalTaps,
            duration: formatDuration(attempt.timeToCorrectMs),
            takenAt: attempt.attemptedAt.toISOString(),
            takenAtLabel: attempt.attemptedAt.toISOString(),
            skipped: false,
            sequence: attempts.length - index,
          })),
        };
      });

      return {
        id: mode,
        mode,
        label: config.label,
        description: config.description,
        quizzes,
      };
    });

    return {
      patientId,
      registeredAt: patient.createdAt.toISOString(),
      quizTypes,
    };
  }

  async setBiometricRecovery(patientId: string, enabled: boolean) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, paired: true },
    });

    if (!patient) throw new NotFoundException('Patient not found');
    if (!patient.paired) throw new ConflictException('Device must be paired before enabling biometric recovery');

    await this.prisma.patient.update({
      where: { id: patientId },
      data: { biometricRecoveryEnabled: enabled },
    });

    return { biometricRecoveryEnabled: enabled };
  }

  async setQuizReminders(patientId: string, caregiverId: string, times: string[]) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId } },
    });
    if (!link) throw new NotFoundException('Patient not found');
    if (!link.isPrimary) throw new ForbiddenException('Only the primary caregiver can set quiz reminder times');

    const uniqueTimes = Array.from(new Set(times.map((t) => t.trim()))).sort();

    const updated = await this.prisma.patient.update({
      where: { id: patientId },
      data: { quizReminderTimes: uniqueTimes },
      select: { quizReminderTimes: true },
    });

    return { quizReminderTimes: updated.quizReminderTimes };
  }

  async updatePatient(patientId: string, caregiverId: string, data: { name?: string; surname?: string; avatarUrl?: string | null }) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId } },
    });
    if (!link) throw new NotFoundException('Patient not found');
    if (!link.isPrimary) throw new ForbiddenException('Only the primary caregiver can edit patient details');

    const updateData: Record<string, any> = {};
    if (data.name) updateData.name = encrypt(data.name);
    if (data.surname) updateData.surname = encrypt(data.surname);
    if ('avatarUrl' in data) updateData.avatarUrl = data.avatarUrl ?? null;

    const updated = await this.prisma.patient.update({ where: { id: patientId }, data: updateData });
    return {
      message: 'Patient updated successfully',
      avatarUrl: updated.avatarUrl ?? null,
    };
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
      data: { paired: true, biometricRecoveryEnabled: false },
    });

    // Notify all caregivers of this patient that a device was paired
    const caregiverLinks = await this.prisma.patientCaregiver.findMany({
      where: { patientId: patient.id },
      select: { caregiverId: true },
    });
    const { name: pn, surname: ps } = await decryptPatientNamesWithOptionalReencrypt(this.prisma, patient);
    const patientName = `${pn} ${ps}`;
    if (caregiverLinks.length > 0) {
      await this.prisma.notification.createMany({
        data: caregiverLinks.map(link => ({
          caregiverId: link.caregiverId,
          type: 'DEVICE_PAIRED' as any,
          title: 'Device paired',
          body: `A device has been successfully paired for ${patientName}.`,
        })),
      });
    }

    const joined = await decryptPatientNamesWithOptionalReencrypt(this.prisma, patient);
    return {
      id: patient.id,
      name: joined.name,
      surname: joined.surname,
      dateOfBirth: patient.dateOfBirth,
      avatarUrl: patient.avatarUrl ?? null,
      caregiver: {
        name: patient.creator.name,
        surname: patient.creator.surname,
      },
    };
  }
}
