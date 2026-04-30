import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { typography } from '../theme/typography';
import { getPatientInfo } from '../utils/auth';

const shownForPatientIds = new Set<string>();

const QUOTES = [
  'You are safe, you are loved, and you are doing great.',
  'Every day is a new opportunity for a smile.',
  'Today is a wonderful day to see your favorite people.',
  'Take your time. We are right here with you.',
];

export function PatientGreetingOverlay() {
  // Overlay itself is visible immediately so the gradient blocks the dashboard
  const [visible, setVisible] = useState(true);
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);

  // Gradient fades out on dismiss
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  // Quote text fades in once we confirm we should show
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const patient = await getPatientInfo();

      if (!patient || shownForPatientIds.has(patient.id)) {
        // Not a patient session or already shown — collapse immediately
        if (!cancelled) setVisible(false);
        return;
      }

      shownForPatientIds.add(patient.id);
      if (cancelled) return;

      // Gradient is already covering the screen; now fade the text in slowly
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    };

    load();
    return () => { cancelled = true; };
  }, [overlayOpacity, textOpacity]);

  const dismiss = () => {
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 500,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={dismiss}>
        <LinearGradient
          colors={['#EAF4EE', '#C5DDD1', '#98BEA9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.3, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View style={[styles.content, { opacity: textOpacity }]} pointerEvents="none">
          <Text style={styles.quote}>{quote}</Text>
        </Animated.View>
        <Animated.View style={[styles.tapCueWrapper, { opacity: textOpacity }]} pointerEvents="none">
          <Text style={styles.tapCue}>Touch to begin</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  quote: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 30,
    color: '#1E4D30',
    textAlign: 'center',
    lineHeight: 46,
    letterSpacing: 0.2,
  },
  tapCueWrapper: {
    paddingBottom: 56,
    alignItems: 'center',
  },
  tapCue: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: '#4A7C5E',
    letterSpacing: 1.2,
    opacity: 0.7,
  },
});
