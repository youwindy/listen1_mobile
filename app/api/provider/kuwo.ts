/**
 * Kuwo (酷我音乐) provider.
 *
 * Ported from `legacy/src/api/provider/kuwo.js`, which had been copy-pasted
 * from a different platform's provider and was partly broken: `parseUrl`
 * matched the other platform's URLs, track ids carried a stale foreign prefix,
 * a set of unrelated helpers were dead code, the playlist cover lookup raced
 * the response, and the CSRF token was written to the device log while being
 * persisted through a storage package that no longer exists. Those defects are
 * fixed here while keeping Kuwo's real endpoints and parameters.
 */

import { decode } from 'html-entities';

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

const KUWO_WEB_ORIGIN = 'https://www.kuwo.cn/';
const KW_TOKEN_COOKIE = 'kw_token';
/** Kuwo expires its CSRF cookie quickly, so the cache is refreshed well before that. */
const KW_TOKEN_TTL_MS = 10 * 60 * 1000;
const TRACK_ID_PREFIX = 'kwtrack_';
const PLAYLIST_ID_PREFIX = 'kwplaylist_';

const meta: ProviderMeta = { name: '酷我', platformId: 'kw', enName: 'kuwo' };

/* -------------------------------------------------------------------------- */
/* Raw Kuwo response shapes                                                   */
/* -------------------------------------------------------------------------- */

interface RawSearchTrack {
  musicrid: string;
  name: string;
  artist: string;
  artistid: number;
  album: string;
  albumid: number;
  albumpic?: string;
}

/** Fields shared by every `www.kuwo.cn/api/...` JSON envelope. */
interface RawApiEnvelope {
  success?: boolean;
  code?: number;
  msg?: string;
  data?: unknown;
}

interface RawSearchPayload {
  total?: number;
  list?: RawSearchTrack[];
}

interface RawSearchResponse extends RawApiEnvelope {
  data?: RawSearchPayload;
}

interface RawPlaylistTrack {
  id: number;
  name: string;
  artist: string;
  artistid: number;
  album: string;
  albumid: number;
}

interface RawPlaylistResponse {
  id?: number;
  title?: string;
  pic?: string;
  musiclist?: RawPlaylistTrack[];
}

interface RawCategoryPlaylist {
  id: number;
  name: string;
  img?: string;
}

interface RawCategoryGroup {
  data?: RawCategoryPlaylist[];
}

interface RawCategoryResponse {
  data?: RawCategoryGroup[];
}

/* -------------------------------------------------------------------------- */
/* CSRF token handshake                                                       */
/* -------------------------------------------------------------------------- */

let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;

function getCookieValue(cookie: string, key: string): string | null {
  const match = new RegExp(`${key}=([^;]*)`).exec(cookie);

  return match === null ? null : match[1];
}

/**
 * Kuwo's web API expects the `kw_token` CSRF cookie to be echoed back in both
 * the `csrf` and `Cookie` headers. When the token cannot be read we still send
 * the request without those headers: Kuwo then answers `success === false` and
 * `requestApi` reports that honestly instead of sending `undefined`.
 */
function buildCsrfHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = { referer: KUWO_WEB_ORIGIN };

  if (token !== null) {
    headers.csrf = token;
    headers.Cookie = `${KW_TOKEN_COOKIE}=${token}`;
  }

  return headers;
}

async function fetchJson<T>(
  url: string,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(url, { method: 'get', headers });

  if (!response.ok) {
    throw new Error(
      `Kuwo request to ${url} failed with HTTP ${response.status}`,
    );
  }

  const body: unknown = await response.json();

  return body as T;
}

async function getToken(forceRefresh = false): Promise<string | null> {
  if (
    !forceRefresh &&
    cachedToken !== null &&
    Date.now() < cachedTokenExpiresAt
  ) {
    return cachedToken;
  }

  const response = await fetch(KUWO_WEB_ORIGIN, {
    method: 'get',
    headers: { referer: KUWO_WEB_ORIGIN },
  });
  const setCookie = response.headers.get('set-cookie');
  const token =
    setCookie === null ? null : getCookieValue(setCookie, KW_TOKEN_COOKIE);

  if (token === null) {
    // React Native's fetch does not reliably expose `Set-Cookie`, so this
    // handshake can legitimately come up empty. Drop the stale cache entry and
    // let the caller retry without CSRF headers.
    cachedToken = null;
    cachedTokenExpiresAt = 0;

    return null;
  }

  cachedToken = token;
  cachedTokenExpiresAt = Date.now() + KW_TOKEN_TTL_MS;

  return token;
}

