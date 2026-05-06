import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Switch,
  ActionSheetIOS,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { getCaregiverInfo, getToken } from '../../src/utils/auth';
import { API_BASE_URL } from '../../src/config/api';
import { AdaptiveCard } from '../../src/components/AdaptiveCard';
import { AdaptiveButton } from '../../src/components/AdaptiveButton';
import { AppIcon } from '../../src/components/AppIcon';
import { CaregiverAvatarButton } from '../../src/components/CaregiverAvatarButton';
import { M3Dialog, type M3DialogAction } from '../../src/components/M3Dialog';
import { MemoryLibrarySheetContent } from '../../src/components/MemoryLibraryModal';
import { getQuizModes, QuizMode, updateQuizModes } from '../../src/services/media';

const isIOS = Platform.OS === 'ios';

interface PatientItem {
  id: string;
  name: string;
  surname: string;
  isPrimary: boolean;
}

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

const MODE_OPTIONS: { key: QuizMode; label: string; icon: string; subtitle: string }[] = [
  { key: 'NAME', label: 'Name', icon: 'person.fill', subtitle: 'Patient guesses each person\'s name' },
  { key: 'AGE', label: 'Age', icon: 'calendar', subtitle: 'Patient estimates each person\'s age' },
  { key: 'RELATIONSHIP', label: 'Relationship', icon: 'heart.text.clipboard', subtitle: 'Patient identifies relationship' },
];

const DIFFICULTY_OPTIONS: { key: Difficulty; label: string; helper: string; icon: string }[] = [
  { key: 'EASY', label: 'Easy', helper: 'Fewer decoys, more forgiving', icon: 'face.smiling' },
  { key: 'MEDIUM', label: 'Medium', helper: 'Balanced challenge', icon: 'gauge.with.dots.needle.50percent' },
  { key: 'HARD', label: 'Hard', helper: 'More decoys, greater challenge', icon: 'flame.fill' },
];

