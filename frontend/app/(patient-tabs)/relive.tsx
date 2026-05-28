import { lightColors, darkColors } from '../../src/theme/colors';
import React, { memo, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useTheme } from '../../src/theme/ThemeProvider';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { typography } from '../../src/theme/typography';
import { LinearGradient } from 'expo-linear-gradient';
import { AppIcon } from '../../src/components/AppIcon';
import { VoiceMessagePlayer } from '../../src/components/VoiceMessagePlayer';
import { ZoomableImage } from '../../src/components/ZoomableImage';
import { deletePatientInfo, getPatientInfo, PatientInfo } from '../../src/utils/auth';
import { getPatientTimeline, type TimelineItem, type MediaKind } from '../../src/services/media';
import { listPatientMessages, sendPatientMessage, type PatientMessage } from '../../src/services/messages';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isIOS = Platform.OS === 'ios';
const GRID_COLUMNS = 3;
const GRID_GAP = 8;
const GRID_PADDING = 16;
const TILE_SIZE =
  (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

const VOICE_QUALITY: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 24000,
  numberOfChannels: 1,
  bitRate: 32000,
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    audioQuality: 32, // AudioQuality.LOW
  },
};

type KindFilter = 'ALL' | 'PHOTO' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';

type ListRow =
  | { type: 'HEADER'; label: string; key: string }
  | { type: 'ROW'; items: TimelineItem[]; key: string };

function getItemYear(item: TimelineItem): number | null {
  if (item.eventYear !== null) return item.eventYear;
  const createdYear = new Date(item.createdAt).getFullYear();
  return Number.isFinite(createdYear) ? createdYear : null;
}

function groupByDecade(items: TimelineItem[]): ListRow[] {
  const rows: ListRow[] = [];
  let lastLabel = '';
  let currentGroup: TimelineItem[] = [];

  const flush = (label: string) => {
    if (!currentGroup.length) return;
    rows.push({ type: 'HEADER', label, key: `hdr-${label}` });
    for (let i = 0; i < currentGroup.length; i += GRID_COLUMNS) {
      const chunk = currentGroup.slice(i, i + GRID_COLUMNS);
      rows.push({ type: 'ROW', items: chunk, key: `row-${chunk[0].publicId}` });
    }
    currentGroup = [];
  };

  for (const item of items) {
    const year = getItemYear(item);
    const label = year !== null ? `${Math.floor(year / 10) * 10}s` : 'Undated';
    if (label !== lastLabel) {
      flush(lastLabel);
      lastLabel = label;
    }
    currentGroup.push(item);
  }
  flush(lastLabel);
  return rows;
}

