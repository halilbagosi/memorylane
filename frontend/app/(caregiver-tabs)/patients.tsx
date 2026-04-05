import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Platform, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { API_BASE_URL } from '../../src/config/api';
import { getToken, getCaregiverInfo, clearAuth, CaregiverInfo } from '../../src/utils/auth';
import { AdaptiveButton } from '../../src/components/AdaptiveButton';
import { AdaptiveCard } from '../../src/components/AdaptiveCard';
import { AdaptiveBadge } from '../../src/components/AdaptiveBadge';
import { AppIcon } from '../../src/components/AppIcon';
import { M3BottomSheet } from '../../src/components/M3BottomSheet';
import { M3Dialog, type M3DialogAction } from '../../src/components/M3Dialog';

const isIOS = Platform.OS === 'ios';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PatientItem {
  id: string;
  name: string;
  surname: string;
  dateOfBirth: string | null;
  isPrimary: boolean;
  patientJoinCode: string;
  paired: boolean;
}

function calculateAge(dateOfBirth: string): number {
  const birthday = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birthday.getFullYear();
  const monthDiff = today.getMonth() - birthday.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthday.getDate())) {
    age--;
  }
  return age;
}

export default function PatientsTab() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [caregiver, setCaregiver] = useState<CaregiverInfo | null>(null);
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientItem | null>(null);

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
      const storedToken = await getToken();
      const storedCaregiver = await getCaregiverInfo();

      if (!storedToken) {
        router.replace('/login');
        return;
      }

      setToken(storedToken);
      setCaregiver(storedCaregiver);
    })();
  }, []);

  const fetchPatients = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/patients/my-list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (response.ok) {
        const list = Array.isArray(data) ? data : (data.patients || []);
        setPatients(list);
      } else if (response.status === 401) {
        await clearAuth();
        router.replace('/login');
      }
    } catch (err) {
      // Silent for now
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (token) fetchPatients();
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (token) fetchPatients();
    }, [token])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchPatients();
  };

  const handleLogout = async () => {
    try {
      if (token) {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Even if logout API fails, clear locally
    }
    await clearAuth();
    router.replace('/login');
  };

  const handleDelete = (patient: PatientItem) => {
    if (!patient.isPrimary) {
      showDialog('Permission Denied', 'Only the primary caregiver can remove a patient profile.', [
        { label: 'OK', onPress: dismissDialog },
      ]);
      return;
    }

    showDialog(
      'Remove Patient',
      `Are you sure you want to remove ${patient.name} ${patient.surname}? This action cannot be undone.`,
      [
        { label: 'Cancel', onPress: dismissDialog },
        {
          label: 'Remove',
          destructive: true,
          onPress: async () => {
            dismissDialog();
            try {
              const response = await fetch(`${API_BASE_URL}/patients/${patient.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (response.ok) {
                setPatients(prev => prev.filter(p => p.id !== patient.id));
              } else {
                const data = await response.json();
                showDialog('Error', data.message || 'Could not remove patient', [
                  { label: 'OK', onPress: dismissDialog },
                ]);
              }
            } catch {
              showDialog('Error', 'Failed to connect to the backend', [
                { label: 'OK', onPress: dismissDialog },
              ]);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>My Patients</Text>
          <Text style={styles.headerSubtitle}>
            {caregiver ? `Welcome, ${caregiver.name}` : 'Caregiver Dashboard'}
          </Text>
        </View>
        <AdaptiveButton
          title="Logout"
          variant="danger"
          onPress={handleLogout}
          style={styles.logoutBtn}
          textStyle={styles.logoutText}
        />
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionCard, isIOS ? styles.iosActionCard : styles.androidActionCard]}
          onPress={() => router.push('/add-patient')}
          activeOpacity={0.85}
        >
          <View style={[styles.actionIconCircle, { backgroundColor: 'rgba(45, 79, 62, 0.12)' }]}>
            <AppIcon iosName="plus" androidFallback="+" size={22} color={colors.secondary} weight="semibold" />
          </View>
          <Text style={styles.actionLabel}>Add Patient</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, isIOS ? styles.iosActionCard : styles.androidActionCard]}
          onPress={() => {}}
          activeOpacity={0.85}
        >
          <View style={[styles.actionIconCircle, { backgroundColor: 'rgba(180, 140, 100, 0.15)' }]}>
            <AppIcon iosName="qrcode.viewfinder" androidFallback="QR" size={22} color="#8B7355" />
          </View>
          <Text style={styles.actionLabel}>Join Space</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : patients.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <AppIcon iosName="person.2.slash" androidFallback="--" size={28} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No patients yet</Text>
          <Text style={styles.emptyDesc}>
            Tap "Add Patient" above to create a patient profile and start building their memory lane.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {patients.map((patient) => (
            <TouchableOpacity
              key={patient.id}
              activeOpacity={0.8}
              onPress={() => setSelectedPatient(patient)}
            >
              <AdaptiveCard
                style={styles.patientCard}
                backgroundColor={isIOS ? 'rgba(255,255,255,0.55)' : colors.neutralLight}
              >
                <View style={styles.patientInfo}>
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>
                      {patient.name?.[0]?.toUpperCase() || '?'}
                    </Text>
                  </View>
                  <View style={styles.patientDetails}>
                    <Text style={styles.patientName}>
                      {patient.name} {patient.surname}
                    </Text>
                    <View style={styles.tagRow}>
                      {patient.dateOfBirth && (
                        <Text style={styles.ageTag}>
                          Age {calculateAge(patient.dateOfBirth)}
                        </Text>
                      )}
                      <AdaptiveBadge
                        label={patient.isPrimary ? 'Primary' : 'Secondary'}
                        color={patient.isPrimary ? colors.secondary : '#7B73C0'}
                        backgroundColor={patient.isPrimary ? 'rgba(45, 79, 62, 0.12)' : 'rgba(180, 174, 232, 0.18)'}
                      />
                      <AdaptiveBadge
                        label={patient.paired ? 'Linked' : 'Not linked'}
                        color={patient.paired ? '#4CAF50' : '#FF9800'}
                        backgroundColor={patient.paired ? 'rgba(76, 175, 80, 0.12)' : 'rgba(255, 152, 0, 0.12)'}
                      />
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.deleteBtn, !patient.isPrimary && styles.deleteBtnDisabled]}
                  onPress={() => handleDelete(patient)}
                  activeOpacity={0.7}
                >
                  <AppIcon
                    iosName="trash"
                    androidFallback="X"
                    size={18}
                    color={patient.isPrimary ? '#e74c3c' : 'rgba(0,0,0,0.2)'}
                  />
                </TouchableOpacity>
              </AdaptiveCard>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Patient Detail Bottom Sheet */}
      <M3BottomSheet
        visible={!!selectedPatient}
        onClose={() => setSelectedPatient(null)}
      >
        <PatientDetailContent
          patient={selectedPatient}
          onClose={() => setSelectedPatient(null)}
        />
      </M3BottomSheet>

      {/* Custom Dialog */}
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

function PatientDetailContent({ patient, onClose }: { patient: PatientItem | null; onClose: () => void }) {
  if (!patient) return null;

  return (
    <View style={styles.sheetContainer}>
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>{patient.name} {patient.surname}</Text>
        <TouchableOpacity onPress={onClose} style={styles.sheetCloseBtn}>
          <AppIcon iosName="xmark.circle.fill" androidFallback="X" size={28} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.statusRow}>
        <View style={[
          styles.statusDot,
          { backgroundColor: patient.paired ? '#4CAF50' : '#FF9800' },
        ]} />
        <Text style={styles.statusText}>
          {patient.paired ? 'Patient device linked' : 'Waiting for patient to scan code'}
        </Text>
      </View>

      <View style={styles.qrSection}>
        <AdaptiveCard
          style={styles.qrCard}
          backgroundColor={isIOS ? 'rgba(255,255,255,0.7)' : '#FFFFFF'}
        >
          <QRCode
            value={patient.patientJoinCode}
            size={SCREEN_WIDTH * 0.45}
            backgroundColor="transparent"
            color={colors.textDark}
          />
        </AdaptiveCard>

        <Text style={styles.qrLabel}>Scan this code on the patient's device</Text>

        <View style={styles.codeContainer}>
          <Text style={styles.codePrefix}>Join Code</Text>
          <View style={styles.codeBadge}>
            {patient.patientJoinCode.split('').map((char, i) => (
              <View key={i} style={styles.codeCharBox}>
                <Text style={styles.codeChar}>{char}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <AdaptiveButton
        title="Close"
        variant="outlined"
        onPress={onClose}
        color={colors.secondary}
        style={{ marginTop: 24, alignSelf: 'stretch' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.neutral },

  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: { flex: 1 },
  headerTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 26,
    color: colors.textDark,
  },
  headerSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
  },
  logoutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logoutText: {
    fontSize: 13,
    textTransform: 'none',
    letterSpacing: 0,
  },

  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 12,
    marginTop: 12,
    marginBottom: 20,
  },
  actionCard: {
    flex: 1,
    padding: 18,
    alignItems: 'center',
  },
  iosActionCard: {
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  androidActionCard: {
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    elevation: 1,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  actionIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textDark,
  },

  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(180, 174, 232, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: colors.textDark,
    marginBottom: 8,
  },
  emptyDesc: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },

  listContainer: { flex: 1 },
  listContent: { paddingHorizontal: 24, paddingBottom: 40 },
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginBottom: 12,
  },
  patientInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: colors.textLight,
  },
  patientDetails: { flex: 1 },
  patientName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: colors.textDark,
    marginBottom: 4,
  },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ageTag: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
  },

  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(231, 76, 60, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtnDisabled: { backgroundColor: 'rgba(0,0,0,0.03)' },

  // Sheet content
  sheetContainer: {
    padding: 24,
    paddingTop: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 22,
    color: colors.textDark,
    flex: 1,
  },
  sheetCloseBtn: {
    padding: 4,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: isIOS ? 'rgba(255,255,255,0.45)' : 'rgba(0, 0, 0, 0.04)',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textDark,
  },

  qrSection: {
    alignItems: 'center',
  },
  qrCard: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 14,
    textAlign: 'center',
  },

  codeContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  codePrefix: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  codeBadge: {
    flexDirection: 'row',
    gap: 6,
  },
  codeCharBox: {
    width: 38,
    height: 44,
    borderRadius: isIOS ? 10 : 12,
    backgroundColor: isIOS ? 'rgba(45, 79, 62, 0.08)' : 'rgba(45, 79, 62, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: isIOS ? StyleSheet.hairlineWidth : 1,
    borderColor: 'rgba(45, 79, 62, 0.15)',
  },
  codeChar: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: colors.secondary,
    letterSpacing: 0,
  },
});
