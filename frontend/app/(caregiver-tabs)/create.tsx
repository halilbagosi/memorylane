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
  KeyboardAvoidingView,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
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
import { CareLevel, getQuizSettings, QuizDifficulty, QuizMode, updateQuizModes } from '../../src/services/media';
import { getPlanLimits } from '../../src/utils/subscription';

const isIOS = Platform.OS === 'ios';

// Enable LayoutAnimation on Android
if (!isIOS && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface PatientItem {
  id: string;
  name: string;
  surname: string;
  isPrimary: boolean;
}

type Difficulty = QuizDifficulty;

const MODE_OPTIONS: { key: QuizMode; label: string; icon: string; subtitle: string }[] = [
  { key: 'NAME', label: 'Name', icon: 'person.fill', subtitle: 'Patient guesses each person\'s name' },
  { key: 'AGE', label: 'Age', icon: 'calendar', subtitle: 'Patient estimates each person\'s age' },
  { key: 'RELATIONSHIP', label: 'Relationship', icon: 'heart.text.clipboard', subtitle: 'Patient identifies relationship' },
];

const DIFFICULTY_OPTIONS: { key: Difficulty; label: string; helper: string; icon: string }[] = [
  { key: 'EASY', label: 'Easy', helper: '2 decoys (3 total choices) + hints active', icon: 'face.smiling' },
  { key: 'MEDIUM', label: 'Medium', helper: '3 decoys (4 total choices)', icon: 'gauge.with.dots.needle.50percent' },
  { key: 'HARD', label: 'Hard', helper: '4 decoys (5 total choices)', icon: 'flame.fill' },
];

const CARE_LEVEL_OPTIONS: { key: CareLevel; label: string; helper: string; icon: string }[] = [
  { key: 'PREVENTATIVE', label: 'Preventative', helper: 'Higher challenge with mixed name, age, and relationship questions.', icon: 'brain.head.profile' },
  { key: 'DEMENTIA', label: 'Dementia', helper: 'Gentler practice with question types kept separate.', icon: 'heart.fill' },
];

export default function CreateTab() {
  const [myId, setMyId] = useState('');
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [activeSection, setActiveSection] = useState<'builder' | 'library'>('builder');
  const [selectedModes, setSelectedModes] = useState<QuizMode[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
  const [careLevel, setCareLevel] = useState<CareLevel>('DEMENTIA');
  const [aiAdaptiveEnabled, setAiAdaptiveEnabled] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Custom Dropdown State
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);

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
  const canUseAiAdaptive = getPlanLimits(isSubscribed).aiDifficultyEnabled;

  const animate = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

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
      const nextIsSubscribed = caregiver?.isSubscribed === true;
      setIsSubscribed(nextIsSubscribed);

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
          const settings = await getQuizSettings(fallbackId);
          setDifficulty(settings.quizDifficulty);
          setCareLevel(settings.careLevel);
          setAiAdaptiveEnabled(nextIsSubscribed && settings.aiAdaptiveEnabled);

          if (settings.careLevel === 'DEMENTIA') {
            setSelectedModes(settings.quizModes.length > 0 ? [settings.quizModes[0]] : ['NAME']);
          } else {
            setSelectedModes(['NAME', 'AGE', 'RELATIONSHIP']);
          }
        } catch {
          setCareLevel('PREVENTATIVE');
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
      const settings = await getQuizSettings(patientId);
      setDifficulty(settings.quizDifficulty);
      setCareLevel(settings.careLevel);
      setAiAdaptiveEnabled(canUseAiAdaptive && settings.aiAdaptiveEnabled);

      if (settings.careLevel === 'DEMENTIA') {
        setSelectedModes(settings.quizModes.length > 0 ? [settings.quizModes[0]] : ['NAME']);
      } else {
        setSelectedModes(['NAME', 'AGE', 'RELATIONSHIP']);
      }
    } catch {
      showDialog('Error', 'Unable to load existing quiz modes.', [{ label: 'OK', onPress: dismissDialog }]);
      setCareLevel('PREVENTATIVE');
      setSelectedModes(['NAME', 'AGE', 'RELATIONSHIP']);
    }
  }, [canUseAiAdaptive]);

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
    animate();
    if (careLevel === 'DEMENTIA') {
      setSelectedModes([mode]);
    } else {
      setSelectedModes((prev) => {
        if (prev.includes(mode)) return prev.filter((entry) => entry !== mode);
        return [...prev, mode];
      });
    }
  };

  const handleCareLevelSelect = (newLevel: CareLevel) => {
    animate();
    setCareLevel(newLevel);
    if (newLevel === 'DEMENTIA') {
      setSelectedModes((prev) => (prev.length > 0 ? [prev[0]] : ['NAME']));
    } else if (newLevel === 'PREVENTATIVE') {
      setSelectedModes(['NAME', 'AGE', 'RELATIONSHIP']);
    }
  };

  const handleAiAdaptiveToggle = (value: boolean) => {
    if (value && !canUseAiAdaptive) {
      showDialog('Premium Feature', 'AI adaptive difficulty is available with Premium.', [
        { label: 'Not now', onPress: dismissDialog },
        { label: 'Upgrade', onPress: () => { dismissDialog(); router.push('/account'); } },
      ]);
      return;
    }
    animate();
    setAiAdaptiveEnabled(value);
  };

  const selectPatient = async (patientId: string) => {
    animate();
    setSelectedPatientId(patientId);
    setIsPatientDropdownOpen(false);
    await loadQuizModesForPatient(patientId);
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
      const adaptiveEnabledForSave = canUseAiAdaptive && aiAdaptiveEnabled;
      await updateQuizModes(selectedPatientId, selectedModes, difficulty, {
        careLevel,
        aiAdaptiveEnabled: adaptiveEnabledForSave,
      });
      showDialog(
        'Quiz Created',
        `Saved for ${selectedPatient?.name ?? 'patient'} with ${adaptiveEnabledForSave ? 'AI adaptive difficulty' : `${difficulty.toLowerCase()} difficulty`}.`,
        [{ label: 'Done', onPress: dismissDialog }],
      );
    } catch {
      showDialog('Error', 'Could not save this quiz configuration.', [{ label: 'OK', onPress: dismissDialog }]);
    } finally {
      setSaving(false);
    }
  };

  const handleSectionChange = (section: 'builder' | 'library') => {
    if (section === 'library' && !selectedPatient) {
      showDialog('Select Patient', 'Please select a patient first to open the media library.', [
        { label: 'OK', onPress: dismissDialog },
      ]);
      return;
    }
    animate();
    setActiveSection(section);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Create</Text>
          <Text style={styles.headerSubtitle}>Build personalized quiz sets</Text>
        </View>
        <CaregiverAvatarButton />
      </View>

      <View style={styles.segmentedWrap}>
        <View style={styles.segmented}>
          <TouchableOpacity
            style={[styles.segmentTab, activeSection === 'builder' && styles.segmentTabActive]}
            onPress={() => handleSectionChange('builder')}
            activeOpacity={0.75}
          >
            <Text style={[styles.segmentText, activeSection === 'builder' && styles.segmentTextActive]}>
              Quiz Builder
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentTab, activeSection === 'library' && styles.segmentTabActive]}
            onPress={() => handleSectionChange('library')}
            activeOpacity={0.75}
          >
            <Text style={[styles.segmentText, activeSection === 'library' && styles.segmentTextActive]}>
              Media Library
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeSection === 'builder' ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Patient Selector Card - Animated Dropdown */}
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
              <View style={styles.dropdownContainer}>
                <TouchableOpacity
                  style={[styles.patientSelector, isPatientDropdownOpen && styles.patientSelectorOpen]}
                  onPress={() => {
                    animate();
                    setIsPatientDropdownOpen(!isPatientDropdownOpen);
                  }}
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
                    iosName={isPatientDropdownOpen ? 'chevron.up' : 'chevron.down'}
                    androidFallback={isPatientDropdownOpen ? '↑' : '↓'}
                    size={14}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>

                {/* Animated Expanding List */}
                {isPatientDropdownOpen && (
                  <View style={styles.dropdownList}>
                    {patients.map((patient) => (
                      <TouchableOpacity
                        key={patient.id}
                        style={styles.dropdownItem}
                        onPress={() => selectPatient(patient.id)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.patientInitialCircleSmall}>
                          <Text style={styles.patientInitialTextSmall}>
                            {patient.name[0]?.toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.dropdownItemText}>
                          {patient.name} {patient.surname}
                        </Text>
                        {selectedPatientId === patient.id && (
                          <AppIcon iosName="checkmark" androidFallback="✓" size={14} color={colors.secondary} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </AdaptiveCard>

          {/* Care Level */}
          <AdaptiveCard style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <AppIcon iosName="person.crop.circle.badge.checkmark" androidFallback="C" size={16} color={colors.secondary} />
              </View>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>Care Level</Text>
                <Text style={styles.helperTextInline}>Therapeutic pacing</Text>
              </View>
            </View>
            <View style={styles.careLevelList}>
              {CARE_LEVEL_OPTIONS.map((option) => {
                const active = careLevel === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.careLevelCard, active && styles.careLevelCardActive]}
                    onPress={() => handleCareLevelSelect(option.key)}
                    activeOpacity={0.78}
                  >
                    <View style={[styles.modeIconWrap, active && styles.modeIconWrapActive]}>
                      <AppIcon
                        iosName={option.icon as any}
                        androidFallback={option.label[0]}
                        size={16}
                        color={active ? '#FFFFFF' : colors.secondary}
                      />
                    </View>
                    <View style={styles.modeTextWrap}>
                      <Text style={[styles.modeTitle, active && styles.modeTitleActive]}>{option.label}</Text>
                      <Text style={styles.modeSubtitle}>{option.helper}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </AdaptiveCard>

          {/* Quiz Modes */}
          <AdaptiveCard style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <AppIcon iosName="questionmark.circle.fill" androidFallback="?" size={16} color={colors.secondary} />
              </View>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>Quiz Modes</Text>
                <Text style={styles.helperTextInline}>
                  {careLevel === 'DEMENTIA' ? 'Choose one type' : 'Choose one or more'}
                </Text>
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
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>Manual Difficulty</Text>
                <Text style={styles.helperTextInline}>{aiAdaptiveEnabled ? 'AI manages this' : 'Caregiver selected'}</Text>
              </View>
            </View>
            <View style={styles.difficultyRow}>
              {DIFFICULTY_OPTIONS.map((option) => {
                const active = difficulty === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[
                      styles.difficultyPill,
                      active && styles.difficultyPillActive,
                      aiAdaptiveEnabled && styles.difficultyPillDisabled,
                    ]}
                    onPress={() => {
                      animate();
                      setDifficulty(option.key);
                    }}
                    activeOpacity={aiAdaptiveEnabled ? 1 : 0.75}
                    disabled={aiAdaptiveEnabled}
                  >
                    <AppIcon
                      iosName={option.icon as any}
                      androidFallback={option.label[0]}
                      size={18}
                      color={active && !aiAdaptiveEnabled ? '#FFFFFF' : colors.textMuted}
                    />
                    <Text style={[styles.difficultyLabel, active && !aiAdaptiveEnabled && styles.difficultyLabelActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.difficultyHelper}>
              {aiAdaptiveEnabled
                ? 'Safety fallback still uses Easy below 70%, Medium from 70-90%, and Hard above 90%.'
                : DIFFICULTY_OPTIONS.find((o) => o.key === difficulty)?.helper}
            </Text>
          </AdaptiveCard>

          {/* AI Adaptive Mode */}
          <AdaptiveCard
            style={{
              ...styles.sectionCard,
              ...(!canUseAiAdaptive ? styles.premiumLockedCard : {}),
            }}
          >
            <View style={styles.premiumRow}>
              <View style={styles.premiumLeft}>
                <View style={[styles.sectionIconWrap, styles.premiumIconWrap]}>
                  <AppIcon iosName="brain.head.profile" androidFallback="AI" size={16} color="#D4A843" />
                </View>
                <View style={styles.premiumTextWrap}>
                  <View style={styles.premiumTitleRow}>
                    <Text style={styles.premiumTitle}>AI Adaptive Difficulty</Text>
                  </View>
                  <Text style={styles.premiumSubtitle}>
                    {canUseAiAdaptive
                      ? 'Adjusts difficulty using the patient’s answers, response time, time of day, and selected care level.'
                      : 'Upgrade to adapt quiz difficulty using patient performance and care level.'}
                  </Text>
                </View>
              </View>
              <Switch
                value={canUseAiAdaptive && aiAdaptiveEnabled}
                onValueChange={handleAiAdaptiveToggle}
                disabled={!canUseAiAdaptive}
                trackColor={{ false: 'rgba(0,0,0,0.12)', true: 'rgba(45,79,62,0.4)' }}
                thumbColor={canUseAiAdaptive && aiAdaptiveEnabled ? colors.secondary : isIOS ? '#FFFFFF' : '#E0E0E0'}
                ios_backgroundColor="rgba(0,0,0,0.12)"
              />
            </View>
            {!canUseAiAdaptive && (
              <TouchableOpacity
                style={styles.upgradeButton}
                onPress={() => router.push('/account')}
                activeOpacity={0.78}
              >
                <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
              </TouchableOpacity>
            )}
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
      ) : (
        <KeyboardAvoidingView
          style={styles.libraryContainer}
          behavior={isIOS ? 'padding' : undefined}
          keyboardVerticalOffset={isIOS ? 85 : 0}
        >
          {selectedPatient && (
            <MemoryLibrarySheetContent
              patientId={selectedPatient.id}
            />
          )}
        </KeyboardAvoidingView>
      )}

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

  content: {
    paddingHorizontal: 24,
    paddingBottom: 100,
    gap: 12,
  },

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

  dropdownContainer: {
    borderRadius: isIOS ? 14 : 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: isIOS ? 'rgba(255,255,255,0.5)' : '#FFFFFF',
    overflow: 'hidden',
  },
  patientSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  patientSelectorOpen: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
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
  dropdownList: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.04)',
    gap: 12,
  },
  patientInitialCircleSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientInitialTextSmall: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.textDark,
  },
  dropdownItemText: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textDark,
  },

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
  careLevelList: {
    gap: 8,
  },
  careLevelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: isIOS ? 14 : 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: isIOS ? 'rgba(255,255,255,0.5)' : '#FFFFFF',
    padding: 12,
  },
  careLevelCardActive: {
    borderColor: 'rgba(45,79,62,0.3)',
    backgroundColor: 'rgba(45,79,62,0.08)',
  },

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
  difficultyPillDisabled: {
    opacity: 0.58,
    backgroundColor: 'rgba(255,255,255,0.45)',
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

  premiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  premiumLockedCard: {
    borderColor: 'rgba(212,168,67,0.28)',
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
  premiumTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
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
  upgradeButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 14,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(212,168,67,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(123,90,0,0.18)',
  },
  upgradeButtonText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 13,
    color: '#7B5A00',
  },

  saveButton: {
    marginTop: 4,
    marginBottom: 16,
  },

  libraryContainer: {
    flex: 1,
    backgroundColor: colors.neutral,
  },
});