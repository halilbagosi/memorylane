// Design system based on MemoryLane UI/UX spec
import { Platform, Appearance } from 'react-native';

export const lightColors = {
  primary: '#1E4D30', // Deep green: headings, CTAs, active nav
  secondary: '#03573a', // Warm grey-green: secondary text, inactive elements
  neutral: '#E8F5EC', // Near-white mint: background, breathing room
  neutralLight: '#FFFFFF',
  textDark: '#1A1A1A',
  textLight: '#FFFFFF',
  textMuted: '#666666',

  // Card backgrounds – translucent on iOS for vibrancy, solid on Android for clarity
  patientCardBg: Platform.OS === 'ios' ? 'rgba(225, 204, 172, 0.7)' : '#EBE8F8', // Lavender (Supporting)
  patientCardBgSecondary: Platform.OS === 'ios' ? 'rgba(123, 115, 192, 0.08)' : '#F3F0FA', // Soft lavender for secondary patient cards
  caregiverCardBg: Platform.OS === 'ios' ? 'rgba(193, 234, 211, 0.88)' : '#C1EAD3', // Mint Green (My Patients)
  glassCardBg: Platform.OS === 'ios' ? 'rgba(255, 255, 255, 0.7)' : '#FFFFFF',
  glassBorder: 'rgba(0, 0, 0, 0.08)',
  accentSelected: 'rgba(45, 79, 62, 0.08)',
};

export const darkColors = {
  primary: '#9BE7B4', // More accurate mint from the screenshots
  secondary: '#79DBA1', // Darker emerald for selected backgrounds
  neutral: '#0E1712', // Deeper charcoal-green for background
  neutralLight: '#17231D', // Standard card background
  textDark: '#F5FBF7', // Main text
  textLight: '#FFFFFF',
  textMuted: '#AEBDAF', // Muted sage

  // Card backgrounds based on screenshots
  patientCardBg: Platform.OS === 'ios' ? 'rgba(91, 69, 42, 0.72)' : '#2B2419', // Dark Amber/Brown
  patientCardBgSecondary: Platform.OS === 'ios' ? 'rgba(123, 115, 192, 0.06)' : '#532287', // Darker muted purple for secondary patient cards
  caregiverCardBg: Platform.OS === 'ios' ? 'rgba(27, 79, 57, 0.68)' : '#183426', // Dark Emerald
  glassCardBg: Platform.OS === 'ios' ? 'rgba(235, 247, 239, 0.04)' : '#121B15',
  glassBorder: 'rgba(235, 247, 239, 0.08)',
  accentSelected: '#1B3126', // Specifically for selected state backgrounds
};

// For backward compatibility and static references where isDark is not available
// For backward compatibility and static references where isDark is not available
// Resolve to the current system appearance at module load time so callers
// that import `colors` (without ThemeProvider) get a sensible default.
const systemScheme = typeof Appearance !== 'undefined' && typeof Appearance.getColorScheme === 'function'
  ? Appearance.getColorScheme()
  : 'light';
export const colors = systemScheme === 'dark' ? darkColors : lightColors;
