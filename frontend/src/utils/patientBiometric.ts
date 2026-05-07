import * as LocalAuthentication from 'expo-local-authentication';

let verifiedPatientId: string | null = null;

export function markPatientBiometricVerified(patientId: string) {
  verifiedPatientId = patientId;
}

export function isPatientBiometricVerified(patientId: string) {
  return verifiedPatientId === patientId;
}

export async function unlockPatientWithBiometrics() {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);

  if (!hasHardware || !isEnrolled) return false;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Open MemoryLane',
    cancelLabel: 'Not now',
    fallbackLabel: 'Use Passcode',
    disableDeviceFallback: false,
  });

  return result.success;
}

export async function getPatientBiometricDebugInfo() {
  const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);

  return { hasHardware, isEnrolled, supportedTypes };
}
