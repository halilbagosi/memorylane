import { Injectable, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async signup(body: any) {
    const { name, surname, email, password } = body;

    if (!email || !password || !name || !surname) {
      throw new BadRequestException('Missing fields');
    }

    const existing = await this.prisma.caregiver.findUnique({
      where: { email },
    });

    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.caregiver.create({
      data: {
        name,
        surname,
        email,
        passwordHash: hashedPassword,
      },
    });

    return {
      message: 'User created successfully',
      user,
    };
  }
}