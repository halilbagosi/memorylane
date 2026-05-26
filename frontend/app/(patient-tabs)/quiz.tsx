import { colors, lightColors, darkColors } from '../../src/theme/colors';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../src/theme/ThemeProvider';
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
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { SFSymbol } from 'expo-symbols';
import { typography } from '../../src/theme/typography';
import { AppIcon } from '../../src/components/AppIcon';
import { API_BASE_URL } from '../../src/config/api';
import { getPatientInfo, deletePatientInfo, PatientInfo } from '../../src/utils/auth';
import { M3Dialog, type M3DialogAction } from '../../src/components/M3Dialog';
import { QuizSuccessOverlay } from '../../src/components/QuizSuccessOverlay';
import {
  CareLevel,
  getPatientQuizData,
  QuizDifficulty,
  QuizMode,
  QuizResultAttempt,
  submitQuizResults,
  type QuizAttemptInput,
} from '../../src/services/media';
import {
  buildAdaptiveQuizSet,
  buildAdaptiveQuizSetFromIds,
  buildQuizPool,
  buildQuizSet,
  buildQuizSetFromIds,
  QuizQuestion,
  shouldMixQuestionTypes,
  uniqueIdentityCount,
} from '../../src/services/quiz';

const EMOJI_STAGES = [
  { max: 20, emoji: '🥺', label: 'Needs encouragement' },
  { max: 40, emoji: '😕', label: 'Getting started' },
  { max: 60, emoji: '😐', label: 'Making progress' },
  { max: 80, emoji: '🙂', label: 'Doing well' },
  { max: 100, emoji: '🤩', label: 'Excellent!' },
];

function getEmojiStage(percent: number) {
  for (const stage of EMOJI_STAGES) {
    if (percent <= stage.max) return stage;
  }
  return EMOJI_STAGES[EMOJI_STAGES.length - 1];
}

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
  mode: QuizMode | 'MIXED';
  modes: QuizMode[];
  careLevel: CareLevel;
  difficulty: QuizDifficulty;
  questionIds: string[];
  currentIndex: number;
  savedAt: number;
}

interface ResumeSession {
  mode: QuizMode | 'MIXED';
  questions: QuizQuestion[];
  currentIndex: number;
}

interface QuizRuntimeState {
  quizModes: QuizMode[];
  difficulty: QuizDifficulty;
  careLevel: CareLevel;
  aiAdaptiveEnabled: boolean;
  pool: ReturnType<typeof buildQuizPool>;
  identityCount: number;
}

const MIN_IDENTITIES = 4;
const SESSION_KEY_PREFIX = 'memorylane_patient_quiz_session';

const MODE_CONFIG: Record<QuizMode, { label: string; icon: SFSymbol; androidFallback: string }> = {
  NAME: { label: 'Practice Names', icon: 'person.fill', androidFallback: 'P' },
  AGE: { label: 'Practice Ages', icon: 'calendar', androidFallback: 'A' },
  RELATIONSHIP: { label: 'Practice Relationships', icon: 'heart.fill', androidFallback: 'R' },
};

function getTimeGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

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
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { width, height } = useWindowDimensions();

  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (isSilent = false) => {
    const info = await getPatientInfo();
    if (!info) return;
    setPatient(info);

    if (!isSilent) setLoading(true);
    try {
      // Fetch patient stats for goal progress display
      const statsRes = await fetch(`${API_BASE_URL}/patients/${info.id}/stats`);
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const [phase, setPhase] = useState<Phase>({ type: 'loading' });
  const [enabledModes, setEnabledModes] = useState<QuizMode[]>([]);
  const [quizDifficulty, setQuizDifficulty] = useState<QuizDifficulty>('MEDIUM');
  const [careLevel, setCareLevel] = useState<CareLevel>('DEMENTIA');
  const [aiAdaptiveEnabled, setAiAdaptiveEnabled] = useState(false);
  const [mediaPool, setMediaPool] = useState<ReturnType<typeof buildQuizPool>>([]);
  const [activeMode, setActiveMode] = useState<QuizMode | 'MIXED' | null>(null);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [resumeSession, setResumeSession] = useState<ResumeSession | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [wrongTaps, setWrongTaps] = useState<Set<string>>(new Set());
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('Well done.');
  const [hintVisible, setHintVisible] = useState(false);
  const [lastWrong, setLastWrong] = useState<string | null>(null);
  const [displayedPhoto, setDisplayedPhoto] = useState<{ key: string; uri: string } | null>(null);

  const wrongShake = useRef(new Animated.Value(0)).current;
  const questionFade = useRef(new Animated.Value(1)).current;
  const photoFade = useRef(new Animated.Value(0)).current;
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const questionIndexRef = useRef(questionIndex);
  const questionsLenRef = useRef(questions.length);
  const phaseRef = useRef<Phase>(phase);
  const patientRef = useRef<PatientInfo | null>(patient);
  const activeModeRef = useRef<QuizMode | 'MIXED' | null>(activeMode);
  const questionIdsRef = useRef<string[]>(questionIds);
  const enabledModesRef = useRef<QuizMode[]>(enabledModes);
  const careLevelRef = useRef<CareLevel>(careLevel);
  const quizDifficultyRef = useRef<QuizDifficulty>(quizDifficulty);
  const questionStartTimeRef = useRef(Date.now());
  const attemptResultsRef = useRef<QuizResultAttempt[]>([]);
  const quizAttemptRecordsRef = useRef<QuizAttemptInput[]>([]);
  const photoLoadTokenRef = useRef(0);

  const photoSize = useMemo(() => Math.min(width - 56, height * 0.38, 360), [height, width]);

  const introPrimaryMinHeight = useMemo(
    () => Math.max(450, Math.floor(height * 0.75)),
    [height],
  );

  useEffect(() => { questionIndexRef.current = questionIndex; }, [questionIndex]);
  useEffect(() => { questionsLenRef.current = questions.length; }, [questions.length]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { patientRef.current = patient; }, [patient]);
  useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);
  useEffect(() => { questionIdsRef.current = questionIds; }, [questionIds]);
  useEffect(() => { enabledModesRef.current = enabledModes; }, [enabledModes]);
  useEffect(() => { careLevelRef.current = careLevel; }, [careLevel]);
  useEffect(() => { quizDifficultyRef.current = quizDifficulty; }, [quizDifficulty]);

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
    if (phase.type !== 'quiz') return;
    questionFade.setValue(0);
    Animated.timing(questionFade, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [phase.type, questionFade, questionIndex]);

  useEffect(() => {
    if (phase.type !== 'quiz') return;
    const current = questions[questionIndex];
    const token = photoLoadTokenRef.current + 1;
    photoLoadTokenRef.current = token;
    setDisplayedPhoto(null);
    photoFade.setValue(0);
    if (current?.imageUrl) {
      const photoKey = `${current.media.publicId}-${current.imageUrl}`;
      Image.prefetch(current.imageUrl)
        .catch(() => false)
        .finally(() => {
          if (photoLoadTokenRef.current === token) {
            setDisplayedPhoto({ key: photoKey, uri: current.imageUrl });
          }
        });
      const next = questions[questionIndex + 1];
      if (next?.imageUrl) Image.prefetch(next.imageUrl).catch(() => undefined);
    }
  }, [phase.type, photoFade, questionIndex, questions]);

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
      modes: enabledModesRef.current,
      careLevel: careLevelRef.current,
      difficulty: quizDifficultyRef.current,
      questionIds: ids,
      currentIndex,
      savedAt: Date.now(),
    });
  }, []);

  const clearCurrentSession = useCallback(async () => {
    const p = patientRef.current;
    if (p) await deleteSavedSession(p.id);
  }, []);

  const filterAvailableQuizMedia = useCallback((
    media: Awaited<ReturnType<typeof getPatientQuizData>>['media'],
    validateUrls = false,
  ) => {
    if (!validateUrls) return Promise.resolve(media);
    return Promise.all(
      media.map(async (item) => {
        const response = await fetch(item.downloadUrl).catch(() => null);
        return response?.ok ? item : null;
      }),
    ).then((items) => items.filter((item): item is typeof media[number] => item !== null));
  }, []);

  const loadQuizRuntimeState = useCallback(async (
    patientId: string,
    options?: { validateUrls?: boolean },
  ): Promise<QuizRuntimeState> => {
    const {
      quizModes,
      quizDifficulty: manualDifficulty,
      predictedDifficulty,
      careLevel: nextCareLevel,
      aiAdaptiveEnabled: nextAiAdaptiveEnabled,
      media,
    } = await getPatientQuizData(patientId);
    const availableMedia = await filterAvailableQuizMedia(media, options?.validateUrls === true);
    const difficulty = nextAiAdaptiveEnabled ? (predictedDifficulty ?? manualDifficulty) : manualDifficulty;
    const nextPool = buildQuizPool(availableMedia);
    const identityCount = uniqueIdentityCount(availableMedia);
    const normalizedCareLevel = nextCareLevel ?? 'DEMENTIA';
    const normalizedDifficulty = difficulty ?? 'MEDIUM';
    const normalizedAiAdaptiveEnabled = nextAiAdaptiveEnabled === true;

    setMediaPool(nextPool);
    setEnabledModes(quizModes);
    setQuizDifficulty(normalizedDifficulty);
    setCareLevel(normalizedCareLevel);
    setAiAdaptiveEnabled(normalizedAiAdaptiveEnabled);

    return {
      quizModes,
      difficulty: normalizedDifficulty,
      careLevel: normalizedCareLevel,
      aiAdaptiveEnabled: normalizedAiAdaptiveEnabled,
      pool: nextPool,
      identityCount,
    };
  }, [filterAvailableQuizMedia]);

  const applyQuizAvailabilityPhase = useCallback(async (state: QuizRuntimeState, patientId?: string) => {
    if (state.pool.length === 0) {
      if (patientId) await deleteSavedSession(patientId);
      setPhase({ type: 'no_media' });
      return true;
    }
    if (state.identityCount < MIN_IDENTITIES) {
      if (patientId) await deleteSavedSession(patientId);
      setPhase({ type: 'insufficient_identities', count: state.identityCount });
      return true;
    }
    return false;
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

      const quizState = await loadQuizRuntimeState(p.id, { validateUrls: true });
      if (await applyQuizAvailabilityPhase(quizState, p.id)) return;

      const saved = await readSavedSession(p.id);
      if (saved && (saved.mode === 'MIXED' || quizState.quizModes.includes(saved.mode))) {
        const restoredQuestions = saved.mode === 'MIXED'
          ? buildAdaptiveQuizSetFromIds(
            quizState.pool,
            quizState.quizModes,
            quizState.careLevel,
            saved.questionIds,
            quizState.difficulty,
            quizState.aiAdaptiveEnabled,
          )
          : buildQuizSetFromIds(quizState.pool, saved.mode, saved.questionIds, quizState.difficulty);
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
  }, [applyQuizAvailabilityPhase, loadQuizRuntimeState, navigation]);

  useEffect(() => {
    initialise();
  }, [initialise]);

  const refreshQuizStateForCurrentPhase = useCallback(async () => {
    const p = patientRef.current ?? await getPatientInfo();
    if (!p) return;
    setPatient(p);
    const wasWaitingForMedia = ['no_media', 'insufficient_identities'].includes(phaseRef.current.type);
    if (wasWaitingForMedia) {
      setPhase({ type: 'loading' });
    }
    const latest = await loadQuizRuntimeState(p.id, { validateUrls: true });
    const blocked = await applyQuizAvailabilityPhase(latest, p.id);
    if (!blocked && (wasWaitingForMedia || ['no_media', 'insufficient_identities'].includes(phaseRef.current.type))) {
      setPhase({ type: 'intro' });
    }
  }, [applyQuizAvailabilityPhase, loadQuizRuntimeState]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (phaseRef.current.type !== 'quiz' && phaseRef.current.type !== 'resume_prompt' && phaseRef.current.type !== 'loading') {
        refreshQuizStateForCurrentPhase().catch((err: any) => {
          setPhase({ type: 'error', message: err?.message ?? 'Something went wrong.' });
        });
      }
    });
    return unsubscribe;
  }, [navigation, refreshQuizStateForCurrentPhase]);

  const clearDisplayedPhoto = useCallback(() => {
    const token = photoLoadTokenRef.current + 1;
    photoLoadTokenRef.current = token;
    setDisplayedPhoto(null);
    photoFade.setValue(0);
  }, [photoFade]);

  const startSet = useCallback(async (mode: QuizMode) => {
    const p = patientRef.current ?? await getPatientInfo();
    if (!p) return;
    try {
      const latest: QuizRuntimeState = {
        quizModes: enabledModesRef.current,
        difficulty: quizDifficultyRef.current,
        careLevel: careLevelRef.current,
        aiAdaptiveEnabled,
        pool: mediaPool,
        identityCount: uniqueIdentityCount(mediaPool.map((item) => item.media)),
      };
      if (await applyQuizAvailabilityPhase(latest, p.id)) return;
      if (!latest.quizModes.includes(mode)) {
        await deleteSavedSession(p.id);
        setPhase(latest.quizModes.length > 1 ? { type: 'mode_select' } : { type: 'intro' });
        return;
      }
      console.log(`[Quiz] Starting set for mode: ${mode}, pool size: ${latest.pool.length}`);
      const qs = buildQuizSet(latest.pool, mode, latest.difficulty);
      console.log(`[Quiz] Generated ${qs.length} questions`);
      if (qs.length === 0) {
        console.warn('[Quiz] No questions generated, cannot start quiz');
        setPhase({ type: 'intro' });
        return;
      }
      await deleteSavedSession(p.id);
      clearDisplayedPhoto();
      setQuestions(qs);
      setActiveMode(mode);
      setQuestionIds(qs.map((q) => q.media.publicId));
      setQuestionIndex(0);
      setScore(0);
      quizAttemptRecordsRef.current = [];
      setWrongTaps(new Set());
      setLastWrong(null);
      setHintVisible(false);
      hintOpacity.setValue(0);
      setShowSuccess(false);
      attemptResultsRef.current = [];
      questionStartTimeRef.current = Date.now();
      setPhase({ type: 'quiz' });
    } catch (err: any) {
      setPhase({ type: 'error', message: err?.message ?? 'Something went wrong.' });
    }
  }, [aiAdaptiveEnabled, applyQuizAvailabilityPhase, clearDisplayedPhoto, hintOpacity, mediaPool]);

  const startAdaptiveSet = useCallback(async () => {
    const p = patientRef.current ?? await getPatientInfo();
    if (!p) return;
    try {
      const latest: QuizRuntimeState = {
        quizModes: enabledModesRef.current,
        difficulty: quizDifficultyRef.current,
        careLevel: careLevelRef.current,
        aiAdaptiveEnabled,
        pool: mediaPool,
        identityCount: uniqueIdentityCount(mediaPool.map((item) => item.media)),
      };
      if (await applyQuizAvailabilityPhase(latest, p.id)) return;
      console.log(`[Quiz] Starting adaptive set. CareLevel: ${latest.careLevel}, Modes: ${latest.quizModes.join(',')}, Pool: ${latest.pool.length}`);
      const qs = buildAdaptiveQuizSet(
        latest.pool,
        latest.quizModes,
        latest.careLevel,
        latest.difficulty,
        latest.aiAdaptiveEnabled,
      );
      console.log(`[Quiz] Generated ${qs.length} adaptive questions`);
      if (qs.length === 0) {
        console.warn('[Quiz] No adaptive questions generated, cannot start quiz');
        setPhase({ type: 'intro' });
        return;
      }
      await deleteSavedSession(p.id);
      clearDisplayedPhoto();
      setQuestions(qs);
      setActiveMode(shouldMixQuestionTypes(latest.careLevel, latest.difficulty, latest.aiAdaptiveEnabled) ? 'MIXED' : qs[0].mode);
      setQuestionIds(qs.map((q) => q.media.publicId));
      setQuestionIndex(0);
      setScore(0);
      setWrongTaps(new Set());
      setLastWrong(null);
      setHintVisible(false);
      hintOpacity.setValue(0);
      setShowSuccess(false);
      attemptResultsRef.current = [];
      questionStartTimeRef.current = Date.now();
      setPhase({ type: 'quiz' });
    } catch (err: any) {
      setPhase({ type: 'error', message: err?.message ?? 'Something went wrong.' });
    }
  }, [aiAdaptiveEnabled, applyQuizAvailabilityPhase, clearDisplayedPhoto, hintOpacity, mediaPool]);

  const continueSavedSession = useCallback(async () => {
    if (!resumeSession) return;
    const p = patientRef.current ?? await getPatientInfo();
    if (!p) return;
    try {
      const latest = await loadQuizRuntimeState(p.id, { validateUrls: true });
      if (await applyQuizAvailabilityPhase(latest, p.id)) {
        setResumeSession(null);
        return;
      }
      const restoredQuestions = resumeSession.mode === 'MIXED'
        ? buildAdaptiveQuizSetFromIds(
          latest.pool,
          latest.quizModes,
          latest.careLevel,
          resumeSession.questions.map((q) => q.media.publicId),
          latest.difficulty,
          latest.aiAdaptiveEnabled,
        )
        : buildQuizSetFromIds(
          latest.pool,
          resumeSession.mode,
          resumeSession.questions.map((q) => q.media.publicId),
          latest.difficulty,
        );
      if (restoredQuestions.length <= resumeSession.currentIndex) {
        await deleteSavedSession(p.id);
        setResumeSession(null);
        setPhase({ type: 'intro' });
        return;
      }
      clearDisplayedPhoto();
      setQuestions(restoredQuestions);
      setActiveMode(resumeSession.mode);
      setQuestionIds(restoredQuestions.map((q) => q.media.publicId));
      setQuestionIndex(resumeSession.currentIndex);
      setScore(0);
      quizAttemptRecordsRef.current = [];
      setWrongTaps(new Set());
      setLastWrong(null);
      setHintVisible(false);
      hintOpacity.setValue(0);
      setShowSuccess(false);
      attemptResultsRef.current = [];
      questionStartTimeRef.current = Date.now();
      setResumeSession(null);
      setPhase({ type: 'quiz' });
    } catch (err: any) {
      setPhase({ type: 'error', message: err?.message ?? 'Something went wrong.' });
    }
  }, [applyQuizAvailabilityPhase, clearDisplayedPhoto, hintOpacity, loadQuizRuntimeState, resumeSession]);

  const startNewSession = useCallback(async () => {
    await clearCurrentSession();
    clearDisplayedPhoto();
    setResumeSession(null);
    setQuestions([]);
    setQuestionIds([]);
    setActiveMode(null);
    setQuestionIndex(0);
    quizAttemptRecordsRef.current = [];
    setWrongTaps(new Set());
    setLastWrong(null);
    setHintVisible(false);
    hintOpacity.setValue(0);
    setShowSuccess(false);
    setPhase({ type: 'intro' });
  }, [clearCurrentSession, clearDisplayedPhoto]);

  const handleIntroStart = useCallback(async () => {
    try {
      const p = patientRef.current ?? await getPatientInfo();
      if (!p) return;
      const latest: QuizRuntimeState = {
        quizModes: enabledModesRef.current,
        difficulty: quizDifficultyRef.current,
        careLevel: careLevelRef.current,
        aiAdaptiveEnabled,
        pool: mediaPool,
        identityCount: uniqueIdentityCount(mediaPool.map((item) => item.media)),
      };
      if (await applyQuizAvailabilityPhase(latest, p.id)) return;

      if (latest.aiAdaptiveEnabled || latest.careLevel === 'PREVENTATIVE') {
        startAdaptiveSet();
        return;
      }
      if (latest.quizModes.length > 1) {
        setPhase({ type: 'mode_select' });
        return;
      }
      const preferredMode = latest.quizModes.includes('NAME') ? 'NAME' : latest.quizModes[0];
      if (preferredMode) startSet(preferredMode);
    } catch (err: any) {
      setPhase({ type: 'error', message: err?.message ?? 'Something went wrong.' });
    }
  }, [aiAdaptiveEnabled, applyQuizAvailabilityPhase, mediaPool, startAdaptiveSet, startSet]);

  const showHint = useCallback(() => {
    const current = questions[questionIndexRef.current];
    if (!current?.media.hint) return;
    setHintVisible(true);
    Animated.timing(hintOpacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [hintOpacity, questions]);

  useEffect(() => {
    if (phase.type !== 'quiz') return;
    questionStartTimeRef.current = Date.now();
    setWrongTaps(new Set());
    setLastWrong(null);
    setHintVisible(false);
    hintOpacity.setValue(0);
    if (quizDifficulty === 'EASY') {
      requestAnimationFrame(() => showHint());
    }
  }, [hintOpacity, phase.type, questionIndex, quizDifficulty, showHint]);

  const buildSuccessMessage = useCallback((question: QuizQuestion) => {
    const nickname = question.media.nickname?.trim();
    const patientFirstName = patient?.name?.split(' ')[0] ?? '';
    const fallback = patientFirstName ? `Well done, ${patientFirstName}!` : 'Well done!';
    if (!nickname) return fallback;
    const options = [
      `${nickname} says: Well done!`,
      `That's right! It's ${nickname}.`,
      `${nickname} is so proud of you!`,
    ];
    return options[Math.floor(Math.random() * options.length)];
  }, []);

  const handleChoice = useCallback((choice: string) => {
    if (showSuccess) return;
    const current = questions[questionIndex];
    if (!current) return;

    if (choice === current.correctAnswer) {
      const firstTapCorrect = wrongTaps.size === 0;
      quizAttemptRecordsRef.current = [
        ...quizAttemptRecordsRef.current,
        {
          mediaPublicId: current.media.publicId,
          firstTapCorrect,
          totalTaps: wrongTaps.size + 1,
          timeToCorrectMs: Date.now() - questionStartTimeRef.current,
          attemptedAt: new Date().toISOString(),
        },
      ];
      if (wrongTaps.size === 0) setScore((s) => s + 1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      attemptResultsRef.current.push({
        publicId: current.media.publicId,
        mode: current.mode,
        difficulty: quizDifficulty,
        firstTapCorrect: wrongTaps.size === 0,
        totalTaps: wrongTaps.size + 1,
        timeToCorrectMs: Date.now() - questionStartTimeRef.current,
        hadHint: hintVisible || quizDifficulty === 'EASY',
      });
      saveCurrentSession(questionIndex + 1).catch(() => undefined);
      setSuccessMessage(buildSuccessMessage(current));
      setShowSuccess(true);
      return;
    }

    if (wrongTaps.size === 0) {
      showHint();
    }
    setLastWrong(choice);
    setWrongTaps((prev) => new Set([...prev, choice]));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    wrongShake.setValue(0);
    Animated.sequence([
      Animated.timing(wrongShake, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(wrongShake, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(wrongShake, { toValue: 5, duration: 50, useNativeDriver: true }),
      Animated.timing(wrongShake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start(() => setLastWrong(null));
  }, [buildSuccessMessage, hintVisible, questionIndex, questions, quizDifficulty, saveCurrentSession, showHint, showSuccess, wrongShake, wrongTaps.size]);

  const handleSuccessDismiss = useCallback(() => {
    setShowSuccess(false);
    setWrongTaps(new Set());
    setLastWrong(null);
    setHintVisible(false);
    hintOpacity.setValue(0);

    const nextIndex = questionIndexRef.current + 1;
    if (nextIndex >= questionsLenRef.current) {
      clearCurrentSession().catch(() => undefined);
      const p = patientRef.current;
      const attempts = attemptResultsRef.current;
      if (p && attempts.length > 0) {
        submitQuizResults(p.id, attempts).then(() => {
          fetch(`${API_BASE_URL}/patients/${p.id}/patient-stats`)
            .then(res => res.ok ? res.json() : null)
            .then(data => { if (data) setStats(data); })
            .catch(() => undefined);
        }).catch(() => undefined);
      }
      setPhase({ type: 'summary' });
    } else {
      Animated.timing(questionFade, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }).start(() => {
        photoLoadTokenRef.current += 1;
        setDisplayedPhoto(null);
        photoFade.setValue(0);
        setQuestionIndex(nextIndex);
      });
    }
  }, [clearCurrentSession, hintOpacity, questionFade]);

  const handleLogout = () => {
// We keep the safety check from alpha
    if (!['intro', 'mode_select', 'no_media', 'insufficient_identities'].includes(phase.type)) return;

    // We keep your awesome popup dialog from popup-omptimization
    showDialog('Log Out (Debug)', 'Return to the welcome screen?', [
      { label: 'Cancel', onPress: dismissDialog },
      {
        label: 'Log Out',
        destructive: true,
        onPress: async () => {
          dismissDialog();
          await deletePatientInfo();
          navigation.dispatch(
            CommonActions.reset({ index: 0, routes: [{ name: 'index' }] })
          ); // <-- Note: I closed the parentheses here for you!
        }
      }
    ]);
  }; // <-- Closes the logout function

  // We keep ALL the new UI screens that were added in alpha
  const renderLoading = () => (
    <View style={styles.centerFill}>
      <ActivityIndicator size="large" color={themeColors.primary} />
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
    <ScrollView
      style={styles.phaseScroll}
      contentContainerStyle={styles.introScrollContent}
      showsVerticalScrollIndicator={false}
      scrollEnabled={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.centerFill, { minHeight: height * 0.7 }]}>
        <AppIcon iosName="photo.on.rectangle.angled" androidFallback="P" size={56} color={themeColors.primary} />
        <Text style={styles.emptyTitle}>No Quiz Photos Yet</Text>
        <Text style={styles.emptySubtitle}>Ask your caregiver to add photos to your quiz library.</Text>
      </View>
    </ScrollView>
  );

  const renderInsufficientIdentities = (count: number) => (
    <ScrollView
      style={styles.phaseScroll}
      contentContainerStyle={styles.introScrollContent}
      showsVerticalScrollIndicator={false}
      scrollEnabled={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.centerFill, { minHeight: height * 0.7 }]}>
        <AppIcon iosName="sparkles" androidFallback="*" size={52} color={themeColors.primary} />
        <Text style={styles.emptyTitle}>Quiz Coming Soon</Text>
        <Text style={styles.emptySubtitle}>
          Your quiz will be ready when there are 4 familiar faces. Current: {count}/4.
        </Text>
      </View>
    </ScrollView>
  );

  const renderIntro = () => (
    <ScrollView
      style={styles.phaseScroll}
      contentContainerStyle={styles.introScrollContent}
      showsVerticalScrollIndicator={false}
      scrollEnabled={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.introContent, { minHeight: introPrimaryMinHeight }]}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' }}>
          <Text style={styles.introText}>
            {`${getTimeGreeting()}${patient?.name ? `, ${patient.name}` : ''}. Let's see some familiar faces!`}
          </Text>
          <View style={{ height: 48 }} />
          <TouchableOpacity style={styles.startButton} onPress={handleIntroStart} activeOpacity={0.85}>
            <Text style={styles.startButtonText}>Start</Text>
          </TouchableOpacity>

          {stats && stats.goal && (
            <View style={[styles.patientGoalCard, { marginTop: 48 }]}>
              <View style={styles.patientGoalHeader}>
                <Text style={styles.patientGoalTitle}>Your Goal</Text>
                <Text style={styles.patientGoalPercent}>{stats.currentAccuracy}%</Text>
              </View>
              <View style={styles.patientGoalTrack}>
                <View 
                  style={[
                    styles.patientGoalFill, 
                    { width: `${Math.min(100, (stats.currentAccuracy / stats.goal.targetAccuracy) * 100)}%` }
                  ]} 
                />
                <View style={[styles.patientGoalMarker, { left: `${Math.min(100, stats.goal.targetAccuracy)}%` }]} />
              </View>
              <Text style={styles.patientGoalSubtext}>
                {stats.currentAccuracy >= stats.goal.targetAccuracy 
                  ? '🎉 You reached your goal!' 
                  : `${stats.goal.targetAccuracy}% accuracy target`}
              </Text>
            </View>
          )}
        </View>

      </View>
    </ScrollView>
  );

  const renderResumePrompt = () => (
    <View style={[styles.resumeFill, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.resumeCard}>
        <Text style={styles.resumeText}>
          Welcome back{patient?.name ? `, ${patient.name}` : ''}. Would you like to continue your practice?
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
    <ScrollView
      style={styles.phaseScroll}
      contentContainerStyle={styles.modeSelectContent}
      showsVerticalScrollIndicator={false}
      scrollEnabled={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ minHeight: height * 0.7, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={styles.modeSelectTitle}>What would you like to practice?</Text>
        <View style={styles.modeButtonsCol}>
          {enabledModes.map((mode) => {
            const cfg = MODE_CONFIG[mode];
            const hasMedia = buildQuizSet(mediaPool, mode, quizDifficulty, 1).length > 0;
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
                  color={hasMedia ? themeColors.neutralLight : '#888888'}
                />
                <Text style={[styles.modePillText, !hasMedia && styles.modePillTextDisabled]}>{cfg.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );


  const renderQuestion = () => {
    const q = questions[questionIndex];
    if (!q) return null;
    const photoKey = `${q.media.publicId}-${q.imageUrl}`;

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

        {!!q.media.hint && (
          <View style={styles.hintArea}>
            {hintVisible ? (
              <Animated.View style={[styles.hintBubble, { opacity: hintOpacity }]}>
                <Text style={styles.hintText}>{q.media.hint}</Text>
              </Animated.View>
            ) : (
              <TouchableOpacity style={styles.hintButton} onPress={showHint} activeOpacity={0.75}>
                <Text style={styles.hintButtonText}>Need a hint?</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={[styles.photoShadow, { width: photoSize, height: photoSize }]}>
          <View style={styles.photoClip}>
            <View style={styles.photoLoading}>
              <ActivityIndicator size="small" color={themeColors.primary} />
            </View>
            {displayedPhoto?.key === photoKey && (
              <Animated.Image
                key={displayedPhoto.key}
                source={{ uri: displayedPhoto.uri }}
                style={[styles.photo, { opacity: photoFade }]}
                resizeMode="cover"
                onLoad={() => {
                  Animated.timing(photoFade, {
                    toValue: 1,
                    duration: 220,
                    useNativeDriver: true,
                  }).start();
                }}
              />
            )}
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

        <QuizSuccessOverlay visible={showSuccess} message={successMessage} onDismiss={handleSuccessDismiss} />
      </Animated.View>
    );
  };

  const goToRelive = () => {
    navigation.navigate('relive' as never);
  };

  const renderSummary = () => {
    const showAdaptiveRetry = aiAdaptiveEnabled || careLevel === 'PREVENTATIVE';
    const hasAdaptiveMedia = showAdaptiveRetry
      && buildAdaptiveQuizSet(mediaPool, enabledModes, careLevel, quizDifficulty, aiAdaptiveEnabled).length > 0;

    return (
      <ScrollView
        style={styles.phaseScroll}
        contentContainerStyle={[styles.summaryContent, { paddingTop: 40, paddingBottom: 60 }]}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: '100%', alignItems: 'center', gap: 32 }}>
          <View style={styles.summaryMessageBlock}>
            <Text style={styles.summaryTitle}>
              Wonderful job{patient?.name ? `, ${patient.name}` : ''}. You've seen everyone today!
            </Text>
          </View>

          {stats && stats.goal && (
            <>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 64, marginBottom: 4 }}>
                  {getEmojiStage(Math.min(100, Math.round((stats.currentAccuracy / stats.goal.targetAccuracy) * 100))).emoji}
                </Text>
                <Text style={{ fontFamily: typography.fontFamily.medium, fontSize: 15, color: themeColors.textMuted }}>
                  {getEmojiStage(Math.min(100, Math.round((stats.currentAccuracy / stats.goal.targetAccuracy) * 100))).label}
                </Text>
              </View>

              <View style={styles.patientGoalCard}>
                <View style={styles.patientGoalHeader}>
                  <Text style={styles.patientGoalTitle}>Accuracy Goal</Text>
                  <Text style={styles.patientGoalPercent}>{stats.currentAccuracy}%</Text>
                </View>
                <View style={styles.patientGoalTrack}>
                  <View 
                    style={[
                      styles.patientGoalFill, 
                      { width: `${Math.min(100, stats.currentAccuracy)}%` }
                    ]} 
                  />
                  <View style={[styles.patientGoalMarker, { left: `${Math.min(100, stats.goal.targetAccuracy)}%` }]}>
                    <View style={styles.patientGoalMarkerLine} />
                    <View style={styles.patientGoalMarkerPill}>
                      <Text style={styles.patientGoalMarkerLabel}>🎯 {stats.goal.targetAccuracy}%</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.patientGoalSubtext}>
                  {stats.currentAccuracy >= stats.goal.targetAccuracy 
                    ? '🎉 You reached your goal!' 
                    : `Target: ${stats.goal.targetAccuracy}% accuracy`}
                </Text>
              </View>
            </>
          )}

          <TouchableOpacity style={styles.photosButton} onPress={goToRelive} activeOpacity={0.85}>
            <Text style={styles.photosButtonText}>Go to my photos</Text>
            <Text style={styles.photosButtonHint}>You can also leave a memory for your family there</Text>
          </TouchableOpacity>

          <Text style={styles.summaryPrompt}>Practice again:</Text>
          
          {showAdaptiveRetry && (
            <TouchableOpacity
              style={[styles.adaptivePracticeChoice, !hasAdaptiveMedia && styles.modePillDisabled]}
              onPress={() => hasAdaptiveMedia && startAdaptiveSet()}
              activeOpacity={hasAdaptiveMedia ? 0.78 : 1}
            >
              <AppIcon
                iosName="brain.head.profile"
                androidFallback="AI"
                size={18}
                color={hasAdaptiveMedia ? themeColors.neutralLight : '#888888'}
              />
              <Text style={[styles.adaptivePracticeChoiceText, !hasAdaptiveMedia && styles.modePillTextDisabled]}>
                Practice together
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.practiceChoiceGrid}>
            {enabledModes.map((mode) => {
              const cfg = MODE_CONFIG[mode];
              const hasMedia = buildQuizSet(mediaPool, mode, quizDifficulty, 1).length > 0;
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

        </View>
      </ScrollView>
    );
  };

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

{/* We keep all the new dynamic screens from the alpha branch */}
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

      {/* We keep your new Dialog component from popup-omptimization */}
      <M3Dialog
        visible={dialog.visible}
        title={dialog.title}
        body={dialog.body}
        actions={dialog.actions}
        onDismiss={dismissDialog}
      />
    </View>
  );
}

const getStyles = (isDark: boolean) => {
  const themeColors = isDark ? darkColors : lightColors;
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.neutral,
    paddingHorizontal: 24,
  },
  phaseScroll: {
    flex: 1,
    width: '100%',
  },
  introScrollContent: {
    flexGrow: 1,
    paddingBottom: 180, // Clear the navigation bar
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
    color: themeColors.primary,
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
    backgroundColor: themeColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: themeColors.neutralLight,
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
    color: themeColors.primary,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  retryBtn: {
    backgroundColor: themeColors.neutralLight,
    borderRadius: 50,
    paddingVertical: 14,
    paddingHorizontal: 36,
  },
  retryBtnText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: themeColors.primary,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 24,
    color: themeColors.primary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 17,
    color: themeColors.textMuted,
    textAlign: 'center',
    lineHeight: 25,
    maxWidth: 300,
  },
  introContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
    paddingHorizontal: 8,
    paddingBottom: 24,
    width: '100%',
  },
  introText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 30,
    color: themeColors.primary,
    lineHeight: 40,
    textAlign: 'center',
  },
  startButton: {
    minWidth: 190,
    borderRadius: 999,
    backgroundColor: themeColors.neutralLight,
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
    color: themeColors.primary,
  },
  resumeFill: {
    flex: 1,
    backgroundColor: themeColors.neutral,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  resumeCard: {
    width: '100%',
    borderRadius: 24,
    backgroundColor: themeColors.neutralLight,
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30, 77, 48, 0.18)'),
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
    color: themeColors.primary,
    textAlign: 'center',
  },
  resumeActions: {
    width: '100%',
    gap: 12,
  },
  resumePrimaryBtn: {
    borderRadius: 999,
    backgroundColor: themeColors.primary,
    paddingVertical: 16,
    alignItems: 'center',
  },
  resumePrimaryText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: themeColors.neutralLight,
  },
  resumeSecondaryBtn: {
    borderRadius: 999,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30, 77, 48, 0.08)'),
    paddingVertical: 15,
    alignItems: 'center',
  },
  resumeSecondaryText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 17,
    color: themeColors.primary,
  },
  modeSelectContent: {
    flexGrow: 1,
    paddingTop: 48,
    paddingBottom: 180, // Generous padding to clear the floating navigation bar
    alignItems: 'center',
    width: '100%',
  },
  modeSelectTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 28,
    color: themeColors.primary,
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
    backgroundColor: themeColors.primary,
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
    color: themeColors.neutralLight,
    flex: 1,
    textAlign: 'center',
  },
  modePillTextDisabled: {
    color: '#888888',
  },
  quizScreen: {
    flex: 1,
    backgroundColor: themeColors.neutral,
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
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30, 77, 48, 0.24)'),
  },
  progressDashActive: {
    backgroundColor: themeColors.neutralLight,
  },
  questionText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 30,
    color: themeColors.primary,
    textAlign: 'center',
    lineHeight: 38,
    marginBottom: 28,
  },
  photoShadow: {
    borderRadius: 30,
    backgroundColor: themeColors.neutralLight,
    marginBottom: 16,
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
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30, 77, 48, 0.08)'),
  },
  photoLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  hintArea: {
    width: '100%',
    alignItems: 'center',
    minHeight: 74,
    marginBottom: 12,
  },
  hintButton: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(252, 254, 249, 0.58)'),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30, 77, 48, 0.18)'),
  },
  hintButtonText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: themeColors.primary,
    textDecorationLine: 'underline',
  },
  hintBubble: {
    marginTop: 10,
    maxWidth: 320,
    borderRadius: 18,
    backgroundColor: themeColors.neutralLight,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30, 77, 48, 0.18)'),
  },
  hintText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    lineHeight: 21,
    color: themeColors.primary,
    textAlign: 'center',
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
    backgroundColor: themeColors.neutralLight,
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
    color: themeColors.primary,
    textAlign: 'center',
    lineHeight: 23,
  },
  choiceBtnTextWrong: {
    color: '#7A7A7A',
  },
  summaryContent: {
    flexGrow: 1,
    paddingTop: 48,
    paddingBottom: 180, // Generous padding to clear the floating navigation bar
    alignItems: 'center',
    gap: 24,
    width: '100%',
  },
  summaryMessageBlock: {
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  summaryTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 30,
    color: themeColors.primary,
    textAlign: 'center',
    lineHeight: 40,
  },
  photosButton: {
    minWidth: 230,
    borderRadius: 999,
    backgroundColor: themeColors.neutralLight,
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
    color: themeColors.primary,
    textAlign: 'center',
  },
  photosButtonHint: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: themeColors.primary,
    textAlign: 'center',
    opacity: 0.65,
    marginTop: 4,
  },
  summaryPrompt: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: themeColors.primary,
    marginTop: 18,
  },
  practiceChoiceGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  adaptivePracticeChoice: {
    minWidth: 230,
    maxWidth: 320,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: themeColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  adaptivePracticeChoiceText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: themeColors.neutralLight,
    textAlign: 'center',
  },
  practiceChoice: {
    borderRadius: 999,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(252, 254, 249, 0.9)'),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30, 77, 48, 0.18)'),
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  practiceChoiceText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: themeColors.primary,
    textAlign: 'center',
  },
  patientGoalCard: {
    width: '100%',
    backgroundColor: (isDark ? 'rgba(76,175,80,0.08)' : 'rgba(76,175,80,0.05)'),
    borderRadius: 20,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: (isDark ? 'rgba(76,175,80,0.2)' : 'rgba(76,175,80,0.15)'),
  },
  patientGoalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  patientGoalTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: themeColors.primary,
  },
  patientGoalPercent: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: '#4CAF50',
  },
  patientGoalTrack: {
    height: 12,
    borderRadius: 6,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.08)' : 'rgba(0,0,0,0.06)'),
    overflow: 'visible',
    position: 'relative',
  },
  patientGoalFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
  },
  patientGoalMarker: {
    position: 'absolute',
    top: 14,
    marginLeft: -24,
    alignItems: 'center',
    zIndex: 10,
  },
  patientGoalMarkerLine: {
    width: 0,
    height: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: isDark ? 'rgba(245,251,247,0.5)' : 'rgba(0,0,0,0.3)',
  },
  patientGoalMarkerPill: {
    backgroundColor: isDark ? 'rgba(76,175,80,0.2)' : 'rgba(76,175,80,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? 'rgba(76,175,80,0.4)' : 'rgba(76,175,80,0.3)',
  },
  patientGoalMarkerLabel: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
    color: isDark ? '#A8D5BA' : '#2E7D32',
  },
  patientGoalSubtext: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: themeColors.textMuted,
    marginTop: 18,
    textAlign: 'center',
  },
});
};
