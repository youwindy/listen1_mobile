/**
 * QQ Music provider.
 *
 * Ported from `legacy/src/api/provider/qq.js` (React Native 0.59 / Flow).
 * Request URLs, query strings, JSONP unwrapping, field mappings and id prefixes
 * are preserved verbatim; the few intentional behavioural changes are called
 * out in comments.
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

const meta: ProviderMeta = { name: 'QQ', platformId: 'qq', enName: 'qq' };

/** Id prefixes, identical to the legacy provider. */
const TRACK_ID_PREFIX = 'qqtrack_';
const ARTIST_ID_PREFIX = 'qqartist_';
const ALBUM_ID_PREFIX = 'qqalbum_';
const PLAYLIST_ID_PREFIX = 'qqplaylist_';

/** JSONP wrapper names; they must match the `jsonpCallback` query parameters. */
const SEARCH_JSONP_CALLBACK = 'jsonp4';
const PLAYLIST_JSONP_CALLBACK = 'jsonCallback';

/** QQ answers with an empty body unless the referer is a y.qq.com page. */
const YQQ_REFERER = 'https://y.qq.com/';

/** The mobile user agent the legacy app sent to the vkey endpoint. */
const MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; U; Android 8.1.0; zh-cn; BLA-AL00 Build/HUAWEIBLA-AL00) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/57.0.2987.132 MQQBrowser/8.9 Mobile Safari/537.36';

// ---------------------------------------------------------------------------
// Raw payload shapes (untrusted JSON / JSONP)
// ---------------------------------------------------------------------------

interface RawQqSinger {
  name: string;
  mid: string;
}

interface RawQqSong {
  songmid: string;
  songname: string;
  albummid: string;
  albumname: string;
  singer: RawQqSinger[];
  /**
   * Bit field describing which actions an anonymous user may take; see
   * `qqIsPlayable()`. QQ sends it as a number, but a string is tolerated the
   * same way the legacy `toString(2)` call tolerated it.
   */
  switch: number | string;
}

interface RawQqPlaylistItem {
  dissid: string | number;
  dissname: string;
  imgurl: string;
}

interface RawQqPlaylistListResponse {
  data: {
    list: RawQqPlaylistItem[];
  };
}

interface RawQqSearchResponse {
  data: {
    song: {
      list: RawQqSong[];
      totalnum?: number;
    };
  };
}

interface RawQqCdListItem {
  logo: string;
  dissname: string;
  songlist: RawQqSong[];
}

interface RawQqPlaylistDetailResponse {
  cdlist: RawQqCdListItem[];
}

interface RawQqMidurlInfo {
  purl: string;
}

interface RawQqVkeyResponse {
  req_0: {
    data: {
      sip: string[];
      midurlinfo: RawQqMidurlInfo[];
    };
  };
}

// ---------------------------------------------------------------------------
// Untrusted payload narrowing
// ---------------------------------------------------------------------------

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Narrows an untrusted payload to a JSON object, or throws with context. */
function requireObject(value: unknown, what: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new Error(`QQ ${what}: expected a JSON object`);
  }

  return value;
}

/** Narrows an untrusted payload to a JSON array, or throws with context. */
function requireArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`QQ ${what}: expected a JSON array`);
  }

  return value;
}

/** Validates the shape `showPlaylist` reads before trusting the cast. */
function asQqPlaylistListResponse(value: unknown): RawQqPlaylistListResponse {
  const root = requireObject(value, 'showPlaylist response');
  const data = requireObject(root.data, 'showPlaylist response.data');
  requireArray(data.list, 'showPlaylist response.data.list');

  return value as RawQqPlaylistListResponse;
}

/** Validates the shape `search` reads before trusting the cast. */
function asQqSearchResponse(value: unknown): RawQqSearchResponse {
  const root = requireObject(value, 'search response');
  const data = requireObject(root.data, 'search response.data');
  const song = requireObject(data.song, 'search response.data.song');
  requireArray(song.list, 'search response.data.song.list');

  return value as RawQqSearchResponse;
}

/** Validates the shape `getPlaylist` reads before trusting the cast. */
function asQqPlaylistDetailResponse(
  value: unknown,
): RawQqPlaylistDetailResponse {
  const root = requireObject(value, 'getPlaylist response');
  const cdlist = requireArray(root.cdlist, 'getPlaylist response.cdlist');
  const first = requireObject(cdlist[0], 'getPlaylist response.cdlist[0]');
  requireArray(first.songlist, 'getPlaylist response.cdlist[0].songlist');

  return value as RawQqPlaylistDetailResponse;
}

