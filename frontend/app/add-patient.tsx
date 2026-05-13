import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
  TouchableOpacity, Modal, Image, Alert, Linking, Animated, Easing,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { DatePickerModal } from 'react-native-paper-dates';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { API_BASE_URL } from '../src/config/api';
import { useRouter } from 'expo-router';
import { getToken } from '../src/utils/auth';
import { AdaptiveButton } from '../src/components/AdaptiveButton';
import { AdaptiveInput } from '../src/components/AdaptiveInput';
import { AdaptiveCard } from '../src/components/AdaptiveCard';
import { AppIcon } from '../src/components/AppIcon';
import { M3Dialog, type M3DialogAction } from '../src/components/M3Dialog';

const isIOS = Platform.OS === 'ios';

function formatDate(date: Date): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function calculateAge(birthday: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthday.getFullYear();
  const monthDiff = today.getMonth() - birthday.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthday.getDate())) {
    age--;
  }
  return age;
}

export default function AddPatientScreen() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>(undefined);
  const [showPicker, setShowPicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date(1950, 0, 1));
  const [errors, setErrors] = useState<{ name?: string; surname?: string; dateOfBirth?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // Backdrop animation for iOS date picker
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const [dialog, setDialog] = useState<{
    visible: boolean;
    title: string;
    body: string;
    actions: M3DialogAction[];
  }>({ visible: false, title: '', body: '', actions: [] });

  const showDialog = (title: string, body: string, actions: M3DialogAction[]) => {
    setDialog({ visible: true, title, body, actions });
  };
  const dismissDialog = () => setDialog((prev) => ({ ...prev, visible: false }));

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

  const pickAvatar = async (source: 'camera' | 'library') => {
    let result: ImagePicker.ImagePickerResult;

    if (source === 'camera') {
      const { status, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        if (!canAskAgain) {
          showDialog('Camera Access Required', 'Camera permission was denied. Please enable it in your device Settings.', [
            { label: 'Cancel', onPress: dismissDialog },
            { label: 'Open Settings', onPress: () => { dismissDialog(); Linking.openSettings(); } },
          ]);
        } else {
          showDialog('Permission needed', 'Camera access is required to take a photo.', [
            { label: 'OK', onPress: dismissDialog },
          ]);
        }
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.3,
        base64: true,
      });
    } else {
      const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        if (!canAskAgain) {
          showDialog('Photo Library Access Required', 'Photo library permission was denied. Please enable it in your device Settings.', [
            { label: 'Cancel', onPress: dismissDialog },
            { label: 'Open Settings', onPress: () => { dismissDialog(); Linking.openSettings(); } },
          ]);
        } else {
          showDialog('Permission needed', 'Photo library access is required.', [
            { label: 'OK', onPress: dismissDialog },
          ]);
        }
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.3,
        base64: true,
      });
    }

    if (result.canceled || !result.assets?.[0]?.base64) return;
    setAvatarBase64(result.assets[0].base64);
  };

  const showAvatarOptions = () => {
    Alert.alert('Profile Picture', 'Add a photo for this patient', [
      { text: 'Take Photo', onPress: () => pickAvatar('camera') },
      { text: 'Choose from Library', onPress: () => pickAvatar('library') },
      ...(avatarBase64 ? [{ text: 'Remove Photo', style: 'destructive' as const, onPress: () => setAvatarBase64(null) }] : []),
      { text: 'Skip for Now', style: 'cancel' },
    ]);
  };

  const handleNameChange = (text: string) => {
    if (/^[a-zA-ZëçËÇ\s]*$/.test(text)) {
      setName(text);
      setErrors(prev => ({ ...prev, name: undefined }));
    } else {
      setErrors(prev => ({ ...prev, name: 'Only letters and spaces are allowed.' }));
    }
  };

  const handleSurnameChange = (text: string) => {
    if (/^[a-zA-ZëçËÇ\s]*$/.test(text)) {
      setSurname(text);
      setErrors(prev => ({ ...prev, surname: undefined }));
    } else {
      setErrors(prev => ({ ...prev, surname: 'Only letters and spaces are allowed.' }));
    }
  };

  // iOS handlers
  const onIOSDateChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (selectedDate) {
      setTempDate(selectedDate);
    }
  };

  const confirmIOSDate = () => {
    setDateOfBirth(tempDate);
    setErrors(prev => ({ ...prev, dateOfBirth: undefined }));
    hidePickerAnimated();
  };

  const showPickerAnimated = () => {
    if (dateOfBirth) setTempDate(dateOfBirth);
    setShowPicker(true);
    Animated.timing(backdropAnim, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const hidePickerAnimated = () => {
    Animated.timing(backdropAnim, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      setShowPicker(false);
    });
  };

  const onAndroidDismiss = useCallback(() => {
    setShowPicker(false);
  }, []);

  const onAndroidConfirm = useCallback((params: { date: Date | undefined }) => {
    setShowPicker(false);
    if (params.date) {
      setDateOfBirth(params.date);
      setErrors(prev => ({ ...prev, dateOfBirth: undefined }));
    }
  }, []);

  const handleSubmit = async () => {
    if (!name.trim() || !surname.trim() || !dateOfBirth) {
      setApiError('Please fill in all fields.');
      return;
    }

    if (calculateAge(dateOfBirth) < 0) {
      setErrors(prev => ({ ...prev, dateOfBirth: 'Date of birth cannot be in the future.' }));
      return;
    }

    setIsLoading(true);
    setApiError('');

    try {
      const avatarUrl = avatarBase64 ? `data:image/jpeg;base64,${avatarBase64}` : undefined;

      const response = await fetch(`${API_BASE_URL}/patients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          surname: surname.trim(),
          dateOfBirth: toISODate(dateOfBirth),
          ...(avatarUrl ? { avatarUrl } : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const msg = Array.isArray(data.message) ? data.message.join('\n') : data.message;
        throw new Error(msg || 'Failed to create patient');
      }

      const joinCode = data.patient?.patientJoinCode || 'N/A';
      showDialog(
        'Patient Created',
        `Join Code: ${joinCode}\n\nShare this code with the patient's device to pair them.`,
        [{ label: 'Go to Dashboard', onPress: () => { dismissDialog(); router.back(); } }],
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
        behavior={isIOS ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.headline}>Add a Patient</Text>
          <Text style={styles.subheadline}>
            Create a profile for your loved one.{'\n'}You will become their primary caregiver.
          </Text>

          <View style={styles.avatarRow}>
            <TouchableOpacity onPress={showAvatarOptions} activeOpacity={0.8} style={styles.avatarWrapper}>
              {avatarBase64 ? (
                <Image source={{ uri: `data:image/jpeg;base64,${avatarBase64}` }} style={styles.avatarCircle} />
              ) : (
                <View style={styles.avatarCircle}>
                  {(name || surname) ? (
                    <Text style={styles.avatarInitials}>
                      {`${name?.[0] ?? ''}${surname?.[0] ?? ''}`.toUpperCase()}
                    </Text>
                  ) : (
                    <AppIcon iosName="person.crop.circle" androidFallback="P" size={32} color="rgba(255,255,255,0.8)" />
                  )}
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                <AppIcon iosName="plus" androidFallback="+" size={11} color="#fff" weight="bold" />
              </View>
            </TouchableOpacity>
            <View style={styles.avatarHint}>
              <Text style={styles.avatarHintTitle}>Profile Photo</Text>
              <Text style={styles.avatarHintSub}>Optional — tap to add</Text>
            </View>
          </View>

          <AdaptiveInput
            label="First Name"
            value={name}
            onChangeText={handleNameChange}
            placeholder="Enter the patient's first name"
            error={errors.name}
            autoCapitalize="words"
          />

          <AdaptiveInput
            label="Last Name"
            value={surname}
            onChangeText={handleSurnameChange}
            placeholder="Enter the patient's last name"
            error={errors.surname}
            autoCapitalize="words"
          />

          {/* Date of Birth picker trigger */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, !isIOS && styles.androidFieldLabel]}>
              Date of Birth
            </Text>
            <TouchableOpacity
              style={[
                styles.dateButton,
                isIOS ? styles.iosDateButton : styles.androidDateButton,
                errors.dateOfBirth && styles.dateButtonError,
              ]}
              onPress={showPickerAnimated}
              activeOpacity={0.7}
            >
              <AppIcon
                iosName="calendar"
                androidFallback="Cal"
                size={20}
                color={dateOfBirth ? colors.secondary : colors.textMuted}
              />
              <Text style={[
                styles.dateButtonText,
                !dateOfBirth && styles.dateButtonPlaceholder,
              ]}>
                {dateOfBirth ? formatDate(dateOfBirth) : 'Select date of birth'}
              </Text>
              {dateOfBirth && (
                <AdaptiveCard
                  style={styles.ageChip}
                  backgroundColor={isIOS ? 'rgba(180, 174, 232, 0.18)' : 'rgba(180, 174, 232, 0.22)'}
                >
                  <Text style={styles.ageChipText}>
                    Age {calculateAge(dateOfBirth)}
                  </Text>
                </AdaptiveCard>
              )}
            </TouchableOpacity>
            {errors.dateOfBirth && <Text style={styles.errorText}>{errors.dateOfBirth}</Text>}
          </View>

          {/* Android: M3 date picker modal */}
          {!isIOS && (
            <DatePickerModal
              locale="en"
              mode="single"
              visible={showPicker}
              onDismiss={onAndroidDismiss}
              date={dateOfBirth}
              onConfirm={onAndroidConfirm}
              validRange={{ endDate: new Date(), startDate: new Date(1900, 0, 1) }}
              label="Select date"
              saveLabel="OK"
            />
          )}

          {/* iOS: native inline picker in a modal sheet */}
          {isIOS && (
            <Modal visible={showPicker} transparent animationType="none" onRequestClose={hidePickerAnimated}>
              <TouchableWithoutFeedback onPress={hidePickerAnimated}>
                <View style={styles.modalOverlay}>
                  <Animated.View
                    style={[
                      StyleSheet.absoluteFill,
                      { backgroundColor: 'rgba(0,0,0,0.38)', opacity: backdropAnim },
                    ]}
                  />
                  <TouchableWithoutFeedback onPress={() => {}}>
                    <Animated.View
                      style={[
                        styles.iosPickerContainer,
                        {
                          transform: [{
                            translateY: backdropAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [300, 0],
                            }),
                          }],
                        },
                      ]}
                    >
                      <View style={styles.iosPickerHeader}>
                        <TouchableOpacity onPress={hidePickerAnimated}>
                          <Text style={styles.iosPickerCancel}>Cancel</Text>
                        </TouchableOpacity>
                        <Text style={styles.iosPickerTitle}>Date of Birth</Text>
                        <TouchableOpacity onPress={confirmIOSDate}>
                          <Text style={styles.iosPickerDone}>Done</Text>
                        </TouchableOpacity>
                      </View>
                      <DateTimePicker
                        value={tempDate}
                        mode="date"
                        display="spinner"
                        onChange={onIOSDateChange}
                        maximumDate={new Date()}
                        minimumDate={new Date(1900, 0, 1)}
                        themeVariant="light"
                        style={styles.iosInlinePicker}
                      />
                    </Animated.View>
                  </TouchableWithoutFeedback>
                </View>
              </TouchableWithoutFeedback>
            </Modal>
          )}

          {apiError ? <Text style={styles.apiErrorText}>{apiError}</Text> : null}

          <AdaptiveButton
            title="Create Patient"
            onPress={handleSubmit}
            loading={isLoading}
            loadingText="Creating Profile..."
            style={{ marginTop: 8 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <M3Dialog
        visible={dialog.visible}
        title={dialog.title}
        body={dialog.body}
        actions={dialog.actions}
        onDismiss={dismissDialog}
      />
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
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 28,
  },
  avatarWrapper: { position: 'relative' },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarInitials: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 24,
    color: colors.textLight,
    letterSpacing: 1,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.neutral,
  },
  avatarHint: { flex: 1 },
  avatarHintTitle: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: colors.textDark,
    marginBottom: 3,
  },
  avatarHintSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  formGroup: { marginBottom: 18 },
  label: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textDark,
    marginBottom: 6,
  },
  androidFieldLabel: {
    fontSize: 13,
    letterSpacing: 0.2,
    color: colors.textMuted,
  },

  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 10,
  },
  iosDateButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.12)',
    borderRadius: 14,
  },
  androidDateButton: {
    backgroundColor: colors.neutralLight,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 16,
  },
  dateButtonError: { borderColor: '#C0392B' },
  dateButtonText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 16,
    color: colors.textDark,
    flex: 1,
  },
  dateButtonPlaceholder: {
    color: colors.textMuted,
  },

  ageChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ageChipText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.secondary,
  },

  errorText: {
    color: '#C0392B',
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    marginTop: 4,
  },
  apiErrorText: {
    color: '#C0392B',
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },

  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  iosPickerContainer: {
    backgroundColor: colors.neutral,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  iosPickerCancel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 16,
    color: colors.textMuted,
  },
  iosPickerTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: colors.textDark,
  },
  iosPickerDone: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: colors.secondary,
  },
  iosInlinePicker: {
    alignSelf: 'center',
  },
});
