import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { randomBytes } from 'crypto';
import { encrypt, decryptPatientNamesWithOptionalReencrypt } from './encryption.util';
import { AiDifficultyService, QuizDifficulty } from './ai-difficulty.service';
import { getPlanLimits } from '../auth/subscription.constants';
import { PushService } from '../push/push.service';

export type CareLevelValue = 'PREVENTATIVE' | 'DEMENTIA';

export interface QuizSettings {
  quizModes: string[];
  quizDifficulty: string;
  predictedDifficulty: QuizDifficulty;
  careLevel: CareLevelValue;
  aiAdaptiveEnabled: boolean;
  successRate: number;
}

interface QuizResultAttemptInput {
  publicId: string;
  mode?: string;
  difficulty?: string;
  firstTapCorrect: boolean;
  totalTaps: number;
  timeToCorrectMs: number;
  hadHint?: boolean;
}

const QUIZ_MODE_LABELS: Record<string, { label: string; description: string }> = {
  NAME: { label: 'Type A', description: 'Name recognition' },
  AGE: { label: 'Type B', description: 'Age recognition' },
  RELATIONSHIP: { label: 'Type C', description: 'Relationship recognition' },
};

@Injectable()
export class PatientService {
  constructor(
    private prisma: PrismaService,
    private readonly aiDifficulty: AiDifficultyService,
    private readonly pushService: PushService,
  ) {}

