import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { colors } from '../../src/theme/colors';
import { AppIcon } from '../../src/components/AppIcon';
import { M3TabBar } from '../../src/components/M3TabBar';

function IOSTabLayout() {
  return (
    <NativeTabs tintColor={colors.secondary}>
      <NativeTabs.Trigger name="patients">
        <Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} />
        <Label>Patients</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="analytics">
        <Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
        <Label>Analytics</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function AndroidTabLayout() {
  return (
    <Tabs
      tabBar={(props) => <M3TabBar {...props} accentColor={colors.secondary} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.neutral },
      }}
    >
      <Tabs.Screen
        name="patients"
        options={{
          title: 'Patients',
          tabBarIcon: ({ color, size }) => (
            <AppIcon
              iosName="person.2.fill"
              androidFallback="P"
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color, size }) => (
            <AppIcon
              iosName="chart.bar.fill"
              androidFallback="A"
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

export default function CaregiverTabsLayout() {
  return Platform.OS === 'ios' ? <IOSTabLayout /> : <AndroidTabLayout />;
}
