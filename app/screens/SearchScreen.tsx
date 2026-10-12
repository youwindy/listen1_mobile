/**
 * Search across the enabled platforms.
 * Replaces `search.screen.js`. Results can be played directly, favourited, or
 * queued next — the three actions the legacy result rows exposed.
 */
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';

import { getPlatforms, search as searchApi } from '../api/client';
import type { PlatformId, Track } from '../api/types';
import { AppText } from '../components/AppText';
import { EmptyState } from '../components/HeaderButton';
import { MiniPlayer } from '../components/MiniPlayer';
import { Screen } from '../components/Screen';
import { TrackRow } from '../components/TrackRow';
import { useMyPlaylistStore } from '../store/myPlaylist';
import { usePlayerStore } from '../store/player';
import { useTheme } from '../theme/useTheme';

export function SearchScreen() {
  const theme = useTheme();
  const platforms = getPlatforms();

  const [platformId, setPlatformId] = useState<PlatformId>(platforms[0].platformId);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const inFlight = useRef(false);

  const nowplayingTrack = usePlayerStore((state) => state.nowplayingTrack);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const addNextTrack = usePlayerStore((state) => state.addNextTrack);
  const favoriteIds = useMyPlaylistStore((state) => state.favoriteIds);
  const addToFavorite = useMyPlaylistStore((state) => state.addToFavorite);

  const runSearch = useCallback(
    async (searchKeyword: string, searchPage: number, target: PlatformId) => {
      if (inFlight.current || searchKeyword.trim() === '') return;
      inFlight.current = true;

      if (searchPage === 1) setIsLoading(true);
      else setIsLoadingMore(true);
      setError(null);

      try {
        const pageResult = await searchApi(searchKeyword.trim(), searchPage, target);
        const tracks = pageResult.result ?? [];

        setResults((current) => (searchPage === 1 ? tracks : [...current, ...tracks]));
        setPage(searchPage);
        setHasMore(tracks.length > 0);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '搜索失败');
        setHasMore(false);
      } finally {
        inFlight.current = false;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    []
  );

  const onSubmit = useCallback(() => {
    void runSearch(keyword, 1, platformId);
  }, [keyword, platformId, runSearch]);

  const onSelectPlatform = useCallback(
    (next: PlatformId) => {
      setPlatformId(next);
      // Re-run against the new platform so the results match the active tab.
      if (keyword.trim() !== '') void runSearch(keyword, 1, next);
    },
    [keyword, runSearch]
  );

  const play = useCallback(
    (track: Track) => {
      // Disabled tracks are known to be VIP/region locked, so don't fight it.
      if (track.disabled) {
        setError(`《${track.title}》在当前平台不可播放`);

        return;
      }
      playTrack(track);
    },
    [playTrack]
  );

  return (
    <Screen>
      <View style={[styles.searchBar, { borderBottomColor: theme.borderColor }]}>
        <TextInput
          value={keyword}
          onChangeText={setKeyword}
          onSubmitEditing={onSubmit}
          placeholder="搜索歌曲"
          placeholderTextColor={theme.thirdColor}
          returnKeyType="search"
          style={[
            styles.input,
            { backgroundColor: theme.windowColor, color: theme.primaryColor },
          ]}
        />
        <Pressable onPress={onSubmit} hitSlop={8}>
          <AppText tone="accent">搜索</AppText>
        </Pressable>
      </View>

      <View style={[styles.tabs, { borderBottomColor: theme.borderColor }]}>
        {platforms.map((platform) => {
          const isActive = platform.platformId === platformId;

          return (
            <Pressable
              key={platform.platformId}
              onPress={() => onSelectPlatform(platform.platformId)}
              style={styles.tab}
            >
              <AppText
                variant="body"
                style={{ color: isActive ? theme.accentColor : theme.secondaryColor }}
              >
                {platform.name}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accentColor} />
        </View>
      ) : (
        <FlashList
          data={results}
          keyExtractor={(item: Track) => item.id}
          renderItem={({ item }: { item: Track }) => (
            <TrackRow
              track={item}
              isPlaying={nowplayingTrack?.id === item.id}
              isFavorite={favoriteIds[item.id] !== undefined}
              onPress={play}
              onLongPress={(track) => addNextTrack(track)}
              right={
                <Pressable hitSlop={8} onPress={() => addToFavorite(item)}>
                  <AppText variant="caption" tone={favoriteIds[item.id] ? 'accent' : 'tertiary'}>
                    ♥
                  </AppText>
                </Pressable>
              }
            />
          )}
          onEndReached={() => {
            if (hasMore && !inFlight.current) {
              void runSearch(keyword, page + 1, platformId);
            }
          }}
          onEndReachedThreshold={0.6}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color={theme.accentColor} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            error ? (
              <EmptyState title="搜索失败" description={error} />
            ) : (
              <EmptyState title="输入关键词开始搜索" description="长按结果可插播到下一首" />
            )
          }
        />
      )}

      {error && results.length > 0 ? (
        <AppText variant="caption" tone="accent" style={styles.inlineError}>
          {error}
        </AppText>
      ) : null}

      <MiniPlayer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingVertical: 16 },
  inlineError: { paddingHorizontal: 16, paddingBottom: 6 },
});