/** Validates the shape `bootstrapTrack` reads before trusting the cast. */
function asQqVkeyResponse(value: unknown): RawQqVkeyResponse {
  const root = requireObject(value, 'bootstrapTrack response');
  const req0 = requireObject(root.req_0, 'bootstrapTrack response.req_0');
  const data = requireObject(req0.data, 'bootstrapTrack response.req_0.data');
  requireArray(data.sip, 'bootstrapTrack response.req_0.data.sip');
  const midurlinfo = requireArray(
    data.midurlinfo,
    'bootstrapTrack response.req_0.data.midurlinfo',
  );
  const first = requireObject(
    midurlinfo[0],
    'bootstrapTrack response.req_0.data.midurlinfo[0]',
  );

  if (typeof first.purl !== 'string') {
    throw new Error(
      'QQ bootstrapTrack response: req_0.data.midurlinfo[0].purl is not a string',
    );
  }

  return value as RawQqVkeyResponse;
}

/**
 * Unwraps a JSONP body exactly like the legacy app did — a fixed-width prefix
 * slice (`text.slice('jsonp4('.length, -')'.length)`) plus `JSON.parse` — and
 * returns the result as `unknown`, so every caller must narrow it.
 */
function parseJsonpBody(text: string, callbackName: string): unknown {
  const body = text.slice(`${callbackName}(`.length, -')'.length);

  try {
    const parsed: unknown = JSON.parse(body);

    return parsed;
  } catch {
    throw new Error(`QQ: ${callbackName} response was not valid JSON`);
  }
}

