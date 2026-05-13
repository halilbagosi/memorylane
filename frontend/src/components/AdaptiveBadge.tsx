import React from 'react';
import { View, Text, StyleSheet, Platform, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface AdaptiveBadgeProps {
  label: string;
  color?: string;
  backgroundColor?: string;
  style?: ViewStyle;
}

export function AdaptiveBadge({
  label,
  color = colors.textDark,
  backgroundColor,
  style,
}: AdaptiveBadgeProps) {
  const isIOS = Platform.OS === 'ios';
  const bg = backgroundColor || 'rgba(0,0,0,0.06)';

  return (
    <View
      style={[
        styles.base,
        isIOS ? styles.ios : styles.android,
        { backgroundColor: bg },
        style,
      ]}
    >
      <Text style={[styles.label, isIOS ? styles.iosLabel : styles.androidLabel, { color }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  ios: {
    borderRadius: 20,
  },
  android: {
    borderRadius: 16,
  },
  label: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
  },
  iosLabel: {},
  androidLabel: {
    letterSpacing: 0.2,
  },
});
