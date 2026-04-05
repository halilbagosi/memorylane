import React, { ReactNode } from 'react';
import { View, StyleSheet, Platform, ViewStyle } from 'react-native';

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
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },

  ios: {
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },

  android: {
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    elevation: 1,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
});
