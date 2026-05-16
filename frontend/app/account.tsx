import React, { useState, useEffect, useRef } from 'react';

import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch,
  ActivityIndicator, Platform, Modal, TextInput, Image, Alert, Linking,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useNavigation, CommonActions } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { colors, lightColors, darkColors } from '../src/theme/colors';
import { useTheme, type AppearanceMode } from '../src/theme/ThemeProvider';
import { typography } from '../src/theme/typography';
import { API_BASE_URL } from '../src/config/api';
import {
  getToken, getCaregiverInfo, saveCaregiverInfo, clearAuth, CaregiverInfo,
} from '../src/utils/auth';
import { AppIcon } from '../src/components/AppIcon';
import { M3Dialog, type M3DialogAction } from '../src/components/M3Dialog';
import { ManageDeletionSheet } from '../src/components/ManageDeletionSheet';
import { getPlanName, FREE_PLAN_LIMITS } from '../src/utils/subscription';

const isIOS = Platform.OS === 'ios';

interface Session {
  id: string;
  deviceLabel: string | null;
  createdAt: string;
  expiresAt: string;
}

interface DelegationRequest {
  id: string;
  patientId: string;
  toCaregiver: { id: string; name: string; surname: string };
}

type DeletionStatus = 'IDLE' | 'PENDING' | 'ALL_ACCEPTED' | 'SOME_DECLINED' | 'SCHEDULED';

interface DeletionState {
  status: DeletionStatus;
  isPrimaryForAnyPatient: boolean;
  pendingRequests: DelegationRequest[];
  acceptedRequests: DelegationRequest[];
  declinedRequests: DelegationRequest[];
  scheduledDeleteAt?: string;
}

