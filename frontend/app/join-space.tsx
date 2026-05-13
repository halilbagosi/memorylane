import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  BackHandler,
  Dimensions,
  Animated,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { AdaptiveButton } from '../src/components/AdaptiveButton';
import { AdaptiveInput } from '../src/components/AdaptiveInput';
import { AdaptiveCard } from '../src/components/AdaptiveCard';
import { AppIcon } from '../src/components/AppIcon';
import { API_BASE_URL } from '../src/config/api';
import { savePatientInfo } from '../src/utils/auth';
import { markPatientBiometricVerified } from '../src/utils/patientBiometric';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_AREA_SIZE = SCREEN_WIDTH * 0.65;
const isIOS = Platform.OS === 'ios';

const PATIENT_ACCENT = '#8B7355';

function biometricErrorMessage(error?: string) {
  switch (error) {
    case 'missing_usage_description':
      return 'Face ID is limited in Expo Go. You can use the phone passcode for now, then test Face ID in a development build later.';
    case 'not_enrolled':
      return 'Face or Fingerprint is not set up on this device yet. You can skip this and try again later.';
    case 'not_available':
      return 'Face or Fingerprint is not available for Expo Go on this device. Please check Face ID settings for Expo Go.';
    case 'lockout':
      return 'Face or Fingerprint is temporarily locked. Unlock the phone once normally, then try again.';
    case 'user_cancel':
    case 'system_cancel':
    case 'app_cancel':
      return 'No problem. You can try again or skip this for now.';
    case 'timeout':
      return "That took a little too long. Let's try that one more time.";
    case 'unable_to_process':
      return "Face or Fingerprint could not read clearly. Let's try that one more time.";
    case 'authentication_failed':
      return 'Face or Fingerprint did not match. Try again, or skip this for now.';
    default:
      return error ? `Biometric setup could not continue: ${error}` : "Let's try that one more time.";
  }
}

