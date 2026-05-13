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
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { API_BASE_URL } from '../../src/config/api';
import { getPatientInfo, deletePatientInfo, PatientInfo } from '../../src/utils/auth';
import { getPatientTimeline, uploadMediaByPatient, type TimelineItem, type MediaKind } from '../../src/services/media';
import { getPatientNotes, addPatientNote, type Note } from '../../src/services/notes';
import * as FileSystem from 'expo-file-system';

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
      loadData(true); // Refresh feed
    } catch (error: any) {
      console.error('Save failed:', error);
      Alert.alert('Error', error.message || 'Failed to save. Please try again.');
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
            placeholder="Write a note or share a memory..."
            placeholderTextColor={colors.textMuted}
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
                    color={colors.primary} 
                  />
                  <Text style={styles.mediaPlaceholderText}>
                    {selectedMedia.kind === 'VIDEO' ? 'Video selected' : 'Voice message recorded'}
                  </Text>
                </View>
              )}
              <TouchableOpacity 
                style={styles.removeMediaBtn} 
                onPress={() => setSelectedMedia(null)}
              >
                <AppIcon iosName="xmark.circle.fill" androidFallback="X" size={24} color="#E74C3C" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.mediaButtons}>
            <TouchableOpacity 
              style={styles.mediaBtn} 
              onPress={() => handlePickMedia('PHOTO')}
            >
              <AppIcon iosName="camera.fill" androidFallback="P" size={20} color={colors.primary} />
              <Text style={styles.mediaBtnText}>Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.mediaBtn} 
              onPress={() => handlePickMedia('VIDEO')}
            >
              <AppIcon iosName="video.fill" androidFallback="V" size={20} color={colors.primary} />
              <Text style={styles.mediaBtnText}>Video</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.mediaBtn, isRecording && styles.recordingBtn]} 
              onPressIn={handleStartRecording}
              onPressOut={handleStopRecording}
            >
              <AppIcon 
                iosName={isRecording ? "stop.fill" : "mic.fill"} 
                androidFallback="A" 
                size={20} 
                color={isRecording ? "#fff" : colors.primary} 
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
                    iosName={
                      item.type === 'NOTE' 
                        ? 'note.text' 
                        : (item as any).kind === 'AUDIO' 
                          ? 'mic.fill' 
                          : (item as any).kind === 'VIDEO' 
                            ? 'video.fill' 
                            : 'photo.fill'
                    }
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
                {item.type === 'MEMORY' && (item as any).kind === 'PHOTO' && (item as any).downloadUrl && (
                  <Image source={{ uri: (item as any).downloadUrl }} style={styles.feedImage} />
                )}
                {item.type === 'MEMORY' && ((item as any).kind === 'VIDEO' || (item as any).kind === 'AUDIO') && (
                  <View style={styles.mediaIndicator}>
                    <Text style={styles.mediaIndicatorText}>
                      {(item as any).kind === 'VIDEO' ? '▶ Video Clip' : '🎤 Voice Message'}
                    </Text>
                  </View>
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
    backgroundColor: colors.neutral,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(180, 174, 232, 0.2)',
  },
  mediaBtnText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.primary,
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
    backgroundColor: colors.neutral,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  mediaPlaceholderText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.primary,
  },
  removeMediaBtn: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  mediaIndicator: {
    backgroundColor: colors.neutral,
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  mediaIndicatorText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textDark,
  },
});
