import React, { useLayoutEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { AppIcon } from '../src/components/AppIcon';
import { M3Dialog, type M3DialogAction } from '../src/components/M3Dialog';
import { getCaregiverInfo } from '../src/utils/auth';
import { canUploadMediaKind } from '../src/utils/subscription';
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

// Import the shared UI we are about to create
import { MemoryLibrarySheetContent } from '../src/components/MemoryLibraryModal';

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

    // ── Subscription gate: free users can only upload photos ──
    const caregiverInfo = await getCaregiverInfo();
    if (!canUploadMediaKind(caregiverInfo?.isSubscribed ?? false, kind)) {
      throw new Error(`${kind.charAt(0) + kind.slice(1).toLowerCase()} uploads require a Premium subscription. Upgrade to unlock video, audio, and document uploads.`);
    }

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
    showDialog('Add Memory', 'Choose a source for this memory', [
      { label: 'Take Photo', onPress: () => { dismissDialog(); handlePickAndUpload('camera'); } },
      { label: 'Photo/Video Library', onPress: () => { dismissDialog(); handlePickAndUpload('library'); } },
      { label: 'Browse Files (Audio/Docs)', onPress: () => { dismissDialog(); handlePickAndUpload('document'); } },
      { label: 'Cancel', onPress: dismissDialog },
    ]);
  };

  const showAddOptionsRef = useRef(showAddOptions);
  showAddOptionsRef.current = showAddOptions;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: params.patientName ? `${params.patientName}'s Media` : 'Media Manager',
    });
  }, [navigation, params.patientName]);

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
      {/* Renders the newly updated UI Component */}
      <MemoryLibrarySheetContent patientId={patientId} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.neutral },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#C0392B', fontSize: 16 },
});