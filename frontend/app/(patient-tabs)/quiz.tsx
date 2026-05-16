import { colors, lightColors, darkColors } from '../../src/theme/colors';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../src/theme/ThemeProvider';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  AppStateStatus,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { API_BASE_URL } from '../../src/config/api';
import { getPatientInfo, deletePatientInfo, PatientInfo } from '../../src/utils/auth';
import { getPatientTimeline, uploadMediaByPatient, type TimelineItem, type MediaKind } from '../../src/services/media';
import { getPatientNotes, addPatientNote, isPatientJournalTimelineNote, type Note } from '../../src/services/notes';
import * as FileSystem from 'expo-file-system';
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

const MIN_IDENTITIES = 4;
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
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { width, height } = useWindowDimensions();

  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [memories, setMemories] = useState<TimelineItem[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Media state
  const [selectedMedia, setSelectedMedia] = useState<{ uri: string; kind: MediaKind; type: string } | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const loadData = useCallback(async (isSilent = false) => {
    const info = await getPatientInfo();
    if (!info) return;
    setPatient(info);

    if (!isSilent) setLoading(true);
    try {
      const [timelineData, notesData] = await Promise.all([
        getPatientTimeline(info.id),
        getPatientNotes(info.id),
      ]);
      setMemories(timelineData);
      setNotes(notesData);
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

  const scrollViewRef = useRef<ScrollView>(null);
  const swipeUpBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // We make the bounce a bit more pronounced as requested
    const bounceAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(swipeUpBounce, { 
          toValue: -14, 
          duration: 700, 
          useNativeDriver: true 
        }),
        Animated.spring(swipeUpBounce, {
          toValue: 0,
          friction: 4,
          tension: 40,
          useNativeDriver: true
        }),
        Animated.delay(200),
      ])
    );

    // Trigger a very subtle haptic tap at the start of each bounce cycle
    // to give it a "physical" feel without being annoying.
    const hapticInterval = setInterval(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }, 1600); // Matches the total duration of the bounce cycle (700+700+200 approx)

    bounceAnimation.start();
    
    return () => {
      bounceAnimation.stop();
      clearInterval(hapticInterval);
    };
  }, [swipeUpBounce]);

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

  const photoSize = useMemo(() => Math.min(width - 56, height * 0.38, 360), [height, width]);

  const combinedFeed = useMemo(() => {
    const memoryRows = memories
      .filter((m) => !isPatientJournalTimelineNote(m.note))
      .map((m) => ({
        type: 'MEMORY' as const,
        id: m.publicId,
        createdAt: m.createdAt,
        kind: m.kind,
        downloadUrl: m.downloadUrl,
        note: m.note,
      }));
    const noteRows = notes.map((n) => ({
      type: 'NOTE' as const,
      id: (n as { id: string }).id,
      createdAt: (n as { createdAt: string }).createdAt,
      content: (n as { content: string }).content,
    }));
    return [...memoryRows, ...noteRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [memories, notes]);

  const leaveMemoriesScrollGap = useMemo(
    () => ({ minHeight: 120 }), // Increased spacing as requested
    [],
  );

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
    photoFade.setValue(0);
    if (current?.imageUrl) {
      Image.prefetch(current.imageUrl).catch(() => undefined);
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

      const {
        quizModes,
        quizDifficulty: manualDifficulty,
        predictedDifficulty,
        careLevel: nextCareLevel,
        aiAdaptiveEnabled: nextAiAdaptiveEnabled,
        media,
      } = await getPatientQuizData(p.id);
      const difficulty = nextAiAdaptiveEnabled ? (predictedDifficulty ?? manualDifficulty) : manualDifficulty;
      const pool = buildQuizPool(media);
      const identityCount = uniqueIdentityCount(media);
      setMediaPool(pool);
      setEnabledModes(quizModes);
      setQuizDifficulty(difficulty ?? 'MEDIUM');
      setCareLevel(nextCareLevel ?? 'DEMENTIA');
      setAiAdaptiveEnabled(nextAiAdaptiveEnabled === true);

      if (pool.length === 0) {
        setPhase({ type: 'no_media' });
        return;
      }
      if (identityCount < MIN_IDENTITIES) {
        setPhase({ type: 'insufficient_identities', count: identityCount });
        return;
      }

      const saved = await readSavedSession(p.id);
      if (saved && (saved.mode === 'MIXED' || quizModes.includes(saved.mode))) {
        const restoredQuestions = saved.mode === 'MIXED'
          ? buildAdaptiveQuizSetFromIds(
            pool,
            quizModes,
            nextCareLevel ?? 'DEMENTIA',
            saved.questionIds,
            difficulty ?? 'MEDIUM',
            nextAiAdaptiveEnabled === true,
          )
          : buildQuizSetFromIds(pool, saved.mode, saved.questionIds, difficulty ?? 'MEDIUM');
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
    console.log(`[Quiz] Starting set for mode: ${mode}, pool size: ${mediaPool.length}`);
    const qs = buildQuizSet(mediaPool, mode, quizDifficulty);
    console.log(`[Quiz] Generated ${qs.length} questions`);
    if (qs.length === 0) {
      console.warn('[Quiz] No questions generated, cannot start quiz');
      return;
    }
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
  }, [hintOpacity, mediaPool, quizDifficulty]);

  const startAdaptiveSet = useCallback(() => {
    console.log(`[Quiz] Starting adaptive set. CareLevel: ${careLevel}, Modes: ${enabledModes.join(',')}, Pool: ${mediaPool.length}`);
    const qs = buildAdaptiveQuizSet(mediaPool, enabledModes, careLevel, quizDifficulty, aiAdaptiveEnabled);
    console.log(`[Quiz] Generated ${qs.length} adaptive questions`);
    if (qs.length === 0) {
      console.warn('[Quiz] No adaptive questions generated, cannot start quiz');
      return;
    }
    setQuestions(qs);
    setActiveMode(shouldMixQuestionTypes(careLevel, quizDifficulty, aiAdaptiveEnabled) ? 'MIXED' : qs[0].mode);
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
  }, [aiAdaptiveEnabled, careLevel, enabledModes, hintOpacity, mediaPool, quizDifficulty]);

  const continueSavedSession = useCallback(() => {
    if (!resumeSession) return;
    setQuestions(resumeSession.questions);
    setActiveMode(resumeSession.mode);
    setQuestionIds(resumeSession.questions.map((q) => q.media.publicId));
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
  }, [resumeSession]);

  const startNewSession = useCallback(async () => {
    await clearCurrentSession();
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
  }, [clearCurrentSession]);

  const handleIntroStart = useCallback(() => {
    if (aiAdaptiveEnabled || careLevel === 'PREVENTATIVE') {
      startAdaptiveSet();
      return;
    }
    if (enabledModes.length > 1) {
      setPhase({ type: 'mode_select' });
      return;
    }
    const preferredMode = enabledModes.includes('NAME') ? 'NAME' : enabledModes[0];
    if (preferredMode) startSet(preferredMode);
  }, [aiAdaptiveEnabled, careLevel, enabledModes, startAdaptiveSet, startSet]);

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
        submitQuizResults(p.id, attempts).catch(() => undefined);
      }
      setPhase({ type: 'summary' });
    } else {
      Animated.timing(questionFade, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }).start(() => setQuestionIndex(nextIndex));
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

  const handlePickMedia = async (kind: 'PHOTO' | 'VIDEO') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'PHOTO' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setSelectedMedia({
        uri: asset.uri,
        kind: kind,
        type: asset.mimeType || (kind === 'PHOTO' ? 'image/jpeg' : 'video/mp4'),
      });
    }
  };

  const handleStartRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const handleStopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    if (uri) {
      setSelectedMedia({
        uri,
        kind: 'AUDIO',
        type: 'audio/m4a',
      });
    }
    setRecording(null);
  };

  const handleSaveMemory = async () => {
    if ((!newNote.trim() && !selectedMedia) || !patient) return;

    setIsSubmitting(true);
    try {
      if (selectedMedia) {
        // Upload Media
        const fileInfo = await FileSystem.getInfoAsync(selectedMedia.uri);
        if (!fileInfo.exists) throw new Error('File not found');

        await uploadMediaByPatient({
          patientId: patient.id,
          kind: selectedMedia.kind,
          contentType: selectedMedia.type,
          fileUri: selectedMedia.uri,
          byteSize: fileInfo.size,
          metadata: {
            collection: 'MEMORY',
            note: newNote.trim() || `Recorded ${selectedMedia.kind.toLowerCase()}`,
          },
        });
      } else {
        // Just a text note
        const note = await addPatientNote(patient.id, newNote);
        setNotes((prev) => [note, ...prev]);
      }
      
      setNewNote('');
      setSelectedMedia(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined); // Success feedback
      loadData(true); // Refresh feed
    } catch (error: any) {
      console.error('Save failed:', error);
      Alert.alert('Error', error.message || 'Failed to save. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderLeaveMemoriesSection = () => (
    <View style={styles.leaveMemoriesSection}>
      <View style={[styles.leaveMemoriesSpacer, leaveMemoriesScrollGap]} />
      <View style={styles.scrollHintCard}>
        <AppIcon iosName="arrow.down.circle.fill" androidFallback="v" size={26} color={themeColors.primary} />
        <Text style={styles.scrollHintTitle}>Leave a memory for family</Text>
        <Text style={styles.scrollHintBody}>
          Keep scrolling on this page — below your practice area you can write a note or share a photo, video, or voice
          message with loved ones.
        </Text>
      </View>

      <View style={styles.noteInputCard}>
        <Text style={styles.sectionTitle}>{"What's on your mind?"}</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Write a note or share a memory..."
          placeholderTextColor={themeColors.textMuted}
          multiline
          value={newNote}
          onChangeText={setNewNote}
        />

        {selectedMedia && (
          <View style={styles.mediaPreview}>
            {selectedMedia.kind === 'PHOTO' ? (
              <Image source={{ uri: selectedMedia.uri }} style={styles.previewImage} />
            ) : (
              <View style={styles.mediaPlaceholder}>
                <AppIcon
                  iosName={selectedMedia.kind === 'VIDEO' ? 'video.fill' : 'mic.fill'}
                  androidFallback="M"
                  size={24}
                  color={themeColors.primary}
                />
                <Text style={styles.mediaPlaceholderText}>
                  {selectedMedia.kind === 'VIDEO' ? 'Video selected' : 'Voice message recorded'}
                </Text>
              </View>
            )}
            <TouchableOpacity style={styles.removeMediaBtn} onPress={() => setSelectedMedia(null)}>
              <AppIcon iosName="xmark.circle.fill" androidFallback="X" size={24} color="#E74C3C" />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.mediaButtons}>
            <TouchableOpacity style={styles.mediaBtn} onPress={() => handlePickMedia('PHOTO')}>
            <AppIcon iosName="camera.fill" androidFallback="P" size={20} color={themeColors.primary} />
            <Text style={styles.mediaBtnText}>Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.mediaBtn} onPress={() => handlePickMedia('VIDEO')}>
            <AppIcon iosName="video.fill" androidFallback="V" size={20} color={themeColors.primary} />
            <Text style={styles.mediaBtnText}>Video</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mediaBtn, isRecording && styles.recordingBtn]}
            onPressIn={handleStartRecording}
            onPressOut={handleStopRecording}
          >
            <AppIcon
              iosName={isRecording ? 'stop.fill' : 'mic.fill'}
              androidFallback="A"
              size={20}
              color={isRecording ? '#fff' : themeColors.primary}
            />
            <Text style={[styles.mediaBtnText, isRecording && styles.recordingBtnText]}>
              {isRecording ? 'Recording...' : 'Voice'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.saveBtn,
            ((!newNote.trim() && !selectedMedia) || isSubmitting) && styles.saveBtnDisabled,
          ]}
          onPress={handleSaveMemory}
          disabled={(!newNote.trim() && !selectedMedia) || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Share with Family</Text>
          )}
        </TouchableOpacity>
      </View>

      {combinedFeed.length > 0 ? (
        <>
          <Text style={styles.recentMemoriesHeading}>Recent activity</Text>
          {combinedFeed.map((item) => (
            <View key={item.id} style={styles.feedListItem}>
              <View style={styles.feedItemHeader}>
                <AppIcon
                  iosName={
                    item.type === 'NOTE'
                      ? 'note.text'
                      : (item as { kind?: string }).kind === 'AUDIO'
                        ? 'mic.fill'
                        : (item as { kind?: string }).kind === 'VIDEO'
                          ? 'video.fill'
                          : 'photo.fill'
                  }
                  androidFallback={item.type === 'NOTE' ? 'N' : 'P'}
                  size={16}
                  color={themeColors.primary}
                />
                <Text style={styles.feedItemDate}>
                  {new Date(item.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
              </View>
              {item.type === 'MEMORY' &&
                (item as { kind?: string }).kind === 'PHOTO' &&
                (item as { downloadUrl?: string }).downloadUrl && (
                  <Image
                    source={{ uri: (item as { downloadUrl: string }).downloadUrl }}
                    style={styles.feedImage}
                  />
                )}
              {item.type === 'MEMORY' &&
                ((item as { kind?: string }).kind === 'VIDEO' ||
                  (item as { kind?: string }).kind === 'AUDIO') && (
                  <View style={styles.mediaIndicator}>
                    <Text style={styles.mediaIndicatorText}>
                      {(item as { kind?: string }).kind === 'VIDEO' ? '▶ Video Clip' : '🎤 Voice Message'}
                    </Text>
                  </View>
                )}
              <Text style={styles.feedContent}>
                {item.type === 'NOTE' ? (item as { content: string }).content : (item as { note?: string | null }).note}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );

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
      ref={scrollViewRef}
      style={styles.phaseScroll}
      contentContainerStyle={styles.introScrollContent}
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.centerFill, { minHeight: height * 0.7 }]}>
        <AppIcon iosName="photo.on.rectangle.angled" androidFallback="P" size={56} color={themeColors.primary} />
        <Text style={styles.emptyTitle}>No Quiz Photos Yet</Text>
        <Text style={styles.emptySubtitle}>Ask your caregiver to add photos to your quiz library.</Text>
        
        {renderSwipeUpHint()}
      </View>
      {renderLeaveMemoriesSection()}
    </ScrollView>
  );

  const renderInsufficientIdentities = (count: number) => (
    <ScrollView
      ref={scrollViewRef}
      style={styles.phaseScroll}
      contentContainerStyle={styles.introScrollContent}
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.centerFill, { minHeight: height * 0.7 }]}>
        <AppIcon iosName="sparkles" androidFallback="*" size={52} color={themeColors.primary} />
        <Text style={styles.emptyTitle}>Quiz Coming Soon</Text>
        <Text style={styles.emptySubtitle}>
          Your quiz will be ready when there are 4 familiar faces. Current: {count}/4.
        </Text>

        {renderSwipeUpHint()}
      </View>
      {renderLeaveMemoriesSection()}
    </ScrollView>
  );

  const renderSwipeUpHint = () => (
    <Animated.View style={{ transform: [{ translateY: swipeUpBounce }], marginTop: 'auto', paddingTop: 24, paddingBottom: 16 }}>
      <TouchableOpacity 
        onPress={() => {
           Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
           scrollViewRef.current?.scrollToEnd({ animated: true });
        }}
        activeOpacity={0.7}
        style={{ alignItems: 'center', gap: 8, paddingVertical: 12 }}
      >
        <AppIcon iosName="chevron.up" androidFallback="^" size={26} color={themeColors.primary} />
        <Text style={{ 
          fontFamily: typography.fontFamily.bold, 
          fontSize: 18, // Slightly larger
          color: themeColors.primary,
          textAlign: 'center',
          letterSpacing: -0.3, // Modern touch
        }}>
          Swipe up to leave memory
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderIntro = () => (
    <ScrollView
      ref={scrollViewRef}
      style={styles.phaseScroll}
      contentContainerStyle={styles.introScrollContent}
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.introContent, { minHeight: introPrimaryMinHeight }]}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' }}>
          <Text style={styles.introText}>
            {`Good morning${patient?.name ? `, ${patient.name}` : ''}. Let's see some familiar faces!`}
          </Text>
          <View style={{ height: 48 }} />
          <TouchableOpacity style={styles.startButton} onPress={handleIntroStart} activeOpacity={0.85}>
            <Text style={styles.startButtonText}>Start</Text>
          </TouchableOpacity>
        </View>

        {renderSwipeUpHint()}
      </View>
      {renderLeaveMemoriesSection()}
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
      ref={scrollViewRef}
      style={styles.phaseScroll}
      contentContainerStyle={styles.modeSelectContent}
      showsVerticalScrollIndicator
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
        {renderSwipeUpHint()}
      </View>
      {renderLeaveMemoriesSection()}
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
            <Animated.Image
              key={`${q.media.publicId}-${q.imageUrl}`}
              source={{ uri: q.imageUrl }}
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
        ref={scrollViewRef}
        style={styles.phaseScroll}
        contentContainerStyle={styles.summaryContent}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ minHeight: height * 0.75, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <View style={styles.summaryMessageBlock}>
            <Text style={styles.summaryTitle}>
              Wonderful job{patient?.name ? `, ${patient.name}` : ''}. You've seen everyone today!
            </Text>
          </View>

          <TouchableOpacity style={styles.photosButton} onPress={goToRelive} activeOpacity={0.85}>
            <Text style={styles.photosButtonText}>Go to my photos</Text>
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

          {renderSwipeUpHint()}
        </View>
        {renderLeaveMemoriesSection()}
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
  leaveMemoriesSection: {
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 0,
    marginTop: 8,
  },
  leaveMemoriesSpacer: {
    width: '100%',
  },
  scrollHintCard: {
    width: '100%',
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(252, 254, 249, 0.95)'),
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30, 77, 48, 0.2)'),
    gap: 8,
    alignItems: 'center',
  },
  scrollHintTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 17,
    color: themeColors.primary,
    textAlign: 'center',
  },
  scrollHintBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: themeColors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.92,
  },
  recentMemoriesHeading: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: themeColors.primary,
    marginBottom: 10,
    marginTop: 4,
    width: '100%',
  },
  feedListItem: {
    width: '100%',
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: themeColors.neutral,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30, 77, 48, 0.12)'),
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
  mediaButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: themeColors.neutral,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(180, 174, 232, 0.2)'),
  },
  mediaBtnText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: themeColors.primary,
  },
  recordingBtn: {
    backgroundColor: '#E74C3C',
    borderColor: '#E74C3C',
  },
  recordingBtnText: {
    color: '#fff',
  },
  mediaPreview: {
    position: 'relative',
    marginBottom: 16,
  },
  previewImage: {
    width: '100%',
    height: 150,
    borderRadius: 12,
  },
  mediaPlaceholder: {
    width: '100%',
    height: 80,
    borderRadius: 12,
    backgroundColor: themeColors.neutral,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  mediaPlaceholderText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: themeColors.primary,
  },
  removeMediaBtn: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  noteInputCard: {
    width: '100%',
    backgroundColor: themeColors.neutralLight,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30, 77, 48, 0.15)'),
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 17,
    color: themeColors.primary,
    marginBottom: 10,
  },
  textInput: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 16,
    color: themeColors.textDark,
    minHeight: 88,
    textAlignVertical: 'top',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30, 77, 48, 0.2)'),
    padding: 12,
    marginBottom: 14,
    backgroundColor: themeColors.neutral,
  },
  saveBtn: {
    borderRadius: 999,
    backgroundColor: themeColors.primary,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  saveBtnText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: themeColors.neutralLight,
  },
  feedItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  feedItemDate: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    color: themeColors.textMuted,
  },
  feedImage: {
    width: '100%',
    height: 72,
    borderRadius: 8,
    marginBottom: 6,
  },
  feedContent: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: themeColors.textDark,
    lineHeight: 16,
  },
  mediaIndicator: {
    backgroundColor: themeColors.neutral,
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: themeColors.primary,
  },
  mediaIndicatorText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: themeColors.textDark,
  },
});
};
