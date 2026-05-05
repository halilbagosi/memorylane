import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  AppStateStatus,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { SFSymbol } from 'expo-symbols';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { AppIcon } from '../../src/components/AppIcon';
import { QuizSuccessOverlay } from '../../src/components/QuizSuccessOverlay';
import { getPatientInfo, deletePatientInfo, PatientInfo } from '../../src/utils/auth';
import { getPatientQuizData, QuizMode } from '../../src/services/media';
import {
  buildQuizPool,
  buildQuizSet,
  buildQuizSetFromIds,
  QuizQuestion,
  uniqueIdentityCount,
} from '../../src/services/quiz';

type Phase =
  | { type: 'loading' }
  | { type: 'error'; message: string }
  | { type: 'no_media' }
  | { type: 'insufficient_identities'; count: number }
  | { type: 'resume_prompt' }
  | { type: 'intro' }
  | { type: 'mode_select' }
  | { type: 'quiz' }
  | { type: 'summary' };

interface SavedQuizSession {
  patientId: string;
  mode: QuizMode;
  questionIds: string[];
  currentIndex: number;
  savedAt: number;
}

interface ResumeSession {
  mode: QuizMode;
  questions: QuizQuestion[];
  currentIndex: number;
}

const MIN_IDENTITIES = 4;
const QUIZ_BACKGROUND = colors.neutral;
const CREAM = '#FCFEF9';
const FOREST_GREEN = '#1E4D30';
const SESSION_KEY_PREFIX = 'memorylane_patient_quiz_session';

const MODE_CONFIG: Record<QuizMode, { label: string; icon: SFSymbol; androidFallback: string }> = {
  NAME: { label: 'Practice Names', icon: 'person.fill', androidFallback: 'P' },
  AGE: { label: 'Practice Ages', icon: 'calendar', androidFallback: 'A' },
  RELATIONSHIP: { label: 'Practice Relationships', icon: 'heart.fill', androidFallback: 'R' },
};

