import React from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { View, Text, StyleSheet, Platform, ViewStyle } from 'react-native';
import { colors, lightColors, darkColors } from '../theme/colors';
import { typography } from '../theme/typography';

interface AdaptiveBadgeProps {
  label: string;
  color?: string;
  backgroundColor?: string;
  style?: ViewStyle;
}

export function AdaptiveBadge({
  label,
  color,
  backgroundColor,
  style,
}: AdaptiveBadgeProps) {
  const isIOS = Platform.OS === 'ios';
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  const resolvedColor = color ?? themeColors.textDark;
  const bg = backgroundColor ?? (isDark ? themeColors.glassCardBg : 'rgba(0,0,0,0.06)');

  return (
    <View
      style={[
        styles.base,
        isIOS ? styles.ios : styles.android,
        { backgroundColor: bg },
        style,
      ]}
    >
      <Text style={[styles.label, isIOS ? styles.iosLabel : styles.androidLabel, { color: resolvedColor }]}> 
        {label}
      </Text>
    </View>
  );
}

const getStyles = (isDark: boolean) => {
  const themeColors = isDark ? darkColors : lightColors;
  return StyleSheet.create({
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
};
// Styles resolved at render time via `useTheme()` in the component
