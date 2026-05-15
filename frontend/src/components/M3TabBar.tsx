import React, { useEffect, useRef } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, lightColors, darkColors } from '../theme/colors';
import { typography } from '../theme/typography';

interface M3TabBarProps extends BottomTabBarProps {
  accentColor?: string;
}

export function M3TabBar({
  state,
  descriptors,
  navigation,
  accentColor,
}: M3TabBarProps) {
  const insets = useSafeAreaInsets();
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  const currentAccent = accentColor || themeColors.primary;

  return (
    <View style={[styles.outer, { paddingBottom: insets.bottom }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = (options.tabBarLabel ?? options.title ?? route.name) as string;
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <M3Tab
              key={route.key}
              label={label}
              isFocused={isFocused}
              onPress={onPress}
              onLongPress={onLongPress}
              accentColor={currentAccent}
              icon={options.tabBarIcon}
              badge={typeof options.tabBarBadge === 'number' ? options.tabBarBadge : undefined}
            />
          );
        })}
      </View>
    </View>
  );
}

interface M3TabProps {
  label: string;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  accentColor: string;
  icon?: (props: { focused: boolean; color: string; size: number }) => React.ReactNode;
  badge?: number;
}

function M3Tab({ label, isFocused, onPress, onLongPress, accentColor, icon, badge }: M3TabProps) {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  const pillScale = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const iconShift = useRef(new Animated.Value(isFocused ? -2 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(pillScale, {
        toValue: isFocused ? 1 : 0,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.spring(iconShift, {
        toValue: isFocused ? -2 : 0,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isFocused]);

  const iconColor = isFocused ? accentColor : themeColors.textMuted;

  return (
    <TouchableOpacity
      style={styles.tab}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
    >
      <View style={styles.iconContainer}>
        <Animated.View
          style={[
            styles.activePill,
            {
              backgroundColor: isDark ? accentColor + '26' : accentColor + '1A',
              transform: [
                { scaleX: pillScale },
                { scaleY: pillScale },
              ],
              opacity: pillScale,
            },
          ]}
        />
        <Animated.View style={{ transform: [{ translateY: iconShift }] }}>
          {icon?.({ focused: isFocused, color: iconColor, size: 24 })}
        </Animated.View>
        {badge != null && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </View>
      <Text
        style={[
          styles.label,
          {
            color: isFocused ? accentColor : themeColors.textMuted,
            fontFamily: isFocused ? typography.fontFamily.bold : typography.fontFamily.medium,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const getStyles = (isDark: boolean) => {
  const themeColors = isDark ? darkColors : lightColors;
  return StyleSheet.create({
  outer: {
    backgroundColor: themeColors.neutralLight,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: (isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0, 0, 0, 0.06)'),
  },
  bar: {
    flexDirection: 'row',
    paddingVertical: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  iconContainer: {
    width: 64,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  activePill: {
    position: 'absolute',
    width: 64,
    height: 32,
    borderRadius: 16,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: (isDark ? '#FFB4A8' : '#C0392B'),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: themeColors.neutralLight,
  },
  badgeText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
    color: '#fff',
    includeFontPadding: false,
  },
  label: {
    fontSize: 12,
    marginTop: 2,
    letterSpacing: 0.3,
  },
});
};
 
