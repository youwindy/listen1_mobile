/* eslint no-bitwise: ["error", { "allow": ["&"] }] */

/**
 * NetEase Cloud Music (网易云音乐) provider.
 *
 * Faithful TypeScript port of `legacy/src/api/provider/netease.js`: the
 * endpoints, request bodies, headers, paging maths, field mappings and id
 * prefixes are unchanged. The only intentional difference is error handling —
 * the legacy `.catch(() => {})` swallows are gone, so failures reach the UI.
 */

import { weapi } from '../../modules/crypto';
import type {
  MusicProvider,
  PageResult,
  ParsedUrl,
  PlaylistDetail,
  PlaylistId,
  PlaylistInfo,
  ProviderMeta,
  Track,
  TrackId,
} from '../types';

const REFERER = 'https://music.163.com/';
const CONTENT_TYPE = 'application/x-www-form-urlencoded';
const MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; U; Android 8.1.0; zh-cn; BLA-AL00 Build/HUAWEIBLA-AL00) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/57.0.2987.132 MQQBrowser/8.9 Mobile Safari/537.36';

/** Plain JSON bodies handed to `weapi()`. */
type RequestData = Record<string, unknown>;

// ------------------------------------------------------------ raw platform JSON

/** Artist entry of a song (`ar` in the NetEase payload). */
interface RawNeteaseArtist {
  id: number;
  name: string;
}

/** Album entry of a song (`al` in the NetEase payload). */
interface RawNeteaseAlbum {
  id: number;
  name: string;
  picUrl: string;
}

/** Playback privileges, scored by `getNEScore`. */
interface RawNeteasePrivilege {
  st?: number | null;
  fee?: number | null;
  payed?: number | null;
  pl?: number | null;
  dl?: number | null;
  flag?: number | null;
}

/** A song as returned by `cloudsearch/get/web` and `v3/song/detail`. */
interface RawNeteaseSong {
  id: number;
  name: string;
  ar: RawNeteaseArtist[];
  al: RawNeteaseAlbum;
  privilege?: RawNeteasePrivilege;
  /** Set when the entry is a radio program rather than a plain song. */
  program?: unknown;
  status?: number | null;
  fee?: number | null;
}

interface RawPlaylistBrief {
  id: number;
  name: string;
  coverImgUrl: string;
}

/** `weapi/playlist/list`. */
interface RawPlaylistListResponse {
  playlists: RawPlaylistBrief[];
}

/** `weapi/v3/playlist/detail`. */
interface RawPlaylistDetailResponse {
  /** Absent when the playlist is private, deleted or the id is invalid. */
  playlist?: {
    coverImgUrl: string;
    name: string;
    trackIds: { id: number }[];
  } | null;
}

/** `weapi/v3/song/detail`. */
interface RawSongDetailResponse {
  songs: RawNeteaseSong[];
}

/** `weapi/cloudsearch/get/web`. */
interface RawSearchResponse {
  result: {
    songs: RawNeteaseSong[];
    songCount: number;
  };
}

/** One entry of `weapi/song/enhance/player/url/v1`. */
interface RawSongUrlEntry {
  url?: string | null;
}

interface RawSongUrlResponse {
  data: RawSongUrlEntry[];
}

// ------------------------------------------------------------------- query-string

/**
 * Local replacement for the removed `query-string` dependency.
 *
 * `weapi()` returns a flat `{ params, encSecKey }` map of already encrypted
 * strings. Keys are sorted because `query-string.stringify` sorted them by
 * default in the legacy app; NetEase only cares about the two field values.
 */
function stringifyQuery(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('网易云请求参数生成失败');
  }

  const record = payload as Record<string, unknown>;
  const search = new URLSearchParams();

  for (const key of Object.keys(record).sort()) {
    const value = record[key];

    if (value === null || value === undefined) {
      continue;
    }

    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      throw new Error(`网易云请求参数 ${key} 无法序列化`);
    }

    search.append(key, String(value));
  }

  return search.toString();
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Read one parameter out of a URL.
 *
 * `new URL()` is tried first, but React Native's polyfill is partial and
 * NetEase share links keep the query inside the hash
 * (`http://music.163.com/#/playlist?id=123`), so the hash is inspected too.
 * A regex over the raw string is the last resort before giving up.
 */
