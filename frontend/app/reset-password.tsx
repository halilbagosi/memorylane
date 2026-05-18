import React, { useState } from 'react';
import { useTheme } from '../src/theme/ThemeProvider';
import {
    View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, lightColors, darkColors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { API_BASE_URL } from '../src/config/api';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AdaptiveButton } from '../src/components/AdaptiveButton';
import { AdaptiveInput } from '../src/components/AdaptiveInput';
import { AppIcon } from '../src/components/AppIcon';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const isIOS = Platform.OS === 'ios';

export default function ResetPasswordScreen() {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
    const router = useRouter();
    const { email: emailParam } = useLocalSearchParams<{ email: string }>();

    const [resetCode, setResetCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [apiError, setApiError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleReset = async () => {
        setApiError('');

        if (!resetCode || resetCode.length !== 6) {
            setApiError('Please enter the 6-digit code from your email.');
            return;
        }
        if (!newPassword || newPassword.length < 6) {
            setApiError('Password must be at least 6 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setApiError('Passwords do not match.');
            return;
        }

        setIsLoading(true);

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: emailParam,
                    resetCode,
                    newPassword,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeout);
            const data = await response.json();

            if (!response.ok) {
                const msg = Array.isArray(data.message) ? data.message.join('\n') : data.message;
                throw new Error(msg || 'Something went wrong.');
            }

            setSuccess(true);
        } catch (error: any) {
            if (error.name === 'AbortError') {
                setApiError('Connection timed out. Is the backend running?');
            } else {
                setApiError(error.message || 'Failed to connect to the backend');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // ── Success state ──────────────────────────────────────────────────────────
    if (success) {
        return (
            <SafeAreaView style={styles.safeArea} edges={['bottom']}>
                <KeyboardAvoidingView behavior={isIOS ? 'padding' : 'height'} style={styles.container}>
                    <ScrollView
                        contentContainerStyle={[styles.scrollContent, { alignItems: 'center' }]}
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.topSpacer} />

                        <View style={styles.successIconWrap}>
                            <AppIcon iosName="checkmark.circle.fill" androidFallback="✓" size={48} color="#4A7A5A" />
                        </View>

                        <Text style={styles.headline}>Password Reset!</Text>
                        <Text style={styles.subheadline}>
                            Your password has been changed successfully. You can now log in with your new password.
                        </Text>

                        <AdaptiveButton
                            title="Go to Login"
                            onPress={() => router.replace('/login')}
                            style={{ marginTop: 28, width: '100%' }}
                        />

                        <View style={styles.bottomSpacer} />
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        );
    }

    // ── Reset form ─────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
            <KeyboardAvoidingView behavior={isIOS ? 'padding' : 'height'} style={styles.container}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.topSpacer} />

                    <Text style={styles.headline}>Reset Password</Text>
                    <Text style={styles.subheadline}>
                        Enter the 6-digit code sent to{' '}
                        <Text style={{ fontFamily: typography.fontFamily.bold, color: themeColors.textDark }}>
                            {emailParam}
                        </Text>{' '}
                        and choose a new password.
                    </Text>

                    <AdaptiveInput
                        label="Reset Code"
                        onChangeText={setResetCode}
                        placeholder="000000"
                        keyboardType="number-pad"
                        maxLength={6}
                    />

                    <AdaptiveInput
                        label="New Password"
                        onChangeText={setNewPassword}
                        placeholder="At least 6 characters"
                        secureTextEntry={!showPassword}
                        suffix={{
                            icon: (
                                <AppIcon
                                    iosName={showPassword ? 'eye.slash' : 'eye'}
                                    androidFallback={showPassword ? 'Hide' : 'Show'}
                                    size={20}
                                    color={themeColors.textMuted}
                                />
                            ),
                            onPress: () => setShowPassword(!showPassword),
                        }}
                    />

                    <AdaptiveInput
                        label="Confirm Password"
                        onChangeText={setConfirmPassword}
                        placeholder="Re-enter your new password"
                        secureTextEntry={!showPassword}
                    />

                    {apiError ? <Text style={styles.apiErrorText}>{apiError}</Text> : null}

                    <AdaptiveButton
                        title="Reset Password"
                        onPress={handleReset}
                        loading={isLoading}
                        loadingText="Resetting..."
                        style={{ marginTop: 8 }}
                    />

                    <AdaptiveButton
                        title="Back"
                        variant="ghost"
                        onPress={() => router.back()}
                        style={{ marginTop: 16 }}
                        textStyle={styles.ghostText}
                    />

                    <View style={styles.bottomSpacer} />
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const getStyles = (isDark: boolean) => {
  const themeColors = isDark ? darkColors : lightColors;
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: themeColors.neutral },
    container: { flex: 1 },
    scrollContent: {
        paddingHorizontal: 24,
        flexGrow: 1,
    },
    topSpacer: { height: SCREEN_HEIGHT * 0.10 },
    bottomSpacer: { height: SCREEN_HEIGHT * 0.06 },

    headline: {
        fontFamily: typography.fontFamily.bold,
        fontSize: 28,
        color: themeColors.textDark,
        marginBottom: 6,
        textAlign: 'center',
    },
    subheadline: {
        fontFamily: typography.fontFamily.regular,
        fontSize: 15,
        color: themeColors.textMuted,
        marginBottom: SCREEN_HEIGHT * 0.03,
        textAlign: 'center',
        lineHeight: 22,
    },
    apiErrorText: {
        color: (isDark ? '#FFB4A8' : '#C0392B'),
        fontFamily: typography.fontFamily.regular,
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 12,
    },
    ghostText: {
        fontFamily: typography.fontFamily.medium,
        fontSize: 14,
        color: themeColors.textMuted,
        textTransform: 'none',
        letterSpacing: 0,
    },
    successIconWrap: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(74, 122, 90, 0.1)'),
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
});
};
// styles are computed at render time via `useTheme()` inside the component
