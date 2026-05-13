import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  Platform,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type ButtonVariant = 'filled' | 'outlined' | 'ghost' | 'danger';

interface AdaptiveButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
  color?: string;
}

export function AdaptiveButton({
  title,
  onPress,
  variant = 'filled',
  disabled = false,
  loading = false,
  loadingText,
  style,
  textStyle,
  color,
}: AdaptiveButtonProps) {
  const isIOS = Platform.OS === 'ios';
  const baseColor = color || colors.secondary;

  const containerStyles: ViewStyle[] = [
    styles.base,
    isIOS ? styles.iosBase : styles.androidBase,
    variant === 'filled'
      ? { backgroundColor: baseColor, ...(isIOS ? styles.iosFilled : styles.androidFilled) }
      : undefined,
    variant === 'outlined'
      ? { ...styles.outlined, borderColor: baseColor, ...(isIOS ? styles.iosOutlined : styles.androidOutlined) }
      : undefined,
    variant === 'ghost' ? styles.ghost : undefined,
    variant === 'danger'
      ? (isIOS ? styles.iosDanger : styles.androidDanger)
      : undefined,
    (disabled || loading) ? styles.disabled : undefined,
    style,
  ].filter(Boolean) as ViewStyle[];

  const labelStyles: TextStyle[] = [
    styles.label,
    isIOS ? styles.iosLabel : styles.androidLabel,
    variant === 'filled' ? styles.filledLabel : undefined,
    variant === 'outlined' ? { color: baseColor } : undefined,
    variant === 'ghost' ? { color: baseColor } : undefined,
    variant === 'danger' ? styles.dangerLabel : undefined,
    textStyle,
  ].filter(Boolean) as TextStyle[];

  if (isIOS) {
    return (
      <Pressable
        style={({ pressed }) => [
          ...containerStyles,
          pressed && { opacity: 0.7 },
        ]}
        onPress={onPress}
        disabled={disabled || loading}
      >
        {loading && (
          <ActivityIndicator
            size="small"
            color={variant === 'filled' ? colors.textLight : baseColor}
            style={{ marginRight: 8 }}
          />
        )}
        <Text style={labelStyles}>
          {loading && loadingText ? loadingText : title}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        ...containerStyles,
        pressed && styles.androidPressed,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      android_ripple={{
        color: variant === 'filled'
          ? 'rgba(255,255,255,0.2)'
          : baseColor + '18',
        borderless: false,
      }}
    >
      {loading && (
        <ActivityIndicator
          size="small"
          color={variant === 'filled' ? colors.textLight : baseColor}
          style={{ marginRight: 8 }}
        />
      )}
      <Text style={labelStyles}>
        {loading && loadingText ? loadingText : title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    overflow: 'hidden',
  },

  iosBase: {
    borderRadius: 20,
  },
  iosFilled: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  iosOutlined: {
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderWidth: 1,
  },
  iosDanger: {
    backgroundColor: 'rgba(231, 76, 60, 0.12)',
    borderRadius: 20,
  },

  androidBase: {
    borderRadius: 28,
  },
  androidFilled: {
    elevation: 2,
  },
  androidOutlined: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderRadius: 28,
  },
  androidDanger: {
    backgroundColor: 'rgba(231, 76, 60, 0.08)',
    borderRadius: 28,
  },
  androidPressed: {
    transform: [{ scale: 0.98 }],
  },

  outlined: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.5,
  },

  label: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
  },
  iosLabel: {
    letterSpacing: 0.2,
  },
  androidLabel: {
    letterSpacing: 0.3,
    fontSize: 15,
  },
  filledLabel: {
    color: colors.textLight,
  },
  dangerLabel: {
    color: '#C0392B',
  },
});
