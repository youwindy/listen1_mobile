/**
 * Platform registry and dispatch.
 *
 * Replaces `legacy/src/api/client.js`. Ids are prefixed with a two-character
 * platform id (`netrack_…`, `qqplaylist_…`), which is how every screen routes a
 * track or playlist back to the right provider.
 */
import kugou from './provider/kugou';
import kuwo from './provider/kuwo';
import netease from './provider/netease';
import qq from './provider/qq';
import type {
  MusicProvider,
  PageResult,
  ParsedUrl,
  PlaylistDetail,
  PlaylistId,
  PlaylistInfo,
  PlatformId,
  PlatformName,
  Track,
  TrackId,
} from './types';

/** Providers enabled in the app, in the order they appear in the browse tabs. */
export const providers: MusicProvider[] = [netease, kugou, kuwo, qq];

const providerByPlatformId = new Map<PlatformId, MusicProvider>(
  providers.map((provider) => [provider.meta.platformId, provider])
);

const nameByPlatformName = new Map(providers.map((provider) => [provider.meta.enName, provider.meta.name]));

/** Ids are always `<platformId><kind>_<nativeId>`; the prefix is 2 characters. */
const ID_PREFIX_LENGTH = 2;

function providerForId(id: string): MusicProvider {
  const prefix = id.slice(0, ID_PREFIX_LENGTH) as PlatformId;
  const provider = providerByPlatformId.get(prefix);

  if (!provider) {
    throw new Error(`暂不支持的音乐平台：${id}`);
  }

  return provider;
}

export function getPlatforms(): MusicProvider['meta'][] {
  return providers.map((provider) => provider.meta);
}

/** Display name for a platform key, e.g. `netease` -> `网易`. */
export function getPlatformName(platformName: string): string {
  return nameByPlatformName.get(platformName as PlatformName) ?? '暂未支持的平台';
}

/** Browse a platform's recommended playlists. */
export function showPlaylist(offset: number, platformId: PlatformId): Promise<PageResult<PlaylistInfo>> {
  return providerForId(platformId).showPlaylist(offset);
}

export function search(keyword: string, page: number, platformId: PlatformId): Promise<PageResult<Track>> {
  return providerForId(platformId).search(keyword, page);
}

export function getPlaylist(playlistId: PlaylistId): Promise<PlaylistDetail> {
  return providerForId(playlistId).getPlaylist(playlistId);
}

/** Resolve a playable stream URL for a track id, or '' when unavailable. */
export function bootstrapTrack(trackId: TrackId): Promise<string> {
  const provider = providerByPlatformId.get(trackId.slice(0, ID_PREFIX_LENGTH) as PlatformId);

  // Unknown platform: nothing to play, which callers treat as an unavailable track.
  if (!provider) return Promise.resolve('');

  return provider.bootstrapTrack(trackId);
}

/** Match a pasted share URL against every provider. */
export function parseUrl(url: string): ParsedUrl | null {
  for (const provider of providers) {
    const parsed = provider.parseUrl(url);

    if (parsed) return parsed;
  }

  return null;
}
