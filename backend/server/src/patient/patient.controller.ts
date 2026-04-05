import { Controller, Post, Get, Delete, Body, UseGuards, Req, Param } from '@nestjs/common';
import { PatientService } from './patient.service';
import { DashboardService } from './dashboard/dashboard.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { JoinPatientDto } from './dto/join-patient.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ManagementService } from './management/management.service';

@Controller('patients')
export class PatientController {
  constructor(
    private readonly patientService: PatientService,
    private readonly dashboardService: DashboardService,
    private readonly managementService: ManagementService,
  ) {}

  @Post('join')
  async joinWithCode(@Body() joinPatientDto: JoinPatientDto) {
    return this.patientService.joinWithCode(joinPatientDto.joinCode);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() createPatientDto: CreatePatientDto, @Req() req: any) {
    const caregiverId = req.user.userId;
    return this.patientService.create(createPatientDto, caregiverId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-list')
  async findAll(@Req() req: any) {
    const caregiverId = req.user.userId;
    return this.dashboardService.getCaregiverOverview(caregiverId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') patientId: string, @Req() req: any) {
    return this.managementService.deletePatient(patientId, req.user.userId);
  }
}