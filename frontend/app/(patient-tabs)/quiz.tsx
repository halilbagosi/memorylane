import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
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
import { useNavigation } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { AppIcon } from '../../src/components/AppIcon';
import { M3Dialog, type M3DialogAction } from '../../src/components/M3Dialog';
import { QuizSuccessOverlay } from '../../src/components/QuizSuccessOverlay';
import { getPatientInfo, deletePatientInfo, PatientInfo } from '../../src/utils/auth';

export default function QuizTab() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [patient, setPatient] = useState<PatientInfo | null>(null);

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
    getPatientInfo().then(setPatient);
  }, []);

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
          ); // <-- make sure this maps correctly based on your file
        })}
      </View>
    </ScrollView>
  );
          );
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      {patient && (
        <View style={styles.topRow}>
          <Text style={styles.greeting}>Hi, {patient.name}</Text>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} activeOpacity={0.7}>
            <AppIcon iosName="arrow.right.square" androidFallback="←" size={18} color="#C0392B" />
          </TouchableOpacity>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral,
    paddingHorizontal: 24,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: colors.textDark,
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
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.textLight,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(180, 174, 232, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 24,
    color: colors.textDark,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: colors.textMuted,
  },
});
