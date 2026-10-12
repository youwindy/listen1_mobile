/**
 * Response parsing, URL building and id prefixes for the four providers.
 *
 * The payloads below are minimal: they carry only the fields each provider
 * actually reads, so a change in the field mapping or in an id prefix fails
 * here rather than in the app. Endpoints that need several round-trips
 * (NetEase playlist detail + song detail, Kuwo's CSRF handshake, Kugou's device
 * token) are stubbed request by request, which also pins the *order* of the
 * requests and the fact that failures propagate instead of being swallowed
 * (the rewrite removed the legacy `.catch(() => {})`).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as client from '../client';
import kugou from '../provider/kugou';
import kuwo from '../provider/kuwo';
import netease from '../provider/netease';
import qq from '../provider/qq';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface StubReply {
  body?: unknown;
  ok?: boolean;
  status?: number;
  /** Raw `set-cookie` value, used by Kuwo's CSRF handshake. */
  setCookie?: string;
}

interface FetchStub {
  /** Every requested URL, in request order. */
  urls: string[];
  /** The init object passed with each URL, in the same order. */
  inits: (RequestInit | undefined)[];
}

/**
 * Replace the global `fetch` with a URL-driven stub, and record what was asked
 * for. A body that is a string is returned verbatim from `text()` (JSONP and
 * Kuwo's plain-URL answers); anything else is returned from `json()`.
 */
function stubFetch(
  reply: (url: string, init: RequestInit | undefined) => StubReply,
): FetchStub {
  const urls: string[] = [];
  const inits: (RequestInit | undefined)[] = [];

  const fetchMock = (input: unknown, init?: unknown): Promise<Response> => {
    const url = String(input);
    const requestInit = init === undefined ? undefined : (init as RequestInit);

    urls.push(url);
    inits.push(requestInit);

    const current = reply(url, requestInit);
    const response: unknown = {
      ok: current.ok ?? true,
      status: current.status ?? 200,
      json: () => Promise.resolve(current.body),
      text: () =>
        Promise.resolve(
          typeof current.body === 'string'
            ? current.body
            : JSON.stringify(current.body),
        ),
      headers: {
        get: (name: string): string | null =>
          name.toLowerCase() === 'set-cookie' ? current.setCookie ?? null : null,
      },
    };

    return Promise.resolve(response as Response);
  };

  globalThis.fetch = fetchMock as unknown as typeof fetch;

  return { urls, inits };
}

/** Convenience wrapper for the single-response cases. */
function mockFetchJson(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): FetchStub {
  return stubFetch(() => ({ body, ok: init.ok, status: init.status }));
}

/** Narrow a request's headers, which are always a plain object in these tests. */
function requestHeaders(stub: FetchStub, index: number): Record<string, string> {
  const init = stub.inits[index];

  return (init?.headers ?? {}) as unknown as Record<string, string>;
}

