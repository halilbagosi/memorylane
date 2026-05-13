export const STORAGE_SERVICE = 'STORAGE_SERVICE';

export interface StorageService {
  putObject(storageKey: string, body: Buffer): Promise<void>;
  getObject(storageKey: string): Promise<Buffer>;
  deleteObject(storageKey: string): Promise<void>;
  headObject(storageKey: string): Promise<{ exists: boolean; size: number }>;
}
