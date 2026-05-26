import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { StorageService } from './storage.interface';

/**
 * S3-compatible storage driver (works with AWS S3 and DigitalOcean Spaces).
 * Activated when MEDIA_STORAGE_DRIVER=s3.
 *
 * Required env vars:
 *   MEDIA_S3_BUCKET         e.g. memorylane-media
 *   MEDIA_S3_REGION         e.g. nyc3
 *   MEDIA_S3_ENDPOINT       e.g. https://nyc3.digitaloceanspaces.com  (omit for AWS)
 *   AWS_ACCESS_KEY_ID       Spaces / S3 access key
 *   AWS_SECRET_ACCESS_KEY   Spaces / S3 secret key
 */
@Injectable()
export class S3StorageService implements StorageService, OnModuleInit {
  private readonly logger = new Logger(S3StorageService.name);
  private client!: S3Client;
  private bucket!: string;

  async onModuleInit() {
    this.bucket = process.env.MEDIA_S3_BUCKET ?? '';
    if (!this.bucket) throw new Error('MEDIA_S3_BUCKET is required when MEDIA_STORAGE_DRIVER=s3');

    const region = process.env.MEDIA_S3_REGION ?? 'us-east-1';
    const endpoint = process.env.MEDIA_S3_ENDPOINT;

    this.client = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: false } : {}),
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    });

    this.logger.log(`S3 storage: bucket=${this.bucket} region=${region}${endpoint ? ` endpoint=${endpoint}` : ''}`);
  }

  async putObject(storageKey: string, body: Buffer): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      Body: body,
    }));
  }

  async getObject(storageKey: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    }));
    const stream = res.Body as NodeJS.ReadableStream;
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async deleteObject(storageKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    })).catch(() => undefined);
  }

  async headObject(storageKey: string): Promise<{ exists: boolean; size: number }> {
    try {
      const res = await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }));
      return { exists: true, size: res.ContentLength ?? 0 };
    } catch {
      return { exists: false, size: 0 };
    }
  }
}
