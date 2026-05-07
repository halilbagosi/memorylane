import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { API_BASE_URL } from '../config/api';
import { getToken } from '../utils/auth';

export type MediaKind = 'PHOTO' | 'AUDIO' | 'VIDEO' | 'DOCUMENT';
export type MediaStatus = 'PENDING_UPLOAD' | 'READY' | 'FAILED';
export type MediaCollection = 'MEMORY' | 'QUIZ';

export interface MediaListItem {
  publicId: string;
  kind: MediaKind;
  status: MediaStatus;
  contentType: string;
  byteSize: number;
  createdAt: string;
  caregiverId: string | null;
  caregiverName: string | null;
  collection: MediaCollection;
  firstName: string | null;
  lastName: string | null;
  relationshipType: string | null;
  birthYear: number | null;
  note: string | null;
  eventYear: number | null;
  isApproximateYear: boolean;
  memoryCategory: string | null;
}

export interface TimelineItem {
  publicId: string;
  kind: MediaKind;
  contentType: string;
  note: string | null;
  eventYear: number | null;
  isApproximateYear: boolean;
  memoryCategory: string | null;
  createdAt: string;
  downloadUrl: string;
  downloadExpiresAt: string;
}

export interface UploadIntentResponse {
  publicId: string;
  kind: MediaKind;
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

export type QuizPhotoVerificationCode =
  | 'NO_FACE_DETECTED'
  | 'TOO_MANY_FACES'
  | 'LOW_CONFIDENCE'
  | 'LOW_CLARITY'
  | 'NOT_FRONTAL'
  | 'INVALID_IMAGE'
  | 'DUPLICATE_PHOTO'
  | 'FACE_VERIFICATION_UNAVAILABLE';

export interface QuizPhotoVerificationResult {
  accepted: boolean;
  code?: QuizPhotoVerificationCode;
  message?: string;
  confidence?: number;
  cropped?: boolean;
}

export interface UploadOptions {
  patientId: string;
  kind: MediaKind;
  contentType: string;
  fileUri: string;
  hashUri?: string;
  byteSize: number;
  metadata?: MediaMetadataInput;
}

export interface MediaMetadataInput {
  collection: MediaCollection;
  firstName?: string;
  lastName?: string;
  relationshipType?: string;
  birthYear?: number;
  note?: string;
  eventYear?: number;
  isApproximateYear?: boolean;
  memoryCategory?: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

async function jsonOrThrow(res: Response): Promise<any> {
  if (res.ok) return res.json();
  let detail: string | undefined;
  let code: string | undefined;
  try {
    const data = await res.json();
    const nested = typeof data?.message === 'object' && data.message !== null ? data.message : null;
    code = data?.code ?? nested?.code;
    detail = nested?.message ?? data?.message ?? data?.error ?? JSON.stringify(data);
  } catch {
    detail = await res.text().catch(() => undefined);
  }
  const error = new Error(`Request failed (${res.status})${detail ? `: ${detail}` : ''}`) as Error & {
    status?: number;
    code?: string;
    detail?: string;
  };
  error.status = res.status;
  error.code = code;
  error.detail = detail;
  throw error;
}

export async function listPatientMedia(patientId: string): Promise<MediaListItem[]> {
  const res = await fetch(`${API_BASE_URL}/media/patient/${encodeURIComponent(patientId)}`, {
    headers: { ...(await authHeaders()) },
  });
  return jsonOrThrow(res);
}

export async function getPatientTimeline(patientId: string): Promise<TimelineItem[]> {
  const res = await fetch(`${API_BASE_URL}/media/patient/${encodeURIComponent(patientId)}/timeline`);
  return jsonOrThrow(res);
}

export async function deleteMedia(publicId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/media/${encodeURIComponent(publicId)}`, {
    method: 'DELETE',
    headers: { ...(await authHeaders()) },
  });
  await jsonOrThrow(res);
}

export async function getAccessUrl(publicId: string): Promise<AccessUrlResponse> {
  const res = await fetch(
    `${API_BASE_URL}/media/${encodeURIComponent(publicId)}/access-url`,
    { headers: { ...(await authHeaders()) } },
  );
  return jsonOrThrow(res);
}

async function computeContentHash(uri: string): Promise<string | undefined> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
  } catch {
    return undefined;
  }
}

async function createUploadIntent(input: {
  patientId: string;
  kind: MediaKind;
  contentType: string;
  byteSize: number;
  metadata?: MediaMetadataInput;
  contentHash?: string;
}): Promise<UploadIntentResponse> {
  const res = await fetch(`${API_BASE_URL}/media/upload-intent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify({
      patientId: input.patientId,
      kind: input.kind,
      contentType: input.contentType,
      byteSize: input.byteSize,
      ...(input.metadata ?? {}),
      ...(input.contentHash ? { contentHash: input.contentHash } : {}),
    }),
  });
  return jsonOrThrow(res);
}

