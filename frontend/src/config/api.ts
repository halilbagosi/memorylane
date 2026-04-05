import { Platform } from 'react-native';

// Dev default: iOS simulator and web can use localhost. Android emulator must use
// 10.0.2.2 to reach the host machine (localhost inside the emulator is the emulator itself).
const RAW_BASE = 'http://localhost:3000';

function resolveApiBaseUrl(): string {
  if (Platform.OS !== 'android') {
    return RAW_BASE;
  }
  if (RAW_BASE.includes('localhost')) {
    return RAW_BASE.replace('localhost', '10.0.2.2');
  }
  if (RAW_BASE.includes('127.0.0.1')) {
    return RAW_BASE.replace('127.0.0.1', '10.0.2.2');
  }
  return RAW_BASE;
}

export const API_BASE_URL = resolveApiBaseUrl();
