import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ManagementService } from './management.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockTx = {
  patientCaregiver: {
    findFirst: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn(),
  },
  patient: {
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  notification: { createMany: jest.fn() },
  delegationRequest: { updateMany: jest.fn() },
};

const mockPrisma = {
  $transaction: jest.fn((fn: (tx: typeof mockTx) => Promise<any>) => fn(mockTx)),
  patientCaregiver: {
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  patient: { findUnique: jest.fn() },
  caregiver: { findUnique: jest.fn() },
  delegationRequest: { findMany: jest.fn().mockResolvedValue([]) },
};

describe('ManagementService', () => {
  let service: ManagementService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManagementService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ManagementService>(ManagementService);
  });

  describe('delegatePrimaryRole', () => {
    it('should throw ForbiddenException when caller is not the primary', async () => {
      mockTx.patientCaregiver.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.delegatePrimaryRole('patient-1', 'cg-1', 'cg-2'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when target is not a secondary', async () => {
      mockTx.patientCaregiver.findFirst
        .mockResolvedValueOnce({ isPrimary: true })
        .mockResolvedValueOnce(null);

      await expect(
        service.delegatePrimaryRole('patient-1', 'cg-1', 'cg-2'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should swap primary/secondary roles on success', async () => {
      mockTx.patientCaregiver.findFirst
        .mockResolvedValueOnce({ isPrimary: true })
        .mockResolvedValueOnce({ isPrimary: false });
      mockTx.patientCaregiver.update.mockResolvedValue({});

      const result = await service.delegatePrimaryRole('patient-1', 'cg-1', 'cg-2');

      expect(mockTx.patientCaregiver.update).toHaveBeenCalledTimes(2);
      expect(result.message).toContain('successfully delegated');
    });
  });

  describe('deletePatient', () => {
    it('should throw NotFoundException when no relationship exists', async () => {
      mockPrisma.patientCaregiver.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.deletePatient('patient-1', 'cg-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when caller is not the primary', async () => {
      mockPrisma.patientCaregiver.findFirst.mockResolvedValueOnce({ isPrimary: false });

      await expect(
        service.deletePatient('patient-1', 'cg-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
