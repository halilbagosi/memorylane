import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { KeyWrapService } from './crypto/key-wrap.service';
import { MediaCryptoService } from './crypto/media-crypto.service';
import { SignedUrlService } from './crypto/signed-url.service';
import { CreateUploadIntentDto } from './dto/create-upload-intent.dto';
import { UpdateMediaMetadataDto } from './dto/update-media-metadata.dto';
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
  collection: 'MEMORY' | 'QUIZ';
  firstName: string | null;
  lastName: string | null;
  relationshipType: string | null;
  decoyNames: string[];
  note: string | null;
  eventYear: number | null;
  memoryCategory: string | null;
}

type MediaMetadataFields = {
  collection?: 'MEMORY' | 'QUIZ';
  firstName?: string | null;
  lastName?: string | null;
  relationshipType?: string | null;
  decoyNames?: string[] | null;
  note?: string | null;
  eventYear?: number | null;
  memoryCategory?: string | null;
};

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keyWrap: KeyWrapService,
    private readonly mediaCrypto: MediaCryptoService,
    private readonly signedUrls: SignedUrlService,
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
    const metadata = this.normalizeMetadata(dto);

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

    const dek = this.keyWrap.unwrapDek({
      wrappedDek: media.wrappedDek,
      dekIv: media.dekIv,
      dekTag: media.dekTag,
    });
    const iv = Buffer.from(media.payloadIv, 'base64');
    const { ciphertext, tag } = this.mediaCrypto.encryptPayload(body, dek, iv);
    dek.fill(0);

    await this.storage.putObject(media.storageKey, ciphertext);
    await this.prisma.media.update({
      where: { id: media.id },
      data: { payloadTag: tag.toString('base64') },
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
        collection: true,
        firstName: true,
        lastName: true,
        relationshipType: true,
        decoyNames: true,
        note: true,
        eventYear: true,
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
      collection: r.collection as 'MEMORY' | 'QUIZ',
      firstName: r.firstName ?? null,
      lastName: r.lastName ?? null,
      relationshipType: r.relationshipType ?? null,
      decoyNames: r.decoyNames ?? [],
      note: r.note ?? null,
      eventYear: r.eventYear ?? null,
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
    await this.prisma.media.delete({ where: { id: media.id } });
    return { publicId, deleted: true };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  async updateMetadata(caregiverId: string, publicId: string, dto: UpdateMediaMetadataDto) {
    const media = await this.requireCaregiverMedia(caregiverId, publicId);
    const metadata = this.normalizeMetadata({ ...media, ...dto });
    return this.prisma.media.update({
      where: { id: media.id },
      data: metadata,
      select: {
        publicId: true,
        collection: true,
        firstName: true,
        lastName: true,
        relationshipType: true,
        decoyNames: true,
        note: true,
        eventYear: true,
        memoryCategory: true,
      },
    });
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
      const decoyNames = (dto.decoyNames ?? []).map((name) => name.trim()).filter(Boolean);
      if (!firstName || !relationshipType) {
        throw new BadRequestException(
          'Quiz media requires a person name and relationship',
        );
      }
      return {
        collection,
        firstName,
        lastName,
        relationshipType,
        decoyNames,
        note: null,
        eventYear: null,
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
      decoyNames: [],
      note,
      eventYear: dto.eventYear ?? null,
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

  private buildSignedUrl(apiBaseUrl: string, action: 'upload' | 'download', token: string): string {
    const base = apiBaseUrl.replace(/\/+$/, '');
    return `${base}/media/storage/${action}/${encodeURIComponent(token)}`;
  }
}
