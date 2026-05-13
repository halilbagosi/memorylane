import { API_BASE_URL } from '../config/api';

export interface Note {
  id: string;
  patientId: string;
  content: string;
  createdAt: string;
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
  const error = new Error(`Request failed (${res.status})${detail ? `: ${detail}` : ''}`) as Error & {
    status?: number;
  };
  error.status = res.status;
  throw error;
}

export async function getPatientNotes(patientId: string): Promise<Note[]> {
  const res = await fetch(`${API_BASE_URL}/patients/${encodeURIComponent(patientId)}/notes`);
  return jsonOrThrow(res);
}

export async function addPatientNote(patientId: string, content: string): Promise<Note> {
  const res = await fetch(`${API_BASE_URL}/patients/${encodeURIComponent(patientId)}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  return jsonOrThrow(res);
}
