import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Platform, Modal, TextInput, Image, Alert, Linking,
  KeyboardAvoidingView, PanResponder, Animated, TouchableWithoutFeedback,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useNavigation, CommonActions } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { API_BASE_URL } from '../src/config/api';
import {
  getToken, getCaregiverInfo, saveCaregiverInfo, clearAuth, CaregiverInfo,
} from '../src/utils/auth';
import { AppIcon } from '../src/components/AppIcon';

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
  const router = useRouter();
  const navigation = useNavigation();
  const { openDeletion } = useLocalSearchParams<{ openDeletion?: string }>();

  const [token, setToken] = useState<string | null>(null);

  // Swipe-down to dismiss the deletion sheet
  const slideAnim = useRef(new Animated.Value(600)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          slideAnim.setValue(gs.dy);
          backdropAnim.setValue(Math.max(0, 1 - gs.dy / 400));
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80) {
          Animated.parallel([
            Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true }),
            Animated.timing(backdropAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
          ]).start(() => {
            slideAnim.setValue(600);
            setDeletionModalVisible(false);
          });
        } else {
          Animated.parallel([
            Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }),
            Animated.timing(backdropAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
          ]).start();
        }
      },
    }),
  ).current;
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
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
        openDeletionModal();
      }
    })();
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
    const options: any[] = [
      { text: 'Take Photo', onPress: () => pickImage('camera') },
      { text: 'Choose from Library', onPress: () => pickImage('library') },
    ];
    if (profile?.avatarUrl) {
      options.push({ text: 'Remove Photo', style: 'destructive', onPress: removeAvatar });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Edit Photo', undefined, options);
  };

  const pickImage = async (source: 'camera' | 'library') => {
    let result: ImagePicker.ImagePickerResult;

    if (source === 'camera') {
      const { status, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        if (!canAskAgain) {
          Alert.alert(
            'Camera Access Required',
            'Camera permission was denied. Please enable it in your device Settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
        } else {
          Alert.alert('Permission needed', 'Camera access is required to take a photo.');
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
          Alert.alert(
            'Photo Library Access Required',
            'Photo library permission was denied. Please enable it in your device Settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
        } else {
          Alert.alert('Permission needed', 'Photo library access is required.');
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
        Alert.alert('Success', 'Your password has been changed.');
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
    Alert.alert(
      isCurrent ? 'Sign Out' : 'Log Out Device',
      isCurrent ? 'You will be signed out of this device.' : 'This device will be logged out immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isCurrent ? 'Sign Out' : 'Log Out',
          style: 'destructive',
          onPress: async () => {
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
    Alert.alert('Log Out Other Sessions', 'All other devices will be signed out immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out Others',
        style: 'destructive',
        onPress: async () => {
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
    Alert.alert('Sign Out', 'You will be signed out of this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
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

  // ─── Delete Account (request-based flow) ──────────────────────────────────

  const handleDeleteAccount = () => {
    if (deletion.status === 'PENDING' || deletion.status === 'ALL_ACCEPTED' || deletion.status === 'SOME_DECLINED') {
      openDeletionModal();
      return;
    }

    if (!deletion.isPrimaryForAnyPatient) {
      // No primary patients — skip transfer flow, go straight to confirm
      Alert.alert(
        'Delete Account',
        'Your account will be permanently deleted after a 10-day grace period. You can restore it by logging in during that time.\n\nThis cannot be undone after the grace period.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete Account', style: 'destructive', onPress: () => sendDeletionRequest() },
        ],
      );
      return;
    }

    Alert.alert(
      'Delete Account',
      'You are about to start the role transfer process.\n\nYou will remain primary caregiver and keep full access while your secondaries confirm the transfer. Your account is only deactivated when you click "Finalize" after everyone has accepted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start Transferring', onPress: () => sendDeletionRequest() },
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
        Alert.alert('Error', data.message ?? 'Could not initiate deletion');
        return;
      }

      // ── BLOCKED: some patients have no other caregivers ──
      if (data.status === 'BLOCKED') {
        const patientNames = (data.blockedPatients ?? [])
          .map((p: { name: string; surname: string }) => `• ${p.name} ${p.surname}`)
          .join('\n');
        Alert.alert(
          'Cannot Delete Account',
          `You cannot delete your account yet. The following patient(s) have no other caregivers:\n\n${patientNames}\n\nPlease invite someone to take over or delete the patient profile first.`,
          [{ text: 'Got it' }],
        );
        return;
      }

      // Refresh profile so SecureStore has updated status (for dashboard banner)
      await loadProfile(token);

      if (data.status === 'NO_DELEGATION_NEEDED') {
        // No secondaries — go straight to final confirm
        Alert.alert(
          'Confirm Deletion',
          'Your account and all patient data you manage will be permanently deleted after a 10-day grace period. This cannot be undone.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete Account', style: 'destructive', onPress: () => confirmFinalDeletion() },
          ],
        );
      } else {
        await loadDeletionStatus(token);
        openDeletionModal();
      }
    } catch {
      Alert.alert('Error', 'Failed to connect to the server');
    }
  };

  const confirmFinalDeletion = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/auth/confirm-deletion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setDeletionModalVisible(false);
        await clearAuth();
        navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }));
      } else {
        Alert.alert('Error', data.message ?? 'Could not confirm deletion');
      }
    } catch {
      Alert.alert('Error', 'Failed to connect to the server');
    }
  };

  const closeDeletionModal = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 600, duration: 250, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      slideAnim.setValue(600);
      setDeletionModalVisible(false);
    });
  };

  const openDeletionModal = () => {
    slideAnim.setValue(600);
    backdropAnim.setValue(0);
    setDeletionModalVisible(true);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 120 }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const cancelDeletionRequest = async () => {
    if (!token) return;
    try {
      await fetch(`${API_BASE_URL}/auth/cancel-deletion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeletion({ status: 'IDLE', isPrimaryForAnyPatient: deletion.isPrimaryForAnyPatient, pendingRequests: [], acceptedRequests: [], declinedRequests: [] });
      setDeletionModalVisible(false);
      // Refresh profile so dashboard banner disappears
      await loadProfile(token);
    } catch { /* ignore */ }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const initials = profile
    ? `${profile.name?.[0] ?? ''}${profile.surname?.[0] ?? ''}`.toUpperCase()
    : '?';

  if (isLoading) {
    return (
      <View style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
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
                  <ActivityIndicator color={colors.textLight} />
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
            <Text style={styles.avatarName}>{profile?.name} {profile?.surname}</Text>
            <Text style={styles.avatarEmail}>{profile?.email}</Text>
          </View>

          {/* ── Profile ── */}
          <Text style={styles.sectionLabel}>Personal Information</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.row} onPress={openEditName} activeOpacity={0.7}>
              <View style={[styles.rowIcon, { backgroundColor: 'rgba(45,79,62,0.1)' }]}>
                <AppIcon iosName="person" androidFallback="👤" size={18} color={colors.secondary} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Full Name</Text>
                <Text style={styles.rowValue}>{profile?.name} {profile?.surname}</Text>
              </View>
              <AppIcon iosName="chevron.right" androidFallback="›" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity style={styles.row} onPress={openEmailModal} activeOpacity={0.7}>
              <View style={[styles.rowIcon, { backgroundColor: 'rgba(180,174,232,0.2)' }]}>
                <AppIcon iosName="envelope" androidFallback="✉" size={18} color={colors.primary} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Email Address</Text>
                <Text style={styles.rowValue} numberOfLines={1}>{profile?.email}</Text>
              </View>
              <AppIcon iosName="chevron.right" androidFallback="›" size={16} color={colors.textMuted} />
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
              <AppIcon iosName="chevron.right" androidFallback="›" size={16} color={colors.textMuted} />
            </TouchableOpacity>
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
                          color={isCurrent ? colors.secondary : colors.textMuted} />
                      </View>
                      <View style={styles.rowContent}>
                        <Text style={styles.rowLabel}>
                          {label}
                          {isCurrent && <Text style={styles.currentBadge}> · This device</Text>}
                        </Text>
                        <Text style={styles.rowValue}>
                          {isCurrent ? 'Last active: Now' : `Signed in ${date}`}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => revokeSession(session.id)} style={styles.revokeBtn} activeOpacity={0.7}>
                        <Text style={styles.revokeBtnText}>{isCurrent ? 'Sign Out' : 'Log Out'}</Text>
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
                <Text style={[styles.rowLabel, { color: '#C0392B' }]}>Sign Out</Text>
                <Text style={styles.rowValue}>Sign out of this device</Text>
              </View>
              <AppIcon iosName="chevron.right" androidFallback="›" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.dangerCard}>
            {deletion.status === 'PENDING' || deletion.status === 'ALL_ACCEPTED' || deletion.status === 'SOME_DECLINED' ? (
              <TouchableOpacity style={styles.row} onPress={openDeletionModal} activeOpacity={0.7}>
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
              placeholder="First name" placeholderTextColor={colors.textMuted} autoCapitalize="words" autoCorrect={false} spellCheck={false} />
            <TextInput style={[styles.modalInput, { marginTop: 10 }]} value={editSurname} onChangeText={setEditSurname}
              placeholder="Last name" placeholderTextColor={colors.textMuted} autoCapitalize="words" autoCorrect={false} spellCheck={false} />
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
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showEmailPw}
                    autoCorrect={false}
                    spellCheck={false}
                    autoFocus
                  />
                  <TouchableOpacity onPress={() => setShowEmailPw(v => !v)} style={styles.modalEyeBtn}>
                    <AppIcon iosName={showEmailPw ? 'eye.slash' : 'eye'} androidFallback={showEmailPw ? '🙈' : '👁'} size={18} color={colors.textMuted} />
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
                  placeholderTextColor={colors.textMuted}
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
                placeholder="Current password" placeholderTextColor={colors.textMuted} secureTextEntry={!showCurrentPw} autoCorrect={false} spellCheck={false} />
              <TouchableOpacity onPress={() => setShowCurrentPw(v => !v)} style={styles.modalEyeBtn}>
                <AppIcon iosName={showCurrentPw ? 'eye.slash' : 'eye'} androidFallback={showCurrentPw ? '🙈' : '👁'} size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={[styles.modalInputRow, { marginTop: 10 }]}>
              <TextInput style={styles.modalInputInner} value={newPassword} onChangeText={setNewPassword}
                placeholder="New password" placeholderTextColor={colors.textMuted} secureTextEntry={!showNewPw} autoCorrect={false} spellCheck={false} />
              <TouchableOpacity onPress={() => setShowNewPw(v => !v)} style={styles.modalEyeBtn}>
                <AppIcon iosName={showNewPw ? 'eye.slash' : 'eye'} androidFallback={showNewPw ? '🙈' : '👁'} size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={[styles.modalInputRow, { marginTop: 10 }]}>
              <TextInput style={styles.modalInputInner} value={confirmPassword} onChangeText={setConfirmPassword}
                placeholder="Confirm new password" placeholderTextColor={colors.textMuted} secureTextEntry={!showConfirmPw} autoCorrect={false} spellCheck={false} />
              <TouchableOpacity onPress={() => setShowConfirmPw(v => !v)} style={styles.modalEyeBtn}>
                <AppIcon iosName={showConfirmPw ? 'eye.slash' : 'eye'} androidFallback={showConfirmPw ? '🙈' : '👁'} size={18} color={colors.textMuted} />
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

      {/* ── Deletion Status Modal ── */}
      <Modal visible={deletionModalVisible} transparent animationType="none" onRequestClose={closeDeletionModal}>
        <TouchableWithoutFeedback onPress={closeDeletionModal}>
          <View style={styles.delegationOverlay}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: backdropAnim }]} />
            <TouchableWithoutFeedback onPress={() => {}}>
              <Animated.View style={[styles.delegationSheet, { transform: [{ translateY: slideAnim }] }]}>
                {/* Drag handle */}
                <View {...panResponder.panHandlers} style={styles.sheetDragArea}>
                  <View style={styles.sheetDragHandle} />
                </View>

            {deletion.status === 'PENDING' && (
              <>
                <AppIcon iosName="clock" androidFallback="⏳" size={32} color="#b45309" />
                <Text style={[styles.delegationTitle, { marginTop: 12 }]}>Transferring Primary Roles</Text>
                <Text style={styles.delegationBody}>
                  You're still the primary caregiver. Your patients and access are unchanged. Nothing happens until you click "Finalize" after everyone accepts.
                </Text>
                <View style={styles.delegationList}>
                  {deletion.pendingRequests.map(r => (
                    <View key={r.id} style={styles.delegationRow}>
                      <View style={styles.delegationAvatar}>
                        <Text style={styles.delegationAvatarText}>{r.toCaregiver.name[0]?.toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.delegationName}>{r.toCaregiver.name} {r.toCaregiver.surname}</Text>
                        <Text style={{ fontSize: 12, color: colors.textMuted, fontFamily: typography.fontFamily.regular }}>Waiting to accept…</Text>
                      </View>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.delegationCancelBtn, { backgroundColor: colors.secondary, borderRadius: 14, marginTop: 4 }]}
                  onPress={closeDeletionModal}
                >
                  <Text style={[styles.delegationCancelText, { color: '#fff' }]}>Continue Using App</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.delegationCancelBtn, { marginTop: 8 }]} onPress={cancelDeletionRequest}>
                  <Text style={[styles.delegationCancelText, { color: '#C0392B' }]}>Cancel Account Deletion</Text>
                </TouchableOpacity>
              </>
            )}

            {deletion.status === 'ALL_ACCEPTED' && (
              <>
                <AppIcon iosName="checkmark.seal.fill" androidFallback="✅" size={36} color="#27ae60" />
                <Text style={[styles.delegationTitle, { marginTop: 12 }]}>Ready to Finalize</Text>
                <Text style={styles.delegationBody}>
                  All caregivers accepted. The moment you tap "Finalize" below, the roles swap and your account is deactivated. You are still the primary right now.
                </Text>
                <View style={styles.delegationList}>
                  {deletion.acceptedRequests.map(r => (
                    <View key={r.id} style={styles.delegationRow}>
                      <View style={[styles.delegationAvatar, { backgroundColor: 'rgba(39,174,96,0.15)' }]}>
                        <Text style={[styles.delegationAvatarText, { color: '#27ae60' }]}>{r.toCaregiver.name[0]?.toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.delegationName}>{r.toCaregiver.name} {r.toCaregiver.surname}</Text>
                        <Text style={{ fontSize: 12, color: '#27ae60', fontFamily: typography.fontFamily.regular }}>Will become primary</Text>
                      </View>
                    </View>
                  ))}
                </View>
                <Text style={[styles.delegationBody, { fontSize: 12, color: colors.textMuted, marginTop: 4 }]}>
                  After finalizing, your account enters a 10-day grace period before permanent removal. You can restore it anytime during that window.
                </Text>
                <TouchableOpacity style={[styles.delegationCancelBtn, { backgroundColor: '#27ae60', borderRadius: 14, marginTop: 8 }]} onPress={confirmFinalDeletion}>
                  <Text style={[styles.delegationCancelText, { color: '#fff' }]}>Finalize — Transfer Roles</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.delegationCancelBtn, { marginTop: 8 }]} onPress={cancelDeletionRequest}>
                  <Text style={styles.delegationCancelText}>Cancel — Stay as Primary</Text>
                </TouchableOpacity>
              </>
            )}

            {deletion.status === 'SOME_DECLINED' && (
              <>
                <AppIcon iosName="exclamationmark.triangle.fill" androidFallback="⚠" size={36} color="#C0392B" />
                <Text style={[styles.delegationTitle, { marginTop: 12 }]}>Action Required</Text>
                <Text style={styles.delegationBody}>
                  A caregiver has declined the handover request. You need to pick another caregiver or cancel the deletion.
                </Text>
                <View style={styles.delegationList}>
                  {deletion.declinedRequests.map(r => (
                    <View key={r.id} style={styles.delegationRow}>
                      <View style={[styles.delegationAvatar, { backgroundColor: 'rgba(231,76,60,0.12)' }]}>
                        <Text style={[styles.delegationAvatarText, { color: '#C0392B' }]}>{r.toCaregiver.name[0]?.toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.delegationName}>{r.toCaregiver.name} {r.toCaregiver.surname}</Text>
                        <Text style={{ fontSize: 12, color: '#C0392B', fontFamily: typography.fontFamily.regular }}>Declined</Text>
                      </View>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.delegationCancelBtn, { backgroundColor: colors.secondary, borderRadius: 14, marginTop: 8 }]}
                  onPress={() => {
                    setDeletionModalVisible(false);
                    // Navigate to patients to let user manage from there
                    router.push('/(caregiver-tabs)/patients');
                  }}
                >
                  <Text style={[styles.delegationCancelText, { color: '#fff' }]}>Pick Another Caregiver</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.delegationCancelBtn, { marginTop: 8 }]} onPress={cancelDeletionRequest}>
                  <Text style={[styles.delegationCancelText, { color: '#C0392B' }]}>Cancel Account Deletion</Text>
                </TouchableOpacity>
              </>
            )}

              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const CARD_SHADOW = isIOS ? {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
} : { elevation: 1 };

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.neutral },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  scrollContent: { padding: 20, paddingTop: 24, paddingBottom: 60 },

  avatarSection: { alignItems: 'center', marginBottom: 32, marginTop: 8 },
  avatarWrapper: { position: 'relative', marginBottom: 12 },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 34,
    color: colors.textLight,
    letterSpacing: 1,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.neutral,
  },
  avatarName: { fontFamily: typography.fontFamily.bold, fontSize: 20, color: colors.textDark },
  avatarEmail: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: colors.textMuted, marginTop: 2 },

  sectionLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 4,
  },

  card: {
    backgroundColor: isIOS ? 'rgba(255,255,255,0.7)' : '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    ...CARD_SHADOW,
  },
  dangerCard: {
    backgroundColor: isIOS ? 'rgba(255,255,255,0.7)' : '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(231,76,60,0.2)',
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
  rowLabel: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: colors.textDark },
  rowValue: { fontFamily: typography.fontFamily.regular, fontSize: 13, color: colors.textMuted, marginTop: 1 },
  currentBadge: { fontFamily: typography.fontFamily.medium, fontSize: 12, color: colors.secondary },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.07)', marginLeft: 64 },
  emptySessionsText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
    padding: 16,
    textAlign: 'center',
  },

  revokeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(231,76,60,0.08)',
  },
  revokeBtnText: { fontFamily: typography.fontFamily.medium, fontSize: 13, color: '#C0392B' },

  logoutOthersBtn: {
    marginBottom: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(231,76,60,0.08)',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(231,76,60,0.2)',
  },
  logoutOthersText: { fontFamily: typography.fontFamily.medium, fontSize: 14, color: '#C0392B' },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  modalTitle: { fontFamily: typography.fontFamily.bold, fontSize: 18, color: colors.textDark, marginBottom: 6 },
  modalSubtitle: { fontFamily: typography.fontFamily.regular, fontSize: 13, color: colors.textMuted, marginBottom: 16 },
  modalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: colors.textDark,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  modalInputInner: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: colors.textDark,
  },
  modalEyeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: { fontFamily: typography.fontFamily.regular, fontSize: 13, color: '#C0392B', marginTop: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  modalCancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.06)' },
  modalCancelText: { fontFamily: typography.fontFamily.medium, fontSize: 14, color: colors.textMuted },
  modalSaveBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.secondary },
  modalSaveText: { fontFamily: typography.fontFamily.medium, fontSize: 14, color: '#FFFFFF' },

  // Delegation
  delegationOverlay: { flex: 1, justifyContent: 'flex-end' },
  delegationSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  delegationProgressTrack: {
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 2,
    marginBottom: 20,
    overflow: 'hidden',
  },
  delegationProgressFill: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },
  delegationStep: { fontFamily: typography.fontFamily.regular, fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  delegationTitle: { fontFamily: typography.fontFamily.bold, fontSize: 20, color: colors.textDark, marginBottom: 8 },
  delegationBody: { fontFamily: typography.fontFamily.regular, fontSize: 15, color: colors.textMuted, marginBottom: 20, lineHeight: 22 },
  delegationList: { gap: 8, marginBottom: 20 },
  delegationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    gap: 12,
  },
  delegationAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  delegationAvatarText: { fontFamily: typography.fontFamily.bold, fontSize: 16, color: colors.textLight },
  delegationName: { flex: 1, fontFamily: typography.fontFamily.medium, fontSize: 15, color: colors.textDark },
  delegationCancelBtn: { alignItems: 'center', paddingVertical: 12 },
  delegationCancelText: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: colors.textMuted },
  sheetDragArea: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 12,
    marginTop: -8,
  },
  sheetDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
});
