import {
  ConflictException,
  ForbiddenException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { KeyWrapService } from './crypto/key-wrap.service';
import { MediaCryptoService } from './crypto/media-crypto.service';
import { SignedUrlService } from './crypto/signed-url.service';
import { FaceVerificationService } from './face-verification.service';
import { MediaService } from './media.service';
import { STORAGE_SERVICE, StorageService } from './storage/storage.interface';

const makePrisma = () => ({
  patientCaregiver: {
    findUnique: jest.fn(),
  },
  media: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
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
  let faceVerification: Pick<
    FaceVerificationService,
    | 'validateAndProcessQuizPhoto'
    | 'validateQuizPhoto'
    | 'checkForDuplicateFace'
    | 'findDuplicateFaceExternalImageIds'
    | 'indexFaceInCollection'
    | 'removeFaceFromCollection'
  >;

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
    faceVerification = {
      validateAndProcessQuizPhoto: jest.fn(async (buffer: Buffer) => ({
        buffer,
        contentType: 'original',
        byteSize: buffer.length,
        cropped: false,
      })),
      validateQuizPhoto: jest.fn(async () => ({ accepted: true })),
      checkForDuplicateFace: jest.fn(async () => false),
      findDuplicateFaceExternalImageIds: jest.fn(async () => []),
      indexFaceInCollection: jest.fn(async () => 'aws-face-1'),
      removeFaceFromCollection: jest.fn(async () => undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: prisma },
        { provide: KeyWrapService, useValue: keyWrap },
        { provide: MediaCryptoService, useValue: mediaCrypto },
        { provide: SignedUrlService, useValue: signedUrls },
        { provide: FaceVerificationService, useValue: faceVerification },
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
      prisma.media.findFirst.mockResolvedValueOnce(null);
      prisma.media.create.mockResolvedValueOnce({
        publicId: 'public-abc',
        kind: 'PHOTO',
        status: 'PENDING_UPLOAD',
      });

      const result = await service.createUploadIntent(
        caregiverId,
        {
          patientId,
          kind: 'PHOTO' as any,
          contentType: 'image/jpeg',
          byteSize: 4096,
          collection: 'MEMORY' as any,
          note: 'A family memory',
          contentHash: 'a'.repeat(64),
        },
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
      expect(args.data.contentHash).toBe('a'.repeat(64));

      expect(result.publicId).toBe('public-abc');
      expect(result.uploadMethod).toBe('PUT');
      expect(result.uploadUrl).toContain('/media/storage/upload/');
      expect(result.expiresAt).toBeTruthy();
    });

    it('rejects a duplicate photo hash before issuing an upload URL', async () => {
      prisma.patientCaregiver.findUnique.mockResolvedValueOnce({ caregiverId });
      prisma.media.findFirst.mockResolvedValueOnce({ id: 'existing-media' });

      await expect(
        service.createUploadIntent(
          caregiverId,
          {
            patientId,
            kind: 'PHOTO' as any,
            contentType: 'image/jpeg',
            byteSize: 4096,
            collection: 'MEMORY' as any,
            note: 'A family memory',
            contentHash: 'b'.repeat(64),
          },
          'http://localhost:3000',
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.media.create).not.toHaveBeenCalled();
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
      expect(item.caregiverId).toBeNull();
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
          collection: 'MEMORY' as any,
          note: 'A family memory',
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

    it('rejects a duplicate photo hash during the signed upload', async () => {
      prisma.patientCaregiver.findUnique.mockResolvedValueOnce({ caregiverId: 'cg-1' });
      const fakeRow: any = {};
      prisma.media.create.mockImplementationOnce(async ({ data }: any) => {
        Object.assign(fakeRow, data, {
          id: 'internal-duplicate',
          publicId: 'dup-pub-1',
          kind: data.kind,
          status: data.status,
        });
        return { publicId: 'dup-pub-1', kind: data.kind, status: data.status };
      });

      const plaintext = Buffer.from('duplicate-photo');
      const intent = await service.createUploadIntent(
        'cg-1',
        {
          patientId: '00000000-0000-0000-0000-000000000001',
          kind: 'PHOTO' as any,
          contentType: 'image/jpeg',
          byteSize: plaintext.length,
          collection: 'MEMORY' as any,
          note: 'A family memory',
        },
        'http://localhost:3000',
      );

      prisma.media.findUnique.mockResolvedValueOnce(fakeRow);
      prisma.media.findFirst.mockResolvedValueOnce({ id: 'already-ready' });
      prisma.media.update.mockImplementation(async ({ data }: any) => {
        Object.assign(fakeRow, data);
        return fakeRow;
      });

      const token = decodeURIComponent(intent.uploadUrl.split('/').pop() as string);
      await expect(service.storeUploadedPayload(token, plaintext)).rejects.toThrow(ConflictException);
      expect(fakeRow.status).toBe('FAILED');
      expect(storage.putObject).not.toHaveBeenCalled();
    });

    it('accepts quiz photos with birth year metadata and verifies before storage', async () => {
      prisma.patientCaregiver.findUnique.mockResolvedValueOnce({ caregiverId: 'cg-1' });
      prisma.media.findMany.mockResolvedValueOnce([]);
      const fakeRow: any = {};
      prisma.media.create.mockImplementationOnce(async ({ data }: any) => {
        Object.assign(fakeRow, data, {
          id: 'internal-quiz-1',
          publicId: 'quiz-pub-1',
          kind: data.kind,
          status: data.status,
        });
        return { publicId: 'quiz-pub-1', kind: data.kind, status: data.status };
      });

      const plaintext = Buffer.from('fake-jpeg-payload');
      const intent = await service.createUploadIntent(
        'cg-1',
        {
          patientId: '00000000-0000-0000-0000-000000000001',
          kind: 'PHOTO' as any,
          contentType: 'image/jpeg',
          byteSize: plaintext.length,
          collection: 'QUIZ' as any,
          firstName: 'Bela',
          relationshipType: 'Friend',
          birthYear: 2004,
        },
        'http://localhost:3000',
      );

      prisma.media.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.publicId === 'quiz-pub-1') return fakeRow;
        return null;
      });
      prisma.media.update.mockImplementation(async ({ data }: any) => {
        Object.assign(fakeRow, data);
        return fakeRow;
      });

      let storedCiphertext: Buffer | null = null;
      storage.putObject.mockImplementation(async (_key, body) => {
        storedCiphertext = body;
      });

      const token = decodeURIComponent(intent.uploadUrl.split('/').pop() as string);
      await service.storeUploadedPayload(token, plaintext);

      expect(faceVerification.validateAndProcessQuizPhoto).toHaveBeenCalledWith(plaintext);
      expect(faceVerification.findDuplicateFaceExternalImageIds).not.toHaveBeenCalled();
      expect(faceVerification.indexFaceInCollection).toHaveBeenCalled();
      expect(fakeRow.awsFaceId).toBe('aws-face-1');
      expect(fakeRow.birthYear).toBe(2004);
      expect(storedCiphertext).not.toBeNull();
      expect(fakeRow.payloadTag).toBeTruthy();
    });
  });

  describe('verifyQuizPhoto', () => {
    it('allows a quiz photo that matches an indexed face when face duplicate blocking is disabled', async () => {
      prisma.patientCaregiver.findUnique.mockResolvedValueOnce({ caregiverId: 'cg-1' });
      prisma.media.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'ready-match' });
      (faceVerification.findDuplicateFaceExternalImageIds as jest.Mock).mockResolvedValueOnce(['quiz-pub-1']);

      const result = await service.verifyQuizPhoto(
        'cg-1',
        '00000000-0000-0000-0000-000000000001',
        Buffer.from('used-before'),
      );

      expect(result).toEqual({ accepted: true });
      expect(faceVerification.findDuplicateFaceExternalImageIds).not.toHaveBeenCalled();
    });

    it('rejects a quiz photo that already matches an indexed face when face duplicate blocking is enabled', async () => {
      process.env.QUIZ_BLOCK_DUPLICATE_FACES = 'true';
      prisma.patientCaregiver.findUnique.mockResolvedValueOnce({ caregiverId: 'cg-1' });
      prisma.media.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'ready-match' });
      (faceVerification.findDuplicateFaceExternalImageIds as jest.Mock).mockResolvedValueOnce(['quiz-pub-1']);

      const result = await service.verifyQuizPhoto(
        'cg-1',
        '00000000-0000-0000-0000-000000000001',
        Buffer.from('used-before'),
      );

      expect(result).toEqual({
        accepted: false,
        code: 'DUPLICATE_PHOTO',
        message: 'This person already has a quiz photo.',
      });
      delete process.env.QUIZ_BLOCK_DUPLICATE_FACES;
    });

    it('rejects a quiz photo whose exact content hash was already uploaded', async () => {
      prisma.patientCaregiver.findUnique.mockResolvedValueOnce({ caregiverId: 'cg-1' });
      prisma.media.findFirst.mockResolvedValueOnce({ id: 'existing-photo' });

      const result = await service.verifyQuizPhoto(
        'cg-1',
        '00000000-0000-0000-0000-000000000001',
        Buffer.from('same-photo'),
      );

      expect(result).toEqual({
        accepted: false,
        code: 'DUPLICATE_PHOTO',
        message: 'This quiz photo has already been used.',
      });
      expect(faceVerification.findDuplicateFaceExternalImageIds).not.toHaveBeenCalled();
    });
  });
});
