/**
 * Bottom sheet: add the given track to one of the user's playlists.
 * Replaces `add-to-playlist-popup.screen.js`.
 */
import { StyleSheet, Pressable, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AppText } from '../components/AppText';
import { EmptyState, HeaderButton } from '../components/HeaderButton';
import { Screen } from '../components/Screen';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useMyPlaylistStore, type MyPlaylist } from '../store/myPlaylist';
import { useTheme } from '../theme/useTheme';

type Props = NativeStackScreenProps<RootStackParamList, 'AddToPlaylist'>;

export function AddToPlaylistScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const { track } = route.params;

  const playlists = useMyPlaylistStore((state) => state.playlists);
  const addToPlaylist = useMyPlaylistStore((state) => state.addToPlaylist);
  const createPlaylist = useMyPlaylistStore((state) => state.createPlaylist);

  const onAdd = (playlistId: string) => {
    addToPlaylist(playlistId, track);
    navigation.goBack();
  };

  const onCreate = () => {
    // Default title mirrors the legacy "新建歌单" flow, which then asks for a name
    // on the dedicated screen; here we only need a container for this track.
    const info = createPlaylist(`新建歌单 ${playlists.length}`);

    onAdd(info.id);
  };

  return (
    <Screen>
      <View style={[styles.header, { borderBottomColor: theme.borderColor }]}>
        <View style={styles.headerText}>
          <AppText variant="subtitle" numberOfLines={1}>
            {track.title}
          </AppText>
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            {track.artist}
          </AppText>
        </View>
        <HeaderButton label="新建歌单" accent onPress={onCreate} />
      </View>

      <FlashList
        data={playlists}
        keyExtractor={(item: MyPlaylist) => item.info.id}
        renderItem={({ item }: { item: MyPlaylist }) => {
          const alreadyAdded = item.tracks.some((entry) => entry.id === track.id);

          return (
            <Pressable
              onPress={() => onAdd(item.info.id)}
              disabled={alreadyAdded}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: theme.borderColor },
                pressed && { opacity: 0.6 },
              ]}
            >
              <View style={styles.rowText}>
                <AppText variant="body" numberOfLines={1} tone={alreadyAdded ? 'disabled' : 'primary'}>
                  {item.info.title}
                </AppText>
                <AppText variant="caption" tone="tertiary">
                  {item.tracks.length} 首
                </AppText>
              </View>
              {alreadyAdded ? (
                <AppText variant="caption" tone="tertiary">
                  已添加
                </AppText>
              ) : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={<EmptyState title="还没有歌单" description="点击右上角新建一个" />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerText: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1 },
});
