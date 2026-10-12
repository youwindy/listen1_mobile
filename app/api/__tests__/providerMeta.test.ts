/**
 * The shared contract every music platform provider must satisfy.
 *
 * Why this file exists: `client.ts` routes a track or playlist back to its
 * provider by slicing the first two characters off the id (`ID_PREFIX_LENGTH`),
 * so a missing method, a wrong `meta.platformId` or a duplicated prefix breaks a
 * whole platform at runtime with no compile error. Provider `meta` is also what
 * the browse tabs and `getPlatformName()` render, so the exact strings are part
 * of the user-visible contract.
 *
 * Everything here is offline: only `bootstrapTrack` performs I/O, and it is
 * called through a stubbed `fetch` (or through an unsupported prefix, which must
 * not touch the network at all).
 */
import * as client from '../client';
import kugou from '../provider/kugou';
import kuwo from '../provider/kuwo';
import netease from '../provider/netease';
import qq from '../provider/qq';
import type { MusicProvider, PlatformId, PlatformName } from '../types';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface StubReply {
  body?: unknown;
  ok?: boolean;
  status?: number;
  setCookie?: string;
}

interface FetchStub {
  urls: string[];
  inits: (RequestInit | undefined)[];
}

/**
 * Replaces the global `fetch` with a URL-driven stub.
 *
 * Recording the requested URLs is what makes these tests meaningful: a provider
 * that silently stops calling `fetch`, or calls the wrong host, fails instead of
 * quietly resolving something.
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

interface ExpectedMeta {
  name: string;
  platformId: PlatformId;
  enName: PlatformName;
}

/** Exact `meta` values; the strings are rendered in the UI, so they are pinned. */
const expectedMeta: Record<PlatformName, ExpectedMeta> = {
  netease: { name: '网易', platformId: 'ne', enName: 'netease' },
  qq: { name: 'QQ', platformId: 'qq', enName: 'qq' },
  kuwo: { name: '酷我', platformId: 'kw', enName: 'kuwo' },
  kugou: { name: '酷狗', platformId: 'kg', enName: 'kugou' },
};

/** The four shipped providers, each with a canonical id of the shape it emits. */
const allProviders: {
  label: string;
  provider: MusicProvider;
  trackId: string;
  playlistId: string;
}[] = [
  { label: 'netease', provider: netease, trackId: 'netrack_1', playlistId: 'neplaylist_1' },
  { label: 'qq', provider: qq, trackId: 'qqtrack_1', playlistId: 'qqplaylist_1' },
  { label: 'kuwo', provider: kuwo, trackId: 'kwtrack_1', playlistId: 'kwplaylist_1' },
  { label: 'kugou', provider: kugou, trackId: 'kgtrack_1', playlistId: 'kgplaylist_1' },
];

const REQUIRED_METHODS = [
  'showPlaylist',
  'search',
  'getPlaylist',
  'bootstrapTrack',
  'parseUrl',
] as const;

describe.each(allProviders)('$label provider', ({ provider, trackId, playlistId }) => {
  it('implements every MusicProvider member', () => {
    for (const method of REQUIRED_METHODS) {
      expect(typeof provider[method]).toBe('function');
    }
  });

  it('declares the exact provider meta', () => {
    const expected = expectedMeta[provider.meta.enName];

    expect(provider.meta).toEqual(expected);
    // Named assertions so a swap between two providers (e.g. kuwo's name on
    // kugou's id) cannot pass by accident.
    expect(provider.meta.name).toBe(expected.name);
    expect(provider.meta.platformId).toBe(expected.platformId);
    expect(provider.meta.enName).toBe(expected.enName);
  });

  it('uses a 2-character platformId that matches the ids it emits', () => {
    // `client.ts` slices exactly 2 characters, so a longer/shorter prefix would
    // send every id to the "暂不支持的音乐平台" branch.
    expect(provider.meta.platformId).toHaveLength(2);
    expect(trackId.slice(0, 2)).toBe(provider.meta.platformId);
    expect(playlistId.slice(0, 2)).toBe(provider.meta.platformId);
    expect(client.providers).toContain(provider);
  });
});

