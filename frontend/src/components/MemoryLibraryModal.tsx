import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { AppIcon } from './AppIcon';
import {
  deleteMedia,
  getAccessUrl,
  listPatientMedia,
  updateMediaMetadata,
  uploadPatientMedia,
  type MediaCollection,
  type MediaListItem,
  type MediaMetadataInput,
} from '../services/media';

const isIOS = Platform.OS === 'ios';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GUTTER = 8;
const GRID_PADDING = 16;
const GRID_COLUMNS = 3;
const TILE_SIZE =
  (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GUTTER * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
type MediaKindFilter = 'ALL' | 'PHOTO' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';

interface MediaTileVM extends MediaListItem {
  signedUrl?: string;
  signedUrlExpiresAt?: number;
  loadingUrl?: boolean;
  urlError?: string;
}

function inferMime(asset: { uri: string; mimeType?: string }): string {
  const c = asset.mimeType?.toLowerCase();
  if (c && c !== 'application/octet-stream') return c;
  const ext = (asset.uri.split('.').pop() ?? '').toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'jpeg' || ext === 'jpg') return 'image/jpeg';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'm4a') return 'audio/x-m4a';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'wav') return 'audio/wav';
  return c || 'application/octet-stream';
}

export interface MemoryLibrarySheetContentProps {
  patientId: string;
  patientName: string;
  isPrimary: boolean;
  myId: string;
  onBack: () => void;
}

