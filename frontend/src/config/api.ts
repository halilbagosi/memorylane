// Each developer sets their own machine's local IP in frontend/.env (never committed to git).
// Windows: run `ipconfig`  →  find IPv4 Address
// Mac:     run `ifconfig`  →  find inet under en0
// Example: EXPO_PUBLIC_API_BASE_URL=http://192.168.1.42:3000
//
// For production, set this to the deployed backend URL.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