export default function ReliveTab() {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [imageRetryIds, setImageRetryIds] = useState<Set<string>>(new Set());
  const [imageFailedIds, setImageFailedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getPatientInfo().then(setPatient);
  }, []);


  const loadTimeline = useCallback(async () => {
    const p = await getPatientInfo();
    if (!p) return;
    setError(null);
    try {
      const data = await getPatientTimeline(p.id);
      setItems(data);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load memories.');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadTimeline().finally(() => setLoading(false));
  }, [loadTimeline]);

  const filteredItems = useMemo(() => {
    const visible = kindFilter === 'ALL' ? items : items.filter((m) => m.kind === kindFilter);
    return [...visible].sort((a, b) => {
      const yearA = getItemYear(a) ?? Number.MAX_SAFE_INTEGER;
      const yearB = getItemYear(b) ?? Number.MAX_SAFE_INTEGER;
      if (yearA !== yearB) return yearA - yearB;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [items, kindFilter]);

  const groupedData = useMemo(() => groupByDecade(filteredItems), [filteredItems]);

  const filters: KindFilter[] = ['ALL', 'PHOTO', 'VIDEO', 'AUDIO', 'DOCUMENT'];
  const openPreview = useCallback((item: TimelineItem) => {
    const idx = filteredItems.findIndex((i) => i.publicId === item.publicId);
    setPreviewIndex(idx >= 0 ? idx : 0);
  }, [filteredItems]);
  const handleDebugLogout = useCallback(async () => {
    await deletePatientInfo();
    navigation.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }),
    );
  }, [navigation]);

  const handleImageLoadError = useCallback(
    (publicId: string) => {
      if (imageRetryIds.has(publicId)) {
        setImageFailedIds((prev) => new Set(prev).add(publicId));
        return;
      }
      setImageRetryIds((prev) => new Set(prev).add(publicId));
      loadTimeline();
    },
    [imageRetryIds, loadTimeline],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      {/* Header row */}
      <View style={styles.topRow}>
        <View>
          <Text style={styles.greeting}>
            {patient ? `Hi, ${patient.name}` : 'Your Memories'}
          </Text>
          <Text style={styles.subtitle}>Life Timeline</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleDebugLogout} style={styles.logoutBtn} activeOpacity={0.7}>
            <AppIcon iosName="arrow.right.square" androidFallback="<" size={18} color="#C0392B" />
          </TouchableOpacity>
          {patient?.avatarUrl ? (
            <Image source={{ uri: patient.avatarUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarFallback}>
              <Text style={styles.headerAvatarText}>
                {patient?.name?.[0]?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Leave a Memory */}
      <LeaveMemorySection patient={patient} onMemorySaved={loadTimeline} />

      {/* Kind filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterContent}
        style={styles.filterRow}
      >
        {filters.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, kindFilter === f && styles.chipActive]}
            onPress={() => setKindFilter(f)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, kindFilter === f && styles.chipTextActive]}>
              {f === 'ALL' ? 'All' : f === 'PHOTO' ? 'Photos' : f === 'VIDEO' ? 'Videos' : f === 'AUDIO' ? 'Audio' : 'Files'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              setLoading(true);
              loadTimeline().finally(() => setLoading(false));
            }}
          >
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : groupedData.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIconWrap}>
            <AppIcon
              iosName="photo.on.rectangle.angled"
              androidFallback="📷"
              size={40}
              color={themeColors.primary}
            />
          </View>
          <Text style={styles.emptyTitle}>No memories yet</Text>
          <Text style={styles.emptyBody}>
            Ask your caregiver to add photos and memories to your Life Timeline.
          </Text>
        </View>
      ) : (
        <FlatList
          data={groupedData}
          keyExtractor={(row) => row.key}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          initialNumToRender={18}
          maxToRenderPerBatch={18}
          updateCellsBatchingPeriod={40}
          windowSize={9}
          renderItem={({ item: row }) => {
            if (row.type === 'HEADER') {
              const decadeMatch = row.label.match(/^(\d+)(s)$/);
              return (
                <View style={styles.yearHeader}>
                  <Text style={styles.yearHeaderText}>
                    {decadeMatch ? (
                      <>
                        {decadeMatch[1]}
                        <Text style={styles.yearHeaderSuffix}>{decadeMatch[2]}</Text>
                      </>
                    ) : (
                      row.label
                    )}
                  </Text>
                </View>
              );
            }
            return (
              <View style={styles.gridRow}>
                {row.items.map((item) => (
                  <MemoryTile
                    key={item.publicId}
                    item={item}
                    imageFailed={imageFailedIds.has(item.publicId)}
                    onImageError={() => handleImageLoadError(item.publicId)}
                    onPress={openPreview}
                  />
                ))}
                {row.items.length < GRID_COLUMNS &&
                  Array.from({ length: GRID_COLUMNS - row.items.length }).map((_, index) => (
                    <View key={`pad-${index}`} style={styles.gridTileSpacer} />
                  ))}
              </View>
            );
          }}
        />
      )}

      {/* Preview modal */}
      <MemoryPreviewModal
        items={filteredItems}
        initialIndex={previewIndex}
        imageFailedIds={imageFailedIds}
        onImageError={handleImageLoadError}
        onClose={() => setPreviewIndex(null)}
      />
    </View>
  );
}

// ── MemoryCard ────────────────────────────────────────────────────────────────

const MemoryTile = memo(function MemoryTile({
  item,
  imageFailed,
  onImageError,
  onPress,
}: {
  item: TimelineItem;
  imageFailed: boolean;
  onImageError: () => void;
  onPress: (item: TimelineItem) => void;
}) {
  const { isDark, colors: themeColors } = useTheme();
  const styles = useMemo(() => getStyles(isDark), [isDark]);
  const isPhoto = item.kind === 'PHOTO';
  const isVideo = item.kind === 'VIDEO';
  const [imageLoading, setImageLoading] = useState(true);

  return (
    <TouchableOpacity style={styles.gridTile} onPress={() => onPress(item)} activeOpacity={0.88}>
      {(isPhoto || isVideo) && !imageFailed ? (
        <>
          <Image
            source={{ uri: item.downloadUrl }}
            style={styles.gridImage}
            resizeMode="cover"
            onLoad={() => setImageLoading(false)}
            onError={() => { setImageLoading(false); onImageError(); }}
          />
          {imageLoading && (
            <View style={styles.tileLoadingOverlay}>
              <ActivityIndicator size="small" color={themeColors.primary} />
            </View>
          )}
        </>
      ) : (
        <View style={styles.gridMediaFallback}>
            <AppIcon
              iosName={item.kind === 'AUDIO' ? 'waveform' : 'doc.fill'}
              androidFallback={item.kind === 'AUDIO' ? '♪' : '📄'}
              size={24}
              color={themeColors.primary}
            />
        </View>
      )}
      {isVideo && (
          <View style={styles.videoBadge}>
            <AppIcon iosName="play.fill" androidFallback="▶" size={10} color={themeColors.neutralLight} />
          </View>
        )}
    </TouchableOpacity>
  );
});

// ── MemoryPreviewModal ────────────────────────────────────────────────────────

function MemoryPreviewModal({
  items,
  initialIndex,
  imageFailedIds,
  onImageError,
  onClose,
}: {
  items: TimelineItem[];
  initialIndex: number | null;
  imageFailedIds: Set<string>;
  onImageError: (publicId: string) => void;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageLoading, setImageLoading] = useState(false);
  const { isDark, colors: themeColors } = useTheme();
  const styles = useMemo(() => getStyles(isDark), [isDark]);

  useEffect(() => {
    if (initialIndex !== null) {
      setCurrentIndex(initialIndex);
      setImageLoading(true);
    }
  }, [initialIndex]);

  useEffect(() => {
    setImageLoading(true);
  }, [currentIndex]);

  if (initialIndex === null) return null;

  const item = items[currentIndex];
  if (!item) return null;

  const isPhoto = item.kind === 'PHOTO';
  const isVideo = item.kind === 'VIDEO';
  const imageFailed = imageFailedIds.has(item.publicId);
  const yearLabel = item.eventYear !== null
    ? (item.isApproximateYear ? `~${item.eventYear}` : String(item.eventYear))
    : null;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.previewScreen}>
        {(isPhoto || isVideo) && !imageFailed ? (
          <>
            <ZoomableImage
              uri={item.downloadUrl}
              onLoad={() => setImageLoading(false)}
              onError={() => { setImageLoading(false); onImageError(item.publicId); }}
            />
            {imageLoading && (
              <View style={styles.previewLoadingOverlay}>
                <ActivityIndicator size="large" color={themeColors.neutralLight} />
              </View>
            )}
          </>
        ) : item.kind === 'AUDIO' ? (
          <View style={styles.previewFullscreenFallback}>
            <VoiceMessagePlayer uri={item.downloadUrl} style={styles.previewVoicePlayer} />
          </View>
        ) : (
          <View style={styles.previewFullscreenFallback}>
            <AppIcon
              iosName={imageFailed ? 'exclamationmark.triangle' : 'doc.fill'}
              androidFallback="File"
              size={56}
              color={themeColors.primary}
            />
            <Text style={styles.previewKindLabel}>
              {imageFailed ? 'Could not load image' : item.kind.charAt(0) + item.kind.slice(1).toLowerCase()}
            </Text>
          </View>
        )}

        {/* Close button */}
        <TouchableOpacity style={styles.previewBackBtn} onPress={onClose} accessibilityLabel="Close">
          <AppIcon iosName="xmark" androidFallback="✕" size={16} color={themeColors.textDark} />
        </TouchableOpacity>

        {/* Counter */}
        {items.length > 1 && (
          <View style={styles.previewCounter}>
            <Text style={styles.previewCounterText}>{currentIndex + 1} / {items.length}</Text>
          </View>
        )}

        {/* Prev button */}
        {currentIndex > 0 && (
          <TouchableOpacity
            style={[styles.previewNavBtn, styles.previewNavLeft]}
            onPress={() => setCurrentIndex((i) => i - 1)}
            activeOpacity={0.7}
          >
            <AppIcon iosName="chevron.left" androidFallback="<" size={22} color={themeColors.textDark} />
          </TouchableOpacity>
        )}

        {/* Next button */}
        {currentIndex < items.length - 1 && (
          <TouchableOpacity
            style={[styles.previewNavBtn, styles.previewNavRight]}
            onPress={() => setCurrentIndex((i) => i + 1)}
            activeOpacity={0.7}
          >
            <AppIcon iosName="chevron.right" androidFallback=">" size={22} color={themeColors.textDark} />
          </TouchableOpacity>
        )}

        {/* Bottom metadata */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.72)']}
          style={styles.previewSheerDetails}
        >
          {yearLabel && <Text style={styles.previewYear}>{yearLabel}</Text>}
          {!!item.memoryCategory && (
            <Text style={styles.previewCategory}>{item.memoryCategory}</Text>
          )}
          {!!item.note && <Text style={styles.previewNote}>{item.note}</Text>}
        </LinearGradient>
      </View>
    </Modal>
  );
}

