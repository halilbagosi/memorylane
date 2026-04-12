import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
  Animated,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { AdaptiveButton } from '../src/components/AdaptiveButton';
import { AdaptiveInput } from '../src/components/AdaptiveInput';
import { AdaptiveCard } from '../src/components/AdaptiveCard';
import { AppIcon } from '../src/components/AppIcon';
import { API_BASE_URL } from '../src/config/api';
import { getToken } from '../src/utils/auth';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_AREA_SIZE = SCREEN_WIDTH * 0.65;
const isIOS = Platform.OS === 'ios';

const ACCENT = '#2D4F3E';
const ACCENT_LIGHT = 'rgba(45, 79, 62, 0.12)';

export default function JoinPatientScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState<{ patientName: string } | null>(null);
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
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/patients/join-as-caregiver`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ joinCode: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.message || 'Invalid join code';
        setError(typeof msg === 'string' ? msg : msg[0]);
        scannedRef.current = false;
        return;
      }

      setSuccessInfo({ patientName: `${data.name} ${data.surname}` });
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

  useEffect(() => {
    if (successInfo) {
      Animated.parallel([
        Animated.timing(successOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(successScale, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();

      const timer = setTimeout(() => {
        router.replace('/(caregiver-tabs)/patients');
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [successInfo]);

  // ─── Success ───

  if (successInfo) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" />
        <Animated.View style={[styles.successContent, { opacity: successOpacity, transform: [{ scale: successScale }] }]}>
          <View style={styles.successCheckCircle}>
            <AppIcon iosName="checkmark.circle.fill" androidFallback="OK" size={56} color="#4CAF50" />
          </View>
          <Text style={styles.successTitle}>Patient Added!</Text>
          <Text style={styles.successSubtitle}>
            <Text style={styles.successPatientName}>{successInfo.patientName}</Text>
            {' '}has been added to your dashboard as a secondary patient.
          </Text>
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
          <AppIcon iosName="camera.fill" androidFallback="cam" size={40} color={ACCENT} />
          <Text style={styles.permTitle}>Camera Access</Text>
          <Text style={styles.permBody}>
            We need your camera to scan the patient's QR code.
          </Text>
          <AdaptiveButton
            title="Allow Camera"
            onPress={requestPermission}
            color={ACCENT}
            style={{ marginTop: 20, alignSelf: 'stretch' }}
          />
          <TouchableOpacity style={styles.altLink} onPress={() => setMode('manual')}>
            <Text style={styles.altLinkText}>Enter code manually instead</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Manual Entry ───

  if (mode === 'manual') {
    return (
      <KeyboardAvoidingView
        style={[styles.manualContainer, { paddingTop: insets.top + 44 }]}
        behavior={isIOS ? 'padding' : undefined}
      >
        <StatusBar barStyle="dark-content" />
        <View style={styles.manualContent}>
          <View style={[styles.iconCircle, { backgroundColor: ACCENT_LIGHT }]}>
            <AppIcon iosName="keyboard" androidFallback="..." size={32} color={ACCENT} />
          </View>
          <Text style={styles.manualTitle}>Enter Patient Code</Text>
          <Text style={styles.manualSubtitle}>
            Type the 6-character code from the patient's profile.
          </Text>
          <AdaptiveInput
            label="Join Code"
            value={joinCode}
            onChangeText={(t) => { setJoinCode(t.toUpperCase()); setError(''); }}
            placeholder="e.g. 7B2A91"
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect={false}
            error={error}
            containerStyle={{ width: '100%', marginTop: 24 }}
          />
          <AdaptiveButton
            title="Join Patient Space"
            onPress={() => handleJoin(joinCode)}
            loading={loading}
            loadingText="Joining..."
            disabled={joinCode.length < 6}
            color={ACCENT}
            style={{ alignSelf: 'stretch', marginTop: 8 }}
          />
          <TouchableOpacity
            style={styles.altLink}
            onPress={() => { setMode('camera'); setError(''); scannedRef.current = false; }}
          >
            <Text style={styles.altLinkText}>Back to scanner</Text>
          </TouchableOpacity>
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

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={[styles.overlaySection, { paddingTop: insets.top + 50 }]}>
          <Text style={styles.scanTitle}>Scan Patient QR Code</Text>
          <Text style={styles.scanSubtitle}>
            Point your camera at the QR code.
          </Text>
        </View>

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

        <View style={[styles.overlaySection, styles.bottomSection, { paddingBottom: insets.bottom + 24 }]}>
          {error ? (
            <AdaptiveCard style={styles.errorCard} backgroundColor="rgba(231, 76, 60, 0.15)">
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => { setError(''); scannedRef.current = false; }}>
                <Text style={styles.errorRetry}>Try again</Text>
              </TouchableOpacity>
            </AdaptiveCard>
          ) : null}

          {loading ? (
            <AdaptiveButton
              title="Joining..."
              onPress={() => {}}
              loading
              color={ACCENT}
              style={{ alignSelf: 'stretch', marginHorizontal: 24 }}
            />
          ) : (
            <TouchableOpacity style={styles.manualBtn} onPress={() => setMode('manual')}>
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
  centered: {
    flex: 1,
    backgroundColor: colors.neutral,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
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
  manualContainer: { flex: 1, backgroundColor: colors.neutral },
  manualContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
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
  },
  altLink: { marginTop: 20, paddingVertical: 8 },
  altLinkText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: ACCENT,
  },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  overlaySection: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  bottomSection: { justifyContent: 'flex-start', paddingTop: 24 },
  scanRow: { flexDirection: 'row', height: SCAN_AREA_SIZE },
  overlayFill: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  scanArea: { width: SCAN_AREA_SIZE, height: SCAN_AREA_SIZE },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#FFFFFF' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
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
  successContent: { alignItems: 'center', paddingHorizontal: 32 },
  successCheckCircle: { marginBottom: 20 },
  successTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 24,
    color: colors.textDark,
    marginBottom: 10,
  },
  successSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textMuted,
    textAlign: 'center',
  },
  successPatientName: {
    fontFamily: typography.fontFamily.bold,
    color: ACCENT,
  },
});
