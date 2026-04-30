import React, { useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

const MIN_SCALE = 1;
const MAX_SCALE = 5;

function pinchDist(touches: ArrayLike<{ pageX: number; pageY: number }>) {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

interface Props {
  uri: string;
  onLoad?: () => void;
  onError?: () => void;
}

export function ZoomableImage({ uri, onLoad, onError }: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const txAnim = useRef(new Animated.Value(0)).current;
  const tyAnim = useRef(new Animated.Value(0)).current;

  const committed = useRef({ scale: 1, tx: 0, ty: 0 });
  const initDist = useRef(0);
  const initScale = useRef(1);
  const lastDx = useRef(0);
  const lastDy = useRef(0);
  const lastTap = useRef(0);

  const springReset = () => {
    committed.current = { scale: 1, tx: 0, ty: 0 };
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }),
      Animated.spring(txAnim, { toValue: 0, useNativeDriver: true }),
      Animated.spring(tyAnim, { toValue: 0, useNativeDriver: true }),
    ]).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.numberActiveTouches === 2 || Math.abs(gs.dx) > 3 || Math.abs(gs.dy) > 3,

      onPanResponderGrant: (evt) => {
        const { touches } = evt.nativeEvent;
        lastDx.current = 0;
        lastDy.current = 0;
        if (touches.length === 2) {
          initDist.current = pinchDist(touches as any);
          initScale.current = committed.current.scale;
        } else if (touches.length === 1) {
          const now = Date.now();
          if (now - lastTap.current < 280) springReset();
          lastTap.current = now;
        }
      },

      onPanResponderMove: (evt, gs) => {
        const { touches } = evt.nativeEvent;
        if (touches.length === 2 && initDist.current > 0) {
          const newScale = Math.min(
            MAX_SCALE,
            Math.max(MIN_SCALE, initScale.current * (pinchDist(touches as any) / initDist.current)),
          );
          committed.current.scale = newScale;
          scaleAnim.setValue(newScale);
        } else if (touches.length === 1 && committed.current.scale > 1.01) {
          committed.current.tx += gs.dx - lastDx.current;
          committed.current.ty += gs.dy - lastDy.current;
          lastDx.current = gs.dx;
          lastDy.current = gs.dy;
          txAnim.setValue(committed.current.tx);
          tyAnim.setValue(committed.current.ty);
        }
      },

      onPanResponderRelease: () => {
        if (committed.current.scale < 1.05) springReset();
        initDist.current = 0;
        lastDx.current = 0;
        lastDy.current = 0;
      },
    }),
  ).current;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Animated.Image
        source={{ uri }}
        style={[
          styles.image,
          { transform: [{ scale: scaleAnim }, { translateX: txAnim }, { translateY: tyAnim }] },
        ]}
        resizeMode="contain"
        onLoad={onLoad}
        onError={onError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
