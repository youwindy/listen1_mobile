/**
 * Listen1 backup format (export/import).
 *
 * Ported from `legacy/src/modules/state-json-convert.js`. The format is shared
 * with the Listen1 browser extension, so field names and the `is_mine` marker
 * must not change or existing backups stop importing.
 */
import type { MyPlaylist, PlaylistInfo, Track } from '../api/types';
import { FAVORITE_PLAYLIST_ID, FAVORITE_PLAYLIST_INFO } from '../store/myPlaylist';
import type { MyPlaylistState } from '../store/myPlaylist';
import type { PlayerState } from '../store/player';

/** Shape written by Listen1 (extension and mobile). */
export interface BackupPlaylist {
  info: PlaylistInfo;
  tracks: Track[];
  is_mine?: number;
}

export interface Listen1Backup {
  language: string;
  'player-settings': {
    playmode: number;
    nowplaying_track_id: string;
    volume: number;
  };
  'current-playing': Track[];
  playerlists: string[];
  /** Playlists are stored flat, keyed by their id. */
  [playlistId: string]: unknown;
}

export interface ExportInput {
  playerState: Pick<PlayerState, 'playMode' | 'nowplayingTrack' | 'tracks' | 'volume'>;
  myPlaylistState: MyPlaylistState;
}

/** Build the backup object from current app state. */
export function buildBackup({ playerState, myPlaylistState }: ExportInput): Listen1Backup {
  const backup: Listen1Backup = {
    language: 'zh_CN',
    'player-settings': {
      playmode: playerState.playMode,
      nowplaying_track_id: playerState.nowplayingTrack?.id ?? '-1',
      volume: playerState.volume,
    },
    'current-playing': playerState.tracks,
    playerlists: myPlaylistState.playlists.map((playlist) => playlist.info.id),
  };

  for (const playlist of myPlaylistState.playlists) {
    backup[playlist.info.id] = {
      info: {
        ...playlist.info,
        // Local covers cannot travel between devices; the extension uses this
        // relative path for its bundled default image.
        cover_img_url: playlist.info.cover_img_url.startsWith('http')
          ? playlist.info.cover_img_url
          : 'images/mycover.jpg',
      },
      tracks: playlist.tracks,
      is_mine: 1,
    };
  }

  return backup;
}

export interface RestoreResult {
  playlists: MyPlaylist[];
  favoriteIds: Record<string, 1>;
  tracks: Track[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Parse a backup file.
 * Throws a readable error when the file is not a Listen1 backup, because the
 * legacy importer failed with an opaque TypeError instead.
 */
export function parseBackup(raw: string): RestoreResult {
  let data: unknown;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('备份文件不是合法的 JSON');
  }

  if (!isRecord(data)) throw new Error('备份文件格式不正确');

  const playlistIds = data.playerlists;
  if (!Array.isArray(playlistIds)) throw new Error('备份文件缺少歌单列表（playerlists）');

  const playlists: MyPlaylist[] = [];
  const favoriteIds: Record<string, 1> = {};
  const tracks = Array.isArray(data['current-playing']) ? (data['current-playing'] as Track[]) : [];

  for (const id of playlistIds) {
    if (typeof id !== 'string') continue;
    const entry = data[id];
    if (!isRecord(entry)) continue;

    const playlist = entry as unknown as BackupPlaylist;
    if (!playlist.info || !Array.isArray(playlist.tracks)) continue;

    const info: PlaylistInfo = {
      ...playlist.info,
      // A backup may reference the extension's bundled image.
      cover_img_url: playlist.info.cover_img_url?.startsWith('http')
        ? playlist.info.cover_img_url
        : './assets/images/logo.png',
    };

    if (id === FAVORITE_PLAYLIST_ID) {
      for (const track of playlist.tracks) favoriteIds[track.id] = 1;
      playlists.push({ info: { ...FAVORITE_PLAYLIST_INFO, ...info }, tracks: playlist.tracks });
      continue;
    }

    playlists.push({ info, tracks: playlist.tracks });
  }

  return { playlists, favoriteIds, tracks };
}
