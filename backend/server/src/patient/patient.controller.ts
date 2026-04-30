import { Controller, Post, Get, Delete, Patch, Body, UseGuards, Req, Param } from '@nestjs/common';
import { PatientService } from './patient.service';
import { DashboardService } from './dashboard/dashboard.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
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
  @Post('join-as-caregiver')
  async joinAsCaregiver(@Body() joinPatientDto: JoinPatientDto, @Req() req: any) {
    return this.patientService.joinAsCaregiver(joinPatientDto.joinCode, req.user.userId);
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

  @Get(':id/paired-status')
  async getPairedStatus(@Param('id') patientId: string) {
    return this.patientService.getPairedStatus(patientId);
  }

  @Get(':id/greeting-spark')
  async getGreetingSpark(@Param('id') patientId: string) {
    return this.patientService.getGreetingSpark(patientId);
  }

  @Get(':id/welcome-card')
  async getWelcomeCard(@Param('id') patientId: string) {
    return this.patientService.getWelcomeCard(patientId);
  }

  @Patch(':id/biometric-recovery')
  async setBiometricRecovery(@Param('id') patientId: string, @Body() body: { enabled: boolean }) {
    return this.patientService.setBiometricRecovery(patientId, body.enabled === true);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/unpair')
  async unpairDevice(@Param('id') patientId: string, @Req() req: any) {
    return this.patientService.unpairDevice(patientId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/caregivers')
  async getCaregivers(@Param('id') patientId: string, @Req() req: any) {
    return this.patientService.getCaregivers(patientId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/leave')
  async leaveCareTeam(@Param('id') patientId: string, @Req() req: any) {
    return this.patientService.leaveCareTeam(patientId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/delegate-primary')
  async delegatePrimary(@Param('id') patientId: string, @Body() body: { targetCaregiverId: string }, @Req() req: any) {
    return this.managementService.delegatePrimaryRole(patientId, req.user.userId, body.targetCaregiverId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@Param('id') patientId: string, @Body() updatePatientDto: UpdatePatientDto, @Req() req: any) {
    return this.patientService.updatePatient(patientId, req.user.userId, updatePatientDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/caregivers/:caregiverId')
  async removeCaregiver(@Param('id') patientId: string, @Param('caregiverId') caregiverId: string, @Req() req: any) {
    return this.patientService.removeCaregiver(patientId, req.user.userId, caregiverId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') patientId: string, @Req() req: any) {
    return this.managementService.deletePatient(patientId, req.user.userId);
  }
}
