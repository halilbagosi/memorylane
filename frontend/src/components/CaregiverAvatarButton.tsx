import { colors, lightColors, darkColors } from '../theme/colors';
import React, { useState, useRef, useCallback } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  TouchableWithoutFeedback,
  Animated,
  View,
  Image,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { getCaregiverInfo, type CaregiverInfo } from '../utils/auth';
import { typography } from '../theme/typography';

const isIOS = Platform.OS === 'ios';
const SIZE = 44;
const INNER = SIZE - 4;

export function CaregiverAvatarButton() {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  const router = useRouter();
  const [caregiver, setCaregiver] = useState<CaregiverInfo | null>(null);
  const scale = useRef(new Animated.Value(1)).current;
  const navigatingRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      getCaregiverInfo().then((info) => {
        if (info) setCaregiver(info);
      });
    }, []),
  );

  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: 0.88,
      friction: 8,
      tension: 200,
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 6,
      tension: 180,
      useNativeDriver: true,
    }).start();
  };

  const openAccount = () => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    router.push('/account');
    setTimeout(() => {
      navigatingRef.current = false;
    }, 450);
    Animated.spring(scale, {
      toValue: 1,
      friction: 7,
      tension: 170,
      useNativeDriver: true,
    }).start();
  };

  const initials = caregiver
    ? `${caregiver.name?.[0] ?? ''}${caregiver.surname?.[0] ?? ''}`.toUpperCase()
    : '?';

  return (
    <TouchableWithoutFeedback
      onPress={openAccount}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <Animated.View style={[styles.outer, { transform: [{ scale }] }]}>
        <View style={styles.ring}>
          {caregiver?.avatarUrl ? (
            <Image source={{ uri: caregiver.avatarUrl }} style={styles.image} />
          ) : (
            <LinearGradient
              colors={['#2D5F3E', '#1E4D30']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fallback}
            >
              <Text style={styles.initials}>{initials}</Text>
            </LinearGradient>
          )}
        </View>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const getStyles = (isDark: boolean) => {
  const themeColors = isDark ? darkColors : lightColors;
  return StyleSheet.create({
  outer: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    ...(isIOS
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.22, shadowRadius: 6 }
      : { elevation: 3 }),
  },
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: isIOS ? 2 : 1.5,
    borderColor: isIOS ? (isDark ? 'rgba(235, 247, 239, 0.05)' : 'rgba(255,255,255,0.45)') : (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0,0,0,0.08)'),
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: (isDark ? '#9BE7B4' : '#1E4D30'),
  },
  image: {
    width: INNER,
    height: INNER,
    borderRadius: INNER / 2,
  },
  fallback: {
    width: INNER,
    height: INNER,
    borderRadius: INNER / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: (isDark ? '#17231D' : '#FFFFFF'),
    letterSpacing: 0.5,
  },
});
};
// Styles are provided per-render via `getStyles(isDark)` inside the component
