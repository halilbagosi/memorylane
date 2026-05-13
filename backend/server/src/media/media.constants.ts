export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const ALLOWED_AUDIO_MIME = [
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/x-m4a',
] as const;

export type MediaKindValue = 'PHOTO' | 'AUDIO' | 'VIDEO' | 'DOCUMENT';

export const ALLOWED_MIME_BY_KIND: Record<MediaKindValue, readonly string[]> = {
  PHOTO: ALLOWED_IMAGE_MIME,
  AUDIO: ALLOWED_AUDIO_MIME,
  VIDEO: ['video/mp4', 'video/quicktime', 'video/x-m4v'],
  DOCUMENT: ['application/pdf'],
};

export function getMaxBytes(kind: MediaKindValue): number {
  if (kind === 'PHOTO') {
    return Number(process.env.MEDIA_MAX_BYTES_IMAGE) || 10 * 1024 * 1024;
  }
  if (kind === 'AUDIO') {
    return Number(process.env.MEDIA_MAX_BYTES_AUDIO) || 25 * 1024 * 1024;
  }
  if (kind === 'VIDEO') {
    return Number(process.env.MEDIA_MAX_BYTES_VIDEO) || 100 * 1024 * 1024;
  }
  return Number(process.env.MEDIA_MAX_BYTES_DOCUMENT) || 20 * 1024 * 1024;
}

export function getSignedUrlTtlSeconds(): number {
  const v = Number(process.env.MEDIA_SIGNED_URL_TTL_SECONDS);
  if (!Number.isFinite(v) || v <= 0) return 600;
  return Math.min(v, 3600);
}