/**
 * Kuwo reports a failed CSRF handshake as `success: false`; some deployments
 * instead answer with a bare error envelope that carries neither `success` nor
 * `data`. Both cases must be treated as a rejection rather than as empty data.
 */
function isRejected(response: RawApiEnvelope): boolean {
  return (
    response.success === false ||
    (response.success === undefined && response.data === undefined)
  );
}

/**
 * GET a Kuwo web API endpoint, refreshing the CSRF token once when Kuwo
 * rejects the request. Transport errors and a second rejection both throw.
 */
async function requestApi<T extends RawApiEnvelope>(url: string): Promise<T> {
  const token = await getToken();
  const first = await fetchJson<T>(url, buildCsrfHeaders(token));

  if (!isRejected(first)) {
    return first;
  }

  const refreshedToken = await getToken(true);
  const retry = await fetchJson<T>(url, buildCsrfHeaders(refreshedToken));

  if (isRejected(retry)) {
    const reason = retry.msg === undefined ? '' : ` (${retry.msg})`;

    throw new Error(
      refreshedToken === null
        ? `Kuwo rejected the request to ${url}${reason}: no ${KW_TOKEN_COOKIE} token could be read from the ${KUWO_WEB_ORIGIN} response headers, because React Native's fetch does not expose Set-Cookie, so the CSRF handshake could not be completed.`
        : `Kuwo rejected the request to ${url}${reason} even after refreshing the ${KW_TOKEN_COOKIE} CSRF token.`,
    );
  }

  return retry;
}

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

function htmlDecode(value: string): string {
  return decode(value);
}

/** `musicrid` looks like `MUSIC_228908`; the bare id is what Kuwo APIs take. */
function musicIdFromMusicrid(musicrid: string): string {
  const parts = musicrid.split('_');

  return parts.length > 1 ? parts[1] : musicrid;
}

/**
 * Cover art is a second request per song. A failed or non-URL body resolves to
 * `''` so that a missing cover never fails the whole playlist.
 */
async function fetchCoverUrl(rid: string): Promise<string> {
  const targetUrl = `http://artistpicserver.kuwo.cn/pic.web?type=rid_pic&pictype=url&size=240&rid=${rid}`;

  try {
    const response = await fetch(targetUrl);

    if (!response.ok) {
      return '';
    }

    const body = (await response.text()).trim();

    return /^https?:\/\//.test(body) ? body : '';
  } catch {
    return '';
  }
}

/* -------------------------------------------------------------------------- */
/* Playlist detail                                                            */
/* -------------------------------------------------------------------------- */

async function renderPlaylistTrack(item: RawPlaylistTrack): Promise<Track> {
  const rid = String(item.id);
  const imgUrl = await fetchCoverUrl(rid);

  return {
    id: `${TRACK_ID_PREFIX}${rid}`,
    title: htmlDecode(item.name),
    artist: item.artist,
    artist_id: `kwartist_${item.artistid}`,
    album: htmlDecode(item.album),
    album_id: `kwalbum_${item.albumid}`,
    source: 'kuwo',
    source_url: `http://www.kuwo.cn/yinyue/${rid}`,
    img_url: imgUrl,
    url: `${TRACK_ID_PREFIX}${rid}`,
    lyric_url: rid,
  };
}

async function kwGetPlaylist(rawId: string): Promise<PlaylistDetail> {
  const targetUrl = `http://nplserver.kuwo.cn/pl.svc?op=getlistinfo&pn=0&rn=200&encode=utf-8&keyset=pl2012&pcmp4=1&pid=${rawId}&vipver=MUSIC_9.0.2.0_W1&newver=1`;
  const data = await fetchJson<RawPlaylistResponse>(targetUrl);
  const songs = data.musiclist ?? [];
  // The legacy item renderer fired the cover lookup without awaiting it, so the
  // returned tracks usually had `img_url: ''`. Await every lookup instead.
  const tracks = await Promise.all(
    songs.map((song) => renderPlaylistTrack(song)),
  );
  const pid = data.id === undefined ? rawId : String(data.id);

  return {
    info: {
      cover_img_url: data.pic ?? '',
      title: data.title ?? '',
      id: `${PLAYLIST_ID_PREFIX}${pid}`,
      source_url: `http://www.kuwo.cn/playlist/index?pid=${pid}`,
    },
    tracks,
  };
}

/* -------------------------------------------------------------------------- */
/* Provider surface                                                           */
/* -------------------------------------------------------------------------- */

