import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { AppIcon } from '../../src/components/AppIcon';
import { getPatientInfo, deletePatientInfo, PatientInfo } from '../../src/utils/auth';

export default function QuizTab() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [patient, setPatient] = useState<PatientInfo | null>(null);

  useEffect(() => {
    getPatientInfo().then(setPatient);
  }, []);

  const handleLogout = () => {
    Alert.alert('Log Out (Debug)', 'Return to the welcome screen?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await deletePatientInfo();
          navigation.dispatch(
            CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }),
          );
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      {patient && (
        <View style={styles.topRow}>
          <Text style={styles.greeting}>Hi, {patient.name}</Text>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} activeOpacity={0.7}>
            <AppIcon iosName="arrow.right.square" androidFallback="←" size={18} color="#C0392B" />
          </TouchableOpacity>
          {patient.avatarUrl ? (
            <Image source={{ uri: patient.avatarUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarFallback}>
              <Text style={styles.headerAvatarText}>{patient.name?.[0]?.toUpperCase() || '?'}</Text>
            </View>
          )}
        </View>
      )}

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
    padding: 8,
    marginRight: 8,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  headerAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.textLight,
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
