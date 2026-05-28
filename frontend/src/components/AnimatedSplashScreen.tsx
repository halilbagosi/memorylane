import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type ThemeColors } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';

const LOGO_IMAGE_SIZE = 90;
const LOGO_IMAGE_MARGIN_BOTTOM = 10;
const LOGO_TEXT_LINE_HEIGHT = 24;
const INDEX_LOGO_MARGIN_TOP = 10;
const INDEX_LOGO_LOCKUP_HEIGHT = LOGO_IMAGE_SIZE + LOGO_IMAGE_MARGIN_BOTTOM + LOGO_TEXT_LINE_HEIGHT;

interface AnimatedSplashScreenProps {
  onAnimationComplete: () => void;
  fontsLoaded: boolean;
  fontError: Error | null;
}

export default function AnimatedSplashScreen({ onAnimationComplete, fontsLoaded, fontError }: AnimatedSplashScreenProps) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors);
  const [isAppReady, setAppReady] = useState(false);
  const indexLogoCenterY = insets.top + INDEX_LOGO_MARGIN_TOP + INDEX_LOGO_LOCKUP_HEIGHT / 2;
  const indexLogoTranslateY = indexLogoCenterY - height / 2;
  
  const lockupOpacity = useRef(new Animated.Value(0)).current;
  const lockupTranslateY = useRef(new Animated.Value(14)).current;
  const lockupScale = useRef(new Animated.Value(0.96)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (fontsLoaded || fontError) {
      setAppReady(true);
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (isAppReady) {
      SplashScreen.hideAsync().then(() => {
        Animated.sequence([
          Animated.parallel([
            Animated.timing(lockupOpacity, {
              toValue: 1,
              duration: 380,
              useNativeDriver: true,
            }),
            Animated.timing(lockupTranslateY, {
              toValue: 0,
              duration: 380,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.spring(lockupScale, {
              toValue: 1,
              friction: 7,
              tension: 70,
              useNativeDriver: true,
            }),
          ]),
          Animated.delay(250),
          Animated.timing(lockupTranslateY, {
            toValue: indexLogoTranslateY,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(containerOpacity, {
            toValue: 0,
            duration: 360,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start(() => {
          onAnimationComplete();
        });
      }).catch(console.warn);
    }
  }, [isAppReady]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.container,
        { opacity: containerOpacity },
      ]}
    >
      <Animated.View
        style={[
          styles.logoSection,
          {
            opacity: lockupOpacity,
            transform: [
              { translateY: lockupTranslateY },
              { scale: lockupScale },
            ],
          },
        ]}
      >
        <Animated.Image
          source={require('../../assets/logoS.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <Animated.View style={styles.logoTextRow}>
          <Animated.Text style={styles.logoTextBold}>Memory</Animated.Text>
          <Animated.Text style={styles.logoTextLight}>Lane</Animated.Text>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.neutral,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    },
    logoSection: {
      alignItems: 'center',
    },
    logoImage: {
      width: LOGO_IMAGE_SIZE,
      height: LOGO_IMAGE_SIZE,
      marginBottom: LOGO_IMAGE_MARGIN_BOTTOM,
    },
    logoTextRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 3,
    },
    logoTextBold: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 20,
      lineHeight: LOGO_TEXT_LINE_HEIGHT,
      color: colors.secondary,
    },
    logoTextLight: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 20,
      lineHeight: LOGO_TEXT_LINE_HEIGHT,
      color: colors.secondary,
    },
  });