export default function AccountScreen() {
  const { isDark, appearance, setAppearance, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  const router = useRouter();
  const navigation = useNavigation();
  const { openDeletion } = useLocalSearchParams<{ openDeletion?: string }>();

  const [token, setToken] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goToCaregiverPatients = () => {
    setDeletionModalVisible(false);
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    router.replace('/(caregiver-tabs)/patients');
  };
  const [profile, setProfile] = useState<CaregiverInfo | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Edit name modal
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSurname, setEditSurname] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Change email modal
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [emailStep, setEmailStep] = useState<'password' | 'email'>('password');
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [showEmailPw, setShowEmailPw] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState('');

  // Change password modal
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Avatar
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Deletion flow
  const [deletion, setDeletion] = useState<DeletionState>({
    status: 'IDLE',
    isPrimaryForAnyPatient: false,
    pendingRequests: [],
    acceptedRequests: [],
    declinedRequests: [],
  });
  const [deletionModalVisible, setDeletionModalVisible] = useState(false);

  const [dialog, setDialog] = useState<{
    visible: boolean;
    title: string;
    body: string;
    actions: M3DialogAction[];
  }>({ visible: false, title: '', body: '', actions: [] });

  const showDialog = (title: string, body: string, actions: M3DialogAction[]) => {
    setDialog({ visible: true, title, body, actions });
  };

  const dismissDialog = () => {
    setDialog((prev) => ({ ...prev, visible: false }));
  };

  useEffect(() => {
    (async () => {
      const tok = await getToken();
      if (!tok) { router.replace('/login'); return; }
      setToken(tok);

      // Show cached data immediately so fields aren't blank
      const cached = await getCaregiverInfo();
      if (cached) {
        setProfile(cached);
        setIsLoading(false); // show UI right away with cached data
      }

      try {
        const payload = JSON.parse(atob(tok.split('.')[1]));
        setCurrentSessionId(payload.sessionId ?? null);
      } catch { /* ignore */ }

      await Promise.all([
        loadProfile(tok),
        loadSessions(tok),
        loadDeletionStatus(tok),
      ]);
      setIsLoading(false); // also clears spinner if no cache was found

      // Auto-open deletion modal when navigated from inbox notification
      if (openDeletion === '1') {
        setDeletionModalVisible(true);
      }
    })();
    return () => {
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
      }
    };
  }, []);

  const loadProfile = async (tok: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        await saveCaregiverInfo(data);
      }
    } catch { /* ignore */ }
  };

  const loadSessions = async (tok: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/sessions`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) setSessions(await res.json());
    } catch { /* ignore */ }
  };

  const loadDeletionStatus = async (tok: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/deletion-status`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const hasPending = data.pendingRequests?.length > 0;
      const allResolved = data.allDelegationsResolved;
      const hasSomeDeclined = data.hasSomeDeclined;

      let status: DeletionStatus = 'IDLE';
      if (hasPending) status = 'PENDING';
      else if (hasSomeDeclined) status = 'SOME_DECLINED';
      else if (allResolved) status = 'ALL_ACCEPTED';

      setDeletion({
        status,
        isPrimaryForAnyPatient: data.isPrimaryForAnyPatient ?? false,
        pendingRequests: data.pendingRequests ?? [],
        acceptedRequests: data.acceptedRequests ?? [],
        declinedRequests: data.declinedRequests ?? [],
      });
    } catch { /* ignore */ }
  };

  // ─── Avatar ────────────────────────────────────────────────────────────────

  const showAvatarOptions = () => {
    if (isIOS) {
      const options: any[] = [
        { text: 'Take Photo', onPress: () => pickImage('camera') },
        { text: 'Choose from Library', onPress: () => pickImage('library') },
      ];
      if (profile?.avatarUrl) {
        options.push({ text: 'Remove Photo', style: 'destructive', onPress: removeAvatar });
      }
      options.push({ text: 'Cancel', style: 'cancel' });
      Alert.alert('Edit Photo', undefined, options);
    } else {
      const actions: M3DialogAction[] = [
        { label: 'Take Photo', onPress: () => { dismissDialog(); pickImage('camera'); } },
        { label: 'Choose from Library', onPress: () => { dismissDialog(); pickImage('library'); } },
      ];
      if (profile?.avatarUrl) {
        actions.push({ label: 'Remove Photo', destructive: true, onPress: () => { dismissDialog(); removeAvatar(); } });
      }
      actions.push({ label: 'Cancel', onPress: dismissDialog });
      showDialog('Edit Photo', 'Update your profile picture.', actions);
    }
  };

  const pickImage = async (source: 'camera' | 'library') => {
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
        quality: 0.5,
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
        quality: 0.5,
        base64: true,
      });
    }

    if (result.canceled || !result.assets?.[0]?.base64) return;
    const dataUrl = `data:image/jpeg;base64,${result.assets[0].base64}`;
    await patchAvatar(dataUrl);
  };

  const patchAvatar = async (avatarUrl: string | null) => {
    if (!token) return;
    setUploadingAvatar(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProfile(updated);
        await saveCaregiverInfo(updated);
      }
    } catch { /* ignore */ }
    finally { setUploadingAvatar(false); }
  };

  const removeAvatar = () => patchAvatar(null);

  // ─── Edit Name ─────────────────────────────────────────────────────────────

  const openEditName = () => {
    setEditName(profile?.name ?? '');
    setEditSurname(profile?.surname ?? '');
    setEditNameVisible(true);
  };

  const saveName = async () => {
    if (!editName.trim() || !editSurname.trim() || !token) return;
    setSavingName(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), surname: editSurname.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProfile(updated);
        await saveCaregiverInfo(updated);
        setEditNameVisible(false);
      }
    } catch { /* ignore */ }
    finally { setSavingName(false); }
  };

  // ─── Change Email ──────────────────────────────────────────────────────────

  const openEmailModal = () => {
    setEmailStep('password');
    setNewEmail('');
    setEmailPassword('');
    setShowEmailPw(false);
    setEmailError('');
    setEmailModalVisible(true);
  };

  // Step 1: verify password by attempting login with current credentials
  const verifyEmailPassword = async () => {
    if (!emailPassword || !token) return;
    setSavingEmail(true);
    setEmailError('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: profile?.email, password: emailPassword }),
      });
      if (res.ok) {
        setEmailStep('email');
      } else {
        setEmailError('Incorrect password. Please try again.');
      }
    } catch {
      setEmailError('Failed to connect to the server');
    } finally {
      setSavingEmail(false);
    }
  };

  // Step 2: save the new email
  const saveEmail = async () => {
    if (!newEmail.trim() || !emailPassword || !token) return;
    setSavingEmail(true);
    setEmailError('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/change-email`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail: newEmail.trim(), currentPassword: emailPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setProfile(prev => prev ? { ...prev, email: newEmail.trim() } : prev);
        await saveCaregiverInfo({ ...profile!, email: newEmail.trim() });
        setEmailModalVisible(false);
      } else {
        setEmailError(Array.isArray(data.message) ? data.message.join('\n') : (data.message ?? 'Failed to change email'));
      }
    } catch {
      setEmailError('Failed to connect to the server');
    } finally {
      setSavingEmail(false);
    }
  };

  // ─── Change Password ───────────────────────────────────────────────────────

  const openPasswordModal = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setShowCurrentPw(false);
    setShowNewPw(false);
    setShowConfirmPw(false);
    setPasswordModalVisible(true);
  };

  const savePassword = async () => {
    if (!currentPassword || !newPassword || !token) return;
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    setSavingPassword(true);
    setPasswordError('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordModalVisible(false);
        showDialog('Success', 'Your password has been changed.', [
          { label: 'OK', onPress: dismissDialog },
        ]);
      } else {
        setPasswordError(Array.isArray(data.message) ? data.message.join('\n') : (data.message ?? 'Failed to change password'));
      }
    } catch {
      setPasswordError('Failed to connect to the server');
    } finally {
      setSavingPassword(false);
    }
  };


  // ─── Sessions ──────────────────────────────────────────────────────────────

  const revokeSession = (sessionId: string) => {
    const isCurrent = sessionId === currentSessionId;
    showDialog(
      isCurrent ? 'Log Out' : 'Log Out Device',
      isCurrent ? 'You will be logged out of this device.' : 'This device will be logged out immediately.',
      [
        { label: 'Cancel', onPress: dismissDialog },
        {
          label: 'Log Out',
          destructive: true,
          onPress: async () => {
            dismissDialog();
            try {
              await fetch(`${API_BASE_URL}/auth/sessions/${sessionId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (isCurrent) {
                await clearAuth();
                navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }));
              } else {
                setSessions(prev => prev.filter(s => s.id !== sessionId));
              }
            } catch { /* ignore */ }
          },
        },
      ],
    );
  };

  const logoutOtherSessions = () => {
    showDialog('Log Out Other Sessions', 'All other devices will be logged out immediately.', [
      { label: 'Cancel', onPress: dismissDialog },
      {
        label: 'Log Out Others',
        destructive: true,
        onPress: async () => {
          dismissDialog();
          try {
            await fetch(`${API_BASE_URL}/auth/sessions/others`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            setSessions(prev => prev.filter(s => s.id === currentSessionId));
          } catch { /* ignore */ }
        },
      },
    ]);
  };

  // ─── Logout current device ─────────────────────────────────────────────────

  const handleLogout = () => {
    showDialog('Log Out', 'You will be logged out of this device.', [
      { label: 'Cancel', onPress: dismissDialog },
      {
        label: 'Log Out',
        destructive: true,
        onPress: async () => {
          dismissDialog();
          try {
            if (token) {
              await fetch(`${API_BASE_URL}/auth/logout`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
              });
            }
          } catch { /* ignore */ }
          await clearAuth();
          navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }));
        },
      },
    ]);
  };

  const scheduleLogoutAfterDeletion = () => {
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
    }

    logoutTimerRef.current = setTimeout(async () => {
      dismissDialog();
      await clearAuth();
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }));
    }, 2500);
  };

  // ─── Delete Account (request-based flow) ──────────────────────────────────

  const handleDeleteAccount = () => {
    if (deletion.status === 'PENDING' || deletion.status === 'ALL_ACCEPTED' || deletion.status === 'SOME_DECLINED') {
      setDeletionModalVisible(true);
      return;
    }

    if (!deletion.isPrimaryForAnyPatient) {
      showDialog(
        'Delete Account',
        'Your account will be permanently deleted after a 10-day grace period. You can restore it by logging in during that time.\n\nThis cannot be undone after the grace period.',
        [
          { label: 'Cancel', onPress: dismissDialog },
          { label: 'Delete Account', destructive: true, onPress: () => { dismissDialog(); sendDeletionRequest(); } },
        ],
      );
      return;
    }

    showDialog(
      'Delete Account',
      'You are about to start the role transfer process.\n\nYou will remain primary caregiver and keep full access while your secondaries confirm the transfer. Your account is only deactivated when you click "Finalize" after everyone has accepted.',
      [
        { label: 'Cancel', onPress: dismissDialog },
        { label: 'Start Transferring', onPress: () => { dismissDialog(); sendDeletionRequest(); } },
      ],
    );
  };

  const sendDeletionRequest = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/auth/request-deletion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        showDialog('Error', data.message ?? 'Could not initiate deletion', [
          { label: 'OK', onPress: dismissDialog },
        ]);
        return;
      }

      if (data.status === 'BLOCKED') {
        const patientNames = (data.blockedPatients ?? [])
          .map((p: { name: string; surname: string }) => `• ${p.name} ${p.surname}`)
          .join('\n');
        showDialog(
          'Cannot Delete Account',
          `You cannot delete your account yet. The following patient(s) have no other caregivers:\n\n${patientNames}\n\nPlease invite someone to take over or delete the patient profile first.`,
          [{ label: 'Got it', onPress: dismissDialog }],
        );
        return;
      }

      await loadProfile(token);

      if (data.status === 'NO_DELEGATION_NEEDED') {
        showDialog(
          'Confirm Deletion',
          'Your account and all patient data you manage will be permanently deleted after a 10-day grace period. This cannot be undone.',
          [
            { label: 'Cancel', onPress: dismissDialog },
            { label: 'Delete Account', destructive: true, onPress: async () => {
              dismissDialog();
              try {
                const res = await fetch(`${API_BASE_URL}/auth/confirm-deletion`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                  scheduleLogoutAfterDeletion();
                }
              } catch { /* ignore */ }
            } },
          ],
        );
      } else {
        await loadDeletionStatus(token);
        setDeletionModalVisible(true);
      }
    } catch {
      showDialog('Error', 'Failed to connect to the server', [
        { label: 'OK', onPress: dismissDialog },
      ]);
    }
  };

  // ─── Subscription toggle ───────────────────────────────────────────────────

  const toggleSubscription = async (value: boolean) => {
    if (!token) return;
    // Optimistic update
    setProfile(prev => prev ? { ...prev, isSubscribed: value } : prev);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isSubscribed: value }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(prev => prev ? { ...prev, ...data } : prev);
        await saveCaregiverInfo({ ...profile!, isSubscribed: value });
      } else {
        // Revert on failure
        setProfile(prev => prev ? { ...prev, isSubscribed: !value } : prev);
      }
    } catch {
      setProfile(prev => prev ? { ...prev, isSubscribed: !value } : prev);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const initials = profile
    ? `${profile.name?.[0] ?? ''}${profile.surname?.[0] ?? ''}`.toUpperCase()
    : '?';

  if (isLoading) {
    return (
      <View style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={isIOS ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
        >

          {/* ── Avatar ── */}
          <View style={styles.avatarSection}>
            <TouchableOpacity onPress={showAvatarOptions} activeOpacity={0.8} style={styles.avatarWrapper}>
              {uploadingAvatar ? (
                <View style={styles.avatarCircle}>
                  <ActivityIndicator color={themeColors.textLight} />
                </View>
              ) : profile?.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatarCircle} />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                <AppIcon iosName="pencil" androidFallback="✎" size={13} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarName}>
              {profile?.name} {profile?.surname}
              {profile?.isSubscribed && (
                <Text style={styles.premiumBadge}> Premium</Text>
              )}
            </Text>
            <Text style={styles.avatarEmail}>{profile?.email}</Text>
          </View>

          {/* ── Subscription Plan ── */}
          <View style={[styles.subscriptionCard, profile?.isSubscribed && styles.subscriptionCardPremium]}>
            <View style={styles.subscriptionCardHeader}>
              <View style={[styles.rowIcon, { backgroundColor: profile?.isSubscribed ? 'rgba(255,193,7,0.18)' : 'rgba(0,0,0,0.05)' }]}>
                <AppIcon iosName="star.fill" androidFallback="⭐" size={18} color={profile?.isSubscribed ? '#FFC107' : themeColors.textMuted} />
              </View>
              <View style={styles.subscriptionCardInfo}>
                <Text style={styles.subscriptionCardTitle}>{getPlanName(profile?.isSubscribed ?? false)} Plan</Text>
                <Text style={styles.subscriptionCardSubtitle}>
                  {profile?.isSubscribed
                    ? 'Unlimited patients, caregivers, all media types, and AI adaptive difficulty'
                    : `Up to ${FREE_PLAN_LIMITS.maxPatientsPerCaregiver} patients · Photos only`
                  }
                </Text>
              </View>
            </View>
            
            {!profile?.isSubscribed && (
              <View style={styles.premiumUpsellContainer}>
                <Text style={styles.premiumUpsellTitle}>⭐ Upgrade to Premium to unlock:</Text>
                <Text style={styles.premiumUpsellDesc}>
                  Unlimited patients, caregivers, video/audio uploads, and AI-powered features.
                </Text>
              </View>
            )}

            <View style={styles.subscriptionToggleRow}>
              <Text style={styles.subscriptionToggleLabel}>
                {profile?.isSubscribed ? 'Active' : 'Upgrade'}
              </Text>
              <Switch
                value={profile?.isSubscribed ?? false}
                onValueChange={toggleSubscription}
                trackColor={{ false: isIOS ? 'rgba(0,0,0,0.08)' : '#ccc', true: 'rgba(3,87,58,0.35)' }}
                thumbColor={profile?.isSubscribed ? themeColors.secondary : isIOS ? '#fff' : '#f4f4f4'}
                ios_backgroundColor="rgba(0,0,0,0.08)"
              />
            </View>
          </View>

          {/* ── Profile ── */}
          <Text style={styles.sectionLabel}>Personal Information</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.row} onPress={openEditName} activeOpacity={0.7}>
              <View style={[styles.rowIcon, { backgroundColor: 'rgba(45,79,62,0.1)' }]}>
                <AppIcon iosName="person" androidFallback="👤" size={18} color={themeColors.secondary} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Full Name</Text>
                <Text style={styles.rowValue}>{profile?.name} {profile?.surname}</Text>
              </View>
              <AppIcon iosName="chevron.right" androidFallback="›" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity style={styles.row} onPress={openEmailModal} activeOpacity={0.7}>
              <View style={[styles.rowIcon, { backgroundColor: 'rgba(180,174,232,0.2)' }]}>
                <AppIcon iosName="envelope" androidFallback="✉" size={18} color={themeColors.primary} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Email Address</Text>
                <Text style={styles.rowValue} numberOfLines={1}>{profile?.email}</Text>
              </View>
              <AppIcon iosName="chevron.right" androidFallback="›" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity style={styles.row} onPress={openPasswordModal} activeOpacity={0.7}>
              <View style={[styles.rowIcon, { backgroundColor: 'rgba(62,210,180,0.12)' }]}>
                <AppIcon iosName="lock" androidFallback="🔒" size={18} color="#3ED2B4" />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Change Password</Text>
                <Text style={styles.rowValue}>••••••••</Text>
              </View>
              <AppIcon iosName="chevron.right" androidFallback="›" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* ── Preferences ── */}
          <Text style={styles.sectionLabel}>Preferences</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: (isDark ? 'rgba(201, 195, 255, 0.16)' : 'rgba(123,115,192,0.15)') }]}>
                <AppIcon iosName="moon.stars.fill" androidFallback="🌙" size={18} color={(isDark ? '#F5FBF7' : '#7B73C0')} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>App Appearance</Text>
                <Text style={styles.rowValue}>Choose your preferred theme</Text>
              </View>
            </View>
            <View style={styles.separator} />
            <View style={styles.appearanceRow}>
              {(['light', 'dark', 'system'] as AppearanceMode[]).map((mode) => {
                const isActive = appearance === mode;
                const label = mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : 'System';
                const icon = mode === 'light' ? 'sun.max.fill' : mode === 'dark' ? 'moon.fill' : 'gear';
                const fallback = mode === 'light' ? '☀' : mode === 'dark' ? '🌙' : '⚙';
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.appearanceOption,
                      isActive && { backgroundColor: (isDark ? '#183426' : '#E8F5EC'), borderColor: (isDark ? '#9BE7B4' : '#1E4D30') },
                    ]}
                    onPress={() => setAppearance(mode)}
                    activeOpacity={0.7}
                  >
                    <AppIcon
                      iosName={icon as any}
                      androidFallback={fallback}
                      size={18}
                      color={isActive ? (isDark ? '#9BE7B4' : '#1E4D30') : (isDark ? '#AEBDAF' : '#666666')}
                    />
                    <Text style={[
                      styles.appearanceLabel,
                      isActive && { color: (isDark ? '#9BE7B4' : '#1E4D30'), fontFamily: typography.fontFamily.bold },
                    ]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Active Sessions ── */}
          <Text style={styles.sectionLabel}>Where You're Logged In</Text>
          <View style={styles.card}>
            {sessions.length === 0 ? (
              <Text style={styles.emptySessionsText}>No active sessions found.</Text>
            ) : (
              sessions.map((session, index) => {
                const isCurrent = session.id === currentSessionId;
                const label = session.deviceLabel ?? (isCurrent ? 'This Device' : 'Unknown Device');
                const date = new Date(session.createdAt).toLocaleDateString();
                return (
                  <View key={session.id}>
                    {index > 0 && <View style={styles.separator} />}
                    <View style={styles.sessionRow}>
                      <View style={[styles.rowIcon, {
                        backgroundColor: isCurrent ? 'rgba(45,79,62,0.1)' : 'rgba(0,0,0,0.05)',
                      }]}>
                        <AppIcon iosName="iphone" androidFallback="📱" size={18}
                          color={isCurrent ? themeColors.secondary : themeColors.textMuted} />
                      </View>
                      <View style={styles.rowContent}>
                        <Text style={styles.rowLabel}>
                          {label}
                          {isCurrent && <Text style={styles.currentBadge}> · This device</Text>}
                        </Text>
                        <Text style={styles.rowValue}>
                          {isCurrent ? 'Last active: Now' : `Logged in ${date}`}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => revokeSession(session.id)} style={styles.revokeBtn} activeOpacity={0.7}>
                        <Text style={styles.revokeBtnText}>Log Out</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {sessions.filter(s => s.id !== currentSessionId).length > 0 && (
            <TouchableOpacity style={styles.logoutOthersBtn} onPress={logoutOtherSessions} activeOpacity={0.7}>
              <Text style={styles.logoutOthersText}>Log Out of All Other Sessions</Text>
            </TouchableOpacity>
          )}

          {/* ── Account Actions ── */}
          <Text style={styles.sectionLabel}>Danger Zone</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.row} onPress={handleLogout} activeOpacity={0.7}>
              <View style={[styles.rowIcon, { backgroundColor: 'rgba(231,76,60,0.08)' }]}>
                <AppIcon iosName="arrow.right.square" androidFallback="←" size={18} color="#C0392B" />
              </View>
              <View style={styles.rowContent}>
                <Text style={[styles.rowLabel, { color: '#C0392B' }]}>Log Out</Text>
                <Text style={styles.rowValue}>Log out of this device</Text>
              </View>
              <AppIcon iosName="chevron.right" androidFallback="›" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.dangerCard}>
            {deletion.status === 'PENDING' || deletion.status === 'ALL_ACCEPTED' || deletion.status === 'SOME_DECLINED' ? (
              <TouchableOpacity style={styles.row} onPress={() => setDeletionModalVisible(true)} activeOpacity={0.7}>
                <View style={[styles.rowIcon, { backgroundColor: deletion.status === 'ALL_ACCEPTED' ? 'rgba(39,174,96,0.1)' : 'rgba(226,223,207,0.8)' }]}>
                  <AppIcon
                    iosName={deletion.status === 'ALL_ACCEPTED' ? 'checkmark.circle' : 'clock.badge.exclamationmark'}
                    androidFallback={deletion.status === 'ALL_ACCEPTED' ? '✓' : '⏳'}
                    size={18}
                    color={deletion.status === 'ALL_ACCEPTED' ? '#27ae60' : '#4A4236'}
                  />
                </View>
                <View style={styles.rowContent}>
                  <Text style={[styles.rowLabel, { color: deletion.status === 'ALL_ACCEPTED' ? '#27ae60' : '#4A4236' }]}>
                    {deletion.status === 'ALL_ACCEPTED' ? 'Ready to Finalize' : 'Manage Deletion Process'}
                  </Text>
                  <Text style={styles.rowValue}>
                    {deletion.status === 'ALL_ACCEPTED'
                      ? 'All roles accepted — tap to finalize'
                      : deletion.status === 'SOME_DECLINED'
                      ? 'Some caregivers declined — tap to review'
                      : `Waiting for ${deletion.pendingRequests.length} caregiver(s) to accept`}
                  </Text>
                </View>
                <AppIcon iosName="chevron.right" androidFallback="›" size={16} color={deletion.status === 'ALL_ACCEPTED' ? '#27ae60' : '#4A4236'} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.row} onPress={handleDeleteAccount} activeOpacity={0.7}>
                <View style={[styles.rowIcon, { backgroundColor: 'rgba(231,76,60,0.08)' }]}>
                  <AppIcon iosName="person.badge.minus" androidFallback="🗑" size={18} color="#C0392B" />
                </View>
                <View style={styles.rowContent}>
                  <Text style={[styles.rowLabel, { color: '#C0392B' }]}>Delete Account</Text>
                  <Text style={styles.rowValue}>
                    {deletion.isPrimaryForAnyPatient
                      ? 'Transfer your primary roles, then delete'
                      : 'Permanently delete your account'}
                  </Text>
                </View>
                <AppIcon iosName="chevron.right" androidFallback="›" size={16} color="#C0392B" />
              </TouchableOpacity>
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Edit Name Modal ── */}
      <Modal visible={editNameVisible} transparent animationType="fade" onRequestClose={() => setEditNameVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Name</Text>
            <TextInput style={styles.modalInput} value={editName} onChangeText={setEditName}
              placeholder="First name" placeholderTextColor={themeColors.textMuted} autoCapitalize="words" autoCorrect={false} spellCheck={false} />
            <TextInput style={[styles.modalInput, { marginTop: 10 }]} value={editSurname} onChangeText={setEditSurname}
              placeholder="Last name" placeholderTextColor={themeColors.textMuted} autoCapitalize="words" autoCorrect={false} spellCheck={false} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditNameVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveName} disabled={savingName}>
                <Text style={styles.modalSaveText}>{savingName ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Change Email Modal ── */}
      <Modal visible={emailModalVisible} transparent animationType="fade" onRequestClose={() => setEmailModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>

            {emailStep === 'password' ? (
              <>
                <Text style={styles.modalTitle}>Verify Identity</Text>
                <Text style={styles.modalSubtitle}>Enter your current password to continue.</Text>
                <View style={styles.modalInputRow}>
                  <TextInput
                    style={styles.modalInputInner}
                    value={emailPassword}
                    onChangeText={setEmailPassword}
                    placeholder="Current password"
                    placeholderTextColor={themeColors.textMuted}
                    secureTextEntry={!showEmailPw}
                    autoCorrect={false}
                    spellCheck={false}
                    autoFocus
                  />
                  <TouchableOpacity onPress={() => setShowEmailPw(v => !v)} style={styles.modalEyeBtn}>
                    <AppIcon iosName={showEmailPw ? 'eye.slash' : 'eye'} androidFallback={showEmailPw ? '🙈' : '👁'} size={18} color={themeColors.textMuted} />
                  </TouchableOpacity>
                </View>
                {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEmailModalVisible(false)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalSaveBtn} onPress={verifyEmailPassword} disabled={savingEmail}>
                    <Text style={styles.modalSaveText}>{savingEmail ? 'Verifying…' : 'Continue'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>New Email Address</Text>
                <Text style={styles.modalSubtitle}>Enter the email you'd like to use.</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newEmail}
                  onChangeText={setNewEmail}
                  placeholder="New email address"
                  placeholderTextColor={themeColors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  autoFocus
                />
                {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEmailStep('password')}>
                    <Text style={styles.modalCancelText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalSaveBtn} onPress={saveEmail} disabled={savingEmail}>
                    <Text style={styles.modalSaveText}>{savingEmail ? 'Saving…' : 'Save'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

          </View>
        </View>
      </Modal>

      {/* ── Change Password Modal ── */}
      <Modal visible={passwordModalVisible} transparent animationType="fade" onRequestClose={() => setPasswordModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change Password</Text>

            <View style={styles.modalInputRow}>
              <TextInput style={styles.modalInputInner} value={currentPassword} onChangeText={setCurrentPassword}
                placeholder="Current password" placeholderTextColor={themeColors.textMuted} secureTextEntry={!showCurrentPw} autoCorrect={false} spellCheck={false} />
              <TouchableOpacity onPress={() => setShowCurrentPw(v => !v)} style={styles.modalEyeBtn}>
                <AppIcon iosName={showCurrentPw ? 'eye.slash' : 'eye'} androidFallback={showCurrentPw ? '🙈' : '👁'} size={18} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={[styles.modalInputRow, { marginTop: 10 }]}>
              <TextInput style={styles.modalInputInner} value={newPassword} onChangeText={setNewPassword}
                placeholder="New password" placeholderTextColor={themeColors.textMuted} secureTextEntry={!showNewPw} autoCorrect={false} spellCheck={false} />
              <TouchableOpacity onPress={() => setShowNewPw(v => !v)} style={styles.modalEyeBtn}>
                <AppIcon iosName={showNewPw ? 'eye.slash' : 'eye'} androidFallback={showNewPw ? '🙈' : '👁'} size={18} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={[styles.modalInputRow, { marginTop: 10 }]}>
              <TextInput style={styles.modalInputInner} value={confirmPassword} onChangeText={setConfirmPassword}
                placeholder="Confirm new password" placeholderTextColor={themeColors.textMuted} secureTextEntry={!showConfirmPw} autoCorrect={false} spellCheck={false} />
              <TouchableOpacity onPress={() => setShowConfirmPw(v => !v)} style={styles.modalEyeBtn}>
                <AppIcon iosName={showConfirmPw ? 'eye.slash' : 'eye'} androidFallback={showConfirmPw ? '🙈' : '👁'} size={18} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>

            {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setPasswordModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={savePassword} disabled={savingPassword}>
                <Text style={styles.modalSaveText}>{savingPassword ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <M3Dialog
        visible={dialog.visible}
        title={dialog.title}
        body={dialog.body}
        actions={dialog.actions}
        onDismiss={dismissDialog}
      />

      {/* ── Deletion Status Sheet ── */}
      <ManageDeletionSheet
        visible={deletionModalVisible}
        onClose={() => setDeletionModalVisible(false)}
        onDeleted={() => {
          navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }));
        }}
        onCancelled={async () => {
          setDeletion({ status: 'IDLE', isPrimaryForAnyPatient: deletion.isPrimaryForAnyPatient, pendingRequests: [], acceptedRequests: [], declinedRequests: [] });
          setDeletionModalVisible(false);
          if (token) await loadProfile(token);
        }}
        onNavigateToCareTeams={goToCaregiverPatients}
      />
    </View>
  );
}

const CARD_SHADOW = isIOS ? {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
} : { elevation: 1 };

const getStyles = (isDark: boolean) => {
  const themeColors = isDark ? darkColors : lightColors;
  return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: themeColors.neutral },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  scrollContent: { padding: 20, paddingTop: 24, paddingBottom: 60 },

  avatarSection: { alignItems: 'center', marginBottom: 32, marginTop: 8 },
  avatarWrapper: { position: 'relative', marginBottom: 12 },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: themeColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 34,
    color: themeColors.textLight,
    letterSpacing: 1,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: themeColors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: themeColors.neutral,
  },
  avatarName: { fontFamily: typography.fontFamily.bold, fontSize: 20, color: themeColors.textDark },
  avatarEmail: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: themeColors.textMuted, marginTop: 2 },

  sectionLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: themeColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 4,
  },

  card: {
    backgroundColor: themeColors.glassCardBg,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: themeColors.glassBorder,
    ...CARD_SHADOW,
  },
  dangerCard: {
    backgroundColor: themeColors.glassCardBg,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: (isDark ? themeColors.glassBorder : 'rgba(231,76,60,0.2)'),
    ...CARD_SHADOW,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowContent: { flex: 1 },
  rowLabel: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: themeColors.textDark },
  rowValue: { fontFamily: typography.fontFamily.regular, fontSize: 13, color: themeColors.textMuted, marginTop: 1 },
  currentBadge: { fontFamily: typography.fontFamily.medium, fontSize: 12, color: themeColors.secondary },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.07)'), marginLeft: 64 },
  emptySessionsText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: themeColors.textMuted,
    padding: 16,
    textAlign: 'center',
  },

  revokeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(231,76,60,0.08)'),
  },
  revokeBtnText: { fontFamily: typography.fontFamily.medium, fontSize: 13, color: (isDark ? '#FFB4A8' : '#C0392B') },

  logoutOthersBtn: {
    marginBottom: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(231,76,60,0.08)'),
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(231,76,60,0.2)'),
  },
  logoutOthersText: { fontFamily: typography.fontFamily.medium, fontSize: 14, color: (isDark ? '#FFB4A8' : '#C0392B') },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.4)'),
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: themeColors.neutral,
    borderRadius: 28,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    elevation: 3,
  },
  modalTitle: { fontFamily: typography.fontFamily.bold, fontSize: 18, color: themeColors.textDark, marginBottom: 6 },
  modalSubtitle: { fontFamily: typography.fontFamily.regular, fontSize: 13, color: themeColors.textMuted, marginBottom: 16 },
  modalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.12)'),
    borderRadius: 12,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.02)'),
  },
  modalInput: {
    borderWidth: 1,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.12)'),
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: themeColors.textDark,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.02)'),
  },
  modalInputInner: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: themeColors.textDark,
  },
  modalEyeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: { fontFamily: typography.fontFamily.regular, fontSize: 13, color: (isDark ? '#FFB4A8' : '#C0392B'), marginTop: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  modalCancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.06)') },
  modalCancelText: { fontFamily: typography.fontFamily.medium, fontSize: 14, color: themeColors.textMuted },
  modalSaveBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: themeColors.secondary },
  modalSaveText: { fontFamily: typography.fontFamily.medium, fontSize: 14, color: (isDark ? '#17231D' : '#FFFFFF') },

  // Subscription
  premiumBadge: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 13,
    color: (isDark ? '#F2C66D' : '#D4A017'),
  },
  subscriptionCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    backgroundColor: Platform.OS === 'ios' ? (isDark ? 'rgba(235, 247, 239, 0.05)' : 'rgba(255,255,255,0.55)') : (isDark ? '#17231D' : '#FFFFFF'),
    borderWidth: Platform.OS === 'ios' ? StyleSheet.hairlineWidth : 1.5,
    borderColor: Platform.OS === 'ios' ? (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.1)') : (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.08)'),
  },
  subscriptionCardPremium: {
    borderColor: (isDark ? themeColors.primary + '33' : 'rgba(212,160,23,0.35)'),
    backgroundColor: (isDark ? themeColors.patientCardBg : (Platform.OS === 'ios' ? 'rgba(255,248,225,0.6)' : '#FFFDE7')),
  },
  subscriptionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  subscriptionCardInfo: {
    flex: 1,
  },
  subscriptionCardTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: themeColors.textDark,
    marginBottom: 2,
  },
  subscriptionCardSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: themeColors.textMuted,
  },
  subscriptionToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.08)'),
  },
  subscriptionToggleLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: themeColors.textMuted,
  },
  appearanceRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  appearanceOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.05)' : 'rgba(0,0,0,0.03)'),
    gap: 8,
  },
  appearanceLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: themeColors.textMuted,
  },
  premiumUpsellContainer: {
    marginTop: -4,
    marginBottom: 12,
    padding: 12,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.03)' : 'rgba(0,0,0,0.02)'),
    borderRadius: 8,
  },
  premiumUpsellTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 13,
    color: themeColors.textDark,
    marginBottom: 4,
  },
  premiumUpsellDesc: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: themeColors.textMuted,
    lineHeight: 18,
  },
});
};
// styles are computed at render time via `useTheme()` inside the component
