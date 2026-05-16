import React, { ReactNode, useEffect, useRef } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  View,
  Modal,
  StyleSheet,
  TouchableWithoutFeedback,
  Animated,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  BackHandler,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, lightColors, darkColors } from '../theme/colors';

interface M3BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

const DISMISS_THRESHOLD = 100; // px — how far down before we dismiss
const DISMISS_VELOCITY = 0.5;  // velocity threshold for a quick flick

export function M3BottomSheet({ visible, onClose, children }: M3BottomSheetProps) {
  const isIOS = Platform.OS === 'ios';
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslate = useRef(new Animated.Value(600)).current;
  const { isDark, colors } = useTheme();
  const styles = getStyles(isDark);

  // Track the drag offset separately so sheetTranslate stays at 0 when open
  const dragOffset = useRef(new Animated.Value(0)).current;
  const combinedTranslate = Animated.add(sheetTranslate, dragOffset);

  // Keep a mutable ref so the PanResponder always sees the latest onClose
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only capture vertical drags (downward)
        return gestureState.dy > 4 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow dragging downward (positive dy), clamp upward to 0
        if (gestureState.dy > 0) {
          dragOffset.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > DISMISS_THRESHOLD || gestureState.vy > DISMISS_VELOCITY) {
          // Animate the sheet fully off-screen FIRST, then call onClose.
          // This prevents the flash where dragOffset resets to 0 before
          // the close animation starts.
          Animated.parallel([
            Animated.timing(dragOffset, {
              toValue: 600,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(backdropOpacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            onCloseRef.current();
          });
        } else {
          // Snap back to open position
          Animated.spring(dragOffset, {
            toValue: 0,
            friction: 10,
            tension: 65,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        // If gesture is interrupted, snap back
        Animated.spring(dragOffset, {
          toValue: 0,
          friction: 10,
          tension: 65,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      dragOffset.setValue(0);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(sheetTranslate, {
          toValue: 0,
          friction: 10,
          tension: 65,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslate, {
          toValue: 600,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        dragOffset.setValue(0);
      });
    }
  }, [visible]);

  // Intercept Android back button when sheet is open
  useEffect(() => {
    if (!visible || isIOS) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (isIOS) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={onClose}
      >
        <View style={[styles.iosSheet, { backgroundColor: isDark ? '#0E1712' : colors.neutral }]}>
          <View style={styles.handle} />
          {children}
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView style={styles.fill} behavior="height">
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.androidSheet,
            {
              paddingBottom: Math.max(insets.bottom, 24),
              transform: [{ translateY: combinedTranslate }],
            },
          ]}
        >
          {/* Drag handle — enlarged touch target for swipe-to-dismiss */}
          <View style={styles.handleTouchArea} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const getStyles = (isDark: boolean) => {
  const themeColors = isDark ? darkColors : lightColors;
  return StyleSheet.create({
  fill: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0, 0, 0, 0.32)'),
  },
  iosSheet: {
    flex: 1,
  },
  androidSheet: {
    backgroundColor: themeColors.neutral,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  handleTouchArea: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    // 48dp minimum touch target per M3 accessibility guidelines
    minHeight: 48,
  },
  handle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.28)' : 'rgba(0, 0, 0, 0.25)'),
  },
});
};
// Styles are computed per-render via `getStyles(isDark)` inside the component
