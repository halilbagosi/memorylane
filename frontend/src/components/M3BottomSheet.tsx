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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, lightColors, darkColors } from '../theme/colors';

interface M3BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function M3BottomSheet({ visible, onClose, children }: M3BottomSheetProps) {
  const isIOS = Platform.OS === 'ios';
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslate = useRef(new Animated.Value(600)).current;
  const { isDark, colors } = useTheme();
  const styles = getStyles(isDark);

  useEffect(() => {
    if (visible) {
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
      ]).start();
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
              transform: [{ translateY: sheetTranslate }],
            },
          ]}
        >
          <View style={styles.handle} />
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
  handle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0, 0, 0, 0.2)'),
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
});
};
// Styles are computed per-render via `getStyles(isDark)` inside the component
