import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  email: string;
  sessionId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'super-secret-key-2026',
    });
  }

  async validate(payload: JwtPayload) {

    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sessionId },
    });


    if (!session) {
      throw new UnauthorizedException('Session not found');
    }

    if (session.revokedAt) {
      throw new UnauthorizedException('This session has been logged out');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      sessionId: payload.sessionId,
    };
  }
}