// ── LeaveMemorySection ────────────────────────────────────────────────────────

function LeaveMemorySection({
  patient,
  onMemorySaved,
}: {
  patient: PatientInfo | null;
  onMemorySaved?: () => void;
}) {
  const { isDark, colors: themeColors } = useTheme();
  const styles = useMemo(() => getStyles(isDark), [isDark]);
  const [isOpen, setIsOpen] = useState(false);

  const [newNote, setNewNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<{ uri: string; kind: MediaKind; type: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const isPressingRef = useRef(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorder = useAudioRecorder(VOICE_QUALITY);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messages, setMessages] = useState<PatientMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<PatientMessage | null>(null);
  const [msgPhotoError, setMsgPhotoError] = useState(false);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    if (!patient) return;
    setMessagesLoading(true);
    try {
      setMessages(await listPatientMessages(patient.id));
    } catch {
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  }, [patient]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const showSuccessMessage = useCallback(() => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessVisible(true);
    successTimerRef.current = setTimeout(() => setSuccessVisible(false), 3200);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setNewNote('');
    setSelectedMedia(null);
  }, []);

  const handlePickMedia = async (kind: 'PHOTO' | 'VIDEO') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'PHOTO' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setSelectedMedia({ uri: asset.uri, kind, type: asset.mimeType || (kind === 'PHOTO' ? 'image/jpeg' : 'video/mp4') });
    }
  };

  const handleStartRecording = async () => {
    isPressingRef.current = true;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      
      if (!isPressingRef.current) {
        // User released the button before preparation finished
        return;
      }
      
      recorder.record();
      setIsRecording(true);
    } catch {
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const handleStopRecording = async () => {
    isPressingRef.current = false;
    if (!isRecording) return;
    setIsRecording(false);
    
    // Determine duration before stopping
    const duration = recorder.getStatus().durationMillis;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    
    const uri = recorder.uri;
    // Ignore accidental short taps
    if (uri && duration > 500) {
      setSelectedMedia({ uri, kind: 'AUDIO', type: 'audio/mp4' });
    }
  };

  const handleSaveMemory = async () => {
    if ((!newNote.trim() && !selectedMedia) || !patient) return;
    setIsSubmitting(true);
    try {
      if (selectedMedia) {
        await sendPatientMessage(patient.id, newNote.trim() || `Recorded ${selectedMedia.kind.toLowerCase()}`, selectedMedia);
      } else {
        await sendPatientMessage(patient.id, newNote);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      loadMessages().catch(() => undefined);
      onMemorySaved?.();
      handleClose();
      showSuccessMessage();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = (newNote.trim().length > 0 || !!selectedMedia) && !isSubmitting;

  return (
    <>
      {/* Compact trigger row */}
      <TouchableOpacity style={styles.lmTrigger} onPress={() => setIsOpen(true)} activeOpacity={0.72}>
        <View style={styles.lmTriggerIcon}>
          <AppIcon iosName="heart.fill" androidFallback="♥" size={13} color={themeColors.primary} />
        </View>
        <Text style={styles.lmTriggerText}>Send a note to your family</Text>
        <AppIcon iosName="pencil" androidFallback="✏" size={15} color={themeColors.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.lmTrigger, styles.lmMessagesTrigger]}
        onPress={() => { setMessagesOpen(true); loadMessages().catch(() => undefined); }}
        activeOpacity={0.72}
      >
        <View style={styles.lmTriggerIcon}>
          <AppIcon iosName="note.text" androidFallback="N" size={13} color={themeColors.primary} />
        </View>
        <Text style={styles.lmTriggerText}>Notes you left</Text>
        <AppIcon iosName="chevron.right" androidFallback=">" size={15} color={themeColors.textMuted} />
      </TouchableOpacity>

      {/* Compose modal — centered card */}
      {successVisible && (
        <View style={styles.lmSuccessNotice}>
          <AppIcon iosName="checkmark.circle.fill" androidFallback="OK" size={15} color="#1E6F43" />
          <Text style={styles.lmSuccessNoticeText}>Your note was sent to your family.</Text>
        </View>
      )}

      <Modal visible={isOpen} animationType="fade" transparent onRequestClose={handleClose}>
        <View style={styles.lmOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} activeOpacity={1} />
          <View style={styles.lmCard}>
            {/* Header */}
            <View style={styles.lmCardHeader}>
              <Text style={styles.lmCardTitle}>{"What's on your mind?"}</Text>
              <TouchableOpacity style={styles.lmCardClose} onPress={handleClose}>
                <AppIcon iosName="xmark" androidFallback="✕" size={13} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Note input */}
            <TextInput
              style={styles.lmTextInput}
              placeholder="Write a note or share a memory..."
              placeholderTextColor={themeColors.textMuted}
              multiline
              value={newNote}
              onChangeText={setNewNote}
            />

            {/* Media preview */}
            {selectedMedia && (
              <View style={styles.lmMediaPreview}>
                {selectedMedia.kind === 'PHOTO' ? (
                  <Image source={{ uri: selectedMedia.uri }} style={styles.lmPreviewImage} />
                ) : selectedMedia.kind === 'AUDIO' ? (
                  <VoiceMessagePlayer uri={selectedMedia.uri} style={styles.lmVoicePlayer} />
                ) : (
                  <View style={styles.lmMediaPlaceholder}>
                    <AppIcon
                      iosName="video.fill"
                      androidFallback="M"
                      size={20}
                      color={themeColors.primary}
                    />
                    <Text style={styles.lmMediaPlaceholderText}>
                      Video selected
                    </Text>
                  </View>
                )}
                <TouchableOpacity style={styles.lmRemoveMedia} onPress={() => setSelectedMedia(null)}>
                  <AppIcon iosName="xmark.circle.fill" androidFallback="X" size={22} color="#E74C3C" />
                </TouchableOpacity>
              </View>
            )}

            {/* Labeled media buttons */}
            <View style={styles.lmMediaBtns}>
              <TouchableOpacity style={styles.lmMediaBtn} onPress={() => handlePickMedia('PHOTO')} activeOpacity={0.75}>
                <AppIcon iosName="camera.fill" androidFallback="P" size={18} color={themeColors.primary} />
                <Text style={styles.lmMediaBtnText}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.lmMediaBtn} onPress={() => handlePickMedia('VIDEO')} activeOpacity={0.75}>
                <AppIcon iosName="video.fill" androidFallback="V" size={18} color={themeColors.primary} />
                <Text style={styles.lmMediaBtnText}>Video</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.lmMediaBtn, isRecording && styles.lmRecordingBtn]}
                onPressIn={handleStartRecording}
                onPressOut={handleStopRecording}
                activeOpacity={0.75}
              >
                <AppIcon
                  iosName={isRecording ? 'stop.fill' : 'mic.fill'}
                  androidFallback="A"
                  size={18}
                  color={isRecording ? '#fff' : themeColors.primary}
                />
                <Text style={[styles.lmMediaBtnText, isRecording && styles.lmRecordingBtnText]}>
                  {isRecording ? 'Recording...' : 'Voice'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Share button */}
            <TouchableOpacity
              style={[styles.lmSaveBtn, !canSubmit && styles.lmSaveBtnDisabled]}
              onPress={handleSaveMemory}
              disabled={!canSubmit}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.lmSaveBtnText}>Share with Family</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={messagesOpen} animationType="fade" transparent onRequestClose={() => setMessagesOpen(false)}>
        <View style={styles.lmOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setMessagesOpen(false)} activeOpacity={1} />
          <View style={styles.lmCard}>
            <View style={styles.lmCardHeader}>
              <Text style={styles.lmCardTitle}>Notes you left</Text>
              <TouchableOpacity style={styles.lmCardClose} onPress={() => setMessagesOpen(false)}>
                <AppIcon iosName="xmark" androidFallback="X" size={13} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>
            {messagesLoading ? (
              <ActivityIndicator color={themeColors.primary} />
            ) : messages.length === 0 ? (
              <Text style={styles.lmEmptyMessages}>No notes yet.</Text>
            ) : (
              <ScrollView style={styles.lmMessagesList}>
                {messages.map((message) => (
                  <TouchableOpacity
                    key={message.id}
                    style={styles.lmMessageRow}
                    onPress={() => {
                      setMessagesOpen(false);
                      setMsgPhotoError(false);
                      setSelectedMessage(message);
                    }}
                  >
                    <AppIcon iosName={message.attachment ? 'paperclip' : 'note.text'} androidFallback="N" size={16} color={themeColors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lmMessagePreview} numberOfLines={2}>{message.content}</Text>
                      <Text style={styles.lmMessageDate}>{new Date(message.createdAt).toLocaleDateString()}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selectedMessage}
        animationType="fade"
        transparent
        onRequestClose={() => { setSelectedMessage(null); setMessagesOpen(true); }}
      >
        <View style={styles.lmOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => { setSelectedMessage(null); setMessagesOpen(true); }} activeOpacity={1} />
          <View style={styles.lmCard}>
            <View style={styles.lmCardHeader}>
              <TouchableOpacity style={styles.lmCardClose} onPress={() => { setSelectedMessage(null); setMessagesOpen(true); }}>
                <AppIcon iosName="chevron.left" androidFallback="‹" size={16} color={themeColors.primary} />
              </TouchableOpacity>
              <Text style={styles.lmCardTitle}>Your note</Text>
              <View style={{ width: 28 }} />
            </View>
            {selectedMessage?.attachment?.kind === 'PHOTO' && !msgPhotoError && (
              <TouchableOpacity activeOpacity={0.85} onPress={() => setFullscreenPhoto(selectedMessage.attachment!.downloadUrl)}>
                <Image
                  source={{ uri: selectedMessage.attachment.downloadUrl }}
                  style={styles.lmMessageImage}
                  resizeMode="cover"
                  onError={() => setMsgPhotoError(true)}
                />
              </TouchableOpacity>
            )}
            {selectedMessage?.attachment?.kind === 'PHOTO' && msgPhotoError && (
              <View style={styles.lmMediaPlaceholder}>
                <AppIcon iosName="photo" androidFallback="P" size={20} color={themeColors.textMuted} />
                <Text style={styles.lmMediaPlaceholderText}>Photo unavailable</Text>
              </View>
            )}
            {selectedMessage?.attachment && selectedMessage.attachment.kind !== 'PHOTO' && (
              selectedMessage.attachment.kind === 'AUDIO' ? (
                <VoiceMessagePlayer uri={selectedMessage.attachment.downloadUrl} style={styles.lmVoicePlayer} />
              ) : (
                <View style={styles.lmMediaPlaceholder}>
                  <AppIcon iosName={selectedMessage.attachment.kind === 'VIDEO' ? 'video.fill' : 'doc.fill'} androidFallback="A" size={20} color={themeColors.primary} />
                  <Text style={styles.lmMediaPlaceholderText}>{selectedMessage.attachment.kind.toLowerCase()} attached</Text>
                </View>
              )
            )}
            <Text style={styles.lmMessageDate}>{selectedMessage ? new Date(selectedMessage.createdAt).toLocaleString() : ''}</Text>
            <Text style={styles.lmMessageBody}>{selectedMessage?.content}</Text>
          </View>
        </View>
      </Modal>

      {/* Fullscreen photo viewer */}
      <Modal visible={!!fullscreenPhoto} animationType="fade" transparent onRequestClose={() => setFullscreenPhoto(null)}>
        <View style={styles.fullscreenOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setFullscreenPhoto(null)} activeOpacity={1} />
          {fullscreenPhoto && (
            <Image source={{ uri: fullscreenPhoto }} style={styles.fullscreenImage} resizeMode="contain" />
          )}
          <TouchableOpacity style={styles.fullscreenClose} onPress={() => setFullscreenPhoto(null)}>
            <AppIcon iosName="xmark.circle.fill" androidFallback="X" size={30} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const getStyles = (isDark: boolean) => {
  const themeColors = isDark ? darkColors : lightColors;
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.neutral,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  greeting: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 22,
    color: themeColors.textDark,
  },
  subtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: themeColors.textMuted,
    marginTop: 2,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(192,57,43,0.1)'),
  },
  headerAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: themeColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: themeColors.neutralLight,
  },

  // Filter chips
  filterRow: {
    flexGrow: 0,
    flexShrink: 0,
    height: 46,
    marginBottom: 18,
    paddingHorizontal: 24,
  },
  filterContent: {
    gap: 10,
    paddingRight: 32,
    minHeight: 46,
    alignItems: 'center',
  },
  chip: {
    height: 34,
    minWidth: 72,
    paddingHorizontal: 14,
    paddingVertical: 0,
    borderRadius: 20,
    backgroundColor: themeColors.neutralLight,
    borderWidth: 1,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.06)'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
  chipText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
    color: themeColors.textMuted,
    textAlign: 'center',
    includeFontPadding: false,
  },
  chipTextActive: { color: themeColors.neutralLight },

  // States
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 80,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30,77,48,0.08)'),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: themeColors.textDark,
  },
  emptyBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: themeColors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: (isDark ? '#FFB4A8' : '#C0392B'),
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: themeColors.primary,
  },
  retryBtnText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: themeColors.neutralLight,
  },

  // List
  listContent: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 180, // Clear the navigation bar
    paddingTop: 4,
  },
  yearHeader: {
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 8,
  },
  yearHeaderText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: themeColors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  yearHeaderSuffix: {
    fontSize: 10,
  },
  gridRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },

  // Memory grid
  gridTile: {
    width: TILE_SIZE,
    aspectRatio: 1,
    borderRadius: isIOS ? 10 : 14,
    overflow: 'hidden',
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.04)'),
  },
  gridTileSpacer: {
    width: TILE_SIZE,
    aspectRatio: 1,
  },
  gridImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  tileLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.04)'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridMediaFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30,77,48,0.06)'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.45)'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Preview modal
  previewScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  previewFullscreenImage: {
    width: '100%',
    height: '100%',
  },
  previewLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  previewFullscreenFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: themeColors.neutral,
    paddingHorizontal: 24,
  },
  previewVoicePlayer: {
    maxWidth: 430,
  },
  previewBackBtn: {
    position: 'absolute',
    top: 52,
    left: 18,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: (isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255,255,255,0.85)'),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  previewSheerDetails: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 28,
    gap: 5,
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.6)'),
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  previewCard: {
    width: '100%',
    maxHeight: '88%',
    borderRadius: 22,
    backgroundColor: themeColors.neutralLight,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: SCREEN_WIDTH * 0.8,
    backgroundColor: '#000',
  },
  previewMediaFallback: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30,77,48,0.06)'),
  },
  previewKindLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 18,
    color: themeColors.textMuted,
  },
  previewMeta: {
    padding: 18,
    gap: 8,
  },
  previewYear: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 28,
    color: themeColors.neutralLight,
  },
  previewCategory: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 16,
    color: (isDark ? 'rgba(235, 247, 239, 0.05)' : 'rgba(255,255,255,0.65)'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewNote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 20,
    color: (isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255,255,255,0.95)'),
    lineHeight: 30,
    marginTop: 2,
  },
  previewCounter: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
    pointerEvents: 'none',
  },
  previewCounterText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
    overflow: 'hidden',
  },
  previewNavBtn: {
    position: 'absolute',
    top: '44%',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.85)'),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  previewNavLeft: { left: 14 },
  previewNavRight: { right: 14 },

  // ── LeaveMemorySection styles ─────────────────────────────────────────────
  lmTrigger: {
    marginHorizontal: 24,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: themeColors.neutralLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30, 77, 48, 0.13)'),
  },
  lmMessagesTrigger: {
    marginTop: -6,
  },
  lmTriggerIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30,77,48,0.1)'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  lmTriggerText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: themeColors.textMuted,
  },
  lmSuccessNotice: {
    marginHorizontal: 24,
    marginTop: -2,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: (isDark ? 'rgba(121,219,161,0.12)' : 'rgba(30,111,67,0.10)'),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: (isDark ? 'rgba(121,219,161,0.28)' : 'rgba(30,111,67,0.18)'),
  },
  lmSuccessNoticeText: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: (isDark ? '#79DBA1' : '#1E6F43'),
  },
  lmOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.52)',
    paddingHorizontal: 20,
  },
  lmCard: {
    width: '100%',
    backgroundColor: themeColors.neutralLight,
    borderRadius: 20,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30, 77, 48, 0.15)'),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  lmCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  lmCardTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 17,
    color: themeColors.primary,
  },
  lmCardClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  lmTextInput: {
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
  lmMediaPreview: {
    position: 'relative',
    marginBottom: 16,
  },
  lmPreviewImage: {
    width: '100%',
    height: 150,
    borderRadius: 12,
  },
  lmMediaPlaceholder: {
    width: '100%',
    height: 80,
    borderRadius: 12,
    backgroundColor: themeColors.neutral,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  lmVoicePlayer: {
    marginBottom: 12,
  },
  lmMediaPlaceholderText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: themeColors.primary,
  },
  lmRemoveMedia: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: (isDark ? themeColors.neutral : '#fff'),
    borderRadius: 12,
  },
  lmMediaBtns: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  lmMediaBtn: {
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
  lmMediaBtnText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: themeColors.primary,
  },
  lmRecordingBtn: {
    backgroundColor: '#E74C3C',
    borderColor: '#E74C3C',
  },
  lmRecordingBtnText: {
    color: '#fff',
  },
  lmSaveBtn: {
    borderRadius: 999,
    backgroundColor: themeColors.primary,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  lmSaveBtnDisabled: {
    opacity: 0.45,
  },
  lmSaveBtnText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: themeColors.neutralLight,
  },
  lmEmptyMessages: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: themeColors.textMuted,
    textAlign: 'center',
    paddingVertical: 22,
  },
  lmMessagesList: {
    maxHeight: 340,
  },
  lmMessageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(30, 77, 48, 0.12)'),
  },
  lmMessagePreview: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: themeColors.textDark,
    lineHeight: 19,
  },
  lmMessageDate: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: themeColors.textMuted,
    marginTop: 4,
  },
  lmMessageImage: {
    width: '100%',
    aspectRatio: 1.1,
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor: themeColors.neutral,
  },
  lmMessageBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 16,
    color: themeColors.textDark,
    lineHeight: 23,
    marginTop: 8,
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '80%',
  },
  fullscreenClose: {
    position: 'absolute',
    top: 52,
    right: 20,
    padding: 8,
    zIndex: 10,
  },
});
};
// styles are computed at render time via `useTheme()` inside the component
