import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from '../dto/signup.dto';
import { LoginDto } from '../dto/login.dto';
import { SocialLoginDto } from '../dto/social-login.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { ChangeEmailDto } from '../dto/change-email.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @Post('signup')
  signup(@Body() signupDto: SignupDto) {
    return this.authService.signup(signupDto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('social-login')
  socialLogin(@Body() dto: SocialLoginDto) {
    return this.authService.socialLogin(dto);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Request() req: any) {
    return this.authService.logout(req.user.sessionId);
  }

  // ─── Profile ───────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Request() req: any) {
    return this.authService.getProfile(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('change-password')
  changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('change-email')
  changeEmail(@Request() req: any, @Body() dto: ChangeEmailDto) {
    return this.authService.changeEmail(req.user.userId, dto);
  }

  // ─── Sessions ──────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  getSessions(@Request() req: any) {
    return this.authService.getSessions(req.user.userId);
  }

  // NOTE: 'others' must be before ':id' to avoid route conflict
  @UseGuards(JwtAuthGuard)
  @Delete('sessions/others')
  logoutOtherSessions(@Request() req: any) {
    return this.authService.logoutOtherSessions(req.user.userId, req.user.sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  logoutSession(@Request() req: any, @Param('id') id: string) {
    return this.authService.logoutSession(id, req.user.userId);
  }

  // ─── Account Deletion ──────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('request-deletion')
  requestDeletion(@Request() req: any) {
    return this.authService.requestDeletion(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('confirm-deletion')
  confirmDeletion(@Request() req: any) {
    return this.authService.confirmDeletion(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('cancel-deletion')
  cancelDeletion(@Request() req: any) {
    return this.authService.cancelDeletion(req.user.userId);
  }

  @Post('restore-account')
  restoreAccount(@Body() body: { caregiverId: string }) {
    return this.authService.restoreAccount(body.caregiverId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('account')
  deleteAccount(@Request() req: any) {
    return this.authService.deleteAccount(req.user.userId);
  }

  // ─── Delegation Requests ───────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('delegation-requests/incoming')
  getIncomingDelegations(@Request() req: any) {
    return this.authService.getIncomingDelegations(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('delegation-requests/:id/accept')
  acceptDelegation(@Request() req: any, @Param('id') id: string) {
    return this.authService.respondToDelegation(id, req.user.userId, 'ACCEPT');
  }

  @UseGuards(JwtAuthGuard)
  @Post('delegation-requests/:id/decline')
  declineDelegation(@Request() req: any, @Param('id') id: string) {
    return this.authService.respondToDelegation(id, req.user.userId, 'DECLINE');
  }

  @UseGuards(JwtAuthGuard)
  @Post('delegation-requests/:id/resend')
  resendDelegation(@Request() req: any, @Param('id') id: string) {
    return this.authService.resendDelegation(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('delegate-patient')
  delegatePatient(@Request() req: any, @Body() body: { patientId: string; toCaregiverId: string }) {
    return this.authService.delegatePatient(req.user.userId, body.patientId, body.toCaregiverId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('deletion-status')
  getDeletionStatus(@Request() req: any) {
    return this.authService.getDeletionStatus(req.user.userId);
  }

  // ─── Role Requests ─────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('role-requests')
  requestPrimaryRole(@Request() req: any, @Body() body: { patientId: string }) {
    return this.authService.requestPrimaryRole(req.user.userId, body.patientId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('role-requests/incoming')
  getIncomingRoleRequests(@Request() req: any) {
    return this.authService.getIncomingRoleRequests(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('role-requests/pending-by-me')
  getMyPendingRoleRequests(@Request() req: any) {
    return this.authService.getMyPendingRoleRequests(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('role-requests/:id/approve')
  approveRoleRequest(@Request() req: any, @Param('id') id: string) {
    return this.authService.respondToRoleRequest(id, req.user.userId, 'APPROVE');
  }

  @UseGuards(JwtAuthGuard)
  @Post('role-requests/:id/decline')
  declineRoleRequest(@Request() req: any, @Param('id') id: string) {
    return this.authService.respondToRoleRequest(id, req.user.userId, 'DECLINE');
  }

  // ─── Notifications ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('notifications')
  getNotifications(@Request() req: any) {
    return this.authService.getNotifications(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('notifications/:id')
  deleteNotification(@Request() req: any, @Param('id') id: string) {
    return this.authService.deleteNotification(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('notifications/mark-all-read')
  markAllNotificationsRead(@Request() req: any) {
    return this.authService.markAllNotificationsRead(req.user.userId);
  }
}
