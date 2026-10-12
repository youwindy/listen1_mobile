/**
 * Paginated browse data for one platform tab.
 *
 * Extracted from the legacy `playlist-tabs.screen.js` + `playlist-grid.screen.js`
 * pair, which each re-implemented paging, loading flags and error handling.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { showPlaylist } from '../api/client';
import type { PlatformId, PlaylistInfo } from '../api/types';

export interface PlatformBrowseState {
  items: PlaylistInfo[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore(): void;
  refresh(): void;
}

export function usePlatformBrowse(platformId: PlatformId): PlatformBrowseState {
  const [items, setItems] = useState<PlaylistInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Guards against overlapping requests when the list is scrolled quickly.
  const inFlight = useRef(false);
  const nextOffset = useRef(0);

  const load = useCallback(
    async (offset: number, replace: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;

      if (replace) setIsLoading(true);
      else setIsLoadingMore(true);
      setError(null);

      try {
        const page = await showPlaylist(offset, platformId);
        const fresh = page.result ?? [];

        setItems((current) => (replace ? fresh : [...current, ...fresh]));
        // Platforms signal the end either explicitly or by returning nothing.
        setHasMore(page.hasNextPage ?? fresh.length > 0);
        nextOffset.current = offset + 1;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '加载失败');
        setHasMore(false);
      } finally {
        inFlight.current = false;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [platformId]
  );

  useEffect(() => {
    nextOffset.current = 0;
    setItems([]);
    setHasMore(true);
    void load(0, true);
  }, [load]);

  const loadMore = useCallback(() => {
    if (!hasMore || inFlight.current) return;
    void load(nextOffset.current, false);
  }, [hasMore, load]);

  const refresh = useCallback(() => {
    nextOffset.current = 0;
    void load(0, true);
  }, [load]);

  return { items, isLoading, isLoadingMore, error, hasMore, loadMore, refresh };
}
