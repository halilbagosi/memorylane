import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Platform, Image,
  Animated, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, useNavigation } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { API_BASE_URL } from '../../src/config/api';
import { getToken, getCaregiverInfo, saveCaregiverInfo, CaregiverInfo } from '../../src/utils/auth';
import { AppIcon } from '../../src/components/AppIcon';

const isIOS = Platform.OS === 'ios';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DelegationRequest {
  id: string;
  patient: { id: string; name: string; surname: string };
  fromCaregiver: { id: string; name: string; surname: string; avatarUrl?: string | null };
  createdAt: string;
  accepted?: boolean;  // local-only: marked after accepting
  declined?: boolean;  // local-only: marked after declining
}

interface RoleRequest {
  id: string;
  patient: { id: string; name: string; surname: string };
  requester: { id: string; name: string; surname: string; avatarUrl?: string | null };
  createdAt: string;
  approved?: boolean;
  declined?: boolean;
}

interface BackendNotification {
  id: string;
  type: 'SECONDARY_ADDED' | 'DEVICE_PAIRED' | 'PATIENT_DELETED' | 'DELEGATION_ACCEPTED' | 'DELEGATION_DECLINED' | 'DELEGATION_CANCELLED' | 'DELEGATION_COMPLETED' | 'ROLE_REQUEST_RECEIVED' | 'ROLE_REQUEST_APPROVED' | 'ROLE_REQUEST_DECLINED';
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

// ─── Swipeable row ────────────────────────────────────────────────────────────

const DELETE_THRESHOLD = -72;

function SwipeableRow({ onDelete, children }: { onDelete: () => void; children: React.ReactNode }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const revealed = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderMove: (_, gs) => {
        const clamped = Math.min(0, Math.max(gs.dx, -96));
        translateX.setValue(clamped);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < DELETE_THRESHOLD) {
          Animated.spring(translateX, { toValue: -72, useNativeDriver: true }).start();
          revealed.current = true;
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
          revealed.current = false;
        }
      },
    })
  ).current;

  return (
    <View style={{ overflow: 'hidden' }}>
      {/* Delete action underneath */}
      <View style={swipeStyles.deleteUnder}>
        <TouchableOpacity onPress={onDelete} style={swipeStyles.deleteBtn} activeOpacity={0.8}>
          <AppIcon iosName="trash" androidFallback="✕" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
      {/* Draggable content */}
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  deleteUnder: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 72,
    backgroundColor: '#c0392b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// ─── Dot colors ───────────────────────────────────────────────────────────────

function dotColor(type: BackendNotification['type'] | 'delegation-pending'): string {
  switch (type) {
    case 'DELEGATION_ACCEPTED': return '#2d6a4f';
    case 'DELEGATION_DECLINED': return '#c0392b';
    case 'DELEGATION_CANCELLED': return '#7a6f63';
    case 'DELEGATION_COMPLETED': return '#2d6a4f';
    case 'SECONDARY_ADDED': return '#2980b9';
    case 'DEVICE_PAIRED': return '#8e44ad';
    case 'PATIENT_DELETED': return '#c0392b';
    case 'delegation-pending': return '#b8860b';
    case 'ROLE_REQUEST_RECEIVED': return '#2D4F3E';
    case 'ROLE_REQUEST_APPROVED': return '#2d6a4f';
    case 'ROLE_REQUEST_DECLINED': return '#7a6f63';
    default: return '#999';
  }
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function InboxTab() {
  const router = useRouter();
  const navigation = useNavigation();

  const [token, setToken] = useState<string | null>(null);
  const [caregiver, setCaregiver] = useState<CaregiverInfo | null>(null);
  const [incoming, setIncoming] = useState<DelegationRequest[]>([]);
  const [roleRequests, setRoleRequests] = useState<RoleRequest[]>([]);
  const [notifications, setNotifications] = useState<BackendNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ─── Init ─────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    (async () => {
      const tok = await getToken();
      const cg = await getCaregiverInfo();
      if (tok) { setToken(tok); setCaregiver(cg); }
    })();
  }, []);

  // ─── Fetchers ─────────────────────────────────────────────────────────────

  const fetchIncoming = async (tok: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/delegation-requests/incoming`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data: DelegationRequest[] = await res.json();
        setIncoming(prev => {
          // preserve local accepted/declined flags across refreshes
          const respondedMap = new Map(
            prev.filter(r => r.accepted || r.declined).map(r => [r.id, r])
          );
          const freshIds = new Set(data.map(r => r.id));
          const fresh = data.map(r => {
            const responded = respondedMap.get(r.id);
            return responded ? { ...r, accepted: responded.accepted, declined: responded.declined } : r;
          });
          // keep cards that were responded to even if backend dropped them
          const kept = [...respondedMap.values()].filter(r => !freshIds.has(r.id));
          return [...fresh, ...kept];
        });
      }
    } catch { /* silent */ }
  };

  const fetchRoleRequests = async (tok: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/role-requests/incoming`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data: RoleRequest[] = await res.json();
        setRoleRequests(prev => {
          // preserve local approved/declined flags across refreshes
          const respondedMap = new Map(
            prev.filter(r => r.approved || r.declined).map(r => [r.id, r])
          );
          const freshIds = new Set(data.map(r => r.id));
          const fresh = data.map(r => {
            const responded = respondedMap.get(r.id);
            return responded ? { ...r, approved: responded.approved, declined: responded.declined } : r;
          });
          // keep cards that were responded to even if backend dropped them
          const kept = [...respondedMap.values()].filter(r => !freshIds.has(r.id));
          return [...fresh, ...kept];
        });
      }
    } catch { /* silent */ }
  };

  const fetchNotifications = async (tok: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/notifications`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) setNotifications(await res.json());
    } catch { /* silent */ }
  };

  const refreshCaregiverStatus = async (tok: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const fresh = await res.json();
        setCaregiver(fresh);
        await saveCaregiverInfo(fresh);
      }
    } catch { /* silent */ }
  };

  const markAllRead = async (tok: string) => {
    try {
      await fetch(`${API_BASE_URL}/auth/notifications/mark-all-read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tok}` },
      });
    } catch { /* silent */ }
  };

  const loadAll = async (tok: string, cg: CaregiverInfo | null) => {
    await Promise.all([fetchIncoming(tok), fetchRoleRequests(tok), fetchNotifications(tok), refreshCaregiverStatus(tok)]);
    // Mark all notifications read after they are displayed
    await markAllRead(tok);
    // Update local state so badge clears immediately
    setNotifications(prev => prev.map(n => n.readAt ? n : { ...n, readAt: new Date().toISOString() }));
    setIsLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      if (token) loadAll(token, caregiver);
    }, [token, caregiver])
  );

  const onRefresh = () => {
    setRefreshing(true);
    if (token) loadAll(token, caregiver);
  };

  // ─── Actions ──────────────────────────────────────────────────────────────

  const respond = async (requestId: string, action: 'accept' | 'decline') => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/auth/delegation-requests/${requestId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        if (action === 'accept') {
          setIncoming(prev => prev.map(r => r.id === requestId ? { ...r, accepted: true } : r));
        } else {
          setIncoming(prev => prev.map(r => r.id === requestId ? { ...r, declined: true } : r));
        }
        // Refresh notifications so any new DELEGATION_ACCEPTED/DECLINED notif appears
        if (token) fetchNotifications(token);
      }
    } catch { /* silent */ }
  };

  const respondToRoleRequest = async (requestId: string, action: 'approve' | 'decline') => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/auth/role-requests/${requestId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setRoleRequests(prev => prev.map(r =>
          r.id === requestId
            ? { ...r, approved: action === 'approve', declined: action === 'decline' }
            : r
        ));
        if (token) fetchNotifications(token);
      }
    } catch { /* silent */ }
  };

  const deleteNotification = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/auth/notifications/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setNotifications(prev => prev.filter(n => n.id !== id));
    } catch { /* silent */ }
  };

  // ─── Badge ────────────────────────────────────────────────────────────────

  const pendingCount = incoming.filter(r => !r.accepted && !r.declined).length;
  const pendingRoleRequestCount = roleRequests.filter(r => !r.approved && !r.declined).length;
  const unreadNotifCount = notifications.filter(n => !n.readAt).length;
  const totalCount = pendingCount + pendingRoleRequestCount + unreadNotifCount;

  React.useEffect(() => {
    navigation.setOptions({
      // iOS NativeTabs: empty string renders a native dot (no number) — Zen style
      // Android M3TabBar: numeric count
      tabBarBadge: totalCount > 0
        ? (isIOS ? ' ' : totalCount)
        : undefined,
    });
  }, [totalCount]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const hasContent = incoming.length > 0 || roleRequests.length > 0 || notifications.length > 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Inbox</Text>
        {totalCount > 0 && (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{totalCount}</Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !hasContent ? (
        <View style={styles.centered}>
          <View style={styles.emptyIcon}>
            <AppIcon iosName="tray" androidFallback="—" size={28} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptyDesc}>No pending requests or notifications.</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* ── Incoming delegation requests ── */}
          {incoming.map((req) => (
            <View key={req.id} style={styles.row}>
              <View style={[styles.rowDot, { backgroundColor: req.accepted ? '#4A7A5A' : req.declined ? '#6B6455' : dotColor('delegation-pending') }]} />
              <View style={styles.rowAvatar}>
                {req.fromCaregiver.avatarUrl ? (
                  <Image source={{ uri: req.fromCaregiver.avatarUrl }} style={styles.rowAvatarImg} />
                ) : (
                  <View style={styles.rowAvatarPlaceholder}>
                    <Text style={styles.rowAvatarText}>
                      {req.fromCaregiver.name[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>
                  <Text style={styles.rowBold}>
                    {req.fromCaregiver.name} {req.fromCaregiver.surname}
                  </Text>
                  {req.accepted || req.declined ? ' · care for ' : ' wants you to take over care for '}
                  <Text style={styles.rowBold}>
                    {req.patient.name} {req.patient.surname}
                  </Text>
                </Text>
                {req.accepted ? (
                  <View style={styles.acceptedTag}>
                    <Text style={styles.acceptedTagText}>Accepted</Text>
                  </View>
                ) : req.declined ? (
                  <View style={styles.declinedTag}>
                    <Text style={styles.declinedTagText}>Declined</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.rowSub}>Role transfer request</Text>
                    <View style={styles.rowActions}>
                      <TouchableOpacity
                        style={styles.declineBtn}
                        onPress={() => respond(req.id, 'decline')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.declineBtnText}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.acceptBtn}
                        onPress={() => respond(req.id, 'accept')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.acceptBtnText}>Accept</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </View>
          ))}

          {/* ── Incoming role requests (Primary Status requests) ── */}
          {roleRequests.map((req) => (
            <View key={req.id} style={styles.row}>
              <View style={[styles.rowDot, { backgroundColor: req.approved ? '#4A7A5A' : req.declined ? '#6B6455' : '#2D4F3E' }]} />
              <View style={styles.rowAvatar}>
                {req.requester.avatarUrl ? (
                  <Image source={{ uri: req.requester.avatarUrl }} style={styles.rowAvatarImg} />
                ) : (
                  <View style={styles.rowAvatarPlaceholder}>
                    <Text style={styles.rowAvatarText}>{req.requester.name[0]?.toUpperCase()}</Text>
                  </View>
                )}
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>
                  <Text style={styles.rowBold}>{req.requester.name} {req.requester.surname}</Text>
                  {req.approved || req.declined ? ' · Primary Status for ' : ' wants to become the Primary for '}
                  <Text style={styles.rowBold}>{req.patient.name} {req.patient.surname}</Text>
                </Text>
                {req.approved ? (
                  <View style={styles.acceptedTag}>
                    <Text style={styles.acceptedTagText}>Approved</Text>
                  </View>
                ) : req.declined ? (
                  <View style={styles.declinedTag}>
                    <Text style={styles.declinedTagText}>Declined</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.rowSub}>Role request</Text>
                    <View style={styles.rowActions}>
                      <TouchableOpacity
                        style={styles.declineBtn}
                        onPress={() => respondToRoleRequest(req.id, 'decline')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.declineBtnText}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.acceptBtn}
                        onPress={() => respondToRoleRequest(req.id, 'approve')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.acceptBtnText}>Approve</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </View>
          ))}

          {/* ── Backend notifications (swipe-to-delete) ── */}
          {notifications.map((notif) => {
            // DELEGATION_ACCEPTED is only tappable while deletion is still in progress
            const isPendingDeletion = caregiver?.status === 'PENDING_DELETION';
            const isTappable = notif.type === 'DELEGATION_ACCEPTED' && isPendingDeletion;
            const isUnread = !notif.readAt;
            const row = (
              <View style={[styles.row, isUnread && styles.rowUnread]}>
                <View style={[styles.rowDot, { backgroundColor: dotColor(notif.type) }]} />
                <View style={styles.rowBody}>
                  <Text style={[styles.rowBold, isUnread && styles.rowBoldUnread]}>{notif.title}</Text>
                  <Text style={[styles.rowTitle, { marginTop: 2 }]}>{notif.body}</Text>
                  <Text style={styles.rowSub}>{new Date(notif.createdAt).toLocaleDateString()}</Text>
                </View>
                {isTappable && (
                  <AppIcon iosName="chevron.right" androidFallback="›" size={14} color={colors.textMuted} style={{ paddingTop: 3, opacity: 0.5 }} />
                )}
              </View>
            );
            return (
              <SwipeableRow key={notif.id} onDelete={() => deleteNotification(notif.id)}>
                {isTappable ? (
                  <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/account?openDeletion=1')}>
                    {row}
                  </TouchableOpacity>
                ) : row}
              </SwipeableRow>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.neutral },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  headerTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 26,
    color: colors.textDark,
  },
  headerBadge: {
    backgroundColor: colors.secondary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  headerBadgeText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 11,
    color: '#fff',
  },

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.neutralLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 17,
    color: colors.textDark,
    marginBottom: 6,
  },
  emptyDesc: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 40,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.neutral,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.07)',
    gap: 10,
  },
  rowUnread: {
    backgroundColor: '#ECEADC',
  },
  rowBoldUnread: {
    color: colors.textDark,
  },
  rowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  rowAvatar: { flexShrink: 0 },
  rowAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  rowAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowAvatarText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.textLight,
  },
  rowBody: { flex: 1 },
  rowTitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  rowBold: {
    fontFamily: typography.fontFamily.bold,
    color: colors.textDark,
  },
  rowSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 3,
    opacity: 0.7,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  declineBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  declineBtnText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  acceptBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.secondary,
  },
  acceptBtnText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: '#fff',
  },
  acceptedTag: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#D8E8D8',
  },
  acceptedTagText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: '#4A7A5A',
  },
  declinedTag: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#E2DFCF',
  },
  declinedTagText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: '#6B6455',
  },
});
