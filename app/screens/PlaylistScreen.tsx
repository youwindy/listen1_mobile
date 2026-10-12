/**
 * Playlist detail: header with cover/title plus the track list.
 * Replaces `playlist.screen.js`; playing a row seeds the queue with the whole
 * playlist, which is what the legacy `PLAY_TRACK_IN_PLAYLIST` action did.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getPlaylist } from '../api/client';
import type { PlaylistDetail, Track } from '../api/types';
import { AppText } from '../components/AppText';
import { EmptyState, HeaderButton } from '../components/HeaderButton';
import { MiniPlayer } from '../components/MiniPlayer';
import { Screen } from '../components/Screen';
import { TrackRow } from '../components/TrackRow';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useMyPlaylistStore } from '../store/myPlaylist';
import { usePlayerStore } from '../store/player';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<RootStackParamList, 'Playlist'>;

export function PlaylistScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const { playlistId } = route.params;

  const [detail, setDetail] = useState<PlaylistDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const playTrackInPlaylist = usePlayerStore((state) => state.playTrackInPlaylist);
  const playTracks = usePlayerStore((state) => state.playTracks);
  const nowplayingTrack = usePlayerStore((state) => state.nowplayingTrack);
  const addToFavorite = useMyPlaylistStore((state) => state.addToFavorite);
  const favoriteIds = useMyPlaylistStore((state) => state.favoriteIds);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setDetail(await getPlaylist(playlistId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '歌单加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [playlistId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (detail) navigation.setOptions({ title: detail.info.title });
  }, [detail, navigation]);

  const onPressTrack = useCallback(
    (track: Track) => {
      if (!detail) return;
      playTrackInPlaylist(track, detail.tracks);
    },
    [detail, playTrackInPlaylist]
  );

  const onLongPressTrack = useCallback(
    (track: Track) => {
      Alert.alert(track.title, undefined, [
        { text: '收藏到我喜欢', onPress: () => addToFavorite(track) },
        { text: '取消', style: 'cancel' },
      ]);
    },
    [addToFavorite]
  );

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={theme.accentColor} />
        </View>
      </Screen>
    );
  }

  if (error || !detail) {
    return (
      <Screen>
        <EmptyState
          title="歌单加载失败"
          description={error ?? undefined}
          action={
            <Pressable onPress={load}>
              <AppText tone="accent">点击重试</AppText>
            </Pressable>
          }
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlashList
        data={detail.tracks}
        keyExtractor={(item: Track) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Image
              source={
                detail.info.cover_img_url
                  ? { uri: detail.info.cover_img_url }
                  : require('../assets/images/logo.png')
              }
              style={[styles.cover, { backgroundColor: theme.windowColor }]}
            />
            <View style={styles.headerInfo}>
              <AppText variant="subtitle" numberOfLines={3}>
                {detail.info.title}
              </AppText>
              <AppText variant="caption" tone="secondary">
                共 {detail.tracks.length} 首
              </AppText>
              <HeaderButton label="播放全部" accent onPress={() => playTracks(detail.tracks)} />
            </View>
          </View>
        }
        renderItem={({ item }: { item: Track }) => (
          <TrackRow
            track={item}
            isPlaying={nowplayingTrack?.id === item.id}
            isFavorite={favoriteIds[item.id] !== undefined}
            onPress={onPressTrack}
            onLongPress={onLongPressTrack}
          />
        )}
        ListEmptyComponent={<EmptyState title="这个歌单还没有歌曲" />}
        contentContainerStyle={styles.listContent}
      />
      <MiniPlayer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingBottom: 12 },
  header: { flexDirection: 'row', padding: 16, gap: 14 },
  cover: { width: 110, height: 110, borderRadius: 6 },
  headerInfo: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
});
