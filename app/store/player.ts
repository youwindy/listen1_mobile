/**
 * Playback queue and transport state.
 *
 * This replaces `legacy/src/redux/player.reducer.js`. The legacy reducer kept a
 * separate `shuffleIds` array so that shuffle order survived track insertions;
 * that behaviour is preserved here, because losing it would make "add to queue"
 * jump around while shuffling.
 *
 * `nowplayingTrack` keeps the legacy name so existing backups stay readable.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Track } from '../api/types';
import { PlayMode, type PlayModeValue } from '../api/types';

/** Fisher-Yates shuffle, in place, matching the legacy helper. */
export function shuffleIds(ids: Track['id'][]): Track['id'][] {
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  return ids;
}

export function generateShuffleIds(tracks: Track[]): Track['id'][] {
  return shuffleIds(tracks.map((track) => track.id));
}

/** Wrap an index into range, matching the legacy `safeArrayIndex` behaviour. */
function safeIndex(index: number, length: number): number {
  if (length === 0) return -1;
  if (index < 0) return length - 1;
  if (index >= length) return 0;

  return index;
}

/** Insert `item` directly after the entry matching `targetId`. */
export function insertNextTo<T>(
  array: T[],
  item: T,
  targetId: Track['id'],
  getId: (entry: T) => Track['id']
): T[] {
  const result: T[] = [];

  for (const entry of array) {
    result.push(entry);
    if (getId(entry) === targetId) result.push(item);
  }

  return result;
}

export interface PlayerState {
  playMode: PlayModeValue;
  nowplayingTrack: Track | null;
  volume: number;
  isPlaying: boolean;
  duration: number;
  current: number;
  progress: number;
  isSeeking: boolean;
  /** The active queue. */
  tracks: Track[];
  /** Track ids in shuffle order; only meaningful when playMode is SHUFFLE. */
  shuffleIds: Track['id'][];
  /** Ids that failed to resolve, used to stop after the queue is exhausted. */
  skipIds: Record<string, 1>;
  /** Set while a stream URL is being resolved. */
  isLoadingTrack: boolean;
  /** Set by the seek bar; cleared once the seek has been applied. */
  pendingSeek: number | null;
}

export interface PlayerActions {
  play(): void;
  pause(): void;
  togglePlay(): void;
  /** Append and play a single track (used by "play now" on a search result). */
  playTrack(track: Track): void;
  /** Replace the queue with a playlist's tracks and start at `track`. */
  playTrackInPlaylist(track: Track, tracks: Track[]): void;
  /** Replace the queue wholesale, starting from the first track. */
  playTracks(tracks: Track[]): void;
  addNextTrack(track: Track): void;
  removeTrack(trackId: Track['id']): void;
  next(): void;
  prev(): void;
  /** Advance after the current track could not be resolved. */
  handleLoadFail(): void;
  cyclePlayMode(): void;
  setVolume(volume: number): void;
  /** Called by the playback service with real progress. */
  setProgress(current: number, duration: number): void;
  /** Request a seek; the playback bridge applies it and clears `pendingSeek`. */
  seekTo(seconds: number): void;
  applySeek(): void;
  setPlaying(isPlaying: boolean): void;
  setLoading(isLoading: boolean): void;
}

const DEFAULT_STATE: PlayerState = {
  playMode: PlayMode.LOOP,
  nowplayingTrack: null,
  volume: 100,
  isPlaying: false,
  duration: 0,
  current: 0,
  progress: 0,
  isSeeking: false,
  tracks: [],
  shuffleIds: [],
  skipIds: {},
  isLoadingTrack: false,
  pendingSeek: null,
};

/** Index of the current track within an ordered id list. */
function indexOfTrack(ids: Track['id'][], id: Track['id'] | undefined): number {
  if (id === undefined) return -1;

  return ids.findIndex((entry) => entry === id);
}

