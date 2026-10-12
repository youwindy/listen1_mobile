/**
 * User playlists (favourites included).
 *
 * Ported from `legacy/src/redux/myplaylist.reducer.js`. The legacy state kept
 * both `playlists` (an ordered array of infos) and `myPlaylistDict` (tracks by
 * id), duplicating the ordering information. The rewrite keeps a single ordered
 * array of full playlists, which removes a class of "playlist exists in the
 * dict but not in the list" bugs the legacy reducer could reach.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MyPlaylist, PlaylistInfo, Track } from '../api/types';

// Re-exported so screens can type playlist rows without reaching into the api layer.
export type { MyPlaylist } from '../api/types';

export const FAVORITE_PLAYLIST_ID = 'myplaylist_favorite';

export const FAVORITE_PLAYLIST_INFO: PlaylistInfo = {
  id: FAVORITE_PLAYLIST_ID,
  title: '我喜欢的音乐',
  cover_img_url: './assets/images/logo.png',
};

/** RFC4122-ish v4 id, equivalent to the legacy `guid()` helper. */
export function createId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;

    return value.toString(16);
  });
}

function emptyFavorite(): MyPlaylist {
  return { info: { ...FAVORITE_PLAYLIST_INFO }, tracks: [] };
}

export interface MyPlaylistState {
  /** Favourites first, then user playlists, in display order. */
  playlists: MyPlaylist[];
  /** Fast lookup for "is this track favourited?". */
  favoriteIds: Record<string, 1>;
}

export interface MyPlaylistActions {
  createPlaylist(title: string, coverImgUrl?: string): PlaylistInfo;
  editPlaylistTitle(playlistId: string, title: string): void;
  /** Replace the whole ordered list, e.g. after drag-to-reorder. */
  reorderPlaylists(playlists: MyPlaylist[]): void;
  deletePlaylist(playlistId: string): void;
  addToPlaylist(playlistId: string, track: Track): void;
  removeFromPlaylist(playlistId: string, trackId: Track['id']): void;
  addToFavorite(track: Track): void;
  removeFromFavorite(trackId: Track['id']): void;
  /** Used when importing a Listen1 backup. */
  replaceAll(state: MyPlaylistState): void;
}

const INITIAL_STATE: MyPlaylistState = {
  playlists: [emptyFavorite()],
  favoriteIds: {},
};

function isFavorite(playlistId: string): boolean {
  return playlistId === FAVORITE_PLAYLIST_ID;
}

export const useMyPlaylistStore = create<MyPlaylistState & MyPlaylistActions>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      createPlaylist: (title, coverImgUrl = './assets/images/logo.png') => {
        const info: PlaylistInfo = {
          id: `myplaylist_${createId()}`,
          title,
          cover_img_url: coverImgUrl,
        };

        set((state) => ({
          playlists: [...state.playlists, { info, tracks: [] }],
        }));

        return info;
      },

      editPlaylistTitle: (playlistId, title) =>
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.info.id === playlistId
              ? { ...playlist, info: { ...playlist.info, title } }
              : playlist
          ),
        })),

      reorderPlaylists: (playlists) =>
        set(() => {
          // Favourites always stay pinned at the top.
          const favorite = playlists.find((playlist) => isFavorite(playlist.info.id));
          const rest = playlists.filter((playlist) => !isFavorite(playlist.info.id));

          return { playlists: favorite ? [favorite, ...rest] : rest };
        }),

      deletePlaylist: (playlistId) => {
        if (isFavorite(playlistId)) return;

        set((state) => ({
          playlists: state.playlists.filter((playlist) => playlist.info.id !== playlistId),
        }));
      },

      addToPlaylist: (playlistId, track) => {
        const state = get();
        const playlist = state.playlists.find((entry) => entry.info.id === playlistId);
        if (!playlist) return;
        // Re-adding an existing track is a no-op, as in the legacy reducer.
        if (playlist.tracks.some((entry) => entry.id === track.id)) return;

        set({
          playlists: state.playlists.map((entry) =>
            entry.info.id === playlistId
              ? { ...entry, tracks: [...entry.tracks, track] }
              : entry
          ),
          favoriteIds: isFavorite(playlistId)
            ? { ...state.favoriteIds, [track.id]: 1 }
            : state.favoriteIds,
        });
      },

      removeFromPlaylist: (playlistId, trackId) =>
        set((state) => ({
          playlists: state.playlists.map((entry) =>
            entry.info.id === playlistId
              ? { ...entry, tracks: entry.tracks.filter((track) => track.id !== trackId) }
              : entry
          ),
          favoriteIds: isFavorite(playlistId)
            ? Object.fromEntries(
                Object.entries(state.favoriteIds).filter(([id]) => id !== trackId)
              )
            : state.favoriteIds,
        })),

      addToFavorite: (track) => {
        const state = get();
        if (state.favoriteIds[track.id] !== undefined) return;

        const hasFavorite = state.playlists.some((playlist) => isFavorite(playlist.info.id));
        const base = hasFavorite ? state.playlists : [emptyFavorite(), ...state.playlists];

        set({
          playlists: base.map((playlist) =>
            isFavorite(playlist.info.id)
              ? { ...playlist, tracks: [...playlist.tracks, track] }
              : playlist
          ),
          favoriteIds: { ...state.favoriteIds, [track.id]: 1 },
        });
      },

      removeFromFavorite: (trackId) =>
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            isFavorite(playlist.info.id)
              ? { ...playlist, tracks: playlist.tracks.filter((track) => track.id !== trackId) }
              : playlist
          ),
          favoriteIds: Object.fromEntries(
            Object.entries(state.favoriteIds).filter(([id]) => id !== trackId)
          ),
        })),

      replaceAll: (next) => set(() => next),
    }),
    {
      name: 'myPlaylistState',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      migrate: (persisted, version) => {
        // v0 stored `{ playlists: PlaylistInfo[], myPlaylistDict }`; fold the
        // dictionary into the ordered array so old installs keep their data.
        if (version === 0 && persisted && typeof persisted === 'object') {
          const legacy = persisted as {
            playlists?: PlaylistInfo[];
            myPlaylistDict?: Record<string, MyPlaylist>;
            myFavoriteIds?: Record<string, 1>;
          };
          const ordered = (legacy.playlists ?? [])
            .map((info) => legacy.myPlaylistDict?.[info.id])
            .filter((playlist): playlist is MyPlaylist => Boolean(playlist));

          return {
            playlists: ordered.length > 0 ? ordered : [emptyFavorite()],
            favoriteIds: legacy.myFavoriteIds ?? {},
          } satisfies MyPlaylistState;
        }

        return persisted as MyPlaylistState;
      },
    }
  )
);

export const selectFavoriteIds = (state: MyPlaylistState & MyPlaylistActions) => state.favoriteIds;
