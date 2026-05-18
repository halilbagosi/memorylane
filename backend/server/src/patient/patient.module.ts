import { Module } from '@nestjs/common';
import { PatientService } from './patient.service';
import { PatientController } from './patient.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { ManagementService } from './management/management.service';
import { AiDifficultyService } from './ai-difficulty.service';
@Module({
    controllers: [PatientController],
    providers: [PatientService, DashboardService, ManagementService, AiDifficultyService],
})
export class PatientModule { }
