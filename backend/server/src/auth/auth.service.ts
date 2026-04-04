import { Injectable, ConflictException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
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

    const { passwordHash, ...result } = user;
    return { message: 'User registered successfully', user: result };
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
}