function readQueryParam(url: string, key: string): string | null {
  try {
    const parsed = new URL(url);
    const fromSearch = parsed.searchParams.get(key);

    if (fromSearch !== null) {
      return fromSearch;
    }

    const hashQueryStart = parsed.hash.indexOf('?');

    if (hashQueryStart !== -1) {
      const fromHash = new URLSearchParams(
        parsed.hash.slice(hashQueryStart + 1)
      ).get(key);

      if (fromHash !== null) {
        return fromHash;
      }
    }
  } catch {
    // `new URL()` threw: fall through to the regex scan below.
  }

  const match = new RegExp(`[?&]${key}=([^&#]*)`).exec(url);
  const captured: string | undefined = match === null ? undefined : match[1];

  return captured === undefined ? null : safeDecodeURIComponent(captured);
}

// ------------------------------------------------------------------------ network

/** POST one `weapi` form body; transport failures become user-facing errors. */
async function postRequest(url: string, body: string): Promise<Response> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        referer: REFERER,
        'content-type': CONTENT_TYPE,
        'user-agent': MOBILE_USER_AGENT,
      },
      body,
    });
  } catch {
    throw new Error('网络请求失败，请检查网络连接');
  }
}

async function requestAPI<T>(url: string, data: RequestData): Promise<T> {
  const response = await postRequest(url, stringifyQuery(weapi(data)));

  if (!response.ok) {
    throw new Error(`网易云接口请求失败（HTTP ${response.status}）`);
  }

  try {
    // The body is untrusted: `T` pins the handful of fields this provider
    // actually reads, mirroring the legacy code's implicit shape.
    return (await response.json()) as T;
  } catch {
    throw new Error('网易云接口返回了无法解析的数据');
  }
}

function getSmallImageUrl(url: string): string {
  return `${url}?param=140y140`;
}

// ---------------------------------------------------------------------- platform

function showPlaylist(offset: number): Promise<PageResult<PlaylistInfo>> {
  const query: {
    cat?: string;
    order?: string;
    limit?: number;
    offset: number;
  } = { offset };
  const data: RequestData = {
    cat: query.cat || '全部',
    order: query.order || 'hot', // hot,new
    limit: query.limit || 30,
    offset: query.offset || 0,
    total: true,
  };

  const url = 'https://music.163.com/weapi/playlist/list';

  return requestAPI<RawPlaylistListResponse>(url, data).then((r) => {
    const playlists: PlaylistInfo[] = r.playlists.map((item) => ({
      cover_img_url: getSmallImageUrl(item.coverImgUrl),
      title: item.name,
      id: `neplaylist_${item.id}`,
      source_url: `http://music.163.com/#/playlist?id=${item.id}`,
    }));

    return { result: playlists };
  });
}

function getNEScore(song: RawNeteaseSong | null | undefined): number {
  if (!song) {
    return 0;
  }

  const { privilege } = song;

  if (song.program) {
    return 0;
  }

  // `Number(...)` only reproduces the legacy code's implicit numeric coercion
  // for fields that may be missing (`Number(undefined)` is NaN and every
  // comparison against NaN is false), so every branch below scores identically.
  if (privilege) {
    if (
      privilege.st !== null &&
      privilege.st !== undefined &&
      privilege.st < 0
    ) {
      return 100;
    }

    if (
      Number(privilege.fee) > 0 &&
      privilege.fee !== 8 &&
      privilege.payed === 0 &&
      Number(privilege.pl) <= 0
    ) {
      return 10;
    }

    if (
      privilege.fee === 16 ||
      (privilege.fee === 4 && (Number(privilege.flag) & 2048) !== 0)
    ) {
      return 11;
    }

    if (
      (privilege.fee === 0 || Boolean(privilege.payed)) &&
      Number(privilege.pl) > 0 &&
      privilege.dl === 0
    ) {
      return 1e3;
    }

    if (privilege.pl === 0 && privilege.dl === 0) {
      return 100;
    }

    return 0;
  }

  if (Number(song.status) >= 0) {
    return 0;
  }

  if (Number(song.fee) > 0) {
    return 10;
  }

  return 100;
}

function isPlayable(song: RawNeteaseSong): boolean {
  return getNEScore(song) < 100;
}

function convert(allowAll: boolean): (songInfo: RawNeteaseSong) => Track {
  return (songInfo) => {
    // NetEase always sends at least one artist. Guard both a missing `ar` and an
    // empty one so a malformed payload produces a readable error instead of a
    // raw "Cannot read properties of undefined" TypeError.
    const artist: RawNeteaseArtist | undefined = songInfo.ar?.[0];

    if (artist === undefined) {
      throw new Error(`网易云歌曲 ${songInfo.id} 缺少歌手信息`);
    }

    return {
      id: `netrack_${songInfo.id}`,
      title: songInfo.name,
      artist: artist.name,
      artist_id: `neartist_${artist.id}`,
      album: songInfo.al.name,
      album_id: `nealbum_${songInfo.al.id}`,
      source: 'netease',
      source_url: `http://music.163.com/#/song?id=${songInfo.id}`,
      img_url: songInfo.al.picUrl,
      url: `netrack_${songInfo.id}`,
      disabled: allowAll ? false : !isPlayable(songInfo),
    };
  };
}

