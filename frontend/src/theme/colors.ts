// Design system based on MemoryLane UI/UX spec
import { Platform } from 'react-native';

export const colors = {
  primary: '#1E4D30', // Deep green: headings, CTAs, active nav
  secondary: '#03573a', // Warm grey-green: secondary text, inactive elements
  neutral: '#E8F5EC', // Near-white mint: background, breathing room
  neutralLight: '#FFFFFF',
  textDark: '#1A1A1A',
  textLight: '#FFFFFF',
  textMuted: '#666666',

  // Card backgrounds – translucent on iOS for vibrancy, solid on Android for clarity
  patientCardBg: Platform.OS === 'ios' ? 'rgba(234, 224, 206, 0.7)' : '#EAE0CE',
  caregiverCardBg: Platform.OS === 'ios' ? 'rgba(167, 215, 197, 0.7)' : '#A7D7C5',
};
