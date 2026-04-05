import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { AppIcon } from '../../src/components/AppIcon';
import { AdaptiveButton } from '../../src/components/AdaptiveButton';
import { getPatientInfo, deletePatientInfo, PatientInfo } from '../../src/utils/auth';

export default function QuizTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [patient, setPatient] = useState<PatientInfo | null>(null);

  useEffect(() => {
    getPatientInfo().then(setPatient);
  }, []);

  const handleLogout = async () => {
    await deletePatientInfo();
    router.replace('/');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <View style={styles.topRow}>
        {patient && (
          <Text style={styles.greeting}>Hi, {patient.name}</Text>
        )}
        <AdaptiveButton
          title="Logout"
          variant="danger"
          onPress={handleLogout}
          style={styles.logoutBtn}
          textStyle={styles.logoutText}
        />
      </View>

      <View style={styles.center}>
        <View style={styles.iconCircle}>
          <AppIcon
            iosName="questionmark.circle.fill"
            androidFallback="Q"
            size={48}
            color={colors.primary}
          />
        </View>
        <Text style={styles.title}>Quiz</Text>
        <Text style={styles.subtitle}>Coming soon</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral,
    paddingHorizontal: 24,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: colors.textDark,
    flex: 1,
  },
  logoutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logoutText: {
    fontSize: 13,
    textTransform: 'none',
    letterSpacing: 0,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(180, 174, 232, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 24,
    color: colors.textDark,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: colors.textMuted,
  },
});
