import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

type SimulatedPaymentDto = {
  cardNumber: string;
  expiry: string;
  cvc: string;
  cardholderName?: string;
  billingCountry?: string;
  postalCode?: string;
};

const TEST_CARDS: Record<string, { status: 'succeeded' | 'declined'; reason?: string }> = {
  '4242424242424242': { status: 'succeeded' },
  '4000000000000002': { status: 'declined', reason: 'Your card was declined.' },
  '4000000000009995': { status: 'declined', reason: 'Your card has insufficient funds.' },
  '4000002500003155': { status: 'declined', reason: 'Authentication is required for this card.' },
};

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  getConfig() {
    return {
      mode: 'card',
      provider: 'MemoryLane Pay',
      amountCents: Number(process.env.SANDBOX_PREMIUM_AMOUNT_CENTS ?? 999),
      currency: (process.env.SANDBOX_PREMIUM_CURRENCY ?? 'eur').toLowerCase(),
      supportedCards: {
        success: '4242 4242 4242 4242',
        declined: '4000 0000 0000 0002',
        insufficientFunds: '4000 0000 0000 9995',
        authenticationRequired: '4000 0025 0000 3155',
      },
    };
  }

  async simulatePremiumPayment(caregiverId: string, dto: SimulatedPaymentDto) {
    const caregiver = await this.prisma.caregiver.findUnique({
      where: { id: caregiverId },
      select: { isSubscribed: true },
    });

    if (!caregiver) {
      throw new BadRequestException('Caregiver account not found');
    }

    if (caregiver.isSubscribed) {
      return { alreadySubscribed: true };
    }

    const cardNumber = this.normalizeCardNumber(dto.cardNumber);
    const card = TEST_CARDS[cardNumber];

    if (!card) {
      throw new BadRequestException('This card number could not be processed.');
    }

    this.assertValidExpiry(dto.expiry);
    this.assertValidCvc(dto.cvc);
    this.assertValidBillingDetails(dto.billingCountry, dto.postalCode);

    if (card.status === 'declined') {
      throw new BadRequestException(card.reason ?? 'The payment was declined.');
    }

    const updatedCaregiver = await this.prisma.caregiver.update({
      where: { id: caregiverId },
      data: { isSubscribed: true },
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        avatarUrl: true,
        status: true,
        isSubscribed: true,
        insightNotificationsEnabled: true,
      },
    });

    return {
      message: 'Premium activated',
      transactionId: `sandbox_${randomUUID()}`,
      caregiver: updatedCaregiver,
    };
  }

  async cancelPremium(caregiverId: string) {
    const caregiver = await this.prisma.caregiver.update({
      where: { id: caregiverId },
      data: { isSubscribed: false },
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        avatarUrl: true,
        status: true,
        isSubscribed: true,
        insightNotificationsEnabled: true,
      },
    });

    return { message: 'Premium cancelled', caregiver };
  }

  private normalizeCardNumber(cardNumber: string) {
    return (cardNumber ?? '').replace(/\D/g, '');
  }

  private assertValidExpiry(expiry: string) {
    const match = (expiry ?? '').trim().match(/^(\d{2})\s*\/\s*(\d{2})$/);
    if (!match) {
      throw new BadRequestException('Expiry must use MM/YY format.');
    }

    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    if (month < 1 || month > 12) {
      throw new BadRequestException('Expiry month is invalid.');
    }

    const now = new Date();
    const expiryEnd = new Date(year, month, 0, 23, 59, 59, 999);
    if (expiryEnd < now) {
      throw new BadRequestException('Card is expired.');
    }
  }

  private assertValidCvc(cvc: string) {
    if (!/^\d{3,4}$/.test((cvc ?? '').trim())) {
      throw new BadRequestException('CVC must be 3 or 4 digits.');
    }
  }

  private assertValidBillingDetails(billingCountry?: string, postalCode?: string) {
    const country = billingCountry?.trim();
    if (country !== undefined && country.length === 0) {
      throw new BadRequestException('Billing country is required when provided.');
    }

    const postal = postalCode?.trim();
    if (postal !== undefined && postal.length > 16) {
      throw new BadRequestException('Postal code is too long.');
    }
  }
}
