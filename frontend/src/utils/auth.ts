import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'memorylane_token';
const CAREGIVER_KEY = 'memorylane_caregiver';
const PATIENT_KEY = 'memorylane_patient';

export interface PatientInfo {
  id: string;
  name: string;
  surname: string;
  avatarUrl?: string | null;
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
  await SecureStore.setItemAsync(CAREGIVER_KEY, JSON.stringify(info));
}

export async function getCaregiverInfo(): Promise<CaregiverInfo | null> {
  const raw = await SecureStore.getItemAsync(CAREGIVER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CaregiverInfo;
  } catch {
    return null;
  }
}

async function deleteCaregiverInfo(): Promise<void> {
  await SecureStore.deleteItemAsync(CAREGIVER_KEY);
}

// ─── Patient Info ───

export async function savePatientInfo(info: PatientInfo): Promise<void> {
  await SecureStore.setItemAsync(PATIENT_KEY, JSON.stringify(info));
}

export async function getPatientInfo(): Promise<PatientInfo | null> {
  const raw = await SecureStore.getItemAsync(PATIENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PatientInfo;
  } catch {
    return null;
  }
}

export async function deletePatientInfo(): Promise<void> {
  await SecureStore.deleteItemAsync(PATIENT_KEY);
}

// ─── Full logout ───

export async function clearAuth(): Promise<void> {
  await Promise.all([deleteToken(), deleteCaregiverInfo(), deletePatientInfo()]);
}
