import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Tabs, useNavigation } from 'expo-router';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { CommonActions } from '@react-navigation/native';
import { colors } from '../../src/theme/colors';
import { AppIcon } from '../../src/components/AppIcon';
import { M3TabBar } from '../../src/components/M3TabBar';
import { getPatientInfo, deletePatientInfo } from '../../src/utils/auth';
import { API_BASE_URL } from '../../src/config/api';

const POLL_INTERVAL_MS = 15000;

function IOSTabLayout() {
  return (
    <NativeTabs tintColor={colors.primary}>
      <NativeTabs.Trigger name="quiz">
        <Icon sf={{ default: 'questionmark.circle', selected: 'questionmark.circle.fill' }} />
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
              iosName="questionmark.circle.fill"
              androidFallback="Q"
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

  useEffect(() => {
    const checkPairing = async () => {
      const patient = await getPatientInfo();
      if (!patient) return;

      try {
        const res = await fetch(`${API_BASE_URL}/patients/${patient.id}/paired-status`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.paired) {
          await deletePatientInfo();
          navigation.dispatch(
            CommonActions.reset({ index: 0, routes: [{ name: 'index' }] })
          );
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

  return Platform.OS === 'ios' ? <IOSTabLayout /> : <AndroidTabLayout />;
}
