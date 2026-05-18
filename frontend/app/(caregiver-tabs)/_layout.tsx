import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { syncCaregiverPushToken } from '../../src/services/syncPushToken';
import { Tabs } from 'expo-router';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { useTheme } from '../../src/theme/ThemeProvider';
import { AppIcon } from '../../src/components/AppIcon';
import { M3TabBar } from '../../src/components/M3TabBar';

function IOSTabLayout() {
  const { colors: themeColors } = useTheme();
  return (
    <NativeTabs tintColor={themeColors.secondary}>
      <NativeTabs.Trigger name="patients">
        <Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} />
        <Label>Patients</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="inbox">
        <Icon sf={{ default: 'tray', selected: 'tray.fill' }} />
        <Label>Inbox</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="create">
        <Icon sf={{ default: 'plus.app', selected: 'plus.app.fill' }} />
        <Label>Create</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="analytics">
        <Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
        <Label>Progress</Label>
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
        name="patients"
        options={{
          title: 'Patients',
          tabBarIcon: ({ color, size }) => (
            <AppIcon iosName="person.2.fill" androidFallback="P" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color, size }) => (
            <AppIcon iosName="tray.fill" androidFallback="I" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarIcon: ({ color, size }) => (
            <AppIcon iosName="plus.app.fill" androidFallback="+" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color, size }) => (
            <AppIcon iosName="chart.bar.fill" androidFallback="📊" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

export default function CaregiverTabsLayout() {
  useEffect(() => {
    syncCaregiverPushToken().catch(() => undefined);
  }, []);

  return Platform.OS === 'ios' ? <IOSTabLayout /> : <AndroidTabLayout />;
}
