import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Platform,
  StyleSheet,
  Text,
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
  uploadPatientMedia,
  type MediaListItem,
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
  const [filter, setFilter] = useState<'ALL' | 'PHOTO' | 'VIDEO' | 'AUDIO' | 'DOCUMENT'>('ALL');
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

  const filteredTiles = useMemo(() => {
    if (filter === 'ALL') return readyTiles;
    return readyTiles.filter((item) => item.kind === filter);
  }, [readyTiles, filter]);

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

    await uploadPatientMedia({
      patientId,
      kind,
      contentType,
      fileUri: asset.uri,
      byteSize,
    });
  };

  const handlePickAndUpload = async (source: 'camera' | 'library' | 'document') => {
    if (!patientId) return;
    let assetsToUpload: { uri: string; mimeType?: string }[] = [];

    if (source === 'document') {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return;
      assetsToUpload = result.assets.map((a) => ({ uri: a.uri, mimeType: a.mimeType }));
    } else {
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
      
      if (result.canceled) return;
      const assets = result.assets ?? [];
      if (assets.length === 0) return;
      assetsToUpload = assets.map((a: any) => ({ uri: a.uri, mimeType: a.mimeType }));
    }

    if (assetsToUpload.length === 0) return;

    setUploading(true);
    const total = assetsToUpload.length;
    let failedCount = 0;

    try {
      for (let i = 0; i < assetsToUpload.length; i++) {
        setUploadProgress({ current: i + 1, total });
        try {
          await uploadSingleAsset(assetsToUpload[i]);
        } catch {
          failedCount++;
        }
      }
      await loadMedia();
      if (failedCount > 0) {
        showDialog(
          'Upload Partially Failed',
          `${failedCount} of ${total} item${total > 1 ? 's' : ''} could not be uploaded. The rest were saved successfully.`,
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

      <Text style={styles.helpText}>
        Photos you add here are encrypted at rest with a unique key per file. They will power the patient's quiz and Relive Memory experience.
      </Text>

      <View>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.filterScrollContent}
          style={styles.filterScroll}
        >
          {(['ALL', 'PHOTO', 'VIDEO', 'AUDIO', 'DOCUMENT'] as const).map((f) => (
            <TouchableOpacity 
              key={f} 
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
              onPress={() => setFilter(f)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
                {f === 'ALL' ? 'All' : f === 'PHOTO' ? 'Photos' : f === 'VIDEO' ? 'Videos' : f === 'AUDIO' ? 'Audio' : 'Files'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
            <AppIcon iosName="photo.on.rectangle" androidFallback="📷" size={36} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No memories found</Text>
          <Text style={styles.emptyBody}>
            {filter === 'ALL' 
              ? "Add a photo to start building this patient's memory library."
              : `No items found for filter: ${filter}`}
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
            <MediaTile item={item} onLongPress={() => handleDelete(item)} />
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
    </SafeAreaView>
  );
}

function MediaTile({
  item,
  onLongPress,
}: {
  item: MediaTileViewModel;
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
    <TouchableOpacity onLongPress={onLongPress} delayLongPress={250} style={styles.tile} activeOpacity={0.85}>
      <Image source={{ uri: item.signedUrl }} style={styles.tileImage} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.neutral },
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
  helpText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
    paddingHorizontal: GRID_PADDING,
    paddingTop: 12,
    paddingBottom: 8,
    lineHeight: 18,
  },
  filterScroll: {
    flexGrow: 0,
    marginBottom: 16,
  },
  filterScrollContent: {
    paddingHorizontal: GRID_PADDING,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.neutralLight,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    ...(isIOS ? {} : { elevation: 1 }),
  },
  filterChipActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  filterChipText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  filterChipTextActive: {
    color: colors.textLight,
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
    borderRadius: isIOS ? 36 : 24,
    backgroundColor: isIOS ? 'rgba(180, 174, 232, 0.12)' : 'rgba(180, 174, 232, 0.15)',
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
});
