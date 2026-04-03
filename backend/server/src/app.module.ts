import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PatientModule } from './patient/patient.module'; // 1. Make sure this is imported

@Module({
  imports: [
    PrismaModule, 
    AuthModule, 
    PatientModule // 2. Make sure this is in the imports list
  ],
})
export class AppModule {}