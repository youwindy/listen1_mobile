import { Pressable, StyleSheet, View } from 'react-native';

import type { Track } from '../api/types';
import { getPlatformName } from '../api/client';
import { useTheme } from '../theme/useTheme';
import { AppText } from './AppText';

export interface TrackRowProps {
  track: Track;
  /** Highlight as the currently playing track. */
  isPlaying?: boolean;
  /** Show the filled heart. */
  isFavorite?: boolean;
  onPress(track: Track): void;
  onLongPress?(track: Track): void;
  /** Trailing affordance, e.g. a "more" button. */
  right?: React.ReactNode;
}

/** A single song row: title, artist · album and platform badge. */
export function TrackRow({
  track,
  isPlaying = false,
  isFavorite = false,
  onPress,
  onLongPress,
  right,
}: TrackRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => onPress(track)}
      onLongPress={onLongPress ? () => onLongPress(track) : undefined}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.borderColor },
        pressed && { opacity: 0.6 },
      ]}
    >
      <View style={styles.main}>
        <AppText
          variant="subtitle"
          numberOfLines={1}
          style={isPlaying ? { color: theme.playingColor } : undefined}
        >
          {track.title}
        </AppText>
        <View style={styles.metaRow}>
          <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.meta}>
            {track.artist}
            {track.album ? ` · ${track.album}` : ''}
          </AppText>
          <AppText variant="caption" tone={track.disabled ? 'disabled' : 'tertiary'}>
            {track.disabled ? '不可播放' : getPlatformName(track.source)}
          </AppText>
        </View>
      </View>

      {isFavorite ? (
        <AppText variant="caption" style={{ color: theme.accentColor }}>
          ♥
        </AppText>
      ) : null}
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  main: { flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  meta: { flexShrink: 1 },
});
