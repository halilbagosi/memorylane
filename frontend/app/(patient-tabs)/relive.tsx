import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { LinearGradient } from 'expo-linear-gradient';
import { AppIcon } from '../../src/components/AppIcon';
import { ZoomableImage } from '../../src/components/ZoomableImage';
import { getPatientInfo, PatientInfo } from '../../src/utils/auth';
import { getPatientTimeline, type TimelineItem } from '../../src/services/media';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_COLUMNS = 3;
const GRID_GAP = 2;
const TILE_SIZE = (SCREEN_WIDTH - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

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
  const insets = useSafeAreaInsets();
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL');
  const [preview, setPreview] = useState<TimelineItem | null>(null);
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
  const openPreview = useCallback((item: TimelineItem) => setPreview(item), []);
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
          <ActivityIndicator size="large" color={colors.primary} />
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
              color={colors.primary}
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
        item={preview}
        imageFailed={preview ? imageFailedIds.has(preview.publicId) : false}
        onImageError={preview ? () => handleImageLoadError(preview.publicId) : undefined}
        onClose={() => setPreview(null)}
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
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
        </>
      ) : (
        <View style={styles.gridMediaFallback}>
          <AppIcon
            iosName={item.kind === 'AUDIO' ? 'waveform' : 'doc.fill'}
            androidFallback={item.kind === 'AUDIO' ? '♪' : '📄'}
            size={24}
            color={colors.primary}
          />
        </View>
      )}
      {isVideo && (
        <View style={styles.videoBadge}>
          <AppIcon iosName="play.fill" androidFallback="▶" size={10} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
});

// ── MemoryPreviewModal ────────────────────────────────────────────────────────

function MemoryPreviewModal({
  item,
  imageFailed,
  onImageError,
  onClose,
}: {
  item: TimelineItem | null;
  imageFailed: boolean;
  onImageError?: () => void;
  onClose: () => void;
}) {
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    if (item) setImageLoading(true);
  }, [item?.publicId]);

  if (!item) return null;

  const isPhoto = item.kind === 'PHOTO';
  const isVideo = item.kind === 'VIDEO';
  const yearLabel = item.eventYear !== null
    ? (item.isApproximateYear ? `~${item.eventYear}` : String(item.eventYear))
    : null;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.previewScreen}>
          {(isPhoto || isVideo) && !imageFailed && (
            <>
              <ZoomableImage
                uri={item.downloadUrl}
                onLoad={() => setImageLoading(false)}
                onError={() => { setImageLoading(false); onImageError?.(); }}
              />
              {imageLoading && (
                <View style={styles.previewLoadingOverlay}>
                  <ActivityIndicator size="large" color="#fff" />
                </View>
              )}
            </>
          )}
          {((!isPhoto && !isVideo) || imageFailed) && (
            <View style={styles.previewFullscreenFallback}>
              <AppIcon
                iosName={imageFailed ? 'exclamationmark.triangle' : item.kind === 'AUDIO' ? 'waveform' : 'doc.fill'}
                androidFallback={item.kind === 'AUDIO' ? '♪' : '📄'}
                size={56}
                color={colors.primary}
              />
              <Text style={styles.previewKindLabel}>
                {imageFailed ? 'Could not load image' : item.kind.charAt(0) + item.kind.slice(1).toLowerCase()}
              </Text>
            </View>
          )}
        <TouchableOpacity style={styles.previewBackBtn} onPress={onClose} accessibilityLabel="Back to memories">
          <AppIcon iosName="chevron.left" androidFallback="Back" size={28} color={colors.textDark} />
        </TouchableOpacity>

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
          <TouchableOpacity style={styles.previewCloseBtn} onPress={onClose}>
            <AppIcon iosName="xmark" androidFallback="✕" size={14} color={colors.textDark} />
          </TouchableOpacity>
        </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral,
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
    color: colors.textDark,
  },
  subtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: '#fff',
  },

  // Filter chips
  filterRow: { flexGrow: 0, marginBottom: 12, paddingHorizontal: 24 },
  filterContent: { gap: 8, paddingRight: 32 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  chipTextActive: { color: '#fff' },

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
    backgroundColor: 'rgba(30,77,48,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: colors.textDark,
  },
  emptyBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: '#C0392B',
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  retryBtnText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: '#fff',
  },

  // List
  listContent: {
    paddingBottom: 100,
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
    color: colors.textMuted,
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
    overflow: 'hidden',
    backgroundColor: '#f3f3f3',
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
    backgroundColor: '#f3f3f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridMediaFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(30,77,48,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    backgroundColor: colors.neutral,
  },
  previewBackBtn: {
    position: 'absolute',
    top: 52,
    left: 18,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  previewCard: {
    width: '100%',
    maxHeight: '88%',
    borderRadius: 22,
    backgroundColor: '#fff',
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
    backgroundColor: 'rgba(30,77,48,0.06)',
  },
  previewKindLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
  previewMeta: {
    padding: 18,
    gap: 6,
  },
  previewYear: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: '#fff',
  },
  previewCategory: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewNote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 22,
    marginTop: 2,
  },
  previewCloseBtn: {
    display: 'none',
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
