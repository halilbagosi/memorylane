import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { colors } from '../../src/theme/colors';
import { AppIcon } from '../../src/components/AppIcon';
import { M3TabBar } from '../../src/components/M3TabBar';

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
  return Platform.OS === 'ios' ? <IOSTabLayout /> : <AndroidTabLayout />;
}
