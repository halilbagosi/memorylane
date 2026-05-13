import React, { useEffect, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

const MIN_SCALE = 1;
const DOUBLE_TAP_SCALE = 2.4;
const MAX_SCALE = 5;

type TouchPoint = { pageX: number; pageY: number; locationX?: number; locationY?: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pinchDist(touches: ArrayLike<TouchPoint>) {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function focalPoint(touches: ArrayLike<TouchPoint>, width: number, height: number) {
  const x = ((touches[0].locationX ?? width / 2) + (touches[1].locationX ?? width / 2)) / 2;
  const y = ((touches[0].locationY ?? height / 2) + (touches[1].locationY ?? height / 2)) / 2;
  return { x: x - width / 2, y: y - height / 2 };
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

  const layout = useRef({ width: 1, height: 1 });
  const committed = useRef({ scale: 1, tx: 0, ty: 0 });
  const gestureStart = useRef({ scale: 1, tx: 0, ty: 0, dist: 0, focalX: 0, focalY: 0 });
  const tapStart = useRef({ x: 0, y: 0, time: 0 });
  const lastTap = useRef(0);

  const boundsFor = (scale: number) => {
    const { width, height } = layout.current;
    return {
      x: Math.max(0, (width * (scale - 1)) / 2),
      y: Math.max(0, (height * (scale - 1)) / 2),
    };
  };

  const commitValues = (scale: number, tx: number, ty: number) => {
    const bounded = boundsFor(scale);
    committed.current = {
      scale,
      tx: clamp(tx, -bounded.x, bounded.x),
      ty: clamp(ty, -bounded.y, bounded.y),
    };
    scaleAnim.setValue(committed.current.scale);
    txAnim.setValue(committed.current.tx);
    tyAnim.setValue(committed.current.ty);
  };

  const animateTo = (scale: number, tx: number, ty: number) => {
    const bounded = boundsFor(scale);
    const next = {
      scale,
      tx: clamp(tx, -bounded.x, bounded.x),
      ty: clamp(ty, -bounded.y, bounded.y),
    };
    committed.current = next;
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: next.scale,
        useNativeDriver: true,
        damping: 18,
        stiffness: 170,
        mass: 0.8,
      }),
      Animated.spring(txAnim, {
        toValue: next.tx,
        useNativeDriver: true,
        damping: 18,
        stiffness: 170,
        mass: 0.8,
      }),
      Animated.spring(tyAnim, {
        toValue: next.ty,
        useNativeDriver: true,
        damping: 18,
        stiffness: 170,
        mass: 0.8,
      }),
    ]).start();
  };

  const reset = () => animateTo(1, 0, 0);

  useEffect(() => {
    committed.current = { scale: 1, tx: 0, ty: 0 };
    scaleAnim.setValue(1);
    txAnim.setValue(0);
    tyAnim.setValue(0);
  }, [scaleAnim, txAnim, tyAnim, uri]);

  const startPinch = (touches: ArrayLike<TouchPoint>) => {
    const focal = focalPoint(touches, layout.current.width, layout.current.height);
    gestureStart.current = {
      scale: committed.current.scale,
      tx: committed.current.tx,
      ty: committed.current.ty,
      dist: pinchDist(touches),
      focalX: focal.x,
      focalY: focal.y,
    };
  };

  const zoomToward = (scale: number, x: number, y: number) => {
    const { width, height } = layout.current;
    const focalX = x - width / 2;
    const focalY = y - height / 2;
    const current = committed.current;
    const factor = scale / current.scale;
    animateTo(
      scale,
      current.tx * factor + focalX * (1 - factor),
      current.ty * factor + focalY * (1 - factor),
    );
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.numberActiveTouches === 2 || Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2,

      onPanResponderGrant: (evt) => {
        const { touches } = evt.nativeEvent;
        tapStart.current = {
          x: touches[0]?.locationX ?? layout.current.width / 2,
          y: touches[0]?.locationY ?? layout.current.height / 2,
          time: Date.now(),
        };
        gestureStart.current = {
          scale: committed.current.scale,
          tx: committed.current.tx,
          ty: committed.current.ty,
          dist: 0,
          focalX: 0,
          focalY: 0,
        };
        if (touches.length === 2) startPinch(touches as any);
      },

      onPanResponderStart: (evt) => {
        const { touches } = evt.nativeEvent;
        if (touches.length === 2) {
          startPinch(touches as any);
        }
      },

      onPanResponderMove: (evt, gs) => {
        const { touches } = evt.nativeEvent;
        if (touches.length === 2) {
          if (gestureStart.current.dist <= 0) startPinch(touches as any);
          const start = gestureStart.current;
          const nextScale = clamp(start.scale * (pinchDist(touches as any) / start.dist), MIN_SCALE, MAX_SCALE);
          const nextFocal = focalPoint(touches as any, layout.current.width, layout.current.height);
          const factor = nextScale / start.scale;
          commitValues(
            nextScale,
            start.tx * factor + start.focalX * (1 - factor) + (nextFocal.x - start.focalX),
            start.ty * factor + start.focalY * (1 - factor) + (nextFocal.y - start.focalY),
          );
          return;
        }

        if (touches.length === 1 && committed.current.scale > 1.01) {
          const start = gestureStart.current;
          commitValues(committed.current.scale, start.tx + gs.dx, start.ty + gs.dy);
        }
      },

      onPanResponderRelease: (_, gs) => {
        const isTap =
          Math.abs(gs.dx) < 6 &&
          Math.abs(gs.dy) < 6 &&
          Date.now() - tapStart.current.time < 260;

        if (isTap) {
          const now = Date.now();
          if (now - lastTap.current < 300) {
            if (committed.current.scale > 1.05) reset();
            else zoomToward(DOUBLE_TAP_SCALE, tapStart.current.x, tapStart.current.y);
            lastTap.current = 0;
            return;
          }
          lastTap.current = now;
        }

        if (committed.current.scale < 1.03) reset();
        else animateTo(committed.current.scale, committed.current.tx, committed.current.ty);
        gestureStart.current.dist = 0;
      },

      onPanResponderTerminate: () => {
        if (committed.current.scale < 1.03) reset();
        else animateTo(committed.current.scale, committed.current.tx, committed.current.ty);
        gestureStart.current.dist = 0;
      },
    }),
  ).current;

  return (
    <View
      style={styles.container}
      onLayout={(event) => {
        layout.current = {
          width: Math.max(1, event.nativeEvent.layout.width),
          height: Math.max(1, event.nativeEvent.layout.height),
        };
      }}
      {...panResponder.panHandlers}
    >
      <Animated.Image
        source={{ uri }}
        style={[
          styles.image,
          { transform: [{ translateX: txAnim }, { translateY: tyAnim }, { scale: scaleAnim }] },
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
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
