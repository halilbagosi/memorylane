import { Controller, Post, Get, Delete, Body, UseGuards, Req, Param } from '@nestjs/common';
import { PatientService } from './patient.service';
import { DashboardService } from './dashboard/dashboard.service'; // 1. ADD THIS IMPORT
import { CreatePatientDto } from './dto/create-patient.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ManagementService } from './management/management.service';

@Controller('patients')
@UseGuards(JwtAuthGuard)
export class PatientController {
  constructor(
    private readonly patientService: PatientService,
    private readonly dashboardService: DashboardService,
    private readonly managementService: ManagementService,
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

   @Delete(':id')
  async remove(@Param('id') patientId: string, @Req() req: any) {
    // Takes the ID from the URL and the User ID from the Token
    return this.managementService.deletePatient(patientId, req.user.userId);
  }
}