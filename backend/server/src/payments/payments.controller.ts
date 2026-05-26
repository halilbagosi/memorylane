import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Get('config')
  getConfig() {
    return this.paymentsService.getConfig();
  }

  @UseGuards(JwtAuthGuard)
  @Post('premium/simulate')
  simulatePremiumPayment(
    @Request() req: any,
    @Body() body: {
      cardNumber: string;
      expiry: string;
      cvc: string;
      cardholderName?: string;
      billingCountry?: string;
      postalCode?: string;
    },
  ) {
    return this.paymentsService.simulatePremiumPayment(req.user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('premium/cancel')
  cancelPremium(@Request() req: any) {
    return this.paymentsService.cancelPremium(req.user.userId);
  }
}
