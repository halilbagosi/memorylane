import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  InputAccessoryView,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeProvider';
import { lightColors, darkColors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { AppIcon } from '../src/components/AppIcon';
import { AdaptiveCard } from '../src/components/AdaptiveCard';
import { M3Dialog, type M3DialogAction } from '../src/components/M3Dialog';
import { API_BASE_URL } from '../src/config/api';
import { getToken } from '../src/utils/auth';

// ── Emoji stages based on accuracy-to-goal ratio ──
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

function getMotivationalMessage(patientName: string, accuracy: number, goal: number | null) {
  if (!goal) return 'Set a goal to track progress!';
  const ratio = Math.min(100, Math.round((accuracy / goal) * 100));
  if (ratio >= 100) return `🎉 Amazing! ${patientName} has surpassed the ${goal}% goal!`;
  if (ratio >= 80) return `💪 Almost there! Just ${goal - accuracy}% to go!`;
  if (ratio >= 50) return `📈 Great progress — halfway to the ${goal}% target.`;
  if (accuracy > 0) return `🌱 Every quiz counts. Keep it up, ${patientName}!`;
  return `Start quizzing to work towards the ${goal}% goal.`;
}

type StatsData = {
  patientId: string;
  patientName: string;
  currentAccuracy: number;
  totalAttempts: number;
  totalCorrect: number;
  averageTimeMs: number;
  goal: { id: string; targetAccuracy: number } | null;
  recentSnapshots: { date: string; accuracy: number; attempts: number; correct: number }[];
};

export default function PatientGoalsScreen() {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  const router = useRouter();
  const { patientId, patientName: paramName } = useLocalSearchParams<{ patientId: string; patientName: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [goalInput, setGoalInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // M3 Dialog state
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogBody, setDialogBody] = useState('');
  const [dialogActions, setDialogActions] = useState<M3DialogAction[]>([]);

  const showDialog = (title: string, body: string, actions?: M3DialogAction[]) => {
    setDialogTitle(title);
    setDialogBody(body);
    setDialogActions(actions ?? [{ label: 'OK', onPress: () => setDialogVisible(false) }]);
    setDialogVisible(true);
  };

  // Animation refs
  const progressAnim = useRef(new Animated.Value(0)).current;
  const emojiScale = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  const fetchStats = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) { router.replace('/login'); return; }
      const res = await fetch(`${API_BASE_URL}/patients/${patientId}/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load stats');
      const data: StatsData = await res.json();
      setStats(data);
      setGoalInput(data.goal?.targetAccuracy?.toString() ?? '');
    } catch (e) {
      showDialog('Error', e instanceof Error ? e.message : 'Could not load patient stats.');
    } finally {
      setLoading(false);
    }
  }, [patientId, router]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Animate when stats load
  useEffect(() => {
    if (!stats) return;
    const goalTarget = stats.goal?.targetAccuracy ?? 100;
    const ratio = Math.min(1, stats.currentAccuracy / 100); // Always out of 100

    Animated.parallel([
      Animated.timing(progressAnim, {
        toValue: ratio,
        duration: 1200,
        useNativeDriver: false,
      }),
      Animated.spring(emojiScale, {
        toValue: 1,
        friction: 4,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [stats, progressAnim, emojiScale, fadeIn]);

  const saveGoal = async () => {
    const value = parseInt(goalInput, 10);
    if (isNaN(value) || value < 1 || value > 100) {
      showDialog('Invalid Goal', 'Please enter a number between 1 and 100.');
      return;
    }
    try {
      setSaving(true);
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/patients/${patientId}/goal`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetAccuracy: value }),
      });
      if (!res.ok) throw new Error('Failed to save goal');
      setIsEditing(false);
      await fetchStats();
    } catch (e) {
      showDialog('Error', e instanceof Error ? e.message : 'Could not save goal.');
    } finally {
      setSaving(false);
    }
  };

  const removeGoal = async () => {
    try {
      setSaving(true);
      const token = await getToken();
      if (!token) return;
      await fetch(`${API_BASE_URL}/patients/${patientId}/goal`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setGoalInput('');
      setIsEditing(false);
      await fetchStats();
    } catch (e) {
      showDialog('Error', 'Could not remove goal.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!stats) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Could not load patient stats.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayName = stats.patientName || paramName || 'Patient';
  const goalTarget = stats.goal?.targetAccuracy ?? null;
  const progressPercent = goalTarget ? Math.min(100, Math.round((stats.currentAccuracy / goalTarget) * 100)) : stats.currentAccuracy;
  const emojiStage = getEmojiStage(progressPercent);
  const motivationMsg = getMotivationalMessage(displayName.split(' ')[0], stats.currentAccuracy, goalTarget);
  const avgTimeSec = stats.averageTimeMs > 0 ? (stats.averageTimeMs / 1000).toFixed(1) : '—';
  const maxBarValue = Math.max(...stats.recentSnapshots.map(s => s.accuracy), 1);

  return (
    <>
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header ── */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Stats & Goals</Text>
              <Text style={styles.headerSubtitle}>{displayName}</Text>
            </View>
          </View>

          {/* ── Big Emoji + Progress Arc ── */}
          <Animated.View style={[styles.emojiContainer, { opacity: fadeIn, transform: [{ scale: emojiScale }] }]}>
            <Text style={styles.bigEmoji}>{emojiStage.emoji}</Text>
            <Text style={styles.emojiLabel}>{emojiStage.label}</Text>
          </Animated.View>

          {/* ── Progress Bar ── */}
          <AdaptiveCard style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>
                {goalTarget ? 'Progress to Goal' : 'Current Accuracy'}
              </Text>
              <Text style={styles.progressPercent}>{stats.currentAccuracy}%</Text>
            </View>

            <View style={styles.progressBarTrack}>
              <Animated.View
                style={[
                  styles.progressBarFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
              {goalTarget && (
                <View style={[styles.goalMarker, { left: `${Math.min(100, goalTarget)}%` }]}>
                  <View style={styles.goalMarkerLine} />
                  <View style={styles.goalMarkerPill}>
                    <Text style={styles.goalMarkerLabel}>🎯 {goalTarget}%</Text>
                  </View>
                </View>
              )}
            </View>

            {goalTarget && (
              <Text style={styles.progressSubtext}>
                {stats.currentAccuracy >= goalTarget
                  ? '🎯 Goal achieved!'
                  : `${goalTarget - stats.currentAccuracy}% remaining to reach your goal`}
              </Text>
            )}
          </AdaptiveCard>

          {/* ── Motivation Message ── */}
          <Animated.View style={[styles.motivationCard, { opacity: fadeIn }]}>
            <Text style={styles.motivationText}>{motivationMsg}</Text>
          </Animated.View>

          {/* ── Stat Tiles ── */}
          <View style={styles.statGrid}>
            <AdaptiveCard style={styles.statTile}>
              <Text style={styles.statValue}>{stats.totalAttempts}</Text>
              <Text style={styles.statLabel}>Total Quizzes</Text>
            </AdaptiveCard>
            <AdaptiveCard style={styles.statTile}>
              <Text style={styles.statValue}>{stats.totalCorrect}</Text>
              <Text style={styles.statLabel}>Correct</Text>
            </AdaptiveCard>
            <AdaptiveCard style={styles.statTile}>
              <Text style={styles.statValue}>{avgTimeSec}s</Text>
              <Text style={styles.statLabel}>Avg. Time</Text>
            </AdaptiveCard>
          </View>

          {/* ── Recent Trend ── */}
          {stats.recentSnapshots.length > 0 && (
            <AdaptiveCard style={styles.trendCard}>
              <Text style={styles.sectionTitle}>Recent Trend</Text>
              <View style={styles.barChart}>
                {stats.recentSnapshots.map((snap, i) => {
                  const barHeight = Math.max(4, (snap.accuracy / maxBarValue) * 80);
                  const dateLabel = snap.date.slice(5); // MM-DD
                  return (
                    <View key={i} style={styles.barColumn}>
                      <Text style={styles.barValue}>{snap.accuracy}%</Text>
                      <View style={[styles.bar, { height: barHeight, backgroundColor: snap.accuracy >= (goalTarget ?? 999) ? '#4CAF50' : themeColors.secondary }]} />
                      <Text style={styles.barLabel}>{dateLabel}</Text>
                    </View>
                  );
                })}
              </View>
            </AdaptiveCard>
          )}

          {/* ── Set Goal ── */}
          <AdaptiveCard style={styles.goalCard}>
            <View style={styles.goalHeader}>
              <View style={[styles.goalIconCircle, { backgroundColor: isDark ? 'rgba(76,175,80,0.15)' : 'rgba(76,175,80,0.1)' }]}>
                <AppIcon iosName="flag.fill" androidFallback="🎯" size={20} color="#4CAF50" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.goalTitle}>
                  {stats.goal ? 'Your Goal' : 'Set a Goal'}
                </Text>
                <Text style={styles.goalDesc}>
                  {stats.goal
                    ? `Target: ${stats.goal.targetAccuracy}% accuracy`
                    : 'Set an accuracy target for this patient'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (isEditing) {
                    setIsEditing(false);
                    setGoalInput(stats.goal?.targetAccuracy?.toString() ?? '');
                  } else {
                    setIsEditing(true);
                  }
                }}
                style={styles.goalEditBtn}
              >
                <Text style={styles.goalEditBtnText}>{isEditing ? 'Cancel' : (stats.goal ? 'Edit' : 'Add')}</Text>
              </TouchableOpacity>
            </View>

            {isEditing && (
              <View style={styles.goalInputRow}>
                <TextInput
                  style={styles.goalInput}
                  value={goalInput}
                  onChangeText={setGoalInput}
                  placeholder="e.g. 60"
                  placeholderTextColor={themeColors.textMuted}
                  keyboardType="number-pad"
                  maxLength={3}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={saveGoal}
                  inputAccessoryViewID="goalInputAccessory"
                />
                <Text style={styles.goalInputSuffix}>%</Text>
                <TouchableOpacity style={styles.goalSaveBtn} onPress={saveGoal} disabled={saving}>
                  <Text style={styles.goalSaveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
                {stats.goal && (
                  <TouchableOpacity style={styles.goalRemoveBtn} onPress={removeGoal} disabled={saving}>
                    <AppIcon iosName="trash" androidFallback="🗑" size={16} color="#C0392B" />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </AdaptiveCard>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      {Platform.OS === 'ios' && isEditing && (
        <InputAccessoryView nativeID="goalInputAccessory">
          <View style={styles.keyboardToolbar}>
            <TouchableOpacity onPress={() => Keyboard.dismiss()} style={styles.keyboardToolbarBtn}>
              <Text style={styles.keyboardToolbarBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { saveGoal(); Keyboard.dismiss(); }} style={styles.keyboardToolbarSaveBtn}>
              <Text style={styles.keyboardToolbarSaveBtnText}>{saving ? 'Saving…' : 'Save Goal'}</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </SafeAreaView>
      <M3Dialog
        visible={dialogVisible}
        title={dialogTitle}
        body={dialogBody}
        actions={dialogActions}
        onDismiss={() => setDialogVisible(false)}
      />
    </>
  );
}

const getStyles = (isDark: boolean) => {
  const themeColors = isDark ? darkColors : lightColors;
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: themeColors.neutral,
    },
    scroll: { flex: 1 },
    content: { padding: 20, paddingTop: 8 },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 15,
      color: themeColors.textMuted,
    },

    // Header
    headerRow: {
      marginBottom: 20,
    },
    headerTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 28,
      color: themeColors.textDark,
    },
    headerSubtitle: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 15,
      color: themeColors.textMuted,
      marginTop: 2,
    },

    // Emoji
    emojiContainer: {
      alignItems: 'center',
      marginBottom: 20,
    },
    bigEmoji: {
      fontSize: 64,
      marginBottom: 4,
    },
    emojiLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 15,
      color: themeColors.textMuted,
    },

    // Progress card
    progressCard: {
      padding: 20,
      borderRadius: 16,
      marginBottom: 12,
    },
    progressHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    progressTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 16,
      color: themeColors.textDark,
    },
    progressPercent: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 22,
      color: themeColors.secondary,
    },
    progressBarTrack: {
      height: 14,
      borderRadius: 7,
      backgroundColor: isDark ? 'rgba(235, 247, 239, 0.08)' : 'rgba(0,0,0,0.06)',
      overflow: 'visible',
      position: 'relative',
    },
    progressBarFill: {
      position: 'absolute',
      left: 0,
      top: 0,
      height: 14,
      borderRadius: 7,
      backgroundColor: themeColors.secondary,
    },
    goalMarker: {
      position: 'absolute',
      top: 16,
      marginLeft: -24,
      alignItems: 'center',
      zIndex: 10,
    },
    goalMarkerLine: {
      width: 0,
      height: 8,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: isDark ? 'rgba(245,251,247,0.5)' : 'rgba(0,0,0,0.3)',
    },
    goalMarkerPill: {
      backgroundColor: isDark ? 'rgba(76,175,80,0.2)' : 'rgba(76,175,80,0.12)',
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(76,175,80,0.4)' : 'rgba(76,175,80,0.3)',
    },
    goalMarkerLabel: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 10,
      color: isDark ? '#A8D5BA' : '#2E7D32',
    },

    // Keyboard toolbar
    keyboardToolbar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: isDark ? '#1A2A1F' : '#F0F0F0',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.15)',
    },
    keyboardToolbarBtn: {
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    keyboardToolbarBtnText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 15,
      color: themeColors.textMuted,
    },
    keyboardToolbarSaveBtn: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: themeColors.secondary,
      borderRadius: 8,
    },
    keyboardToolbarSaveBtnText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 15,
      color: isDark ? '#17231D' : '#FFFFFF',
    },
    progressSubtext: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 13,
      color: themeColors.textMuted,
      marginTop: 32,
      textAlign: 'center',
    },

    // Motivation
    motivationCard: {
      backgroundColor: isDark ? 'rgba(76,175,80,0.08)' : 'rgba(76,175,80,0.06)',
      borderRadius: 12,
      padding: 16,
      marginBottom: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(76,175,80,0.2)' : 'rgba(76,175,80,0.15)',
    },
    motivationText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 15,
      color: themeColors.textDark,
      textAlign: 'center',
      lineHeight: 22,
    },

    // Stat grid
    statGrid: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 20,
    },
    statTile: {
      flex: 1,
      padding: 14,
      borderRadius: 14,
      alignItems: 'center',
    },
    statValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 22,
      color: themeColors.textDark,
      marginBottom: 4,
    },
    statLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      color: themeColors.textMuted,
      textAlign: 'center',
    },

    // Trend chart
    trendCard: {
      padding: 16,
      borderRadius: 16,
      marginBottom: 20,
    },
    sectionTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 16,
      color: themeColors.textDark,
      marginBottom: 14,
    },
    barChart: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'flex-end',
      height: 120,
    },
    barColumn: {
      alignItems: 'center',
      flex: 1,
    },
    bar: {
      width: 20,
      borderRadius: 6,
      marginBottom: 6,
    },
    barValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 10,
      color: themeColors.textMuted,
      marginBottom: 4,
    },
    barLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      color: themeColors.textMuted,
    },

    // Goal card
    goalCard: {
      padding: 16,
      borderRadius: 16,
    },
    goalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    goalIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    goalTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 16,
      color: themeColors.textDark,
    },
    goalDesc: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 13,
      color: themeColors.textMuted,
      marginTop: 2,
    },
    goalEditBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(235, 247, 239, 0.08)' : 'rgba(0,0,0,0.05)',
    },
    goalEditBtnText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 13,
      color: themeColors.secondary,
    },
    goalInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 14,
      gap: 8,
    },
    goalInput: {
      flex: 1,
      height: 44,
      borderRadius: 10,
      paddingHorizontal: 14,
      fontFamily: typography.fontFamily.medium,
      fontSize: 16,
      color: themeColors.textDark,
      backgroundColor: isDark ? 'rgba(235, 247, 239, 0.06)' : 'rgba(0,0,0,0.04)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.08)',
    },
    goalInputSuffix: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 18,
      color: themeColors.textMuted,
    },
    goalSaveBtn: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: themeColors.secondary,
    },
    goalSaveBtnText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 14,
      color: isDark ? '#17231D' : '#FFFFFF',
    },
    goalRemoveBtn: {
      padding: 10,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(231,76,60,0.12)' : 'rgba(231,76,60,0.08)',
    },
  });
};
