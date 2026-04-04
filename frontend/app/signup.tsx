import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { API_BASE_URL } from '../src/config/api';
import { useRouter } from 'expo-router';

export default function SignupScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [errors, setErrors] = useState<{ name?: string; surname?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const handleNameChange = (text: string) => {
    if (/^[a-zA-Z\s]*$/.test(text)) {
      setName(text);
      setErrors(prev => ({ ...prev, name: undefined }));
    } else {
      setErrors(prev => ({ ...prev, name: 'Only letters and spaces are allowed.' }));
    }
  };

  const handleSurnameChange = (text: string) => {
    if (/^[a-zA-Z\s]*$/.test(text)) {
      setSurname(text);
      setErrors(prev => ({ ...prev, surname: undefined }));
    } else {
      setErrors(prev => ({ ...prev, surname: 'Only letters and spaces are allowed.' }));
    }
  };

  const handleSignup = async () => {
    if (!name.trim() || !surname.trim() || !email || !password) {
      setApiError('Please fill in all fields correctly.');
      return;
    }

    setIsLoading(true);
    setApiError('');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          surname: surname.trim(),
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const msg = Array.isArray(data.message) ? data.message.join('\n') : data.message;
        throw new Error(msg || 'Something went wrong during signup');
      }

      // Signup succeeded — go to login
      router.replace('/login');
    } catch (error: any) {
      setApiError(error.message || 'Failed to connect to the backend');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.headline}>Create Your Account</Text>
          <Text style={styles.subheadline}>Join MemoryLane as a caregiver.</Text>

          {/* Name */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>First Name</Text>
            <TextInput
              style={[styles.input, errors.name ? styles.inputError : null]}
              value={name}
              onChangeText={handleNameChange}
              placeholder="Enter your first name"
              placeholderTextColor={colors.textMuted}
            />
            {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
          </View>

          {/* Surname */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Last Name</Text>
            <TextInput
              style={[styles.input, errors.surname ? styles.inputError : null]}
              value={surname}
              onChangeText={handleSurnameChange}
              placeholder="Enter your last name"
              placeholderTextColor={colors.textMuted}
            />
            {errors.surname && <Text style={styles.errorText}>{errors.surname}</Text>}
          </View>

          {/* Email */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="example@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {/* Password with eye toggle */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder="Min 8 chars, upper + lower + number"
                secureTextEntry={!showPassword}
                placeholderTextColor={colors.textMuted}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {apiError ? <Text style={styles.apiErrorText}>{apiError}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryButton, isLoading && { opacity: 0.7 }]}
            onPress={handleSignup}
            activeOpacity={0.8}
            disabled={isLoading}
          >
            <Text style={styles.primaryButtonText}>{isLoading ? 'Creating Account...' : 'Sign Up'}</Text>
          </TouchableOpacity>

          {/* Link to login */}
          <TouchableOpacity onPress={() => router.push('/login')} style={styles.linkRow}>
            <Text style={styles.linkText}>Already have an account? </Text>
            <Text style={styles.linkTextBold}>Log In</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.neutral,
  },
  container: { flex: 1 },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  headline: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 26,
    color: colors.textDark,
    marginBottom: 6,
    marginTop: 8,
  },
  subheadline: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: colors.textMuted,
    marginBottom: 28,
  },
  formGroup: { marginBottom: 18 },
  label: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textDark,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.neutralLight,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 14,
    padding: 16,
    fontFamily: typography.fontFamily.regular,
    fontSize: 16,
    color: colors.textDark,
  },
  inputError: { borderColor: '#e74c3c' },
  errorText: {
    color: '#e74c3c',
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    marginTop: 4,
  },
  apiErrorText: {
    color: '#e74c3c',
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  /* Password field with eye */
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutralLight,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 14,
    overflow: 'hidden',
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    fontFamily: typography.fontFamily.regular,
    fontSize: 16,
    color: colors.textDark,
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeIcon: { fontSize: 20 },
  primaryButton: {
    backgroundColor: colors.secondary,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: colors.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryButtonText: {
    color: colors.textLight,
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  linkText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
  },
  linkTextBold: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.secondary,
  },
});