export default function CreateTab() {
  const [myId, setMyId] = useState('');
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [activeSection, setActiveSection] = useState<'builder' | 'library'>('builder');
  const [selectedModes, setSelectedModes] = useState<QuizMode[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
  const [premiumEnabled, setPremiumEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [libraryModalVisible, setLibraryModalVisible] = useState(false);
  const [dialog, setDialog] = useState<{
    visible: boolean;
    title: string;
    body: string;
    actions: M3DialogAction[];
  }>({ visible: false, title: '', body: '', actions: [] });

  const dismissDialog = () => setDialog((prev) => ({ ...prev, visible: false }));

  const showDialog = (title: string, body: string, actions: M3DialogAction[]) => {
    setDialog({ visible: true, title, body, actions });
  };

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === selectedPatientId) ?? null,
    [patients, selectedPatientId],
  );

  const loadPatients = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setPatients([]);
      setSelectedPatientId('');
      setSelectedModes([]);
      setIsLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const caregiver = await getCaregiverInfo();
      setMyId(caregiver?.id ?? '');

      const res = await fetch(`${API_BASE_URL}/patients/my-list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not load patients');

      const data = await res.json();
      const list: PatientItem[] = Array.isArray(data) ? data : (data.patients || []);
      setPatients(list);

      const fallbackId = selectedPatientId && list.some((p) => p.id === selectedPatientId)
        ? selectedPatientId
        : (list[0]?.id ?? '');

      setSelectedPatientId(fallbackId);

      if (fallbackId) {
        try {
          const modes = await getQuizModes(fallbackId);
          setSelectedModes(modes);
        } catch {
          setSelectedModes(['NAME', 'AGE', 'RELATIONSHIP']);
        }
      } else {
        setSelectedModes([]);
      }
    } catch {
      showDialog('Error', 'Unable to load patients right now.', [{ label: 'OK', onPress: dismissDialog }]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [selectedPatientId]);

  const loadQuizModesForPatient = useCallback(async (patientId: string) => {
    if (!patientId) {
      setSelectedModes([]);
      return;
    }
    try {
      const modes = await getQuizModes(patientId);
      setSelectedModes(modes);
    } catch {
      showDialog('Error', 'Unable to load existing quiz modes.', [{ label: 'OK', onPress: dismissDialog }]);
      setSelectedModes([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPatients();
    }, [loadPatients]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadPatients();
  };

  const toggleMode = (mode: QuizMode) => {
    setSelectedModes((prev) => {
      if (prev.includes(mode)) return prev.filter((entry) => entry !== mode);
      return [...prev, mode];
    });
  };

  const selectPatient = async (patientId: string) => {
    setSelectedPatientId(patientId);
    await loadQuizModesForPatient(patientId);
  };

  // Native patient picker using ActionSheet (iOS) / Alert (Android)
  const showPatientPicker = () => {
    if (patients.length === 0) return;

    const patientNames = patients.map((p) => `${p.name} ${p.surname}`);

    if (isIOS) {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...patientNames, 'Cancel'],
          cancelButtonIndex: patientNames.length,
          title: 'Select Patient',
        },
        (buttonIndex) => {
          if (buttonIndex < patients.length) {
            selectPatient(patients[buttonIndex].id);
          }
        },
      );
    } else {
      Alert.alert(
        'Select Patient',
        undefined,
        [
          ...patients.map((patient) => ({
            text: `${patient.name} ${patient.surname}`,
            onPress: () => selectPatient(patient.id),
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    }
  };

  const saveConfiguration = async () => {
    if (!selectedPatientId) {
      showDialog('Patient Required', 'Select a patient before creating a quiz configuration.', [
        { label: 'OK', onPress: dismissDialog },
      ]);
      return;
    }
    if (selectedModes.length === 0) {
      showDialog('Quiz Mode Required', 'Select at least one mode to continue.', [
        { label: 'OK', onPress: dismissDialog },
      ]);
      return;
    }

    setSaving(true);
    try {
      await updateQuizModes(selectedPatientId, selectedModes);
      showDialog(
        'Quiz Created',
        `Saved for ${selectedPatient?.name ?? 'patient'} with ${difficulty.toLowerCase()} difficulty${premiumEnabled ? ' and Premium adaptive mode enabled.' : '.'}`,
        [{ label: 'Done', onPress: dismissDialog }],
      );
    } catch {
      showDialog('Error', 'Could not save this quiz configuration.', [{ label: 'OK', onPress: dismissDialog }]);
    } finally {
      setSaving(false);
    }
  };

  const handleSectionChange = (section: 'builder' | 'library') => {
    if (section === 'library') {
      if (!selectedPatient) {
        showDialog('Select Patient', 'Please select a patient first to open the media library.', [
          { label: 'OK', onPress: dismissDialog },
        ]);
        return;
      }
      setLibraryModalVisible(true);
    } else {
      setActiveSection('builder');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header — matches Patients & Inbox tabs */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Create</Text>
          <Text style={styles.headerSubtitle}>Build personalized quiz sets</Text>
        </View>
        <CaregiverAvatarButton />
      </View>

      {/* Top-level segmented control */}
      <View style={styles.segmentedWrap}>
        <View style={styles.segmented}>
          <TouchableOpacity
            style={[styles.segmentTab, activeSection === 'builder' && styles.segmentTabActive]}
            onPress={() => handleSectionChange('builder')}
            activeOpacity={0.75}
          >
            <AppIcon
              iosName="plus.circle.fill"
              androidFallback="+"
              size={16}
              color={activeSection === 'builder' ? '#FFFFFF' : colors.textMuted}
            />
            <Text style={[styles.segmentText, activeSection === 'builder' && styles.segmentTextActive]}>
              Quiz Builder
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentTab, activeSection === 'library' && styles.segmentTabActive]}
            onPress={() => handleSectionChange('library')}
            activeOpacity={0.75}
          >
            <AppIcon
              iosName="photo.on.rectangle"
              androidFallback="📷"
              size={16}
              color={activeSection === 'library' ? '#FFFFFF' : colors.textMuted}
            />
            <Text style={[styles.segmentText, activeSection === 'library' && styles.segmentTextActive]}>
              Media Library
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Patient Selector Card */}
        <AdaptiveCard style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <AppIcon iosName="person.fill" androidFallback="P" size={16} color={colors.secondary} />
            </View>
            <Text style={styles.sectionTitle}>Patient</Text>
          </View>
          {isLoading ? (
            <Text style={styles.helperText}>Loading patients…</Text>
          ) : patients.length === 0 ? (
            <Text style={styles.helperText}>No patients found yet. Add one from the Patients tab.</Text>
          ) : (
            <TouchableOpacity
              style={styles.patientSelector}
              onPress={showPatientPicker}
              activeOpacity={0.75}
            >
              <View style={styles.patientSelectorLeft}>
                <View style={styles.patientInitialCircle}>
                  <Text style={styles.patientInitialText}>
                    {selectedPatient?.name?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
                <View>
                  <Text style={styles.patientSelectorName}>
                    {selectedPatient ? `${selectedPatient.name} ${selectedPatient.surname}` : 'Choose patient'}
                  </Text>
                  {selectedPatient && (
                    <Text style={styles.patientSelectorRole}>
                      {selectedPatient.isPrimary ? 'Primary caregiver' : 'Supporting caregiver'}
                    </Text>
                  )}
                </View>
              </View>
              <AppIcon
                iosName="chevron.right"
                androidFallback="›"
                size={14}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          )}
        </AdaptiveCard>

        {/* Quiz Modes */}
        <AdaptiveCard style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <AppIcon iosName="questionmark.circle.fill" androidFallback="?" size={16} color={colors.secondary} />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>Quiz Modes</Text>
              <Text style={styles.helperTextInline}>Choose one or more</Text>
            </View>
          </View>
          <View style={styles.modeList}>
            {MODE_OPTIONS.map((mode) => {
              const active = selectedModes.includes(mode.key);
              return (
                <TouchableOpacity
                  key={mode.key}
                  style={[styles.modeCard, active && styles.modeCardActive]}
                  onPress={() => toggleMode(mode.key)}
                  activeOpacity={0.8}
                >
                  <View style={styles.modeLeft}>
                    <View style={[styles.modeIconWrap, active && styles.modeIconWrapActive]}>
                      <AppIcon
                        iosName={mode.icon as any}
                        androidFallback={mode.label[0]}
                        size={16}
                        color={active ? '#FFFFFF' : colors.secondary}
                      />
                    </View>
                    <View style={styles.modeTextWrap}>
                      <Text style={[styles.modeTitle, active && styles.modeTitleActive]}>{mode.label}</Text>
                      <Text style={styles.modeSubtitle}>{mode.subtitle}</Text>
                    </View>
                  </View>
                  {active && (
                    <AppIcon iosName="checkmark.circle.fill" androidFallback="✓" size={20} color={colors.secondary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </AdaptiveCard>

        {/* Difficulty */}
        <AdaptiveCard style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <AppIcon iosName="chart.bar.fill" androidFallback="D" size={16} color={colors.secondary} />
            </View>
            <Text style={styles.sectionTitle}>Difficulty</Text>
          </View>
          <View style={styles.difficultyRow}>
            {DIFFICULTY_OPTIONS.map((option) => {
              const active = difficulty === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.difficultyPill, active && styles.difficultyPillActive]}
                  onPress={() => setDifficulty(option.key)}
                  activeOpacity={0.75}
                >
                  <AppIcon
                    iosName={option.icon as any}
                    androidFallback={option.label[0]}
                    size={18}
                    color={active ? '#FFFFFF' : colors.textMuted}
                  />
                  <Text style={[styles.difficultyLabel, active && styles.difficultyLabelActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.difficultyHelper}>
            {DIFFICULTY_OPTIONS.find((o) => o.key === difficulty)?.helper}
          </Text>
        </AdaptiveCard>

        {/* Premium Adaptive Mode */}
        <AdaptiveCard style={styles.sectionCard}>
          <View style={styles.premiumRow}>
            <View style={styles.premiumLeft}>
              <View style={[styles.sectionIconWrap, styles.premiumIconWrap]}>
                <AppIcon iosName="sparkles" androidFallback="AI" size={16} color="#D4A843" />
              </View>
              <View style={styles.premiumTextWrap}>
                <Text style={styles.premiumTitle}>Premium Adaptive</Text>
                <Text style={styles.premiumSubtitle}>
                  AI-powered dynamic difficulty (upcoming)
                </Text>
              </View>
            </View>
            <Switch
              value={premiumEnabled}
              onValueChange={setPremiumEnabled}
              trackColor={{ false: 'rgba(0,0,0,0.12)', true: 'rgba(45,79,62,0.4)' }}
              thumbColor={premiumEnabled ? colors.secondary : isIOS ? '#FFFFFF' : '#E0E0E0'}
              ios_backgroundColor="rgba(0,0,0,0.12)"
            />
          </View>
        </AdaptiveCard>

        {/* Create Button */}
        <AdaptiveButton
          title="Create Quiz"
          loading={saving}
          loadingText="Saving…"
          onPress={saveConfiguration}
          disabled={!selectedPatientId || selectedModes.length === 0}
          style={styles.saveButton}
        />
      </ScrollView>

      {/* Media Library Full-Screen Modal */}
      <Modal
        visible={libraryModalVisible}
        animationType="slide"
        presentationStyle={isIOS ? 'formSheet' : 'fullScreen'}
        onRequestClose={() => setLibraryModalVisible(false)}
      >
        <SafeAreaView style={styles.libraryModalSafeArea} edges={isIOS ? [] : ['top']}>
          {selectedPatient && (
            <MemoryLibrarySheetContent
              patientId={selectedPatient.id}
              patientName={`${selectedPatient.name} ${selectedPatient.surname}`.trim()}
              isPrimary={selectedPatient.isPrimary}
              myId={myId}
              onBack={() => setLibraryModalVisible(false)}
            />
          )}
        </SafeAreaView>
      </Modal>

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

  // Header — matches Patients & Inbox tabs
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

  // Top-level segmented control
  segmentedWrap: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  segmented: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: isIOS ? 14 : 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    gap: 4,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: isIOS ? 11 : 14,
  },
  segmentTabActive: {
    backgroundColor: colors.secondary,
  },
  segmentText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 13,
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },

  // Content
  content: {
    paddingHorizontal: 24,
    paddingBottom: 100,
    gap: 12,
  },

  // Section cards
  sectionCard: {
    padding: 16,
    borderRadius: isIOS ? 20 : 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionHeaderText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(45,79,62,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.bold,
    color: colors.textDark,
    fontSize: 16,
  },
  helperText: {
    fontFamily: typography.fontFamily.regular,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  helperTextInline: {
    fontFamily: typography.fontFamily.regular,
    color: colors.textMuted,
    fontSize: 12,
  },

  // Native patient selector
  patientSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: isIOS ? 14 : 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: isIOS ? 'rgba(255,255,255,0.5)' : '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  patientSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  patientInitialCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(45,79,62,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientInitialText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: colors.secondary,
  },
  patientSelectorName: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: colors.textDark,
  },
  patientSelectorRole: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },

  // Quiz mode cards
  modeList: {
    gap: 8,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: isIOS ? 14 : 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: isIOS ? 'rgba(255,255,255,0.5)' : '#FFFFFF',
    padding: 12,
  },
  modeCardActive: {
    borderColor: 'rgba(45,79,62,0.3)',
    backgroundColor: 'rgba(45,79,62,0.08)',
  },
  modeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  modeIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(45,79,62,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeIconWrapActive: {
    backgroundColor: colors.secondary,
  },
  modeTextWrap: {
    flex: 1,
  },
  modeTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: colors.textDark,
  },
  modeTitleActive: {
    color: colors.secondary,
  },
  modeSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Difficulty pills
  difficultyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  difficultyPill: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: isIOS ? 14 : 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: isIOS ? 'rgba(255,255,255,0.5)' : '#FFFFFF',
  },
  difficultyPillActive: {
    borderColor: 'rgba(45,79,62,0.3)',
    backgroundColor: colors.secondary,
  },
  difficultyLabel: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 13,
    color: colors.textMuted,
  },
  difficultyLabelActive: {
    color: '#FFFFFF',
  },
  difficultyHelper: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },

  // Premium toggle
  premiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  premiumLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 12,
  },
  premiumIconWrap: {
    backgroundColor: 'rgba(212,168,67,0.12)',
  },
  premiumTextWrap: {
    flex: 1,
  },
  premiumTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: colors.textDark,
  },
  premiumSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Save button
  saveButton: {
    marginTop: 4,
    marginBottom: 16,
  },

  // Media Library modal
  libraryModalSafeArea: {
    flex: 1,
    backgroundColor: colors.neutral,
  },
});
