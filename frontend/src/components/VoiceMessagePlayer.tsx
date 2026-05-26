import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { darkColors, lightColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';
import { AppIcon } from './AppIcon';

const WAVEFORM_BARS = [10, 18, 13, 24, 16, 30, 20, 12, 28, 17, 23, 14, 32, 18, 25, 12, 21, 30, 16, 24, 13, 19, 29, 15];

interface VoiceMessagePlayerProps {
  uri: string;
  style?: StyleProp<ViewStyle>;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function VoiceMessagePlayer({ uri, style }: VoiceMessagePlayerProps) {
  const { isDark, colors: themeColors } = useTheme();
  const styles = getStyles(isDark);
  const inactiveWaveColor = isDark ? 'rgba(235, 247, 239, 0.28)' : 'rgba(30, 77, 48, 0.22)';
  const source = useMemo(() => ({ uri }), [uri]);
  const shouldDownloadFirst = /^https?:\/\//i.test(uri);
  const player = useAudioPlayer(source, { updateInterval: 200, downloadFirst: shouldDownloadFirst });
  const status = useAudioPlayerStatus(player);
  const [waveformWidth, setWaveformWidth] = useState(1);
  const [playError, setPlayError] = useState(false);

  const duration = Number.isFinite(status.duration) ? Math.max(status.duration, 0) : 0;
  const currentTime = Number.isFinite(status.currentTime)
    ? Math.max(0, Math.min(status.currentTime, duration || status.currentTime))
    : 0;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const isPreparing = !status.isLoaded || (status.isBuffering && !status.playing);
  const timeLabel = isPreparing
    ? '--:--'
    : status.playing && duration > 0
    ? formatDuration(Math.max(duration - currentTime, 0))
    : formatDuration(duration || currentTime);

  const togglePlayback = useCallback(async () => {
    setPlayError(false);
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'mixWithOthers',
      });
      if (isPreparing) return;
      if (status.playing) {
        player.pause();
        return;
      }

      if (duration > 0 && currentTime >= duration - 0.15) {
        await player.seekTo(0);
      }
      player.play();
    } catch {
      setPlayError(true);
    }
  }, [currentTime, duration, isPreparing, player, status.playing]);

  const handleWaveformLayout = useCallback((event: LayoutChangeEvent) => {
    setWaveformWidth(Math.max(1, event.nativeEvent.layout.width));
  }, []);

  const handleWaveformPress = useCallback((event: GestureResponderEvent) => {
    if (duration <= 0) return;
    const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / waveformWidth));
    player.seekTo(duration * ratio).catch(() => setPlayError(true));
  }, [duration, player, waveformWidth]);

  return (
    <View style={[styles.shell, style]}>
      <View style={styles.playerRow}>
        <TouchableOpacity
          style={styles.playButton}
          onPress={togglePlayback}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={status.playing ? 'Pause voice message' : 'Play voice message'}
        >
          {isPreparing ? (
            <ActivityIndicator size="small" color={themeColors.neutralLight} />
          ) : (
            <AppIcon
              iosName={status.playing ? 'pause.fill' : 'play.fill'}
              androidFallback={status.playing ? 'Pause' : 'Play'}
              size={18}
              color={themeColors.neutralLight}
            />
          )}
        </TouchableOpacity>

        <Pressable
          style={styles.waveform}
          onLayout={handleWaveformLayout}
          onPress={handleWaveformPress}
          accessibilityRole="adjustable"
          accessibilityLabel="Voice message progress"
        >
          {WAVEFORM_BARS.map((height, index) => {
            const filled = progress >= (index + 0.5) / WAVEFORM_BARS.length;
            return (
              <View
                key={`${height}-${index}`}
                style={[
                  styles.waveformBar,
                  {
                    height,
                    backgroundColor: filled ? themeColors.secondary : inactiveWaveColor,
                  },
                ]}
              />
            );
          })}
        </Pressable>

        <Text style={styles.timeText}>{timeLabel}</Text>
      </View>
      {playError && <Text style={styles.errorText}>Audio unavailable</Text>}
    </View>
  );
}

const getStyles = (isDark: boolean) => {
  const themeColors = isDark ? darkColors : lightColors;
  return StyleSheet.create({
    shell: {
      width: '100%',
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: isDark ? 'rgba(155, 231, 180, 0.14)' : '#DDF3E5',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(155, 231, 180, 0.22)' : 'rgba(30, 77, 48, 0.12)',
    },
    playerRow: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    playButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: themeColors.secondary,
    },
    waveform: {
      flex: 1,
      minWidth: 0,
      height: 40,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 2,
    },
    waveformBar: {
      width: 3,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(235, 247, 239, 0.28)' : 'rgba(30, 77, 48, 0.22)',
    },
    timeText: {
      width: 42,
      textAlign: 'right',
      fontFamily: typography.fontFamily.medium,
      fontSize: 12,
      color: themeColors.textMuted,
    },
    errorText: {
      marginLeft: 52,
      marginTop: 2,
      fontFamily: typography.fontFamily.medium,
      fontSize: 12,
      color: isDark ? '#FFB4A8' : '#C0392B',
    },
  });
};
