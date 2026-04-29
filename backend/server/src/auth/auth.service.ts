import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { decryptPatientNamesWithOptionalReencrypt } from '../patient/encryption.util';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt, randomBytes } from 'crypto';
import * as nodemailer from 'nodemailer';
import { OAuth2Client } from 'google-auth-library';
import * as jwksRsa from 'jwks-rsa';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto } from '../dto/signup.dto';
import { LoginDto } from '../dto/login.dto';
import { SocialLoginDto } from '../dto/social-login.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { ChangeEmailDto } from '../dto/change-email.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;
  private appleJwksClient: jwksRsa.JwksClient;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {
    this.googleClient = new OAuth2Client();
    this.appleJwksClient = jwksRsa({
      jwksUri: 'https://appleid.apple.com/auth/keys',
      cache: true,
      rateLimit: true,
    });
  }

  // ─── Shared Helpers ──────────────────────────────────────────────────────

  /** Patient name columns: decrypt with legacy key fallback; re-encrypt with primary key if a legacy key matched. */
  private decryptPatientRow(row: { id: string; name: string; surname: string }) {
    return decryptPatientNamesWithOptionalReencrypt(this.prisma, row);
  }

  private async patientFullDisplayName(row: { id: string; name: string; surname: string }) {
    const o = await this.decryptPatientRow(row);
    return `${o.name} ${o.surname}`;
  }

  private normalizeDeclineReason(reason?: string) {
    const trimmed = reason?.trim();
    return trimmed ? trimmed : null;
  }

  private async createSessionToken(caregiverId: string, email: string, deviceLabel?: string | null) {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const session = await this.prisma.authSession.create({
      data: { caregiverId, tokenHash: '', expiresAt, deviceLabel: deviceLabel ?? null },
    });

    const accessToken = this.jwtService.sign({
      sub: caregiverId,
      email,
      sessionId: session.id,
    });

    const tokenHash = createHash('sha256').update(accessToken).digest('hex');
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { tokenHash },
    });

    return accessToken;
  }

  private async handleDeactivatedAccount(caregiver: { id: string; status: string; scheduledDeleteAt: Date | null }) {
    const now = new Date();
    if (caregiver.scheduledDeleteAt && caregiver.scheduledDeleteAt <= now) {
      await this.prisma.$transaction(async (tx) => {
        await tx.delegationRequest.deleteMany({ where: { fromCaregiverId: caregiver.id } });
        await tx.delegationRequest.deleteMany({ where: { toCaregiverId: caregiver.id } });
        await tx.authSession.deleteMany({ where: { caregiverId: caregiver.id } });
        await tx.passwordHistory.deleteMany({ where: { caregiverId: caregiver.id } });
        await tx.patientCaregiver.deleteMany({ where: { caregiverId: caregiver.id } });
        await tx.caregiver.delete({ where: { id: caregiver.id } });
      });
      throw new UnauthorizedException('This account has been permanently deleted.');
    }
    const daysLeft = caregiver.scheduledDeleteAt
      ? Math.ceil((caregiver.scheduledDeleteAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 10;
    return {
      accountStatus: 'DEACTIVATED' as const,
      scheduledDeleteAt: caregiver.scheduledDeleteAt,
      daysLeft,
      caregiverId: caregiver.id,
    };
  }

  private async assertNotRecentPassword(caregiverId: string, currentHash: string, newPassword: string) {
    const sameAsCurrent = await bcrypt.compare(newPassword, currentHash);
    if (sameAsCurrent) {
      throw new BadRequestException('New password must be different from your current password.');
    }

    const history = await this.prisma.passwordHistory.findMany({
      where: { caregiverId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    for (const entry of history) {
      if (await bcrypt.compare(newPassword, entry.passwordHash)) {
        throw new BadRequestException('You cannot reuse a recent password. Please choose a different one.');
      }
    }
  }

  // ─── Social / OAuth Login ────────────────────────────────────────────────

  async socialLogin(dto: SocialLoginDto) {
    const { provider, idToken, deviceLabel, fullName } = dto;

    let email: string;
    let name: string;
    let surname: string;

    if (provider === 'google') {
      const payload = await this.verifyGoogleToken(idToken);
      email = payload.email;
      name = payload.givenName || 'User';
      surname = payload.familyName || '';
    } else {
      const payload = await this.verifyAppleToken(idToken);
      email = payload.email;
      if (fullName) {
        const parts = fullName.trim().split(/\s+/);
        name = parts[0] || 'User';
        surname = parts.slice(1).join(' ') || '';
      } else {
        name = 'User';
        surname = '';
      }
    }

    let caregiver = await this.prisma.caregiver.findUnique({ where: { email } });

    if (!caregiver) {
      const placeholderHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      caregiver = await this.prisma.caregiver.create({
        data: {
          name,
          surname,
          email,
          passwordHash: placeholderHash,
        },
      });
    }

    if (caregiver.status === 'DEACTIVATED') {
      return this.handleDeactivatedAccount(caregiver);
    }

    const accessToken = await this.createSessionToken(caregiver.id, caregiver.email, deviceLabel);

    return {
      accessToken,
      caregiver: {
        id: caregiver.id,
        name: caregiver.name,
        surname: caregiver.surname,
        email: caregiver.email,
        avatarUrl: caregiver.avatarUrl,
        status: caregiver.status,
      },
    };
  }

  private async verifyGoogleToken(idToken: string): Promise<{ email: string; givenName?: string; familyName?: string }> {
    const googleClientIds = [
      process.env.GOOGLE_IOS_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
      process.env.GOOGLE_WEB_CLIENT_ID,
    ].filter(Boolean) as string[];

    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: googleClientIds,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new UnauthorizedException('Invalid Google token');
    }

    return {
      email: payload.email,
      givenName: payload.given_name,
      familyName: payload.family_name,
    };
  }

  private async verifyAppleToken(idToken: string): Promise<{ email: string }> {
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || !decoded.header.kid) {
      throw new UnauthorizedException('Invalid Apple token');
    }

    const key = await this.appleJwksClient.getSigningKey(decoded.header.kid);
    const signingKey = key.getPublicKey();

    const payload = jwt.verify(idToken, signingKey, {
      algorithms: ['RS256'],
      issuer: 'https://appleid.apple.com',
      audience: process.env.APPLE_BUNDLE_ID || '',
    }) as jwt.JwtPayload;

    if (!payload.email) {
      throw new UnauthorizedException('Apple token missing email');
    }

    return { email: payload.email as string };
  }

  async signup(signupDto: SignupDto) {
    const { name, surname, email, password, avatarUrl, deviceLabel } = signupDto;

    const existing = await this.prisma.caregiver.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already exists');

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.caregiver.create({
      data: { name, surname, email, passwordHash: hashedPassword, avatarUrl: avatarUrl ?? null },
    });

    await this.prisma.passwordHistory.create({
      data: { caregiverId: user.id, passwordHash: hashedPassword },
    });

    const accessToken = await this.createSessionToken(user.id, user.email, deviceLabel);

    return {
      message: 'User registered successfully',
      accessToken,
      caregiver: {
        id: user.id,
        name: user.name,
        surname: user.surname,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password, deviceLabel } = loginDto;

    const caregiver = await this.prisma.caregiver.findUnique({ where: { email } });
    if (!caregiver) throw new UnauthorizedException('Invalid email or password');

    const passwordValid = await bcrypt.compare(password, caregiver.passwordHash);
    if (!passwordValid) throw new UnauthorizedException('Invalid email or password');

    if (caregiver.status === 'DEACTIVATED') {
      return this.handleDeactivatedAccount(caregiver);
    }

    const accessToken = await this.createSessionToken(caregiver.id, caregiver.email, deviceLabel);

    return {
      accessToken,
      caregiver: {
        id: caregiver.id,
        name: caregiver.name,
        surname: caregiver.surname,
        email: caregiver.email,
        avatarUrl: caregiver.avatarUrl,
        status: caregiver.status,
      },
    };
  }

  async logout(sessionId: string) {
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    return { message: 'Logged out successfully' };
  }

  // ─── Profile ───────────────────────────────────────────────────────────────

  async getProfile(caregiverId: string) {
    const caregiver = await this.prisma.caregiver.findUnique({ where: { id: caregiverId } });
    if (!caregiver) throw new UnauthorizedException('Account not found');

    return {
      id: caregiver.id,
      name: caregiver.name,
      surname: caregiver.surname,
      email: caregiver.email,
      avatarUrl: caregiver.avatarUrl,
      status: caregiver.status,
    };
  }

  async updateProfile(caregiverId: string, dto: UpdateProfileDto) {
    const data: Record<string, any> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.surname !== undefined) data.surname = dto.surname;
    if ('avatarUrl' in dto) data.avatarUrl = dto.avatarUrl ?? null;

    const caregiver = await this.prisma.caregiver.update({
      where: { id: caregiverId },
      data,
    });

    return {
      id: caregiver.id,
      name: caregiver.name,
      surname: caregiver.surname,
      email: caregiver.email,
      avatarUrl: caregiver.avatarUrl,
    };
  }

  async changePassword(caregiverId: string, dto: ChangePasswordDto) {
    const caregiver = await this.prisma.caregiver.findUnique({ where: { id: caregiverId } });
    if (!caregiver) throw new UnauthorizedException('Account not found');

    const valid = await bcrypt.compare(dto.currentPassword, caregiver.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    await this.assertNotRecentPassword(caregiverId, caregiver.passwordHash, dto.newPassword);

    const newHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.caregiver.update({
      where: { id: caregiverId },
      data: { passwordHash: newHash },
    });

    await this.prisma.passwordHistory.create({
      data: { caregiverId, passwordHash: newHash },
    });

    return { message: 'Password changed successfully' };
  }

  async changeEmail(caregiverId: string, dto: ChangeEmailDto) {
    const caregiver = await this.prisma.caregiver.findUnique({ where: { id: caregiverId } });
    if (!caregiver) throw new UnauthorizedException('Account not found');

    const valid = await bcrypt.compare(dto.currentPassword, caregiver.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const existing = await this.prisma.caregiver.findUnique({ where: { email: dto.newEmail } });
    if (existing && existing.id !== caregiverId) {
      throw new ConflictException('This email is already in use');
    }

    await this.prisma.caregiver.update({
      where: { id: caregiverId },
      data: { email: dto.newEmail },
    });

    return { message: 'Email changed successfully', email: dto.newEmail };
  }

  // ─── Sessions ──────────────────────────────────────────────────────────────

  async getSessions(caregiverId: string) {
    const now = new Date();
    const sessions = await this.prisma.authSession.findMany({
      where: {
        caregiverId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map(s => ({
      id: s.id,
      deviceLabel: s.deviceLabel,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    }));
  }

  async logoutSession(sessionId: string, caregiverId: string) {
    const session = await this.prisma.authSession.findFirst({
      where: { id: sessionId, caregiverId },
    });
    if (!session) throw new NotFoundException('Session not found');

    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    return { message: 'Session revoked' };
  }

  async logoutOtherSessions(caregiverId: string, currentSessionId: string) {
    await this.prisma.authSession.updateMany({
      where: {
        caregiverId,
        id: { not: currentSessionId },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    return { message: 'All other sessions revoked' };
  }

  // ─── Delegation-based Account Deletion ────────────────────────────────────

  async requestDeletion(caregiverId: string) {
    const caregiver = await this.prisma.caregiver.findUnique({ where: { id: caregiverId } });
    if (!caregiver) throw new UnauthorizedException('Account not found');

    // Find ALL patients where this caregiver is primary
    const primaryRelations = await this.prisma.patientCaregiver.findMany({
      where: { caregiverId, isPrimary: true },
      include: {
        patient: {
          include: {
            patientCaregivers: {
              where: { caregiverId: { not: caregiverId } },
              include: { caregiver: true },
            },
          },
        },
      },
    });

    // ── Pre-flight check (Group A): block if ANY patient has 0 secondaries ──
    const patientsWithoutSecondaries = primaryRelations.filter(
      r => r.patient.patientCaregivers.length === 0,
    );

    if (patientsWithoutSecondaries.length > 0) {
      const blockedPatients = await Promise.all(
        patientsWithoutSecondaries.map(async (r) => {
          const o = await this.decryptPatientRow({
            id: r.patient.id,
            name: r.patient.name,
            surname: r.patient.surname,
          });
          return { id: r.patient.id, name: o.name, surname: o.surname };
        }),
      );
      return {
        status: 'BLOCKED',
        message: 'Some patients have no other caregivers. You must invite someone to take over or delete the patient profile first.',
        blockedPatients,
      };
    }

    // If caregiver is not primary for any patients, no delegation needed
    if (primaryRelations.length === 0) {
      return { status: 'NO_DELEGATION_NEEDED', message: 'No delegation required. You can confirm deletion.' };
    }

    // All patients have at least one secondary → proceed with delegation

    // Mark caregiver as pending deletion
    await this.prisma.caregiver.update({
      where: { id: caregiverId },
      data: { status: 'PENDING_DELETION' },
    });

    // ── CLEAN SLATE: Delete ALL old delegation requests from this caregiver ──
    await this.prisma.delegationRequest.deleteMany({
      where: { fromCaregiverId: caregiverId },
    });

    // ── For each patient: send ONE request ──
    // If only 1 secondary → auto-send to them
    // If multiple secondaries → auto-send to first one (primary can re-pick on decline)
    const patients: {
      patientId: string;
      patientName: string;
      sentTo: { id: string; name: string; surname: string } | null;
      availableSecondaries: { id: string; name: string; surname: string }[];
    }[] = [];

    for (const rel of primaryRelations) {
      const secondaries = rel.patient.patientCaregivers;
      const chosenSecondary = secondaries[0]; // auto-pick first one

      await this.prisma.delegationRequest.create({
        data: {
          patientId: rel.patientId,
          fromCaregiverId: caregiverId,
          toCaregiverId: chosenSecondary.caregiverId,
          status: 'PENDING',
        },
      });

      // No notification needed — the secondary sees the request in their inbox
      // via getIncomingDelegations()

      patients.push({
        patientId: rel.patientId,
        patientName: await this.patientFullDisplayName(rel.patient),
        sentTo: {
          id: chosenSecondary.caregiver.id,
          name: chosenSecondary.caregiver.name,
          surname: chosenSecondary.caregiver.surname,
        },
        availableSecondaries: secondaries.map(pc => ({
          id: pc.caregiver.id,
          name: pc.caregiver.name,
          surname: pc.caregiver.surname,
        })),
      });
    }

    return { status: 'PENDING', patients };
  }

  // ── Delegate a specific patient to a specific secondary (pick / re-pick) ──

  async delegatePatient(caregiverId: string, patientId: string, toCaregiverId: string) {
    // Verify the caregiver is primary for this patient
    const primaryRel = await this.prisma.patientCaregiver.findFirst({
      where: { caregiverId, patientId, isPrimary: true },
    });
    if (!primaryRel) throw new BadRequestException('You are not the primary caregiver for this patient.');

    // Verify the target is a secondary for this patient
    const secondaryRel = await this.prisma.patientCaregiver.findFirst({
      where: { caregiverId: toCaregiverId, patientId, isPrimary: false },
    });
    if (!secondaryRel) throw new BadRequestException('Target caregiver is not a member of this care team.');

    // Cancel any existing pending/declined request for this patient from this primary
    await this.prisma.delegationRequest.deleteMany({
      where: { fromCaregiverId: caregiverId, patientId, status: { in: ['PENDING', 'DECLINED'] } },
    });

    // Create new delegation request
    const request = await this.prisma.delegationRequest.create({
      data: {
        patientId,
        fromCaregiverId: caregiverId,
        toCaregiverId,
        status: 'PENDING',
      },
    });

    // No notification needed — the secondary sees the request in their inbox
    // via getIncomingDelegations()

    return { message: 'Delegation request sent.', requestId: request.id };
  }

  async getDeletionStatus(caregiverId: string) {
    // Only meaningful when caregiver is actively in the deletion flow
    const self = await this.prisma.caregiver.findUnique({
      where: { id: caregiverId },
      select: { status: true },
    });
    const primaryCount = await this.prisma.patientCaregiver.count({
      where: { caregiverId, isPrimary: true },
    });

    if (!self || self.status !== 'PENDING_DELETION') {
      return {
        isPrimaryForAnyPatient: primaryCount > 0,
        patients: [],
        allDelegationsResolved: false,
        hasSomeDeclined: false,
        pendingRequests: [],
        acceptedRequests: [],
        declinedRequests: [],
      };
    }

    // Get all delegation requests from this caregiver
    const allRequests = await this.prisma.delegationRequest.findMany({
      where: { fromCaregiverId: caregiverId },
      include: {
        patient: true,
        toCaregiver: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get all patients where this caregiver is primary (to know available secondaries)
    const primaryRelations = await this.prisma.patientCaregiver.findMany({
      where: { caregiverId, isPrimary: true },
      include: {
        patient: {
          include: {
            patientCaregivers: {
              where: { caregiverId: { not: caregiverId } },
              include: { caregiver: true },
            },
          },
        },
      },
    });

    // Build per-patient status
    const patientMap = new Map<string, {
      patientId: string;
      patientName: string;
      status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'NEEDS_SELECTION';
      currentRequest: { id: string; toCaregiver: { id: string; name: string; surname: string }; status: string; declineReason?: string | null } | null;
      availableSecondaries: { id: string; name: string; surname: string }[];
    }>();

    // Initialize from primary relations
    for (const rel of primaryRelations) {
      patientMap.set(rel.patientId, {
        patientId: rel.patientId,
        patientName: await this.patientFullDisplayName(rel.patient),
        status: 'NEEDS_SELECTION',
        currentRequest: null,
        availableSecondaries: rel.patient.patientCaregivers.map(pc => ({
          id: pc.caregiver.id,
          name: pc.caregiver.name,
          surname: pc.caregiver.surname,
        })),
      });
    }

    // Apply request statuses (most recent first due to orderBy)
    for (const req of allRequests) {
      const entry = patientMap.get(req.patientId);
      if (!entry) continue;
      if (entry.currentRequest) continue; // already have the most recent

      entry.currentRequest = {
        id: req.id,
        toCaregiver: { id: req.toCaregiver.id, name: req.toCaregiver.name, surname: req.toCaregiver.surname },
        status: req.status,
        declineReason: req.declineReason,
      };

      if (req.status === 'PENDING') entry.status = 'PENDING';
      else if (req.status === 'ACCEPTED') entry.status = 'ACCEPTED';
      else if (req.status === 'DECLINED') entry.status = 'DECLINED';
    }

    const patients = Array.from(patientMap.values());
    const allDelegationsResolved = patients.length > 0 && patients.every(p => p.status === 'ACCEPTED');
    const hasSomeDeclined = patients.some(p => p.status === 'DECLINED');

    return {
      patients,
      allDelegationsResolved,
      hasSomeDeclined,
      // Legacy compat fields (for existing UI until fully migrated)
      pendingRequests: patients.filter(p => p.status === 'PENDING').map(p => ({
        id: p.currentRequest?.id ?? '',
        patientId: p.patientId,
        toCaregiver: p.currentRequest?.toCaregiver ?? { id: '', name: '', surname: '' },
      })),
      acceptedRequests: patients.filter(p => p.status === 'ACCEPTED').map(p => ({
        id: p.currentRequest?.id ?? '',
        patientId: p.patientId,
        toCaregiver: p.currentRequest?.toCaregiver ?? { id: '', name: '', surname: '' },
      })),
      declinedRequests: patients.filter(p => p.status === 'DECLINED').map(p => ({
        id: p.currentRequest?.id ?? '',
        patientId: p.patientId,
        toCaregiver: p.currentRequest?.toCaregiver ?? { id: '', name: '', surname: '' },
        declineReason: p.currentRequest?.declineReason ?? null,
      })),
      isPrimaryForAnyPatient: primaryCount > 0,
    };
  }

  async confirmDeletion(caregiverId: string) {
    const caregiver = await this.prisma.caregiver.findUnique({ where: { id: caregiverId } });
    if (!caregiver) throw new UnauthorizedException('Account not found');

    // Apply accepted delegations: transfer primary role
    const accepted = await this.prisma.delegationRequest.findMany({
      where: { fromCaregiverId: caregiverId, status: 'ACCEPTED' },
    });

    // For each patient, promote the accepted secondary to primary
    const patientsDelegated = new Set<string>();
    for (const req of accepted) {
      if (patientsDelegated.has(req.patientId)) continue;
      await this.prisma.patientCaregiver.update({
        where: { caregiverId_patientId: { caregiverId, patientId: req.patientId } },
        data: { isPrimary: false },
      });
      await this.prisma.patientCaregiver.update({
        where: { caregiverId_patientId: { caregiverId: req.toCaregiverId, patientId: req.patientId } },
        data: { isPrimary: true },
      });
      patientsDelegated.add(req.patientId);
    }

    // Notify each recipient that the primary role was transferred to them
    if (accepted.length > 0) {
      const finalizerName = `${caregiver.name} ${caregiver.surname}`;
      const patientIds = [...patientsDelegated];
      const patients = await this.prisma.patient.findMany({
        where: { id: { in: patientIds } },
        select: { id: true, name: true, surname: true },
      });
      const delegationNotes = await Promise.all(
        accepted
          .filter(req => patientsDelegated.has(req.patientId))
          .map(async req => {
            const patient = patients.find(p => p.id === req.patientId);
            const patientName = patient
              ? await this.patientFullDisplayName(patient)
              : 'a patient';
            return {
              caregiverId: req.toCaregiverId,
              type: 'DELEGATION_COMPLETED' as any,
              title: 'Primary role transferred to you',
              body: `${finalizerName} has deleted their account and delegated the primary role for ${patientName} to you.`,
            };
          }),
      );
      await this.prisma.notification.createMany({ data: delegationNotes });
    }

    // Set status to DEACTIVATED and schedule permanent deletion in 10 days
    const scheduledDeleteAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await this.prisma.caregiver.update({
      where: { id: caregiverId },
      data: { status: 'DEACTIVATED', scheduledDeleteAt },
    });

    // Revoke all sessions immediately
    await this.prisma.authSession.updateMany({
      where: { caregiverId },
      data: { revokedAt: new Date() },
    });

    return { message: 'Account scheduled for deletion.', scheduledDeleteAt };
  }

  async cancelDeletion(caregiverId: string) {
    const canceller = await this.prisma.caregiver.findUnique({
      where: { id: caregiverId },
      select: { name: true, surname: true },
    });

    // Cancel all pending/accepted delegation requests
    const allActiveRequests = await this.prisma.delegationRequest.findMany({
      where: { fromCaregiverId: caregiverId, status: { in: ['PENDING', 'ACCEPTED'] } },
      include: { patient: { select: { id: true, name: true, surname: true } } },
    });

    await this.prisma.delegationRequest.updateMany({
      where: { fromCaregiverId: caregiverId, status: { in: ['PENDING', 'ACCEPTED'] } },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });

    // Notify ALL affected caregivers (both accepted and pending) that the handover is cancelled
    if (allActiveRequests.length > 0 && canceller) {
      // Get unique caregiver IDs to avoid duplicate notifications
      const uniqueRecipients = [...new Set(allActiveRequests.map(r => r.toCaregiverId))];
      const cancelNotes = await Promise.all(
        uniqueRecipients.map(async recipientId => {
          const req = allActiveRequests.find(r => r.toCaregiverId === recipientId)!;
          const { name: rn, surname: rs } = await this.decryptPatientRow({
            id: req.patient.id,
            name: req.patient.name,
            surname: req.patient.surname,
          });
          const bodyPatient = `${rn} ${rs}`;
          return {
            caregiverId: recipientId,
            type: 'DELEGATION_CANCELLED' as any,
            title: 'Transfer cancelled',
            body: `${canceller.name} ${canceller.surname} has cancelled their account deletion. The transfer for ${bodyPatient} will not proceed.`,
          };
        }),
      );
      await this.prisma.notification.createMany({ data: cancelNotes });
    }

    // Restore to active
    await this.prisma.caregiver.update({
      where: { id: caregiverId },
      data: { status: 'ACTIVE', scheduledDeleteAt: null },
    });

    return { message: 'Deletion cancelled. All delegation requests have been withdrawn.' };
  }

  async restoreAccount(caregiverId: string) {
    const caregiver = await this.prisma.caregiver.findUnique({ where: { id: caregiverId } });
    if (!caregiver) throw new UnauthorizedException('Account not found');
    if (caregiver.status !== 'DEACTIVATED') throw new BadRequestException('Account is not scheduled for deletion.');

    // Find patients where primary role was transferred during deletion (accepted delegation requests)
    // This is the source of truth: these are the exact patients whose primary role moved
    const acceptedDelegations = await this.prisma.delegationRequest.findMany({
      where: { fromCaregiverId: caregiverId, status: 'ACCEPTED' },
      include: {
        patient: { select: { id: true, name: true, surname: true } },
        toCaregiver: { select: { name: true, surname: true } },
      },
    });

    // Restore account — DO NOT touch PatientCaregiver roles
    await this.prisma.caregiver.update({
      where: { id: caregiverId },
      data: { status: 'ACTIVE', scheduledDeleteAt: null },
    });

    const accessToken = await this.createSessionToken(caregiverId, caregiver.email);

    const roleChangedPatients = await Promise.all(
      acceptedDelegations.map(async d => ({
        patientName: await this.patientFullDisplayName(d.patient),
        newPrimaryName: `${d.toCaregiver.name} ${d.toCaregiver.surname}`,
      })),
    );

    return {
      message: 'Account restored successfully.',
      accessToken,
      caregiver: {
        id: caregiver.id,
        name: caregiver.name,
        surname: caregiver.surname,
        email: caregiver.email,
        avatarUrl: caregiver.avatarUrl,
        status: 'ACTIVE',
      },
      roleChanged: roleChangedPatients.length > 0,
      roleChangedPatients,
    };
  }

  // ─── Role Requests (Secondary → Primary) ──────────────────────────────────

  async requestPrimaryRole(requesterId: string, patientId: string) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId: requesterId, patientId } },
    });
    if (!link) throw new NotFoundException('You are not a member of this patient\'s care team');
    if (link.isPrimary) throw new BadRequestException('You are already the primary caregiver for this patient');

    const primaryLink = await this.prisma.patientCaregiver.findFirst({
      where: { patientId, isPrimary: true },
    });
    if (!primaryLink) throw new NotFoundException('No primary caregiver found for this patient');

    const existing = await this.prisma.roleRequest.findFirst({
      where: { patientId, requesterId, status: 'PENDING' },
    });
    if (existing) throw new BadRequestException('You already have a pending request for this patient');

    const [patient, requester] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, name: true, surname: true } }),
      this.prisma.caregiver.findUnique({ where: { id: requesterId }, select: { name: true, surname: true } }),
    ]);
    if (!patient || !requester) throw new NotFoundException('Patient or requester not found');

    await this.prisma.roleRequest.create({
      data: { patientId, requesterId, currentPrimaryId: primaryLink.caregiverId },
    });

    const patientName = await this.patientFullDisplayName(patient);
    const requesterName = `${requester.name} ${requester.surname}`;

    await this.prisma.notification.create({
      data: {
        caregiverId: primaryLink.caregiverId,
        type: 'ROLE_REQUEST_RECEIVED' as any,
        title: 'Role Request',
        body: `${requesterName} would like to become the Primary caregiver for ${patientName}.`,
      },
    });

    return { message: 'Request sent successfully.' };
  }

  async getMyPendingRoleRequests(requesterId: string): Promise<string[]> {
    const requests = await this.prisma.roleRequest.findMany({
      where: { requesterId, status: 'PENDING' },
      select: { patientId: true },
    });
    return requests.map(r => r.patientId);
  }

  async getIncomingRoleRequests(caregiverId: string) {
    const requests = await this.prisma.roleRequest.findMany({
      where: { currentPrimaryId: caregiverId, status: 'PENDING' },
      include: {
        patient: { select: { id: true, name: true, surname: true } },
        requester: { select: { id: true, name: true, surname: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      requests.map(async r => {
        const { name: pn, surname: ps } = await this.decryptPatientRow(r.patient);
        return {
          id: r.id,
          patient: {
            id: r.patientId,
            name: pn,
            surname: ps,
          },
          requester: {
            id: r.requester.id,
            name: r.requester.name,
            surname: r.requester.surname,
            avatarUrl: r.requester.avatarUrl,
          },
          createdAt: r.createdAt,
        };
      }),
    );
  }

  async respondToRoleRequest(requestId: string, primaryId: string, action: 'APPROVE' | 'DECLINE', reason?: string) {
    const roleRequest = await this.prisma.roleRequest.findUnique({
      where: { id: requestId },
      include: {
        patient: { select: { id: true, name: true, surname: true } },
        requester: { select: { name: true, surname: true } },
        currentPrimary: { select: { name: true, surname: true } },
      },
    });
    if (!roleRequest) throw new NotFoundException('Role request not found');
    if (roleRequest.currentPrimaryId !== primaryId) throw new ForbiddenException('Only the current primary caregiver can respond to this request');
    if (roleRequest.status !== 'PENDING') throw new BadRequestException('This request has already been responded to');

    const patientName = await this.patientFullDisplayName(roleRequest.patient);
    const primaryName = `${roleRequest.currentPrimary.name} ${roleRequest.currentPrimary.surname}`;

    if (action === 'APPROVE') {
      await this.prisma.$transaction(async (tx) => {
        await tx.patientCaregiver.update({
          where: { caregiverId_patientId: { caregiverId: primaryId, patientId: roleRequest.patientId } },
          data: { isPrimary: false },
        });
        await tx.patientCaregiver.update({
          where: { caregiverId_patientId: { caregiverId: roleRequest.requesterId, patientId: roleRequest.patientId } },
          data: { isPrimary: true },
        });
        await tx.roleRequest.update({
          where: { id: requestId },
          data: { status: 'APPROVED', respondedAt: new Date() },
        });
        await tx.notification.create({
          data: {
            caregiverId: roleRequest.requesterId,
            type: 'ROLE_REQUEST_APPROVED' as any,
            title: 'Request approved',
            body: `${primaryName} approved your request. You are now the Primary caregiver for ${patientName}.`,
          },
        });
      });
    } else {
      const declineReason = this.normalizeDeclineReason(reason);
      const reasonSuffix = declineReason ? ` Reason: "${declineReason}"` : '';
      await this.prisma.$transaction(async (tx) => {
        await tx.roleRequest.update({
          where: { id: requestId },
          data: { status: 'DECLINED', respondedAt: new Date(), declineReason },
        });
        await tx.notification.create({
          data: {
            caregiverId: roleRequest.requesterId,
            type: 'ROLE_REQUEST_DECLINED' as any,
            title: 'Request declined',
            body: `${primaryName} declined your request for the primary role for ${patientName}.${reasonSuffix}`,
            declineReason,
          },
        });
      });
    }

    return { message: action === 'APPROVE' ? 'Request approved.' : 'Request declined.' };
  }

  async getIncomingDelegations(caregiverId: string) {
    const requests = await this.prisma.delegationRequest.findMany({
      where: { toCaregiverId: caregiverId, status: 'PENDING' },
      include: {
        patient: true,
        fromCaregiver: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      requests.map(async r => {
        const { name: pn, surname: ps } = await this.decryptPatientRow(r.patient);
        return {
          id: r.id,
          patient: {
            id: r.patient.id,
            name: pn,
            surname: ps,
          },
          fromCaregiver: {
            id: r.fromCaregiver.id,
            name: r.fromCaregiver.name,
            surname: r.fromCaregiver.surname,
            avatarUrl: r.fromCaregiver.avatarUrl,
          },
          createdAt: r.createdAt,
        };
      }),
    );
  }

  async respondToDelegation(requestId: string, caregiverId: string, action: 'ACCEPT' | 'DECLINE', reason?: string) {
    const request = await this.prisma.delegationRequest.findFirst({
      where: { id: requestId, toCaregiverId: caregiverId, status: 'PENDING' },
      include: {
        toCaregiver: { select: { name: true, surname: true } },
        fromCaregiver: { select: { status: true } },
        patient: { select: { id: true, name: true, surname: true } },
      },
    });
    if (!request) throw new NotFoundException('Delegation request not found');

    // ── D11: Race condition guard — block if primary already finalized ──
    if (request.fromCaregiver.status === 'DEACTIVATED') {
      throw new BadRequestException(
        'This handover has already been completed. The account has been deactivated.',
      );
    }

    if (action === 'ACCEPT') {
      // Decline all other pending requests for this patient (first one to accept wins)
      await this.prisma.delegationRequest.updateMany({
        where: {
          patientId: request.patientId,
          fromCaregiverId: request.fromCaregiverId,
          id: { not: requestId },
          status: 'PENDING',
        },
        data: { status: 'DECLINED', respondedAt: new Date() },
      });
    }

    const declineReason = this.normalizeDeclineReason(reason);

    await this.prisma.delegationRequest.update({
      where: { id: requestId },
      data: {
        status: action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED',
        respondedAt: new Date(),
        ...(action === 'DECLINE' ? { declineReason } : {}),
      },
    });

    // Notify the primary caregiver of the outcome
    const responderName = `${request.toCaregiver.name} ${request.toCaregiver.surname}`;
    const patientName = await this.patientFullDisplayName(request.patient);
    const reasonSuffix = declineReason ? ` Reason: "${declineReason}"` : '';

    if (action === 'ACCEPT') {
      await this.prisma.notification.create({
        data: {
          caregiverId: request.fromCaregiverId,
          type: 'DELEGATION_ACCEPTED' as any,
          title: 'Request accepted',
          body: `${responderName} accepted your handover request for ${patientName}.`,
        },
      });
    } else {
      // DECLINE — send only ONE notification (not two)
      const remainingPending = await this.prisma.delegationRequest.count({
        where: {
          patientId: request.patientId,
          fromCaregiverId: request.fromCaregiverId,
          status: { in: ['PENDING', 'ACCEPTED'] },
        },
      });

      if (remainingPending === 0) {
        // All secondaries for this patient have declined → transfer failed
        await this.prisma.notification.create({
          data: {
            caregiverId: request.fromCaregiverId,
            type: 'DELEGATION_DECLINED' as any,
            title: 'Transfer failed',
            body: `${responderName} declined the handover for ${patientName}. No other caregivers are pending. Please pick another or cancel.${reasonSuffix}`,
            declineReason,
          },
        });
      } else {
        // Some are still pending → simple decline notification
        await this.prisma.notification.create({
          data: {
            caregiverId: request.fromCaregiverId,
            type: 'DELEGATION_DECLINED' as any,
            title: 'Request declined',
            body: `${responderName} declined your handover request for ${patientName}.${reasonSuffix}`,
            declineReason,
          },
        });
      }
    }

    return { message: action === 'ACCEPT' ? 'You will become primary caregiver once the deletion is confirmed.' : 'Request declined.' };
  }

  // ── B6: Resend delegation request (ghosting scenario) ──────────────────────

  async resendDelegation(requestId: string, caregiverId: string) {
    const request = await this.prisma.delegationRequest.findFirst({
      where: { id: requestId, fromCaregiverId: caregiverId, status: 'PENDING' },
    });
    if (!request) throw new NotFoundException('Delegation request not found or already resolved');

    // Bump the createdAt timestamp so it reappears at the top of the secondary's inbox
    await this.prisma.delegationRequest.update({
      where: { id: requestId },
      data: { createdAt: new Date() },
    });

    return { message: 'Delegation request resent.' };
  }

  // ─── Delete Account ────────────────────────────────────────────────────────

  async deleteAccount(caregiverId: string) {
    // Find all patients where this caregiver is primary
    const primaryRelations = await this.prisma.patientCaregiver.findMany({
      where: { caregiverId, isPrimary: true },
      include: {
        patient: {
          include: {
            patientCaregivers: {
              where: { isPrimary: false },
              include: { caregiver: true },
            },
          },
        },
      },
    });

    const blockList = primaryRelations.filter(rel => rel.patient.patientCaregivers.length > 0);
    const patientsNeedingDelegation = await Promise.all(
      blockList.map(async rel => ({
        patientId: rel.patient.id,
        patientName: await this.patientFullDisplayName(rel.patient),
        secondaryCaregivers: rel.patient.patientCaregivers.map(pc => ({
          id: pc.caregiver.id,
          name: pc.caregiver.name,
          surname: pc.caregiver.surname,
        })),
      })),
    );

    if (patientsNeedingDelegation.length > 0) {
      throw new ConflictException({
        message: 'You must delegate primary caregiver role before deleting your account.',
        patientsNeedingDelegation,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const primaryPatientIds = primaryRelations.map(rel => rel.patient.id);

      if (primaryPatientIds.length > 0) {
        await tx.patientCaregiver.deleteMany({ where: { patientId: { in: primaryPatientIds } } });
        await tx.patient.deleteMany({ where: { id: { in: primaryPatientIds } } });
      }

      await tx.patientCaregiver.deleteMany({ where: { caregiverId } });
      await tx.authSession.deleteMany({ where: { caregiverId } });
      await tx.caregiver.delete({ where: { id: caregiverId } });
    });

    return { message: 'Account deleted successfully' };
  }

  // ─── Notifications ─────────────────────────────────────────────────────────

  async getNotifications(caregiverId: string) {
    return this.prisma.notification.findMany({
      where: { caregiverId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteNotification(id: string, caregiverId: string) {
    const notif = await this.prisma.notification.findFirst({
      where: { id, caregiverId },
    });
    if (!notif) throw new NotFoundException('Notification not found');
    await this.prisma.notification.delete({ where: { id } });
    return { message: 'Notification deleted' };
  }

  async markAllNotificationsRead(caregiverId: string) {
    await this.prisma.notification.updateMany({
      where: { caregiverId, readAt: null },
      data: { readAt: new Date() },
    });
    return { message: 'Marked as read' };
  }

  // ─── Forgot / Reset Password ──────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto) {
    const caregiver = await this.prisma.caregiver.findUnique({ where: { email: dto.email } });

    // Always return success to prevent email enumeration
    if (!caregiver) {
      return { message: 'If an account with that email exists, a reset code has been sent.' };
    }

    // Invalidate any previous unused reset requests for this caregiver
    await this.prisma.passwordResetRequest.updateMany({
      where: { caregiverId: caregiver.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Generate a 6-digit code
    const resetCode = String(randomInt(100000, 999999));
    const resetToken = createHash('sha256').update(resetCode).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.prisma.passwordResetRequest.create({
      data: {
        caregiverId: caregiver.id,
        resetToken,
        expiresAt,
      },
    });

    // Send email (or fall back to console)
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (smtpHost && smtpUser && smtpPass) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(smtpPort) || 587,
        secure: Number(smtpPort) === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: `"MemoryLane" <${smtpUser}>`,
        to: caregiver.email,
        subject: 'Your MemoryLane Password Reset Code',
        text: `Your password reset code is: ${resetCode}\n\nThis code expires in 15 minutes. If you did not request this, please ignore this email.`,
        html: `<p>Your password reset code is:</p><h2 style="letter-spacing:4px;font-family:monospace">${resetCode}</h2><p>This code expires in 15 minutes.</p><p>If you did not request this, please ignore this email.</p>`,
      });
    } else if (process.env.NODE_ENV !== 'production') {
      console.log(`[FORGOT-PASSWORD] Reset code for ${caregiver.email}: ${resetCode}`);
    }

    return { message: 'If an account with that email exists, a reset code has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const caregiver = await this.prisma.caregiver.findUnique({ where: { email: dto.email } });
    if (!caregiver) throw new BadRequestException('Invalid or expired reset code.');

    const tokenHash = createHash('sha256').update(dto.resetCode).digest('hex');

    const resetRequest = await this.prisma.passwordResetRequest.findFirst({
      where: {
        caregiverId: caregiver.id,
        resetToken: tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!resetRequest) throw new BadRequestException('Invalid or expired reset code.');

    await this.assertNotRecentPassword(caregiver.id, caregiver.passwordHash, dto.newPassword);

    const newHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.caregiver.update({
      where: { id: caregiver.id },
      data: { passwordHash: newHash },
    });

    await this.prisma.passwordHistory.create({
      data: { caregiverId: caregiver.id, passwordHash: newHash },
    });

    // Mark the reset request as used
    await this.prisma.passwordResetRequest.update({
      where: { id: resetRequest.id },
      data: { usedAt: new Date() },
    });

    // Revoke all existing sessions (force re-login)
    await this.prisma.authSession.updateMany({
      where: { caregiverId: caregiver.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'Password has been reset successfully. Please log in with your new password.' };
  }
}