export default function JoinSpaceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [error, setError] = useState('');
  const [biometricError, setBiometricError] = useState('');
  const [successInfo, setSuccessInfo] = useState<{
    id: string;
    patientName: string;
    patientSurname: string;
    avatarUrl?: string | null;
    caregiverName: string;
  } | null>(null);
  const [setupState, setSetupState] = useState<'confirm' | 'biometric-success' | 'skipped' | null>(null);
  const scannedRef = useRef(false);
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0.9)).current;

  async function handleJoin(code: string) {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError('Code must be exactly 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/patients/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinCode: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.message || 'Invalid join code';
        setError(typeof msg === 'string' ? msg : msg[0]);
        scannedRef.current = false;
        return;
      }

      await savePatientInfo({
        id: data.id,
        name: data.name,
        surname: data.surname,
        avatarUrl: data.avatarUrl ?? null,
        biometricRecoveryEnabled: false,
      });

      setSuccessInfo({
        id: data.id,
        patientName: data.name,
        patientSurname: data.surname,
        avatarUrl: data.avatarUrl ?? null,
        caregiverName: `${data.caregiver.name} ${data.caregiver.surname}`,
      });
      setSetupState('confirm');
    } catch {
      setError('Could not connect to server');
      scannedRef.current = false;
    } finally {
      setLoading(false);
    }
  }

  function handleBarCodeScanned({ data }: { data: string }) {
    if (scannedRef.current || loading) return;
    scannedRef.current = true;
    handleJoin(data);
  }

  async function saveBiometricPreference(enabled: boolean) {
    if (!successInfo) return;

    await fetch(`${API_BASE_URL}/patients/${successInfo.id}/biometric-recovery`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
  }

  async function handleEnableBiometrics() {
    if (!successInfo || biometricLoading) return;

    setBiometricLoading(true);
    setBiometricError('');

    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);

      if (!hasHardware || !isEnrolled) {
        setBiometricError('This device is not ready for Face or Fingerprint yet. You can skip this and try again later.');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Save your spot in MemoryLane',
        cancelLabel: 'Not now',
        fallbackLabel: 'Use Passcode',
        disableDeviceFallback: false,
      });

      if (!result.success) {
        setBiometricError(biometricErrorMessage(result.error));
        return;
      }

      await saveBiometricPreference(true);
      await savePatientInfo({
        id: successInfo.id,
        name: successInfo.patientName,
        surname: successInfo.patientSurname,
        avatarUrl: successInfo.avatarUrl ?? null,
        biometricRecoveryEnabled: true,
      });
      markPatientBiometricVerified(successInfo.id);
      setSetupState('biometric-success');
    } catch {
      setBiometricError("Let's try that one more time.");
    } finally {
      setBiometricLoading(false);
    }
  }

  function handleSkipBiometrics() {
    setBiometricError('');
    if (successInfo) markPatientBiometricVerified(successInfo.id);
    setSetupState('skipped');
  }

  // Intercept Android hardware back while in manual mode → go to scanner, not main page
  useEffect(() => {
    if (mode !== 'manual') return;
    const onBack = () => {
      setMode('camera');
      setError('');
      scannedRef.current = false;
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [mode]);

  useEffect(() => {
    if (successInfo) {
      Animated.parallel([
        Animated.timing(successOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(successScale, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();
    }
  }, [successInfo]);

  useEffect(() => {
    if (setupState === 'biometric-success' || setupState === 'skipped') {
      const timer = setTimeout(() => {
        router.replace('/(patient-tabs)/quiz');
      }, setupState === 'biometric-success' ? 1700 : 900);
      return () => clearTimeout(timer);
    }
  }, [setupState]);

  // ─── Success confirmation ───

  if (successInfo) {
    if (setupState === 'confirm') {
      return (
        <View style={[styles.centered, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <StatusBar barStyle="dark-content" />
          <Animated.View style={[styles.successContent, { opacity: successOpacity, transform: [{ scale: successScale }] }]}>
            <View style={styles.successIconOuter}>
              <View style={styles.successIconInner}>
                <AppIcon iosName="checkmark" androidFallback="✓" size={40} color="#fff" />
              </View>
            </View>
            <Text style={styles.successTitle}>Paired with {successInfo.patientName}</Text>
            <Text style={styles.successSubtitle}>
              Would you like to enable Face or Fingerprint for {successInfo.patientName} to prevent them from getting locked out?
            </Text>
            <Text style={styles.biometricWhy}>
              Save your spot so you can always come back to your photos.
            </Text>

            {biometricError ? (
              <Text style={styles.biometricError}>{biometricError}</Text>
            ) : null}

            <AdaptiveButton
              title="Yes, save their spot"
              onPress={handleEnableBiometrics}
              loading={biometricLoading}
              loadingText="Opening..."
              color={PATIENT_ACCENT}
              style={styles.biometricPrimaryBtn}
            />
            <TouchableOpacity
              style={styles.skipBiometricBtn}
              onPress={handleSkipBiometrics}
              disabled={biometricLoading}
            >
              <Text style={styles.skipBiometricText}>Skip for now</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      );
    }

    return (
      <View style={[styles.centered, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar barStyle="dark-content" />
        <Animated.View style={[styles.successContent, { opacity: successOpacity, transform: [{ scale: successScale }] }]}>
          <View style={styles.successIconOuter}>
            <View style={styles.successIconInner}>
              <AppIcon iosName="checkmark" androidFallback="✓" size={40} color="#fff" />
            </View>
          </View>
          <Text style={styles.successTitle}>You're all set!</Text>
          <Text style={styles.successSubtitle}>
            {setupState === 'biometric-success'
              ? 'Your spot is saved. Face or Fingerprint is ready.'
              : 'Your family is waiting for you inside.'}
          </Text>
          <Text style={styles.successTagline}>Let's look at some memories.</Text>
        </Animated.View>
      </View>
    );
  }

  // ─── Camera permission states ───

  if (mode === 'camera' && !permission) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.permText}>Loading camera...</Text>
      </View>
    );
  }

  if (mode === 'camera' && !permission?.granted) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.permCard}>
          <AppIcon iosName="camera.fill" androidFallback="cam" size={40} color={PATIENT_ACCENT} />
          <Text style={styles.permTitle}>Camera Access</Text>
          <Text style={styles.permBody}>
            We need your camera to scan the QR code provided by your caregiver.
          </Text>
          <AdaptiveButton
            title="Allow Camera"
            onPress={requestPermission}
            color={PATIENT_ACCENT}
            style={{ marginTop: 20, alignSelf: 'stretch' }}
          />
          <TouchableOpacity
            style={styles.altLink}
            onPress={() => setMode('manual')}
          >
            <Text style={styles.altLinkText}>Enter code manually instead</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Manual Entry Mode ───

  if (mode === 'manual') {
    return (
      <KeyboardAvoidingView
        style={styles.manualContainer}
        behavior={isIOS ? 'padding' : undefined}
      >
        <StatusBar barStyle="dark-content" />

        {/* Content — centered, shifted slightly above mid */}
        <View style={[
          styles.manualContent,
          {
            paddingTop: insets.top + 56,
            paddingBottom: Math.max(insets.bottom, 24) + 100,
          },
        ]}>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(139, 115, 85, 0.12)' }]}>
            <AppIcon iosName="keyboard" androidFallback="..." size={32} color={PATIENT_ACCENT} />
          </View>

          <Text style={styles.manualTitle}>Enter Your Code</Text>
          <Text style={styles.manualSubtitle}>
            Type the 6-character code your caregiver gave you.
          </Text>

          <AdaptiveInput
            label="Join Code"
            value={joinCode}
            onChangeText={(t) => {
              setJoinCode(t.toUpperCase());
              setError('');
            }}
            placeholder="e.g. 7B2A91"
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect={false}
            error={error}
            containerStyle={styles.manualInput}
          />

          <AdaptiveButton
            title="Link Account"
            onPress={() => handleJoin(joinCode)}
            loading={loading}
            loadingText="Linking..."
            disabled={joinCode.length < 6}
            color={PATIENT_ACCENT}
            style={styles.manualSubmitBtn}
          />
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ─── Camera / QR Mode ───

  return (
    <View style={styles.cameraContainer}>
      <StatusBar barStyle="light-content" />
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        onBarcodeScanned={handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />

      {/* Overlay */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* Top */}
        <View style={[styles.overlaySection, { paddingTop: insets.top + 50 }]}>
          <Text style={styles.scanTitle}>Scan Your Code</Text>
          <Text style={styles.scanSubtitle}>
            Point your camera at the QR code shown on the caregiver's screen.
          </Text>
        </View>

        {/* Scan area cutout */}
        <View style={styles.scanRow}>
          <View style={styles.overlayFill} />
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <View style={styles.overlayFill} />
        </View>

        {/* Bottom */}
        <View style={[styles.overlaySection, styles.bottomSection, { paddingBottom: insets.bottom + 24 }]}>
          {error ? (
            <AdaptiveCard
              style={styles.errorCard}
              backgroundColor="rgba(231, 76, 60, 0.15)"
            >
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => { setError(''); scannedRef.current = false; }}>
                <Text style={styles.errorRetry}>Try again</Text>
              </TouchableOpacity>
            </AdaptiveCard>
          ) : null}

          {loading ? (
            <AdaptiveButton
              title="Linking..."
              onPress={() => {}}
              loading
              color={PATIENT_ACCENT}
              style={{ alignSelf: 'stretch', marginHorizontal: 24 }}
            />
          ) : (
            <TouchableOpacity
              style={styles.manualBtn}
              onPress={() => setMode('manual')}
            >
              <AppIcon iosName="keyboard" androidFallback="..." size={18} color="#FFFFFF" />
              <Text style={styles.manualBtnText}>Enter code manually</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ─── Permission screens ───
  centered: {
    flex: 1,
    backgroundColor: colors.neutral,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  permText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 16,
    color: colors.textMuted,
  },
  permCard: {
    alignItems: 'center',
    paddingHorizontal: 24,
    maxWidth: 340,
  },
  permTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 22,
    color: colors.textDark,
    marginTop: 16,
    marginBottom: 8,
  },
  permBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // ─── Manual entry back button ───
  manualBackBtn: {
    position: 'absolute',
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    zIndex: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  manualBackText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 17,
    color: PATIENT_ACCENT,
  },

  // ─── Manual entry ───
  manualContainer: {
    flex: 1,
    backgroundColor: colors.neutral,
  },
  manualContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  manualTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 24,
    color: colors.textDark,
    marginBottom: 8,
  },
  manualSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  manualInput: {
    width: '100%',
    marginTop: 26,
  },
  manualSubmitBtn: {
    alignSelf: 'stretch',
    marginTop: 10,
  },

  altLink: {
    marginTop: 20,
    paddingVertical: 8,
  },
  altLinkText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: PATIENT_ACCENT,
  },

  // ─── Camera overlay ───
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlaySection: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  bottomSection: {
    justifyContent: 'flex-start',
    paddingTop: 24,
  },
  scanRow: {
    flexDirection: 'row',
    height: SCAN_AREA_SIZE,
  },
  overlayFill: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  scanArea: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
  },

  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#FFFFFF',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },

  scanTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 22,
    color: '#FFFFFF',
    marginBottom: 6,
  },
  scanSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },

  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 28,
  },
  manualBtnText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: '#FFFFFF',
  },

  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    alignSelf: 'stretch',
    marginHorizontal: 24,
  },
  errorText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: '#C0392B',
    flex: 1,
  },
  errorRetry: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: '#C0392B',
    marginLeft: 12,
  },

  // ─── Success screen ───
  successContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 360,
    paddingHorizontal: 8,
  },
  successIconOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(139,115,85,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  successIconInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 30,
    color: colors.textDark,
    marginBottom: 12,
    textAlign: 'center',
  },
  successSubtitle: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 290,
  },
  successTagline: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: PATIENT_ACCENT,
    textAlign: 'center',
    marginTop: 10,
  },
  biometricWhy: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    lineHeight: 22,
    color: PATIENT_ACCENT,
    textAlign: 'center',
    marginTop: 18,
    marginBottom: 22,
  },
  biometricError: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    lineHeight: 20,
    color: '#C0392B',
    textAlign: 'center',
    marginBottom: 16,
  },
  biometricPrimaryBtn: {
    alignSelf: 'stretch',
    minWidth: 260,
  },
  skipBiometricBtn: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  skipBiometricText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: colors.textMuted,
  },
});
