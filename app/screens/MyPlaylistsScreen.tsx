/**
 * The user's own playlists, favourites pinned first.
 * Replaces `myplaylist-list.screen.js`.
 *
 * The legacy screen pushed a generic `Details` route to show a local playlist;
 * the rewrite has no route for local playlists, so the track list is a second
 * view state of this screen (`selectedPlaylistId`).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MyPlaylist, Track } from '../api/types';
import { AppText } from '../components/AppText';
import { EmptyState, HeaderButton } from '../components/HeaderButton';
import { MiniPlayer } from '../components/MiniPlayer';
import { Screen } from '../components/Screen';
import { TrackRow } from '../components/TrackRow';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { FAVORITE_PLAYLIST_ID, useMyPlaylistStore } from '../store/myPlaylist';
import { usePlayerStore } from '../store/player';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<RootStackParamList, 'MyPlaylists'>;

/**
 * Local playlists store the bundled logo path in `cover_img_url`, which only
 * `require` can resolve — the legacy `AImage` wrapper did the same switch.
 */
function coverSource(url: string): ImageSourcePropType {
  return url.startsWith('http') ? { uri: url } : require('../assets/images/logo.png');
}

export function MyPlaylistsScreen({ navigation }: Props) {
  const theme = useTheme();

  const playlists = useMyPlaylistStore((state) => state.playlists);
  const favoriteIds = useMyPlaylistStore((state) => state.favoriteIds);
  const nowplayingTrack = usePlayerStore((state) => state.nowplayingTrack);
  const playTracks = usePlayerStore((state) => state.playTracks);

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  // The store keeps favourites first, but a stale persisted order should never
  // be able to push them down the list.
  const orderedPlaylists = useMemo(() => {
    const favorites = playlists.filter((playlist) => playlist.info.id === FAVORITE_PLAYLIST_ID);
    const rest = playlists.filter((playlist) => playlist.info.id !== FAVORITE_PLAYLIST_ID);

    return [...favorites, ...rest];
  }, [playlists]);

  const selectedPlaylist = useMemo(
    () =>
      selectedPlaylistId === null
        ? null
        : orderedPlaylists.find((playlist) => playlist.info.id === selectedPlaylistId) ?? null,
    [orderedPlaylists, selectedPlaylistId]
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <HeaderButton label="新建" onPress={() => navigation.navigate('CreatePlaylist')} />
          <HeaderButton label="排序" onPress={() => navigation.navigate('Reorder')} />
          <HeaderButton label="导入" onPress={() => navigation.navigate('ImportPlaylist')} />
        </View>
      ),
    });
  }, [navigation]);

  useEffect(() => {
    navigation.setOptions({ title: selectedPlaylist ? selectedPlaylist.info.title : '我的歌单' });
  }, [navigation, selectedPlaylist]);

  const onPressTrack = useCallback(
    (track: Track) => {
      if (!selectedPlaylist) return;
      usePlayerStore.getState().playTrackInPlaylist(track, selectedPlaylist.tracks);
    },
    [selectedPlaylist]
  );

  const onLongPressPlaylist = useCallback((playlist: MyPlaylist) => {
    if (playlist.info.id === FAVORITE_PLAYLIST_ID) return;

    Alert.alert('删除歌单', `确定删除《${playlist.info.title}》吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => useMyPlaylistStore.getState().deletePlaylist(playlist.info.id),
      },
    ]);
  }, []);

  if (selectedPlaylist) {
    return (
      <Screen>
        <Pressable
          onPress={() => setSelectedPlaylistId(null)}
          hitSlop={8}
          style={[styles.backBar, { borderBottomColor: theme.borderColor }]}
        >
          <AppText tone="accent">‹ 我的歌单</AppText>
        </Pressable>

        <FlashList
          data={selectedPlaylist.tracks}
          keyExtractor={(item: Track) => item.id}
          ListHeaderComponent={
            <View style={styles.header}>
              <Image
                source={coverSource(selectedPlaylist.info.cover_img_url)}
                style={[styles.cover, { backgroundColor: theme.windowColor }]}
              />
              <View style={styles.headerInfo}>
                <AppText variant="subtitle" numberOfLines={3}>
                  {selectedPlaylist.info.title}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  共 {selectedPlaylist.tracks.length} 首
                </AppText>
                <HeaderButton
                  label="播放全部"
                  accent
                  onPress={() => playTracks(selectedPlaylist.tracks)}
                />
              </View>
            </View>
          }
          renderItem={({ item }: { item: Track }) => (
            <TrackRow
              track={item}
              isPlaying={nowplayingTrack?.id === item.id}
              isFavorite={favoriteIds[item.id] !== undefined}
              onPress={onPressTrack}
            />
          )}
          ListEmptyComponent={<EmptyState title="这个歌单还没有歌曲" />}
          contentContainerStyle={styles.listContent}
        />
        <MiniPlayer />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlashList
        data={orderedPlaylists}
        keyExtractor={(item: MyPlaylist) => item.info.id}
        renderItem={({ item }: { item: MyPlaylist }) => (
          <Pressable
            onPress={() => setSelectedPlaylistId(item.info.id)}
            onLongPress={
              item.info.id === FAVORITE_PLAYLIST_ID
                ? undefined
                : () => onLongPressPlaylist(item)
            }
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: theme.borderColor },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Image
              source={coverSource(item.info.cover_img_url)}
              style={[styles.rowCover, { backgroundColor: theme.windowColor }]}
            />
            <View style={styles.rowInfo}>
              <AppText variant="subtitle" numberOfLines={1}>
                {item.info.title}
              </AppText>
              <AppText variant="caption" tone="secondary">
                共 {item.tracks.length} 首
              </AppText>
            </View>
            {item.info.id === FAVORITE_PLAYLIST_ID ? (
              <AppText variant="caption" style={{ color: theme.accentColor }}>
                ♥
              </AppText>
            ) : null}
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState title="还没有歌单" description="点击右上角“新建”创建歌单" />
        }
        ListFooterComponent={
          orderedPlaylists.length > 1 ? (
            <AppText variant="caption" tone="tertiary" center style={styles.hint}>
              长按歌单可删除
            </AppText>
          ) : null
        }
        contentContainerStyle={styles.listContent}
      />
      <MiniPlayer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  listContent: { paddingBottom: 12 },
  backBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: { flexDirection: 'row', padding: 16, gap: 14 },
  cover: { width: 110, height: 110, borderRadius: 6 },
  headerInfo: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowCover: { width: 50, height: 50, borderRadius: 5 },
  rowInfo: { flex: 1, gap: 4 },
  hint: { paddingTop: 14 },
});