function sessionKey(patientId: string) {
  return `${SESSION_KEY_PREFIX}_${patientId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

async function writeSavedSession(session: SavedQuizSession): Promise<void> {
  const value = JSON.stringify(session);
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(sessionKey(session.patientId), value);
    return;
  }
  await SecureStore.setItemAsync(sessionKey(session.patientId), value);
}

async function readSavedSession(patientId: string): Promise<SavedQuizSession | null> {
  const key = sessionKey(patientId);
  const raw = Platform.OS === 'web'
    ? typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
    : await SecureStore.getItemAsync(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedQuizSession;
  } catch {
    return null;
  }
}

async function deleteSavedSession(patientId: string): Promise<void> {
  const key = sessionKey(patientId);
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key).catch(() => undefined);
}

export default function QuizTab() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { width, height } = useWindowDimensions();

  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [phase, setPhase] = useState<Phase>({ type: 'loading' });
  const [enabledModes, setEnabledModes] = useState<QuizMode[]>([]);
  const [mediaPool, setMediaPool] = useState<ReturnType<typeof buildQuizPool>>([]);
  const [activeMode, setActiveMode] = useState<QuizMode | null>(null);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [resumeSession, setResumeSession] = useState<ResumeSession | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [wrongTaps, setWrongTaps] = useState<Set<string>>(new Set());
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastWrong, setLastWrong] = useState<string | null>(null);

  const wrongShake = useRef(new Animated.Value(0)).current;
  const questionFade = useRef(new Animated.Value(1)).current;
  const questionIndexRef = useRef(questionIndex);
  const questionsLenRef = useRef(questions.length);
  const phaseRef = useRef<Phase>(phase);
  const patientRef = useRef<PatientInfo | null>(patient);
  const activeModeRef = useRef<QuizMode | null>(activeMode);
  const questionIdsRef = useRef<string[]>(questionIds);

  const photoSize = useMemo(() => Math.min(width - 56, height * 0.38, 360), [height, width]);

  useEffect(() => { questionIndexRef.current = questionIndex; }, [questionIndex]);
  useEffect(() => { questionsLenRef.current = questions.length; }, [questions.length]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { patientRef.current = patient; }, [patient]);
  useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);
  useEffect(() => { questionIdsRef.current = questionIds; }, [questionIds]);

  useEffect(() => {
    if (phase.type !== 'quiz') return;
    questionFade.setValue(0);
    Animated.timing(questionFade, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [phase.type, questionFade, questionIndex]);

  const saveCurrentSession = useCallback(async (indexOverride?: number) => {
    const p = patientRef.current;
    const mode = activeModeRef.current;
    const ids = questionIdsRef.current;
    if (!p || !mode || ids.length === 0) return;
    const currentIndex = indexOverride ?? questionIndexRef.current;
    if (currentIndex >= ids.length) {
      await deleteSavedSession(p.id);
      return;
    }
    await writeSavedSession({
      patientId: p.id,
      mode,
      questionIds: ids,
      currentIndex,
      savedAt: Date.now(),
    });
  }, []);

  const clearCurrentSession = useCallback(async () => {
    const p = patientRef.current;
    if (p) await deleteSavedSession(p.id);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState.match(/inactive|background/) && phaseRef.current.type === 'quiz') {
        saveCurrentSession().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [saveCurrentSession]);

  const initialise = useCallback(async () => {
    setPhase({ type: 'loading' });
    try {
      const p = await getPatientInfo();
      if (!p) {
        navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }));
        return;
      }
      setPatient(p);

      const { quizModes, media } = await getPatientQuizData(p.id);
      const pool = buildQuizPool(media);
      const identityCount = uniqueIdentityCount(media);
      setMediaPool(pool);
      setEnabledModes(quizModes);

      if (pool.length === 0) {
        setPhase({ type: 'no_media' });
        return;
      }
      if (identityCount < MIN_IDENTITIES) {
        setPhase({ type: 'insufficient_identities', count: identityCount });
        return;
      }

      const saved = await readSavedSession(p.id);
      if (saved && quizModes.includes(saved.mode)) {
        const restoredQuestions = buildQuizSetFromIds(pool, saved.mode, saved.questionIds);
        const currentIndex = Math.max(0, saved.currentIndex);
        if (restoredQuestions.length > currentIndex) {
          setResumeSession({ mode: saved.mode, questions: restoredQuestions, currentIndex });
          setPhase({ type: 'resume_prompt' });
          return;
        }
        await deleteSavedSession(p.id);
      }
      setPhase({ type: 'intro' });
    } catch (err: any) {
      setPhase({ type: 'error', message: err?.message ?? 'Something went wrong.' });
    }
  }, [navigation]);

  useEffect(() => {
    initialise();
  }, [initialise]);

  const startSet = useCallback((mode: QuizMode) => {
    const qs = buildQuizSet(mediaPool, mode);
    if (qs.length === 0) return;
    setQuestions(qs);
    setActiveMode(mode);
    setQuestionIds(qs.map((q) => q.media.publicId));
    setQuestionIndex(0);
    setScore(0);
    setWrongTaps(new Set());
    setLastWrong(null);
    setShowSuccess(false);
    setPhase({ type: 'quiz' });
  }, [mediaPool]);

  const continueSavedSession = useCallback(() => {
    if (!resumeSession) return;
    setQuestions(resumeSession.questions);
    setActiveMode(resumeSession.mode);
    setQuestionIds(resumeSession.questions.map((q) => q.media.publicId));
    setQuestionIndex(resumeSession.currentIndex);
    setScore(0);
    setWrongTaps(new Set());
    setLastWrong(null);
    setShowSuccess(false);
    setResumeSession(null);
    setPhase({ type: 'quiz' });
  }, [resumeSession]);

  const startNewSession = useCallback(async () => {
    await clearCurrentSession();
    setResumeSession(null);
    setQuestions([]);
    setQuestionIds([]);
    setActiveMode(null);
    setQuestionIndex(0);
    setWrongTaps(new Set());
    setLastWrong(null);
    setShowSuccess(false);
    setPhase({ type: 'intro' });
  }, [clearCurrentSession]);

  const handleIntroStart = useCallback(() => {
    const preferredMode = enabledModes.includes('NAME') ? 'NAME' : enabledModes[0];
    if (preferredMode) startSet(preferredMode);
  }, [enabledModes, startSet]);

  const handleChoice = useCallback((choice: string) => {
    if (showSuccess) return;
    const current = questions[questionIndex];
    if (!current) return;

    if (choice === current.correctAnswer) {
      if (wrongTaps.size === 0) setScore((s) => s + 1);
      saveCurrentSession(questionIndex + 1).catch(() => undefined);
      setShowSuccess(true);
      return;
    }

    setLastWrong(choice);
    setWrongTaps((prev) => new Set([...prev, choice]));
    wrongShake.setValue(0);
    Animated.sequence([
      Animated.timing(wrongShake, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(wrongShake, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(wrongShake, { toValue: 5, duration: 50, useNativeDriver: true }),
      Animated.timing(wrongShake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start(() => setLastWrong(null));
  }, [questionIndex, questions, saveCurrentSession, showSuccess, wrongShake, wrongTaps.size]);

  const handleSuccessDismiss = useCallback(() => {
    setShowSuccess(false);
    setWrongTaps(new Set());
    setLastWrong(null);

    const nextIndex = questionIndexRef.current + 1;
    if (nextIndex >= questionsLenRef.current) {
      clearCurrentSession().catch(() => undefined);
      setPhase({ type: 'summary' });
    } else {
      setQuestionIndex(nextIndex);
    }
  }, [clearCurrentSession]);

  const handleLogout = () => {
    if (!['intro', 'mode_select', 'no_media', 'insufficient_identities'].includes(phase.type)) return;
    deletePatientInfo().then(() =>
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'index' }] })),
    );
  };

  const renderLoading = () => (
    <View style={styles.centerFill}>
      <ActivityIndicator size="large" color={FOREST_GREEN} />
    </View>
  );

  const renderError = (message: string) => (
    <View style={styles.centerFill}>
      <AppIcon iosName="exclamationmark.circle" androidFallback="!" size={48} color="#C0392B" />
      <Text style={styles.errorText}>{message}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={initialise} activeOpacity={0.8}>
        <Text style={styles.retryBtnText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );

  const renderNoMedia = () => (
    <View style={styles.centerFill}>
      <AppIcon iosName="photo.on.rectangle.angled" androidFallback="P" size={56} color={FOREST_GREEN} />
      <Text style={styles.emptyTitle}>No Quiz Photos Yet</Text>
      <Text style={styles.emptySubtitle}>Ask your caregiver to add photos to your quiz library.</Text>
    </View>
  );

  const renderInsufficientIdentities = (count: number) => (
    <View style={styles.centerFill}>
      <AppIcon iosName="sparkles" androidFallback="*" size={52} color={FOREST_GREEN} />
      <Text style={styles.emptyTitle}>Quiz Coming Soon</Text>
      <Text style={styles.emptySubtitle}>
        Your quiz will be ready when there are 4 familiar faces. Current: {count}/4.
      </Text>
    </View>
  );

  const renderIntro = () => (
    <View style={styles.introContent}>
      <Text style={styles.introText}>
        Good morning, {patient?.name ?? 'friend'}. Let's see some familiar faces!
      </Text>
      <TouchableOpacity style={styles.startButton} onPress={handleIntroStart} activeOpacity={0.85}>
        <Text style={styles.startButtonText}>Start</Text>
      </TouchableOpacity>
    </View>
  );

  const renderResumePrompt = () => (
    <View style={[styles.resumeFill, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.resumeCard}>
        <Text style={styles.resumeText}>
          Welcome back, {patient?.name ?? 'friend'}. Would you like to continue your practice?
        </Text>
        <View style={styles.resumeActions}>
          <TouchableOpacity style={styles.resumePrimaryBtn} onPress={continueSavedSession} activeOpacity={0.85}>
            <Text style={styles.resumePrimaryText}>Continue</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resumeSecondaryBtn} onPress={startNewSession} activeOpacity={0.8}>
            <Text style={styles.resumeSecondaryText}>Start New</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderModeSelect = () => (
    <ScrollView contentContainerStyle={styles.modeSelectContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.modeSelectTitle}>What would you like to practice?</Text>
      <View style={styles.modeButtonsCol}>
        {enabledModes.map((mode) => {
          const cfg = MODE_CONFIG[mode];
          const hasMedia = buildQuizSet(mediaPool, mode, 1).length > 0;
          return (
            <TouchableOpacity
              key={mode}
              style={[styles.modePill, !hasMedia && styles.modePillDisabled]}
              onPress={() => hasMedia && startSet(mode)}
              activeOpacity={hasMedia ? 0.75 : 1}
            >
              <AppIcon
                iosName={cfg.icon}
                androidFallback={cfg.androidFallback}
                size={24}
                color={hasMedia ? CREAM : '#888888'}
              />
              <Text style={[styles.modePillText, !hasMedia && styles.modePillTextDisabled]}>{cfg.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderQuestion = () => {
    const q = questions[questionIndex];
    if (!q) return null;

    return (
      <Animated.View
        style={[
          styles.quizScreen,
          {
            paddingTop: insets.top + 18,
            paddingBottom: insets.bottom + 22,
            opacity: questionFade,
          },
        ]}
      >
        <View style={styles.progressDashRow}>
          {questions.map((_, index) => (
            <View
              key={index}
              style={[styles.progressDash, index <= questionIndex && styles.progressDashActive]}
            />
          ))}
        </View>

        <Text style={styles.questionText}>{q.questionText}</Text>

        <View style={[styles.photoShadow, { width: photoSize, height: photoSize }]}>
          <View style={styles.photoClip}>
            <Image source={{ uri: q.imageUrl }} style={styles.photo} resizeMode="cover" />
          </View>
        </View>

        <View style={styles.choiceGrid}>
          {q.choices.map((choice) => {
            const isWrong = wrongTaps.has(choice);
            const isLastWrong = choice === lastWrong;
            return (
              <Animated.View
                key={choice}
                style={[styles.choiceCell, isLastWrong && { transform: [{ translateX: wrongShake }] }]}
              >
                <TouchableOpacity
                  style={[styles.choiceBtn, isWrong && styles.choiceBtnWrong]}
                  onPress={() => handleChoice(choice)}
                  activeOpacity={0.85}
                  disabled={isWrong}
                >
                  <Text style={[styles.choiceBtnText, isWrong && styles.choiceBtnTextWrong]} numberOfLines={2}>
                    {choice}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>

        <QuizSuccessOverlay visible={showSuccess} onDismiss={handleSuccessDismiss} />
      </Animated.View>
    );
  };

  const goToRelive = () => {
    navigation.navigate('relive' as never);
  };

  const renderSummary = () => (
    <ScrollView contentContainerStyle={styles.summaryContent} showsVerticalScrollIndicator={false}>
      <View style={styles.summaryMessageBlock}>
        <Text style={styles.summaryTitle}>
          Wonderful job, {patient?.name ?? 'friend'}. You've seen everyone today!
        </Text>
      </View>

      <TouchableOpacity style={styles.photosButton} onPress={goToRelive} activeOpacity={0.85}>
        <Text style={styles.photosButtonText}>Go to my photos</Text>
      </TouchableOpacity>

      <Text style={styles.summaryPrompt}>Practice again:</Text>
      <View style={styles.practiceChoiceGrid}>
        {enabledModes.map((mode) => {
          const cfg = MODE_CONFIG[mode];
          const hasMedia = buildQuizSet(mediaPool, mode, 1).length > 0;
          return (
            <TouchableOpacity
              key={mode}
              style={[styles.practiceChoice, !hasMedia && styles.modePillDisabled]}
              onPress={() => hasMedia && startSet(mode)}
              activeOpacity={hasMedia ? 0.75 : 1}
            >
              <Text style={[styles.practiceChoiceText, !hasMedia && styles.modePillTextDisabled]}>{cfg.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );

  const showTopBar = !['quiz', 'intro', 'resume_prompt', 'summary'].includes(phase.type);
  const showFocusModal = phase.type === 'resume_prompt' || phase.type === 'quiz';

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      {showTopBar && patient && (
        <View style={styles.topRow}>
          <Text style={styles.greeting}>Hi, {patient.name}</Text>
          {['mode_select', 'no_media', 'insufficient_identities'].includes(phase.type) && (
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} activeOpacity={0.7}>
              <AppIcon iosName="arrow.right.square" androidFallback="<" size={18} color="#C0392B" />
            </TouchableOpacity>
          )}
          {patient.avatarUrl ? (
            <Image source={{ uri: patient.avatarUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarFallback}>
              <Text style={styles.headerAvatarText}>{patient.name?.[0]?.toUpperCase() || '?'}</Text>
            </View>
          )}
        </View>
      )}

      {phase.type === 'loading' && renderLoading()}
      {phase.type === 'error' && renderError(phase.message)}
      {phase.type === 'no_media' && renderNoMedia()}
      {phase.type === 'insufficient_identities' && renderInsufficientIdentities(phase.count)}
      {phase.type === 'intro' && renderIntro()}
      {phase.type === 'mode_select' && renderModeSelect()}
      {phase.type === 'summary' && renderSummary()}
      {showFocusModal && (
        <Modal visible animationType="none" statusBarTranslucent presentationStyle="fullScreen">
          {phase.type === 'resume_prompt' && renderResumePrompt()}
          {phase.type === 'quiz' && renderQuestion()}
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: QUIZ_BACKGROUND,
    paddingHorizontal: 24,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  greeting: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: FOREST_GREEN,
    flex: 1,
  },
  logoutBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  headerAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: FOREST_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: CREAM,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingBottom: 80,
  },
  errorText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 16,
    color: FOREST_GREEN,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  retryBtn: {
    backgroundColor: CREAM,
    borderRadius: 50,
    paddingVertical: 14,
    paddingHorizontal: 36,
  },
  retryBtnText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: FOREST_GREEN,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 24,
    color: FOREST_GREEN,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 17,
    color: FOREST_GREEN,
    textAlign: 'center',
    lineHeight: 25,
    maxWidth: 300,
  },
  introContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
    paddingHorizontal: 8,
    paddingBottom: 48,
  },
  introText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 30,
    color: FOREST_GREEN,
    lineHeight: 40,
    textAlign: 'center',
  },
  startButton: {
    minWidth: 190,
    borderRadius: 999,
    backgroundColor: CREAM,
    paddingVertical: 18,
    paddingHorizontal: 54,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#24442F',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
      android: { elevation: 4 },
    }),
  },
  startButtonText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 22,
    color: FOREST_GREEN,
  },
  resumeFill: {
    flex: 1,
    backgroundColor: QUIZ_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  resumeCard: {
    width: '100%',
    borderRadius: 24,
    backgroundColor: CREAM,
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(30, 77, 48, 0.18)',
    alignItems: 'center',
    gap: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#24442F',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
      android: { elevation: 5 },
    }),
  },
  resumeText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 25,
    lineHeight: 34,
    color: FOREST_GREEN,
    textAlign: 'center',
  },
  resumeActions: {
    width: '100%',
    gap: 12,
  },
  resumePrimaryBtn: {
    borderRadius: 999,
    backgroundColor: FOREST_GREEN,
    paddingVertical: 16,
    alignItems: 'center',
  },
  resumePrimaryText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: CREAM,
  },
  resumeSecondaryBtn: {
    borderRadius: 999,
    backgroundColor: 'rgba(30, 77, 48, 0.08)',
    paddingVertical: 15,
    alignItems: 'center',
  },
  resumeSecondaryText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 17,
    color: FOREST_GREEN,
  },
  modeSelectContent: {
    flexGrow: 1,
    paddingTop: 48,
    paddingBottom: 32,
    alignItems: 'center',
  },
  modeSelectTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 28,
    color: FOREST_GREEN,
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 36,
  },
  modeButtonsCol: {
    width: '100%',
    gap: 16,
    alignItems: 'center',
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FOREST_GREEN,
    borderRadius: 50,
    paddingVertical: 18,
    paddingHorizontal: 32,
    width: '100%',
    gap: 12,
  },
  modePillDisabled: {
    backgroundColor: '#D1D8D0',
  },
  modePillText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: CREAM,
    flex: 1,
    textAlign: 'center',
  },
  modePillTextDisabled: {
    color: '#888888',
  },
  quizScreen: {
    flex: 1,
    backgroundColor: QUIZ_BACKGROUND,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  progressDashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 16,
    marginBottom: 24,
  },
  progressDash: {
    width: 34,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(30, 77, 48, 0.24)',
  },
  progressDashActive: {
    backgroundColor: CREAM,
  },
  questionText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 30,
    color: FOREST_GREEN,
    textAlign: 'center',
    lineHeight: 38,
    marginBottom: 28,
  },
  photoShadow: {
    borderRadius: 30,
    backgroundColor: CREAM,
    marginBottom: 32,
    ...Platform.select({
      ios: {
        shadowColor: '#24442F',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 18,
      },
      android: { elevation: 6 },
    }),
  },
  photoClip: {
    flex: 1,
    borderRadius: 30,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  choiceGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    marginTop: 'auto',
  },
  choiceCell: {
    width: '50%',
    paddingHorizontal: 6,
    paddingBottom: 12,
  },
  choiceBtn: {
    minHeight: 66,
    borderRadius: 999,
    backgroundColor: CREAM,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#24442F',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.14,
        shadowRadius: 9,
      },
      android: { elevation: 2 },
    }),
  },
  choiceBtnWrong: {
    backgroundColor: '#D7E0D2',
  },
  choiceBtnText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: FOREST_GREEN,
    textAlign: 'center',
    lineHeight: 23,
  },
  choiceBtnTextWrong: {
    color: '#7A7A7A',
  },
  summaryContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 64,
    paddingBottom: 44,
    alignItems: 'center',
    gap: 24,
  },
  summaryMessageBlock: {
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  summaryTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 30,
    color: FOREST_GREEN,
    textAlign: 'center',
    lineHeight: 40,
  },
  photosButton: {
    minWidth: 230,
    borderRadius: 999,
    backgroundColor: CREAM,
    paddingHorizontal: 34,
    paddingVertical: 18,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#24442F',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
      android: { elevation: 4 },
    }),
  },
  photosButtonText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: FOREST_GREEN,
    textAlign: 'center',
  },
  summaryPrompt: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: FOREST_GREEN,
    marginTop: 18,
  },
  practiceChoiceGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  practiceChoice: {
    borderRadius: 999,
    backgroundColor: 'rgba(252, 254, 249, 0.9)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(30, 77, 48, 0.18)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  practiceChoiceText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: FOREST_GREEN,
    textAlign: 'center',
  },
});
