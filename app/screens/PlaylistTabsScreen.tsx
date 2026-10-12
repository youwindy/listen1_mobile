/**
 * Home screen: one tab per music platform showing its recommended playlists.
 *
 * Replaces `playlist-tabs.screen.js` (react-native-scrollable-tab-view) and
 * `playlist-grid.screen.js` (the vendored `react-native-super-grid`). The tab bar
 * is hand-rolled because React Navigation 7's bottom tabs are for app-level
 * navigation, not for in-page platform switching.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { getPlatforms } from '../api/client';
import type { PlatformId, PlaylistInfo } from '../api/types';
import { AppText } from '../components/AppText';
import { EmptyState } from '../components/HeaderButton';
import { MiniPlayer } from '../components/MiniPlayer';
import { PlaylistCard } from '../components/PlaylistCard';
import { Screen } from '../components/Screen';
import { usePlatformBrowse } from '../hooks/usePlatformBrowse';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../theme/useTheme';

const NUM_COLUMNS = 2;
const GRID_PADDING = 12;
const COLUMN_GAP = 10;

function PlatformGrid({ platformId }: { platformId: PlatformId }) {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const { items, isLoading, isLoadingMore, error, loadMore, refresh } = usePlatformBrowse(platformId);

  const cardSize = Math.floor(
    (width - GRID_PADDING * 2 - COLUMN_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS
  );

  const openPlaylist = useCallback(
    (playlist: PlaylistInfo) => navigation.navigate('Playlist', { playlistId: playlist.id }),
    [navigation]
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accentColor} />
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <EmptyState
        title="加载失败"
        description={error}
        action={
          <Pressable onPress={refresh}>
            <AppText tone="accent">点击重试</AppText>
          </Pressable>
        }
      />
    );
  }

  return (
    <FlashList
      data={items}
      numColumns={NUM_COLUMNS}
      keyExtractor={(item: PlaylistInfo) => item.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }: { item: PlaylistInfo }) => (
        <PlaylistCard playlist={item} size={cardSize} onPress={openPlaylist} />
      )}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      ListFooterComponent={
        isLoadingMore ? (
          <View style={styles.footer}>
            <ActivityIndicator color={theme.accentColor} />
          </View>
        ) : null
      }
      ListEmptyComponent={<EmptyState title="暂无歌单" />}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={refresh} tintColor={theme.accentColor} />
      }
    />
  );
}

export function PlaylistTabsScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const platforms = getPlatforms();
  const [activePlatform, setActivePlatform] = useState<PlatformId>(platforms[0].platformId);

  return (
    <Screen edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.borderColor }]}>
        <AppText variant="title">Listen1</AppText>
        <View style={styles.headerActions}>
          <Pressable hitSlop={8} onPress={() => navigation.navigate('Search', { platformId: activePlatform })}>
            <AppText variant="body">搜索</AppText>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => navigation.navigate('MyPlaylists')}>
            <AppText variant="body">我的</AppText>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => navigation.navigate('Settings')}>
            <AppText variant="body">设置</AppText>
          </Pressable>
        </View>
      </View>

      <View style={[styles.tabs, { borderBottomColor: theme.borderColor }]}>
        {platforms.map((platform) => {
          const isActive = platform.platformId === activePlatform;

          return (
            <Pressable
              key={platform.platformId}
              onPress={() => setActivePlatform(platform.platformId)}
              style={styles.tab}
            >
              <AppText
                variant="subtitle"
                style={{ color: isActive ? theme.accentColor : theme.secondaryColor }}
              >
                {platform.name}
              </AppText>
              {isActive ? (
                <View style={[styles.tabIndicator, { backgroundColor: theme.accentColor }]} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.gridArea}>
        <PlatformGrid platformId={activePlatform} />
      </View>

      <MiniPlayer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerActions: { flexDirection: 'row', gap: 16 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabIndicator: { height: 2, width: 24, borderRadius: 1, marginTop: 6 },
  gridArea: { flex: 1 },
  listContent: { padding: GRID_PADDING },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingVertical: 16 },
});
