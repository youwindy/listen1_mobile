/**
 * Cross-cutting domain types for Listen1 Mobile.
 *
 * The legacy app (React Native 0.59, Flow) passed plain objects around with no
 * shape guarantees. These types pin down the contracts that the music platform
 * providers, the playback queue and the persistence layer agree on.
 */

/** Identifiers are prefixed with the platform id, e.g. `netrack_123`, `qqplaylist_45`. */
export type TrackId = string;
export type PlaylistId = string;

/** Platform keys used in every prefixed id. */
export type PlatformId = 'ne' | 'qq' | 'kw' | 'kg';

export type PlatformName = 'netease' | 'qq' | 'kuwo' | 'kugou';

/** A single playable song, normalised across all platforms. */
export interface Track {
  /** Prefixed platform id, e.g. `netrack_1234`. */
  id: TrackId;
  title: string;
  artist: string;
  artist_id?: string;
  album: string;
  album_id?: string;
  source: PlatformName;
  /** Canonical web page for this song. */
  source_url?: string;
  /** Cover art, possibly empty when the platform needs a second request. */
  img_url?: string;
  /** Kept for parity with the legacy data model; playing uses bootstrapTrack(). */
  url?: string;
  /** True when the platform reports the song as unplayable (VIP / region locked). */
  disabled?: boolean;
  lyric_url?: string;
}

/** A playlist as shown in browse/search lists. */
export interface PlaylistInfo {
  id: PlaylistId;
  title: string;
  cover_img_url: string;
  source_url?: string;
}

/** A playlist together with its tracks. */
export interface PlaylistDetail {
  info: PlaylistInfo;
  tracks: Track[];
}

/** Result of a paginated browse/search call. */
export interface PageResult<T> {
  result: T[];
  /** Total number of matches, when the platform reports it. */
  total?: number;
  hasNextPage?: boolean;
}

/** A browse target parsed from a pasted URL. */
export interface ParsedUrl {
  type: 'playlist';
  id: PlaylistId;
}

export interface ProviderMeta {
  /** Display name, e.g. 网易. */
  name: string;
  /** Id prefix, e.g. `ne`. */
  platformId: PlatformId;
  /** Stable key, e.g. `netease`. */
  enName: PlatformName;
}

/**
 * The contract every music platform integration implements.
 *
 * `offset` is a zero-based page index; platforms convert it to their own
 * paging units internally.
 */
export interface MusicProvider {
  meta: ProviderMeta;
  showPlaylist(offset: number): Promise<PageResult<PlaylistInfo>>;
  search(keyword: string, page: number): Promise<PageResult<Track>>;
  getPlaylist(playlistId: PlaylistId): Promise<PlaylistDetail>;
  /** Resolve a direct audio stream URL, or '' when the song cannot be played. */
  bootstrapTrack(trackId: TrackId): Promise<string>;
  parseUrl(url: string): ParsedUrl | null;
}

/** Playback modes, matching the legacy numeric encoding so backups stay compatible. */
export const PlayMode = {
  LOOP: 0,
  SHUFFLE: 1,
  REPEAT_ONE: 2,
} as const;

export type PlayModeValue = (typeof PlayMode)[keyof typeof PlayMode];

/** A user-created playlist (favourites included). */
export interface MyPlaylist {
  info: PlaylistInfo;
  tracks: Track[];
}
