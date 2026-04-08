import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { decrypt } from '../patient/encryption.util';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto } from '../dto/signup.dto';
import { LoginDto } from '../dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) { }

  async signup(signupDto: SignupDto) {
    const { name, surname, email, password } = signupDto;

    const existing = await this.prisma.caregiver.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already exists');

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.caregiver.create({
      data: { name, surname, email, passwordHash: hashedPassword },
    });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const session = await this.prisma.authSession.create({
      data: {
        caregiverId: user.id,
        tokenHash: '',
        expiresAt,
      },
    });

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      sessionId: session.id,
    });

    const tokenHash = createHash('sha256').update(accessToken).digest('hex');
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { tokenHash },
    });

    return {
      message: 'User registered successfully',
      accessToken,
      caregiver: {
        id: user.id,
        name: user.name,
        surname: user.surname,
        email: user.email,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const caregiver = await this.prisma.caregiver.findUnique({ where: { email } });
    if (!caregiver) throw new UnauthorizedException('Invalid email or password');

    const passwordValid = await bcrypt.compare(password, caregiver.passwordHash);
    if (!passwordValid) throw new UnauthorizedException('Invalid email or password');

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day

    const session = await this.prisma.authSession.create({
      data: {
        caregiverId: caregiver.id,
        tokenHash: '', // placeholder, updated after signing
        expiresAt,
      },
    });

    const accessToken = this.jwtService.sign({
      sub: caregiver.id,
      email: caregiver.email,
      sessionId: session.id,
    });

    const tokenHash = createHash('sha256').update(accessToken).digest('hex');
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { tokenHash },
    });

    return {
      accessToken,
      caregiver: {
        id: caregiver.id,
        name: caregiver.name,
        surname: caregiver.surname,
        email: caregiver.email,
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

    // If any primary patient still has secondary caregivers, block deletion
    const patientsNeedingDelegation = primaryRelations
      .filter(rel => rel.patient.patientCaregivers.length > 0)
      .map(rel => ({
        patientId: rel.patient.id,
        patientName: `${decrypt(rel.patient.name)} ${decrypt(rel.patient.surname)}`,
        secondaryCaregivers: rel.patient.patientCaregivers.map(pc => ({
          id: pc.caregiver.id,
          name: pc.caregiver.name,
          surname: pc.caregiver.surname,
        })),
      }));

    if (patientsNeedingDelegation.length > 0) {
      throw new ConflictException({
        message: 'You must delegate primary caregiver role before deleting your account.',
        patientsNeedingDelegation,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const primaryPatientIds = primaryRelations.map(rel => rel.patient.id);

      if (primaryPatientIds.length > 0) {
        // Remove all caregiver links for those patients, then delete patients
        await tx.patientCaregiver.deleteMany({ where: { patientId: { in: primaryPatientIds } } });
        await tx.patient.deleteMany({ where: { id: { in: primaryPatientIds } } });
      }

      // Remove any secondary caregiver links for this caregiver
      await tx.patientCaregiver.deleteMany({ where: { caregiverId } });

      // Remove sessions
      await tx.authSession.deleteMany({ where: { caregiverId } });

      // Delete the caregiver account
      await tx.caregiver.delete({ where: { id: caregiverId } });
    });

    return { message: 'Account deleted successfully' };
  }
}