function getPlaylist(playlistId: PlaylistId): Promise<PlaylistDetail> {
  const listId = playlistId.split('_').pop() ?? '';
  const data: RequestData = {
    id: listId,
    offset: 0,
    total: true,
    limit: 1000,
    n: 1000,
    csrf_token: '',
  };

  const playlistUrl = 'http://music.163.com/weapi/v3/playlist/detail';
  const tracksUrl = 'https://music.163.com/weapi/v3/song/detail';

  return requestAPI<RawPlaylistDetailResponse>(playlistUrl, data).then(
    (resData) => {
      const { playlist } = resData;

      if (playlist === null || playlist === undefined) {
        throw new Error('网易云歌单不存在或无法访问');
      }

      const info: PlaylistInfo = {
        id: `neplaylist_${listId}`,
        cover_img_url: getSmallImageUrl(playlist.coverImgUrl),
        title: playlist.name,
        source_url: `http://music.163.com/#/playlist?id=${listId}`,
      };

      // Request all tracks to fetch song info. `limit` stays at 1000, so the
      // detail response only carries ids and a second request resolves them.
      // Code reference from listen1_chrome_extension.
      const trackIds = playlist.trackIds.map((i) => i.id);
      const tracksData: RequestData = {
        c: `[${trackIds.map((id) => `{"id":${id}}`).join(',')}]`,
        ids: `[${trackIds.join(',')}]`,
      };

      return requestAPI<RawSongDetailResponse>(tracksUrl, tracksData).then(
        (response) => {
          const tracks = response.songs.map(convert(true));

          return { info, tracks };
        }
      );
    }
  );
}

function bootstrapTrack(trackId: TrackId): Promise<string> {
  const url =
    'http://music.163.com/weapi/song/enhance/player/url/v1?csrf_token=';

  const songId = trackId.slice('netrack_'.length);

  const data: RequestData = {
    ids: [songId],
    level: 'standard',
    encodeType: 'aac',
    csrf_token: '',
  };

  return requestAPI<RawSongUrlResponse>(url, data).then((resData) => {
    const entry: RawSongUrlEntry | undefined = resData.data[0];

    if (entry === undefined) {
      throw new Error('网易云未返回该歌曲的播放地址');
    }

    const { url: songUrl } = entry;

    if (songUrl === null || songUrl === undefined || songUrl === '') {
      return '';
    }

    return songUrl;
  });
}

function search(keyword: string, page: number): Promise<PageResult<Track>> {
  const url = 'https://music.163.com/weapi/cloudsearch/get/web';
  // `hlpretag` / `hlposttag` make NetEase wrap the matched keyword inside the
  // song names; the legacy code kept those tags as-is, so nothing is decoded.
  const data: RequestData = {
    csrf_token: '',
    hlposttag: '</span>',
    hlpretag: '<span class="s-fc7">',
    limit: '30',
    offset: (30 * (page - 1)).toString(),
    s: keyword,
    total: 'false',
    type: '1',
  };

  return requestAPI<RawSearchResponse>(url, data).then((resData) => {
    const tracks = resData.result.songs.map(convert(false));

    return {
      result: tracks,
      total: resData.result.songCount,
    };
  });
}

// ---------------------------------------------------------------------- url parse

function parseUrl(url: string): ParsedUrl | null {
  let result: ParsedUrl | null = null;

  const r = /\/\/music\.163\.com\/playlist\/([0-9]+)/g.exec(url);
  const matched: string | undefined = r === null ? undefined : r[1];

  if (matched !== undefined) {
    return {
      type: 'playlist',
      id: `neplaylist_${matched}`,
    };
  }

  if (
    url.search('//music.163.com/#/m/playlist') !== -1 ||
    url.search('//music.163.com/#/playlist') !== -1 ||
    url.search('//music.163.com/playlist') !== -1 ||
    url.search('//music.163.com/#/my/m/music/playlist') !== -1
  ) {
    const id = readQueryParam(url, 'id');

    if (id !== null) {
      result = {
        type: 'playlist',
        id: `neplaylist_${id}`,
      };
    }
  }

  return result;
}

const meta: ProviderMeta = {
  name: '网易',
  platformId: 'ne',
  enName: 'netease',
};

const neteaseProvider: MusicProvider = {
  meta,
  showPlaylist,
  getPlaylist,
  bootstrapTrack,
  search,
  parseUrl,
};

export default neteaseProvider;
