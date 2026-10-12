/**
 * Kugou (酷狗) provider.
 *
 * Faithful TypeScript port of `legacy/src/api/provider/kugou.js` plus the
 * helpers that provider used from `legacy/src/utils/kugouUtils.js` (device
 * token + request signature generation). Those helpers are inlined here
 * because no other provider uses them.
 *
 * Endpoints (unchanged from the legacy implementation):
 *   - http://m.kugou.com/plist/index?json=true&page=<offset>
 *   - http://m.kugou.com/plist/list/<listId>?json=true
 *   - http://songsearch.kugou.com/song_search_v2?keyword=<kw>&page=<page>
 *   - http://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=<hash>
 *   - http://mobilecdnbj.kugou.com/api/v3/album/info?albumid=<id>
 *   - http://mobilecdnbj.kugou.com/api/v3/album/song?albumid=<id>
 *     &page=1&pagesize=-1
 *   - http://mobilecdnbj.kugou.com/api/v3/singer/info?singerid=<id>
 *   - http://mobilecdnbj.kugou.com/api/v3/singer/song?singerid=<id>
 *     &page=1&pagesize=30
 *   - http://www.kugou.com/yy/index.php?r=play/getdata&hash=<hash>
 *   - https://userservice.kugou.com/risk/v1/r_register_dev?...
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import md5 from 'crypto-js/md5';

import type {
  PageResult,
  ParsedUrl,
  PlaylistDetail,
  PlaylistId,
  PlaylistInfo,
  Track,
  TrackId,
} from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'kg_token';
const TOKEN_APP_ID = 1014;
const TOKEN_PLAT_ID = 4;
const TOKEN_CLIENT_VERSION = 0;
const TOKEN_USER_ID = 0;
const TOKEN_P_TOKEN = '';

/**
 * Body posted to `userservice.kugou.com/risk/v1/r_register_dev` by the legacy
 * app, byte for byte.
 */
