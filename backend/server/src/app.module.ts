import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PatientModule } from './patient/patient.module';
import { MediaModule } from './media/media.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PatientModule,
    MediaModule,
  ],
})
export class AppModule {}