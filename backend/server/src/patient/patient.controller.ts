import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { PatientService } from './patient.service';
import { DashboardService } from './dashboard/dashboard.service'; // 1. ADD THIS IMPORT
import { CreatePatientDto } from './dto/create-patient.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('patients')
@UseGuards(JwtAuthGuard)
export class PatientController {
  constructor(
    private readonly patientService: PatientService,
    private readonly dashboardService: DashboardService,
  ) {}

  @Post()
  async create(@Body() createPatientDto: CreatePatientDto, @Req() req: any) {
    const caregiverId = req.user.userId;
    return this.patientService.create(createPatientDto, caregiverId);
  }

  @Get('my-list')
  async findAll(@Req() req: any) {
    const caregiverId = req.user.userId;
    return this.dashboardService.getCaregiverOverview(caregiverId);
  }
}