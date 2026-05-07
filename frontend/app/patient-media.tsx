import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { HeaderButton } from '@react-navigation/elements';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { AppIcon } from '../src/components/AppIcon';
import { M3Dialog, type M3DialogAction } from '../src/components/M3Dialog';
import {
  deleteMedia,
  getAccessUrl,
  listPatientMedia,
  updateMediaMetadata,
  uploadPatientMedia,
  type MediaCollection,
  type MediaListItem,
  type MediaMetadataInput,
} from '../src/services/media';

const isIOS = Platform.OS === 'ios';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GUTTER = 10;
const GRID_PADDING = 20;
const GRID_COLUMNS = 3;
const TILE_SIZE =
  (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GUTTER * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

interface MediaTileViewModel extends MediaListItem {
  signedUrl?: string;
  signedUrlExpiresAt?: number;
  loadingUrl?: boolean;
  urlError?: string;
}

type DialogState = {
  visible: boolean;
  title: string;
  body: string;
  actions: M3DialogAction[];
};

const SUPPORTED_PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MEMORY_CATEGORIES = ['Wedding', 'Holiday', 'Daily Life', 'Birthday', 'Family', 'Travel'];

type FormMode = MediaCollection;

type MediaForm = {
  mode: FormMode;
  firstName: string;
  relationshipType: string;
  note: string;
  eventYear: string;
  memoryCategory: string;
};

const emptyForm: MediaForm = {
  mode: 'MEMORY',
  firstName: '',
  relationshipType: '',
  note: '',
  eventYear: String(new Date().getFullYear()),
  memoryCategory: MEMORY_CATEGORIES[0],
};

function inferMimeFromAsset(asset: { uri: string; mimeType?: string }): string {
  const candidate = asset.mimeType?.toLowerCase();
  if (candidate && candidate !== 'application/octet-stream') {
    // If we have a reasonable MIME type directly from the picker, use it
    return candidate;
  }
  const ext = (asset.uri.split('.').pop() ?? '').toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'jpeg' || ext === 'jpg') return 'image/jpeg';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'm4a') return 'audio/m4a';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'wav') return 'audio/wav';
  // Fallback for general binary if unknown
  return candidate || 'application/octet-stream';
}

