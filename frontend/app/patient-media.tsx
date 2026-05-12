import React, { useLayoutEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../src/theme/colors';

// Import the shared UI we are about to create
import { MemoryLibrarySheetContent } from '../src/components/MemoryLibraryModal';

export default function PatientMediaScreen() {
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ patientId?: string; patientName?: string }>();
  const patientId = typeof params.patientId === 'string' ? params.patientId : undefined;

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
      {/* Renders the newly updated UI Component */}
      <MemoryLibrarySheetContent patientId={patientId} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.neutral },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#C0392B', fontSize: 16 },
});