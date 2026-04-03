import { Module } from '@nestjs/common';
import { PatientService } from './patient.service';
import { PatientController } from './patient.controller';
import { DashboardService } from './dashboard/dashboard.service';

@Module({
    controllers: [PatientController],
    providers: [PatientService, DashboardService],
})
export class PatientModule { }