const TOKEN_REQUEST_BODY =
  'eyJhcHBDb2RlTmFtZSI6Ik1vemlsbGEiLCJhcHBOYW1lIjoiTmV0c2NhcGUiLCJhcHBWZXJzaW9uIjoiNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS83NS4wLjM3NzAuMTAwIFNhZmFyaS81MzcuMzYiLCJjb25uZWN0aW9uIjoib3RoZXIiLCJkb05vdFRyYWNrIjoiIiwiaGFyZHdhcmVDb25jdXJyZW5jeSI6OCwibGFuZ3VhZ2UiOiJlbiIsImxhbmd1YWdlcyI6ImVuLHpoLUNOLHpoIiwibWF4VG91Y2hQb2ludHMiOjAsIm1pbWVUeXBlcyI6ImFwcGxpY2F0aW9uL21zZXhjZWwsYXBwbGljYXRpb24vbXNwb3dlcnBvaW50LGFwcGxpY2F0aW9uL21zd29yZCxhcHBsaWNhdGlvbi9tc3dvcmQtdGVtcGxhdGUsYXBwbGljYXRpb24vcGRmLGFwcGxpY2F0aW9uL3ZuZC5jZXMtcXVpY2twb2ludCxhcHBsaWNhdGlvbi92bmQuY2VzLXF1aWNrc2hlZXQsYXBwbGljYXRpb24vdm5kLmNlcy1xdWlja3dvcmQsYXBwbGljYXRpb24vdm5kLm1zLWV4Y2VsLGFwcGxpY2F0aW9uL3ZuZC5tcy1leGNlbC5zaGVldC5tYWNyb0VuYWJsZWQuMTIsYXBwbGljYXRpb24vdm5kLm1zLWV4Y2VsLnNoZWV0Lm1hY3JvZW5hYmxlZC4xMixhcHBsaWNhdGlvbi92bmQubXMtcG93ZXJwb2ludCxhcHBsaWNhdGlvbi92bmQubXMtcG93ZXJwb2ludC5wcmVzZW50YXRpb24ubWFjcm9FbmFibGVkLjEyLGFwcGxpY2F0aW9uL3ZuZC5tcy1wb3dlcnBvaW50LnByZXNlbnRhdGlvbi5tYWNyb2VuYWJsZWQuMTIsYXBwbGljYXRpb24vdm5kLm1zLXdvcmQsYXBwbGljYXRpb24vdm5kLm1zLXdvcmQuZG9jdW1lbnQuMTIsYXBwbGljYXRpb24vdm5kLm1zLXdvcmQuZG9jdW1lbnQubWFjcm9FbmFibGVkLjEyLGFwcGxpY2F0aW9uL3ZuZC5tcy13b3JkLmRvY3VtZW50Lm1hY3JvZW5hYmxlZC4xMixhcHBsaWNhdGlvbi92bmQubXN3b3JkLGFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC5wcmVzZW50YXRpb25tbC5wcmVzZW50YXRpb24sYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LnByZXNlbnRhdGlvbm1sLnRlbXBsYXRlLGFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC5zcHJlYWRzaGVldG1sLnNoZWV0LGFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC5zcHJlYWRzaGVldG1sLnRlbXBsYXRlLGFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC53b3JkcHJvY2Vzc2luZ21sLmRvY3VtZW50LGFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC53b3JkcHJvY2Vzc2luZ21sLnRlbXBsYXRlLGFwcGxpY2F0aW9uL3ZuZC5wcmVzZW50YXRpb24tb3BlbnhtbCxhcHBsaWNhdGlvbi92bmQucHJlc2VudGF0aW9uLW9wZW54bWxtLGFwcGxpY2F0aW9uL3ZuZC5zcHJlYWRzaGVldC1vcGVueG1sLGFwcGxpY2F0aW9uL3ZuZC53b3JkcHJvY2Vzc2luZy1vcGVueG1sLGFwcGxpY2F0aW9uL3gtZ29vZ2xlLWNocm9tZS1wZGYsYXBwbGljYXRpb24veC1uYWNsLGFwcGxpY2F0aW9uL3gtcG5hY2wsdGV4dC9jc3YiLCJwbGF0Zm9ybSI6IldpbjMyIiwicGx1Z2lucyI6IkNocm9tZSBQREYgUGx1Z2luLENocm9tZSBQREYgVmlld2VyLEdvb2dsZeaWh+aho+OAgeihqOagvOWPiuW5u+eBr+eJh+eahE9mZmljZee8lui+keaJqeWxleeoi+W6jyxOYXRpdmUgQ2xpZW50IiwidXNlckFnZW50IjoiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzc1LjAuMzc3MC4xMDAgU2FmYXJpLzUzNy4zNiIsImNvbG9yRGVwdGgiOjI0LCJwaXhlbERlcHRoIjoyNCwic2NyZWVuUmVzb2x1dGlvbiI6IjE5MjB4MTA4MCIsInRpbWV6b25lT2Zmc2V0IjotNDgwLCJzZXNzaW9uU3RvcmFnZSI6dHJ1ZSwibG9jYWxTdG9yYWdlIjp0cnVlLCJpbmRleGVkREIiOnRydWUsImNvb2tpZSI6dHJ1ZSwiYWRCbG9jayI6dHJ1ZSwiZGV2aWNlUGl4ZWxSYXRpbyI6MSwiaGFzTGllZE9zIjpmYWxzZSwiaGFzTGllZExhbmd1YWdlcyI6ZmFsc2UsImhhc0xpZWRSZXNvbHV0aW9uIjpmYWxzZSwiaGFzTGllZEJyb3dzZXIiOmZhbHNlLCJ3ZWJnbFJlbmRlcmVyIjoiQU5HTEUgKEFNRCBSYWRlb24oVE0pIFJYIFZlZ2EgMTEgR3JhcGhpY3MgRGlyZWN0M0QxMSB2c181XzAgcHNfNV8wKSIsIndlYmdsVmVuZG9yIjoiR29vZ2xlIEluYy4iLCJjYW52YXMiOiJhMjBiNDg4N2U5ZTI1Nzg4MDlhMDE0Y2VlN2YzNjgwZiIsImZvbnRzIjoiQXJpYWwsQXJpYWwgQmxhY2ssQXJpYWwgTmFycm93LEJvb2sgQW50aXF1YSxCb29rbWFuIE9sZCBTdHlsZSxDYWxpYnJpLENhbWJyaWEsQ2FtYnJpYSBNYXRoLENlbnR1cnksQ2VudHVyeSBHb3RoaWMsQ2VudHVyeSBTY2hvb2xib29rLENvbWljIFNhbnMgTVMsQ29uc29sYXMsQ291cmllcixDb3VyaWVyIE5ldyxHZW9yZ2lhLEhlbHZldGljYSxJbXBhY3QsTHVjaWRhIEJyaWdodCxMdWNpZGEgQ2FsbGlncmFwaHksTHVjaWRhIENvbnNvbGUsTHVjaWRhIEZheCxMdWNpZGEgSGFuZHdyaXRpbmcsTHVjaWRhIFNhbnMsTHVjaWRhIFNhbnMgVHlwZXdyaXRlcixMdWNpZGEgU2FucyBVbmljb2RlLE1pY3Jvc29mdCBTYW5zIFNlcmlmLE1vbm90eXBlIENvcnNpdmEsTVMgR290aGljLE1TIFBHb3RoaWMsTVMgUmVmZXJlbmNlIFNhbnMgU2VyaWYsTVMgU2FucyBTZXJpZixNUyBTZXJpZixQYWxhdGlubyBMaW5vdHlwZSxTZWdvZSBQcmludCxTZWdvZSBTY3JpcHQsU2Vnb2UgVUksU2Vnb2UgVUkgTGlnaHQsU2Vnb2UgVUkgU2VtaWJvbGQsU2Vnb2UgVUkgU3ltYm9sLFRhaG9tYSxUaW1lcyxUaW1lcyBOZXcgUm9tYW4sVHJlYnVjaGV0IE1TLFZlcmRhbmEsV2luZ2RpbmdzLFdpbmdkaW5ncyAyLFdpbmdkaW5ncyAzLEFnZW5jeSBGQixBbGdlcmlhbixCYXNrZXJ2aWxsZSBPbGQgRmFjZSxCYXVoYXVzIDkzLEJlbGwgTVQsQmVybGluIFNhbnMgRkIsQmVybmFyZCBNVCBDb25kZW5zZWQsQmxhY2thZGRlciBJVEMsQm9kb25pIE1ULEJvZG9uaSBNVCBCbGFjayxCb2RvbmkgTVQgQ29uZGVuc2VkLEJvb2tzaGVsZiBTeW1ib2wgNyxCcmFkbGV5IEhhbmQgSVRDLEJyb2Fkd2F5LEJydXNoIFNjcmlwdCBNVCxDYWxpZm9ybmlhbiBGQixDYWxpc3RvIE1ULENhbmRhcmEsQ2FzdGVsbGFyLENlbnRhdXIsQ2hpbGxlcixDb2xvbm5hIE1ULENvbnN0YW50aWEsQ29vcGVyIEJsYWNrLENvcHBlcnBsYXRlIEdvdGhpYyxDb3BwZXJwbGF0ZSBHb3RoaWMgTGlnaHQsQ29yYmVsLEN1cmx6IE1ULEVicmltYSxFZHdhcmRpYW4gU2NyaXB0IElUQyxFbGVwaGFudCxFbmdyYXZlcnMgTVQsRmFuZ1NvbmcsRmVsaXggVGl0bGluZyxGb290bGlnaHQgTVQgTGlnaHQsRm9ydGUsRnJlZXN0eWxlIFNjcmlwdCxGcmVuY2ggU2NyaXB0IE1ULEdhYnJpb2xhLEdpZ2ksR2lsbCBTYW5zIE1ULEdpbGwgU2FucyBNVCBDb25kZW5zZWQsR291ZHkgT2xkIFN0eWxlLEdvdWR5IFN0b3V0LEhhZXR0ZW5zY2h3ZWlsZXIsSGFycmluZ3RvbixIaWdoIFRvd2VyIFRleHQsSW1wcmludCBNVCBTaGFkb3csSW5mb3JtYWwgUm9tYW4sSm9rZXJtYW4sSnVpY2UgSVRDLEthaVRpLEtyaXN0ZW4gSVRDLEt1bnN0bGVyIFNjcmlwdCxNYWduZXRvLE1haWFuZHJhIEdELE1hbGd1biBHb3RoaWMsTWFybGV0dCxNYXR1cmEgTVQgU2NyaXB0IENhcGl0YWxzLE1pY3Jvc29mdCBIaW1hbGF5YSxNaWNyb3NvZnQgSmhlbmdIZWksTWljcm9zb2Z0IE5ldyBUYWkgTHVlLE1pY3Jvc29mdCBQaGFnc1BhLE1pY3Jvc29mdCBUYWkgTGUsTWljcm9zb2Z0IFlhSGVpLE1pY3Jvc29mdCBZaSBCYWl0aSxNaW5nTGlVX0hLU0NTLUV4dEIsTWluZ0xpVS1FeHRCLE1pc3RyYWwsTW9kZXJuIE5vLiAyMCxNb25nb2xpYW4gQmFpdGksTVMgUmVmZXJlbmNlIFNwZWNpYWx0eSxNUyBVSSBHb3RoaWMsTVYgQm9saSxOaWFnYXJhIEVuZ3JhdmVkLE5pYWdhcmEgU29saWQsTlNpbVN1bixPbGQgRW5nbGlzaCBUZXh0IE1ULE9ueXgsUGFsYWNlIFNjcmlwdCBNVCxQYXB5cnVzLFBhcmNobWVudCxQZXJwZXR1YSxQZXJwZXR1YSBUaXRsaW5nIE1ULFBsYXliaWxsLFBNaW5nTGlVLUV4dEIsUG9vciBSaWNoYXJkLFByaXN0aW5hLFJhdmllLFJvY2t3ZWxsLFJvY2t3ZWxsIENvbmRlbnNlZCxTaG93Y2FyZCBHb3RoaWMsU2ltSGVpLFNpbVN1bixTaW1TdW4tRXh0QixTbmFwIElUQyxTdGVuY2lsLFN5bGZhZW4sVGVtcHVzIFNhbnMgSVRDLFR3IENlbiBNVCxUdyBDZW4gTVQgQ29uZGVuc2VkLFZpbmVyIEhhbmQgSVRDLFZpdmFsZGksVmxhZGltaXIgU2NyaXB0LFdpZGUgTGF0aW4iLCJkdCI6IjIwMjAtMDgtMDMiLCJ0aW1lIjoiMjAyMC0wOC0wMyAxNzo1NTo0MyIsInVzZXJpZCI6IiIsIm1pZCI6ImMzOGE1MjA1Y2JhZTdiMWIwNDNmMDcyYTUxYzJjODkyIiwidXVpZCI6ImUwZDdmNDdlODdkZmFjOGM3ODU5MGIwYmI0NjU2MjUyIiwiYXBwaWQiOiIxMDE0Iiwid2ViZHJpdmVyIjpmYWxzZSwiY2FsbFBoYW50b20iOmZhbHNlLCJ0ZW1wS2dNaWQiOiIiLCJyZWZlcnJlciI6IiIsInNvdXJjZSI6Imh0dHBzOi8vd3d3Lmt1Z291LmNvbS8iLCJjbGllbnRBcHBpZCI6IiIsImNsaWVudHZlciI6IiIsImNsaWVudE1pZCI6IiIsImNsaWVudERmaWQiOiIiLCJjbGllbnRVc2VySWQiOiIiLCJhdWRpb0tleSI6IjEyNC4wNDM0NDc0NjUzNzM5In0=';

