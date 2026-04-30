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

export interface UploadOptions {
  patientId: string;
  kind: MediaKind;
  contentType: string;
  fileUri: string;
  byteSize: number;
  metadata?: MediaMetadataInput;
}

export interface MediaMetadataInput {
  collection: MediaCollection;
  firstName?: string;
  lastName?: string;
  relationshipType?: string;
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
  try {
    const data = await res.json();
    detail = data?.message ?? data?.error ?? JSON.stringify(data);
  } catch {
    detail = await res.text().catch(() => undefined);
  }
  throw new Error(`Request failed (${res.status})${detail ? `: ${detail}` : ''}`);
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

async function createUploadIntent(input: {
  patientId: string;
  kind: MediaKind;
  contentType: string;
  byteSize: number;
  metadata?: MediaMetadataInput;
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
    }),
  });
  return jsonOrThrow(res);
}

export type QuizMode = 'NAME' | 'AGE' | 'RELATIONSHIP';

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

/**
 * Caregiver upload flow:
 *  1) request signed PUT URL from backend
 *  2) PUT raw bytes to that URL (the backend encrypts them at rest)
 *  3) confirm completion
 */
export async function uploadPatientMedia(
  options: UploadOptions,
): Promise<{ publicId: string; status: MediaStatus }> {
  const intent = await createUploadIntent({
    patientId: options.patientId,
    kind: options.kind,
    contentType: options.contentType,
    byteSize: options.byteSize,
    metadata: options.metadata,
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
    const detail = await putRes.text().catch(() => undefined);
    throw new Error(
      `Upload failed (${putRes.status})${detail ? `: ${detail}` : ''}`,
    );
  }

  return completeUpload(intent.publicId);
}
