import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { getPatientTimeline, uploadMediaByPatient } from './media';

export interface Note {
  id: string;
  createdAt: string;
  content: string;
}

/** Stored on `Media.note` for patient text journals (invisible prefix). */
export const PATIENT_JOURNAL_NOTE_PREFIX = '\u200B';

export function isPatientJournalTimelineNote(note: string | null | undefined): boolean {
  return Boolean(note?.startsWith(PATIENT_JOURNAL_NOTE_PREFIX));
}

const MIN_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBkNDRkYMRw8ODIcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBz/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAG/AP/Z';

function decodeB64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function writeUniquePlaceholderJpeg(): Promise<{ uri: string; byteSize: number }> {
  const base = decodeB64ToUint8(MIN_JPEG_B64);
  const suffix = await Crypto.getRandomBytesAsync(32);
  const combined = new Uint8Array(base.length + suffix.length);
  combined.set(base, 0);
  combined.set(suffix, base.length);
  const file = new File(Paths.cache, `patient-journal-${Date.now()}.jpg`);
  file.create({ overwrite: true });
  file.write(combined);
  return { uri: file.uri, byteSize: combined.length };
}

export async function getPatientNotes(patientId: string): Promise<Note[]> {
  const timeline = await getPatientTimeline(patientId);
  return timeline
    .filter((item) => isPatientJournalTimelineNote(item.note))
    .map((item) => ({
      id: item.publicId,
      createdAt: item.createdAt,
      content: item.note!.slice(PATIENT_JOURNAL_NOTE_PREFIX.length),
    }));
}

/**
 * Persists a text-only journal line for the patient device using the existing
 * MEMORY photo pipeline (tiny unique JPEG + note metadata). There is no
 * separate notes table yet.
 */
export async function addPatientNote(patientId: string, content: string): Promise<Note> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Note is empty');

  const { uri, byteSize } = await writeUniquePlaceholderJpeg();
  let publicId: string;
  try {
    const result = await uploadMediaByPatient({
      patientId,
      kind: 'PHOTO',
      contentType: 'image/jpeg',
      fileUri: uri,
      byteSize,
      metadata: {
        collection: 'MEMORY',
        note: `${PATIENT_JOURNAL_NOTE_PREFIX}${trimmed}`,
      },
    });
    publicId = result.publicId;
  } finally {
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch {
      /* ignore */
    }
  }

  return {
    id: publicId,
    createdAt: new Date().toISOString(),
    content: trimmed,
  };
}
