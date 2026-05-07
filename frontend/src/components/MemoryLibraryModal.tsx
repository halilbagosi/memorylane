import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  InteractionManager,
  KeyboardAvoidingView,
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
import type { DimensionValue } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { LinearGradient } from 'expo-linear-gradient';
import { AppIcon } from './AppIcon';
import { ZoomableImage } from './ZoomableImage';
import {
  deleteMedia,
  getAccessUrl,
  getQuizModes,
  listPatientMedia,
  updateMediaMetadata,
  updateQuizModes,
  uploadPatientMedia,
  verifyQuizPhoto,
  type MediaCollection,
  type MediaListItem,
  type MediaMetadataInput,
  type QuizPhotoVerificationCode,
  type QuizMode,
} from '../services/media';
import { uniqueIdentityCount } from '../services/quiz';

const isIOS = Platform.OS === 'ios';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GUTTER = 8;
const GRID_PADDING = 16;
const QUIZ_COLUMNS = 3;
const MEMORY_COLUMNS = 3;
const MEMORY_GRID_PADDING = GRID_PADDING;
const MEMORY_GRID_GAP = GRID_GUTTER;
const TILE_SIZE_QUIZ =
  (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GUTTER * (QUIZ_COLUMNS - 1)) / QUIZ_COLUMNS;
const TILE_SIZE_MEMORY =
  (SCREEN_WIDTH - MEMORY_GRID_PADDING * 2 - MEMORY_GRID_GAP * (MEMORY_COLUMNS - 1)) / MEMORY_COLUMNS;
// Keep TILE_SIZE as the quiz default so MemoryTile/styles that reference it still work for QUIZ
const TILE_SIZE = TILE_SIZE_QUIZ;
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

async function normalizeQuizPhotoAsset(asset: { uri: string; mimeType?: string }) {
  const mime = inferMime(asset);
  if (!mime.startsWith('image/')) return asset;

  const originalUri = asset.uri;
  const converted = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: { width: 1600 } }],
    { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG },
  );
  return { uri: converted.uri, mimeType: 'image/jpeg', originalUri };
}

