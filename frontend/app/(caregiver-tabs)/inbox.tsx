import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Platform, Image,
  Animated, PanResponder, TextInput, Modal, TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from 'expo-router';
import { CommonActions } from '@react-navigation/native';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { API_BASE_URL } from '../../src/config/api';
import { getToken, getCaregiverInfo, saveCaregiverInfo, clearAuth, CaregiverInfo } from '../../src/utils/auth';
import { AppIcon } from '../../src/components/AppIcon';
import { CaregiverAvatarButton } from '../../src/components/CaregiverAvatarButton';
import { ManageDeletionSheet } from '../../src/components/ManageDeletionSheet';

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
  declineReason?: string | null;
  createdAt: string;
  readAt: string | null;
}

// ─── Swipeable row ────────────────────────────────────────────────────────────

const DELETE_THRESHOLD = -72;

function SwipeableRow({
  onDelete,
  children,
  closeOthers,
  onBecomeActive,
}: {
  onDelete: () => void;
  children: React.ReactNode;
  closeOthers: () => void;
  onBecomeActive: (fn: () => void) => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;

  // Stable refs so PanResponder callbacks (created once) always call latest functions
  const closeOthersRef = useRef(closeOthers);
  const onBecomeActiveRef = useRef(onBecomeActive);
  closeOthersRef.current = closeOthers;
  onBecomeActiveRef.current = onBecomeActive;

  const snapBack = useRef(() => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
  });

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderGrant: () => {
        closeOthersRef.current();
        onBecomeActiveRef.current(snapBack.current);
      },
      onPanResponderMove: (_, gs) => {
        const clamped = Math.min(0, Math.max(gs.dx, -96));
        translateX.setValue(clamped);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < DELETE_THRESHOLD) {
          Animated.spring(translateX, { toValue: -72, useNativeDriver: true }).start();
        } else {
          snapBack.current();
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

// ─── Parse decline reason embedded in notification body ──────────────────────

function parseDeclineReason(body: string): { baseText: string; reason: string | null } {
  // Handles "Reason:", "reason:", "\nReason:", and quoted variants from older/newer backends.
  const match = body.match(/^([\s\S]*?)(?:[\s.]*\bReason\b\s*(?:[:：]|["'“”]))\s*([\s\S]+)$/i);
  if (!match) return { baseText: body.trim(), reason: null };

  const baseText = match[1].trim().replace(/\s+$/, '');
  const reason = match[2].trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();

  return {
    baseText: /[.!?]$/.test(baseText) ? baseText : `${baseText}.`,
    reason: reason || null,
  };
}

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
  const navigation = useNavigation();

  const [token, setToken] = useState<string | null>(null);
  const [caregiver, setCaregiver] = useState<CaregiverInfo | null>(null);
  const [incoming, setIncoming] = useState<DelegationRequest[]>([]);
  const [roleRequests, setRoleRequests] = useState<RoleRequest[]>([]);
  const [notifications, setNotifications] = useState<BackendNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Inline decline-with-reason expansion
  const [declineExpanded, setDeclineExpanded] = useState<{
    requestId: string;
    type: 'delegation' | 'role';
    reason: string;
  } | null>(null);

  const [deletionSheetVisible, setDeletionSheetVisible] = useState(false);
  const [declineReasonModal, setDeclineReasonModal] = useState<{ reason: string; baseText: string } | null>(null);
  const [hasActiveDelegations, setHasActiveDelegations] = useState(false);

  // One-at-a-time swipe: track which row is open and snap it closed when another starts
  const closeActiveSwipeRef = useRef<(() => void) | null>(null);
  const closeCurrentSwipe = () => {
    closeActiveSwipeRef.current?.();
    closeActiveSwipeRef.current = null;
  };
  const registerActiveSwipe = (fn: () => void) => {
    closeActiveSwipeRef.current = fn;
  };

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

  const fetchDelegationStatus = async (tok: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/deletion-status`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) { setHasActiveDelegations(false); return; }
      const data = await res.json();
      const total = (data.patients ?? []).length;
      setHasActiveDelegations(total > 0);
    } catch { setHasActiveDelegations(false); }
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
    await Promise.all([fetchIncoming(tok), fetchRoleRequests(tok), fetchNotifications(tok), refreshCaregiverStatus(tok), fetchDelegationStatus(tok)]);
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

  const respond = async (requestId: string, action: 'accept' | 'decline', reason?: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/auth/delegation-requests/${requestId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: action === 'decline' ? JSON.stringify({ reason: reason ?? '' }) : undefined,
      });
      if (res.ok) {
        if (action === 'accept') {
          setIncoming(prev => prev.map(r => r.id === requestId ? { ...r, accepted: true } : r));
        } else {
          setIncoming(prev => prev.map(r => r.id === requestId ? { ...r, declined: true } : r));
        }
        if (token) fetchNotifications(token);
      }
    } catch { /* silent */ }
  };

  const respondToRoleRequest = async (requestId: string, action: 'approve' | 'decline', reason?: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/auth/role-requests/${requestId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: action === 'decline' ? JSON.stringify({ reason: reason ?? '' }) : undefined,
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
        <View style={styles.headerLeft}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>Inbox</Text>
            {totalCount > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{totalCount}</Text>
              </View>
            )}
          </View>
          <Text style={styles.headerSubtitle}>Requests & notifications</Text>
        </View>
        <CaregiverAvatarButton />
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
          contentContainerStyle={styles.listContent}
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
                ) : declineExpanded?.requestId === req.id ? (
                  <>
                    <Text style={styles.rowSub}>Please provide a reason for declining:</Text>
                    <TextInput
                      style={styles.declineReasonInput}
                      placeholder="Reason for declining…"
                      placeholderTextColor={colors.textMuted}
                      value={declineExpanded.reason}
                      onChangeText={(text) => setDeclineExpanded(prev => prev ? { ...prev, reason: text } : null)}
                      multiline
                      numberOfLines={3}
                      autoFocus
                    />
                    <View style={styles.rowActions}>
                      <TouchableOpacity
                        style={styles.declineBtn}
                        onPress={() => setDeclineExpanded(null)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.declineBtnText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.acceptBtn, { backgroundColor: '#C0392B' }]}
                        onPress={() => {
                          setIncoming(prev => prev.map(r => r.id === req.id ? { ...r, declined: true } : r));
                          respond(req.id, 'decline', declineExpanded.reason);
                          setDeclineExpanded(null);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.acceptBtnText}>Send Decline</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.rowSub}>Role transfer request</Text>
                    <View style={styles.rowActions}>
                      <TouchableOpacity
                        style={styles.declineBtn}
                        onPress={() => setDeclineExpanded({ requestId: req.id, type: 'delegation', reason: '' })}
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
                ) : declineExpanded?.requestId === req.id ? (
                  <>
                    <Text style={styles.rowSub}>Please provide a reason for declining:</Text>
                    <TextInput
                      style={styles.declineReasonInput}
                      placeholder="Reason for declining…"
                      placeholderTextColor={colors.textMuted}
                      value={declineExpanded.reason}
                      onChangeText={(text) => setDeclineExpanded(prev => prev ? { ...prev, reason: text } : null)}
                      multiline
                      numberOfLines={3}
                      autoFocus
                    />
                    <View style={styles.rowActions}>
                      <TouchableOpacity
                        style={styles.declineBtn}
                        onPress={() => setDeclineExpanded(null)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.declineBtnText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.acceptBtn, { backgroundColor: '#C0392B' }]}
                        onPress={() => {
                          setRoleRequests(prev => prev.map(r => r.id === req.id ? { ...r, declined: true } : r));
                          respondToRoleRequest(req.id, 'decline', declineExpanded.reason);
                          setDeclineExpanded(null);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.acceptBtnText}>Send Decline</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.rowSub}>Role request</Text>
                    <View style={styles.rowActions}>
                      <TouchableOpacity
                        style={styles.declineBtn}
                        onPress={() => setDeclineExpanded({ requestId: req.id, type: 'role', reason: '' })}
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

          {/* ── Backend notifications ── */}
          {notifications.map((notif) => {
            const isTappable = notif.type === 'DELEGATION_ACCEPTED' && hasActiveDelegations;
            const isUnread = !notif.readAt;
            const isDeclineNotif = notif.type === 'DELEGATION_DECLINED' || notif.type === 'ROLE_REQUEST_DECLINED';
            const parsedDecline = isDeclineNotif
              ? parseDeclineReason(notif.body)
              : { baseText: notif.body, reason: null };
            const baseText = parsedDecline.baseText;
            const reason = notif.declineReason?.trim() || parsedDecline.reason;
            // Info icon sits inside the body (next to the title) so it never conflicts with the right-edge swipe zone
            const rowContent = (
              <View style={[styles.row, isUnread && styles.rowUnread]}>
                <View style={[styles.rowDot, { backgroundColor: dotColor(notif.type) }]} />
                <View style={styles.rowBody}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={[styles.rowBold, isUnread && styles.rowBoldUnread]}>{notif.title}</Text>
                    {isTappable && (
                      <AppIcon iosName="info.circle.fill" androidFallback="ⓘ" size={13} color={colors.secondary} />
                    )}
                    {isDeclineNotif && !!reason && (
                      <TouchableOpacity
                        onPress={() => setDeclineReasonModal({
                          reason: reason,
                          baseText,
                        })}
                        activeOpacity={0.6}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <AppIcon iosName="info.circle.fill" androidFallback="ⓘ" size={15} color="#C0392B" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={[styles.rowTitle, { marginTop: 2 }]}>{baseText}</Text>
                  <Text style={styles.rowSub}>{new Date(notif.createdAt).toLocaleDateString()}</Text>
                </View>
                {isTappable && (
                  <View style={{ paddingTop: 3, opacity: 0.5 }}>
                    <AppIcon iosName="chevron.right" androidFallback="›" size={14} color={colors.textMuted} />
                  </View>
                )}
              </View>
            );
            return (
              <SwipeableRow
                key={notif.id}
                onDelete={() => deleteNotification(notif.id)}
                closeOthers={closeCurrentSwipe}
                onBecomeActive={registerActiveSwipe}
              >
                {isTappable ? (
                  <TouchableOpacity activeOpacity={0.7} onPress={() => setDeletionSheetVisible(true)}>
                    {rowContent}
                  </TouchableOpacity>
                ) : rowContent}
              </SwipeableRow>
            );
          })}
        </ScrollView>
      )}
      {/* Decline Reason Modal */}
      <Modal
        visible={!!declineReasonModal}
        transparent
        animationType="fade"
        onRequestClose={() => setDeclineReasonModal(null)}
      >
        <TouchableWithoutFeedback onPress={() => setDeclineReasonModal(null)}>
          <View style={styles.reasonModalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.reasonModalCard}>
                <Text style={styles.reasonModalTitle}>Reason for Declining</Text>
                <Text style={styles.reasonModalContext}>{declineReasonModal?.baseText}</Text>
                <View style={styles.reasonModalQuote}>
                  <Text style={styles.reasonModalQuoteText}>{declineReasonModal?.reason}</Text>
                </View>
                <TouchableOpacity style={styles.reasonModalOkBtn} onPress={() => setDeclineReasonModal(null)} activeOpacity={0.7}>
                  <Text style={styles.reasonModalOkText}>OK</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Deletion Management Bottom Sheet */}
      <ManageDeletionSheet
        visible={deletionSheetVisible}
        onClose={() => setDeletionSheetVisible(false)}
        onDeleted={() => {
          navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }));
        }}
        onCancelled={async () => {
          setDeletionSheetVisible(false);
          if (token) {
            const res = await fetch(`${API_BASE_URL}/auth/me`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const fresh = await res.json();
              setCaregiver(fresh);
              await saveCaregiverInfo(fresh);
            }
          }
        }}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.neutral },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
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

  listContent: {
    paddingBottom: 100,
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

  // Decline reason modal
  reasonModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  reasonModalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  reasonModalTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 17,
    color: colors.textDark,
    marginBottom: 6,
  },
  reasonModalContext: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 14,
    lineHeight: 18,
  },
  reasonModalQuote: {
    backgroundColor: 'rgba(192,57,43,0.12)',
    borderLeftWidth: 4,
    borderLeftColor: '#C0392B',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(192,57,43,0.22)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
    minHeight: 48,
    justifyContent: 'center',
  },
  reasonModalQuoteText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: '#C0392B',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  reasonModalOkBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.secondary,
  },
  reasonModalOkText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: '#fff',
  },

  // Inline decline reason input
  declineReasonInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textDark,
    backgroundColor: isIOS ? 'rgba(255,255,255,0.7)' : '#FFFFFF',
    minHeight: 72,
    textAlignVertical: 'top',
  },

  // Deletion sheet styles
  delSheet: { padding: 24, paddingTop: 8 },
  delTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: colors.textDark,
    marginBottom: 8,
  },
  delBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 16,
  },
  delSectionLabel: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  delList: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: isIOS ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.03)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.07)',
    marginBottom: 14,
  },
  delRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  delAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(45,79,62,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  delAvatarText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: colors.secondary,
  },
  delName: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: colors.textDark,
  },
  delRowSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  delReason: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: '#C0392B',
    fontStyle: 'italic',
    marginTop: 2,
  },

});

