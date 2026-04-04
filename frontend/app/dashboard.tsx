import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { API_BASE_URL } from '../src/config/api';
import { getToken, getCaregiverInfo, clearAuth, CaregiverInfo } from '../src/utils/auth';

interface PatientItem {
  id: string;
  name: string;
  surname: string;
  age: number | null;
  isPrimary: boolean;
  patientJoinCode: string;
}

export default function DashboardScreen() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [caregiver, setCaregiver] = useState<CaregiverInfo | null>(null);
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load auth from SecureStore on mount
  useEffect(() => {
    (async () => {
      const storedToken = await getToken();
      const storedCaregiver = await getCaregiverInfo();

      if (!storedToken) {
        // No token — kick back to login
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
        // Backend now returns a flat array directly
        const list = Array.isArray(data) ? data : (data.patients || []);
        setPatients(list);
      } else if (response.status === 401) {
        // Token expired — clear and redirect
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

  // Fetch when token is loaded
  useEffect(() => {
    if (token) fetchPatients();
  }, [token]);

  // Refresh when navigating back from add-patient
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
      Alert.alert(
        'Permission Denied',
        'Only the primary caregiver can remove a patient profile.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Remove Patient',
      `Are you sure you want to remove ${patient.name} ${patient.surname}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_BASE_URL}/patients/${patient.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (response.ok) {
                setPatients(prev => prev.filter(p => p.id !== patient.id));
              } else {
                const data = await response.json();
                Alert.alert('Error', data.message || 'Could not remove patient');
              }
            } catch {
              Alert.alert('Error', 'Failed to connect to the backend');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>My Patients</Text>
          <Text style={styles.headerSubtitle}>
            {caregiver ? `Welcome, ${caregiver.name} 👋` : 'Caregiver Dashboard'}
          </Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: '#E0E8E3' }]}
          onPress={() => router.push('/add-patient')}
          activeOpacity={0.85}
        >
          <Text style={styles.actionIcon}>➕</Text>
          <Text style={styles.actionLabel}>Add Patient</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: '#EAE0CE' }]}
          onPress={() => {/* Join space flow */}}
          activeOpacity={0.85}
        >
          <Text style={styles.actionIcon}>📱</Text>
          <Text style={styles.actionLabel}>Join Space</Text>
        </TouchableOpacity>
      </View>

      {/* Patient List */}
      {isLoading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : patients.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🌱</Text>
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
            <View key={patient.id} style={styles.patientCard}>
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
                    {patient.age && <Text style={styles.ageTag}>Age {patient.age}</Text>}
                    <View style={[styles.roleBadge, patient.isPrimary ? styles.primaryBadge : styles.secondaryBadge]}>
                      <Text style={[styles.roleBadgeText, patient.isPrimary ? styles.primaryBadgeText : styles.secondaryBadgeText]}>
                        {patient.isPrimary ? 'Primary' : 'Secondary'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Delete — only enabled for primary */}
              <TouchableOpacity
                style={[styles.deleteBtn, !patient.isPrimary && styles.deleteBtnDisabled]}
                onPress={() => handleDelete(patient)}
                activeOpacity={0.7}
              >
                <Text style={[styles.deleteBtnText, !patient.isPrimary && styles.deleteBtnTextDisabled]}>
                  🗑️
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.neutral },

  /* Header */
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
    borderRadius: 12,
    backgroundColor: 'rgba(231, 76, 60, 0.08)',
  },
  logoutText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: '#e74c3c',
  },

  /* Quick Actions */
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 12,
    marginTop: 12,
    marginBottom: 20,
  },
  actionCard: {
    flex: 1,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  actionIcon: { fontSize: 24, marginBottom: 6 },
  actionLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textDark,
  },

  /* Empty State */
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
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

  /* Patient list */
  listContainer: { flex: 1 },
  listContent: { paddingHorizontal: 24, paddingBottom: 40 },
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.neutralLight,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
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
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  primaryBadge: { backgroundColor: 'rgba(45, 79, 62, 0.12)' },
  secondaryBadge: { backgroundColor: 'rgba(180, 174, 232, 0.18)' },
  roleBadgeText: { fontFamily: typography.fontFamily.medium, fontSize: 11 },
  primaryBadgeText: { color: colors.secondary },
  secondaryBadgeText: { color: '#7B73C0' },

  /* Delete */
  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(231, 76, 60, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtnDisabled: { backgroundColor: 'rgba(0,0,0,0.03)' },
  deleteBtnText: { fontSize: 18 },
  deleteBtnTextDisabled: { opacity: 0.3 },
});
