import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PatientModule } from './patient/patient.module';
import { MediaModule } from './media/media.module';
import { PushModule } from './push/push.module';
import { InsightsModule } from './insights/insights.module';
import { PaymentsModule } from './payments/payments.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    PushModule,
    AuthModule,
    PatientModule,
    MediaModule,
    InsightsModule,
    PaymentsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
