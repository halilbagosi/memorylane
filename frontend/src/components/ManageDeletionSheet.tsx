import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, Platform, Animated, PanResponder, TouchableWithoutFeedback,
} from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { API_BASE_URL } from '../config/api';
import { getToken, clearAuth } from '../utils/auth';
import { AppIcon } from './AppIcon';

const isIOS = Platform.OS === 'ios';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DelegationRequest {
  id: string;
  patientId: string;
  toCaregiver: { id: string; name: string; surname: string };
  declineReason?: string | null;
}

interface DeletionDetails {
  pendingRequests: DelegationRequest[];
  acceptedRequests: DelegationRequest[];
  declinedRequests: DelegationRequest[];
  allDelegationsResolved: boolean;
  hasSomeDeclined: boolean;
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface ManageDeletionSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called after the user finalizes deletion and auth is cleared. */
  onDeleted?: () => void;
  /** Called after the user cancels the deletion process (e.g. to refresh parent state). */
  onCancelled?: () => void;
  /** Called when user taps "Pick Another Caregiver" on the SOME_DECLINED view. */
  onNavigateToCareTeams?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ManageDeletionSheet({
  visible,
  onClose,
  onDeleted,
  onCancelled,
  onNavigateToCareTeams,
}: ManageDeletionSheetProps) {
  const [details, setDetails] = useState<DeletionDetails | null>(null);

  // ── Animations (same as account page) ──
  const slideAnim = useRef(new Animated.Value(600)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          slideAnim.setValue(gs.dy);
          backdropAnim.setValue(Math.max(0, 1 - gs.dy / 400));
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80) {
          animateOut();
        } else {
          Animated.parallel([
            Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }),
            Animated.timing(backdropAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
          ]).start();
        }
      },
    }),
  ).current;

  const animateIn = useCallback(() => {
    slideAnim.setValue(600);
    backdropAnim.setValue(0);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 120 }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [slideAnim, backdropAnim]);

  const animateOut = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 600, duration: 250, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      slideAnim.setValue(600);
      onClose();
    });
  }, [slideAnim, backdropAnim, onClose]);

  // ── Fetch data when sheet opens ──
  useEffect(() => {
    if (visible) {
      fetchDeletionStatus();
      animateIn();
    }
  }, [visible]);

  const fetchDeletionStatus = async () => {
    const tok = await getToken();
    if (!tok) return;
    try {
      const res = await fetch(`${API_BASE_URL}/auth/deletion-status`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) setDetails(await res.json());
    } catch { /* silent */ }
  };

  // ── Actions ──
  const cancelDeletionRequest = async () => {
    const tok = await getToken();
    if (!tok) return;
    try {
      await fetch(`${API_BASE_URL}/auth/cancel-deletion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}` },
      });
      animateOut();
      onCancelled?.();
    } catch { /* silent */ }
  };

  const confirmFinalDeletion = async () => {
    const tok = await getToken();
    if (!tok) return;
    try {
      const res = await fetch(`${API_BASE_URL}/auth/confirm-deletion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        animateOut();
        await clearAuth();
        onDeleted?.();
      }
    } catch { /* silent */ }
  };

  // ── Derived state ──
  const isPending = !details?.allDelegationsResolved && !details?.hasSomeDeclined;
  const isAllAccepted = !!details?.allDelegationsResolved && !details?.hasSomeDeclined;
  const isSomeDeclined = !!details?.hasSomeDeclined;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={animateOut}>
      <TouchableWithoutFeedback onPress={animateOut}>
        <View style={s.overlay}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: backdropAnim }]} />
          <TouchableWithoutFeedback onPress={() => {}}>
            <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
              {/* Drag handle */}
              <View {...panResponder.panHandlers} style={s.dragArea}>
                <View style={s.dragHandle} />
              </View>

              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                {/* ── PENDING ── */}
                {isPending && (
                  <>
                    <AppIcon iosName="clock" androidFallback="⏳" size={32} color="#b45309" />
                    <Text style={[s.title, { marginTop: 12 }]}>Transferring Primary Roles</Text>
                    <Text style={s.body}>
                      You're still the primary caregiver. Your patients and access are unchanged. Nothing happens until you click "Finalize" after everyone accepts.
                    </Text>
                    <View style={s.list}>
                      {(details?.pendingRequests ?? []).map(r => (
                        <View key={r.id} style={s.row}>
                          <View style={s.avatar}>
                            <Text style={s.avatarText}>{r.toCaregiver.name[0]?.toUpperCase()}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.name}>{r.toCaregiver.name} {r.toCaregiver.surname}</Text>
                            <Text style={{ fontSize: 12, color: colors.textMuted, fontFamily: typography.fontFamily.regular }}>Waiting to accept…</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: colors.secondary, borderRadius: 14, marginTop: 4 }]}
                      onPress={animateOut}
                    >
                      <Text style={[s.actionBtnText, { color: '#fff' }]}>Continue Using App</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.actionBtn, { marginTop: 8 }]} onPress={cancelDeletionRequest}>
                      <Text style={[s.actionBtnText, { color: '#C0392B' }]}>Cancel Account Deletion</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* ── ALL ACCEPTED ── */}
                {isAllAccepted && (
                  <>
                    <AppIcon iosName="checkmark.seal.fill" androidFallback="✅" size={36} color="#27ae60" />
                    <Text style={[s.title, { marginTop: 12 }]}>Ready to Finalize</Text>
                    <Text style={s.body}>
                      All caregivers accepted. The moment you tap "Finalize" below, the roles swap and your account is deactivated. You are still the primary right now.
                    </Text>
                    <View style={s.list}>
                      {(details?.acceptedRequests ?? []).map(r => (
                        <View key={r.id} style={s.row}>
                          <View style={[s.avatar, { backgroundColor: 'rgba(39,174,96,0.15)' }]}>
                            <Text style={[s.avatarText, { color: '#27ae60' }]}>{r.toCaregiver.name[0]?.toUpperCase()}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.name}>{r.toCaregiver.name} {r.toCaregiver.surname}</Text>
                            <Text style={{ fontSize: 12, color: '#27ae60', fontFamily: typography.fontFamily.regular }}>Will become primary</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                    <Text style={[s.body, { fontSize: 12, color: colors.textMuted, marginTop: 4 }]}>
                      After finalizing, your account enters a 10-day grace period before permanent removal. You can restore it anytime during that window.
                    </Text>
                    <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#27ae60', borderRadius: 14, marginTop: 8 }]} onPress={confirmFinalDeletion}>
                      <Text style={[s.actionBtnText, { color: '#fff' }]}>Finalize — Transfer Roles</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.actionBtn, { marginTop: 8 }]} onPress={cancelDeletionRequest}>
                      <Text style={s.actionBtnText}>Cancel — Stay as Primary</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* ── SOME DECLINED ── */}
                {isSomeDeclined && (
                  <>
                    <AppIcon iosName="exclamationmark.triangle.fill" androidFallback="⚠" size={36} color="#C0392B" />
                    <Text style={[s.title, { marginTop: 12 }]}>Action Required</Text>
                    <Text style={s.body}>
                      A caregiver has declined the handover request. You need to pick another caregiver or cancel the deletion.
                    </Text>
                    <View style={s.list}>
                      {(details?.declinedRequests ?? []).map(r => (
                        <View key={r.id} style={s.row}>
                          <View style={[s.avatar, { backgroundColor: 'rgba(231,76,60,0.12)' }]}>
                            <Text style={[s.avatarText, { color: '#C0392B' }]}>{r.toCaregiver.name[0]?.toUpperCase()}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.name}>{r.toCaregiver.name} {r.toCaregiver.surname}</Text>
                            {r.declineReason ? (
                              <Text style={s.declineReason}>"{r.declineReason}"</Text>
                            ) : (
                              <Text style={{ fontSize: 12, color: '#C0392B', fontFamily: typography.fontFamily.regular }}>Declined</Text>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: colors.secondary, borderRadius: 14, marginTop: 8 }]}
                      onPress={() => {
                        animateOut();
                        onNavigateToCareTeams?.();
                      }}
                    >
                      <Text style={[s.actionBtnText, { color: '#fff' }]}>Pick Another Caregiver</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.actionBtn, { marginTop: 8 }]} onPress={cancelDeletionRequest}>
                      <Text style={[s.actionBtnText, { color: '#C0392B' }]}>Cancel Account Deletion</Text>
                    </TouchableOpacity>
                  </>
                )}
              </ScrollView>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── Styles (matches account page exactly) ──────────────────────────────────

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  dragArea: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 12,
    marginTop: -8,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  title: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: colors.textDark,
    marginBottom: 8,
  },
  body: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: colors.textMuted,
    marginBottom: 20,
    lineHeight: 22,
  },
  list: { gap: 8, marginBottom: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: colors.textLight,
  },
  name: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: colors.textDark,
  },
  actionBtn: { alignItems: 'center', paddingVertical: 12 },
  actionBtnText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: colors.textMuted,
  },
  declineReason: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: '#C0392B',
    fontStyle: 'italic',
    marginTop: 2,
  },
});
