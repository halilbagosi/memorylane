import React, { useState } from 'react';
import {
    View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { API_BASE_URL } from '../src/config/api';
import { useRouter } from 'expo-router';
import { AdaptiveButton } from '../src/components/AdaptiveButton';
import { AdaptiveInput } from '../src/components/AdaptiveInput';
import { AppIcon } from '../src/components/AppIcon';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const isIOS = Platform.OS === 'ios';

export default function ForgotPasswordScreen() {
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [apiError, setApiError] = useState('');
    const [sent, setSent] = useState(false);

    const handleSendCode = async () => {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed) {
            setApiError('Please enter your email address.');
            return;
        }

        setIsLoading(true);
        setApiError('');

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: trimmed }),
                signal: controller.signal,
            });

            clearTimeout(timeout);
            const data = await response.json();

            if (!response.ok) {
                const msg = Array.isArray(data.message) ? data.message.join('\n') : data.message;
                throw new Error(msg || 'Something went wrong.');
            }

            setSent(true);
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
    if (sent) {
        return (
            <SafeAreaView style={styles.safeArea} edges={['bottom']}>
                <KeyboardAvoidingView behavior={isIOS ? 'padding' : 'height'} style={styles.container}>
                    <ScrollView
                        contentContainerStyle={[styles.scrollContent, { alignItems: 'center' }]}
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.topSpacer} />

                        <View style={styles.sentIconWrap}>
                            <AppIcon iosName="envelope.badge.fill" androidFallback="✉️" size={44} color={colors.primary} />
                        </View>

                        <Text style={styles.headline}>Check Your Email</Text>
                        <Text style={styles.subheadline}>
                            We've sent a 6-digit reset code to{' '}
                            <Text style={{ fontFamily: typography.fontFamily.bold, color: colors.textDark }}>
                                {email.trim().toLowerCase()}
                            </Text>
                            . It expires in 15 minutes.
                        </Text>

                        <AdaptiveButton
                            title="Enter Reset Code"
                            onPress={() =>
                                router.push({
                                    pathname: '/reset-password',
                                    params: { email: email.trim().toLowerCase() },
                                })
                            }
                            style={{ marginTop: 28, width: '100%' }}
                        />

                        <AdaptiveButton
                            title="Resend Code"
                            variant="ghost"
                            onPress={() => {
                                setSent(false);
                                setApiError('');
                            }}
                            style={{ marginTop: 12 }}
                            textStyle={styles.ghostText}
                        />

                        <View style={styles.bottomSpacer} />
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        );
    }

    // ── Email entry screen ─────────────────────────────────────────────────────
    return (
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
            <KeyboardAvoidingView behavior={isIOS ? 'padding' : 'height'} style={styles.container}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.topSpacer} />

                    <Text style={styles.headline}>Forgot Password?</Text>
                    <Text style={styles.subheadline}>
                        Enter the email associated with your account and we'll send you a reset code.
                    </Text>

                    <AdaptiveInput
                        label="Email Address"
                        onChangeText={setEmail}
                        placeholder="example@email.com"
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />

                    {apiError ? <Text style={styles.apiErrorText}>{apiError}</Text> : null}

                    <AdaptiveButton
                        title="Send Reset Code"
                        onPress={handleSendCode}
                        loading={isLoading}
                        loadingText="Sending..."
                        style={{ marginTop: 8 }}
                    />

                    <AdaptiveButton
                        title="Back to Login"
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

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.neutral },
    container: { flex: 1 },
    scrollContent: {
        paddingHorizontal: 24,
        flexGrow: 1,
    },
    topSpacer: { height: SCREEN_HEIGHT * 0.12 },
    bottomSpacer: { height: SCREEN_HEIGHT * 0.06 },

    headline: {
        fontFamily: typography.fontFamily.bold,
        fontSize: 28,
        color: colors.textDark,
        marginBottom: 6,
        textAlign: 'center',
    },
    subheadline: {
        fontFamily: typography.fontFamily.regular,
        fontSize: 15,
        color: colors.textMuted,
        marginBottom: SCREEN_HEIGHT * 0.04,
        textAlign: 'center',
        lineHeight: 22,
    },
    apiErrorText: {
        color: '#C0392B',
        fontFamily: typography.fontFamily.regular,
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 12,
    },
    ghostText: {
        fontFamily: typography.fontFamily.medium,
        fontSize: 14,
        color: colors.textMuted,
        textTransform: 'none',
        letterSpacing: 0,
    },
    sentIconWrap: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: 'rgba(30, 77, 48, 0.08)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
});