async function readAssetBase64(uri: string) {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
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
  const [quizGuidanceVisible, setQuizGuidanceVisible] = useState(false);
  const [pendingQuizPhotoSource, setPendingQuizPhotoSource] = useState<'camera' | 'library' | null>(null);
  const queuedPickerSourceRef = useRef<'camera' | 'library' | null>(null);
  const [quizDetailsVisible, setQuizDetailsVisible] = useState(false);
  const [quizFirstName, setQuizFirstName] = useState('');
  const [quizRelationship, setQuizRelationship] = useState('');
  const [quizBirthYear, setQuizBirthYear] = useState('');
  const [verifyingQuizPhoto, setVerifyingQuizPhoto] = useState(false);
  const [quizPhotoVerified, setQuizPhotoVerified] = useState(false);
  const [quizVerificationMessage, setQuizVerificationMessage] = useState<string | null>(null);
  const [pendingMemoryAssets, setPendingMemoryAssets] = useState<{ uri: string; mimeType?: string }[]>([]);
  const [memoryDetailsVisible, setMemoryDetailsVisible] = useState(false);
  const [memoryNote, setMemoryNote] = useState('');
  const [memoryYear, setMemoryYear] = useState('');
  const [memoryIsApproximate, setMemoryIsApproximate] = useState(false);
  const [previewItem, setPreviewItem] = useState<MediaTileVM | null>(null);
  const [editingMedia, setEditingMedia] = useState<MediaTileVM | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editRelationship, setEditRelationship] = useState('');
  const [editBirthYear, setEditBirthYear] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editIsApproximate, setEditIsApproximate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [imageRetryIds, setImageRetryIds] = useState<Set<string>>(new Set());
  const [quizModes, setQuizModes] = useState<QuizMode[]>(['NAME', 'AGE', 'RELATIONSHIP']);
  const [savingQuizModes, setSavingQuizModes] = useState(false);

  const quizIdentityCount = useMemo(() => (
    uniqueIdentityCount(
      items.filter((m) => m.collection === 'QUIZ' && m.status === 'READY' && !!m.firstName?.trim()),
    )
  ), [items]);

  const loadMedia = useCallback(async () => {
    if (!patientId) return;
    setError(null);
    try {
      const data = await listPatientMedia(patientId);
      setItems((prev) => {
        const urlMap = new Map(prev.map((m) => [m.publicId, m]));
        const now = Date.now();
        return data.map((d) => {
          const ex = urlMap.get(d.publicId);
          const hasFreshUrl =
            ex?.signedUrl &&
            ex.signedUrlExpiresAt &&
            ex.signedUrlExpiresAt > now + 5_000;
          return hasFreshUrl
            ? { ...d, signedUrl: ex.signedUrl, signedUrlExpiresAt: ex.signedUrlExpiresAt }
            : d;
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
    Promise.all([
      loadMedia(),
      getQuizModes(patientId).then(setQuizModes).catch(() => undefined),
    ]).finally(() => setLoading(false));
  }, [patientId]);

  const handleToggleQuizMode = async (mode: QuizMode) => {
    if (quizIdentityCount < 4) return;
    const isActive = quizModes.includes(mode);
    if (isActive && quizModes.length === 1) return; // must keep at least one
    const next = isActive ? quizModes.filter((m) => m !== mode) : [...quizModes, mode];
    setQuizModes(next);
    setSavingQuizModes(true);
    try {
      const saved = await updateQuizModes(patientId, next);
      setQuizModes(saved);
    } catch {
      setQuizModes(quizModes); // revert on error
    } finally {
      setSavingQuizModes(false);
    }
  };

  const ensureSignedUrl = useCallback(
    async (publicId: string, forceRefresh = false) => {
      const existing = items.find((m) => m.publicId === publicId);
      if (!existing || existing.status !== 'READY') return null;
      const now = Date.now();
      if (!forceRefresh && existing.signedUrl && existing.signedUrlExpiresAt && existing.signedUrlExpiresAt > now + 5_000)
        return existing.signedUrl;
      setItems((prev) =>
        prev.map((m) => (m.publicId === publicId ? { ...m, signedUrl: undefined, loadingUrl: true, urlError: undefined } : m)),
      );
      try {
        const access = await getAccessUrl(publicId);
        const expiresAt = new Date(access.expiresAt).getTime();
        Image.prefetch(access.url).catch(() => undefined);
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

  const launchQueuedQuizPhotoPicker = () => {
    const source = queuedPickerSourceRef.current;
    if (!source) return;
    queuedPickerSourceRef.current = null;
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => pickAndUpload(source), 100);
    });
  };

  const handleImageLoadError = useCallback(
    (publicId: string) => {
      setImageRetryIds((prev) => {
        if (prev.has(publicId)) {
          setItems((itemsPrev) =>
            itemsPrev.map((m) =>
              m.publicId === publicId
                ? { ...m, signedUrl: undefined, loadingUrl: false, urlError: 'Could not load image' }
                : m,
            ),
          );
          return prev;
        }
        const next = new Set(prev);
        next.add(publicId);
        ensureSignedUrl(publicId, true);
        return next;
      });
    },
    [ensureSignedUrl],
  );

  useEffect(() => {
    const now = Date.now();
    items.forEach((m) => {
      const needsUrl =
        !m.signedUrl || !m.signedUrlExpiresAt || m.signedUrlExpiresAt <= now + 5_000;
      if (m.status === 'READY' && needsUrl && !m.loadingUrl && !m.urlError) {
        ensureSignedUrl(m.publicId);
      }
    });
  }, [items]);

  const filteredItems = useMemo(() => {
    const base = items.filter((m) => m.collection === libraryTab && (kindFilter === 'ALL' || m.kind === kindFilter));
    if (libraryTab === 'MEMORY') {
      return [...base].sort((a, b) => {
        const yearA = a.eventYear ?? new Date(a.createdAt).getFullYear();
        const yearB = b.eventYear ?? new Date(b.createdAt).getFullYear();
        if (yearA !== yearB) return yearA - yearB;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    }
    return base;
  }, [items, kindFilter, libraryTab]);

  type ListRow =
    | { type: 'HEADER'; label: string; key: string }
    | { type: 'ROW'; items: MediaTileVM[]; key: string };

  const groupedMemoryData = useMemo((): ListRow[] | null => {
    if (libraryTab !== 'MEMORY') return null;
    const groups: { label: string; items: MediaTileVM[] }[] = [];
    const labelOf = (item: MediaTileVM) => {
      const year = item.eventYear ?? new Date(item.createdAt).getFullYear();
      return Number.isFinite(year) ? `${Math.floor(year / 10) * 10}s` : 'Undated';
    };
    for (const item of filteredItems) {
      const label = labelOf(item);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    }
    const rows: ListRow[] = [];
    for (const g of groups) {
      rows.push({ type: 'HEADER', label: g.label, key: `hdr-${g.label}` });
      for (let i = 0; i < g.items.length; i += MEMORY_COLUMNS) {
        const chunk = g.items.slice(i, i + MEMORY_COLUMNS);
        rows.push({ type: 'ROW', items: chunk, key: `row-${chunk[0].publicId}` });
      }
    }
    return rows;
  }, [filteredItems, libraryTab]);

  const uploadSingleAsset = async (
    asset: { uri: string; mimeType?: string; originalUri?: string },
    metadata: MediaMetadataInput,
  ) => {
    const blobResp = await fetch(asset.uri).catch((error) => {
      throw new Error(`Could not read selected file: ${error?.message ?? 'unknown error'}`);
    });
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
    await uploadPatientMedia({
      patientId,
      kind,
      contentType,
      fileUri: asset.uri,
      hashUri: asset.originalUri,
      byteSize,
      metadata,
    });
  };

  const resetQuizDraft = () => {
    setPendingQuizAssets([]);
    setQuizFirstName('');
    setQuizRelationship('');
    setQuizBirthYear('');
    setQuizPhotoVerified(false);
    setQuizVerificationMessage(null);
    setVerifyingQuizPhoto(false);
  };

  const friendlyQuizPhotoMessage = (code?: string, fallback?: string) => {
    const name = patientName?.trim() || 'the patient';
    const messages: Partial<Record<QuizPhotoVerificationCode, string>> = {
      TOO_MANY_FACES: `${name} might get confused with multiple people. Please use a photo of just one person.`,
      NO_FACE_DETECTED: "We couldn't find a face. Please make sure the person is looking forward.",
      LOW_CONFIDENCE: `This photo is a bit blurry. Try a clearer one to help ${name} recognize them.`,
      LOW_CLARITY: `This photo is a bit hard to see. A brighter, clearer photo will help ${name} recognize them better.`,
      NOT_FRONTAL: `A front-facing photo will help ${name} recognize this person more easily.`,
      INVALID_IMAGE: 'We could not read this image. Please try another photo.',
      DUPLICATE_PHOTO: fallback ?? 'This photo or person has already been added to the quiz. Please choose a new photo.',
      FACE_VERIFICATION_UNAVAILABLE:
        fallback ?? 'Face verification is temporarily unavailable. Please try again in a moment.',
    };
    return messages[code as QuizPhotoVerificationCode] ?? fallback ?? `To help ${name} recognize this person, please use a clear, close-up photo of just one face.`;
  };

  const showAddOptions = () => {
    if (libraryTab === 'QUIZ') {
      showQuizSourceOptions();
      return;
    }
    Alert.alert('Add Memory', 'Choose a source', [
      { text: 'Take Photo', onPress: () => pickAndUpload('camera') },
      { text: 'Photo/Video Library', onPress: () => pickAndUpload('library') },
      { text: 'Browse Files', onPress: () => pickAndUpload('document') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const showQuizSourceOptions = () => {
    Alert.alert('Add Quiz Media', 'Choose a source', [
      {
        text: 'Take Photo',
        onPress: () => {
          setPendingQuizPhotoSource('camera');
          setQuizGuidanceVisible(true);
        },
      },
      {
        text: 'Photo Library',
        onPress: () => {
          setPendingQuizPhotoSource('library');
          setQuizGuidanceVisible(true);
        },
      },
      { text: 'Browse Audio Files', onPress: () => pickAndUpload('document') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickAndUpload = async (source: 'camera' | 'library' | 'document') => {
    let assets: { uri: string; mimeType?: string }[] = [];
    try {
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
            mediaTypes: libraryTab === 'QUIZ' ? ['images'] : ImagePicker.MediaTypeOptions.All,
            allowsMultipleSelection: true,
            selectionLimit: 20,
            quality: 0.8,
          });
        }
        if (result.canceled || !result.assets?.length) return;
        assets = result.assets.map((a: any) => ({ uri: a.uri, mimeType: a.mimeType }));
      }
    } catch (e: any) {
      Alert.alert('Picker Could Not Open', e?.message ?? 'Please try opening the picker again.');
      return;
    }
    if (!assets.length) return;

    if (libraryTab === 'QUIZ') {
      resetQuizDraft();
      const unsupported = assets.find((asset) => {
        const mime = inferMime(asset);
        return !mime.startsWith('image/') && !mime.startsWith('audio/');
      });
      if (unsupported) {
        Alert.alert('Photo or Audio Required', 'Quiz media can be a clear photo or an audio file of the person talking.');
        return;
      }
      try {
        assets = await Promise.all(assets.map(normalizeQuizPhotoAsset));
      } catch {
        Alert.alert('Could Not Prepare Photo', 'We could not prepare this photo for verification. Please try another image.');
        return;
      }
      const photo = assets.find((asset) => inferMime(asset).startsWith('image/'));
      if (!photo) {
        setPendingQuizAssets(assets);
        setQuizPhotoVerified(false);
        setQuizVerificationMessage(null);
        setQuizDetailsVisible(true);
        return;
      }

      setVerifyingQuizPhoto(true);
      setQuizVerificationMessage(null);
      try {
        const verification = await verifyQuizPhoto(patientId, await readAssetBase64(photo.uri));
        if (!verification.accepted) {
          throw {
            code: verification.code,
            detail: verification.message,
          };
        }
        setPendingQuizAssets(assets);
        setQuizPhotoVerified(true);
        setQuizVerificationMessage('Face Verified');
        setQuizDetailsVisible(true);
      } catch (e: any) {
        const message = friendlyQuizPhotoMessage(e?.code, e?.detail ?? e?.message);
        resetQuizDraft();
        Alert.alert(
          e?.code === 'FACE_VERIFICATION_UNAVAILABLE' ? 'Verification Unavailable' : 'Try Another Photo',
          message,
        );
      } finally {
        setVerifyingQuizPhoto(false);
      }
      return;
    }

    setPendingMemoryAssets(assets);
    setMemoryDetailsVisible(true);
  };

  const uploadAssets = async (assets: { uri: string; mimeType?: string }[], metadata: MediaMetadataInput) => {
    setUploading(true);
    const total = assets.length;
    let failed = 0;
    let duplicates = 0;
    let firstDuplicateDetail: string | null = null;
    let firstError: string | null = null;
    for (let i = 0; i < assets.length; i++) {
      setUploadProgress({ current: i + 1, total });
      try {
        await uploadSingleAsset(assets[i], metadata);
      } catch (e: any) {
        if ((e as any).status === 409) {
          duplicates++;
          firstDuplicateDetail ||= (e as any).detail ?? (e as any).message ?? null;
        } else {
          failed++;
          firstError ||= e?.message ?? 'Upload failed';
        }
      }
    }
    await loadMedia();
    setUploading(false);
    setUploadProgress(null);
    if (duplicates > 0 && failed === 0) {
      const msg = duplicates === 1
        ? (firstDuplicateDetail ?? 'This photo has already been added.')
        : `${duplicates} photos were skipped — they have already been added.`;
      Alert.alert('Already Added', msg);
    } else if (failed > 0) {
      Alert.alert('Partial Upload', `${failed} of ${total} items could not be uploaded.${firstError ? `\n\n${firstError}` : ''}`);
    }
  };

  const saveQuizDetailsAndUpload = async () => {
    const firstName = quizFirstName.trim();
    const birthYear = quizBirthYear.trim() ? parseInt(quizBirthYear.trim(), 10) : NaN;
    const currentYear = new Date().getFullYear();
    if (!firstName || !quizRelationship.trim() || Number.isNaN(birthYear)) {
      Alert.alert('Missing Details', 'Person name, relationship, and birth year are required for quiz media.');
      return;
    }
    if (birthYear < 1900 || birthYear > currentYear) {
      Alert.alert('Invalid Birth Year', `Please enter a birth year between 1900 and ${currentYear}.`);
      return;
    }
    const selectedPhotos = pendingQuizAssets.filter((asset) => inferMime(asset).startsWith('image/'));
    if (selectedPhotos.length > 0 && !quizPhotoVerified) {
      Alert.alert(
        'Photo Not Verified',
        friendlyQuizPhotoMessage(undefined),
      );
      return;
    }
    if (selectedPhotos.length > 1) {
      Alert.alert('One Photo Per Person', 'Please upload only one quiz photo for each person.');
      return;
    }
    const normalizedName = firstName.replace(/\s+/g, ' ').toLocaleLowerCase();
    const duplicatePhoto = items.some(
      (item) =>
        item.collection === 'QUIZ' &&
        item.kind === 'PHOTO' &&
        item.status === 'READY' &&
        item.firstName?.trim().replace(/\s+/g, ' ').toLocaleLowerCase() === normalizedName,
    );
    if (selectedPhotos.length > 0 && duplicatePhoto) {
      Alert.alert(
        'Photo Already Exists',
        `A quiz photo for ${firstName} already exists. Please edit the existing quiz photo instead.`,
      );
      return;
    }
    setQuizDetailsVisible(false);
    await uploadAssets(pendingQuizAssets, {
      collection: 'QUIZ',
      firstName,
      relationshipType: quizRelationship,
      birthYear,
    });
    setPendingQuizAssets([]);
    setQuizFirstName('');
    setQuizRelationship('');
    setQuizBirthYear('');
    setQuizPhotoVerified(false);
    setQuizVerificationMessage(null);
  };

  const saveMemoryDetailsAndUpload = async () => {
    const note = memoryNote.trim();
    if (!note) {
      Alert.alert('Missing Note', 'Please add a descriptive note before saving this memory.');
      return;
    }
    const yearNum = memoryYear.trim() ? parseInt(memoryYear.trim(), 10) : undefined;
    if (memoryYear.trim() && (isNaN(yearNum!) || yearNum! < 1900 || yearNum! > 2100)) {
      Alert.alert('Invalid Year', 'Please enter a year between 1900 and 2100.');
      return;
    }
    setMemoryDetailsVisible(false);
    await uploadAssets(pendingMemoryAssets, {
      collection: 'MEMORY',
      note,
      eventYear: yearNum,
      isApproximateYear: memoryIsApproximate,
    });
    setPendingMemoryAssets([]);
    setMemoryNote('');
    setMemoryYear('');
    setMemoryIsApproximate(false);
  };

  const openMetadataEdit = (item: MediaTileVM) => {
    setEditFirstName(item.firstName ?? '');
    setEditRelationship(item.relationshipType ?? '');
    setEditBirthYear(item.birthYear !== null ? String(item.birthYear) : '');
    setEditNote(item.note ?? '');
    setEditYear(item.eventYear !== null ? String(item.eventYear) : '');
    setEditIsApproximate(item.isApproximateYear ?? false);
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
        const birthYear = editBirthYear.trim() ? parseInt(editBirthYear.trim(), 10) : NaN;
        const currentYear = new Date().getFullYear();
        if (!firstName || !relationshipType || Number.isNaN(birthYear)) {
          Alert.alert('Missing Details', 'Name, relationship, and birth year are required.');
          return;
        }
        if (birthYear < 1900 || birthYear > currentYear) {
          Alert.alert('Invalid Birth Year', `Please enter a birth year between 1900 and ${currentYear}.`);
          return;
        }
        await updateMediaMetadata(editingMedia.publicId, {
          collection: 'QUIZ',
          firstName,
          relationshipType,
          birthYear,
        });
      } else {
        const note = editNote.trim();
        if (!note) {
          Alert.alert('Missing Note', 'Descriptive note is required.');
          return;
        }
        const yearNum = editYear.trim() ? parseInt(editYear.trim(), 10) : undefined;
        if (editYear.trim() && (isNaN(yearNum!) || yearNum! < 1900 || yearNum! > 2100)) {
          Alert.alert('Invalid Year', 'Please enter a year between 1900 and 2100.');
          return;
        }
        await updateMediaMetadata(editingMedia.publicId, {
          collection: 'MEMORY',
          note,
          eventYear: yearNum,
          isApproximateYear: editIsApproximate,
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
              birthYear: editBirthYear.trim() ? parseInt(editBirthYear.trim(), 10) : prev.birthYear,
              note: editNote.trim() || prev.note,
              eventYear: editYear.trim() ? parseInt(editYear.trim(), 10) : prev.eventYear,
              isApproximateYear: editIsApproximate,
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
          <Text style={styles.navActionText}>Select</Text>
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
  ) : verifyingQuizPhoto ? (
    <View style={styles.uploadBanner}>
      <ActivityIndicator size="small" color="#fff" />
      <Text style={styles.uploadBannerText}>Verifying clarity...</Text>
    </View>
  ) : null;

  const quizDraftHasPhoto = pendingQuizAssets.some((asset) => inferMime(asset).startsWith('image/'));
  const quizSaveDisabled = uploading || verifyingQuizPhoto || (quizDraftHasPhoto && !quizPhotoVerified);

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
      disabled={uploading || verifyingQuizPhoto}
    >
      {uploading || verifyingQuizPhoto ? (
        <ActivityIndicator size="small" color={colors.secondary} />
      ) : (
        <AppIcon iosName="plus.circle.fill" androidFallback="+" size={18} color={colors.secondary} />
      )}
      <Text style={styles.addRowBtnText}>
        {verifyingQuizPhoto ? 'Verifying...' : uploading ? 'Uploading...' : libraryTab === 'QUIZ' ? 'Add Quiz Media' : 'Add Memory'}
      </Text>
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
        {libraryTab === 'MEMORY' && mediaFilters}
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
      ) : groupedMemoryData ? (
        <FlatList
          key="memory-grouped"
          data={groupedMemoryData}
          keyExtractor={(row) => row.key}
          contentContainerStyle={[styles.memoryGrid, isIOS && { paddingBottom: 100 }]}
          scrollEnabled={isIOS}
          nestedScrollEnabled={true}
          style={isIOS ? styles.flatListIOS : undefined}
          removeClippedSubviews
          initialNumToRender={18}
          maxToRenderPerBatch={18}
          updateCellsBatchingPeriod={40}
          windowSize={9}
          renderItem={({ item: row }) => {
            if (row.type === 'HEADER') {
              return <YearHeader label={row.label} />;
            }
            const canDeleteOf = (m: MediaTileVM) => isPrimary || m.caregiverId === myId;
            return (
              <View style={styles.memoryGridRow}>
                {row.items.map((item) => {
                  const isSelected = selected.has(item.publicId);
                  const canDelete = canDeleteOf(item);
                  return (
                    <MemoryTile
                      key={item.publicId}
                      item={item}
                      tileSize={TILE_SIZE_MEMORY}
                      editMode={editMode}
                      isSelected={isSelected}
                      canDelete={canDelete}
                      isPrimary={isPrimary}
                      onImageError={() => handleImageLoadError(item.publicId)}
                      onPress={() => {
                        if (editMode && (isPrimary || canDelete)) { toggleSelect(item.publicId); return; }
                        if (!editMode) {
                          setQuizDetailsVisible(false);
                          setMemoryDetailsVisible(false);
                          setPendingQuizAssets([]);
                          setPendingMemoryAssets([]);
                          setPreviewItem(item);
                        }
                      }}
                      onLongPress={() => { if (!editMode && canDelete) confirmDelete(item); }}
                    />
                  );
                })}
                {row.items.length < MEMORY_COLUMNS &&
                  Array.from({ length: MEMORY_COLUMNS - row.items.length }).map((_, i) => (
                    <View key={`pad-${i}`} style={{ width: TILE_SIZE_MEMORY, height: TILE_SIZE_MEMORY }} />
                  ))}
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          key="quiz-grid"
          data={filteredItems}
          keyExtractor={(item) => item.publicId}
          numColumns={QUIZ_COLUMNS}
          contentContainerStyle={[styles.grid, isIOS && { paddingBottom: 100 }]}
          columnWrapperStyle={styles.gridRow}
          scrollEnabled={isIOS}
          nestedScrollEnabled={true}
          style={isIOS ? styles.flatListIOS : undefined}
          ListHeaderComponent={
            <View>
              <QuizModeSelector
                patientName={patientName}
                activeModes={quizModes}
                identityCount={quizIdentityCount}
                saving={savingQuizModes}
                onToggle={handleToggleQuizMode}
              />
              {mediaFilters}
            </View>
          }
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
                onImageError={() => handleImageLoadError(item.publicId)}
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
          style={[styles.fab, (uploading || verifyingQuizPhoto) && styles.fabDisabled]}
          onPress={showAddOptions}
          activeOpacity={0.8}
          disabled={uploading || verifyingQuizPhoto}
        >
          {uploading || verifyingQuizPhoto ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <AppIcon iosName="plus" androidFallback="+" size={24} color="#fff" weight="medium" />
          )}
        </TouchableOpacity>
      )}

      <Modal
        visible={quizGuidanceVisible && !previewItem}
        transparent
        animationType="fade"
        onDismiss={launchQueuedQuizPhotoPicker}
        onRequestClose={() => {
          queuedPickerSourceRef.current = null;
          setPendingQuizPhotoSource(null);
          setQuizGuidanceVisible(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.guidanceModal}>
            <Text style={styles.quizModalTitle}>Tips for a Great Quiz</Text>
            <View style={styles.guidanceTips}>
              <View style={styles.guidanceTip}>
                <View style={styles.guidanceIcon}>
                  <AppIcon iosName="person.fill" androidFallback="1" size={18} color={colors.secondary} />
                </View>
                <Text style={styles.guidanceTipText}>One person only</Text>
              </View>
              <View style={styles.guidanceTip}>
                <View style={styles.guidanceIcon}>
                  <AppIcon iosName="sun.max.fill" androidFallback="*" size={18} color={colors.secondary} />
                </View>
                <Text style={styles.guidanceTipText}>Clear and bright</Text>
              </View>
              <View style={styles.guidanceTip}>
                <View style={styles.guidanceIcon}>
                  <AppIcon iosName="face.smiling.fill" androidFallback=":" size={18} color={colors.secondary} />
                </View>
                <Text style={styles.guidanceTipText}>Looking at the camera</Text>
              </View>
              <View style={styles.guidanceTip}>
                <View style={[styles.guidanceIcon, styles.guidanceIconError]}>
                  <AppIcon iosName="xmark.circle.fill" androidFallback="X" size={18} color="#C0392B" />
                </View>
                <Text style={styles.guidanceTipText}>Same photo not allowed</Text>
              </View>
            </View>
            <View style={styles.quizModalActions}>
              <TouchableOpacity
                style={styles.quizCancelBtn}
                onPress={() => {
                  queuedPickerSourceRef.current = null;
                  setQuizGuidanceVisible(false);
                  setPendingQuizPhotoSource(null);
                }}
              >
                <Text style={styles.quizCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quizSaveBtn}
                onPress={() => {
                  const source = pendingQuizPhotoSource ?? 'library';
                  queuedPickerSourceRef.current = source;
                  setQuizGuidanceVisible(false);
                  setPendingQuizPhotoSource(null);
                  if (!isIOS) {
                    setTimeout(launchQueuedQuizPhotoPicker, 350);
                  }
                }}
              >
                <Text style={styles.quizSaveText}>Pick a Photo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={quizDetailsVisible && !previewItem}
        transparent
        animationType="fade"
        onRequestClose={() => setQuizDetailsVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={isIOS ? 'padding' : 'height'}
          keyboardVerticalOffset={24}
        >
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
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
            <TextInput
              style={styles.detailInput}
              value={quizBirthYear}
              onChangeText={setQuizBirthYear}
              placeholder="Birth year"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={4}
            />
            {quizDraftHasPhoto && (
              <View style={[styles.verificationBox, quizPhotoVerified && styles.verificationBoxSuccess]}>
                {verifyingQuizPhoto ? (
                  <ActivityIndicator size="small" color={colors.secondary} />
                ) : (
                  <AppIcon
                    iosName={quizPhotoVerified ? 'checkmark.circle.fill' : 'info.circle.fill'}
                    androidFallback={quizPhotoVerified ? '✓' : 'i'}
                    size={18}
                    color={colors.secondary}
                  />
                )}
                <Text style={styles.verificationText}>
                  {verifyingQuizPhoto
                    ? 'Verifying clarity...'
                    : quizVerificationMessage ?? 'To help recognition, this photo needs one clear, front-facing face.'}
                </Text>
              </View>
            )}
            <View style={styles.quizModalActions}>
              <TouchableOpacity
                style={styles.quizCancelBtn}
                onPress={() => {
                  setQuizDetailsVisible(false);
                  resetQuizDraft();
                }}
              >
                <Text style={styles.quizCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quizSaveBtn, quizSaveDisabled && styles.fabDisabled]}
                onPress={saveQuizDetailsAndUpload}
                disabled={quizSaveDisabled}
              >
                <Text style={styles.quizSaveText}>
                  {verifyingQuizPhoto ? 'Verifying...' : 'Save Quiz Media'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={memoryDetailsVisible} transparent animationType="fade" onRequestClose={() => setMemoryDetailsVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.quizModal}>
            <Text style={styles.quizModalTitle}>Memory Details</Text>
            <Text style={styles.quizModalBody}>Add a note and optionally the year this memory took place.</Text>
            <TextInput
              style={[styles.detailInput, styles.noteInput]}
              value={memoryNote}
              onChangeText={setMemoryNote}
              placeholder="Describe this memory"
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <TextInput
              style={styles.detailInput}
              value={memoryYear}
              onChangeText={setMemoryYear}
              placeholder="Year (e.g. 1985) — optional"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={4}
            />
            <TouchableOpacity
              style={styles.approxRow}
              onPress={() => setMemoryIsApproximate((v) => !v)}
              activeOpacity={0.7}
            >
              <View style={[styles.approxCheckbox, memoryIsApproximate && styles.approxCheckboxActive]}>
                {memoryIsApproximate && <Text style={styles.approxCheckmark}>✓</Text>}
              </View>
              <Text style={styles.approxLabel}>Approximate year</Text>
            </TouchableOpacity>
            <View style={styles.quizModalActions}>
              <TouchableOpacity
                style={styles.quizCancelBtn}
                onPress={() => {
                  setMemoryDetailsVisible(false);
                  setPendingMemoryAssets([]);
                  setMemoryNote('');
                  setMemoryYear('');
                  setMemoryIsApproximate(false);
                }}
              >
                <Text style={styles.quizCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quizSaveBtn} onPress={saveMemoryDetailsAndUpload}>
                <Text style={styles.quizSaveText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <MediaDetailsModal
        item={previewItem?.kind !== 'PHOTO' && previewItem?.kind !== 'VIDEO' ? previewItem : null}
        onClose={() => setPreviewItem(null)}
        onEdit={openMetadataEdit}
      />

      <MemoryFullscreenPreviewModal
        item={previewItem?.kind === 'PHOTO' || previewItem?.kind === 'VIDEO' ? previewItem : null}
        onClose={() => setPreviewItem(null)}
        onEdit={openMetadataEdit}
      />

      <EditMetadataModal
        item={editingMedia}
        firstName={editFirstName}
        relationship={editRelationship}
        birthYear={editBirthYear}
        note={editNote}
        year={editYear}
        isApproximate={editIsApproximate}
        saving={savingEdit}
        onChangeFirstName={setEditFirstName}
        onChangeRelationship={setEditRelationship}
        onChangeBirthYear={setEditBirthYear}
        onChangeNote={setEditNote}
        onChangeYear={setEditYear}
        onToggleApproximate={() => setEditIsApproximate((v) => !v)}
        onClose={() => setEditingMedia(null)}
        onSave={saveMetadataEdit}
      />
    </View>
  );
}

// ── QuizModeSelector ─────────────────────────────────────────────────────────

const ALL_QUIZ_MODES: { key: QuizMode; label: string }[] = [
  { key: 'NAME', label: 'Name' },
  { key: 'AGE', label: 'Age' },
  { key: 'RELATIONSHIP', label: 'Relationship' },
];

function QuizModeSelector({
  patientName,
  activeModes,
  identityCount,
  saving,
  onToggle,
}: {
  patientName: string;
  activeModes: QuizMode[];
  identityCount: number;
  saving: boolean;
  onToggle: (mode: QuizMode) => void;
}) {
  const setupComplete = identityCount >= 4;
  const progressWidth = `${Math.min(identityCount, 4) * 25}%` as DimensionValue;

  return (
    <View style={styles.quizSelectorWrapper}>
      <Text style={styles.quizSelectorLabel} numberOfLines={1}>
        Customize {patientName}'s quiz:
      </Text>
      <View style={styles.quizProgressBlock}>
        <View style={styles.quizProgressHeader}>
          <Text style={styles.quizProgressLabel}>{Math.min(identityCount, 4)}/4 faces verified</Text>
        </View>
        <View style={styles.quizProgressTrack}>
          <View style={[styles.quizProgressFill, { width: progressWidth }]} />
        </View>
      </View>
      <View style={styles.quizSelectorPills}>
        {ALL_QUIZ_MODES.map(({ key, label }) => {
          const active = activeModes.includes(key);
          const isLast = active && activeModes.length === 1;
          const disabled = saving || isLast || !setupComplete;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.quizPill,
                active && styles.quizPillActive,
                isLast && styles.quizPillLast,
                !setupComplete && styles.quizPillDisabled,
              ]}
              onPress={() => onToggle(key)}
              activeOpacity={0.75}
              disabled={disabled}
            >
              <Text style={[
                styles.quizPillText,
                active && styles.quizPillTextActive,
                !setupComplete && styles.quizPillTextDisabled,
              ]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
        {saving && <ActivityIndicator size="small" color={colors.secondary} style={{ marginLeft: 6 }} />}
      </View>
      {!setupComplete && (
        <Text style={styles.quizSetupWarning}>
          To start the quiz, please add at least 4 different people to the library. (Current: {identityCount}/4)
        </Text>
      )}
    </View>
  );
}

// ── YearHeader ────────────────────────────────────────────────────────────────

function YearHeader({ label }: { label: string }) {
  const decadeMatch = label.match(/^(\d+)(s)$/);

  return (
    <View style={styles.yearHeader}>
      <Text style={styles.yearHeaderText}>
        {decadeMatch ? (
          <>
            {decadeMatch[1]}
            <Text style={styles.yearHeaderSuffix}>{decadeMatch[2]}</Text>
          </>
        ) : (
          label
        )}
      </Text>
    </View>
  );
}

// ── MemoryTile ────────────────────────────────────────────────────────────────

function MemoryTile({
  item,
  tileSize = TILE_SIZE,
  seamless = false,
  editMode,
  isSelected,
  canDelete,
  isPrimary,
  onImageError,
  onPress,
  onLongPress,
}: {
  item: MediaTileVM;
  tileSize?: number;
  seamless?: boolean;
  editMode: boolean;
  isSelected: boolean;
  canDelete: boolean;
  isPrimary: boolean;
  onImageError?: () => void;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const tileStyle = { width: tileSize, height: tileSize };
  const baseTileStyle = [styles.tile, tileStyle, seamless && styles.tileSeamless];
  if (item.status !== 'READY') {
    return (
      <View style={[baseTileStyle, styles.tilePlaceholder]}>
        <ActivityIndicator size="small" color={colors.secondary} />
        <Text style={styles.tilePendingText}>Uploading…</Text>
      </View>
    );
  }
  if (item.urlError) {
    return (
      <View style={[baseTileStyle, styles.tilePlaceholder]}>
        <AppIcon iosName="exclamationmark.triangle" androidFallback="!" size={18} color="#C0392B" />
        <Text style={styles.tilePendingText}>Error</Text>
      </View>
    );
  }
  if (!item.signedUrl) {
    return (
      <View style={[baseTileStyle, styles.tilePlaceholder]}>
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
        baseTileStyle,
        isSelected && styles.tileSelected,
        editMode && !isSelectableInEdit && styles.tileDisabled,
      ]}
    >
      <Image source={{ uri: item.signedUrl }} style={styles.tileImage} resizeMode="cover" onError={onImageError} />

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
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    setImageFailed(false);
    setImageLoading(item?.kind === 'PHOTO' && !!item.signedUrl);
  }, [item?.publicId, item?.signedUrl]);

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

          {item.kind === 'PHOTO' && item.signedUrl && !imageFailed ? (
            <View style={styles.previewMediaImageFrame}>
              {imageLoading && (
                <View style={styles.previewImageLoading}>
                  <ActivityIndicator size="small" color={colors.secondary} />
                </View>
              )}
              <Image
                source={{ uri: item.signedUrl }}
                style={styles.previewMediaImage}
                resizeMode="contain"
                onError={() => setImageFailed(true)}
                onLoadEnd={() => setImageLoading(false)}
              />
            </View>
          ) : (
            <View style={styles.previewMediaFallback}>
              <AppIcon
                iosName={item.kind === 'AUDIO' ? 'waveform' : item.kind === 'VIDEO' ? 'video.fill' : 'doc.fill'}
                androidFallback={item.kind === 'AUDIO' ? 'Audio' : item.kind === 'VIDEO' ? 'Video' : 'File'}
                size={40}
                color={colors.secondary}
              />
            </View>
          )}

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

// ── MemoryFullscreenPreviewModal ──────────────────────────────────────────────

function MemoryFullscreenPreviewModal({
  item,
  onClose,
  onEdit,
}: {
  item: MediaTileVM | null;
  onClose: () => void;
  onEdit: (item: MediaTileVM) => void;
}) {
  const [imageLoading, setImageLoading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (item) {
      setImageLoading(true);
      setImageFailed(false);
    }
  }, [item?.publicId, item?.signedUrl]);

  if (!item) return null;

  const isPhoto = item.kind === 'PHOTO';
  const isVideo = item.kind === 'VIDEO';
  const yearLabel =
    item.eventYear != null
      ? item.isApproximateYear
        ? `~${item.eventYear}`
        : String(item.eventYear)
      : null;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.fsPreviewScreen}>
        {(isPhoto || isVideo) && item.signedUrl && !imageFailed ? (
          <>
            <ZoomableImage
              uri={item.signedUrl}
              onLoad={() => setImageLoading(false)}
              onError={() => { setImageLoading(false); setImageFailed(true); }}
            />
            {imageLoading && (
              <View style={styles.fsPreviewLoadingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
          </>
        ) : (
          <View style={styles.fsPreviewFallback}>
            <AppIcon
              iosName={
                imageFailed
                  ? 'exclamationmark.triangle'
                  : item.kind === 'AUDIO'
                  ? 'waveform'
                  : item.kind === 'VIDEO'
                  ? 'video.fill'
                  : 'doc.fill'
              }
              androidFallback={item.kind === 'AUDIO' ? '♪' : item.kind === 'VIDEO' ? '▶' : '📄'}
              size={56}
              color={colors.secondary}
            />
            <Text style={styles.fsPreviewKindLabel}>
              {imageFailed ? 'Could not load image' : item.kind.charAt(0) + item.kind.slice(1).toLowerCase()}
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.fsPreviewBackBtn} onPress={onClose} accessibilityLabel="Close">
          <AppIcon iosName="chevron.left" androidFallback="‹" size={28} color={colors.textDark} />
        </TouchableOpacity>

        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.72)']}
          style={styles.fsPreviewDetails}
        >
          {item.collection === 'QUIZ' ? (
            <>
              {!!item.firstName && <Text style={styles.fsPreviewName}>{item.firstName}</Text>}
              {!!item.relationshipType && (
                <Text style={styles.fsPreviewRelationship}>{item.relationshipType}</Text>
              )}
              {!!item.birthYear && (
                <Text style={styles.fsPreviewRelationship}>Born {item.birthYear}</Text>
              )}
            </>
          ) : (
            <>
              {!!yearLabel && <Text style={styles.fsPreviewYear}>{yearLabel}</Text>}
              {!!(item as any).memoryCategory && (
                <Text style={styles.fsPreviewCategory}>{(item as any).memoryCategory}</Text>
              )}
              {!!item.note && <Text style={styles.fsPreviewNote}>{item.note}</Text>}
            </>
          )}
          <TouchableOpacity style={styles.fsPreviewEditBtn} onPress={() => onEdit(item)}>
            <Text style={styles.fsPreviewEditText}>Edit Details</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </Modal>
  );
}

function EditMetadataModal({
  item,
  firstName,
  relationship,
  birthYear,
  note,
  year,
  isApproximate,
  saving,
  onChangeFirstName,
  onChangeRelationship,
  onChangeBirthYear,
  onChangeNote,
  onChangeYear,
  onToggleApproximate,
  onClose,
  onSave,
}: {
  item: MediaTileVM | null;
  firstName: string;
  relationship: string;
  birthYear: string;
  note: string;
  year: string;
  isApproximate: boolean;
  saving: boolean;
  onChangeFirstName: (value: string) => void;
  onChangeRelationship: (value: string) => void;
  onChangeBirthYear: (value: string) => void;
  onChangeNote: (value: string) => void;
  onChangeYear: (value: string) => void;
  onToggleApproximate: () => void;
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
              <TextInput
                style={styles.detailInput}
                value={birthYear}
                onChangeText={onChangeBirthYear}
                placeholder="Birth year"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={4}
              />
            </>
          ) : (
            <>
              <TextInput
                style={[styles.detailInput, styles.noteInput]}
                value={note}
                onChangeText={onChangeNote}
                placeholder="Descriptive note"
                placeholderTextColor={colors.textMuted}
                multiline
              />
              <TextInput
                style={styles.detailInput}
                value={year}
                onChangeText={onChangeYear}
                placeholder="Year (e.g. 1985) — optional"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={4}
              />
              <TouchableOpacity style={styles.approxRow} onPress={onToggleApproximate} activeOpacity={0.7}>
                <View style={[styles.approxCheckbox, isApproximate && styles.approxCheckboxActive]}>
                  {isApproximate && <Text style={styles.approxCheckmark}>✓</Text>}
                </View>
                <Text style={styles.approxLabel}>Approximate year</Text>
              </TouchableOpacity>
            </>
          )}
          <View style={styles.quizModalActions}>
            <TouchableOpacity style={styles.quizCancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.quizCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.quizSaveBtn, saving && styles.fabDisabled]} onPress={onSave} disabled={saving}>
              <Text style={styles.quizSaveText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
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
  memoryGrid: {
    paddingHorizontal: MEMORY_GRID_PADDING,
    paddingTop: 4,
    paddingBottom: 24,
  },
  gridRow: { gap: GRID_GUTTER, marginBottom: GRID_GUTTER },
  memoryGridRow: { flexDirection: 'row', gap: MEMORY_GRID_GAP, marginBottom: MEMORY_GRID_GAP },

  // Tiles
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: isIOS ? 10 : 14,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  tileSeamless: {
    borderRadius: 0,
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
  tileImage: { width: '100%', height: '100%', objectFit: 'cover' },
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
  modalScroll: {
    width: '100%',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 24,
  },
  quizModal: {
    width: '100%',
    maxHeight: '86%',
    borderRadius: 18,
    backgroundColor: colors.neutral,
    padding: 18,
    gap: 10,
  },
  guidanceModal: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: colors.neutral,
    padding: 18,
    gap: 14,
  },
  guidanceTips: {
    gap: 10,
  },
  guidanceTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 42,
  },
  guidanceIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(3,87,58,0.1)',
  },
  guidanceIconError: {
    backgroundColor: 'rgba(192,57,43,0.1)',
  },
  guidanceTipText: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textDark,
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
  verificationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(3,87,58,0.16)',
    backgroundColor: 'rgba(255,255,255,0.72)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  verificationBoxSuccess: {
    backgroundColor: 'rgba(167,215,197,0.32)',
  },
  verificationText: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.secondary,
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
  previewMediaImageFrame: {
    width: '100%',
    height: Math.min(SCREEN_WIDTH * 0.72, 360),
    alignSelf: 'center',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.neutral,
  },
  previewMediaImage: {
    width: '100%',
    height: '100%',
  },
  previewImageLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewMediaFallback: {
    width: '100%',
    height: 160,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
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

  // Year group header (MEMORY timeline)
  yearHeader: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 20,
    paddingBottom: 8,
  },
  yearHeaderText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  yearHeaderSuffix: {
    fontSize: 10,
  },

  // Approximate year toggle
  approxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  approxCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.15)',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  approxCheckboxActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  approxCheckmark: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 13,
    color: '#fff',
  },
  approxLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textDark,
  },

  // Full-screen media preview modal
  fullPreviewBackdrop: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullPreviewClose: {
    position: 'absolute',
    top: isIOS ? 56 : 20,
    right: 18,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullPreviewScroll: {
    flex: 1,
  },
  fullPreviewContent: {
    flexGrow: 1,
  },
  fullPreviewImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    backgroundColor: '#111',
  },
  fullPreviewMediaFallback: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.6,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  fullPreviewKindLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: '#aaa',
  },
  fullPreviewDetails: {
    backgroundColor: colors.neutral,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
    padding: 24,
    paddingBottom: 48,
    gap: 8,
  },
  fullPreviewYear: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 26,
    color: colors.primary,
  },
  fullPreviewCategory: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fullPreviewNote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 16,
    color: colors.textDark,
    lineHeight: 24,
  },
  fullPreviewName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 22,
    color: colors.textDark,
  },
  fullPreviewRelationship: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 16,
    color: colors.textMuted,
  },
  fullPreviewMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  fullPreviewUploaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  fullPreviewUploader: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: colors.textMuted,
  },

  // Quiz mode selector
  quizSelectorWrapper: {
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 16,
    marginBottom: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  quizSelectorLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  quizSelectorPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  quizProgressBlock: {
    gap: 6,
  },
  quizProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quizProgressLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.primary,
  },
  quizProgressTrack: {
    height: 7,
    borderRadius: 50,
    backgroundColor: 'rgba(3, 87, 58, 0.14)',
    overflow: 'hidden',
  },
  quizProgressFill: {
    height: '100%',
    borderRadius: 50,
    backgroundColor: colors.primary,
  },
  quizPill: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 50,
    backgroundColor: colors.neutral,
    borderWidth: 1.5,
    borderColor: colors.secondary,
  },
  quizPillActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  quizPillLast: {
    opacity: 0.5,
  },
  quizPillDisabled: {
    backgroundColor: '#E1E1E1',
    borderColor: '#C7C7C7',
    opacity: 0.7,
  },
  quizPillText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.secondary,
  },
  quizPillTextActive: {
    color: '#fff',
  },
  quizPillTextDisabled: {
    color: '#777777',
  },
  quizSetupWarning: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.primary,
    lineHeight: 19,
  },

  // Fullscreen memory preview (mirrors relive tab layout)
  fsPreviewScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  fsPreviewImage: {
    width: '100%',
    height: '100%',
  },
  fsPreviewLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  fsPreviewFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.neutral,
  },
  fsPreviewKindLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
  fsPreviewBackBtn: {
    position: 'absolute',
    top: isIOS ? 56 : 20,
    left: 18,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsPreviewDetails: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: isIOS ? 44 : 28,
    gap: 5,
  },
  fsPreviewName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 22,
    color: '#fff',
  },
  fsPreviewRelationship: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
  },
  fsPreviewYear: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: '#fff',
  },
  fsPreviewCategory: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fsPreviewNote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 22,
    marginTop: 2,
  },
  fsPreviewEditBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  fsPreviewEditText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: '#fff',
  },
});