const KUGOU_MOBILE_REFERER = 'http://m.kugou.com';
const KUGOU_WEB_REFERER = 'http://www.kugou.com/';
const KUGOU_MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; U; Android 8.1.0; zh-cn; BLA-AL00 Build/HUAWEIBLA-AL00) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/57.0.2987.132 MQQBrowser/8.9 Mobile Safari/537.36';

const KUGOU_MOBILE_HEADERS: Record<string, string> = {
  referer: KUGOU_MOBILE_REFERER,
  'content-type': 'application/x-www-form-urlencoded',
  'user-agent': KUGOU_MOBILE_USER_AGENT,
};

// ---------------------------------------------------------------------------
// Raw platform response shapes, as read by the legacy provider
// ---------------------------------------------------------------------------

/** `kg_mid` / `kg_dfid` / `kg_dfid_collect` cookie values cached in storage. */
interface KugouToken {
  collect: string;
  mid: string;
  dfid: string;
}

interface KgSpecial {
  specialid: number | string;
  specialname: string;
  imgurl: string;
}

interface KgPlistIndexData {
  plist: {
    list: {
      info: KgSpecial[];
      has_next?: number | string | boolean;
    };
  };
}

interface KgPlaylistSong {
  hash: string;
  album_id: string;
}

interface KgPlistListData {
  info: {
    list: KgSpecial;
  };
  list: {
    list: {
      info: KgPlaylistSong[];
    };
  };
}