export function MemoryLibrarySheetContent({
  patientId,
  patientName,
  isPrimary,
  myId,
  onBack,
}: MemoryLibrarySheetContentProps) {
  const [items, setItems] = useState<MediaTileVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [libraryTab, setLibraryTab] = useState<MediaCollection>('QUIZ');
  const [kindFilter, setKindFilter] = useState<MediaKindFilter>('ALL');
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [pendingQuizAssets, setPendingQuizAssets] = useState<{ uri: string; mimeType?: string }[]>([]);
  const [quizDetailsVisible, setQuizDetailsVisible] = useState(false);
  const [quizFirstName, setQuizFirstName] = useState('');
  const [quizRelationship, setQuizRelationship] = useState('');
  const [pendingMemoryAssets, setPendingMemoryAssets] = useState<{ uri: string; mimeType?: string }[]>([]);
  const [memoryDetailsVisible, setMemoryDetailsVisible] = useState(false);
  const [memoryNote, setMemoryNote] = useState('');
  const [previewItem, setPreviewItem] = useState<MediaTileVM | null>(null);
  const [editingMedia, setEditingMedia] = useState<MediaTileVM | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editRelationship, setEditRelationship] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadMedia = useCallback(async () => {
    if (!patientId) return;
    setError(null);
    try {
      const data = await listPatientMedia(patientId);
      setItems((prev) => {
        const urlMap = new Map(prev.map((m) => [m.publicId, m]));
        return data.map((d) => {
          const ex = urlMap.get(d.publicId);
          return ex ? { ...d, signedUrl: ex.signedUrl, signedUrlExpiresAt: ex.signedUrlExpiresAt } : d;
        });
      });
    } catch (e: any) {
      setError(e?.message ?? 'Could not load memories.');
    }
  }, [patientId]);

  useEffect(() => {
    setLoading(true);
    setEditMode(false);
    setSelected(new Set());
    setLibraryTab('QUIZ');
    setKindFilter('ALL');
    loadMedia().finally(() => setLoading(false));
  }, [patientId]);

  const ensureSignedUrl = useCallback(
    async (publicId: string) => {
      const existing = items.find((m) => m.publicId === publicId);
      if (!existing || existing.status !== 'READY') return null;
      const now = Date.now();
      if (existing.signedUrl && existing.signedUrlExpiresAt && existing.signedUrlExpiresAt > now + 5_000)
        return existing.signedUrl;
      setItems((prev) =>
        prev.map((m) => (m.publicId === publicId ? { ...m, loadingUrl: true, urlError: undefined } : m)),
      );
      try {
        const access = await getAccessUrl(publicId);
        const expiresAt = new Date(access.expiresAt).getTime();
        setItems((prev) =>
          prev.map((m) =>
            m.publicId === publicId
              ? { ...m, signedUrl: access.url, signedUrlExpiresAt: expiresAt, loadingUrl: false }
              : m,
          ),
        );
        return access.url;
      } catch (e: any) {
        setItems((prev) =>
          prev.map((m) =>
            m.publicId === publicId ? { ...m, loadingUrl: false, urlError: e?.message ?? 'Failed' } : m,
          ),
        );
        return null;
      }
    },
    [items],
  );

  useEffect(() => {
    items.forEach((m) => {
      if (m.status === 'READY' && !m.signedUrl && !m.loadingUrl && !m.urlError) {
        ensureSignedUrl(m.publicId);
      }
    });
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((m) => m.collection === libraryTab && (kindFilter === 'ALL' || m.kind === kindFilter));
  }, [items, kindFilter, libraryTab]);

  const uploadSingleAsset = async (
    asset: { uri: string; mimeType?: string },
    metadata: MediaMetadataInput,
  ) => {
    const blobResp = await fetch(asset.uri);
    const blob = await blobResp.blob();
    const byteSize = (blob as any).size as number;
    if (!byteSize || byteSize <= 0) throw new Error('Could not determine file size.');
    const contentType = inferMime(asset);
    let kind: 'PHOTO' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' = 'DOCUMENT';
    if (contentType.startsWith('image/')) kind = 'PHOTO';
    else if (contentType.startsWith('video/')) kind = 'VIDEO';
    else if (contentType.startsWith('audio/')) kind = 'AUDIO';
    if (metadata.collection === 'QUIZ' && kind !== 'PHOTO' && kind !== 'AUDIO') {
      throw new Error('Quiz media must be a photo or audio file.');
    }
    await uploadPatientMedia({ patientId, kind, contentType, fileUri: asset.uri, byteSize, metadata });
  };

  const showAddOptions = () => {
    Alert.alert(libraryTab === 'QUIZ' ? 'Add Quiz Media' : 'Add Memory', 'Choose a source', [
      { text: 'Take Photo', onPress: () => pickAndUpload('camera') },
      { text: 'Photo/Video Library', onPress: () => pickAndUpload('library') },
      { text: libraryTab === 'QUIZ' ? 'Browse Audio Files' : 'Browse Files', onPress: () => pickAndUpload('document') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickAndUpload = async (source: 'camera' | 'library' | 'document') => {
    let assets: { uri: string; mimeType?: string }[] = [];
    if (source === 'document') {
      const r = await DocumentPicker.getDocumentAsync({
        type: libraryTab === 'QUIZ' ? 'audio/*' : '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (r.canceled) return;
      assets = r.assets.map((a) => ({ uri: a.uri, mimeType: a.mimeType }));
    } else {
      let result: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Camera Access Required', 'Please enable camera access in Settings.', [
            { text: 'Cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]);
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Library Access Required', 'Please enable photo library access in Settings.', [
            { text: 'Cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]);
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          allowsMultipleSelection: true,
          selectionLimit: 20,
          quality: 0.8,
        });
      }
      if (result.canceled || !result.assets?.length) return;
      assets = result.assets.map((a: any) => ({ uri: a.uri, mimeType: a.mimeType }));
    }
    if (!assets.length) return;

    if (libraryTab === 'QUIZ') {
      const unsupported = assets.find((asset) => {
        const mime = inferMime(asset);
        return !mime.startsWith('image/') && !mime.startsWith('audio/');
      });
      if (unsupported) {
        Alert.alert('Photo or Audio Required', 'Quiz media can be a clear photo or an audio file of the person talking.');
        return;
      }
      setPendingQuizAssets(assets);
      setQuizDetailsVisible(true);
      return;
    }

    setPendingMemoryAssets(assets);
    setMemoryDetailsVisible(true);
  };

  const uploadAssets = async (assets: { uri: string; mimeType?: string }[], metadata: MediaMetadataInput) => {
    setUploading(true);
    const total = assets.length;
    let failed = 0;
    let firstError: string | null = null;
    for (let i = 0; i < assets.length; i++) {
      setUploadProgress({ current: i + 1, total });
      try {
        await uploadSingleAsset(assets[i], metadata);
      } catch (e: any) {
        failed++;
        firstError ||= e?.message ?? 'Upload failed';
      }
    }
    await loadMedia();
    setUploading(false);
    setUploadProgress(null);
    if (failed > 0) Alert.alert('Partial Upload', `${failed} of ${total} items could not be uploaded.${firstError ? `\n\n${firstError}` : ''}`);
  };

  const saveQuizDetailsAndUpload = async () => {
    const firstName = quizFirstName.trim();
    if (!firstName || !quizRelationship.trim()) {
      Alert.alert('Missing Details', 'Person name and relationship are required for quiz media.');
      return;
    }
    setQuizDetailsVisible(false);
    await uploadAssets(pendingQuizAssets, {
      collection: 'QUIZ',
      firstName,
      relationshipType: quizRelationship,
    });
    setPendingQuizAssets([]);
    setQuizFirstName('');
    setQuizRelationship('');
  };

  const saveMemoryDetailsAndUpload = async () => {
    const note = memoryNote.trim();
    if (!note) {
      Alert.alert('Missing Note', 'Please add a descriptive note before saving this memory.');
      return;
    }
    setMemoryDetailsVisible(false);
    await uploadAssets(pendingMemoryAssets, { collection: 'MEMORY', note });
    setPendingMemoryAssets([]);
    setMemoryNote('');
  };

  const openMetadataEdit = (item: MediaTileVM) => {
    setEditFirstName(item.firstName ?? '');
    setEditRelationship(item.relationshipType ?? '');
    setEditNote(item.note ?? '');
    setPreviewItem(null);
    setTimeout(() => setEditingMedia(item), 180);
  };

  const saveMetadataEdit = async () => {
    if (!editingMedia) return;
    setSavingEdit(true);
    try {
      if (editingMedia.collection === 'QUIZ') {
        const firstName = editFirstName.trim();
        const relationshipType = editRelationship.trim();
        if (!firstName || !relationshipType) {
          Alert.alert('Missing Details', 'Name and relationship are required.');
          return;
        }
        await updateMediaMetadata(editingMedia.publicId, {
          collection: 'QUIZ',
          firstName,
          relationshipType,
        });
      } else {
        const note = editNote.trim();
        if (!note) {
          Alert.alert('Missing Note', 'Descriptive note is required.');
          return;
        }
        await updateMediaMetadata(editingMedia.publicId, {
          collection: 'MEMORY',
          note,
        });
      }
      await loadMedia();
      setPreviewItem((prev) =>
        prev?.publicId === editingMedia.publicId
          ? {
              ...prev,
              firstName: editFirstName.trim() || prev.firstName,
              lastName: prev.lastName,
              relationshipType: editRelationship.trim() || prev.relationshipType,
              note: editNote.trim() || prev.note,
            }
          : prev,
      );
      setEditingMedia(null);
    } catch (e: any) {
      Alert.alert('Update Failed', e?.message ?? 'Could not update media details.');
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = (item: MediaTileVM) => {
    const canDelete = isPrimary || item.caregiverId === myId;
    if (!canDelete) {
      Alert.alert('Permission Denied', 'Only the primary caregiver or the uploader can delete this memory.');
      return;
    }
    Alert.alert('Delete Memory', 'This permanently removes the file. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMedia(item.publicId);
            setItems((prev) => prev.filter((m) => m.publicId !== item.publicId));
          } catch (e: any) {
            Alert.alert('Delete Failed', e?.message ?? 'Could not delete memory.');
          }
        },
      },
    ]);
  };

  const toggleSelect = (publicId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(publicId) ? next.delete(publicId) : next.add(publicId);
      return next;
    });
  };

  const deleteSelected = () => {
    if (selected.size === 0) return;
    Alert.alert(
      'Delete Selected',
      `Permanently delete ${selected.size} memor${selected.size === 1 ? 'y' : 'ies'}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setBulkDeleting(true);
            const ids = Array.from(selected);
            await Promise.allSettled(ids.map((id) => deleteMedia(id)));
            setItems((prev) => prev.filter((m) => !ids.includes(m.publicId)));
            setSelected(new Set());
            setEditMode(false);
            setBulkDeleting(false);
          },
        },
      ],
    );
  };

  const exitEditMode = () => {
    setEditMode(false);
    setSelected(new Set());
  };

  // ── Shared sub-views ──────────────────────────────────────────────────────

  const navHeader = (
    <View style={styles.sheetNavHeader}>
      <TouchableOpacity
        onPress={editMode ? exitEditMode : onBack}
        style={styles.backBtn}
        activeOpacity={0.6}
      >
        {editMode ? (
          <Text style={styles.navActionText}>Cancel</Text>
        ) : (
          <>
            <AppIcon
              iosName="chevron.left"
              androidFallback="‹"
              size={isIOS ? 22 : 24}
              color={isIOS ? colors.secondary : colors.textDark}
              weight={isIOS ? 'semibold' : 'medium'}
            />
            {isIOS && <Text style={styles.backBtnText}>Back</Text>}
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.sheetNavTitle} numberOfLines={1}>
        {editMode
          ? selected.size > 0
            ? `${selected.size} selected`
            : 'Select Memories'
          : 'Memory Library'}
      </Text>

      {editMode ? (
        <TouchableOpacity
          style={[styles.navRightBtn, selected.size === 0 && { opacity: 0.35 }]}
          onPress={deleteSelected}
          activeOpacity={0.7}
          disabled={selected.size === 0 || bulkDeleting}
        >
          {bulkDeleting ? (
            <ActivityIndicator size="small" color="#C0392B" />
          ) : (
            <Text style={[styles.navActionText, { color: '#C0392B' }]}>Delete</Text>
          )}
        </TouchableOpacity>
      ) : isPrimary ? (
        <TouchableOpacity
          style={styles.navRightBtn}
          onPress={() => setEditMode(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.navActionText}>Edit</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 60 }} />
      )}
    </View>
  );

  const uploadBanner = uploading && uploadProgress ? (
    <View style={styles.uploadBanner}>
      <ActivityIndicator size="small" color="#fff" />
      <Text style={styles.uploadBannerText}>
        Uploading {uploadProgress.current} of {uploadProgress.total}…
      </Text>
    </View>
  ) : null;

  const libraryTabs = (
    <View style={styles.libraryTabs}>
      {(['QUIZ', 'MEMORY'] as const).map((f) => (
        <TouchableOpacity
          key={f}
          style={[styles.libraryTab, libraryTab === f && styles.libraryTabActive]}
          onPress={() => {
            setLibraryTab(f);
            setKindFilter('ALL');
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.libraryTabText, libraryTab === f && styles.libraryTabTextActive]}>
            {f === 'QUIZ' ? 'Quiz' : 'Memories'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const mediaFilters = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterContent}
      style={styles.filterRow}
    >
      {(['ALL', 'PHOTO', ...(libraryTab === 'MEMORY' ? ['VIDEO', 'AUDIO', 'DOCUMENT'] : ['AUDIO'])] as MediaKindFilter[]).map((f) => (
        <TouchableOpacity
          key={f}
          style={[styles.chip, kindFilter === f && styles.chipActive]}
          onPress={() => setKindFilter(f)}
          activeOpacity={0.7}
        >
          <Text style={[styles.chipText, kindFilter === f && styles.chipTextActive]}>
            {f === 'ALL'
              ? 'All'
              : f === 'PHOTO'
              ? 'Photos'
              : f === 'VIDEO'
              ? 'Videos'
              : f === 'AUDIO'
              ? 'Audio'
              : 'Files'}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  // Android-only inline add button (iOS uses floating FAB)
  const addRowButton = !isIOS && !editMode ? (
    <TouchableOpacity
      style={styles.addRowBtn}
      onPress={showAddOptions}
      activeOpacity={0.7}
      disabled={uploading}
    >
      {uploading ? (
        <ActivityIndicator size="small" color={colors.secondary} />
      ) : (
        <AppIcon iosName="plus.circle.fill" androidFallback="+" size={18} color={colors.secondary} />
      )}
      <Text style={styles.addRowBtnText}>{uploading ? 'Uploading...' : libraryTab === 'QUIZ' ? 'Add Quiz Media' : 'Add Memory'}</Text>
    </TouchableOpacity>
  ) : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.wrapper, isIOS && styles.wrapperIOS]}>
      {/* Fixed header area */}
      <View style={styles.headerArea}>
        {navHeader}
        {uploadBanner}
        {libraryTabs}
        {mediaFilters}
        {addRowButton}
      </View>

      {/* Content */}
      {loading ? (
        <View style={[styles.center, isIOS && styles.centerFlex]}>
          <ActivityIndicator size="large" color={colors.secondary} />
        </View>
      ) : error ? (
        <View style={[styles.center, isIOS && styles.centerFlex]}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            onPress={() => {
              setLoading(true);
              loadMedia().finally(() => setLoading(false));
            }}
            style={styles.retryBtn}
          >
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={[styles.center, isIOS && styles.centerFlex]}>
          <View style={styles.emptyIconWrap}>
            <AppIcon iosName="photo.on.rectangle" androidFallback="📷" size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No memories yet</Text>
          <Text style={styles.emptyBody}>
            {libraryTab === 'QUIZ' && kindFilter === 'AUDIO'
              ? 'Tap + to add an audio file, then enter the speaker details.'
              : libraryTab === 'QUIZ'
              ? 'Tap + to add a clear face photo or audio file, then enter the person details.'
              : isIOS
              ? 'Tap the + button to add the first memory.'
              : 'Tap "Add Memory" above to get started.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.publicId}
          numColumns={GRID_COLUMNS}
          contentContainerStyle={[styles.grid, isIOS && { paddingBottom: 100 }]}
          columnWrapperStyle={styles.gridRow}
          // iOS: FlatList scrolls inside the flex:1 formSheet
          // Android: outer M3BottomSheet ScrollView scrolls; FlatList just lays out
          scrollEnabled={isIOS}
          nestedScrollEnabled={true}
          style={isIOS ? styles.flatListIOS : undefined}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.publicId);
            const canDelete = isPrimary || item.caregiverId === myId;
            return (
              <MemoryTile
                item={item}
                editMode={editMode}
                isSelected={isSelected}
                canDelete={canDelete}
                isPrimary={isPrimary}
                onPress={() => {
                  if (editMode && (isPrimary || canDelete)) {
                    toggleSelect(item.publicId);
                    return;
                  }
                  if (!editMode) {
                    setQuizDetailsVisible(false);
                    setMemoryDetailsVisible(false);
                    setPendingQuizAssets([]);
                    setPendingMemoryAssets([]);
                    setPreviewItem(item);
                  }
                }}
                onLongPress={() => {
                  if (!editMode && canDelete) confirmDelete(item);
                }}
              />
            );
          }}
        />
      )}

      {/* Floating action button — iOS only (Android uses inline button) */}
      {isIOS && !editMode && (
        <TouchableOpacity
          style={[styles.fab, uploading && styles.fabDisabled]}
          onPress={showAddOptions}
          activeOpacity={0.8}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <AppIcon iosName="plus" androidFallback="+" size={24} color="#fff" weight="medium" />
          )}
        </TouchableOpacity>
      )}

      <Modal
        visible={quizDetailsVisible && !previewItem}
        transparent
        animationType="fade"
        onRequestClose={() => setQuizDetailsVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.quizModal}>
            <Text style={styles.quizModalTitle}>Add Quiz Info</Text>
            <Text style={styles.quizModalBody}>Add who is in the photo or speaking in the audio before saving this quiz media.</Text>
            <TextInput
              style={styles.detailInput}
              value={quizFirstName}
              onChangeText={setQuizFirstName}
              placeholder="Person name"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={styles.detailInput}
              value={quizRelationship}
              onChangeText={setQuizRelationship}
              placeholder="Relationship with patient"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.quizModalActions}>
              <TouchableOpacity
                style={styles.quizCancelBtn}
                onPress={() => {
                  setQuizDetailsVisible(false);
                  setPendingQuizAssets([]);
                }}
              >
                <Text style={styles.quizCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quizSaveBtn} onPress={saveQuizDetailsAndUpload}>
                <Text style={styles.quizSaveText}>Save Quiz Media</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={memoryDetailsVisible} transparent animationType="fade" onRequestClose={() => setMemoryDetailsVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.quizModal}>
            <Text style={styles.quizModalTitle}>Memory Details</Text>
            <Text style={styles.quizModalBody}>Add a descriptive note for this memory before saving it.</Text>
            <TextInput
              style={[styles.detailInput, styles.noteInput]}
              value={memoryNote}
              onChangeText={setMemoryNote}
              placeholder="Describe this memory"
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <View style={styles.quizModalActions}>
              <TouchableOpacity
                style={styles.quizCancelBtn}
                onPress={() => {
                  setMemoryDetailsVisible(false);
                  setPendingMemoryAssets([]);
                  setMemoryNote('');
                }}
              >
                <Text style={styles.quizCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quizSaveBtn} onPress={saveMemoryDetailsAndUpload}>
                <Text style={styles.quizSaveText}>Save Memory</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <MediaDetailsModal
        item={previewItem}
        onClose={() => setPreviewItem(null)}
        onEdit={openMetadataEdit}
      />

      <EditMetadataModal
        item={editingMedia}
        firstName={editFirstName}
        relationship={editRelationship}
        note={editNote}
        saving={savingEdit}
        onChangeFirstName={setEditFirstName}
        onChangeRelationship={setEditRelationship}
        onChangeNote={setEditNote}
        onClose={() => setEditingMedia(null)}
        onSave={saveMetadataEdit}
      />
    </View>
  );
}

// ── MemoryTile ────────────────────────────────────────────────────────────────

function MemoryTile({
  item,
  editMode,
  isSelected,
  canDelete,
  isPrimary,
  onPress,
  onLongPress,
}: {
  item: MediaTileVM;
  editMode: boolean;
  isSelected: boolean;
  canDelete: boolean;
  isPrimary: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  if (item.status !== 'READY') {
    return (
      <View style={[styles.tile, styles.tilePlaceholder]}>
        <ActivityIndicator size="small" color={colors.secondary} />
        <Text style={styles.tilePendingText}>Uploading…</Text>
      </View>
    );
  }
  if (item.urlError) {
    return (
      <View style={[styles.tile, styles.tilePlaceholder]}>
        <AppIcon iosName="exclamationmark.triangle" androidFallback="!" size={18} color="#C0392B" />
        <Text style={styles.tilePendingText}>Error</Text>
      </View>
    );
  }
  if (!item.signedUrl) {
    return (
      <View style={[styles.tile, styles.tilePlaceholder]}>
        <ActivityIndicator size="small" color={colors.secondary} />
      </View>
    );
  }

  const isSelectableInEdit = editMode && (isPrimary || canDelete);

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={260}
      activeOpacity={editMode ? 0.9 : 0.82}
      style={[
        styles.tile,
        isSelected && styles.tileSelected,
        editMode && !isSelectableInEdit && styles.tileDisabled,
      ]}
    >
      <Image source={{ uri: item.signedUrl }} style={styles.tileImage} />

      {item.kind !== 'PHOTO' && (
        <View style={styles.kindBadge}>
          <AppIcon
            iosName={item.kind === 'VIDEO' ? 'video.fill' : item.kind === 'AUDIO' ? 'waveform' : 'doc.fill'}
            androidFallback={item.kind === 'VIDEO' ? '▶' : item.kind === 'AUDIO' ? '♪' : '📄'}
            size={11}
            color="#fff"
          />
        </View>
      )}

      {editMode && (
        <View style={[styles.selectOverlay, isSelected && styles.selectOverlayActive]}>
          {isSelectableInEdit && (
            <View style={[styles.selectCircle, isSelected && styles.selectCircleActive]}>
              {isSelected && <AppIcon iosName="checkmark" androidFallback="✓" size={12} color="#fff" weight="bold" />}
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function MediaDetailsModal({
  item,
  onClose,
  onEdit,
}: {
  item: MediaTileVM | null;
  onClose: () => void;
  onEdit: (item: MediaTileVM) => void;
}) {
  if (!item) return null;

  const title =
    item.collection === 'QUIZ'
      ? item.kind === 'AUDIO'
        ? 'Audio'
        : 'Photo'
      : item.kind === 'PHOTO'
      ? 'Photo'
      : item.kind === 'VIDEO'
      ? 'Video'
      : item.kind === 'AUDIO'
      ? 'Audio'
      : 'File';

  const primaryDetail =
    item.collection === 'QUIZ'
      ? [item.firstName, item.relationshipType].filter(Boolean).join(' · ')
      : item.note || 'No note saved';

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.previewModal}>
          <View style={styles.previewHeader}>
            <Text style={styles.quizModalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <AppIcon iosName="xmark" androidFallback="x" size={16} color={colors.textDark} />
            </TouchableOpacity>
          </View>

          <View style={styles.detailsList}>
            {!!primaryDetail && <Text style={styles.detailLine}>{primaryDetail}</Text>}
            <Text style={styles.detailMeta}>
              {item.kind.charAt(0) + item.kind.slice(1).toLowerCase()} · {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>

          <TouchableOpacity style={styles.editDetailsBtn} onPress={() => onEdit(item)}>
            <Text style={styles.editDetailsText}>Edit Details</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function EditMetadataModal({
  item,
  firstName,
  relationship,
  note,
  saving,
  onChangeFirstName,
  onChangeRelationship,
  onChangeNote,
  onClose,
  onSave,
}: {
  item: MediaTileVM | null;
  firstName: string;
  relationship: string;
  note: string;
  saving: boolean;
  onChangeFirstName: (value: string) => void;
  onChangeRelationship: (value: string) => void;
  onChangeNote: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.quizModal}>
          <Text style={styles.quizModalTitle}>Edit Details</Text>
          {item?.collection === 'QUIZ' ? (
            <>
              <TextInput style={styles.detailInput} value={firstName} onChangeText={onChangeFirstName} placeholder="Name" placeholderTextColor={colors.textMuted} />
              <TextInput style={styles.detailInput} value={relationship} onChangeText={onChangeRelationship} placeholder="Relationship with patient" placeholderTextColor={colors.textMuted} />
            </>
          ) : (
            <TextInput
              style={[styles.detailInput, styles.noteInput]}
              value={note}
              onChangeText={onChangeNote}
              placeholder="Descriptive note"
              placeholderTextColor={colors.textMuted}
              multiline
            />
          )}
          <View style={styles.quizModalActions}>
            <TouchableOpacity style={styles.quizCancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.quizCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.quizSaveBtn, saving && styles.fabDisabled]} onPress={onSave} disabled={saving}>
              <Text style={styles.quizSaveText}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}


const styles = StyleSheet.create({
  // Container
  wrapper: {
    // sized by content on Android (outer M3BottomSheet ScrollView scrolls)
  },
  wrapperIOS: {
    flex: 1, // fills the formSheet
  },
  flatListIOS: {
    flex: 1,
  },

  // Header area (nav + chips)
  headerArea: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },

  // Nav header — matches patients.tsx sheetNavHeader
  sheetNavHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingTop: 4,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isIOS ? 2 : 0,
    minWidth: 60,
    paddingVertical: 6,
    paddingRight: 8,
    ...(isIOS
      ? {}
      : {
          width: 40,
          height: 40,
          borderRadius: 20,
          justifyContent: 'center' as const,
          backgroundColor: 'rgba(0,0,0,0.05)',
        }),
  },
  backBtnText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 17,
    color: colors.secondary,
  },
  sheetNavTitle: {
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: colors.textDark,
    textAlign: 'center',
  },
  navRightBtn: {
    minWidth: 60,
    alignItems: 'flex-end',
    paddingVertical: 6,
    paddingLeft: 8,
  },
  navActionText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 16,
    color: colors.secondary,
  },

  // Upload progress banner
  uploadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.secondary,
    paddingVertical: 9,
    borderRadius: 12,
    marginBottom: 10,
  },
  uploadBannerText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: '#fff',
  },

  // Filter chips
  filterRow: { flexGrow: 0, marginBottom: 10 },
  filterContent: { gap: 8 },
  libraryTabs: {
    flexDirection: 'row',
    width: '100%',
    padding: 3,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginBottom: 10,
  },
  libraryTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 11,
  },
  libraryTabActive: {
    backgroundColor: colors.secondary,
  },
  libraryTabText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.textMuted,
  },
  libraryTabTextActive: {
    color: '#fff',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  chipActive: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  chipText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  chipTextActive: { color: '#fff' },

  // Android inline add button
  addRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(45,79,62,0.07)',
  },
  addRowBtnText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.secondary,
  },

  // Grid
  grid: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 4,
    paddingBottom: 24,
  },
  gridRow: { gap: GRID_GUTTER, marginBottom: GRID_GUTTER },

  // Tiles
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: isIOS ? 10 : 14,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  tileSelected: {
    opacity: 0.78,
    transform: [{ scale: 0.94 }],
  },
  tileDisabled: { opacity: 0.38 },
  tilePlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  tilePendingText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 10,
    color: colors.textMuted,
  },
  tileImage: { width: '100%', height: '100%' },
  kindBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  selectOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 6,
  },
  selectOverlayActive: { backgroundColor: 'rgba(3,87,58,0.18)' },
  selectCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectCircleActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },

  // States
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  centerFlex: {
    flex: 1,
    paddingVertical: 0,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: colors.textDark,
  },
  emptyBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  errorText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: '#C0392B',
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  retryBtnText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: '#fff',
  },

  // FAB (iOS only)
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 36,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 8,
  },
  fabDisabled: { opacity: 0.55 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  quizModal: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: colors.neutral,
    padding: 18,
    gap: 10,
  },
  quizModalTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: colors.textDark,
  },
  quizModalBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  detailInput: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textDark,
  },
  noteInput: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  previewModal: {
    width: '100%',
    maxHeight: '86%',
    borderRadius: 18,
    backgroundColor: colors.neutral,
    padding: 16,
    gap: 12,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  closeBtnText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: colors.textDark,
  },
  detailsList: {
    gap: 6,
  },
  detailLine: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textDark,
  },
  detailMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  editDetailsBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.secondary,
  },
  editDetailsText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: '#fff',
  },
  quizModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  quizCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  quizCancelText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
  quizSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.secondary,
  },
  quizSaveText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: '#fff',
  },
});