  async create(createPatientDto: CreatePatientDto, caregiverId: string) {
    // ── Subscription: enforce patient limit for free-plan users ──
    const caregiver = await this.prisma.caregiver.findUnique({ where: { id: caregiverId }, select: { isSubscribed: true } });
    const limits = getPlanLimits(caregiver?.isSubscribed ?? false);
    const currentPatientCount = await this.prisma.patientCaregiver.count({ where: { caregiverId } });
    if (currentPatientCount >= limits.maxPatientsPerCaregiver) {
      throw new ForbiddenException(
        `Free plan allows up to ${limits.maxPatientsPerCaregiver} patients. Upgrade to Premium for unlimited patients.`,
      );
    }

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
          aiAdaptiveEnabled: limits.aiDifficultyEnabled,
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

    // ── Subscription: enforce secondary caregiver limit ──
    const ownerLink = await this.prisma.patientCaregiver.findFirst({
      where: { patientId: patient.id, isPrimary: true },
      include: { caregiver: { select: { isSubscribed: true } } },
    });
    if (ownerLink) {
      const ownerLimits = getPlanLimits(ownerLink.caregiver.isSubscribed);
      const secondaryCount = await this.prisma.patientCaregiver.count({
        where: { patientId: patient.id, isPrimary: false },
      });
      if (secondaryCount >= ownerLimits.maxSecondaryCaregiversPerPatient) {
        throw new ForbiddenException(
          `This patient has reached the maximum of ${ownerLimits.maxSecondaryCaregiversPerPatient} secondary caregivers. The primary caregiver needs to upgrade to Premium.`,
        );
      }
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
      const title = 'New team member';
      const body = `${joiner.name} ${joiner.surname} joined the care team for ${pn} ${ps}.`;
      await this.prisma.notification.create({
        data: {
          caregiverId: primaryLink.caregiverId,
          type: 'SECONDARY_ADDED' as any,
          title,
          body,
        },
      });
      await this.pushService.sendToCaregiver(primaryLink.caregiverId, { title, body });
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
        const title = 'Caregiver unavailable';
        const body = `${leaverName} has left the care team for ${patientName} and is no longer available to take over. Please select a new successor.`;
        await this.prisma.notification.create({
          data: {
            caregiverId: del.fromCaregiverId,
            type: 'DELEGATION_DECLINED' as any,
            title,
            body,
          },
        });
        await this.pushService.sendToCaregiver(del.fromCaregiverId, { title, body });
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

  async updateDeviceToken(patientId: string, token: string, timezone?: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { paired: true, reminderTimezone: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    if (!patient.paired) {
      throw new ConflictException('Device must be paired before registering for notifications');
    }

    await this.prisma.patient.update({
      where: { id: patientId },
      data: {
        deviceToken: token,
        reminderTimezone: timezone ?? patient.reminderTimezone ?? 'UTC',
      },
    });

    return { message: 'Device token saved' };
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
      data: {
        paired: false,
        deviceToken: null,
        reminderTimezone: null,
        biometricRecoveryEnabled: false,
      },
    });

    return { message: 'Device unpaired successfully' };
  }

  async getQuizModes(patientId: string, caregiverId: string): Promise<QuizSettings> {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId } },
    });
    if (!link) throw new ForbiddenException('Not a caregiver for this patient');
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        quizModes: true,
        quizDifficulty: true,
        careLevel: true,
        aiAdaptiveEnabled: true,
        successRate: true,
        aiDifficultyModel: true,
      },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return this.withPredictedDifficulty(patientId, patient);
  }

  async updateQuizModes(
    patientId: string,
    caregiverId: string,
    modes: string[],
    difficulty?: string,
    careLevel?: string,
    aiAdaptiveEnabled?: boolean,
  ): Promise<QuizSettings> {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId } },
    });
    if (!link) throw new ForbiddenException('Not a caregiver for this patient');
    const caregiver = await this.prisma.caregiver.findUnique({
      where: { id: caregiverId },
      select: { isSubscribed: true },
    });
    const limits = getPlanLimits(caregiver?.isSubscribed ?? false);
    if (aiAdaptiveEnabled === true && !limits.aiDifficultyEnabled) {
      throw new ForbiddenException('AI adaptive difficulty requires a Premium subscription');
    }

    const VALID = ['NAME', 'AGE', 'RELATIONSHIP'];
    const sanitized = [...new Set(modes.filter((m) => VALID.includes(m)))];
    if (sanitized.length === 0) throw new BadRequestException('At least one quiz mode must remain active');
    const VALID_DIFFICULTY = ['EASY', 'MEDIUM', 'HARD'];
    const quizDifficulty = difficulty && VALID_DIFFICULTY.includes(difficulty) ? difficulty : undefined;
    const VALID_CARE_LEVELS = ['PREVENTATIVE', 'DEMENTIA'];
    const nextCareLevel = careLevel && VALID_CARE_LEVELS.includes(careLevel) ? careLevel : undefined;

    const patient = await this.prisma.patient.update({
      where: { id: patientId },
      data: {
        quizModes: sanitized,
        ...(quizDifficulty ? { quizDifficulty } : {}),
        ...(nextCareLevel ? { careLevel: nextCareLevel as CareLevelValue } : {}),
        ...(typeof aiAdaptiveEnabled === 'boolean'
          ? { aiAdaptiveEnabled: limits.aiDifficultyEnabled ? aiAdaptiveEnabled : false }
          : {}),
      },
      select: {
        quizModes: true,
        quizDifficulty: true,
        careLevel: true,
        aiAdaptiveEnabled: true,
        successRate: true,
        aiDifficultyModel: true,
      },
    });
    return this.withPredictedDifficulty(patientId, patient);
  }

  async recordQuizResults(patientId: string, attempts: QuizResultAttemptInput[]) {
    if (!Array.isArray(attempts) || attempts.length === 0) {
      throw new BadRequestException('Quiz results require at least one attempt');
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        quizDifficulty: true,
        aiAdaptiveEnabled: true,
        aiDifficultyModel: true,
      },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const publicIds = attempts.map((attempt) => attempt.publicId).filter(Boolean);
    const mediaRows = await this.prisma.media.findMany({
      where: { patientId, publicId: { in: publicIds }, collection: 'QUIZ' },
      select: { id: true, publicId: true },
    });
    const mediaByPublicId = new Map(mediaRows.map((media) => [media.publicId, media.id]));
    const validAttempts = attempts.filter((attempt) => mediaByPublicId.has(attempt.publicId));
    if (validAttempts.length === 0) throw new BadRequestException('No valid quiz media found for results');

    const now = new Date();
    const correctCount = validAttempts.filter((a) => a.firstTapCorrect === true).length;
    const totalAttemptsCount = validAttempts.length;
    const averageTimeMsForSession = Math.round(
      validAttempts.reduce((sum, a) => sum + (Number(a.timeToCorrectMs) || 0), 0) / totalAttemptsCount,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const session = await tx.quizSession.create({
        data: {
          patientId,
          endedAt: now,
          quizAttempts: {
            create: validAttempts.map((attempt) => ({
              mediaId: mediaByPublicId.get(attempt.publicId)!,
              firstTapCorrect: attempt.firstTapCorrect === true,
              totalTaps: Math.max(1, Math.min(10, Number(attempt.totalTaps) || 1)),
              timeToCorrectMs: Math.max(250, Math.min(120000, Number(attempt.timeToCorrectMs) || 8000)),
              difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(attempt.difficulty ?? '') ? attempt.difficulty : patient.quizDifficulty,
              questionMode: ['NAME', 'AGE', 'RELATIONSHIP'].includes(attempt.mode ?? '') ? attempt.mode : 'NAME',
              hadHint: attempt.hadHint === true,
              endAttemptAt: now,
            })),
          },
        },
      });

      await tx.analyticsSnapshot.create({
        data: {
          patientId,
          date: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          totalCorrect: correctCount,
          totalIncorrect: totalAttemptsCount - correctCount,
          totalAttempts: totalAttemptsCount,
          accuracyPercentage: totalAttemptsCount > 0 ? (correctCount / totalAttemptsCount) * 100 : 0,
          averageTimeMs: averageTimeMsForSession,
        },
      });

      return session;
    });

    const lastAttempts = await this.prisma.quizAttempt.findMany({
      where: { session: { patientId } },
      orderBy: { attemptedAt: 'desc' },
      take: 10,
      select: {
        firstTapCorrect: true,
        timeToCorrectMs: true,
        totalTaps: true,
        difficulty: true,
      },
    });
    const successRate = lastAttempts.length > 0
      ? lastAttempts.filter((attempt) => attempt.firstTapCorrect).length / lastAttempts.length
      : 0;
    const averageTimeMs = lastAttempts.length > 0
      ? lastAttempts.reduce((sum, attempt) => sum + attempt.timeToCorrectMs, 0) / lastAttempts.length
      : 8000;
    const latest = validAttempts[validAttempts.length - 1];
    const inputs = {
      accuracy: successRate,
      responseTimeNormalized: this.aiDifficulty.normalizeResponseTime(latest.timeToCorrectMs, Math.min(averageTimeMs, 8000)),
      timeOfDay: this.aiDifficulty.timeOfDayScore(),
      currentDifficulty: this.aiDifficulty.difficultyToComplexity(latest.difficulty ?? patient.quizDifficulty),
      attemptLoad: this.aiDifficulty.normalizeAttemptLoad(latest.totalTaps),
    };
    const targetComplexity = await this.aiDifficulty.saveTrainingSample(
      patientId,
      inputs,
      latest.firstTapCorrect,
    );

    const aiDifficultyModel = patient.aiAdaptiveEnabled
      ? this.aiDifficulty.trainWithResult(patient.aiDifficultyModel, inputs, latest.firstTapCorrect)
      : patient.aiDifficultyModel;
    const prediction = patient.aiAdaptiveEnabled
      ? this.aiDifficulty.predict(inputs, aiDifficultyModel)
      : this.aiDifficulty.ruleBased(inputs);

    await this.prisma.patient.update({
      where: { id: patientId },
      data: {
        successRate,
        aiDifficultyModel: aiDifficultyModel as any,
      },
    });

    return {
      successRate,
      predictedDifficulty: patient.aiAdaptiveEnabled ? prediction.difficulty : (patient.quizDifficulty as QuizDifficulty),
      targetComplexity,
      source: patient.aiAdaptiveEnabled ? prediction.source : 'RULE_BASED',
    };
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
          questionMode: attempt.mode,
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
          questionMode: true,
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
      const key = `${attempt.questionMode ?? 'NAME'}:${attempt.mediaId}`;
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

  async updatePatientLocation(
    patientId: string,
    data: { latitude: number; longitude: number; capturedAt?: string; locationShareToken?: string },
  ) {
    const latitude = Number(data.latitude);
    const longitude = Number(data.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new BadRequestException('Latitude must be between -90 and 90');
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new BadRequestException('Longitude must be between -180 and 180');
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, paired: true, patientJoinCode: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    if (!patient.paired) throw new ConflictException('Device must be paired before sharing location');
    if (!data.locationShareToken || data.locationShareToken !== patient.patientJoinCode) {
      throw new ForbiddenException('Invalid location share token');
    }

    const capturedAt = data.capturedAt ? new Date(data.capturedAt) : new Date();
    const lastLocationAt = Number.isNaN(capturedAt.getTime()) ? new Date() : capturedAt;

    const updated = await this.prisma.patient.update({
      where: { id: patientId },
      data: {
        lastLatitude: latitude,
        lastLongitude: longitude,
        lastLocationAt,
      },
      select: {
        lastLatitude: true,
        lastLongitude: true,
        lastLocationAt: true,
      },
    });

    return {
      latitude: updated.lastLatitude,
      longitude: updated.lastLongitude,
      updatedAt: updated.lastLocationAt,
    };
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
      const title = 'Device paired';
      const body = `A device has been successfully paired for ${patientName}.`;
      const notifications = caregiverLinks.map(link => ({
        caregiverId: link.caregiverId,
        type: 'DEVICE_PAIRED' as any,
        title,
        body,
      }));
      await this.prisma.notification.createMany({ data: notifications });
      await this.pushService.sendToCaregivers(
        caregiverLinks.map((link) => link.caregiverId),
        { title, body },
      );
    }

    const joined = await decryptPatientNamesWithOptionalReencrypt(this.prisma, patient);
    return {
      id: patient.id,
      name: joined.name,
      surname: joined.surname,
      dateOfBirth: patient.dateOfBirth,
      avatarUrl: patient.avatarUrl ?? null,
      locationShareToken: patient.patientJoinCode,
      caregiver: {
        name: patient.creator.name,
        surname: patient.creator.surname,
      },
    };
  }

  private async withPredictedDifficulty(
    patientId: string,
    patient: {
      quizModes: string[];
      quizDifficulty: string;
      careLevel: CareLevelValue;
      aiAdaptiveEnabled: boolean;
      successRate: number;
      aiDifficultyModel?: unknown;
    },
  ): Promise<QuizSettings> {
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { session: { patientId } },
      orderBy: { attemptedAt: 'desc' },
      take: 10,
      select: { timeToCorrectMs: true },
    });
    const averageTimeMs = attempts.length > 0
      ? attempts.reduce((sum, attempt) => sum + attempt.timeToCorrectMs, 0) / attempts.length
      : 8000;
    const latestTimeMs = attempts[0]?.timeToCorrectMs ?? averageTimeMs;
    const inputs = {
      accuracy: patient.successRate,
      responseTimeNormalized: this.aiDifficulty.normalizeResponseTime(latestTimeMs, Math.min(averageTimeMs, 8000)),
      timeOfDay: this.aiDifficulty.timeOfDayScore(),
      currentDifficulty: this.aiDifficulty.difficultyToComplexity(patient.quizDifficulty),
    };
    const prediction = patient.aiAdaptiveEnabled
      ? this.aiDifficulty.predict(inputs, patient.aiDifficultyModel)
      : this.aiDifficulty.ruleBased(inputs);

    return {
      quizModes: patient.quizModes,
      quizDifficulty: patient.quizDifficulty,
      predictedDifficulty: patient.aiAdaptiveEnabled ? prediction.difficulty : (patient.quizDifficulty as QuizDifficulty),
      careLevel: patient.careLevel,
      aiAdaptiveEnabled: patient.aiAdaptiveEnabled,
      successRate: patient.successRate,
    };
  }

  // ── Goals ──────────────────────────────────────────────────────────

  async upsertGoal(patientId: string, caregiverId: string, targetAccuracy: number) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId } },
    });
    if (!link) throw new ForbiddenException('Not a caregiver for this patient');

    const goal = await this.prisma.caregiverGoal.upsert({
      where: { caregiverId_patientId: { caregiverId, patientId } },
      update: { targetAccuracy },
      create: { caregiverId, patientId, targetAccuracy },
    });

    return { id: goal.id, targetAccuracy: goal.targetAccuracy };
  }

  async getGoal(patientId: string, caregiverId: string) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId } },
    });
    if (!link) throw new ForbiddenException('Not a caregiver for this patient');

    const goal = await this.prisma.caregiverGoal.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId } },
    });

    return goal ? { id: goal.id, targetAccuracy: goal.targetAccuracy } : { id: null, targetAccuracy: null };
  }

  async deleteGoal(patientId: string, caregiverId: string) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId } },
    });
    if (!link) throw new ForbiddenException('Not a caregiver for this patient');

    await this.prisma.caregiverGoal.deleteMany({
      where: { caregiverId, patientId },
    });

    return { message: 'Goal removed' };
  }

  async getPatientStats(patientId: string, caregiverId: string | null) {
    if (caregiverId) {
      const link = await this.prisma.patientCaregiver.findUnique({
        where: { caregiverId_patientId: { caregiverId, patientId } },
      });
      if (!link) throw new ForbiddenException('Not a caregiver for this patient');
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, name: true, surname: true, successRate: true, patientCaregivers: { where: { isPrimary: true }, select: { caregiverId: true } } },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    // Compute overall accuracy from all quiz attempts
    const allAttempts = await this.prisma.quizAttempt.findMany({
      where: { session: { patientId } },
      select: { firstTapCorrect: true, timeToCorrectMs: true },
    });

    const totalAttempts = allAttempts.length;
    const totalCorrect = allAttempts.filter((a) => a.firstTapCorrect).length;
    const currentAccuracy = totalAttempts > 0
      ? Math.round((totalCorrect / totalAttempts) * 100)
      : 0;
    const averageTimeMs = totalAttempts > 0
      ? Math.round(allAttempts.reduce((sum, a) => sum + a.timeToCorrectMs, 0) / totalAttempts)
      : 0;

    // Get the last 7 analytics snapshots for the trend mini-chart
    const recentSnapshots = await this.prisma.analyticsSnapshot.findMany({
      where: { patientId },
      orderBy: { date: 'desc' },
      take: 7,
      select: {
        date: true,
        accuracyPercentage: true,
        totalAttempts: true,
        totalCorrect: true,
      },
    });

    // Get goal
    const targetCaregiverId = caregiverId || patient.patientCaregivers[0]?.caregiverId;
    let goal = null;
    if (targetCaregiverId) {
      goal = await this.prisma.caregiverGoal.findUnique({
        where: { caregiverId_patientId: { caregiverId: targetCaregiverId, patientId } },
      });
    }

    const { name, surname } = await decryptPatientNamesWithOptionalReencrypt(this.prisma, patient);

    return {
      patientId,
      patientName: `${name} ${surname}`,
      currentAccuracy,
      totalAttempts,
      totalCorrect,
      averageTimeMs,
      goal: goal ? { id: goal.id, targetAccuracy: goal.targetAccuracy } : null,
      recentSnapshots: recentSnapshots.reverse().map((s) => ({
        date: s.date.toISOString().split('T')[0],
        accuracy: Math.round(s.accuracyPercentage),
        attempts: s.totalAttempts,
        correct: s.totalCorrect,
      })),
    };
  }
}
