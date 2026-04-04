import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { API_BASE_URL } from '../src/config/api';
import { useRouter } from 'expo-router';
import { getToken } from '../src/utils/auth';

export default function AddPatientScreen() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [age, setAge] = useState('');
  const [errors, setErrors] = useState<{ name?: string; surname?: string; age?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // Load token from SecureStore
  useEffect(() => {
    (async () => {
      const storedToken = await getToken();
      if (!storedToken) {
        router.replace('/login');
        return;
      }
      setToken(storedToken);
    })();
  }, []);

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

  const handleAgeChange = (text: string) => {
    // Only allow digits
    if (/^\d*$/.test(text)) {
      setAge(text);
      const num = parseInt(text, 10);
      if (text && (num < 1 || num > 120)) {
        setErrors(prev => ({ ...prev, age: 'Age must be between 1 and 120.' }));
      } else {
        setErrors(prev => ({ ...prev, age: undefined }));
      }
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !surname.trim() || !age) {
      setApiError('Please fill in all fields.');
      return;
    }

    const ageNum = parseInt(age, 10);
    if (ageNum < 1 || ageNum > 120) {
      setApiError('Age must be between 1 and 120.');
      return;
    }

    setIsLoading(true);
    setApiError('');

    try {
      const response = await fetch(`${API_BASE_URL}/patients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          surname: surname.trim(),
          age: ageNum,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const msg = Array.isArray(data.message) ? data.message.join('\n') : data.message;
        throw new Error(msg || 'Failed to create patient');
      }

      // Show join code
      Alert.alert(
        'Patient Created',
        `Join Code: ${data.patient?.patientJoinCode || 'N/A'}\n\nShare this code with the patient's device to pair them.`,
        [{ text: 'Go to Dashboard', onPress: () => router.back() }]
      );
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
          <Text style={styles.headline}>Add a Patient</Text>
          <Text style={styles.subheadline}>
            Create a profile for your loved one.{'\n'}You will become their primary caregiver.
          </Text>

          {/* Name */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>First Name</Text>
            <TextInput
              style={[styles.input, errors.name ? styles.inputError : null]}
              value={name}
              onChangeText={handleNameChange}
              placeholder="Enter the patient's first name"
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
              placeholder="Enter the patient's last name"
              placeholderTextColor={colors.textMuted}
            />
            {errors.surname && <Text style={styles.errorText}>{errors.surname}</Text>}
          </View>

          {/* Age */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Age</Text>
            <TextInput
              style={[styles.input, errors.age ? styles.inputError : null]}
              value={age}
              onChangeText={handleAgeChange}
              placeholder="e.g. 75"
              keyboardType="number-pad"
              placeholderTextColor={colors.textMuted}
            />
            {errors.age && <Text style={styles.errorText}>{errors.age}</Text>}
          </View>

          {apiError ? <Text style={styles.apiErrorText}>{apiError}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryButton, isLoading && { opacity: 0.7 }]}
            onPress={handleSubmit}
            activeOpacity={0.8}
            disabled={isLoading}
          >
            <Text style={styles.primaryButtonText}>{isLoading ? 'Creating Profile...' : 'Create Patient'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.neutral },
  container: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
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
    lineHeight: 22,
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
});