describe('provider registry', () => {
  it('exposes exactly the four metas, in tab order', () => {
    expect(client.getPlatforms()).toEqual([
      netease.meta,
      kugou.meta,
      kuwo.meta,
      qq.meta,
    ]);
  });

  it('keeps every platformId unique', () => {
    const platformIds = client.getPlatforms().map((meta) => meta.platformId);

    // A duplicate prefix would make `providerForId()` return whichever provider
    // was registered last, breaking one platform entirely.
    expect(new Set(platformIds).size).toBe(client.getPlatforms().length);
    expect(new Set(client.getPlatforms().map((meta) => meta.enName)).size).toBe(
      client.getPlatforms().length,
    );
  });

  it('maps platform names to display names, and unknowns to a fallback', () => {
    expect(client.getPlatformName('netease')).toBe('网易');
    expect(client.getPlatformName('qq')).toBe('QQ');
    expect(client.getPlatformName('kuwo')).toBe('酷我');
    expect(client.getPlatformName('kugou')).toBe('酷狗');
    expect(client.getPlatformName('spotify')).toBe('暂未支持的平台');
    expect(client.getPlatformName('')).toBe('暂未支持的平台');
  });

  it('throws for an unknown platform on the playlist/search entry points', () => {
    // Playback tolerates unknown ids (see below), but browsing must complain.
    expect(() => client.getPlaylist('zzplaylist_1')).toThrow(
      '暂不支持的音乐平台：zzplaylist_1',
    );
  });
});

/**
 * `bootstrapTrack` resolves '' for a prefix no provider owns instead of
 * throwing: the queue treats '' as "unavailable" and skips the track.
 */
describe('client.bootstrapTrack with an unsupported id', () => {
  it('resolves "" and never reaches the network', async () => {
    const stub = stubFetch(() => {
      throw new Error('an unsupported id must not trigger a request');
    });

    await expect(client.bootstrapTrack('xx_track_1')).resolves.toBe('');
    expect(stub.urls).toHaveLength(0);
  });
});

describe('client.parseUrl', () => {
  it('returns null for a URL no provider understands', () => {
    expect(client.parseUrl('https://example.com/whatever')).toBeNull();
  });
});

/**
 * Routing by the 2-character prefix: each canonical id must reach its own
 * provider's endpoint, which is only observable through the requested URL.
 */
interface RoutingCase {
  id: string;
  label: string;
  host: string;
  streamUrl: string;
}

const routingReplies: Record<string, StubReply> = {
  'music.163.com': { body: { data: [{ url: 'http://cdn.netease/song.mp3' }] } },
  'u.y.qq.com': {
    body: {
      req_0: { data: { sip: ['http://sip.qq.com'], midurlinfo: [{ purl: '/song.mp3' }] } },
    },
  },
  'antiserver.kuwo.cn': { body: 'http://cdn.kuwo/song.mp3' },
  'm.kugou.com': { body: { url: 'http://cdn.kugou/song.mp3' } },
};

const routingCases: RoutingCase[] = [
  { id: 'netrack_1', label: 'netease', host: 'music.163.com', streamUrl: 'http://cdn.netease/song.mp3' },
  { id: 'qqtrack_1', label: 'qq', host: 'u.y.qq.com', streamUrl: 'http://sip.qq.com/song.mp3' },
  { id: 'kwtrack_1', label: 'kuwo', host: 'antiserver.kuwo.cn', streamUrl: 'http://cdn.kuwo/song.mp3' },
  { id: 'kgtrack_1', label: 'kugou', host: 'm.kugou.com', streamUrl: 'http://cdn.kugou/song.mp3' },
];

describe('client.bootstrapTrack routes by the id prefix', () => {
  it.each(routingCases)(
    'sends the $label id $id to $host',
    async (routingCase: RoutingCase) => {
      const stub = stubFetch((url) => {
        const reply = Object.entries(routingReplies).find(([host]) =>
          url.includes(host),
        );

        if (reply === undefined) {
          throw new Error(`unexpected URL for ${routingCase.id}: ${url}`);
        }

        return reply[1];
      });

      await expect(client.bootstrapTrack(routingCase.id)).resolves.toBe(
        routingCase.streamUrl,
      );
      expect(stub.urls).toHaveLength(1);
      expect(stub.urls[0]).toContain(routingCase.host);
    },
  );
});
