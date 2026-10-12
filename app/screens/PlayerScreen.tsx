/**
 * Full-screen player.
 *
 * Replaces `modal-player.screen.js` + `player-control.screen.js` + `player-info.screen.js`
 * from the legacy app. The modal is now a React Navigation screen with
 * `presentation: 'modal'`, and seeking goes through the store's `pendingSeek`
 * field so the `PlaybackBridge` can apply it to the native player.
 */
import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useNavigation } from '@react-navigation/native';

import { getPlatformName } from '../api/client';
import { PlayMode } from '../api/types';
import { AppText } from '../components/AppText';
import { Screen } from '../components/Screen';
import { useMyPlaylistStore } from '../store/myPlaylist';
import { usePlayerStore } from '../store/player';
import { useTheme } from '../theme/useTheme';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);

  return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const PLAY_MODE_LABEL: Record<number, string> = {
  [PlayMode.LOOP]: '列表循环',
  [PlayMode.SHUFFLE]: '随机播放',
  [PlayMode.REPEAT_ONE]: '单曲循环',
};

export function PlayerScreen() {
  const theme = useTheme();
  const navigation = useNavigation();

  const track = usePlayerStore((state) => state.nowplayingTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const current = usePlayerStore((state) => state.current);
  const duration = usePlayerStore((state) => state.duration);
  const playMode = usePlayerStore((state) => state.playMode);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const next = usePlayerStore((state) => state.next);
  const prev = usePlayerStore((state) => state.prev);
  const cyclePlayMode = usePlayerStore((state) => state.cyclePlayMode);
  const seekTo = usePlayerStore((state) => state.seekTo);

  const favoriteIds = useMyPlaylistStore((state) => state.favoriteIds);
  const addToFavorite = useMyPlaylistStore((state) => state.addToFavorite);
  const removeFromFavorite = useMyPlaylistStore((state) => state.removeFromFavorite);

  // Local value so the thumb tracks the finger instead of the playback clock.
  const [dragValue, setDragValue] = useState<number | null>(null);
  const sliderValue = dragValue ?? current;
  const isFavorite = track ? favoriteIds[track.id] !== undefined : false;

  const onToggleFavorite = useCallback(() => {
    if (!track) return;
    if (isFavorite) removeFromFavorite(track.id);
    else addToFavorite(track);
  }, [addToFavorite, isFavorite, removeFromFavorite, track]);

  if (!track) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.center}>
          <AppText tone="secondary">还没有正在播放的歌曲</AppText>
          <Pressable onPress={() => navigation.goBack()} style={styles.closeArea}>
            <AppText tone="accent">返回</AppText>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <AppText variant="title">⌄</AppText>
        </Pressable>
        <AppText variant="caption" tone="tertiary">
          {getPlatformName(track.source)}
        </AppText>
        <Pressable onPress={onToggleFavorite} hitSlop={10}>
          <AppText variant="title" style={{ color: isFavorite ? theme.accentColor : theme.thirdColor }}>
            {isFavorite ? '♥' : '♡'}
          </AppText>
        </Pressable>
      </View>

      <View style={styles.artworkArea}>
        <Image
          source={track.img_url ? { uri: track.img_url } : require('../assets/images/logo.png')}
          style={[styles.artwork, { backgroundColor: theme.windowColor }]}
          resizeMode="cover"
        />
      </View>

      <View style={styles.meta}>
        <AppText variant="title" numberOfLines={2} center>
          {track.title}
        </AppText>
        <AppText variant="body" tone="secondary" numberOfLines={1} center>
          {track.artist}
          {track.album ? ` · ${track.album}` : ''}
        </AppText>
      </View>

      <View style={styles.progressArea}>
        <Slider
          value={sliderValue}
          minimumValue={0}
          maximumValue={duration > 0 ? duration : 1}
          minimumTrackTintColor={theme.accentColor}
          maximumTrackTintColor={theme.borderColor}
          thumbTintColor={theme.accentColor}
          onValueChange={setDragValue}
          onSlidingComplete={(value) => {
            setDragValue(null);
            seekTo(value);
          }}
        />
        <View style={styles.timeRow}>
          <AppText variant="caption" tone="tertiary">
            {formatTime(sliderValue)}
          </AppText>
          <AppText variant="caption" tone="tertiary">
            {formatTime(duration)}
          </AppText>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable onPress={cyclePlayMode} hitSlop={10} style={styles.control}>
          <AppText variant="caption" tone="secondary">
            {PLAY_MODE_LABEL[playMode] ?? '列表循环'}
          </AppText>
        </Pressable>

        <Pressable onPress={prev} hitSlop={10} style={styles.control}>
          <AppText variant="title">⏮</AppText>
        </Pressable>

        <Pressable
          onPress={togglePlay}
          hitSlop={10}
          style={[styles.playButton, { backgroundColor: theme.accentColor }]}
        >
          <AppText variant="title" style={{ color: theme.backgroundColor }}>
            {isPlaying ? '❚❚' : '▶'}
          </AppText>
        </Pressable>

        <Pressable onPress={next} hitSlop={10} style={styles.control}>
          <AppText variant="title">⏭</AppText>
        </Pressable>

        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.control}
        >
          <AppText variant="caption" tone="secondary">
            收起
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  closeArea: { padding: 8 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  artworkArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  artwork: { width: '100%', aspectRatio: 1, borderRadius: 12 },
  meta: { paddingHorizontal: 24, gap: 4, marginBottom: 12 },
  progressArea: { paddingHorizontal: 20 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingBottom: 18,
    paddingTop: 8,
  },
  control: { minWidth: 44, alignItems: 'center' },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
