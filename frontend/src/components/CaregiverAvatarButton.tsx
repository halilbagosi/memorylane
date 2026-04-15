import React, { useState, useRef, useCallback } from 'react';
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
  const router = useRouter();
  const [caregiver, setCaregiver] = useState<CaregiverInfo | null>(null);
  const scale = useRef(new Animated.Value(1)).current;

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

  const initials = caregiver
    ? `${caregiver.name?.[0] ?? ''}${caregiver.surname?.[0] ?? ''}`.toUpperCase()
    : '?';

  return (
    <TouchableWithoutFeedback
      onPress={() => router.push('/account')}
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

const styles = StyleSheet.create({
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
    borderColor: isIOS ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.08)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E4D30',
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
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
