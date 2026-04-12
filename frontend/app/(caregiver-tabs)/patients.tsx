import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Platform, Dimensions, TextInput, Modal, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useNavigation } from 'expo-router';
import { CommonActions } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { API_BASE_URL } from '../../src/config/api';
import { getToken, getCaregiverInfo, saveCaregiverInfo, clearAuth, CaregiverInfo } from '../../src/utils/auth';
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
  primaryCaregiver: { id: string; name: string; surname: string; avatarUrl: string | null } | null;
  secondaryCaregivers: { id: string; name: string; surname: string; avatarUrl: string | null }[];
  hasPendingRoleRequest?: boolean;
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
  const navigation = useNavigation();

  const [token, setToken] = useState<string | null>(null);
  const [caregiver, setCaregiver] = useState<CaregiverInfo | null>(null);
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Resignation progress pill
  const [resignProgress, setResignProgress] = useState<{
    total: number;
    accepted: number;
    allAccepted: boolean;
    hasDeclined: boolean;
  } | null>(null);
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

      // Fetch fresh caregiver info immediately so status (e.g. PENDING_DELETION)
      // is always up to date without needing to visit the account screen first.
      try {
        const res = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        if (res.ok) {
          const fresh = await res.json();
          const updated = { ...storedCaregiver, ...fresh };
          setCaregiver(updated);
          await saveCaregiverInfo(updated);
        }
      } catch { /* silent — stale cache is fine as fallback */ }
    })();
  }, []);

  const fetchResignProgress = async (tok: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/deletion-status`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) { setResignProgress(null); return; }
      const data = await res.json();
      const total = (data.patients ?? []).length;
      const accepted = (data.acceptedRequests ?? []).length;
      if (total === 0) { setResignProgress(null); return; }
      setResignProgress({
        total,
        accepted,
        allAccepted: !!data.allDelegationsResolved,
        hasDeclined: !!data.hasSomeDeclined,
      });
    } catch { setResignProgress(null); }
  };

  const fetchPatients = async () => {
    if (!token) return;
    try {
      const [patientsRes, pendingRes] = await Promise.all([
        fetch(`${API_BASE_URL}/patients/my-list`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/auth/role-requests/pending-by-me`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (patientsRes.status === 401) {
        await clearAuth();
        router.replace('/login');
        return;
      }

      if (patientsRes.ok) {
        const data = await patientsRes.json();
        const pendingIds: string[] = pendingRes.ok ? await pendingRes.json() : [];
        const list: PatientItem[] = Array.isArray(data) ? data : (data.patients || []);
        setPatients(list.map(p => ({ ...p, hasPendingRoleRequest: pendingIds.includes(p.id) })));
      }
    } catch {
      // silent
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
      if (token) {
        fetchPatients();
        getCaregiverInfo().then(info => {
          if (info) {
            setCaregiver(info);
            if (info.status === 'PENDING_DELETION') fetchResignProgress(token);
            else setResignProgress(null);
          }
        });
      }
    }, [token])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchPatients();
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

  const handleUnpair = (patient: PatientItem) => {
    showDialog(
      'Unpair Device',
      `This will disconnect ${patient.name}'s current device. They will need to scan the QR code again on a new device.`,
      [
        { label: 'Cancel', onPress: dismissDialog },
        {
          label: 'Unpair',
          destructive: true,
          onPress: async () => {
            dismissDialog();
            try {
              const response = await fetch(`${API_BASE_URL}/patients/${patient.id}/unpair`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (response.ok) {
                setPatients(prev =>
                  prev.map(p => p.id === patient.id ? { ...p, paired: false } : p)
                );
                setSelectedPatient(prev => prev?.id === patient.id ? { ...prev, paired: false } : prev);
              } else {
                const data = await response.json();
                showDialog('Error', data.message || 'Could not unpair device', [
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

  const handleLeave = (patient: PatientItem) => {
    showDialog(
      'Leave Care Team',
      `You will no longer have access to ${patient.name}'s profile. You can be re-added by the primary caregiver.`,
      [
        { label: 'Cancel', onPress: dismissDialog },
        {
          label: 'Leave',
          destructive: true,
          onPress: async () => {
            dismissDialog();
            try {
              const res = await fetch(`${API_BASE_URL}/patients/${patient.id}/leave`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                setPatients(prev => prev.filter(p => p.id !== patient.id));
                setSelectedPatient(null);
              } else {
                const data = await res.json();
                showDialog('Error', data.message || 'Could not leave care team', [{ label: 'OK', onPress: dismissDialog }]);
              }
            } catch {
              showDialog('Error', 'Failed to connect to the backend', [{ label: 'OK', onPress: dismissDialog }]);
            }
          },
        },
      ],
    );
  };

  const handleEditPatient = async (patient: PatientItem, newName: string, newSurname: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/patients/${patient.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), surname: newSurname.trim() }),
      });
      if (res.ok) {
        const updated = { ...patient, name: newName.trim(), surname: newSurname.trim() };
        setPatients(prev => prev.map(p => p.id === patient.id ? updated : p));
        setSelectedPatient(prev => prev?.id === patient.id ? updated : prev);
      } else {
        const data = await res.json();
        showDialog('Error', data.message || 'Could not update patient', [{ label: 'OK', onPress: dismissDialog }]);
      }
    } catch {
      showDialog('Error', 'Failed to connect to the backend', [{ label: 'OK', onPress: dismissDialog }]);
    }
  };

  const handleRequestPrimary = async (patient: PatientItem) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/role-requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: patient.id }),
      });
      const data = await res.json();
      if (res.ok) {
        // Mark locally so the button flips to "Request Pending" immediately
        setPatients(prev => prev.map(p => p.id === patient.id ? { ...p, hasPendingRoleRequest: true } : p));
        setSelectedPatient(prev => prev?.id === patient.id ? { ...prev, hasPendingRoleRequest: true } : prev);
      } else {
        showDialog('Error', data.message || 'Could not send request', [{ label: 'OK', onPress: dismissDialog }]);
      }
    } catch {
      showDialog('Error', 'Failed to connect to the backend', [{ label: 'OK', onPress: dismissDialog }]);
    }
  };

  const handleRemoveCaregiver = (patient: PatientItem, caregiverId: string, caregiverName: string) => {
    showDialog(
      'Remove Caregiver',
      `Remove ${caregiverName} from ${patient.name}'s care team? They will lose access to this patient's profile.`,
      [
        { label: 'Cancel', onPress: dismissDialog },
        {
          label: 'Remove',
          destructive: true,
          onPress: async () => {
            dismissDialog();
            try {
              const res = await fetch(`${API_BASE_URL}/patients/${patient.id}/caregivers/${caregiverId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                const updated = {
                  ...patient,
                  secondaryCaregivers: patient.secondaryCaregivers.filter(c => c.id !== caregiverId),
                };
                setPatients(prev => prev.map(p => p.id === patient.id ? updated : p));
                setSelectedPatient(prev => prev?.id === patient.id ? updated : prev);
              } else {
                const data = await res.json();
                showDialog('Error', data.message || 'Could not remove caregiver', [{ label: 'OK', onPress: dismissDialog }]);
              }
            } catch {
              showDialog('Error', 'Failed to connect to the backend', [{ label: 'OK', onPress: dismissDialog }]);
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
        <TouchableOpacity onPress={() => router.push('/account')} activeOpacity={0.8} style={styles.avatarBtn}>
          {caregiver?.avatarUrl ? (
            <Image source={{ uri: caregiver.avatarUrl }} style={styles.avatarBtnImg} />
          ) : (
            <View style={styles.avatarBtnCircle}>
              <Text style={styles.avatarBtnText}>
                {`${caregiver?.name?.[0] ?? ''}${caregiver?.surname?.[0] ?? ''}`.toUpperCase() || '?'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {caregiver?.status === 'PENDING_DELETION' && resignProgress && (
        <TouchableOpacity
          style={[
            styles.statusPill,
            resignProgress.allAccepted ? styles.pillGreen
            : resignProgress.hasDeclined ? styles.pillRed
            : styles.pillAmber,
          ]}
          onPress={() => router.push('/account?openDeletion=1')}
          activeOpacity={0.85}
        >
          <View style={[
            styles.pillDot,
            { backgroundColor: resignProgress.allAccepted ? '#6B8C6A' : resignProgress.hasDeclined ? '#C0392B' : '#6B6455' },
          ]} />
          <Text style={[
            styles.pillText,
            { color: resignProgress.allAccepted ? '#2E5233' : resignProgress.hasDeclined ? '#922B21' : '#4A4236' },
          ]}>
            {resignProgress.allAccepted
              ? 'Roles transferred · Ready to finalize'
              : resignProgress.hasDeclined
              ? 'Action required · tap to review'
              : `Transferring primary roles · ${resignProgress.accepted}/${resignProgress.total} accepted`}
          </Text>
          <AppIcon
            iosName="chevron.right"
            androidFallback="›"
            size={12}
            color={resignProgress.allAccepted ? '#2E5233' : resignProgress.hasDeclined ? '#922B21' : '#4A4236'}
          />
        </TouchableOpacity>
      )}

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
          onPress={() => router.push('/join-patient')}
          activeOpacity={0.85}
        >
          <View style={[styles.actionIconCircle, { backgroundColor: 'rgba(180, 140, 100, 0.15)' }]}>
            <AppIcon iosName="qrcode.viewfinder" androidFallback="QR" size={22} color="#8B7355" />
          </View>
          <Text style={styles.actionLabel}>Link to Patient</Text>
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
      ) : (() => {
        const primaryPatients = patients.filter(p => p.isPrimary);
        const secondaryPatients = patients.filter(p => !p.isPrimary);
        return (
          <ScrollView
            style={styles.listContainer}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          >
            {primaryPatients.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>My Patients</Text>
                {primaryPatients.map((patient) => (
                  <TouchableOpacity
                    key={patient.id}
                    activeOpacity={0.8}
                    onPress={() => setSelectedPatient(patient)}
                  >
                    <AdaptiveCard
                      style={styles.primaryPatientCard}
                      backgroundColor={isIOS ? 'rgba(224, 232, 227, 0.75)' : '#E8F0EC'}
                    >
                      {/* Top row: avatar + name + delete */}
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={styles.primaryAvatarCircle}>
                          <Text style={styles.primaryAvatarText}>
                            {patient.name?.[0]?.toUpperCase() || '?'}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.primaryPatientName}>
                            {patient.name} {patient.surname}
                          </Text>
                          {patient.dateOfBirth && (
                            <Text style={styles.patientAgeText}>
                              Age {calculateAge(patient.dateOfBirth)}
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => handleDelete(patient)}
                          activeOpacity={0.7}
                        >
                          <AppIcon iosName="trash" androidFallback="X" size={18} color="#C0392B" />
                        </TouchableOpacity>
                      </View>

                      {/* Paired status row */}
                      <View style={styles.pairedRow}>
                        <View style={[styles.pairedDot, { backgroundColor: patient.paired ? '#4CAF50' : '#FF9800' }]} />
                        <Text style={styles.pairedText}>
                          {patient.paired ? 'Device linked' : 'Waiting for device'}
                        </Text>
                      </View>

                      {/* Care team pills */}
                      {patient.secondaryCaregivers?.length > 0 && (
                        <>
                          <View style={styles.careTeamDivider} />
                          <Text style={styles.careTeamTitle}>Care Team</Text>
                          <View style={styles.careTeamPillsRow}>
                            {patient.secondaryCaregivers.map(c => (
                              <View key={c.id} style={styles.careTeamPill}>
                                <Text style={styles.careTeamPillText}>{c.name}</Text>
                              </View>
                            ))}
                          </View>
                        </>
                      )}
                    </AdaptiveCard>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {secondaryPatients.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, primaryPatients.length > 0 && { marginTop: 16 }]}>Supporting</Text>
                {secondaryPatients.map((patient) => (
                  <TouchableOpacity
                    key={patient.id}
                    activeOpacity={0.8}
                    onPress={() => setSelectedPatient(patient)}
                  >
                    <AdaptiveCard
                      style={styles.secondaryPatientCard}
                      backgroundColor={isIOS ? 'rgba(235, 232, 248, 0.7)' : '#EBE8F8'}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={styles.secondaryAvatarCircle}>
                          <Text style={styles.secondaryAvatarText}>
                            {patient.name?.[0]?.toUpperCase() || '?'}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            <Text style={styles.secondaryPatientName}>
                              {patient.name} {patient.surname}
                            </Text>
                            <AdaptiveBadge
                              label="Secondary"
                              color="#7B73C0"
                              backgroundColor="rgba(123, 115, 192, 0.15)"
                            />
                          </View>
                          {patient.primaryCaregiver && (
                            <Text style={styles.patientAgeText}>
                              Primary: {patient.primaryCaregiver.name} {patient.primaryCaregiver.surname}
                            </Text>
                          )}
                          <View style={[styles.pairedRow, { marginTop: 4 }]}>
                            <View style={[styles.pairedDot, { backgroundColor: patient.paired ? '#4CAF50' : '#FF9800' }]} />
                            <Text style={styles.pairedText}>
                              {patient.paired ? 'Device linked' : 'Waiting for device'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.secondaryArrow}>
                          <AppIcon iosName="chevron.right" androidFallback="›" size={18} color="#7B73C0" />
                        </View>
                      </View>
                    </AdaptiveCard>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </ScrollView>
        );
      })()}

      {/* Patient Detail Bottom Sheet */}
      <M3BottomSheet
        visible={!!selectedPatient}
        onClose={() => { if (!dialog.visible) setSelectedPatient(null); }}
      >
        <PatientDetailContent
          patient={selectedPatient}
          onClose={() => setSelectedPatient(null)}
          onUnpair={handleUnpair}
          onLeave={handleLeave}
          onDelete={handleDelete}
          onEdit={handleEditPatient}
          onRemoveCaregiver={handleRemoveCaregiver}
          onRequestPrimary={handleRequestPrimary}
          myId={caregiver?.id ?? ''}
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

function PatientDetailContent({
  patient, onClose, onUnpair, onLeave, onDelete, onEdit, onRemoveCaregiver, onRequestPrimary, myId,
}: {
  patient: PatientItem | null;
  onClose: () => void;
  onUnpair: (patient: PatientItem) => void;
  onLeave: (patient: PatientItem) => void;
  onDelete: (patient: PatientItem) => void;
  onEdit: (patient: PatientItem, newName: string, newSurname: string) => Promise<void>;
  onRemoveCaregiver: (patient: PatientItem, caregiverId: string, caregiverName: string) => void;
  onRequestPrimary: (patient: PatientItem) => void;
  myId: string;
}) {
  const [view, setView] = React.useState<'detail' | 'careTeam'>('detail');
  const [editModalVisible, setEditModalVisible] = React.useState(false);
  const [editName, setEditName] = React.useState('');
  const [editSurname, setEditSurname] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => { setView('detail'); }, [patient?.id]);

  if (!patient) return null;

  const secondaries = patient.secondaryCaregivers ?? [];

  const openEdit = () => {
    setEditName(patient.name);
    setEditSurname(patient.surname);
    setEditModalVisible(true);
  };

  const saveEdit = async () => {
    if (!editName.trim() || !editSurname.trim()) return;
    setSaving(true);
    await onEdit(patient, editName, editSurname);
    setSaving(false);
    setEditModalVisible(false);
  };

  /* ── Care Team view ── */
  if (view === 'careTeam') {
    return (
      <View style={styles.sheetContainer}>
        <View style={styles.sheetNavHeader}>
          <TouchableOpacity onPress={() => setView('detail')} style={styles.backBtn}>
            <AppIcon iosName="chevron.left" androidFallback="‹" size={20} color={colors.secondary} />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.sheetNavTitle}>Care Team</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Primary row — always shown */}
        {patient.primaryCaregiver && (
          <View style={styles.careTeamRow}>
            {patient.primaryCaregiver.avatarUrl ? (
              <Image source={{ uri: patient.primaryCaregiver.avatarUrl }} style={styles.careTeamMemberAvatarImg} />
            ) : (
              <View style={[styles.careTeamMemberAvatar, { backgroundColor: colors.secondary }]}>
                <Text style={styles.careTeamMemberAvatarText}>
                  {patient.primaryCaregiver.name[0]?.toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.careTeamName}>
                {patient.primaryCaregiver.name} {patient.primaryCaregiver.surname}
              </Text>
              <Text style={styles.careTeamRoleLabel}>Primary caregiver</Text>
            </View>
          </View>
        )}

        {/* Secondary rows */}
        {secondaries.length === 0 ? (
          <View style={styles.careTeamEmpty}>
            <Text style={styles.careTeamEmptyText}>No secondary caregivers yet.</Text>
          </View>
        ) : (
          secondaries.map(member => {
            const isMe = member.id === myId;
            return (
              <View key={member.id} style={styles.careTeamRow}>
                {member.avatarUrl ? (
                  <Image source={{ uri: member.avatarUrl }} style={styles.careTeamMemberAvatarImg} />
                ) : (
                  <View style={styles.careTeamMemberAvatar}>
                    <Text style={styles.careTeamMemberAvatarText}>{member.name[0]?.toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.careTeamName}>
                    {member.name} {member.surname}
                    {isMe && <Text style={styles.careTeamYouLabel}> · You</Text>}
                  </Text>
                </View>
                {/* Primary manages: Remove button */}
                {patient.isPrimary && (
                  <TouchableOpacity
                    style={styles.removeCaregiverBtn}
                    onPress={() => onRemoveCaregiver(patient, member.id, `${member.name} ${member.surname}`)}
                  >
                    <Text style={styles.removeCaregiverText}>Remove</Text>
                  </TouchableOpacity>
                )}
                {/* Secondary sees their own entry: Request / Pending */}
                {!patient.isPrimary && isMe && (
                  patient.hasPendingRoleRequest ? (
                    <View style={styles.careTeamPendingBadge}>
                      <Text style={styles.careTeamPendingText}>Pending</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.careTeamRequestBtn}
                      onPress={() => onRequestPrimary(patient)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.careTeamRequestText}>Request Primary</Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            );
          })
        )}
      </View>
    );
  }

  /* ── Main detail view ── */
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.sheetContainer} showsVerticalScrollIndicator={false}>

      {/* Edit Name Modal */}
      <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Patient Name</Text>
            <TextInput
              style={styles.editInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="First name"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
            />
            <TextInput
              style={[styles.editInput, { marginTop: 10 }]}
              value={editSurname}
              onChangeText={setEditSurname}
              placeholder="Last name"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveEdit} disabled={saving}>
                <Text style={styles.modalSaveText}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>{patient.name} {patient.surname}</Text>
        {patient.isPrimary && (
          <TouchableOpacity onPress={openEdit} style={styles.editIconBtn}>
            <AppIcon iosName="pencil" androidFallback="✎" size={18} color={colors.secondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Status */}
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: patient.paired ? '#4CAF50' : '#FF9800' }]} />
        <Text style={styles.statusText}>
          {patient.paired ? 'Patient device linked' : 'Waiting for patient to scan code'}
        </Text>
      </View>

      {/* QR / restricted */}
      {patient.isPrimary ? (
        <View style={styles.qrSection}>
          <AdaptiveCard style={styles.qrCard} backgroundColor={isIOS ? 'rgba(255,255,255,0.7)' : '#FFFFFF'}>
            <QRCode value={patient.patientJoinCode} size={SCREEN_WIDTH * 0.45} backgroundColor="transparent" color={colors.textDark} />
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
      ) : (
        <View style={styles.qrRestrictedBox}>
          <AppIcon iosName="lock.fill" androidFallback="🔒" size={28} color={colors.textMuted} />
          <Text style={styles.qrRestrictedTitle}>Invite Restricted</Text>
          <Text style={styles.qrRestrictedBody}>
            Only the primary caregiver can share the QR code or invite others to this patient's space.
          </Text>
        </View>
      )}

      {/* Action rows */}
      <View style={styles.actionsList}>
        {patient.isPrimary && patient.paired && (
          <TouchableOpacity style={styles.actionRow} onPress={() => onUnpair(patient)}>
            <View style={[styles.actionRowIcon, { backgroundColor: 'rgba(231,76,60,0.1)' }]}>
              <AppIcon iosName="iphone.slash" androidFallback="✕" size={18} color="#C0392B" />
            </View>
            <Text style={[styles.actionRowLabel, { color: '#C0392B' }]}>Unpair Device</Text>
            <AppIcon iosName="chevron.right" androidFallback="›" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {patient.isPrimary && (
          <TouchableOpacity style={styles.actionRow} onPress={() => setView('careTeam')}>
            <View style={[styles.actionRowIcon, { backgroundColor: 'rgba(45,79,62,0.1)' }]}>
              <AppIcon iosName="person.2" androidFallback="👥" size={18} color={colors.secondary} />
            </View>
            <Text style={styles.actionRowLabel}>Manage Care Team</Text>
            {secondaries.length > 0 && (
              <View style={styles.careTeamCount}>
                <Text style={styles.careTeamCountText}>{secondaries.length}</Text>
              </View>
            )}
            <AppIcon iosName="chevron.right" androidFallback="›" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {patient.isPrimary && (
          <TouchableOpacity style={styles.actionRow} onPress={() => { onClose(); onDelete(patient); }}>
            <View style={[styles.actionRowIcon, { backgroundColor: 'rgba(231,76,60,0.1)' }]}>
              <AppIcon iosName="trash" androidFallback="🗑" size={18} color="#C0392B" />
            </View>
            <Text style={[styles.actionRowLabel, { color: '#C0392B' }]}>Delete Patient</Text>
            <AppIcon iosName="chevron.right" androidFallback="›" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {!patient.isPrimary && (
          <TouchableOpacity style={styles.actionRow} onPress={() => setView('careTeam')} activeOpacity={0.7}>
            <View style={[styles.actionRowIcon, { backgroundColor: 'rgba(45,79,62,0.08)' }]}>
              <AppIcon iosName="person.2" androidFallback="👥" size={18} color={colors.secondary} />
            </View>
            <Text style={styles.actionRowLabel}>Care Team</Text>
            {patient.hasPendingRoleRequest && (
              <View style={styles.careTeamPendingBadge}>
                <Text style={styles.careTeamPendingText}>Request Pending</Text>
              </View>
            )}
            <AppIcon iosName="chevron.right" androidFallback="›" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {!patient.isPrimary && (
          <TouchableOpacity style={styles.actionRow} onPress={() => onLeave(patient)}>
            <View style={[styles.actionRowIcon, { backgroundColor: 'rgba(231,76,60,0.1)' }]}>
              <AppIcon iosName="arrow.right.square" androidFallback="←" size={18} color="#C0392B" />
            </View>
            <Text style={[styles.actionRowLabel, { color: '#C0392B' }]}>Leave Care Team</Text>
            <AppIcon iosName="chevron.right" androidFallback="›" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

    </ScrollView>
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
  avatarBtn: {
    padding: 2,
  },
  avatarBtnCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBtnImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarBtnText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: colors.textLight,
    letterSpacing: 0.5,
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

  qrRestrictedBox: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: isIOS ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.03)',
    gap: 10,
  },
  qrRestrictedTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: colors.textDark,
  },
  qrRestrictedBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryCaregiverHint: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  careTeamSection: {
    marginTop: 16,
    alignSelf: 'stretch',
  },
  careTeamTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  careTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  careTeamName: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: colors.textDark,
    flex: 1,
  },
  makePrimaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(45, 79, 62, 0.10)',
  },
  makePrimaryText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.secondary,
  },
  careTeamPickerHint: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 6,
  },
  careTeamPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(45, 79, 62, 0.07)',
    marginBottom: 6,
  },
  careTeamPickerName: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: colors.textDark,
  },
  careTeamPickerCancel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    paddingVertical: 6,
  },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pillAmber: { backgroundColor: '#E2DFCF' },
  pillGreen: { backgroundColor: '#D8E8D8' },
  pillRed: { backgroundColor: '#FADBD8' },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    flexShrink: 0,
  },
  pillText: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    letterSpacing: 0.1,
  },

  sectionLabel: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },


  // Primary patient card
  primaryPatientCard: {
    padding: 18,
    borderRadius: 20,
    marginBottom: 12,
  },
  primaryAvatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(45,79,62,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  primaryAvatarText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 22,
    color: colors.secondary,
  },
  primaryPatientName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: colors.textDark,
  },
  patientAgeText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  pairedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 6,
  },
  pairedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pairedText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  careTeamDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginTop: 12,
    marginBottom: 8,
  },
  careTeamPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  careTeamPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(45,79,62,0.1)',
  },
  careTeamPillText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.secondary,
  },

  // Secondary patient card
  secondaryPatientCard: {
    padding: 14,
    borderRadius: 18,
    marginBottom: 10,
  },
  secondaryAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(123,115,192,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  secondaryAvatarText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: '#7B73C0',
  },
  secondaryPatientName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 17,
    color: colors.textDark,
  },
  secondaryArrow: {
    marginLeft: 'auto' as any,
  },

  // Delegation flow modal
  delegationOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  delegationSheet: {
    backgroundColor: isIOS ? 'rgba(248,248,248,0.98)' : '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  delegationProgressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginBottom: 20,
    overflow: 'hidden',
  },
  delegationProgressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.secondary,
  },
  delegationStep: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  delegationTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 22,
    color: colors.textDark,
    marginBottom: 8,
  },
  delegationBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: 20,
  },
  delegationList: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: isIOS ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.03)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.07)',
    marginBottom: 16,
  },
  delegationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  delegationAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(45,79,62,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  delegationAvatarText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: colors.secondary,
  },
  delegationName: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: 16,
    color: colors.textDark,
  },
  delegationCancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  delegationCancelText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: colors.textMuted,
  },

  deleteAccountBtn: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  deleteAccountText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: '#C0392B',
  },

  // Care Team nav view
  sheetNavHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 60,
  },
  backBtnText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: colors.secondary,
  },
  sheetNavTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: colors.textDark,
  },
  careTeamEmpty: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  careTeamEmptyText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: colors.textMuted,
  },
  careTeamMemberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(45,79,62,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  careTeamMemberAvatarText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: colors.secondary,
  },
  careTeamMemberAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },

  // Action list rows
  actionsList: {
    marginTop: 20,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: isIOS ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.03)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.07)',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  actionRowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionRowLabel: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: colors.textDark,
  },
  careTeamCount: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(45,79,62,0.12)',
    marginRight: 4,
  },
  careTeamCountText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: colors.secondary,
  },

  // Edit name modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%',
    borderRadius: 20,
    padding: 24,
    backgroundColor: isIOS ? 'rgba(248,248,248,0.98)' : '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  modalTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: colors.textDark,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
  },
  modalCancelText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: colors.textMuted,
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    alignItems: 'center',
  },
  modalSaveText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: '#FFFFFF',
  },

  // Edit mode
  editInput: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 16,
    color: colors.textDark,
    borderWidth: 1,
    borderColor: 'rgba(45,79,62,0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: isIOS ? 'rgba(255,255,255,0.6)' : '#FFFFFF',
  },
  editSaveBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.secondary,
    alignItems: 'center',
  },
  editSaveBtnText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: '#FFFFFF',
  },
  editCancelBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
  },
  editCancelBtnText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
  editIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(45,79,62,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Remove caregiver
  removeCaregiverBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(231,76,60,0.08)',
  },
  removeCaregiverText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: '#C0392B',
  },

  careTeamRoleLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  careTeamYouLabel: {
    fontFamily: typography.fontFamily.regular,
    color: colors.textMuted,
  },
  careTeamRequestBtn: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(45,79,62,0.08)',
  },
  careTeamRequestText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.secondary,
  },
  careTeamPendingBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  careTeamPendingText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.textMuted,
  },
});

