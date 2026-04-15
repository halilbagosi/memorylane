import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

type MaterialIconName = keyof typeof MaterialCommunityIcons.glyphMap;

const SF_TO_MATERIAL: Record<string, MaterialIconName> = {
  'person.2': 'account-group-outline',
  'person.2.fill': 'account-group',
  'chart.bar': 'chart-bar',
  'chart.bar.fill': 'chart-bar',
  'questionmark.circle': 'help-circle-outline',
  'questionmark.circle.fill': 'help-circle',
  'photo.on.rectangle.angled': 'image-multiple-outline',
  'person.fill': 'account',
  'heart.text.clipboard': 'clipboard-pulse-outline',
  'plus': 'plus',
  'arrow.right': 'arrow-right',
  'qrcode.viewfinder': 'qrcode-scan',
  'person.2.slash': 'account-off-outline',
  'trash': 'trash-can-outline',
  'xmark.circle.fill': 'close-circle',
  'eye': 'eye-outline',
  'eye.slash': 'eye-off-outline',
  'calendar': 'calendar-month',
  'keyboard': 'keyboard-outline',
  'camera.fill': 'camera',
  'checkmark.circle.fill': 'check-circle',
};

interface AppIconProps {
  iosName: SFSymbol;
  androidFallback: string;
  size?: number;
  color?: string;
  weight?: 'ultraLight' | 'thin' | 'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy' | 'black';
}

// SF Symbols via expo-symbols require iOS 16+
const supportsSymbols =
  Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 16;

export function AppIcon({
  iosName,
  androidFallback,
  size = 22,
  color = colors.textDark,
  weight = 'medium',
}: AppIconProps) {
  if (supportsSymbols) {
    return (
      <SymbolView
        name={iosName}
        size={size}
        tintColor={color}
        weight={weight}
        style={{ width: size, height: size }}
      />
    );
  }

  const materialName = SF_TO_MATERIAL[iosName as string];
  if (materialName) {
    return (
      <MaterialCommunityIcons
        name={materialName}
        size={size}
        color={color}
      />
    );
  }

  return (
    <View style={[styles.androidContainer, { width: size, height: size }]}>
      <MaterialCommunityIcons
        name="help-circle-outline"
        size={size}
        color={color}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  androidContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
