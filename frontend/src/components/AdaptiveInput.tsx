import React, { ReactNode, useCallback, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  Platform,
  TextInputProps,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import { colors, lightColors, darkColors } from '../theme/colors';
import { typography } from '../theme/typography';

interface AdaptiveInputProps extends TextInputProps {
  label: string;
  error?: string;
  containerStyle?: ViewStyle;
  suffix?: {
    text?: string;
    icon?: ReactNode;
    onPress: () => void;
  };
}

export function AdaptiveInput({
  label,
  error,
  containerStyle,
  suffix,
  style,
  onFocus,
  onBlur,
  ...inputProps
}: AdaptiveInputProps) {
  const isIOS = Platform.OS === 'ios';
  const [isFocused, setIsFocused] = useState(false);
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);

  const handleFocus = useCallback((e: any) => {
    if (!isIOS) setIsFocused(true);
    onFocus?.(e);
  }, [onFocus, isIOS]);

  const handleBlur = useCallback((e: any) => {
    if (!isIOS) setIsFocused(false);
    onBlur?.(e);
  }, [onBlur, isIOS]);

  const wrapperStyles = [
    styles.inputWrapper,
    isIOS ? styles.iosInputWrapper : styles.androidInputWrapper,
    !isIOS && isFocused && styles.androidInputWrapperFocused,
    error && styles.inputError,
  ];

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={[styles.label, isIOS ? styles.iosLabel : styles.androidLabel]}>
        {label}
      </Text>
      <View style={wrapperStyles}>
        <TextInput
          style={[
            styles.input,
            isIOS ? styles.iosInput : styles.androidInput,
            { flex: 1 },
            style,
          ]}
          placeholderTextColor={themeColors.textMuted}
          autoCorrect={false}
          spellCheck={false}
          onFocus={handleFocus}
          onBlur={handleBlur}
          cursorColor={isIOS ? undefined : themeColors.secondary}
          selectionColor={isIOS ? undefined : themeColors.secondary + '40'}
          {...inputProps}
        />
        {suffix && (
          <TouchableOpacity style={styles.suffixBtn} onPress={suffix.onPress}>
            {suffix.icon ? suffix.icon : (
              <Text style={styles.suffixText}>{suffix.text}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const getStyles = (isDark: boolean) => {
  const themeColors = isDark ? darkColors : lightColors;
  return StyleSheet.create({
  container: {
    marginBottom: 18,
  },
  label: {
    fontFamily: typography.fontFamily.medium,
    color: themeColors.textDark,
    marginBottom: 6,
  },
  iosLabel: {
    fontSize: 14,
  },
  androidLabel: {
    fontSize: 13,
    letterSpacing: 0.2,
    color: themeColors.textMuted,
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  iosInputWrapper: {
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.05)' : 'rgba(255, 255, 255, 0.5)'),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0, 0, 0, 0.12)'),
    borderRadius: 14,
  },
  androidInputWrapper: {
    backgroundColor: themeColors.neutralLight,
    borderWidth: 2,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0, 0, 0, 0.08)'),
    borderRadius: 16,
  },
  androidInputWrapperFocused: {
    borderColor: themeColors.secondary,
  },
  inputError: {
    borderColor: (isDark ? '#FFB4A8' : '#C0392B'),
  },

  input: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 16,
    color: themeColors.textDark,
  },
  iosInput: {
    padding: 16,
  },
  androidInput: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  suffixBtn: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suffixText: {
    fontSize: 13,
    fontFamily: typography.fontFamily.medium,
    color: themeColors.textMuted,
  },

  errorText: {
    color: (isDark ? '#FFB4A8' : '#C0392B'),
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    marginTop: 4,
  },
});
};
// Styles are created per-render based on `isDark` via useTheme