export default function PatientMediaScreen() {
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ patientId?: string; patientName?: string }>();
  const patientId = typeof params.patientId === 'string' ? params.patientId : undefined;
  const patientName = typeof params.patientName === 'string' ? params.patientName : '';

  const [items, setItems] = useState<MediaTileViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [libraryTab, setLibraryTab] = useState<MediaCollection>('MEMORY');
  const [form, setForm] = useState<MediaForm>(emptyForm);
  const [selectedItem, setSelectedItem] = useState<MediaTileViewModel | null>(null);
  const [editingItem, setEditingItem] = useState<MediaTileViewModel | null>(null);
  const [pendingQuizAssets, setPendingQuizAssets] = useState<{ uri: string; mimeType?: string }[]>([]);
  const [quizDetailsVisible, setQuizDetailsVisible] = useState(false);
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({
    visible: false,
    title: '',
    body: '',
    actions: [],
  });

  const showDialog = (title: string, body: string, actions: M3DialogAction[]) => {
    setDialog({ visible: true, title, body, actions });
  };
  const dismissDialog = () => setDialog((prev) => ({ ...prev, visible: false }));

  const loadMedia = useCallback(async () => {
    if (!patientId) return;
    setError(null);
    try {
      const data = await listPatientMedia(patientId);
      setItems(data);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load memories.');
    }
  }, [patientId]);

  useEffect(() => {
    if (!patientId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadMedia();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId, loadMedia]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMedia();
    setRefreshing(false);
  };

  const ensureSignedUrl = useCallback(
    async (publicId: string) => {
      const existing = items.find((m) => m.publicId === publicId);
      if (!existing || existing.status !== 'READY') return null;
      const now = Date.now();
      if (existing.signedUrl && existing.signedUrlExpiresAt && existing.signedUrlExpiresAt > now + 5_000) {
        return existing.signedUrl;
      }
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

  const readyTiles = useMemo(() => items, [items]);

  const filteredTiles = useMemo(
    () => readyTiles.filter((item) => item.collection === libraryTab),
    [readyTiles, libraryTab],
  );

  const buildMetadata = (): MediaMetadataInput => {
    if (form.mode === 'QUIZ') {
      return {
        collection: 'QUIZ',
        firstName: form.firstName.trim(),
        relationshipType: form.relationshipType,
      };
    }
    return {
      collection: 'MEMORY',
      note: form.note.trim(),
      eventYear: Number(form.eventYear),
      memoryCategory: form.memoryCategory,
    };
  };

  const validateForm = () => {
    if (form.mode === 'QUIZ') {
      if (!form.firstName.trim() || !form.relationshipType.trim()) {
        return 'Quiz uploads need a person name and relationship.';
      }
      return null;
    }
    if (!form.note.trim()) return 'Please add a short memory note.';
    const year = Number(form.eventYear);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return 'Please enter a valid event year.';
    }
    return null;
  };

  const validateClearFacePlaceholder = () => {
    if (form.mode !== 'QUIZ') return true;
    showDialog(
      'Face Check',
      'Vision check placeholder passed. In production this will confirm there is one clear face before saving quiz media.',
      [{ label: 'Continue', onPress: dismissDialog }],
    );
    return true;
  };

  useEffect(() => {
    items.forEach((m) => {
      if (m.status === 'READY' && !m.signedUrl && !m.loadingUrl && !m.urlError) {
        ensureSignedUrl(m.publicId);
      }
    });
  }, [items, ensureSignedUrl]);

  // Upload a single asset — extracted for reuse by multi-select
  const uploadSingleAsset = async (asset: { uri: string; mimeType?: string }): Promise<void> => {
    if (!patientId) return;
    const blobResp = await fetch(asset.uri);
    const blob = await blobResp.blob();
    const byteSize = (blob as any).size as number;
    if (!byteSize || byteSize <= 0) {
      throw new Error('Could not determine file size.');
    }
    const contentType = inferMimeFromAsset(asset);
    
    // Determine the basic kind ('PHOTO', 'VIDEO', 'AUDIO', or 'DOCUMENT') based on mime type
    let kind: 'PHOTO' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' = 'DOCUMENT';
    if (contentType.startsWith('image/')) kind = 'PHOTO';
    else if (contentType.startsWith('video/')) kind = 'VIDEO';
    else if (contentType.startsWith('audio/')) kind = 'AUDIO';

    if (form.mode === 'QUIZ' && kind !== 'PHOTO' && kind !== 'AUDIO') {
      throw new Error('Quiz media needs a photo or audio file.');
    }

    await uploadPatientMedia({
      patientId,
      kind,
      contentType,
      fileUri: asset.uri,
      byteSize,
      metadata: buildMetadata(),
    });
  };

  const pickAssets = async (source: 'camera' | 'library' | 'document') => {
    if (source === 'document') {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return [];
      return result.assets.map((a) => ({ uri: a.uri, mimeType: a.mimeType }));
    }

      let result: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const { status, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          if (!canAskAgain) {
            showDialog(
              'Camera Access Required',
              'Camera permission was denied. Please enable it in your device Settings.',
              [
                { label: 'Cancel', onPress: dismissDialog },
                {
                  label: 'Open Settings',
                  onPress: () => {
                    dismissDialog();
                    Linking.openSettings();
                  },
                },
              ],
            );
          } else {
            showDialog('Permission needed', 'Camera access is required to add a memory.', [
              { label: 'OK', onPress: dismissDialog },
            ]);
          }
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.8,
        });
      } else {
        const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          if (!canAskAgain) {
            showDialog(
              'Photo Library Access Required',
              'Photo library permission was denied. Please enable it in your device Settings.',
              [
                { label: 'Cancel', onPress: dismissDialog },
                {
                  label: 'Open Settings',
                  onPress: () => {
                    dismissDialog();
                    Linking.openSettings();
                  },
                },
              ],
            );
          } else {
            showDialog('Permission needed', 'Photo library access is required.', [
              { label: 'OK', onPress: dismissDialog },
            ]);
          }
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          allowsMultipleSelection: true,
          selectionLimit: 20,
          allowsEditing: false,
          quality: 0.8,
        });
      }
      
      if (result.canceled) return [];
      const assets = result.assets ?? [];
      if (assets.length === 0) return [];
      return assets.map((a: any) => ({ uri: a.uri, mimeType: a.mimeType }));
  };

  const uploadAssets = async (assetsToUpload: { uri: string; mimeType?: string }[]) => {
    if (assetsToUpload.length === 0) return;

    setUploading(true);
    const total = assetsToUpload.length;
    let failedCount = 0;
    let firstFailure: string | null = null;

    try {
      for (let i = 0; i < assetsToUpload.length; i++) {
        setUploadProgress({ current: i + 1, total });
        try {
          await uploadSingleAsset(assetsToUpload[i]);
        } catch (e: any) {
          failedCount++;
          firstFailure ||= e?.message ?? 'Unknown upload error';
        }
      }
      await loadMedia();
      if (failedCount > 0) {
        showDialog(
          'Upload Partially Failed',
          `${failedCount} of ${total} item${total > 1 ? 's' : ''} could not be uploaded.${firstFailure ? `\n\n${firstFailure}` : ''}`,
          [{ label: 'OK', onPress: dismissDialog }],
        );
      }
    } catch (e: any) {
      showDialog('Upload Failed', e?.message ?? 'Could not upload memories.', [
        { label: 'OK', onPress: dismissDialog },
      ]);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handlePickAndUpload = async (source: 'camera' | 'library' | 'document') => {
    if (!patientId) return;

    if (form.mode === 'MEMORY') {
      const validationError = validateForm();
      if (validationError) {
        showDialog('Missing Details', validationError, [{ label: 'OK', onPress: dismissDialog }]);
        return;
      }
    }

    const assetsToUpload = await pickAssets(source);
    if (!assetsToUpload || assetsToUpload.length === 0) return;

    if (form.mode === 'QUIZ') {
      const unsupported = assetsToUpload.find((asset) => {
        const mime = inferMimeFromAsset(asset);
        return !mime.startsWith('image/') && !mime.startsWith('audio/');
      });
      if (unsupported) {
        showDialog('Photo or Audio Required', 'Quiz media must be a photo or audio file.', [
          { label: 'OK', onPress: dismissDialog },
        ]);
        return;
      }
      setPendingQuizAssets(assetsToUpload);
      showDialog('Quiz Upload Disabled Here', 'Please use the Memory Library sheet from the patient card for quiz uploads.', [
        { label: 'OK', onPress: dismissDialog },
      ]);
      return;
    }

    await uploadAssets(assetsToUpload);
  };

  const showAddOptions = () => {
    if (!patientId) return;
    Alert.alert('Add Memory', 'Choose a source for this memory', [
      { text: 'Take Photo', onPress: () => handlePickAndUpload('camera') },
      { text: 'Photo/Video Library', onPress: () => handlePickAndUpload('library') },
      { text: 'Browse Files (Audio/Docs)', onPress: () => handlePickAndUpload('document') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const showAddOptionsRef = useRef(showAddOptions);
  showAddOptionsRef.current = showAddOptions;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: patientName ? `${patientName}'s Memories` : 'Memories',
    });
  }, [navigation, patientName]);

  const handleDelete = (item: MediaTileViewModel) => {
    showDialog(
      'Delete Memory',
      'This permanently removes the encrypted file and its metadata. This cannot be undone.',
      [
        { label: 'Cancel', onPress: dismissDialog },
        {
          label: 'Delete',
          onPress: async () => {
            dismissDialog();
            try {
              await deleteMedia(item.publicId);
              setItems((prev) => prev.filter((m) => m.publicId !== item.publicId));
            } catch (e: any) {
              showDialog('Delete Failed', e?.message ?? 'Could not delete memory.', [
                { label: 'OK', onPress: dismissDialog },
              ]);
            }
          },
        },
      ],
    );
  };

  if (!patientId) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Missing patient.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      {/* Upload progress banner */}
      {uploading && uploadProgress && (
        <View style={styles.uploadBanner}>
          <ActivityIndicator size="small" color={colors.textLight} />
          <Text style={styles.uploadBannerText}>
            Uploading {uploadProgress.current} of {uploadProgress.total}…
          </Text>
        </View>
      )}

      <ScrollView style={styles.managerPanel} contentContainerStyle={styles.managerContent}>
        <View style={styles.managerTitleRow}>
          <AppIcon iosName="photo.on.rectangle" androidFallback="📷" size={18} color={colors.secondary} />
          <Text style={styles.managerTitle}>Media Manager</Text>
        </View>
        <SegmentedControl
          value={form.mode}
          options={[
            { value: 'QUIZ', label: 'Quiz' },
            { value: 'MEMORY', label: 'Memories' },
          ]}
          onChange={(mode) => {
            setLibraryTab(mode);
            setForm((prev) => ({ ...prev, mode }));
          }}
        />

        {form.mode === 'QUIZ' ? (
          <View style={styles.quizPromptBox}>
            <AppIcon iosName="person.crop.square" androidFallback="[]" size={22} color={colors.secondary} />
            <Text style={styles.quizPromptText}>
              Add a clear face photo or audio file first. The required person name and relationship will appear right after you choose it.
            </Text>
          </View>
        ) : (
          <View style={styles.formBlock}>
            <FieldInput
              label="Memory Notes"
              value={form.note}
              onChangeText={(note) => setForm((prev) => ({ ...prev, note }))}
              multiline
            />
            <View style={styles.rowFields}>
              <FieldInput
                label="Year"
                value={form.eventYear}
                keyboardType="number-pad"
                onChangeText={(eventYear) => setForm((prev) => ({ ...prev, eventYear }))}
              />
              <View style={styles.flexField}>
                <ChipSelector
                  label="Memory Type"
                  options={MEMORY_CATEGORIES}
                  value={form.memoryCategory}
                  onChange={(memoryCategory) => setForm((prev) => ({ ...prev, memoryCategory }))}
                />
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.libraryTabsWrap}>
        <View style={styles.libraryTitleRow}>
          <AppIcon iosName="rectangle.stack.fill" androidFallback="L" size={16} color={colors.secondary} />
          <Text style={styles.libraryTitle}>Library</Text>
        </View>
        <SegmentedControl
          value={libraryTab}
          options={[
            { value: 'QUIZ', label: 'Quiz' },
            { value: 'MEMORY', label: 'Memories' },
          ]}
          onChange={(tab) => {
            setLibraryTab(tab);
            setForm((prev) => ({ ...prev, mode: tab }));
          }}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.secondary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadMedia} style={styles.primaryAction}>
            <Text style={styles.primaryActionText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : filteredTiles.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <AppIcon iosName="photo.on.rectangle" androidFallback="📷" size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No memories yet</Text>
          <Text style={styles.emptyBody}>
            {libraryTab === 'MEMORY'
              ? "Tap + to add a memory photo, video, or note."
              : 'Tap + to add quiz photos or audio with person details.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredTiles}
          keyExtractor={(item) => item.publicId}
          numColumns={GRID_COLUMNS}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.gridRow}
          refreshing={refreshing}
          onRefresh={onRefresh}
          renderItem={({ item }) => (
            <MediaTile item={item} onPress={() => setSelectedItem(item)} onLongPress={() => handleDelete(item)} />
          )}
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity 
        style={[styles.fab, (!patientId || uploading) && styles.fabDisabled]} 
        onPress={() => showAddOptionsRef.current()}
        activeOpacity={0.8}
        disabled={!patientId || uploading}
      >
        {uploading ? (
          <ActivityIndicator size="small" color={colors.textLight} />
        ) : (
          <AppIcon iosName="plus" androidFallback="+" size={24} color={colors.textLight} weight="medium" />
        )}
      </TouchableOpacity>

      <M3Dialog
        visible={dialog.visible}
        title={dialog.title}
        body={dialog.body}
        actions={dialog.actions}
        onDismiss={dismissDialog}
      />
      <MediaPreviewModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onEdit={(item) => {
          setSelectedItem(null);
          setEditingItem(item);
          setForm({
            mode: item.collection,
            firstName: item.firstName ?? '',
            relationshipType: item.relationshipType ?? '',
            note: item.note ?? '',
            eventYear: item.eventYear ? String(item.eventYear) : String(new Date().getFullYear()),
            memoryCategory: item.memoryCategory ?? MEMORY_CATEGORIES[0],
          });
        }}
      />
      <MetadataEditModal
        visible={!!editingItem}
        form={form}
        saving={savingMetadata}
        onChange={setForm}
        onClose={() => setEditingItem(null)}
        onSave={async () => {
          if (!editingItem) return;
          const validationError = validateForm();
          if (validationError) {
            showDialog('Missing Details', validationError, [{ label: 'OK', onPress: dismissDialog }]);
            return;
          }
          setSavingMetadata(true);
          try {
            await updateMediaMetadata(editingItem.publicId, buildMetadata());
            await loadMedia();
            setEditingItem(null);
          } catch (e: any) {
            showDialog('Update Failed', e?.message ?? 'Could not update media details.', [
              { label: 'OK', onPress: dismissDialog },
            ]);
          } finally {
            setSavingMetadata(false);
          }
        }}
      />
    </SafeAreaView>
  );
}

function MediaTile({
  item,
  onPress,
  onLongPress,
}: {
  item: MediaTileViewModel;
  onPress: () => void;
  onLongPress: () => void;
}) {
  if (item.status !== 'READY') {
    return (
      <View style={[styles.tile, styles.tilePlaceholder]}>
        <ActivityIndicator color={colors.secondary} />
        <Text style={styles.tilePending}>Uploading…</Text>
      </View>
    );
  }
  if (item.urlError) {
    return (
      <View style={[styles.tile, styles.tilePlaceholder]}>
        <AppIcon iosName="exclamationmark.triangle" androidFallback="!" size={20} color="#C0392B" />
        <Text style={styles.tilePending}>Failed</Text>
      </View>
    );
  }
  if (!item.signedUrl) {
    return (
      <View style={[styles.tile, styles.tilePlaceholder]}>
        <ActivityIndicator color={colors.secondary} />
      </View>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} delayLongPress={250} style={styles.tile} activeOpacity={0.85}>
      <Image source={{ uri: item.signedUrl }} style={styles.tileImage} />
    </TouchableOpacity>
  );
}

function FieldInput({
  label,
  value,
  onChangeText,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textArea]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType ?? 'default'}
        placeholderTextColor={colors.textMuted}
      />
    </View>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: FormMode;
  options: { value: FormMode; label: string }[];
  onChange: (value: FormMode) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => (
        <TouchableOpacity
          key={option.value}
          style={[styles.segment, value === option.value && styles.segmentActive]}
          onPress={() => onChange(option.value)}
        >
          <Text style={[styles.segmentText, value === option.value && styles.segmentTextActive]}>{option.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ChipSelector({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorRow}>
        {options.map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.selectorChip, value === option && styles.selectorChipActive]}
            onPress={() => onChange(option)}
          >
            <Text style={[styles.selectorChipText, value === option && styles.selectorChipTextActive]}>{option}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function MediaPreviewModal({
  item,
  onClose,
  onEdit,
}: {
  item: MediaTileViewModel | null;
  onClose: () => void;
  onEdit: (item: MediaTileViewModel) => void;
}) {
  if (!item?.signedUrl) return null;
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.previewBackdrop}>
        <View style={styles.previewModal}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>{item.collection === 'QUIZ' ? 'Quiz Media' : 'Memory'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.iconButton}>
              <AppIcon iosName="xmark" androidFallback="x" size={18} color={colors.textDark} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.zoomPane}
            maximumZoomScale={4}
            minimumZoomScale={1}
            contentContainerStyle={styles.zoomContent}
          >
            <Image source={{ uri: item.signedUrl }} style={styles.previewImage} resizeMode="contain" />
          </ScrollView>
          <Text style={styles.previewMeta}>
            {item.collection === 'QUIZ'
              ? [item.firstName, item.relationshipType].filter(Boolean).join(' - ') || 'No person details saved'
              : item.note || 'No description saved'}
          </Text>
          <TouchableOpacity style={styles.primaryAction} onPress={() => onEdit(item)}>
            <Text style={styles.primaryActionText}>Edit Details</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function MetadataEditModal({
  visible,
  title = 'Edit Details',
  form,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  visible: boolean;
  title?: string;
  form: MediaForm;
  saving: boolean;
  onChange: React.Dispatch<React.SetStateAction<MediaForm>>;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.previewBackdrop}>
        <View style={styles.editModal}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.iconButton}>
              <AppIcon iosName="xmark" androidFallback="x" size={18} color={colors.textDark} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.editContent}>
            <SegmentedControl
              value={form.mode}
              options={[
                { value: 'QUIZ', label: 'Quiz' },
                { value: 'MEMORY', label: 'Memories' },
              ]}
              onChange={(mode) => onChange((prev) => ({ ...prev, mode }))}
            />
            {form.mode === 'QUIZ' ? (
              <>
                <View style={styles.rowFields}>
                  <FieldInput label="Person Name" value={form.firstName} onChangeText={(firstName) => onChange((prev) => ({ ...prev, firstName }))} />
                  <FieldInput label="Relationship" value={form.relationshipType} onChangeText={(relationshipType) => onChange((prev) => ({ ...prev, relationshipType }))} />
                </View>
              </>
            ) : (
              <>
                <FieldInput label="Memory Notes" value={form.note} onChangeText={(note) => onChange((prev) => ({ ...prev, note }))} multiline />
                <FieldInput label="Year" value={form.eventYear} keyboardType="number-pad" onChangeText={(eventYear) => onChange((prev) => ({ ...prev, eventYear }))} />
                <ChipSelector label="Memory Type" options={MEMORY_CATEGORIES} value={form.memoryCategory} onChange={(memoryCategory) => onChange((prev) => ({ ...prev, memoryCategory }))} />
              </>
            )}
          </ScrollView>
          <TouchableOpacity style={[styles.primaryAction, saving && styles.fabDisabled]} onPress={onSave} disabled={saving}>
            <Text style={styles.primaryActionText}>{saving ? 'Saving...' : 'Save Details'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.neutral },
  managerPanel: {
    maxHeight: 330,
    backgroundColor: colors.neutral,
  },
  managerContent: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 12,
  },
  managerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  managerTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: colors.textDark,
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
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: isIOS ? 11 : 14,
  },
  segmentActive: {
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
  formBlock: {
    gap: 10,
  },
  rowFields: {
    flexDirection: 'row',
    gap: 10,
  },
  field: {
    flex: 1,
    gap: 6,
  },
  flexField: {
    flex: 1.5,
  },
  fieldLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.textMuted,
  },
  input: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textDark,
  },
  textArea: {
    minHeight: 86,
    textAlignVertical: 'top',
  },
  selectorRow: {
    gap: 8,
    paddingRight: 6,
  },
  selectorChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.neutralLight,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  selectorChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectorChipText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.textMuted,
  },
  selectorChipTextActive: {
    color: colors.textLight,
  },
  quizPromptBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(45,79,62,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(45,79,62,0.14)',
  },
  quizPromptText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textDark,
  },
  uploadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.secondary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: GRID_PADDING,
    marginTop: 8,
    borderRadius: isIOS ? 12 : 16,
  },
  uploadBannerText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textLight,
  },
  libraryTabsWrap: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 8,
    marginBottom: 14,
    gap: 8,
  },
  libraryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  libraryTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: colors.textDark,
  },
  gridContent: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 100, // Extra padding so FAB doesn't cover last row
  },
  gridRow: {
    gap: GRID_GUTTER,
    marginBottom: GRID_GUTTER,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: isIOS ? 12 : 16,
    overflow: 'hidden',
    backgroundColor: colors.neutralLight,
    ...(isIOS
      ? {}
      : { elevation: 1 }),
  },
  tilePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tilePending: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
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
    marginTop: 6,
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
  primaryAction: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: isIOS ? 12 : 20,
    backgroundColor: colors.primary,
    ...(isIOS
      ? {}
      : { elevation: 2 }),
  },
  primaryActionText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textLight,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  fabDisabled: {
    opacity: 0.6,
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 18,
  },
  previewModal: {
    maxHeight: '88%',
    borderRadius: 18,
    backgroundColor: colors.neutral,
    padding: 14,
    gap: 12,
  },
  editModal: {
    maxHeight: '90%',
    borderRadius: 18,
    backgroundColor: colors.neutral,
    padding: 14,
    gap: 12,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: colors.textDark,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutralLight,
  },
  zoomPane: {
    width: '100%',
    maxHeight: Dimensions.get('window').height * 0.58,
    backgroundColor: '#111',
    borderRadius: 12,
  },
  zoomContent: {
    minHeight: Dimensions.get('window').height * 0.45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: Dimensions.get('window').height * 0.5,
  },
  previewMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textDark,
    lineHeight: 20,
  },
  editContent: {
    gap: 12,
    paddingBottom: 4,
  },
});
