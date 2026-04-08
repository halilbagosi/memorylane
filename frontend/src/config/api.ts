import { Platform } from 'react-native';

// EXPO_PUBLIC_API_BASE_URL can be set in .env.local to override defaults.
// Physical devices on Wi-Fi need the host machine's LAN IP.
// Simulators/emulators work out of the box with the platform-aware fallback.
const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

const FALLBACK = Platform.OS === 'android'
  ? 'http://10.0.2.2:3000'
  : 'http://localhost:3000';

export const API_BASE_URL: string = envUrl || FALLBACK;
