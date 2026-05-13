import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { AppIcon } from '../../src/components/AppIcon';
import { getPatientInfo, deletePatientInfo, PatientInfo } from '../../src/utils/auth';
import { getPatientTimeline, type TimelineItem } from '../../src/services/media';
import { getPatientNotes, addPatientNote, type Note } from '../../src/services/notes';

export default function QuizTab() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [memories, setMemories] = useState<TimelineItem[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  const handleLogout = () => {
    Alert.alert('Log Out (Debug)', 'Return to the welcome screen?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await deletePatientInfo();
          navigation.dispatch(
            CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }),
          );
        },
      },
    ]);
  };

  const handleSaveNote = async () => {
    if (!newNote.trim() || !patient) return;

    setIsSubmitting(true);
    try {
      const note = await addPatientNote(patient.id, newNote);
      setNotes((prev) => [note, ...prev]);
      setNewNote('');
    } catch (error) {
      Alert.alert('Error', 'Failed to save your note. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Combine and sort by date
  const combinedFeed = [
    ...memories.map((m) => ({ ...m, type: 'MEMORY' as const })),
    ...notes.map((n) => ({ ...n, type: 'NOTE' as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
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

        {/* Quiz Section */}
        <View style={styles.quizSection}>
          <View style={styles.iconCircle}>
            <AppIcon
              iosName="questionmark.circle.fill"
              androidFallback="Q"
              size={48}
              color={colors.primary}
            />
          </View>
          <Text style={styles.title}>Quiz</Text>
          <Text style={styles.subtitle}>Coming soon</Text>
          <Text style={styles.quizDescription}>
            We are preparing fun questions to help you remember your loved ones.
          </Text>
        </View>

        {/* Notes Input Section */}
        <View style={styles.noteInputCard}>
          <Text style={styles.sectionTitle}>What's on your mind?</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Write a note or a memory..."
            placeholderTextColor={colors.textMuted}
            multiline
            value={newNote}
            onChangeText={setNewNote}
          />
          <TouchableOpacity
            style={[
              styles.saveBtn,
              (!newNote.trim() || isSubmitting) && styles.saveBtnDisabled,
            ]}
            onPress={handleSaveNote}
            disabled={!newNote.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save Memory</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Feed Section */}
        <View style={styles.feedSection}>
          <Text style={styles.sectionTitle}>Your Feed</Text>
          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
          ) : combinedFeed.length === 0 ? (
            <View style={styles.emptyFeed}>
              <AppIcon iosName="pencil.and.outline" androidFallback="✎" size={32} color={colors.textMuted} />
              <Text style={styles.emptyFeedText}>No notes or memories yet.</Text>
            </View>
          ) : (
            combinedFeed.map((item) => (
              <View key={item.id || (item as any).publicId} style={styles.feedItem}>
                <View style={styles.feedItemHeader}>
                  <AppIcon
                    iosName={item.type === 'NOTE' ? 'note.text' : 'photo.fill'}
                    androidFallback={item.type === 'NOTE' ? 'N' : 'P'}
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={styles.feedItemDate}>
                    {new Date(item.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
                {item.type === 'MEMORY' && (item as any).downloadUrl && (
                  <Image source={{ uri: (item as any).downloadUrl }} style={styles.feedImage} />
                )}
                <Text style={styles.feedContent}>
                  {item.type === 'NOTE' ? (item as any).content : (item as any).note}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    marginBottom: 32,
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
  quizSection: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
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
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: colors.primary,
    marginBottom: 12,
  },
  quizDescription: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  noteInputCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: colors.textDark,
    marginBottom: 16,
  },
  textInput: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 16,
    color: colors.textDark,
    backgroundColor: colors.neutral,
    borderRadius: 12,
    padding: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: 'rgba(180, 174, 232, 0.5)',
  },
  saveBtnText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: '#fff',
  },
  feedSection: {
    marginBottom: 40,
  },
  feedItem: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  feedItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  feedItemDate: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  feedContent: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: colors.textDark,
    lineHeight: 22,
  },
  feedImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: colors.neutral,
  },
  emptyFeed: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyFeedText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 12,
  },
});
