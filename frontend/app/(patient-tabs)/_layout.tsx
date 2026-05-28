import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { Tabs, useNavigation, useRouter } from 'expo-router';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { CommonActions } from '@react-navigation/native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { AppIcon } from '../../src/components/AppIcon';
import { M3TabBar } from '../../src/components/M3TabBar';
import { getPatientInfo, savePatientInfo, deletePatientInfo } from '../../src/utils/auth';
import { API_BASE_URL } from '../../src/config/api';
import { PatientGreetingOverlay } from '../../src/components/PatientGreetingOverlay';
import {
  isPatientBiometricVerified,
  markPatientBiometricVerified,
  unlockPatientWithBiometrics,
} from '../../src/utils/patientBiometric';
import { addNotificationResponseListener } from '../../src/services/pushNotifications';
import { syncPatientDeviceToken } from '../../src/services/syncPushToken';

const POLL_INTERVAL_MS = 15000;
const LOCATION_INTERVAL_MS = 60000;

function IOSTabLayout() {
  const { colors: themeColors } = useTheme();
  return (
    <NativeTabs tintColor={themeColors.secondary}>
      <NativeTabs.Trigger name="quiz">
        <Icon sf={{ default: 'brain.head.profile', selected: 'brain.head.profile' }} />
        <Label>Quiz</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="relive">
        <Icon sf={{ default: 'photo.on.rectangle.angled', selected: 'photo.on.rectangle.angled' }} />
        <Label>Relive</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function AndroidTabLayout() {
  const { colors: themeColors } = useTheme();
  return (
    <Tabs
      tabBar={(props) => <M3TabBar {...props} accentColor={themeColors.secondary} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: themeColors.neutral },
      }}
    >
      <Tabs.Screen
        name="quiz"
        options={{
          title: 'Quiz',
          tabBarIcon: ({ color, size }) => (
            <AppIcon
              iosName="brain.head.profile"
              androidFallback="Brain"
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="relive"
        options={{
          title: 'Relive',
          tabBarIcon: ({ color, size }) => (
            <AppIcon
              iosName="photo.on.rectangle.angled"
              androidFallback="R"
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

export default function PatientTabsLayout() {
  const navigation = useNavigation();
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const sendCurrentLocation = async () => {
      let patient = await getPatientInfo();
      if (patient && !patient.locationShareToken && !cancelled) {
        try {
          const res = await fetch(`${API_BASE_URL}/patients/${patient.id}/paired-status`);
          if (res.ok) {
            const data = await res.json();
            if (data.locationShareToken) {
              patient = {
                ...patient,
                biometricRecoveryEnabled: data.biometricRecoveryEnabled ?? patient.biometricRecoveryEnabled,
                locationShareToken: data.locationShareToken,
              };
              await savePatientInfo(patient);
            }
          }
        } catch (error) {
          console.error('[Location] could not refresh location token', error);
        }
      }
      if (!patient?.locationShareToken || cancelled) {
        console.log('[Location] skipping sendCurrentLocation - token:', !!patient?.locationShareToken, 'cancelled:', cancelled);
        return;
      }

      try {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        console.log('[Location] got position', position.coords.latitude, position.coords.longitude);

        const res = await fetch(`${API_BASE_URL}/patients/${patient.id}/location`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            capturedAt: new Date(position.timestamp).toISOString(),
            locationShareToken: patient.locationShareToken,
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '<no body>');
          console.error('[Location] server responded with', res.status, text);
        } else {
          // Optional: log successful update
          try {
            const json = await res.json();
            console.log('[Location] server update ok', json);
          } catch {
            console.log('[Location] server update ok (no json)');
          }
        }
      } catch {
        // best-effort — network unavailable
      }
    };

    const startLocationSharing = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        console.log('[Location] requestForegroundPermissionsAsync status', status);
        if (status !== Location.PermissionStatus.GRANTED || cancelled) {
          console.log('[Location] permission not granted or cancelled; status:', status, 'cancelled:', cancelled);
          return;
        }

        await sendCurrentLocation();
        locationIntervalRef.current = setInterval(sendCurrentLocation, LOCATION_INTERVAL_MS);
      } catch (e) {
        console.error('[Location] startLocationSharing error', e);
      }
    };

    startLocationSharing();

    return () => {
      cancelled = true;
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    const subscription = addNotificationResponseListener((screen) => {
      if (screen === 'quiz') {
        router.push('/(patient-tabs)/quiz');
      }
    });
    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    const checkPairing = async () => {
      const patient = await getPatientInfo();
      if (!patient) return;

      try {
        const res = await fetch(`${API_BASE_URL}/patients/${patient.id}/paired-status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.paired) {
          syncPatientDeviceToken(patient.id).catch(() => undefined);
          if (data.locationShareToken && data.locationShareToken !== patient.locationShareToken) {
            await savePatientInfo({
              ...patient,
              biometricRecoveryEnabled: data.biometricRecoveryEnabled ?? patient.biometricRecoveryEnabled,
              locationShareToken: data.locationShareToken,
            });
          }
        }
        if (!data.paired) {
          await deletePatientInfo();
          navigation.dispatch(
            CommonActions.reset({ index: 0, routes: [{ name: 'index' }] })
          );
          return;
        }

        const requiresBiometric = data.biometricRecoveryEnabled || patient.biometricRecoveryEnabled;
        if (requiresBiometric && !isPatientBiometricVerified(patient.id)) {
          const unlocked = await unlockPatientWithBiometrics();
          if (!unlocked) {
            navigation.dispatch(
              CommonActions.reset({ index: 0, routes: [{ name: 'index' }] })
            );
            return;
          }
          markPatientBiometricVerified(patient.id);
        }
      } catch {
        // Network error — keep the patient in the app
      }
    };

    checkPairing();
    intervalRef.current = setInterval(checkPairing, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <>
      {Platform.OS === 'ios' ? <IOSTabLayout /> : <AndroidTabLayout />}
      <PatientGreetingOverlay />
    </>
  );
}