/** A `fetch` that fails at the transport level, to pin the error messages. */
function stubRejectingFetch(): void {
  const rejectingFetch = jest.fn(
    (): Promise<Response> => Promise.reject(new Error('socket closed')),
  );

  globalThis.fetch = rejectingFetch as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// NetEase
// ---------------------------------------------------------------------------

describe('netease', () => {
  it('maps the two-request playlist detail into netrack_ ids', async () => {
    const stub = stubFetch((url) => {
      if (url.includes('/weapi/v3/playlist/detail')) {
        return {
          body: {
            playlist: {
              coverImgUrl: 'http://p1.music.126.net/cover.jpg',
              name: '我喜欢的音乐',
              trackIds: [{ id: 111 }, { id: 222 }],
            },
          },
        };
      }

      if (url.includes('/weapi/v3/song/detail')) {
        return {
          body: {
            songs: [
              {
                id: 111,
                name: '第一首',
                ar: [{ id: 1, name: '歌手甲' }],
                al: { id: 2, name: '专辑甲', picUrl: 'http://p1.music.126.net/a.jpg' },
              },
              {
                id: 222,
                name: '第二首',
                ar: [{ id: 3, name: '歌手乙' }],
                al: { id: 4, name: '专辑乙', picUrl: 'http://p1.music.126.net/b.jpg' },
              },
            ],
          },
        };
      }

      throw new Error(`unexpected netease URL: ${url}`);
    });

    const detail = await netease.getPlaylist('neplaylist_123');

    // The detail response only carries trackIds (limit stays 1000), so the
    // provider must follow up with a song-detail request — in that order.
    expect(stub.urls[0]).toContain('/weapi/v3/playlist/detail');
    expect(stub.urls[1]).toContain('/weapi/v3/song/detail');
    expect(stub.urls).toHaveLength(2);

    // The playlist id is rebuilt from the id that was passed in, not echoed
    // from the payload.
    expect(detail.info).toEqual({
      id: 'neplaylist_123',
      title: '我喜欢的音乐',
      cover_img_url: 'http://p1.music.126.net/cover.jpg?param=140y140',
      source_url: 'http://music.163.com/#/playlist?id=123',
    });

    expect(detail.tracks.map((track) => track.id)).toEqual([
      'netrack_111',
      'netrack_222',
    ]);

    // `url` mirrors the prefixed id: it is the legacy playback field, and
    // bootstrapTrack() is what actually resolves the stream.
    expect(detail.tracks[0]).toEqual({
      id: 'netrack_111',
      title: '第一首',
      artist: '歌手甲',
      artist_id: 'neartist_1',
      album: '专辑甲',
      album_id: 'nealbum_2',
      source: 'netease',
      source_url: 'http://music.163.com/#/song?id=111',
      img_url: 'http://p1.music.126.net/a.jpg',
      url: 'netrack_111',
      disabled: false,
    });
  });

  it('maps a search response to netrack_ ids and flags VIP songs as disabled', async () => {
    const stub = mockFetchJson({
      result: {
        songs: [
          {
            id: 5,
            name: '免费歌',
            ar: [{ id: 1, name: '甲' }],
            al: { id: 2, name: '专辑', picUrl: '' },
            status: -1,
            fee: 1,
          },
          {
            id: 6,
            name: '会员歌',
            ar: [{ id: 1, name: '甲' }],
            al: { id: 2, name: '专辑', picUrl: '' },
            // st < 0 means "no playback privilege" — a VIP-only song.
            privilege: { st: -1 },
          },
        ],
        songCount: 42,
      },
    });

    const page = await netease.search('周杰伦', 2);

    expect(stub.urls[0]).toContain('music.163.com/weapi/cloudsearch/get/web');
    expect(page.total).toBe(42);
    expect(page.result.map((track) => track.id)).toEqual([
      'netrack_5',
      'netrack_6',
    ]);
    expect(page.result[0]?.disabled).toBe(false);
    expect(page.result[1]?.disabled).toBe(true);
  });

  it('rejects when the playlist detail carries no playlist', async () => {
    mockFetchJson({ playlist: null });

    await expect(netease.getPlaylist('neplaylist_404')).rejects.toThrow(
      '网易云歌单不存在或无法访问',
    );
  });

  it('rejects a song without an artist instead of emitting an empty artist', async () => {
    mockFetchJson({
      result: {
        // An empty `ar` array is the malformed payload the provider guards
        // against (`ar[0]` is undefined); a *missing* `ar` field fails one step
        // earlier, with a TypeError, which still rejects the request.
        songs: [{ id: 5, name: 'x', ar: [], al: { id: 1, name: 'a', picUrl: '' } }],
        songCount: 1,
      },
    });

    await expect(netease.search('x', 1)).rejects.toThrow(
      /网易云歌曲 5 缺少歌手信息/,
    );
  });

  it('rejects a non-2xx response with the HTTP status', async () => {
    mockFetchJson({}, { ok: false, status: 500 });

    await expect(netease.search('x', 1)).rejects.toThrow(
      /网易云接口请求失败（HTTP 500）/,
    );
  });

  it('rejects a transport failure instead of swallowing it', async () => {
    stubRejectingFetch();

    await expect(netease.search('x', 1)).rejects.toThrow(
      '网络请求失败，请检查网络连接',
    );
  });

  it('resolves "" for a song NetEase reports as unplayable', async () => {
    mockFetchJson({ data: [{ url: null }] });

    await expect(netease.bootstrapTrack('netrack_777')).resolves.toBe('');
  });

  it('returns the stream url when NetEase provides one', async () => {
    mockFetchJson({ data: [{ url: 'http://m7.music.126.net/x.mp3' }] });

    await expect(netease.bootstrapTrack('netrack_777')).resolves.toBe(
      'http://m7.music.126.net/x.mp3',
    );
  });

  it('rejects when NetEase returns no url entry at all', async () => {
    mockFetchJson({ data: [] });

    await expect(netease.bootstrapTrack('netrack_777')).rejects.toThrow(
      '网易云未返回该歌曲的播放地址',
    );
  });

  it('parses hash and path playlist links to neplaylist_ ids', () => {
    expect(netease.parseUrl('http://music.163.com/#/playlist?id=999')).toEqual({
      type: 'playlist',
      id: 'neplaylist_999',
    });
    expect(netease.parseUrl('http://music.163.com/playlist/888')).toEqual({
      type: 'playlist',
      id: 'neplaylist_888',
    });
    expect(netease.parseUrl('https://example.com/whatever')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// QQ
// ---------------------------------------------------------------------------

const qqPlaylistUrls: { url: string; id: string }[] = [
  { url: 'https://y.qq.com/n/yqq/playlist/1234567890.html', id: 'qqplaylist_1234567890' },
  { url: 'https://y.qq.com/n/yqq/playsquare/2345678901.html', id: 'qqplaylist_2345678901' },
  {
    url: 'https://y.qq.com/n/m/detail/taoge/index.html?id=3456789012',
    id: 'qqplaylist_3456789012',
  },
];

describe('qq', () => {
  it.each(qqPlaylistUrls)('parses $url to $id', ({ url, id }) => {
    // The three legacy share shapes must all keep the qqplaylist_ prefix.
    expect(qq.parseUrl(url)).toEqual({ type: 'playlist', id });
  });

  it('returns null for a URL it does not understand', () => {
    expect(qq.parseUrl('https://example.com/whatever')).toBeNull();
  });

  it('unwraps the JSONP search response into qqtrack_ ids', async () => {
    const payload = {
      data: {
        song: {
          list: [
            {
              songmid: 'MID1',
              songname: 'A &apos;B&apos;',
              albummid: 'ALB1',
              albumname: 'Album &quot;X&quot;',
              singer: [{ name: '歌手&apos;甲', mid: 'S1' }],
              // Bit 1 (play_lq) set -> playable.
              switch: 2,
            },
            {
              songmid: 'MID2',
              songname: 'Locked',
              albummid: 'ALB2',
              albumname: 'Album',
              singer: [{ name: '歌手乙', mid: 'S2' }],
              switch: 1,
            },
          ],
          totalnum: 7,
        },
      },
    };

    const stub = stubFetch(() => ({
      body: `jsonp4(${JSON.stringify(payload)})`,
    }));

    const page = await qq.search('周杰伦', 2);

    expect(stub.urls[0]).toContain('jsonpCallback=jsonp4');
    expect(stub.urls[0]).toContain('&w=周杰伦');
    expect(stub.urls[0]).toContain('&p=2');
    expect(page.total).toBe(7);

    const first = page.result[0];

    expect(first?.id).toBe('qqtrack_MID1');
    expect(first?.source).toBe('qq');
    expect(first?.url).toBe('qqtrack_MID1');
    // Deliberate fix over the legacy no-op htmlDecode: QQ sends entities and
    // they used to leak into the UI verbatim.
    expect(first?.title).toBe("A 'B'");
    expect(first?.album).toBe('Album "X"');
    expect(first?.artist).toBe("歌手'甲");
    expect(first?.artist_id).toBe('qqartist_S1');
    expect(first?.album_id).toBe('qqalbum_ALB1');
    expect(first?.disabled).toBe(false);
    // switch bit 1 clear -> the anonymous user may not play it.
    expect(page.result[1]?.disabled).toBe(true);
  });

  it('rejects a JSONP body that is not JSON', async () => {
    stubFetch(() => ({ body: 'jsonp4(<html>oops</html>)' }));

    await expect(qq.search('x', 1)).rejects.toThrow(
      'QQ: jsonp4 response was not valid JSON',
    );
  });

  it('rejects a search song without a singer entry', async () => {
    const payload = {
      data: {
        song: {
          list: [
            {
              songmid: 'MIDX',
              songname: 'x',
              albummid: 'ALB',
              albumname: 'a',
              switch: 2,
            },
          ],
        },
      },
    };

    stubFetch(() => ({ body: `jsonp4(${JSON.stringify(payload)})` }));

    await expect(qq.search('x', 1)).rejects.toThrow(
      'QQ song MIDX: payload has no singer entry',
    );
  });

  it('maps a JSONP playlist detail into qqplaylist_ ids', async () => {
    const payload = {
      cdlist: [
        {
          logo: 'http://img/logo.jpg',
          dissname: '歌单',
          songlist: [
            {
              songmid: 'MID9',
              songname: 'S',
              albummid: 'ALB9',
              albumname: 'Alb',
              singer: [{ name: '歌手', mid: 'S9' }],
              switch: 2,
            },
          ],
        },
      ],
    };

    const stub = stubFetch(() => ({
      body: `jsonCallback(${JSON.stringify(payload)})`,
    }));

    const detail = await qq.getPlaylist('qqplaylist_555');

    expect(stub.urls[0]).toContain('jsonpCallback=jsonCallback');
    expect(stub.urls[0]).toContain('disstid=555');
    expect(detail.info).toEqual({
      id: 'qqplaylist_555',
      title: '歌单',
      cover_img_url: 'http://img/logo.jpg',
      source_url: 'http://y.qq.com/#type=taoge&id=555',
    });
    expect(detail.tracks.map((track) => track.id)).toEqual(['qqtrack_MID9']);
    expect(detail.tracks[0]?.album_id).toBe('qqalbum_ALB9');
  });

  it('rejects a playlist response without a cdlist entry', async () => {
    stubFetch(() => ({ body: 'jsonCallback({"cdlist":[]})' }));

    await expect(qq.getPlaylist('qqplaylist_555')).rejects.toThrow(
      /expected a JSON object/,
    );
  });

  it('resolves "" when QQ reports an empty purl', async () => {
    mockFetchJson({
      req_0: { data: { sip: ['http://sip.qq.com'], midurlinfo: [{ purl: '' }] } },
    });

    await expect(qq.bootstrapTrack('qqtrack_MID1')).resolves.toBe('');
  });

  it('joins the stream host with purl and rejects a malformed vkey response', async () => {
    mockFetchJson({
      req_0: {
        data: { sip: ['http://sip.qq.com'], midurlinfo: [{ purl: '/x.mp3' }] },
      },
    });

    await expect(qq.bootstrapTrack('qqtrack_MID1')).resolves.toBe(
      'http://sip.qq.com/x.mp3',
    );

    mockFetchJson({ req_0: { data: { sip: [], midurlinfo: [] } } });

    await expect(qq.bootstrapTrack('qqtrack_MID1')).rejects.toThrow(
      /expected a JSON object/,
    );
  });
});

// ---------------------------------------------------------------------------
// Kuwo
// ---------------------------------------------------------------------------

/** The CSRF token the stubbed handshake hands out. */
const KW_TOKEN = 'kw-token-1';

/**
 * Kuwo reads the token from `Set-Cookie` and echoes it back as `csrf` + `Cookie`
 * on the next request, so the stub answers `success: true` only when the header
 * was actually sent. The module keeps a 10-minute token cache, which is why
 * every test tolerates both a fresh handshake and a cached token.
 */
function kuwoApiReply(init: RequestInit | undefined): StubReply {
  const headers = (init?.headers ?? {}) as unknown as Record<string, string>;

  if (headers.csrf !== KW_TOKEN) {
    return { body: { success: false, msg: 'csrf token missing' } };
  }

  return {
    body: {
      success: true,
      code: 200,
      data: {
        total: 3,
        list: [
          {
            musicrid: 'MUSIC_228908',
            name: '歌&apos;名',
            artist: '歌手',
            artistid: 9,
            album: '专辑',
            albumid: 8,
            albumpic: 'http://img.kuwo.cn/cover.jpg',
          },
          {
            // `musicrid` without the MUSIC_ prefix must survive unchanged.
            musicrid: '998877',
            name: '第二首',
            artist: '歌手乙',
            artistid: 10,
            album: '专辑乙',
            albumid: 11,
          },
        ],
      },
    },
  };
}

describe('kuwo', () => {
  it('echoes the kw_token CSRF cookie back on the API request', async () => {
    const stub = stubFetch((url, init) => {
      if (url === 'https://www.kuwo.cn/') {
        return { setCookie: `kw_token=${KW_TOKEN}; path=/` };
      }

      const headers = (init?.headers ?? {}) as unknown as Record<string, string>;

      // Kuwo answers success:false when the token is not echoed back, so a
      // missing `csrf` header turns this test into a rejection.
      return {
        body:
          headers.csrf === KW_TOKEN
            ? { success: true, data: { list: [], total: 0 } }
            : { success: false, msg: 'csrf token missing' },
      };
    });

    await expect(kuwo.search('x', 1)).resolves.toEqual({
      result: [],
      total: 0,
    });

    expect(stub.urls[0]).toBe('https://www.kuwo.cn/');
    expect(stub.urls[1]).toContain('searchMusicBykeyWord');
    expect(requestHeaders(stub, 1).csrf).toBe(KW_TOKEN);
    expect(requestHeaders(stub, 1).Cookie).toBe(`kw_token=${KW_TOKEN}`);
  });

  it('maps a search response to kwtrack_ ids, never the legacy xmtrack_ prefix', async () => {
    const stub = stubFetch((url, init) =>
      url === 'https://www.kuwo.cn/'
        ? { setCookie: `kw_token=${KW_TOKEN}; path=/` }
        : kuwoApiReply(init),
    );

    const page = await kuwo.search('周杰伦', 2);

    const apiUrl = stub.urls.find((url) => url.includes('searchMusicBykeyWord'));

    // The keyword is percent-encoded and Kuwo's page/size parameters are used.
    expect(apiUrl).toContain('key=%E5%91%A8%E6%9D%B0%E4%BC%A6');
    expect(apiUrl).toContain('pn=2');
    expect(apiUrl).toContain('rn=30');
    expect(page.total).toBe(3);

    const track = page.result[0];

    expect(track?.id).toBe('kwtrack_228908');
    // The legacy provider emitted `xmtrack_…` here (copy-pasted from another
    // platform); the rewrite must not.
    expect(track?.id?.startsWith('kwtrack_')).toBe(true);
    expect(track?.id?.startsWith('xmtrack_')).toBe(false);
    expect(track?.title).toBe("歌'名");
    expect(track?.artist).toBe('歌手');
    expect(track?.artist_id).toBe('kwartist_9');
    expect(track?.album_id).toBe('kwalbum_8');
    expect(track?.source).toBe('kuwo');
    expect(track?.url).toBe('kwtrack_228908');
    expect(track?.img_url).toBe('http://img.kuwo.cn/cover.jpg');
    expect(track?.lyric_url).toBe('228908');
    expect(page.result[1]?.id).toBe('kwtrack_998877');
  });

  it('rejects when Kuwo keeps reporting success:false, and says why', async () => {
    stubFetch((url) =>
      url === 'https://www.kuwo.cn/'
        ? { body: {} }
        : { body: { success: false, msg: 'token expired' } },
    );

    await expect(kuwo.search('x', 1)).rejects.toThrow(
      /Kuwo rejected the request to .*\(token expired\)/,
    );
    // The message must name the cookie, because the empty handshake is the
    // usual reason this happens on React Native.
    await expect(kuwo.search('x', 1)).rejects.toThrow(/kw_token/);
  });

  it('awaits the per-track cover lookup so playlist tracks keep their artwork', async () => {
    const stub = stubFetch((url) => {
      if (url.includes('nplserver.kuwo.cn')) {
        return {
          body: {
            id: 456,
            title: '歌单',
            pic: 'http://pic.kuwo.cn/cover.jpg',
            musiclist: [
              {
                id: 228908,
                name: 'A',
                artist: 'B',
                artistid: 1,
                album: 'C',
                albumid: 2,
              },
            ],
          },
        };
      }

      if (url.includes('artistpicserver.kuwo.cn')) {
        return { body: 'http://artistpicserver.kuwo.cn/pic/x.jpg' };
      }

      throw new Error(`unexpected kuwo URL: ${url}`);
    });

    const detail = await kuwo.getPlaylist('kwplaylist_456');

    expect(stub.urls[0]).toContain('nplserver.kuwo.cn');
    expect(stub.urls[1]).toContain('artistpicserver.kuwo.cn');
    expect(detail.info).toEqual({
      id: 'kwplaylist_456',
      title: '歌单',
      cover_img_url: 'http://pic.kuwo.cn/cover.jpg',
      source_url: 'http://www.kuwo.cn/playlist/index?pid=456',
    });

    const track = detail.tracks[0];

    expect(track?.id).toBe('kwtrack_228908');
    expect(track?.album_id).toBe('kwalbum_2');
    // The legacy renderer fired this request without awaiting it, so `img_url`
    // was almost always ''. Awaiting every lookup is a deliberate fix.
    expect(track?.img_url).toBe('http://artistpicserver.kuwo.cn/pic/x.jpg');
  });

  it('rejects a playlist id that is not a kwplaylist id', async () => {
    mockFetchJson({});

    await expect(kuwo.getPlaylist('netrack_1')).rejects.toThrow(
      /Unsupported Kuwo playlist id "netrack_1"/,
    );
    await expect(kuwo.getPlaylist('kwplaylist_')).rejects.toThrow(
      /Invalid Kuwo playlist id "kwplaylist_"/,
    );
  });

  it('returns the stream url only when the response body is one', async () => {
    const stub = stubFetch(() => ({ body: 'http://antiserver.kuwo.cn/x.mp3' }));

    await expect(kuwo.bootstrapTrack('kwtrack_228908')).resolves.toBe(
      'http://antiserver.kuwo.cn/x.mp3',
    );
    expect(stub.urls[0]).toContain('rid=228908');

    // Kuwo answers with a short error string when the song is not playable.
    mockFetchJson('not a url');

    await expect(kuwo.bootstrapTrack('kwtrack_228908')).resolves.toBe('');
  });

  it('rejects on a non-2xx stream lookup, unlike the other three platforms', async () => {
    mockFetchJson('', { ok: false, status: 500 });

    await expect(kuwo.bootstrapTrack('kwtrack_228908')).rejects.toThrow(
      'Kuwo stream lookup for "kwtrack_228908" failed with HTTP 500',
    );
  });

  it('parses kuwo playlist links and refuses netease links', () => {
    expect(kuwo.parseUrl('http://www.kuwo.cn/playlist/index?pid=456')).toEqual({
      type: 'playlist',
      id: 'kwplaylist_456',
    });
    expect(kuwo.parseUrl('https://m.kuwo.cn/playlist_detail/789')).toEqual({
      type: 'playlist',
      id: 'kwplaylist_789',
    });
    expect(kuwo.parseUrl('https://m.kuwo.cn/h5app/playlist/321')).toEqual({
      type: 'playlist',
      id: 'kwplaylist_321',
    });

    // The legacy kuwo provider was copy-pasted from another platform and
    // matched music.163.com links; that is the bug this rewrite fixed, so a
    // netease share link must stay netease's business.
    expect(kuwo.parseUrl('http://music.163.com/#/playlist?id=999')).toBeNull();
    expect(kuwo.parseUrl('https://example.com/whatever')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Kugou
// ---------------------------------------------------------------------------

describe('kugou', () => {
  beforeEach(async () => {
    // kugou persists its device token in AsyncStorage. Clear it so every test
    // starts from the register handshake instead of a token left by a peer.
    await AsyncStorage.clear();
  });

  it('maps a search response to kgtrack_ ids and sends the device cookie', async () => {
    const stub = stubFetch((url) => {
      if (url.includes('userservice.kugou.com')) {
        return { body: { data: { dfid: 'DFID-1' } } };
      }

      if (url.includes('songsearch.kugou.com')) {
        return {
          body: {
            data: {
              total: 3,
              lists: [
                {
                  FileHash: 'HASH1',
                  SongName: '歌名',
                  AlbumName: '专辑',
                  AlbumID: 77,
                  SingerId: 5,
                  SingerName: '甲、乙',
                },
                {
                  FileHash: 'HASH2',
                  SongName: 'Two',
                  AlbumName: 'Alb2',
                  AlbumID: 78,
                  SingerId: [6, 7],
                  SingerName: ['丙', '丁'],
                },
              ],
            },
          },
        };
      }

      // The artwork request is fired per track without being awaited.
      if (url.includes('www.kugou.com/yy/index.php')) {
        return { body: { data: { img: 'http://imge.kugou.com/{size}.jpg' } } };
      }

      throw new Error(`unexpected kugou URL: ${url}`);
    });

    const page = await kugou.search('测试', 2);

    expect(stub.urls[0]).toContain('userservice.kugou.com');

    const searchUrl = stub.urls.find((url) => url.includes('songsearch.kugou.com'));

    // The keyword is interpolated raw and paging is Kugou's `page`.
    expect(searchUrl).toContain('keyword=测试');
    expect(searchUrl).toContain('page=2');
    expect(page.total).toBe(3);

    const first = page.result[0];

    expect(first?.id).toBe('kgtrack_HASH1');
    expect(first?.album).toBe('专辑');
    expect(first?.album_id).toBe('kgalbum_77');
    expect(first?.artist_id).toBe('kgartist_5');
    // SingerName is '、'-joined: only the lead singer is kept.
    expect(first?.artist).toBe('甲');
    // Array-shaped ids/names are tolerated (the API sometimes sends arrays).
    expect(page.result[1]?.artist).toBe('丙');
    expect(page.result[1]?.artist_id).toBe('kgartist_6');

    const searchIndex = stub.urls.findIndex((url) =>
      url.includes('songsearch.kugou.com'),
    );

    expect(stub.inits[searchIndex]?.method).toBe('get');
    // requestAPI echoes the registered device id as a cookie.
    expect(requestHeaders(stub, searchIndex).cookie).toContain('kg_dfid=DFID-1');
    expect(requestHeaders(stub, searchIndex).cookie).toContain('kg_mid=');
  });

  it('maps a playlist detail to kgplaylist_ / kgtrack_ ids and reads the album name', async () => {
    const stub = stubFetch((url) => {
      if (url.includes('/plist/list/777')) {
        return {
          body: {
            info: {
              list: {
                specialid: 777,
                specialname: '歌单名',
                imgurl: 'http://imge.kugou.com/{size}.jpg',
              },
            },
            list: {
              list: {
                info: [
                  { hash: 'H1', album_id: 'A1' },
                  { hash: 'H2', album_id: 'A2' },
                  { hash: 'H3', album_id: 'A3' },
                ],
              },
            },
          },
        };
      }

      if (url.includes('getSongInfo.php')) {
        const hash = url.slice(url.indexOf('hash=') + 'hash='.length);

        if (hash === 'H1') {
          return {
            body: {
              songName: '第一首',
              singerName: '歌手甲',
              singerId: 11,
              imgUrl: 'http://imge.kugou.com/{size}.jpg',
            },
          };
        }

        if (hash === 'H2') {
          // 1002 marks an unavailable song: the metadata must stay empty.
          return { body: { errorCode: 1002, songName: '不该出现', singerName: '不该出现', singerId: 12 } };
        }

        // singerId 0 is Kugou's "unknown artist".
        return { body: { songName: '第三首', singerId: 0, singerName: '' } };
      }

      if (url.includes('/api/v3/album/info')) {
        const albumid = url.slice(url.indexOf('albumid=') + 'albumid='.length);

        // The album name is JSON encoded *inside* the `data` string field.
        return {
          body: {
            data: JSON.stringify({
              status: 1,
              albumid,
              albumname: `专辑${albumid}`,
              imgurl: 'http://imge.kugou.com/{size}.jpg',
            }),
          },
        };
      }

      throw new Error(`unexpected kugou URL: ${url}`);
    });

    const detail = await kugou.getPlaylist('kgplaylist_777');

    expect(stub.urls[0]).toContain('m.kugou.com/plist/list/777');
    expect(detail.info).toEqual({
      id: 'kgplaylist_777',
      title: '歌单名',
      cover_img_url: 'http://imge.kugou.com/400.jpg',
      source_url: 'http://www.kugou.com/yy/special/single/777.html',
    });
    expect(detail.tracks.map((track) => track.id)).toEqual([
      'kgtrack_H1',
      'kgtrack_H2',
      'kgtrack_H3',
    ]);

    const available = detail.tracks[0];

    expect(available?.title).toBe('第一首');
    expect(available?.artist).toBe('歌手甲');
    expect(available?.artist_id).toBe('kgartist_11');
    expect(available?.album).toBe('专辑A1');
    expect(available?.album_id).toBe('kgalbum_A1');
    expect(available?.img_url).toBe('http://imge.kugou.com/400.jpg');
    expect(available?.source).toBe('kugou');

    // Regression guard: the `id` is what routes playback through
    // bootstrapTrack, and it must carry the kgtrack_ prefix.
    expect(available?.id.startsWith('kgtrack_')).toBe(true);
    // The port originally copied the legacy `xmtrack_` prefix here (a leftover
    // from the Xiami provider, the same defect the Kuwo port removed). It is now
    // consistent with the id and with the artist path, so pin that instead.
    expect(available?.url).toBe('kgtrack_H1');
    expect(available?.url?.startsWith('xmtrack_')).toBe(false);

    expect(detail.tracks[1]?.title).toBe('');
    expect(detail.tracks[1]?.artist).toBe('');
    expect(detail.tracks[2]?.artist).toBe('未知');
  });

  it('rejects an unsupported id instead of guessing an endpoint', async () => {
    mockFetchJson({});

    await expect(kugou.getPlaylist('kgtrack_H1')).rejects.toThrow(
      'kugou: unsupported playlist id kgtrack_H1',
    );
  });

  it('rejects a malformed album or singer info payload', async () => {
    mockFetchJson({ data: 'not json' });

    await expect(kugou.getPlaylist('kgalbum_5')).rejects.toThrow(
      'kugou: malformed album info response',
    );

    mockFetchJson({ data: 'not json' });

    await expect(kugou.getPlaylist('kgartist_5')).rejects.toThrow(
      'kugou: malformed singer info response',
    );
  });

  it('resolves "" for an unavailable song and the url when there is one', async () => {
    const stub = mockFetchJson({ url: 'http://fs.kugou.com/x.mp3' });

    await expect(kugou.bootstrapTrack('kgtrack_H1')).resolves.toBe(
      'http://fs.kugou.com/x.mp3',
    );
    expect(stub.urls[0]).toContain('hash=H1');

    // A response without `url` is how kugou says "not playable": resolve '' so
    // the queue skips the track instead of throwing.
    mockFetchJson({ errorCode: 1002 });

    await expect(kugou.bootstrapTrack('kgtrack_H2')).resolves.toBe('');
  });

  it('recognises kugou share links', () => {
    // The port originally carried a copy of netease's parseUrl here, so kugou's
    // own share links were never recognised and a pasted link could not be
    // opened. This pins the fix.
    expect(
      kugou.parseUrl('http://www.kugou.com/yy/special/single/1234.html'),
    ).toEqual({ type: 'playlist', id: 'kgplaylist_1234' });

    expect(kugou.parseUrl('https://www.kugou.com/songlist/5678/')).toEqual({
      type: 'playlist',
      id: 'kgplaylist_5678',
    });

    // Legacy query forms.
    expect(
      kugou.parseUrl('http://www.kugou.com/yy/html/special.html?specialid=321'),
    ).toEqual({ type: 'playlist', id: 'kgplaylist_321' });

    // Registry level: the link now routes to kugou.
    expect(
      client.parseUrl('http://www.kugou.com/yy/special/single/1234.html'),
    ).toEqual({ type: 'playlist', id: 'kgplaylist_1234' });

    // NetEase links still belong to netease, and kugou no longer claims them.
    expect(
      client.parseUrl('http://music.163.com/#/playlist?id=999'),
    ).toEqual({ type: 'playlist', id: 'neplaylist_999' });
    expect(kugou.parseUrl('http://music.163.com/#/playlist?id=999')).toBeNull();
    expect(kugou.parseUrl('https://example.com/whatever')).toBeNull();
  });
});
