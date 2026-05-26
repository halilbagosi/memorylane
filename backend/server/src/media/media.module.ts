import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { raw } from 'express';
import { KeyWrapService } from './crypto/key-wrap.service';
import { MediaCryptoService } from './crypto/media-crypto.service';
import { SignedUrlService } from './crypto/signed-url.service';
import { FaceVerificationService } from './face-verification.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { LocalStorageService } from './storage/local-storage.service';
import { S3StorageService } from './storage/s3-storage.service';
import { STORAGE_SERVICE } from './storage/storage.interface';
import { AiDifficultyService } from '../patient/ai-difficulty.service';

const RAW_UPLOAD_LIMIT = (() => {
  const v = Number(process.env.MEDIA_MAX_BYTES_AUDIO);
  const audio = Number.isFinite(v) && v > 0 ? v : 25 * 1024 * 1024;
  const image = Number(process.env.MEDIA_MAX_BYTES_IMAGE) || 10 * 1024 * 1024;
  return Math.max(audio, image) + 1024;
})();

const storageProvider = {
  provide: STORAGE_SERVICE,
  useClass: process.env.MEDIA_STORAGE_DRIVER === 's3' ? S3StorageService : LocalStorageService,
};

@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    KeyWrapService,
    MediaCryptoService,
    FaceVerificationService,
    SignedUrlService,
    AiDifficultyService,
    storageProvider,
  ],
})
export class MediaModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(raw({ type: () => true, limit: RAW_UPLOAD_LIMIT }))
      .forRoutes({ path: 'media/storage/upload/:token', method: RequestMethod.PUT });
    consumer
      .apply(raw({ type: () => true, limit: RAW_UPLOAD_LIMIT }))
      .forRoutes({ path: 'media/quiz-photo/verify', method: RequestMethod.POST });
  }
}
