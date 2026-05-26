import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Animated, Dimensions } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useTheme } from '../theme/ThemeProvider';

interface AnimatedSplashScreenProps {
  onAnimationComplete: () => void;
  fontsLoaded: boolean;
  fontError: Error | null;
}

export default function AnimatedSplashScreen({ onAnimationComplete, fontsLoaded, fontError }: AnimatedSplashScreenProps) {
  const { isDark, colors } = useTheme();
  const [isAppReady, setAppReady] = useState(false);
  
  // Animation values
  const logoScale = new Animated.Value(1);
  const logoTranslateY = new Animated.Value(0);
  const textOpacity = new Animated.Value(0);
  const textTranslateY = new Animated.Value(20);
  
  const containerOpacity = new Animated.Value(1);
  const containerScale = new Animated.Value(1);

  const screenWidth = Dimensions.get('window').width;

  useEffect(() => {
    if (fontsLoaded || fontError) {
      setAppReady(true);
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (isAppReady) {
      SplashScreen.hideAsync().then(() => {
        // Phase 1: Shrink logo and reveal text
        Animated.sequence([
          Animated.parallel([
            Animated.timing(logoScale, {
              toValue: 0.6,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(logoTranslateY, {
              toValue: -40,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(textOpacity, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(textTranslateY, {
              toValue: 0,
              duration: 600,
              useNativeDriver: true,
            }),
          ]),
          // Hold for a moment to let user read
          Animated.delay(1000),
          // Phase 2: Fade out entire splash screen
          Animated.parallel([
            Animated.timing(containerOpacity, {
              toValue: 0,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(containerScale, {
              toValue: 1.15,
              duration: 600,
              useNativeDriver: true,
            })
          ])
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
        {
          backgroundColor: isDark ? '#0E1712' : '#E8F5EC',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: containerOpacity,
          transform: [{ scale: containerScale }],
          zIndex: 9999,
        },
      ]}
    >
      <Animated.Image
        source={require('../../assets/logoS.png')}
        style={{
          width: '100%',
          height: '100%',
          resizeMode: 'contain',
          position: 'absolute',
          transform: [
            { scale: logoScale },
            { translateY: logoTranslateY }
          ]
        }}
      />
      <Animated.Text
        style={{
          position: 'absolute',
          fontFamily: 'GothicA1_700Bold',
          fontSize: 36,
          color: colors.textDark,
          opacity: textOpacity,
          transform: [{ translateY: textTranslateY }],
          // Position text below the centered logo (which shrinks to 60%)
          // Since logo is centered and scales down, moving text down from center:
          marginTop: screenWidth * 0.45,
        }}
      >
        MemoryLane
      </Animated.Text>
    </Animated.View>
  );
}
