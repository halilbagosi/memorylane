import React, { ReactNode, useCallback, useState } from 'react';
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
import { colors } from '../theme/colors';
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
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          spellCheck={false}
          onFocus={handleFocus}
          onBlur={handleBlur}
          cursorColor={isIOS ? undefined : colors.secondary}
          selectionColor={isIOS ? undefined : colors.secondary + '40'}
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

const styles = StyleSheet.create({
  container: {
    marginBottom: 18,
  },
  label: {
    fontFamily: typography.fontFamily.medium,
    color: colors.textDark,
    marginBottom: 6,
  },
  iosLabel: {
    fontSize: 14,
  },
  androidLabel: {
    fontSize: 13,
    letterSpacing: 0.2,
    color: colors.textMuted,
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  iosInputWrapper: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.12)',
    borderRadius: 14,
  },
  androidInputWrapper: {
    backgroundColor: colors.neutralLight,
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 16,
  },
  androidInputWrapperFocused: {
    borderColor: colors.secondary,
  },
  inputError: {
    borderColor: '#C0392B',
  },

  input: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 16,
    color: colors.textDark,
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
    color: colors.textMuted,
  },

  errorText: {
    color: '#C0392B',
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    marginTop: 4,
  },
});
