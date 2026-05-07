import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { typography } from '../theme/typography';
import { AppIcon } from './AppIcon';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export function QuizSuccessOverlay({ visible, onDismiss }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.96)).current;
  const onDismissRef = useRef(onDismiss);
  const dismissedRef = useRef(false);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!visible) return;
    dismissedRef.current = false;

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardScale, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      if (dismissedRef.current) return;
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 0.98,
          duration: 220,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (!dismissedRef.current) {
          dismissedRef.current = true;
          onDismissRef.current();
        }
      });
    }, 1200);

    return () => clearTimeout(timer);
  }, [visible, opacity, cardScale]);

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      cardScale.setValue(0.96);
    }
  }, [visible, opacity, cardScale]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, styles.overlay, { opacity }]}
    >
      <Animated.View style={[styles.card, { transform: [{ scale: cardScale }] }]}>
        <View style={styles.iconWrap}>
          <AppIcon iosName="checkmark" androidFallback="check" size={20} color="#1E4D30" />
        </View>
        <Text style={styles.message}>Well done.</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 999,
    elevation: 999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    minWidth: 190,
    minHeight: 76,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(30, 77, 48, 0.22)',
    backgroundColor: '#FCFEF9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 16,
    shadowColor: '#24442F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 7,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 77, 48, 0.1)',
  },
  message: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: '#1E4D30',
    textAlign: 'center',
  },
});
