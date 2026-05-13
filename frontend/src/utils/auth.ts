import {
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'memorylane_token';
const CAREGIVER_KEY = 'memorylane_caregiver';
const PATIENT_KEY = 'memorylane_patient';

const CAREGIVER_FILE = 'memorylane_caregiver.json';
const PATIENT_FILE = 'memorylane_patient.json';

/** Web: no documentDirectory; use localStorage for profile blobs (token still uses SecureStore when available). */
const WEB_CAREGIVER = 'memorylane_caregiver_json';
const WEB_PATIENT = 'memorylane_patient_json';

export interface PatientInfo {
  id: string;
  name: string;
  surname: string;
  avatarUrl?: string | null;
  biometricRecoveryEnabled?: boolean;
}

type CaregiverStatus = 'ACTIVE' | 'PENDING_DELETION' | 'DEACTIVATED';

export interface CaregiverInfo {
  id: string;
  name: string;
  surname: string;
  email: string;
  avatarUrl?: string | null;
  status?: CaregiverStatus;
}

async function writeProfileFile(fileName: string, webKey: string, json: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(webKey, json);
    return;
  }
  const dir = documentDirectory;
  if (!dir) return;
  await writeAsStringAsync(`${dir}${fileName}`, json);
}

async function readProfileFile(fileName: string, webKey: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(webKey);
  }
  const dir = documentDirectory;
  if (!dir) return null;
  const uri = `${dir}${fileName}`;
  const info = await getInfoAsync(uri);
  if (!info.exists) return null;
  return readAsStringAsync(uri);
}

async function deleteProfileFile(fileName: string, webKey: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(webKey);
    return;
  }
  const dir = documentDirectory;
  if (!dir) return;
  await deleteAsync(`${dir}${fileName}`, { idempotent: true }).catch(() => undefined);
}

// ─── Token ───

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function deleteToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// ─── Caregiver Info ───

export async function saveCaregiverInfo(info: CaregiverInfo): Promise<void> {
  await writeProfileFile(CAREGIVER_FILE, WEB_CAREGIVER, JSON.stringify(info));
}

export async function getCaregiverInfo(): Promise<CaregiverInfo | null> {
  let raw = await readProfileFile(CAREGIVER_FILE, WEB_CAREGIVER);
  if (!raw) {
    raw = await SecureStore.getItemAsync(CAREGIVER_KEY);
    if (raw) {
      await writeProfileFile(CAREGIVER_FILE, WEB_CAREGIVER, raw);
      await SecureStore.deleteItemAsync(CAREGIVER_KEY).catch(() => undefined);
    }
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CaregiverInfo;
  } catch {
    return null;
  }
}

async function deleteCaregiverInfo(): Promise<void> {
  await deleteProfileFile(CAREGIVER_FILE, WEB_CAREGIVER);
  await SecureStore.deleteItemAsync(CAREGIVER_KEY).catch(() => undefined);
}

// ─── Patient Info ───

export async function savePatientInfo(info: PatientInfo): Promise<void> {
  await writeProfileFile(PATIENT_FILE, WEB_PATIENT, JSON.stringify(info));
}

export async function getPatientInfo(): Promise<PatientInfo | null> {
  let raw = await readProfileFile(PATIENT_FILE, WEB_PATIENT);
  if (!raw) {
    raw = await SecureStore.getItemAsync(PATIENT_KEY);
    if (raw) {
      await writeProfileFile(PATIENT_FILE, WEB_PATIENT, raw);
      await SecureStore.deleteItemAsync(PATIENT_KEY).catch(() => undefined);
    }
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PatientInfo;
  } catch {
    return null;
  }
}

export async function deletePatientInfo(): Promise<void> {
  await deleteProfileFile(PATIENT_FILE, WEB_PATIENT);
  await SecureStore.deleteItemAsync(PATIENT_KEY).catch(() => undefined);
}

// ─── Full logout ───

export async function clearAuth(): Promise<void> {
  await Promise.all([deleteToken(), deleteCaregiverInfo(), deletePatientInfo()]);
}
