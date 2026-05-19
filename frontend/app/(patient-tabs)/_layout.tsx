import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { Tabs, useNavigation } from 'expo-router';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { CommonActions } from '@react-navigation/native';
import { colors } from '../../src/theme/colors';
import { AppIcon } from '../../src/components/AppIcon';
import { M3TabBar } from '../../src/components/M3TabBar';
import { getPatientInfo, deletePatientInfo } from '../../src/utils/auth';
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
  return (
    <NativeTabs tintColor={colors.primary}>
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
  return (
    <Tabs
      tabBar={(props) => <M3TabBar {...props} accentColor={colors.primary} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.neutral },
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const sendCurrentLocation = async () => {
      const patient = await getPatientInfo();
      if (!patient?.locationShareToken || cancelled) return;

      try {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        await fetch(`${API_BASE_URL}/patients/${patient.id}/location`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            capturedAt: new Date(position.timestamp).toISOString(),
            locationShareToken: patient.locationShareToken,
          }),
        });
      } catch {
        // Location is best-effort; the patient app should continue working without it.
      }
    };

    const startLocationSharing = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== Location.PermissionStatus.GRANTED || cancelled) return;

        await sendCurrentLocation();
        locationIntervalRef.current = setInterval(sendCurrentLocation, LOCATION_INTERVAL_MS);
      } catch {
        // Permission prompts and GPS availability vary by device.
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
        (navigation as any).navigate('quiz');
      }
    });
    return () => subscription.remove();
  }, [navigation]);

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