async function showPlaylist(offset: number): Promise<PageResult<PlaylistInfo>> {
  const targetUrl = `http://www.kuwo.cn/www/categoryNew/getPlayListInfoUnderCategory?type=taglist&digest=10000&id=37&start=${
    offset * 30
  }&count=30`;
  const data = await fetchJson<RawCategoryResponse>(targetUrl);
  const groups = data.data ?? [];
  const items = groups[0]?.data ?? [];

  if (items.length === 0) {
    return { result: [], hasNextPage: false };
  }

  const result: PlaylistInfo[] = items.map((item) => ({
    cover_img_url: item.img ?? '',
    title: item.name,
    id: `${PLAYLIST_ID_PREFIX}${item.id}`,
    source_url: `http://www.kuwo.cn/playlist/index?pid=${item.id}`,
  }));

  return { result, hasNextPage: true };
}

async function search(
  keyword: string,
  page: number,
): Promise<PageResult<Track>> {
  const targetUrl = `https://www.kuwo.cn/api/www/search/searchMusicBykeyWord?key=${encodeURIComponent(
    keyword,
  )}&pn=${page}&rn=30`;
  const data = await requestApi<RawSearchResponse>(targetUrl);
  const items = data.data?.list ?? [];
  const result: Track[] = items.map((item) => {
    const musicId = musicIdFromMusicrid(item.musicrid);

    return {
      id: `${TRACK_ID_PREFIX}${musicId}`,
      title: htmlDecode(item.name),
      artist: item.artist,
      artist_id: `kwartist_${item.artistid}`,
      album: htmlDecode(item.album),
      album_id: `kwalbum_${item.albumid}`,
      source: 'kuwo',
      source_url: `http://www.kuwo.cn/yinyue/${musicId}`,
      img_url: item.albumpic ?? '',
      url: `${TRACK_ID_PREFIX}${musicId}`,
      lyric_url: musicId,
    };
  });

  return { result, total: data.data?.total };
}

async function getPlaylist(playlistId: PlaylistId): Promise<PlaylistDetail> {
  const separator = playlistId.indexOf('_');
  const prefix = separator === -1 ? playlistId : playlistId.slice(0, separator);
  const rawId = separator === -1 ? '' : playlistId.slice(separator + 1);

  if (prefix !== 'kwplaylist') {
    throw new Error(
      `Unsupported Kuwo playlist id "${playlistId}": only "${PLAYLIST_ID_PREFIX}<pid>" ids can be loaded.`,
    );
  }

  if (rawId === '') {
    throw new Error(
      `Invalid Kuwo playlist id "${playlistId}": the numeric playlist id is missing.`,
    );
  }

  return kwGetPlaylist(rawId);
}

async function bootstrapTrack(trackId: TrackId): Promise<string> {
  const songId = trackId.slice(TRACK_ID_PREFIX.length);
  const targetUrl = `http://antiserver.kuwo.cn/anti.s?type=convert_url&format=mp3&response=url&rid=${songId}`;
  const response = await fetch(targetUrl, {
    headers: { referer: KUWO_WEB_ORIGIN },
  });

  if (!response.ok) {
    throw new Error(
      `Kuwo stream lookup for "${trackId}" failed with HTTP ${response.status}`,
    );
  }

  const body = (await response.text()).trim();

  // Kuwo answers with the plain URL on success and with a short error string
  // (or nothing) when the song is not playable.
  return /^https?:\/\//.test(body) ? body : '';
}

function parseUrl(url: string): ParsedUrl | null {
  const indexMatch = /\/\/(?:www|m)\.kuwo\.cn\/playlist\/index\?(?:[^#\s]*&)?pid=(\d+)/.exec(
    url,
  );

  if (indexMatch !== null) {
    return { type: 'playlist', id: `${PLAYLIST_ID_PREFIX}${indexMatch[1]}` };
  }

  const detailMatch = /\/\/(?:www|m)\.kuwo\.cn\/playlist_detail\/(\d+)/.exec(url);

  if (detailMatch !== null) {
    return { type: 'playlist', id: `${PLAYLIST_ID_PREFIX}${detailMatch[1]}` };
  }

  // Mobile share links look like m.kuwo.cn/h5app/playlist/<pid>.
  const shareMatch =
    /\/\/(?:www|m)\.kuwo\.cn\/(?:h5app|newh5app|newh5)\/playlist\/(\d+)/.exec(
      url,
    );

  if (shareMatch !== null) {
    return { type: 'playlist', id: `${PLAYLIST_ID_PREFIX}${shareMatch[1]}` };
  }

  return null;
}

const kuwoProvider: MusicProvider = {
  meta,
  showPlaylist,
  search,
  getPlaylist,
  bootstrapTrack,
  parseUrl,
};

export default kuwoProvider;
