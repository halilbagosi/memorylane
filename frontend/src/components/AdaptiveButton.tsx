import React from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  Pressable,
  Text,
  StyleSheet,
  Platform,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import { colors, lightColors, darkColors } from '../theme/colors';
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
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  const isIOS = Platform.OS === 'ios';
  const baseColor = color || themeColors.secondary;

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
            color={variant === 'filled' ? themeColors.textLight : baseColor}
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
          color={variant === 'filled' ? themeColors.textLight : baseColor}
          style={{ marginRight: 8 }}
        />
      )}
      <Text style={labelStyles}>
        {loading && loadingText ? loadingText : title}
      </Text>
    </Pressable>
  );
}

const getStyles = (isDark: boolean) => {
  const themeColors = isDark ? darkColors : lightColors;
  return StyleSheet.create({
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
    backgroundColor: themeColors.glassCardBg,
    borderWidth: 1,
  },
  iosDanger: {
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(231, 76, 60, 0.12)'),
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
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(231, 76, 60, 0.08)'),
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
    color: themeColors.textDark,
  },
  iosLabel: {
    letterSpacing: 0.2,
  },
  androidLabel: {
    letterSpacing: 0.3,
    fontSize: 15,
  },
  filledLabel: {
    color: isDark ? '#0E1712' : themeColors.textLight,
  },
  dangerLabel: {
    color: (isDark ? '#FFB4A8' : '#C0392B'),
  },
});
};
// Styles are computed per-render via `getStyles(isDark)` inside the component
