import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { StorageService } from './storage.interface';

/**
 * Filesystem-backed storage driver used for development and the
 * bachelor-project demo. The on-disk layout is opaque: storage keys
 * are random and contain no caregiver / patient identifying data.
 *
 * In production this can be swapped for an S3-compatible driver
 * by binding STORAGE_SERVICE to a different implementation.
 */
@Injectable()
export class LocalStorageService implements StorageService, OnModuleInit {
  private readonly logger = new Logger(LocalStorageService.name);
  private root!: string;

  async onModuleInit() {
    const configured = process.env.MEDIA_STORAGE_LOCAL_PATH;
    this.root = configured && configured.trim().length > 0
      ? path.resolve(configured)
      : path.resolve(process.cwd(), 'uploads', 'media');
    await fs.mkdir(this.root, { recursive: true });
    this.logger.log(`Local media storage root: ${this.root}`);
  }

  async putObject(storageKey: string, body: Buffer): Promise<void> {
    const target = this.resolve(storageKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
  }

  async getObject(storageKey: string): Promise<Buffer> {
    return fs.readFile(this.resolve(storageKey));
  }

  async deleteObject(storageKey: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(storageKey));
    } catch {
      // best-effort delete
    }
  }

  async headObject(storageKey: string): Promise<{ exists: boolean; size: number }> {
    try {
      const stat = await fs.stat(this.resolve(storageKey));
      return { exists: true, size: stat.size };
    } catch {
      return { exists: false, size: 0 };
    }
  }

  private resolve(storageKey: string): string {
    if (typeof storageKey !== 'string' || storageKey.length === 0) {
      throw new Error('Invalid storage key');
    }
    const target = path.resolve(this.root, storageKey);
    const rootWithSep = path.resolve(this.root) + path.sep;
    if (!target.startsWith(rootWithSep)) {
      throw new Error('Invalid storage key');
    }
    return target;
  }
}
