import React, { useLayoutEffect } from 'react';
import { useTheme } from '../src/theme/ThemeProvider';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, lightColors, darkColors } from '../src/theme/colors';
import { MemoryLibrarySheetContent } from '../src/components/MemoryLibraryModal';

export default function PatientMediaScreen() {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ patientId?: string; patientName?: string }>();
  const patientId = typeof params.patientId === 'string' ? params.patientId : undefined;
  const patientName = typeof params.patientName === 'string' ? params.patientName : '';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: params.patientName ? `${params.patientName}'s Media` : 'Media Manager',
    });
  }, [navigation, params.patientName]);

  if (!patientId) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Missing patient.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <MemoryLibrarySheetContent patientId={patientId} patientName={patientName} />
    </SafeAreaView>
  );
}

const getStyles = (isDark: boolean) => {
  const themeColors = isDark ? darkColors : lightColors;
  return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: themeColors.neutral },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: (isDark ? '#FFB4A8' : '#C0392B'), fontSize: 16 },
});
};
// styles are computed at render time via `useTheme()` inside the component
