import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PatientModule } from './patient/patient.module';
import { MediaModule } from './media/media.module';
import { PushModule } from './push/push.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    PushModule,
    AuthModule,
    PatientModule,
    MediaModule,
  ],
})
export class AppModule {}