/** Reads a response body as `unknown` instead of the untyped `Response.json()`. */
async function readJson(response: Response, what: string): Promise<unknown> {
  try {
    const body: unknown = await response.json();

    return body;
  } catch {
    throw new Error(`QQ ${what}: response was not valid JSON`);
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `fetch` with a QQ-specific message; failures propagate instead of vanishing. */
async function qqFetch(
  url: string,
  init: RequestInit,
  what: string,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw new Error(`QQ ${what} request failed: ${describeError(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/**
 * The legacy `htmlDecode` was a no-op stub that returned its argument, so song,
 * artist and album names kept the HTML entities QQ sends (`&apos;`, `&quot;`,
 * `&#39;`, ...). Deliberate change: decode them for real via `html-entities`.
 */
function htmlDecode(s: string | null | undefined): string {
  return decode(s);
}

/**
 * Builds a QQ cover URL from an image id, using the same layout as the legacy
 * helper: `<category>/<2nd last char>/<last char>/<id>.jpg`. Only the scheme
 * changed — the legacy helper returned `http://`, this one returns `https://`,
 * which the same imgcache CDN serves.
 */
function qqGetImageUrl(
  qqimgid: string | null | undefined,
  imgType: 'artist' | 'album',
): string {
  if (qqimgid === null || qqimgid === undefined) {
    return '';
  }

  let category = '';

  if (imgType === 'artist') {
    category = 'mid_singer_300';
  }
  if (imgType === 'album') {
    category = 'mid_album_300';
  }

  const s = [
    category,
    qqimgid[qqimgid.length - 2],
    qqimgid[qqimgid.length - 1],
    qqimgid,
  ].join('/');

  return `https://imgcache.qq.com/music/photo/${s}.jpg`;
}

/**
 * Reads the `switch` bit field exactly as the legacy app read it:
 *
 *   const switchFlag = song.switch.toString(2).split('');
 *   switchFlag.pop();                 // drop the least significant bit
 *   switchFlag.reverse();
 *   const playFlag = switchFlag[0];   // the bit that remains least significant
 *
 * Flag table copied from `legacy/src/api/provider/qq.js`:
 *   ["play_lq", "play_hq", "play_sq", "down_lq", "down_hq", "down_sq", "soso",
 *    "fav", "share", "bgm", "ring", "sing", "radio", "try", "give"]
 * Because only index 0 is inspected, the flag actually read is `play_lq`.
 */
function qqIsPlayable(song: RawQqSong): boolean {
  // `Number.prototype.toString(2)` renders binary, while
  // `String.prototype.toString` ignores the radix — so the legacy
  // `song.switch.toString(2)` produced the base-2 digits for a number and the
  // unchanged string for a string. Both cases behave identically here.
  const binary =
    typeof song.switch === 'number' ? song.switch.toString(2) : song.switch;

  const switchFlag = binary.split('');

  switchFlag.pop();
  switchFlag.reverse();
  const playFlag = switchFlag[0];

  return playFlag === '1';
}

/** `song.singer[0]`, which the legacy code indexed without checking. */
function leadSinger(song: RawQqSong): RawQqSinger {
  const singers: RawQqSinger[] | undefined = song.singer;
  const singer: RawQqSinger | undefined = Array.isArray(singers)
    ? singers[0]
    : undefined;

  if (singer === undefined) {
    throw new Error(`QQ song ${song.songmid}: payload has no singer entry`);
  }

  return singer;
}

function qqConvertSong(song: RawQqSong): Track {
  const singer = leadSinger(song);

  return {
    id: `${TRACK_ID_PREFIX}${song.songmid}`,
    title: htmlDecode(song.songname),
    artist: htmlDecode(singer.name),
    artist_id: `${ARTIST_ID_PREFIX}${singer.mid}`,
    album: htmlDecode(song.albumname),
    album_id: `${ALBUM_ID_PREFIX}${song.albummid}`,
    img_url: qqGetImageUrl(song.albummid, 'album'),
    source: 'qq',
    source_url: `http://y.qq.com/#type=song&mid=${song.songmid}&tpl=yqq_song_detail`,
    url: `${TRACK_ID_PREFIX}${song.songmid}`,
    disabled: !qqIsPlayable(song),
  };
}

// ---------------------------------------------------------------------------
// Provider endpoints
// ---------------------------------------------------------------------------

async function showPlaylist(offset: number): Promise<PageResult<PlaylistInfo>> {
  const url =
    'https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg?' +
    'picmid=1&loginUin=0&hostUin=0&format=json&inCharset=utf8' +
    '&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0' +
    '&categoryId=10000000&sortId=5' +
    `&sin=${offset}&ein=${29 + offset}`;

  const response = await qqFetch(
    url,
    { headers: { Referer: YQQ_REFERER } },
    'showPlaylist',
  );
  const data = asQqPlaylistListResponse(await readJson(response, 'showPlaylist'));

  const result: PlaylistInfo[] = data.data.list.map(item => ({
    cover_img_url: item.imgurl,
    title: item.dissname,
    id: `${PLAYLIST_ID_PREFIX}${item.dissid}`,
    source_url: `http://y.qq.com/#type=taoge&id=${item.dissid}`,
  }));

  return { result };
}

async function search(
  keyword: string,
  page: number,
): Promise<PageResult<Track>> {
  // The keyword is interpolated raw, exactly as the legacy provider did.
  const url =
    'http://i.y.qq.com/s.music/fcgi-bin/search_for_qq_cp?' +
    'g_tk=938407465&uin=0&format=jsonp&inCharset=utf-8' +
    '&outCharset=utf-8&notice=0&platform=h5&needNewCode=1' +
    `&w=${keyword}&zhidaqu=1&catZhida=1` +
    `&t=0&flag=1&ie=utf-8&sem=1&aggr=0&perpage=20&n=20&p=${page}` +
    '&remoteplace=txt.mqq.all&_=1459991037831&jsonpCallback=' +
    SEARCH_JSONP_CALLBACK;

  const response = await qqFetch(
    url,
    { headers: { Referer: YQQ_REFERER } },
    'search',
  );
  const textData = await response.text();
  const jsonData = asQqSearchResponse(
    parseJsonpBody(textData, SEARCH_JSONP_CALLBACK),
  );

  const tracks = jsonData.data.song.list.map(item => qqConvertSong(item));

  return { result: tracks, total: jsonData.data.song.totalnum };
}

async function getPlaylist(playlistId: PlaylistId): Promise<PlaylistDetail> {
  const listId = playlistId.split('_').pop();

  if (listId === undefined) {
    throw new Error(`QQ getPlaylist: malformed playlist id "${playlistId}"`);
  }

  const targetUrl =
    'http://i.y.qq.com/qzone-music/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?' +
    'type=1&json=1&utf8=1&onlysong=0&jsonpCallback=' +
    `${PLAYLIST_JSONP_CALLBACK}&nosign=1&disstid=${listId}` +
    '&g_tk=5381&loginUin=0&hostUin=0' +
    '&format=jsonp&inCharset=GB2312&outCharset=utf-8&notice=0' +
    `&platform=yqq&jsonpCallback=${PLAYLIST_JSONP_CALLBACK}&needNewCode=0`;

  const response = await qqFetch(
    targetUrl,
    { headers: { Referer: YQQ_REFERER } },
    'getPlaylist',
  );
  const textData = await response.text();
  const jsonData = asQqPlaylistDetailResponse(
    parseJsonpBody(textData, PLAYLIST_JSONP_CALLBACK),
  );

  const cdlist: RawQqCdListItem | undefined = jsonData.cdlist[0];

  if (cdlist === undefined) {
    throw new Error(
      `QQ getPlaylist: response for ${listId} contained no cdlist entry`,
    );
  }

  const info: PlaylistInfo = {
    cover_img_url: cdlist.logo,
    title: cdlist.dissname,
    id: `${PLAYLIST_ID_PREFIX}${listId}`,
    source_url: `http://y.qq.com/#type=taoge&id=${listId}`,
  };

  const tracks = cdlist.songlist.map(item => qqConvertSong(item));

  return { tracks, info };
}

async function bootstrapTrack(trackId: TrackId): Promise<string> {
  const songId = trackId.slice(TRACK_ID_PREFIX.length);
  const targetUrl =
    'https://u.y.qq.com/cgi-bin/musicu.fcg?loginUin=0&' +
    'hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&' +
    'platform=yqq.json&needNewCode=0&data=%7B%22req_0%22%3A%7B%22' +
    'module%22%3A%22vkey.GetVkeyServer%22%2C%22method%22%3A%22' +
    'CgiGetVkey%22%2C%22param%22%3A%7B%22guid%22%3A%2210000%22%2C%22songmid%22%3A%5B%22' +
    `${songId}%22%5D%2C%22songtype%22%3A%5B0%5D%2C%22uin%22%3A%220%22%2C%22loginflag%22` +
    '%3A1%2C%22platform%22%3A%2220%22%7D%7D%2C%22comm%22%3A%7B%22uin%22%3A0%2C%22' +
    'format%22%3A%22json%22%2C%22ct%22%3A20%2C%22cv%22%3A0%7D%7D';

  const response = await qqFetch(
    targetUrl,
    {
      method: 'GET',
      headers: {
        Referer: YQQ_REFERER,
        'User-Agent': MOBILE_USER_AGENT,
      },
    },
    'bootstrapTrack',
  );
  const data = asQqVkeyResponse(await readJson(response, 'bootstrapTrack'));

  const midurlinfo: RawQqMidurlInfo | undefined =
    data.req_0.data.midurlinfo[0];

  if (midurlinfo === undefined) {
    throw new Error('QQ bootstrapTrack: response carried no midurlinfo entry');
  }

  // An empty `purl` means "not playable": the one case that resolves to ''.
  if (midurlinfo.purl === '') {
    return '';
  }

  const sip: string | undefined = data.req_0.data.sip[0];

  if (sip === undefined) {
    throw new Error('QQ bootstrapTrack: response carried no stream host');
  }

  return sip + midurlinfo.purl;
}

function parseUrl(url: string): ParsedUrl | null {
  let result: ParsedUrl | null = null;
  let match = /\/\/y.qq.com\/n\/yqq\/playlist\/([0-9]+)/.exec(url);

  if (match !== null) {
    const playlistId = match[1];

    result = {
      type: 'playlist',
      id: `${PLAYLIST_ID_PREFIX}${playlistId}`,
    };
  }

  match = /\/\/y.qq.com\/n\/yqq\/playsquare\/([0-9]+)/.exec(url);
  if (match !== null) {
    const playlistId = match[1];

    result = {
      type: 'playlist',
      id: `${PLAYLIST_ID_PREFIX}${playlistId}`,
    };
  }

  match = /\/\/y.qq.com\/n\/m\/detail\/taoge\/index.html\?id=([0-9]+)/.exec(url);
  if (match !== null) {
    const playlistId = match[1];

    result = {
      type: 'playlist',
      id: `${PLAYLIST_ID_PREFIX}${playlistId}`,
    };
  }

  return result;
}

const qqProvider: MusicProvider = {
  meta,
  showPlaylist,
  getPlaylist,
  parseUrl,
  bootstrapTrack,
  search,
};

export default qqProvider;
