import { colors, lightColors, darkColors } from '../theme/colors';
import React, { ReactNode } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { View, StyleSheet, Platform, ViewStyle } from 'react-native';

interface AdaptiveCardProps {
  children: ReactNode;
  style?: ViewStyle;
  backgroundColor?: string;
}

export function AdaptiveCard({ children, style, backgroundColor }: AdaptiveCardProps) {
  const isIOS = Platform.OS === 'ios';
  const { isDark } = useTheme();
  const styles = getStyles(isDark);

  return (
    <View
      style={[
        styles.base,
        isIOS ? styles.ios : styles.android,
        backgroundColor ? { backgroundColor } : undefined,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const getStyles = (isDark: boolean) => {
  const themeColors = isDark ? darkColors : lightColors;
  return StyleSheet.create({
  base: {
    backgroundColor: themeColors.neutralLight,
    overflow: 'hidden',
  },

  ios: {
    borderRadius: 24,
    backgroundColor: themeColors.glassCardBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: themeColors.glassBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },

  android: {
    borderRadius: 28,
    backgroundColor: themeColors.neutralLight,
    elevation: 1,
    borderWidth: 1,
    borderColor: themeColors.glassBorder,
  },
});
};
// Styles are resolved per-render via `getStyles(isDark)` inside the component
