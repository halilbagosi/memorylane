import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { KeyWrapService } from './crypto/key-wrap.service';
import { MediaCryptoService } from './crypto/media-crypto.service';
import { SignedUrlService } from './crypto/signed-url.service';
import { CreateUploadIntentDto } from './dto/create-upload-intent.dto';
import { UpdateMediaMetadataDto } from './dto/update-media-metadata.dto';
import { FaceVerificationService } from './face-verification.service';
import {
  ALLOWED_MIME_BY_KIND,
  getMaxBytes,
  getSignedUrlTtlSeconds,
  MediaKindValue,
} from './media.constants';
import { STORAGE_SERVICE, StorageService } from './storage/storage.interface';

export interface UploadIntentResponse {
  publicId: string;
  kind: MediaKindValue;
  status: 'PENDING_UPLOAD';
  uploadUrl: string;
  uploadMethod: 'PUT';
  uploadHeaders: Record<string, string>;
  expiresAt: string;
  maxByteSize: number;
}

export interface AccessUrlResponse {
  publicId: string;
  url: string;
  expiresAt: string;
}

export interface MediaListItem {
  publicId: string;
  kind: MediaKindValue;
  status: 'PENDING_UPLOAD' | 'READY' | 'FAILED';
  contentType: string;
  byteSize: number;
  createdAt: string;
  caregiverId: string | null;
  caregiverName: string | null;
  collection: 'MEMORY' | 'QUIZ';
  firstName: string | null;
  lastName: string | null;
  relationshipType: string | null;
  birthYear: number | null;
  decoyNames: string[];
  note: string | null;
  eventYear: number | null;
  isApproximateYear: boolean;
  memoryCategory: string | null;
}

export interface TimelineItem {
  publicId: string;
  kind: MediaKindValue;
  contentType: string;
  note: string | null;
  eventYear: number | null;
  isApproximateYear: boolean;
  memoryCategory: string | null;
  createdAt: string;
  downloadUrl: string;
  downloadExpiresAt: string;
}

