import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { AppIcon } from '../../src/components/AppIcon';
import { getPatientInfo, PatientInfo } from '../../src/utils/auth';

export default function ReliveTab() {
  const insets = useSafeAreaInsets();
  const [patient, setPatient] = useState<PatientInfo | null>(null);

  useEffect(() => {
    getPatientInfo().then(setPatient);
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      {patient && (
        <Text style={styles.greeting}>Hi, {patient.name}</Text>
      )}

      <View style={styles.center}>
        <View style={styles.iconCircle}>
          <AppIcon
            iosName="photo.on.rectangle.angled"
            androidFallback="R"
            size={48}
            color={colors.primary}
          />
        </View>
        <Text style={styles.title}>Relive</Text>
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
  greeting: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: colors.textDark,
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
