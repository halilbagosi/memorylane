import { File } from 'expo-file-system';
import { API_BASE_URL } from '../config/api';
import { getToken } from '../utils/auth';
import { uploadMediaByPatient, type MediaKind } from './media';

export interface PatientMessageAttachment {
  publicId: string;
  kind: MediaKind;
  contentType: string;
  downloadUrl: string;
  downloadExpiresAt: string;
}

export interface PatientMessage {
  id: string;
  content: string;
  readAt: string | null;
  createdAt: string;
  attachment: PatientMessageAttachment | null;
}

export interface PatientMessageAttachmentInput {
  uri: string;
  kind: MediaKind;
  type: string;
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

async function createMessage(patientId: string, content: string, mediaPublicId?: string): Promise<PatientMessage> {
  const res = await fetch(`${API_BASE_URL}/patients/${encodeURIComponent(patientId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      ...(mediaPublicId ? { mediaPublicId } : {}),
    }),
  });
  return jsonOrThrow(res);
}

export async function sendPatientMessage(
  patientId: string,
  content: string,
  attachment?: PatientMessageAttachmentInput | null,
): Promise<PatientMessage> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Message is empty');

  let mediaPublicId: string | undefined;
  if (attachment) {
    const file = new File(attachment.uri);
    if (!file.exists) throw new Error('File not found');
    const uploaded = await uploadMediaByPatient({
      patientId,
      kind: attachment.kind,
      contentType: attachment.type,
      fileUri: attachment.uri,
      byteSize: file.size,
      metadata: {
        collection: 'MEMORY',
        note: trimmed,
      },
    });
    mediaPublicId = uploaded.publicId;
  }

  return createMessage(patientId, trimmed, mediaPublicId);
}

export async function listPatientMessages(patientId: string): Promise<PatientMessage[]> {
  const res = await fetch(`${API_BASE_URL}/patients/${encodeURIComponent(patientId)}/messages`);
  return jsonOrThrow(res);
}

export async function listCaregiverPatientMessages(patientId: string): Promise<PatientMessage[]> {
  const res = await fetch(`${API_BASE_URL}/patients/${encodeURIComponent(patientId)}/caregiver-messages`, {
    headers: await authHeaders(),
  });
  return jsonOrThrow(res);
}

export async function markPatientMessageRead(patientId: string, messageId: string): Promise<{ id: string; readAt: string | null }> {
  const res = await fetch(
    `${API_BASE_URL}/patients/${encodeURIComponent(patientId)}/messages/${encodeURIComponent(messageId)}/read`,
    {
      method: 'PATCH',
      headers: await authHeaders(),
    },
  );
  return jsonOrThrow(res);
}
