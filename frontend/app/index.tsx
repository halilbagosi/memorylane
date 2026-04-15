import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  ScrollView,
  Animated,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { AdaptiveCard } from '../src/components/AdaptiveCard';
import { AdaptiveBadge } from '../src/components/AdaptiveBadge';
import { AppIcon } from '../src/components/AppIcon';
import { getPatientInfo, deletePatientInfo } from '../src/utils/auth';
import { API_BASE_URL } from '../src/config/api';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const isIOS = Platform.OS === 'ios';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [checkingSession, setCheckingSession] = useState(true);

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoSlide = useRef(new Animated.Value(20)).current;
  const headingOpacity = useRef(new Animated.Value(0)).current;
  const headingSlide = useRef(new Animated.Value(15)).current;
  const patientCardScale = useRef(new Animated.Value(0.92)).current;
  const patientCardOpacity = useRef(new Animated.Value(0)).current;
  const caregiverCardScale = useRef(new Animated.Value(0.92)).current;
  const caregiverCardOpacity = useRef(new Animated.Value(0)).current;

  const orb1Y = useRef(new Animated.Value(0)).current;
  const orb2Y = useRef(new Animated.Value(0)).current;
  const orb3Y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const patient = await getPatientInfo();
      if (patient) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12_000);
        try {
          const res = await fetch(`${API_BASE_URL}/patients/${patient.id}/paired-status`, {
            signal: controller.signal,
          });
          const data = await res.json();
          if (res.ok && data.paired) {
            router.replace('/(patient-tabs)/quiz');
            return;
          }
        } catch {
          // Network error / timeout — still route to patient tabs so offline use isn't broken
          router.replace('/(patient-tabs)/quiz');
          return;
        } finally {
          clearTimeout(timeoutId);
        }
        // Server says unpaired — clear local data and show role selection
        await deletePatientInfo();
      }
      setCheckingSession(false);
    })();
  }, []);

  useEffect(() => {
    if (checkingSession) return;
    Animated.stagger(150, [
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(logoSlide, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(headingOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(headingSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(patientCardScale, { toValue: 1, friction: 6, useNativeDriver: true }),
        Animated.timing(patientCardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(caregiverCardScale, { toValue: 1, friction: 6, useNativeDriver: true }),
        Animated.timing(caregiverCardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();

    const floatOrb = (anim: Animated.Value, duration: number, distance: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: -distance, duration, useNativeDriver: true }),
          Animated.timing(anim, { toValue: distance, duration, useNativeDriver: true }),
        ])
      ).start();
    };
    floatOrb(orb1Y, 3200, 12);
    floatOrb(orb2Y, 4000, 8);
    floatOrb(orb3Y, 3600, 10);
  }, [checkingSession]);

  if (checkingSession) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.neutral }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.neutral} />

      <Animated.View style={[styles.orb, styles.orb1, { transform: [{ translateY: orb1Y }] }]} />
      <Animated.View style={[styles.orb, styles.orb2, { transform: [{ translateY: orb2Y }] }]} />
      <Animated.View style={[styles.orb, styles.orb3, { transform: [{ translateY: orb3Y }] }]} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Logo */}
        <Animated.View style={[styles.logoSection, { opacity: logoOpacity, transform: [{ translateY: logoSlide }] }]}>
          <Image source={require('../assets/logo.png')} style={styles.logoImage} resizeMode="contain" />
          <View style={styles.logoTextRow}>
            <Text style={styles.logoTextBold}>Memory</Text>
            <Text style={styles.logoTextLight}>Lane</Text>
          </View>
        </Animated.View>

        {/* Heading */}
        <Animated.View style={[styles.headingSection, { opacity: headingOpacity, transform: [{ translateY: headingSlide }] }]}>
          <Text style={styles.headline}>Welcome!</Text>
          <Text style={styles.subheadline}>
            Who's joining today?{'\n'}Select your role to get started.
          </Text>
        </Animated.View>

        {/* Role Cards */}
        <View style={styles.cardsContainer}>
          {/* Patient Card */}
          <Animated.View style={{ opacity: patientCardOpacity, transform: [{ scale: patientCardScale }] }}>
            <TouchableOpacity
              onPress={() => router.push('/join-space')}
              activeOpacity={isIOS ? 0.7 : 0.88}
            >
              <AdaptiveCard
                style={styles.cardPadding}
                backgroundColor={colors.patientCardBg}
              >
                <View style={styles.cardTopRow}>
                  <View style={[styles.iconBubble, { backgroundColor: 'rgba(180, 140, 100, 0.15)' }]}>
                    <AppIcon iosName="person.fill" androidFallback="P" size={22} color="#8B7355" />
                  </View>
                  <AdaptiveBadge
                    label="Daily Quiz"
                    backgroundColor="rgba(180, 140, 100, 0.18)"
                  />
                </View>

                <Text style={styles.cardTitle}>I am a Patient</Text>
                <Text style={styles.cardDescription}>
                  Explore your memories, engage with daily quizzes, and stay connected with your loved ones in a safe space.
                </Text>

                <View style={styles.ctaRow}>
                  <Text style={[styles.ctaText, { color: '#8B7355' }]}>Get Started</Text>
                  <View style={[styles.ctaArrow, { backgroundColor: '#8B7355' }]}>
                    <AppIcon iosName="arrow.right" androidFallback="→" size={18} color="#FFFFFF" weight="bold" />
                  </View>
                </View>
              </AdaptiveCard>
            </TouchableOpacity>
          </Animated.View>

          {/* Caregiver Card */}
          <Animated.View style={{ opacity: caregiverCardOpacity, transform: [{ scale: caregiverCardScale }] }}>
            <TouchableOpacity
              onPress={() => router.push('/login')}
              activeOpacity={isIOS ? 0.7 : 0.88}
            >
              <AdaptiveCard
                style={styles.cardPadding}
                backgroundColor={colors.caregiverCardBg}
              >
                <View style={styles.cardTopRow}>
                  <View style={[styles.iconBubble, { backgroundColor: 'rgba(45, 79, 62, 0.12)' }]}>
                    <AppIcon iosName="heart.text.clipboard" androidFallback="C" size={22} color={colors.secondary} />
                  </View>
                  <AdaptiveBadge
                    label="Dashboard"
                    backgroundColor="rgba(45, 79, 62, 0.12)"
                  />
                </View>

                <Text style={styles.cardTitle}>I am a Caregiver</Text>
                <Text style={styles.cardDescription}>
                  Manage care plans, update memories for your loved ones, and access professional support guides.
                </Text>

                <View style={styles.ctaRow}>
                  <Text style={[styles.ctaText, { color: colors.secondary }]}>Enter Dashboard</Text>
                  <View style={[styles.ctaArrow, { backgroundColor: colors.secondary }]}>
                    <AppIcon iosName="arrow.right" androidFallback="→" size={18} color="#FFFFFF" weight="bold" />
                  </View>
                </View>
              </AdaptiveCard>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral,
    overflow: 'hidden',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    flexGrow: 1,
  },

  orb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.35,
  },
  orb1: {
    width: 180,
    height: 180,
    backgroundColor: '#DCCFBB',
    top: -40,
    right: -60,
  },
  orb2: {
    width: 120,
    height: 120,
    backgroundColor: '#C8D9CF',
    top: SCREEN_HEIGHT * 0.45,
    left: -50,
  },
  orb3: {
    width: 100,
    height: 100,
    backgroundColor: '#E0D4C4',
    bottom: 60,
    right: -30,
  },

  logoSection: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  logoImage: {
    width: 90,
    height: 90,
    marginBottom:10,
  },
  logoTextRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  logoTextBold: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: colors.secondary,
  },
  logoTextLight: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 20,
    color: colors.secondary,
  },

  headingSection: {
    marginBottom: 28,
    alignItems: 'center',
  },
  headline: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 28,
    lineHeight: 36,
    color: colors.textDark,
    marginBottom: 8,
    textAlign: 'center',
  },
  subheadline: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: 'center',
  },

  cardsContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    gap: 16,
  },
  cardPadding: {
    paddingVertical: 22,
    paddingHorizontal: 22,
  },

  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: colors.textDark,
    marginBottom: 6,
  },
  cardDescription: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    marginBottom: 18,
  },

  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ctaText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
  },
  ctaArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