export const usePlayerStore = create<PlayerState & PlayerActions>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      play: () => set({ isPlaying: true }),
      pause: () => set({ isPlaying: false }),
      togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),

      playTrack: (track) => {
        const state = get();
        const alreadyQueued = state.tracks.some((entry) => entry.id === track.id);
        const isShuffle = state.playMode === PlayMode.SHUFFLE;

        // Restarting a queued track must not create a duplicate entry.
        if (alreadyQueued) {
          set({ nowplayingTrack: track, isPlaying: true, skipIds: {} });

          return;
        }

        set({
          nowplayingTrack: track,
          isPlaying: true,
          skipIds: {},
          tracks: [...state.tracks, track],
          shuffleIds: isShuffle ? [...state.shuffleIds, track.id] : state.shuffleIds,
        });
      },

      playTrackInPlaylist: (track, tracks) => {
        const isShuffle = get().playMode === PlayMode.SHUFFLE;

        set({
          nowplayingTrack: track,
          isPlaying: true,
          tracks,
          shuffleIds: isShuffle ? generateShuffleIds(tracks) : [],
          skipIds: {},
        });
      },

      playTracks: (tracks) => {
        if (tracks.length === 0) return;
        const isShuffle = get().playMode === PlayMode.SHUFFLE;
        const ids = isShuffle ? generateShuffleIds(tracks) : [];
        const firstId = isShuffle ? ids[0] : tracks[0].id;
        const first = tracks.find((track) => track.id === firstId) ?? tracks[0];

        set({
          nowplayingTrack: first,
          isPlaying: true,
          tracks,
          shuffleIds: ids,
          skipIds: {},
        });
      },

      addNextTrack: (track) => {
        const state = get();

        if (!state.nowplayingTrack) {
          get().playTrack(track);

          return;
        }

        set({
          tracks: insertNextTo(state.tracks, track, state.nowplayingTrack.id, (t) => t.id),
          shuffleIds:
            state.playMode === PlayMode.SHUFFLE
              ? insertNextTo(state.shuffleIds, track.id, state.nowplayingTrack.id, (id) => id)
              : state.shuffleIds,
        });
      },

      removeTrack: (trackId) =>
        set((state) => ({
          tracks: state.tracks.filter((track) => track.id !== trackId),
          shuffleIds: state.shuffleIds.filter((id) => id !== trackId),
        })),

      next: () => {
        const state = get();
        if (state.tracks.length === 0) return;

        const orderedIds =
          state.playMode === PlayMode.SHUFFLE
            ? state.shuffleIds
            : state.tracks.map((track) => track.id);
        const currentIndex = indexOfTrack(orderedIds, state.nowplayingTrack?.id);
        const nextId = orderedIds[safeIndex(currentIndex + 1, orderedIds.length)];
        const nextTrack = state.tracks.find((track) => track.id === nextId);

        if (nextTrack) set({ nowplayingTrack: nextTrack, isPlaying: true });
      },

      prev: () => {
        const state = get();
        if (state.tracks.length === 0) return;

        const orderedIds =
          state.playMode === PlayMode.SHUFFLE
            ? state.shuffleIds
            : state.tracks.map((track) => track.id);
        const currentIndex = indexOfTrack(orderedIds, state.nowplayingTrack?.id);
        const prevId = orderedIds[safeIndex(currentIndex - 1, orderedIds.length)];
        const prevTrack = state.tracks.find((track) => track.id === prevId);

        if (prevTrack) set({ nowplayingTrack: prevTrack, isPlaying: true });
      },

      handleLoadFail: () => {
        const state = get();
        const failed = state.nowplayingTrack;

        // Repeat-one cannot skip forward on failure, and a fully skipped queue
        // means nothing is playable, so both cases stop playback.
        if (state.playMode === PlayMode.REPEAT_ONE) {
          set({ isPlaying: false });

          return;
        }

        const skipIds = failed ? { ...state.skipIds, [failed.id]: 1 as const } : state.skipIds;
        if (Object.keys(skipIds).length >= state.tracks.length) {
          set({ isPlaying: false, skipIds });

          return;
        }

        set({ skipIds });
        get().next();
      },

      cyclePlayMode: () =>
        set((state) => {
          const modeCount = Object.keys(PlayMode).length;
          const playMode = ((state.playMode + 1) % modeCount) as PlayModeValue;

          return {
            playMode,
            shuffleIds: playMode === PlayMode.SHUFFLE ? generateShuffleIds(state.tracks) : [],
          };
        }),

      setVolume: (volume) => set({ volume }),
      setProgress: (current, duration) =>
        set({ current, duration, progress: duration > 0 ? current / duration : 0 }),
      seekTo: (seconds) => set({ pendingSeek: seconds }),
      applySeek: () => set({ pendingSeek: null }),
      setPlaying: (isPlaying) => set({ isPlaying }),
      setLoading: (isLoadingTrack) => set({ isLoadingTrack }),
    }),
    {
      name: 'playerState',
      storage: createJSONStorage(() => AsyncStorage),
      // Transient playback fields must not survive a restart, mirroring the
      // legacy redux-persist blacklist.
      partialize: (state) => ({
        playMode: state.playMode,
        nowplayingTrack: state.nowplayingTrack,
        volume: state.volume,
        tracks: state.tracks,
        shuffleIds: state.shuffleIds,
      }),
    }
  )
);

/** Small selector helpers keep screens from re-rendering on every field. */
export const selectCurrentTrack = (state: PlayerState & PlayerActions) => state.nowplayingTrack;
export const selectIsPlaying = (state: PlayerState & PlayerActions) => state.isPlaying;
