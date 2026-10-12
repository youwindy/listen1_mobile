/**
 * Reorder the user's playlists.
 * Replaces `reorder.screen.js`.
 *
 * Deliberate deviation: the legacy screen delegated drag-and-drop to
 * `react-native-sortable-listview`, which is unmaintained and is not a
 * dependency of the rewrite (and must not be re-added). Each row therefore gets
 * explicit 上移/下移 controls instead of a drag handle. Every move is applied to
 * the store immediately, so the 保存 action only dismisses the screen.
 */
import { useCallback, useLayoutEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MyPlaylist } from '../api/types';
import { AppText } from '../components/AppText';
import { EmptyState, HeaderButton } from '../components/HeaderButton';
import { Screen } from '../components/Screen';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { FAVORITE_PLAYLIST_ID, useMyPlaylistStore } from '../store/myPlaylist';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<RootStackParamList, 'Reorder'>;

export function ReorderScreen({ navigation }: Props) {
  const theme = useTheme();

  const playlists = useMyPlaylistStore((state) => state.playlists);

  const orderedPlaylists = useMemo(() => {
    const favorites = playlists.filter((playlist) => playlist.info.id === FAVORITE_PLAYLIST_ID);
    const rest = playlists.filter((playlist) => playlist.info.id !== FAVORITE_PLAYLIST_ID);

    return [...favorites, ...rest];
  }, [playlists]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <HeaderButton label="保存" accent onPress={() => navigation.goBack()} />,
    });
  }, [navigation]);

  const move = useCallback(
    (index: number, offset: number) => {
      const target = index + offset;
      if (target < 0 || target >= orderedPlaylists.length) return;

      const next = [...orderedPlaylists];
      const moved = next[index];
      next[index] = next[target];
      next[target] = moved;

      useMyPlaylistStore.getState().reorderPlaylists(next);
    },
    [orderedPlaylists]
  );

  return (
    <Screen>
      <FlashList
        data={orderedPlaylists}
        keyExtractor={(item: MyPlaylist) => item.info.id}
        renderItem={({ item, index }: { item: MyPlaylist; index: number }) => {
          const isFavorite = item.info.id === FAVORITE_PLAYLIST_ID;
          // Favourites are pinned first, so the topmost movable playlist sits at
          // index 1 and cannot move up into the pinned slot.
          const canMoveUp = !isFavorite && index > 1;
          const canMoveDown = !isFavorite && index < orderedPlaylists.length - 1;

          return (
            <View style={[styles.row, { borderBottomColor: theme.borderColor }]}>
              <View style={styles.rowInfo}>
                <AppText variant="subtitle" numberOfLines={1}>
                  {item.info.title}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  共 {item.tracks.length} 首
                  {isFavorite ? ' · 固定在最前' : ''}
                </AppText>
              </View>

              <Pressable
                onPress={() => move(index, -1)}
                disabled={!canMoveUp}
                hitSlop={8}
                style={styles.action}
              >
                <AppText tone={canMoveUp ? 'accent' : 'disabled'}>上移</AppText>
              </Pressable>
              <Pressable
                onPress={() => move(index, 1)}
                disabled={!canMoveDown}
                hitSlop={8}
                style={styles.action}
              >
                <AppText tone={canMoveDown ? 'accent' : 'disabled'}>下移</AppText>
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState title="没有可排序的歌单" description="先在“我的歌单”中新建歌单" />
        }
        ListFooterComponent={
          orderedPlaylists.length > 1 ? (
            <AppText variant="caption" tone="tertiary" center style={styles.hint}>
              调整顺序后即时生效，点击“保存”返回
            </AppText>
          ) : null
        }
        contentContainerStyle={styles.listContent}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  rowInfo: { flex: 1, gap: 4 },
  action: { paddingVertical: 4 },
  hint: { paddingTop: 14 },
});
