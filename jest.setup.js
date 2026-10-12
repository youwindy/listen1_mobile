/**
 * Jest setup shared by all tests.
 *
 * The test suite focuses on the pure logic that the rewrite ports from the
 * legacy app (platform providers, weapi crypto, playlist/shuffle helpers).
 * Native modules are stubbed here so those modules can be imported directly.
 */

/* eslint-env jest */

// react-native-track-player only exists on device; the logic under test never
// calls it, but importing a module that reaches it must not explode.
jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: {
    setupPlayer: jest.fn(() => Promise.resolve()),
    updateOptions: jest.fn(() => Promise.resolve()),
    add: jest.fn(() => Promise.resolve()),
    reset: jest.fn(() => Promise.resolve()),
    play: jest.fn(() => Promise.resolve()),
    pause: jest.fn(() => Promise.resolve()),
    seekTo: jest.fn(() => Promise.resolve()),
    setVolume: jest.fn(() => Promise.resolve()),
  },
  State: { Playing: 'playing', Paused: 'paused', Stopped: 'stopped' },
  Event: {
    PlaybackActiveTrackChanged: 'playback-active-track-changed',
    PlaybackState: 'playback-state',
    PlaybackProgressUpdated: 'playback-progress-updated',
  },
  Capability: {
    Play: 'play',
    Pause: 'pause',
    SkipToNext: 'skip-to-next',
    SkipToPrevious: 'skip-to-previous',
  },
  AppKilledPlaybackBehavior: { ContinuePlayback: 'continue-playback' },
}));

// AsyncStorage's `./jest` export is ESM and would need a transform; a tiny
// in-memory stub is enough for the pure logic under test (Zustand persistence).
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();

  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key) => Promise.resolve(store.has(key) ? store.get(key) : null)),
      setItem: jest.fn((key, value) => {
        store.set(key, value);

        return Promise.resolve();
      }),
      removeItem: jest.fn((key) => {
        store.delete(key);

        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        store.clear();

        return Promise.resolve();
      }),
      getAllKeys: jest.fn(() => Promise.resolve([...store.keys()])),
    },
  };
});
