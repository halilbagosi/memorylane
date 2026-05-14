import React, { ReactNode } from 'react';
import { View, StyleSheet, Platform, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';

interface AdaptiveCardProps {
  children: ReactNode;
  style?: ViewStyle;
  backgroundColor?: string;
}

export function AdaptiveCard({ children, style, backgroundColor }: AdaptiveCardProps) {
  const isIOS = Platform.OS === 'ios';

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

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.neutralLight,
    overflow: 'hidden',
  },

  ios: {
    borderRadius: 24,
    backgroundColor: colors.neutralLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
  },

  android: {
    borderRadius: 28,
    backgroundColor: colors.neutralLight,
    elevation: 1,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