interface KgSongInfo {
  errorCode?: number;
  songName?: string;
  singerName?: string;
  singerId?: number | string;
  imgUrl?: string;
  url?: string;
}

interface KgAlbumInfo {
  status?: number;
  albumid: number | string;
  albumname: string;
  imgurl?: string;
}

/** `/api/v3/album/info` answers with JSON encoded as a string in `data`. */
interface KgAlbumInfoResponse {
  data: KgAlbumInfo | string;
}

interface KgAlbumSongItem {
  hash: string;
}

interface KgAlbumSongResponse {
  data: {
    info: KgAlbumSongItem[];
  };
}

interface KgArtistInfo {
  imgurl: string;
  singername: string;
}

/** `/api/v3/singer/info` answers with JSON encoded as a string in `data`. */
interface KgArtistInfoResponse {
  data: KgArtistInfo | string;
}

interface KgArtistSongItem {
  hash: string;
  album_id: string;
  filename: string;
}

interface KgArtistSongResponse {
  data: {
    info: KgArtistSongItem[];
  };
}

interface KgSearchSong {
  FileHash: string;
  SongName: string;
  AlbumName: string;
  AlbumID: number | string;
  SingerId: number | string | Array<number | string>;
  SingerName: string | string[];
}

interface KgSearchResponse {
  data: {
    lists: KgSearchSong[];
    total?: number;
  };
}

interface KgPlayImageResponse {
  data: {
    img?: string;
  };
}

