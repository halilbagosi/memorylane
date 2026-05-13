import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableWithoutFeedback,
  Animated,
  Platform,
  Alert,
  Pressable,
} from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export interface M3DialogAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface M3DialogProps {
  visible: boolean;
  title: string;
  body: string;
  actions: M3DialogAction[];
  onDismiss: () => void;
}

export function M3Dialog({ visible, title, body, actions, onDismiss }: M3DialogProps) {
  if (Platform.OS === 'ios') {
    return <IOSDialogProxy visible={visible} title={title} body={body} actions={actions} onDismiss={onDismiss} />;
  }

  return <AndroidDialog visible={visible} title={title} body={body} actions={actions} onDismiss={onDismiss} />;
}

function IOSDialogProxy({ visible, title, body, actions, onDismiss }: M3DialogProps) {
  const shown = useRef(false);

  useEffect(() => {
    if (visible && !shown.current) {
      shown.current = true;
      Alert.alert(
        title,
        body,
        actions.map((a) => ({
          text: a.label,
          style: a.destructive ? 'destructive' : 'default',
          onPress: () => {
            shown.current = false;
            a.onPress();
          },
        })),
        {
          cancelable: true,
          onDismiss: () => {
            shown.current = false;
            onDismiss();
          },
        },
      );
    }
    if (!visible) {
      shown.current = false;
    }
  }, [visible]);

  return null;
}

function AndroidDialog({ visible, title, body, actions, onDismiss }: M3DialogProps) {
  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 8, tension: 100, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.9);
      opacity.setValue(0);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <Animated.View style={[styles.backdrop, { opacity }]}>
          <TouchableWithoutFeedback>
            <Animated.View style={[styles.dialog, { transform: [{ scale }], opacity }]}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.body}>{body}</Text>
              <View style={styles.actionRow}>
                {actions.map((action, i) => (
                  <Pressable
                    key={i}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      pressed && { backgroundColor: 'rgba(0,0,0,0.04)' },
                    ]}
                    onPress={action.onPress}
                    android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: false }}
                  >
                    <Text
                      style={[
                        styles.actionLabel,
                        action.destructive && styles.actionLabelDestructive,
                      ]}
                    >
                      {action.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  dialog: {
    backgroundColor: colors.neutral,
    borderRadius: 28,
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 12,
    width: '100%',
    maxWidth: 340,
    elevation: 3,
  },
  title: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: colors.textDark,
    marginBottom: 12,
  },
  body: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 4,
  },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
  },
  actionLabel: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.secondary,
  },
  actionLabelDestructive: {
    color: '#C0392B',
  },
});