type MediaMetadataFields = {
  collection?: 'MEMORY' | 'QUIZ';
  firstName?: string | null;
  lastName?: string | null;
  relationshipType?: string | null;
  birthYear?: number | null;
  decoyNames?: string[] | null;
  note?: string | null;
  eventYear?: number | null;
  isApproximateYear?: boolean | null;
  memoryCategory?: string | null;
};

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keyWrap: KeyWrapService,
    private readonly mediaCrypto: MediaCryptoService,
    private readonly signedUrls: SignedUrlService,
    private readonly faceVerification: FaceVerificationService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /** Caregiver requests permission to upload a new media file. */
  async createUploadIntent(
    caregiverId: string,
    dto: CreateUploadIntentDto,
    apiBaseUrl: string,
  ): Promise<UploadIntentResponse> {
    const kind = dto.kind as MediaKindValue;

    const allowed = ALLOWED_MIME_BY_KIND[kind];
    const normalizedMime = dto.contentType.trim().toLowerCase();
    if (!allowed.includes(normalizedMime)) {
      throw new UnsupportedMediaTypeException(
        `Content-Type ${dto.contentType} is not permitted for ${kind}`,
      );
    }

    const maxBytes = getMaxBytes(kind);
    if (dto.byteSize > maxBytes) {
      throw new PayloadTooLargeException(
        `Declared byteSize ${dto.byteSize} exceeds maximum ${maxBytes}`,
      );
    }

    await this.assertCaregiverAccess(caregiverId, dto.patientId);
    if (kind === 'PHOTO' && dto.contentHash) {
      await this.assertUniqueContentHash(dto.patientId, dto.contentHash);
    }
    const metadata = this.normalizeMetadata(dto);
    if (metadata.collection === 'QUIZ' && kind === 'PHOTO') {
      await this.assertUniqueQuizPhotoName(dto.patientId, metadata.firstName);
    }

    const dek = this.keyWrap.generateDek();
    const wrapped = this.keyWrap.wrapDek(dek);
    const payloadIv = this.mediaCrypto.generatePayloadIv();
    const storageKey = this.generateStorageKey();

    const created = await this.prisma.media.create({
      data: {
        patientId: dto.patientId,
        caregiverId,
        kind,
        status: 'PENDING_UPLOAD',
        ...metadata,
        storageKey,
        contentType: normalizedMime,
        byteSize: dto.byteSize,
        contentHash: dto.contentHash ?? null,
        wrappedDek: wrapped.wrappedDek,
        dekIv: wrapped.dekIv,
        dekTag: wrapped.dekTag,
        payloadIv: payloadIv.toString('base64'),
        algorithm: wrapped.algorithm,
        keyVersion: wrapped.keyVersion,
      },
      select: {
        publicId: true,
        kind: true,
        status: true,
      },
    });

    const ttl = getSignedUrlTtlSeconds();
    const { token, expiresAt } = this.signedUrls.issue(created.publicId, 'put', ttl);

    return {
      publicId: created.publicId,
      kind: created.kind as MediaKindValue,
      status: 'PENDING_UPLOAD',
      uploadUrl: this.buildSignedUrl(apiBaseUrl, 'upload', token),
      uploadMethod: 'PUT',
      uploadHeaders: { 'Content-Type': 'application/octet-stream' },
      expiresAt: expiresAt.toISOString(),
      maxByteSize: maxBytes,
    };
  }

  /** Receives the raw, plaintext payload from the signed PUT URL,
   *  encrypts it, and persists the ciphertext + GCM tag. */
  async storeUploadedPayload(token: string, body: Buffer): Promise<void> {
    const claims = this.signedUrls.verify(token, 'put');
    const media = await this.prisma.media.findUnique({
      where: { publicId: claims.pid },
    });
    if (!media) throw new NotFoundException('Media not found');
    if (media.status !== 'PENDING_UPLOAD') {
      throw new BadRequestException('Media is not awaiting upload');
    }

    const maxBytes = getMaxBytes(media.kind as MediaKindValue);
    if (!body || body.length === 0) {
      throw new BadRequestException('Empty upload body');
    }
    if (body.length > maxBytes) {
      throw new PayloadTooLargeException('Uploaded payload exceeds limit');
    }
    if (body.length !== media.byteSize) {
      throw new BadRequestException('Uploaded byte size does not match intent');
    }

    const uploadedContentHash =
      media.kind === 'PHOTO' ? createHash('sha256').update(body).digest('hex') : null;
    if (uploadedContentHash) {
      await this.assertUniqueContentHash(media.patientId, uploadedContentHash, media.id).catch(async (error) => {
        await this.prisma.media.update({
          where: { id: media.id },
          data: { status: 'FAILED' },
        });
        throw error;
      });
    }

    let payload = body;
    let contentType = media.contentType;
    let byteSize = media.byteSize;
    let awsFaceId: string | undefined;
    if (media.collection === 'QUIZ' && media.kind === 'PHOTO') {
      const processed = await this.faceVerification.validateAndProcessQuizPhoto(body).catch(async (error) => {
        await this.prisma.media.update({
          where: { id: media.id },
          data: { status: 'FAILED' },
        });
        throw error;
      });
      payload = processed.buffer;
      contentType = processed.contentType === 'original' ? media.contentType : processed.contentType;
      byteSize = processed.byteSize;

      const isDuplicate = await this.faceVerification.checkForDuplicateFace(media.patientId, payload);
      if (isDuplicate) {
        await this.prisma.media.update({ where: { id: media.id }, data: { status: 'FAILED' } });
        throw new ConflictException('This person has already been added to the quiz.');
      }

      awsFaceId = await this.faceVerification.indexFaceInCollection(media.patientId, media.publicId, payload);
    }

    const dek = this.keyWrap.unwrapDek({
      wrappedDek: media.wrappedDek,
      dekIv: media.dekIv,
      dekTag: media.dekTag,
    });
    const iv = Buffer.from(media.payloadIv, 'base64');
    const { ciphertext, tag } = this.mediaCrypto.encryptPayload(payload, dek, iv);
    dek.fill(0);

    await this.storage.putObject(media.storageKey, ciphertext);
    await this.prisma.media.update({
      where: { id: media.id },
      data: {
        payloadTag: tag.toString('base64'),
        contentType,
        byteSize,
        ...(uploadedContentHash && !media.contentHash ? { contentHash: uploadedContentHash } : {}),
        ...(awsFaceId ? { awsFaceId } : {}),
      },
    });
  }

  /** Caregiver confirms the upload finished and asks the server to verify
   *  the stored object before flipping the media to READY. */
  async completeUpload(caregiverId: string, publicId: string) {
    const media = await this.requireCaregiverMedia(caregiverId, publicId);
    if (media.status === 'READY') {
      return { publicId: media.publicId, status: media.status };
    }
    if (media.status !== 'PENDING_UPLOAD' || !media.payloadTag) {
      throw new BadRequestException('Upload has not been received yet');
    }
    const head = await this.storage.headObject(media.storageKey);
    if (!head.exists) {
      throw new BadRequestException('Stored object not found');
    }
    const updated = await this.prisma.media.update({
      where: { id: media.id },
      data: { status: 'READY' },
      select: { publicId: true, status: true },
    });
    return { publicId: updated.publicId, status: updated.status };
  }

  /** Lists media for a patient that the requesting caregiver belongs to. */
  async listForPatient(caregiverId: string, patientId: string): Promise<MediaListItem[]> {
    await this.assertCaregiverAccess(caregiverId, patientId);
    const rows = await this.prisma.media.findMany({
      where: { patientId, status: { in: ['READY', 'PENDING_UPLOAD'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        publicId: true,
        kind: true,
        status: true,
        contentType: true,
        byteSize: true,
        createdAt: true,
        caregiverId: true,
        caregiver: { select: { name: true } },
        collection: true,
        firstName: true,
        lastName: true,
        relationshipType: true,
        birthYear: true,
        decoyNames: true,
        note: true,
        eventYear: true,
        isApproximateYear: true,
        memoryCategory: true,
      },
    });
    return rows.map((r) => ({
      publicId: r.publicId,
      kind: r.kind as MediaKindValue,
      status: r.status as MediaListItem['status'],
      contentType: r.contentType,
      byteSize: r.byteSize,
      createdAt: r.createdAt.toISOString(),
      caregiverId: r.caregiverId ?? null,
      caregiverName: r.caregiver?.name ?? null,
      collection: r.collection as 'MEMORY' | 'QUIZ',
      firstName: r.firstName ?? null,
      lastName: r.lastName ?? null,
      relationshipType: r.relationshipType ?? null,
      birthYear: r.birthYear ?? null,
      decoyNames: r.decoyNames ?? [],
      note: r.note ?? null,
      eventYear: r.eventYear ?? null,
      isApproximateYear: r.isApproximateYear,
      memoryCategory: r.memoryCategory ?? null,
    }));
  }

  /** Issues a short-lived signed download URL for a READY media item. */
  async issueAccessUrl(
    caregiverId: string,
    publicId: string,
    apiBaseUrl: string,
  ): Promise<AccessUrlResponse> {
    const media = await this.requireCaregiverMedia(caregiverId, publicId);
    if (media.status !== 'READY') {
      throw new BadRequestException('Media is not ready');
    }
    const ttl = getSignedUrlTtlSeconds();
    const { token, expiresAt } = this.signedUrls.issue(media.publicId, 'get', ttl);
    return {
      publicId: media.publicId,
      url: this.buildSignedUrl(apiBaseUrl, 'download', token),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Verifies the GET token, decrypts the payload, returns plaintext + content-type. */
  async readDecryptedPayload(token: string): Promise<{ contentType: string; body: Buffer }> {
    const claims = this.signedUrls.verify(token, 'get');
    const media = await this.prisma.media.findUnique({
      where: { publicId: claims.pid },
    });
    if (!media) throw new NotFoundException('Media not found');
    if (media.status !== 'READY' || !media.payloadTag) {
      throw new BadRequestException('Media is not ready');
    }

    const ciphertext = await this.storage.getObject(media.storageKey);
    const dek = this.keyWrap.unwrapDek({
      wrappedDek: media.wrappedDek,
      dekIv: media.dekIv,
      dekTag: media.dekTag,
    });
    try {
      const iv = Buffer.from(media.payloadIv, 'base64');
      const tag = Buffer.from(media.payloadTag, 'base64');
      const plaintext = this.mediaCrypto.decryptPayload(ciphertext, dek, iv, tag);
      return { contentType: media.contentType, body: plaintext };
    } finally {
      dek.fill(0);
    }
  }

  /** Caregiver removes a media item. Primary caregivers can delete any item;
   *  secondaries can only delete their own uploads. */
  async deleteMedia(caregiverId: string, publicId: string) {
    const media = await this.requireCaregiverMedia(caregiverId, publicId);

    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId: media.patientId } },
      select: { isPrimary: true },
    });
    const isPrimary = link?.isPrimary ?? false;

    if (!isPrimary && media.caregiverId !== caregiverId) {
      throw new ForbiddenException('Only the primary caregiver or the uploader can delete this memory');
    }

    await this.storage.deleteObject(media.storageKey).catch(() => undefined);
    if (media.awsFaceId && media.collection === 'QUIZ') {
      await this.faceVerification.removeFaceFromCollection(media.patientId, media.awsFaceId).catch(() => undefined);
    }
    await this.prisma.media.delete({ where: { id: media.id } });
    return { publicId, deleted: true };
  }

  /** Returns READY MEMORY items for a patient, sorted chronologically.
   *  Each item includes a short-lived signed download URL so the patient
   *  device can render photos/videos without a caregiver JWT. */
  async getPatientTimeline(patientId: string, apiBaseUrl: string): Promise<TimelineItem[]> {
    const rows = await this.prisma.media.findMany({
      where: { patientId, collection: 'MEMORY', status: 'READY' },
      orderBy: [{ eventYear: 'asc' }, { createdAt: 'asc' }],
      select: {
        publicId: true,
        kind: true,
        contentType: true,
        note: true,
        eventYear: true,
        isApproximateYear: true,
        memoryCategory: true,
        createdAt: true,
      },
    });

    const ttl = getSignedUrlTtlSeconds();
    return rows.map((r) => {
      const { token, expiresAt } = this.signedUrls.issue(r.publicId, 'get', ttl);
      return {
        publicId: r.publicId,
        kind: r.kind as MediaKindValue,
        contentType: r.contentType,
        note: r.note ?? null,
        eventYear: r.eventYear ?? null,
        isApproximateYear: r.isApproximateYear,
        memoryCategory: r.memoryCategory ?? null,
        createdAt: r.createdAt.toISOString(),
        downloadUrl: this.buildSignedUrl(apiBaseUrl, 'download', token),
        downloadExpiresAt: expiresAt.toISOString(),
      };
    });
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  async updateMetadata(caregiverId: string, publicId: string, dto: UpdateMediaMetadataDto) {
    const media = await this.requireCaregiverMedia(caregiverId, publicId);
    const metadata = this.normalizeMetadata({ ...media, ...dto });
    if (metadata.collection === 'QUIZ' && media.kind === 'PHOTO') {
      await this.assertUniqueQuizPhotoName(media.patientId, metadata.firstName, media.id);
    }
    return this.prisma.media.update({
      where: { id: media.id },
      data: metadata,
      select: {
        publicId: true,
        collection: true,
        firstName: true,
        lastName: true,
        relationshipType: true,
        birthYear: true,
        decoyNames: true,
        note: true,
        eventYear: true,
        isApproximateYear: true,
        memoryCategory: true,
      },
    });
  }

  async verifyQuizPhoto(caregiverId: string, patientId: string, body: Buffer) {
    if (!patientId) throw new BadRequestException('patientId is required');
    await this.assertCaregiverAccess(caregiverId, patientId);
    const result = await this.faceVerification.validateQuizPhoto(body);
    if (!result.accepted) return result;

    const contentHash = createHash('sha256').update(body).digest('hex');
    const existingExactPhoto = await this.prisma.media.findFirst({
      where: {
        patientId,
        collection: 'QUIZ',
        kind: 'PHOTO',
        contentHash,
        status: { in: ['READY', 'PENDING_UPLOAD'] },
      },
      select: { id: true },
    });
    if (existingExactPhoto) {
      return {
        accepted: false,
        code: 'DUPLICATE_PHOTO',
        message: 'This quiz photo has already been used.',
      };
    }

    const isDuplicateFace = await this.faceVerification.checkForDuplicateFace(patientId, body);
    if (isDuplicateFace) {
      return {
        accepted: false,
        code: 'DUPLICATE_PHOTO',
        message: 'This person already has a quiz photo.',
      };
    }

    return result;
  }

  private normalizeMetadata(dto: Partial<MediaMetadataFields>) {
    const collection = dto.collection ?? 'MEMORY';
    const trimOrNull = (value?: string | null) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    };

    if (collection === 'QUIZ') {
      const firstName = trimOrNull(dto.firstName);
      const lastName = trimOrNull(dto.lastName);
      const relationshipType = trimOrNull(dto.relationshipType);
      const birthYear = dto.birthYear ?? null;
      const decoyNames = (dto.decoyNames ?? []).map((name) => name.trim()).filter(Boolean);
      if (!firstName || !relationshipType || birthYear === null) {
        throw new BadRequestException(
          'Quiz media requires a person name, relationship, and birth year',
        );
      }
      const currentYear = new Date().getFullYear();
      if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > currentYear) {
        throw new BadRequestException(`Quiz media birth year must be between 1900 and ${currentYear}`);
      }
      return {
        collection,
        firstName,
        lastName,
        relationshipType,
        birthYear,
        decoyNames,
        note: null,
        eventYear: null,
        isApproximateYear: false,
        memoryCategory: null,
      };
    }

    const note = trimOrNull(dto.note);
    if (!note) {
      throw new BadRequestException('Memory media requires a descriptive note');
    }

    return {
      collection: 'MEMORY' as const,
      firstName: null,
      lastName: null,
      relationshipType: null,
      birthYear: null,
      decoyNames: [],
      note,
      eventYear: dto.eventYear ?? null,
      isApproximateYear: dto.isApproximateYear === true,
      memoryCategory: trimOrNull(dto.memoryCategory),
    };
  }

  private async assertCaregiverAccess(caregiverId: string, patientId: string): Promise<void> {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { caregiverId_patientId: { caregiverId, patientId } },
      select: { caregiverId: true },
    });
    if (!link) {
      throw new ForbiddenException('You do not have access to this patient');
    }
  }

  private async requireCaregiverMedia(caregiverId: string, publicId: string) {
    if (typeof publicId !== 'string' || publicId.length === 0) {
      throw new BadRequestException('Invalid media id');
    }
    const media = await this.prisma.media.findUnique({
      where: { publicId },
    });
    if (!media) throw new NotFoundException('Media not found');
    await this.assertCaregiverAccess(caregiverId, media.patientId);
    return media;
  }

  private generateStorageKey(): string {
    const a = randomBytes(1).toString('hex');
    const b = randomBytes(1).toString('hex');
    const rest = randomBytes(30).toString('hex');
    return `${a}/${b}/${rest}`;
  }

  private async assertUniqueQuizPhotoName(
    patientId: string,
    firstName: string | null,
    excludeMediaId?: string,
  ): Promise<void> {
    const normalized = this.normalizePersonName(firstName);
    if (!normalized) return;

    const existing = await this.prisma.media.findMany({
      where: {
        patientId,
        collection: 'QUIZ',
        kind: 'PHOTO',
        status: { in: ['READY', 'PENDING_UPLOAD'] },
        ...(excludeMediaId ? { id: { not: excludeMediaId } } : {}),
      },
      select: { firstName: true },
    });

    const duplicate = existing.some(
      (media) => this.normalizePersonName(media.firstName) === normalized,
    );
    if (duplicate) {
      throw new BadRequestException(
        `A quiz photo for ${firstName} already exists. Please edit the existing quiz photo instead.`,
      );
    }
  }

  private async assertUniqueContentHash(
    patientId: string,
    contentHash: string,
    excludeMediaId?: string,
  ): Promise<void> {
    const existing = await this.prisma.media.findFirst({
      where: {
        patientId,
        contentHash,
        status: { in: ['READY', 'PENDING_UPLOAD'] },
        ...(excludeMediaId ? { id: { not: excludeMediaId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('This photo has already been added.');
    }
  }

  private normalizePersonName(value?: string | null): string | null {
    const normalized = value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    return normalized || null;
  }

  private buildSignedUrl(apiBaseUrl: string, action: 'upload' | 'download', token: string): string {
    const base = apiBaseUrl.replace(/\/+$/, '');
    return `${base}/media/storage/${action}/${encodeURIComponent(token)}`;
  }
}
