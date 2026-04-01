import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto } from '../dto/signup.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async signup(signupDto: SignupDto) {
    const { name, surname, email, password, isPrimary, inviteCode } = signupDto;

    const existing = await this.prisma.caregiver.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already exists');

    const hashedPassword = await bcrypt.hash(password, 10);

    let myOwnJoinCode: string | null = null;
    if (isPrimary) {
      myOwnJoinCode = randomBytes(3).toString('hex').toUpperCase();
    } else {
      if (!inviteCode) throw new BadRequestException('Invite code required for secondary caregivers');
      const primaryOwner = await this.prisma.caregiver.findUnique({ where: { joinCode: inviteCode } });
      if (!primaryOwner) throw new BadRequestException('Invalid invite code');
    }

    const user = await this.prisma.caregiver.create({
      data: { name, surname, email, passwordHash: hashedPassword, joinCode: myOwnJoinCode },
    });

    const { passwordHash, ...result } = user;
    return { message: 'User registered successfully', user: result };
  }
}