import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
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
  hint: string | null;
  nickname: string | null;
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
  hint?: string;
  nickname?: string;
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
    const base64 = await new File(uri).base64();
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

async function createPatientUploadIntent(input: {
  patientId: string;
  kind: MediaKind;
  contentType: string;
  byteSize: number;
  metadata?: MediaMetadataInput;
  contentHash?: string;
}): Promise<UploadIntentResponse> {
  const res = await fetch(`${API_BASE_URL}/media/patient/upload-intent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
export type QuizDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type CareLevel = 'PREVENTATIVE' | 'DEMENTIA';

export interface QuizMediaItem {
  publicId: string;
  firstName: string | null;
  lastName: string | null;
  relationshipType: string | null;
  birthYear: number | null;
  eventYear: number | null;
  hint: string | null;
  nickname: string | null;
  downloadUrl: string;
  downloadExpiresAt: string;
}

export interface PatientQuizData {
  quizModes: QuizMode[];
  quizDifficulty: QuizDifficulty;
  predictedDifficulty: QuizDifficulty;
  careLevel: CareLevel;
  aiAdaptiveEnabled: boolean;
  successRate: number;
  media: QuizMediaItem[];
}

export interface QuizSettings {
  quizModes: QuizMode[];
  quizDifficulty: QuizDifficulty;
  predictedDifficulty: QuizDifficulty;
  careLevel: CareLevel;
  aiAdaptiveEnabled: boolean;
  successRate: number;
}

export interface QuizResultAttempt {
  publicId: string;
  mode: QuizMode;
  difficulty: QuizDifficulty;
  firstTapCorrect: boolean;
  totalTaps: number;
  timeToCorrectMs: number;
  hadHint: boolean;
}

/** Payload item for `recordPatientQuizSession` (patient device). */
export interface QuizAttemptInput {
  mediaPublicId: string;
  firstTapCorrect: boolean;
  totalTaps: number;
  timeToCorrectMs: number;
  attemptedAt: string;
}

/** Public — no JWT required. Called from the patient device. */
export async function getPatientQuizData(patientId: string): Promise<PatientQuizData> {
  const res = await fetch(
    `${API_BASE_URL}/media/patient/${encodeURIComponent(patientId)}/quiz`,
  );
  return jsonOrThrow(res);
}

export async function recordPatientQuizSession(
  patientId: string,
  mode: QuizMode,
  attempts: QuizAttemptInput[],
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/patients/${encodeURIComponent(patientId)}/quiz-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, attempts }),
  });
  await jsonOrThrow(res);
}

export async function getQuizModes(patientId: string): Promise<QuizMode[]> {
  const res = await fetch(`${API_BASE_URL}/patients/${encodeURIComponent(patientId)}/quiz-modes`, {
    headers: await authHeaders(),
  });
  const data = await jsonOrThrow(res);
  return data.quizModes;
}

export async function getQuizSettings(patientId: string): Promise<QuizSettings> {
  const res = await fetch(`${API_BASE_URL}/patients/${encodeURIComponent(patientId)}/quiz-modes`, {
    headers: await authHeaders(),
  });
  const data = await jsonOrThrow(res);
  return {
    quizModes: data.quizModes,
    quizDifficulty: data.quizDifficulty ?? 'MEDIUM',
    predictedDifficulty: data.predictedDifficulty ?? data.quizDifficulty ?? 'MEDIUM',
    careLevel: data.careLevel ?? 'DEMENTIA',
    aiAdaptiveEnabled: data.aiAdaptiveEnabled === true,
    successRate: Number(data.successRate ?? 0),
  };
}

export async function updateQuizModes(
  patientId: string,
  modes: QuizMode[],
  difficulty?: QuizDifficulty,
  options?: { careLevel?: CareLevel; aiAdaptiveEnabled?: boolean },
): Promise<QuizSettings> {
  const res = await fetch(`${API_BASE_URL}/patients/${encodeURIComponent(patientId)}/quiz-modes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({
      modes,
      ...(difficulty ? { difficulty } : {}),
      ...(options?.careLevel ? { careLevel: options.careLevel } : {}),
      ...(typeof options?.aiAdaptiveEnabled === 'boolean' ? { aiAdaptiveEnabled: options.aiAdaptiveEnabled } : {}),
    }),
  });
  const data = await jsonOrThrow(res);
  return {
    quizModes: data.quizModes,
    quizDifficulty: data.quizDifficulty ?? 'MEDIUM',
    predictedDifficulty: data.predictedDifficulty ?? data.quizDifficulty ?? 'MEDIUM',
    careLevel: data.careLevel ?? 'DEMENTIA',
    aiAdaptiveEnabled: data.aiAdaptiveEnabled === true,
    successRate: Number(data.successRate ?? 0),
  };
}

export async function submitQuizResults(
  patientId: string,
  attempts: QuizResultAttempt[],
): Promise<{ successRate: number; predictedDifficulty: QuizDifficulty; targetComplexity: number; source: string }> {
  const res = await fetch(`${API_BASE_URL}/patients/${encodeURIComponent(patientId)}/quiz-results`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attempts }),
  });
  return jsonOrThrow(res);
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

async function completePatientUpload(publicId: string): Promise<{ publicId: string; status: MediaStatus }> {
  const res = await fetch(
    `${API_BASE_URL}/media/patient/${encodeURIComponent(publicId)}/complete`,
    {
      method: 'POST',
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

/**
 * Patient-initiated upload flow (for Quiz tab notes with media):
 *  1) request signed PUT URL from backend (using patient endpoints)
 *  2) PUT raw bytes to that URL
 *  3) confirm completion
 */
export async function uploadMediaByPatient(
  options: UploadOptions,
): Promise<{ publicId: string; status: MediaStatus }> {
  const contentHash = options.kind === 'PHOTO'
    ? await computeContentHash(options.hashUri ?? options.fileUri)
    : undefined;

  const intent = await createPatientUploadIntent({
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
    throw new Error(`Upload failed (${putRes.status})`);
  }

  return completePatientUpload(intent.publicId);
}