/** `Track` plus the hash Kugou keeps in `lyric_url` and uses for artwork. */
interface KgTrack extends Track {
  lyric_url: string;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Parse a JSON string that the platform may have wrapped, with a fallback. */
function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** `response.json()` typed as the caller-declared platform shape. */
async function jsonAs<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/**
 * `http://www.kugou.com/yy/index.php?r=play/getdata&hash=<hash>` cover art.
 * Resolves to '' rather than rejecting: a missing cover must not fail a search.
 */
async function fetchImageUrl(hash: string): Promise<string> {
  const url = `http://www.kugou.com/yy/index.php?r=play/getdata&hash=${hash}`;

  try {
    const response = await fetch(url);
    const image = await jsonAs<KgPlayImageResponse>(response);

    return image.data.img ?? '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Kugou device token (inlined from legacy/src/utils/kugouUtils.js)
// ---------------------------------------------------------------------------

function guid(): string {
  function s4(): string {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }

  return `${s4() + s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}

/** Legacy `S()`: a `mid` derived from a fresh guid. */
function getMid(): string {
  return md5(guid()).toString();
}

/**
 * Legacy `signatureParam`: concatenate the sorted parameter *values* (skipping
 * `signature`, iterated in insertion order), then md5 with the appid on both
 * sides.
 */
function signatureParam(
  params: Record<string, unknown>,
  appid: number,
): string {
  const values: unknown[] = [];
  for (const key in params) {
    if (
      Object.prototype.hasOwnProperty.call(params, key) &&
      key !== 'signature'
    ) {
      values.push(params[key]);
    }
  }

  let joined = '';
  const sorted = values.sort();
  for (let i = 0, length = sorted.length; i < length; i++) {
    joined += String(sorted[i]);
  }

  return md5(`${appid}${joined}${appid}`).toString();
}

interface KgTokenUrl {
  collect: string;
  mid: string;
  url: string;
}

/**
 * Legacy `getTokenUrl()`. The AES path (`getConnectUrl`, which needed CryptoJS)
 * is not reachable from this provider, so it is not ported.
 */
function getTokenUrl(): KgTokenUrl {
  const appid = TOKEN_APP_ID;
  const clienttime = parseInt(String(new Date().getTime() / 1e3), 10);
  const mid = getMid();
  const uuid = guid().replace(/-/g, '');

  const params: Record<string, unknown> = {
    appid,
    platid: TOKEN_PLAT_ID,
    clientver: TOKEN_CLIENT_VERSION,
    clienttime,
    signature: '',
    mid,
    uuid,
    userid: TOKEN_USER_ID,
    'p.token': TOKEN_P_TOKEN,
  };
  const signature = signatureParam(params, appid);

  return {
    collect: md5(String(clienttime)).toString(),
    mid,
    url:
      'https://userservice.kugou.com/risk/v1/r_register_dev?appid=' +
      appid +
      '&platid=' +
      TOKEN_PLAT_ID +
      '&clientver=' +
      TOKEN_CLIENT_VERSION +
      '&clienttime=' +
      clienttime +
      '&signature=' +
      signature +
      '&mid=' +
      mid +
      '&userid=' +
      TOKEN_USER_ID +
      '&uuid=' +
      uuid +
      '&p.token=' +
      TOKEN_P_TOKEN,
  };
}

function isKugouToken(value: unknown): value is KugouToken {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.collect === 'string' &&
    typeof candidate.mid === 'string' &&
    typeof candidate.dfid === 'string'
  );
}

async function getToken(): Promise<KugouToken> {
  const cachedString = await AsyncStorage.getItem(TOKEN_KEY);
  if (cachedString) {
    const cached: unknown = parseJson<unknown>(cachedString, null);
    if (isKugouToken(cached)) {
      return cached;
    }
  }

  const t = getTokenUrl();
  const response = await fetch(t.url, {
    method: 'post',
    body: TOKEN_REQUEST_BODY,
  });
  const registered = await jsonAs<{ data: { dfid: string } }>(response);
  const token: KugouToken = {
    collect: t.collect,
    dfid: registered.data.dfid,
    mid: t.mid,
  };

  await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  return token;
}

/**
 * Legacy `requestAPI(url, data)`: GET carrying the Kugou device cookie and a
 * JSON body. The body stays for parity even though React Native's fetch drops
 * bodies on GET requests, exactly as the 0.59 polyfill did.
 */
async function requestAPI<T>(url: string): Promise<T> {
  const token = await getToken();
  const response = await fetch(url, {
    method: 'get',
    headers: {
      ...KUGOU_MOBILE_HEADERS,
      cookie: `kg_dfid=${token.dfid};kg_dfid_collect=${token.collect};kg_mid=${token.mid}`,
    },
    body: JSON.stringify({}),
  });
  return jsonAs<T>(response);
}

// ---------------------------------------------------------------------------
// Browse
// ---------------------------------------------------------------------------

async function showPlaylist(offset: number): Promise<PageResult<PlaylistInfo>> {
  const url = `${KUGOU_MOBILE_REFERER}/plist/index?json=true&page=${offset}`;
  const response = await fetch(url);
  const data = await jsonAs<KgPlistIndexData>(response);

  const result: PlaylistInfo[] = data.plist.list.info.map((item) => ({
    cover_img_url: item.imgurl ? item.imgurl.replace('{size}', '400') : '',
    title: item.specialname,
    id: `kgplaylist_${item.specialid}`,
    source_url: 'http://www.kugou.com/yy/special/single/{size}.html'.replace(
      '{size}',
      String(item.specialid),
    ),
  }));

  return { result, hasNextPage: !!data.plist.list.has_next };
}

async function getPlaylist(playlistId: PlaylistId): Promise<PlaylistDetail> {
  const listId = playlistId.split('_')[0];
  const d = playlistId.split('_').pop() ?? '';

  switch (listId) {
    case 'kgplaylist':
      return kgGetPlaylist(d);
    case 'kgalbum':
      return kgAlbum(d);
    case 'kgartist':
      return kgArtist(d);
    default:
      throw new Error(`kugou: unsupported playlist id ${playlistId}`);
  }
}

async function kgGetPlaylist(listId: string): Promise<PlaylistDetail> {
  const url = `http://m.kugou.com/plist/list/${listId}?json=true`;
  const response = await fetch(url);
  const data = await jsonAs<KgPlistListData>(response);

  const info: PlaylistInfo = {
    cover_img_url: data.info.list.imgurl
      ? data.info.list.imgurl.replace('{size}', '400')
      : '',
    title: data.info.list.specialname,
    id: `kgplaylist_${data.info.list.specialid}`,
    source_url: 'http://www.kugou.com/yy/special/single/{size}.html'.replace(
      '{size}',
      String(data.info.list.specialid),
    ),
  };

  const tracks = await Promise.all(
    data.list.list.info.map((item) => kgRenderPlaylistResultItem(item)),
  );

  return { info, tracks };
}

async function kgRenderPlaylistResultItem(
  item: KgPlaylistSong,
): Promise<KgTrack> {
  let url = `http://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${item.hash}`;

  const track: KgTrack = {
    id: `kgtrack_${item.hash}`,
    title: '',
    artist: '',
    artist_id: '',
    album: '',
    album_id: `kgalbum_${item.album_id}`,
    source: 'kugou',
    source_url: `http://www.kugou.com/song/#hash=${item.hash}&album_id=${item.album_id}`,
    img_url: '',
    url: `kgtrack_${item.hash}`,
    lyric_url: item.hash,
  };

  const response = await fetch(url, {
    headers: { referer: KUGOU_WEB_REFERER },
  });
  const song = await jsonAs<KgSongInfo>(response);
  if (song.errorCode !== 1002) {
    track.title = song.songName ?? '';
    track.artist = song.singerId === 0 ? '未知' : (song.singerName ?? '');
    track.artist_id = `kgartist_${song.singerId}`;
    if (song.imgUrl !== undefined) {
      track.img_url = song.imgUrl.replace('{size}', '400');
    }
  }

  url = `http://mobilecdnbj.kugou.com/api/v3/album/info?albumid=${item.album_id}`;
  const albumResponse = await fetch(url);
  const album = await jsonAs<KgAlbumInfoResponse>(albumResponse);
  const albumData = parseJson<KgAlbumInfo | null>(String(album.data), null);
  if (albumData && albumData.status && albumData.albumname !== undefined) {
    track.album = albumData.albumname;
  } else {
    track.album = '';
  }

  return track;
}

async function kgAlbum(listId: string): Promise<PlaylistDetail> {
  let url = `http://mobilecdnbj.kugou.com/api/v3/album/info?albumid=${listId}`;

  const response = await fetch(url);
  const album = await jsonAs<KgAlbumInfoResponse>(response);
  const albumData = parseJson<KgAlbumInfo | null>(String(album.data), null);
  if (!albumData) {
    throw new Error('kugou: malformed album info response');
  }

  const info: PlaylistInfo = {
    cover_img_url: (albumData.imgurl ?? '').replace('{size}', '400'),
    title: albumData.albumname,
    id: `kgalbum_${albumData.albumid}`,
    source_url: 'http://www.kugou.com/album/{id}.html'.replace(
      '{id}',
      String(albumData.albumid),
    ),
  };

  url = `http://mobilecdnbj.kugou.com/api/v3/album/song?albumid=${listId}&page=1&pagesize=-1`;
  const songsResponse = await fetch(url);
  const songs = await jsonAs<KgAlbumSongResponse>(songsResponse);

  const tracks = await Promise.all(
    songs.data.info.map((item) => kgRenderAlbumResultItem(item, info, listId)),
  );

  return { info, tracks };
}

async function kgRenderAlbumResultItem(
  item: KgAlbumSongItem,
  info: PlaylistInfo,
  albumId: string,
): Promise<KgTrack> {
  const track: KgTrack = {
    id: `kgtrack_${item.hash}`,
    title: '',
    artist: '',
    artist_id: '',
    album: info.title,
    album_id: `kgalbum_${albumId}`,
    source: 'kugou',
    source_url: `http://www.kugou.com/song/#hash=${item.hash}&album_id=${albumId}`,
    img_url: '',
    url: `kgtrack_${item.hash}`,
    lyric_url: item.hash,
  };

  const url = `http://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${item.hash}`;
  const response = await fetch(url);
  const song = await jsonAs<KgSongInfo>(response);

  track.title = song.songName ?? '';
  track.artist = song.singerId === 0 ? '未知' : (song.singerName ?? '');
  track.artist_id = `kgartist_${song.singerId}`;
  track.img_url = (song.imgUrl ?? '').replace('{size}', '400');

  return track;
}

async function kgArtist(listId: string): Promise<PlaylistDetail> {
  let url = `http://mobilecdnbj.kugou.com/api/v3/singer/info?singerid=${listId}`;

  const response = await fetch(url);
  const artist = await jsonAs<KgArtistInfoResponse>(response);
  const artistData = parseJson<KgArtistInfo | null>(String(artist.data), null);
  if (!artistData) {
    throw new Error('kugou: malformed singer info response');
  }

  const info: PlaylistInfo = {
    cover_img_url: artistData.imgurl.replace('{size}', '400'),
    title: artistData.singername,
    id: `kgartist_${listId}`,
    source_url: 'http://www.kugou.com/singer/{id}.html'.replace('{id}', listId),
  };

  url = `http://mobilecdnbj.kugou.com/api/v3/singer/song?singerid=${listId}&page=1&pagesize=30`;
  const songsResponse = await fetch(url);
  const songs = await jsonAs<KgArtistSongResponse>(songsResponse);

  const tracks = await Promise.all(
    songs.data.info.map((item) => kgRenderArtistResultItem(item, info)),
  );

  return { info, tracks };
}

async function kgRenderArtistResultItem(
  item: KgArtistSongItem,
  info: PlaylistInfo,
): Promise<KgTrack> {
  const track: KgTrack = {
    id: `kgtrack_${item.hash}`,
    title: '',
    artist: '',
    artist_id: info.id,
    album: '',
    album_id: `kgalbum_${item.album_id}`,
    source: 'kugou',
    source_url: `http://www.kugou.com/song/#hash=${item.hash}&album_id=${item.album_id}`,
    img_url: '',
    url: `kgtrack_${item.hash}`,
    lyric_url: item.hash,
  };

  // Legacy quirk preserved: `filename` is split on '-' and only the first two
  // segments are used, so a title without '-' leaves `title`/`artist` empty.
  const one = (item.filename ?? '').split('-');
  track.title = (one[1] ?? '').trim();
  track.artist = (one[0] ?? '').trim();

  const imageUrl = `http://www.kugou.com/yy/index.php?r=play/getdata&hash=${item.hash}`;
  const albumUrl = `http://mobilecdnbj.kugou.com/api/v3/album/info?albumid=${item.album_id}`;

  const albumResponse = await fetch(albumUrl);
  const album = await jsonAs<KgAlbumInfoResponse>(albumResponse);
  const albumData = parseJson<KgAlbumInfo | null>(String(album.data), null);
  if (albumData && albumData.status && albumData.albumname !== undefined) {
    track.album = albumData.albumname;
  } else {
    track.album = '';
  }

  const imageResponse = await fetch(imageUrl);
  const image = await jsonAs<KgPlayImageResponse>(imageResponse);
  track.img_url = image.data.img ?? '';

  return track;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

async function search(
  keyword: string,
  page: number,
): Promise<PageResult<Track>> {
  const url = `http://songsearch.kugou.com/song_search_v2?keyword=${keyword}&page=${page}`;
  const data = await requestAPI<KgSearchResponse>(url);

  // The legacy code fired this request without awaiting it, so search results
  // almost always had an empty cover. Await it so rows show artwork (the same
  // fix already applied to the Kuwo provider).
  const tracks = await Promise.all(
    data.data.lists.map((item) => kgRenderSearchResultItem(item)),
  );
  return {
    result: tracks,
    total: data.data.total,
  };
}

async function kgRenderSearchResultItem(item: KgSearchSong): Promise<KgTrack> {
  const track = kgConvertSong(item);

  track.img_url = await fetchImageUrl(track.lyric_url ?? '');

  return track;
}

function kgConvertSong(song: KgSearchSong): KgTrack {
  const track: KgTrack = {
    id: `kgtrack_${song.FileHash}`,
    title: song.SongName,
    artist: '',
    artist_id: '',
    album: song.AlbumName,
    album_id: `kgalbum_${song.AlbumID}`,
    source: 'kugou',
    source_url: `http://www.kugou.com/song/#hash=${song.FileHash}&album_id=${song.AlbumID}`,
    img_url: '',
    url: `kgtrack_${song.FileHash}`,
    lyric_url: song.FileHash,
  };

  // The API sometimes returns these as arrays, so narrow before use.
  const rawSingerId = song.SingerId;
  const singerId: number | string = Array.isArray(rawSingerId)
    ? (rawSingerId[0] ?? '')
    : rawSingerId;
  const rawSingerName = song.SingerName;
  const singerName: string = Array.isArray(rawSingerName)
    ? (rawSingerName[0] ?? '')
    : (rawSingerName.split('、')[0] ?? '');

  track.artist = String(singerName);
  track.artist_id = `kgartist_${singerId}`;

  return track;
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

async function bootstrapTrack(trackId: TrackId): Promise<string> {
  const songId = trackId.slice('kgtrack_'.length);
  const url = `http://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${songId}`;

  const response = await fetch(url, {
    headers: {
      referer: KUGOU_MOBILE_REFERER,
      'content-type': 'application/x-www-form-urlencoded',
    },
  });
  const song = await jsonAs<KgSongInfo>(response);

  // Unavailable / VIP songs answer without a `url`: resolve to '' rather than throw.
  return song.url ?? '';
}

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

/**
 * Recognise Kugou share links.
 *
 * The legacy kugou provider carried a copy of NetEase's `parseUrl`, so Kugou
 * links were never recognised and the branch only ever matched `music.163.com`
 * (where it was shadowed by the NetEase provider anyway). This is the real
 * implementation; `readQueryParam` below backs the `specialid`/`id` forms.
 */
function parseUrl(url: string): ParsedUrl | null {
  // http(s)://www.kugou.com/yy/special/single/<id>.html
  const special = /\/\/[^/]*kugou\.com\/(?:yy|m)\/special\/single\/([0-9]+)/.exec(url);
  if (special !== null) {
    return { type: 'playlist', id: `kgplaylist_${special[1]}` };
  }

  // http(s)://www.kugou.com/songlist/<id>/  (share links use /songlist/)
  const songlist = /\/\/[^/]*kugou\.com\/songlist\/([0-9]+)/.exec(url);
  if (songlist !== null) {
    return { type: 'playlist', id: `kgplaylist_${songlist[1]}` };
  }

  // Legacy query forms: ...?specialid=<id> or ...?id=<id>
  if (url.includes('kugou.com')) {
    const specialId = readQueryParam(url, 'specialid') || readQueryParam(url, 'id');
    if (specialId !== '') {
      return { type: 'playlist', id: `kgplaylist_${specialId}` };
    }
  }

  return null;
}

/** Stands in for `query-string`'s parseUrl, which is no longer a dependency. */
function readQueryParam(url: string, name: string): string {
  // A query can sit either before the hash (`?a=1#x`) or inside it (`#/p?a=1`).
  const hashIndex = url.indexOf('#');
  const candidates: string[] = [];
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const beforeHashQuery = beforeHash.indexOf('?');
  if (beforeHashQuery !== -1) {
    candidates.push(beforeHash.slice(beforeHashQuery + 1));
  }
  if (hashIndex !== -1) {
    const inHash = url.slice(hashIndex);
    const inHashQuery = inHash.indexOf('?');
    if (inHashQuery !== -1) {
      candidates.push(inHash.slice(inHashQuery + 1));
    }
  }

  for (const query of candidates) {
    for (const part of query.split('&')) {
      const separator = part.indexOf('=');
      if (separator === -1) {
        continue;
      }
      if (part.slice(0, separator) === name) {
        return decodeURIComponent(part.slice(separator + 1));
      }
    }
  }

  return '';
}

const meta = {
  name: '酷狗',
  platformId: 'kg',
  enName: 'kugou',
} as const;

export default {
  meta,
  showPlaylist,
  getPlaylist,
  bootstrapTrack,
  search,
  parseUrl,
};
