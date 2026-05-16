import React from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { Platform, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, lightColors, darkColors } from '../theme/colors';

type MaterialIconName = keyof typeof MaterialCommunityIcons.glyphMap;

const SF_TO_MATERIAL: Record<string, MaterialIconName> = {
  'person.2': 'account-group-outline',
  'person.2.fill': 'account-group',
  'chart.bar': 'chart-bar',
  'chart.bar.fill': 'chart-bar',
  'star.fill': 'star',
  'star': 'star-outline',
  'questionmark.circle': 'help-circle-outline',
  'questionmark.circle.fill': 'help-circle',
  'photo.on.rectangle.angled': 'image-multiple-outline',
  'photo.on.rectangle': 'image-outline',
  'person.fill': 'account',
  'person': 'account-outline',
  'person.crop.circle': 'account-circle-outline',
  'heart.text.clipboard': 'clipboard-pulse-outline',
  'plus': 'plus',
  'arrow.right': 'arrow-right',
  'arrow.left': 'arrow-left',
  'arrow.right.square': 'logout',
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
  'checkmark': 'check',
  'chevron.left': 'chevron-left',
  'chevron.right': 'chevron-right',
  'pencil': 'pencil-outline',
  'envelope': 'email-outline',
  'envelope.badge.fill': 'email-check',
  'lock': 'lock-outline',
  'lock.fill': 'lock',
  'iphone': 'cellphone',
  'iphone.slash': 'cellphone-off',
  'doc.on.doc': 'content-copy',
  'exclamationmark.triangle': 'alert-outline',
  'clock.badge.exclamationmark': 'clock-alert-outline',
  'lightbulb': 'lightbulb-outline',
  'lightbulb.fill': 'lightbulb-on',
  'plus.app': 'plus-box-outline',
  'plus.app.fill': 'plus-box',
  'plus.circle.fill': 'plus-circle',
  'bell.badge': 'bell-badge-outline',
  'tray': 'tray-arrow-down',
  'tray.fill': 'tray-full',
  'info.circle.fill': 'information',
  'arrow.down.circle.fill': 'arrow-down-circle',
  'video.fill': 'video',
  'mic.fill': 'microphone',
  'stop.fill': 'stop',
  'note.text': 'note-text-outline',
  'photo.fill': 'image',
  'sparkles': 'auto-fix',
  'exclamationmark.circle': 'alert-circle-outline',
  'brain.head.profile': 'brain',
  'sparkles': 'auto-fix',
  'gauge.with.dots.needle.50percent': 'speedometer-medium',
  'flame.fill': 'fire',
  'face.smiling': 'emoticon-happy-outline',
  'moon.stars.fill': 'weather-night',
  'sun.max.fill': 'white-balance-sunny',
  'moon.fill': 'weather-night',
  'gear': 'cog',
  'chevron.up': 'chevron-up',
  'chevron.down': 'chevron-down',
  'person.badge.minus': 'account-remove-outline',
  'checkmark.circle': 'check-circle-outline',
  'scope': 'target',
  'flag.fill': 'flag',
};

interface AppIconProps {
  iosName: SFSymbol;
  androidFallback: string;
  size?: number;
  color?: string;
  weight?: 'ultraLight' | 'thin' | 'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy' | 'black';
  style?: StyleProp<ViewStyle>;
}

// SF Symbols via expo-symbols require iOS 16+
const supportsSymbols =
  Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 16;

export function AppIcon({
  iosName,
  androidFallback,
  size = 22,
  color,
  weight = 'medium',
  style,
}: AppIconProps) {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  const resolvedColor = color ?? themeColors.textDark;

  if (supportsSymbols) {
    return (
      <SymbolView
        name={iosName}
        size={size}
        tintColor={resolvedColor}
        weight={weight}
        style={[{ width: size, height: size }, style]}
      />
    );
  }

  const materialName = SF_TO_MATERIAL[iosName as string];
  if (materialName) {
    return (
      <MaterialCommunityIcons
        name={materialName}
        size={size}
        color={resolvedColor}
        style={style}
      />
    );
  }

  return (
    <View style={[styles.androidContainer, { width: size, height: size }, style]}>
      <MaterialCommunityIcons
        name="help-circle-outline"
        size={size}
        color={resolvedColor}
      />
    </View>
  );
}

const getStyles = (isDark: boolean) => {
  const themeColors = isDark ? darkColors : lightColors;
  return StyleSheet.create({
  androidContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
};
// Styles are created per-render via `getStyles(isDark)` in `AppIcon`.
