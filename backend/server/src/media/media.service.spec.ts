import {
  ForbiddenException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { KeyWrapService } from './crypto/key-wrap.service';
import { MediaCryptoService } from './crypto/media-crypto.service';
import { SignedUrlService } from './crypto/signed-url.service';
import { MediaService } from './media.service';
import { STORAGE_SERVICE, StorageService } from './storage/storage.interface';

const makePrisma = () => ({
  patientCaregiver: {
    findUnique: jest.fn(),
  },
  media: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});

const makeStorage = (): jest.Mocked<StorageService> => ({
  putObject: jest.fn().mockResolvedValue(undefined),
  getObject: jest.fn().mockResolvedValue(Buffer.alloc(0)),
  deleteObject: jest.fn().mockResolvedValue(undefined),
  headObject: jest.fn().mockResolvedValue({ exists: true, size: 0 }),
});

describe('MediaService', () => {
  let service: MediaService;
  let prisma: ReturnType<typeof makePrisma>;
  let storage: jest.Mocked<StorageService>;
  let keyWrap: KeyWrapService;
  let mediaCrypto: MediaCryptoService;
  let signedUrls: SignedUrlService;

  beforeEach(async () => {
    process.env.MEDIA_MASTER_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.MEDIA_SIGNED_URL_SECRET = 'unit-test-secret';

    keyWrap = new KeyWrapService();
    keyWrap.onModuleInit();
    mediaCrypto = new MediaCryptoService();
    signedUrls = new SignedUrlService();
    signedUrls.onModuleInit();

    prisma = makePrisma();
    storage = makeStorage();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: prisma },
        { provide: KeyWrapService, useValue: keyWrap },
        { provide: MediaCryptoService, useValue: mediaCrypto },
        { provide: SignedUrlService, useValue: signedUrls },
        { provide: STORAGE_SERVICE, useValue: storage },
      ],
    }).compile();

    service = module.get(MediaService);
  });

  describe('createUploadIntent', () => {
    const patientId = '00000000-0000-0000-0000-000000000001';
    const caregiverId = 'caregiver-1';

    it('rejects an unrelated caregiver', async () => {
      prisma.patientCaregiver.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createUploadIntent(
          caregiverId,
          { patientId, kind: 'PHOTO' as any, contentType: 'image/jpeg', byteSize: 1024 },
          'http://localhost:3000',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.media.create).not.toHaveBeenCalled();
    });

    it('rejects an unsupported MIME type', async () => {
      prisma.patientCaregiver.findUnique.mockResolvedValueOnce({ caregiverId });
      await expect(
        service.createUploadIntent(
          caregiverId,
          {
            patientId,
            kind: 'PHOTO' as any,
            contentType: 'application/x-shockwave-flash',
            byteSize: 1024,
          },
          'http://localhost:3000',
        ),
      ).rejects.toThrow(UnsupportedMediaTypeException);
    });

    it('rejects an oversized declared payload', async () => {
      prisma.patientCaregiver.findUnique.mockResolvedValueOnce({ caregiverId });
      await expect(
        service.createUploadIntent(
          caregiverId,
          {
            patientId,
            kind: 'PHOTO' as any,
            contentType: 'image/jpeg',
            byteSize: 99 * 1024 * 1024,
          },
          'http://localhost:3000',
        ),
      ).rejects.toThrow(PayloadTooLargeException);
    });

    it('persists encrypted metadata and issues a signed PUT URL on success', async () => {
      prisma.patientCaregiver.findUnique.mockResolvedValueOnce({ caregiverId });
      prisma.media.create.mockResolvedValueOnce({
        publicId: 'public-abc',
        kind: 'PHOTO',
        status: 'PENDING_UPLOAD',
      });

      const result = await service.createUploadIntent(
        caregiverId,
        { patientId, kind: 'PHOTO' as any, contentType: 'image/jpeg', byteSize: 4096 },
        'http://localhost:3000',
      );

      expect(prisma.media.create).toHaveBeenCalledTimes(1);
      const args = prisma.media.create.mock.calls[0][0];
      expect(args.data.patientId).toBe(patientId);
      expect(args.data.caregiverId).toBe(caregiverId);
      expect(args.data.status).toBe('PENDING_UPLOAD');
      expect(args.data.wrappedDek).toBeTruthy();
      expect(args.data.dekIv).toBeTruthy();
      expect(args.data.dekTag).toBeTruthy();
      expect(args.data.payloadIv).toBeTruthy();
      expect(args.data.algorithm).toBe('AES-256-GCM');

      expect(result.publicId).toBe('public-abc');
      expect(result.uploadMethod).toBe('PUT');
      expect(result.uploadUrl).toContain('/media/storage/upload/');
      expect(result.expiresAt).toBeTruthy();
    });
  });

  describe('listForPatient', () => {
    it('refuses to list media when caregiver is not on the care team', async () => {
      prisma.patientCaregiver.findUnique.mockResolvedValueOnce(null);
      await expect(service.listForPatient('cg-1', 'patient-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.media.findMany).not.toHaveBeenCalled();
    });

    it('returns sanitized fields only', async () => {
      prisma.patientCaregiver.findUnique.mockResolvedValueOnce({ caregiverId: 'cg-1' });
      prisma.media.findMany.mockResolvedValueOnce([
        {
          publicId: 'pub-1',
          kind: 'PHOTO',
          status: 'READY',
          contentType: 'image/jpeg',
          byteSize: 1234,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]);
      const list = await service.listForPatient('cg-1', 'patient-1');
      expect(list).toHaveLength(1);
      const item = list[0];
      expect(item.publicId).toBe('pub-1');
      expect(item.kind).toBe('PHOTO');
      expect(item.status).toBe('READY');
      expect((item as any).patientId).toBeUndefined();
      expect((item as any).caregiverId).toBeUndefined();
      expect((item as any).storageKey).toBeUndefined();
      expect((item as any).wrappedDek).toBeUndefined();
    });
  });

  describe('storeUploadedPayload + readDecryptedPayload', () => {
    it('encrypts the payload at rest and decrypts it back through the access flow', async () => {
      // 1) Issue an intent
      prisma.patientCaregiver.findUnique.mockResolvedValueOnce({ caregiverId: 'cg-1' });
      const fakeRow: any = {};
      prisma.media.create.mockImplementationOnce(async ({ data }: any) => {
        Object.assign(fakeRow, data, {
          id: 'internal-1',
          publicId: 'pub-1',
          kind: data.kind,
          status: data.status,
        });
        return { publicId: 'pub-1', kind: data.kind, status: data.status };
      });

      const intent = await service.createUploadIntent(
        'cg-1',
        {
          patientId: '00000000-0000-0000-0000-000000000001',
          kind: 'PHOTO' as any,
          contentType: 'image/jpeg',
          byteSize: 16,
        },
        'http://localhost:3000',
      );

      const token = decodeURIComponent(intent.uploadUrl.split('/').pop() as string);
      const plaintext = Buffer.from('hello-memorylane!');
      // service expects byteSize to match exactly
      fakeRow.byteSize = plaintext.length;

      prisma.media.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.publicId === 'pub-1') return fakeRow;
        return null;
      });
      prisma.media.update.mockImplementation(async ({ data }: any) => {
        Object.assign(fakeRow, data);
        return fakeRow;
      });

      // Path: PUT signed URL handler
      let storedCiphertext: Buffer | null = null;
      storage.putObject.mockImplementation(async (_key, body) => {
        storedCiphertext = body;
      });
      await service.storeUploadedPayload(token, plaintext);
      expect(storedCiphertext).not.toBeNull();
      expect(storedCiphertext!.equals(plaintext)).toBe(false);
      expect(fakeRow.payloadTag).toBeTruthy();

      // Caregiver completes
      fakeRow.status = 'PENDING_UPLOAD';
      storage.headObject.mockResolvedValueOnce({ exists: true, size: storedCiphertext!.length });
      prisma.patientCaregiver.findUnique.mockResolvedValueOnce({ caregiverId: 'cg-1' });
      prisma.media.update.mockImplementationOnce(async ({ data }: any) => {
        Object.assign(fakeRow, data);
        return { publicId: fakeRow.publicId, status: fakeRow.status };
      });
      const completed = await service.completeUpload('cg-1', 'pub-1');
      expect(completed.status).toBe('READY');

      // Path: GET signed URL handler returns plaintext
      storage.getObject.mockResolvedValueOnce(storedCiphertext!);
      const { token: getToken } = signedUrls.issue('pub-1', 'get', 60);
      const out = await service.readDecryptedPayload(getToken);
      expect(out.contentType).toBe('image/jpeg');
      expect(out.body.equals(plaintext)).toBe(true);
    });
  });
});