export type QuizMode = 'NAME' | 'AGE' | 'RELATIONSHIP';

export interface QuizMediaItem {
  publicId: string;
  firstName: string | null;
  lastName: string | null;
  relationshipType: string | null;
  birthYear: number | null;
  eventYear: number | null;
  downloadUrl: string;
  downloadExpiresAt: string;
}

export interface PatientQuizData {
  quizModes: QuizMode[];
  media: QuizMediaItem[];
}

/** Public — no JWT required. Called from the patient device. */
export async function getPatientQuizData(patientId: string): Promise<PatientQuizData> {
  const res = await fetch(
    `${API_BASE_URL}/media/patient/${encodeURIComponent(patientId)}/quiz`,
  );
  return jsonOrThrow(res);
}

export async function getQuizModes(patientId: string): Promise<QuizMode[]> {
  const res = await fetch(`${API_BASE_URL}/patients/${encodeURIComponent(patientId)}/quiz-modes`, {
    headers: await authHeaders(),
  });
  const data = await jsonOrThrow(res);
  return data.quizModes;
}

export async function updateQuizModes(patientId: string, modes: QuizMode[]): Promise<QuizMode[]> {
  const res = await fetch(`${API_BASE_URL}/patients/${encodeURIComponent(patientId)}/quiz-modes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ modes }),
  });
  const data = await jsonOrThrow(res);
  return data.quizModes;
}

export async function updateMediaMetadata(
  publicId: string,
  metadata: MediaMetadataInput,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/media/${encodeURIComponent(publicId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify(metadata),
  });
  await jsonOrThrow(res);
}

async function completeUpload(publicId: string): Promise<{ publicId: string; status: MediaStatus }> {
  const res = await fetch(
    `${API_BASE_URL}/media/${encodeURIComponent(publicId)}/complete`,
    {
      method: 'POST',
      headers: { ...(await authHeaders()) },
    },
  );
  return jsonOrThrow(res);
}

async function fetchLocalBlob(uri: string): Promise<Blob> {
  const localResponse = await fetch(uri);
  if (!localResponse.ok) {
    throw new Error('Could not read selected file');
  }
  return localResponse.blob();
}

export async function verifyQuizPhoto(
  patientId: string,
  imageBase64: string,
): Promise<QuizPhotoVerificationResult> {
  const res = await fetch(`${API_BASE_URL}/media/quiz-photo/verify-base64`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify({ patientId, imageBase64 }),
  });
  return jsonOrThrow(res);
}

/**
 * Caregiver upload flow:
 *  1) request signed PUT URL from backend
 *  2) PUT raw bytes to that URL (the backend encrypts them at rest)
 *  3) confirm completion
 */
export async function uploadPatientMedia(
  options: UploadOptions,
): Promise<{ publicId: string; status: MediaStatus }> {
  const contentHash = options.kind === 'PHOTO'
    ? await computeContentHash(options.hashUri ?? options.fileUri)
    : undefined;

  const intent = await createUploadIntent({
    patientId: options.patientId,
    kind: options.kind,
    contentType: options.contentType,
    byteSize: options.byteSize,
    metadata: options.metadata,
    contentHash,
  });

  if (options.byteSize > intent.maxByteSize) {
    throw new Error(
      `File is too large (${options.byteSize} bytes; limit ${intent.maxByteSize}).`,
    );
  }

  const blob = await fetchLocalBlob(options.fileUri);

  const putRes = await fetch(intent.uploadUrl, {
    method: intent.uploadMethod,
    headers: { ...intent.uploadHeaders },
    body: blob,
  });
  if (!putRes.ok) {
    let detail: string | undefined;
    let code: string | undefined;
    try {
      const data = await putRes.json();
      const nested = typeof data?.message === 'object' && data.message !== null ? data.message : null;
      code = data?.code ?? nested?.code;
      detail = nested?.message ?? data?.message ?? data?.error ?? JSON.stringify(data);
    } catch {
      detail = await putRes.text().catch(() => undefined);
    }
    const error = new Error(`Upload failed (${putRes.status})${detail ? `: ${detail}` : ''}`) as Error & {
      status?: number;
      code?: string;
      detail?: string;
    };
    error.status = putRes.status;
    error.code = code;
    error.detail = detail;
    throw error;
  }

  return completeUpload(intent.publicId);
}
