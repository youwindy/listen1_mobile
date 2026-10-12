/**
 * Queue and transport behaviour.
 *
 * These pin the semantics the legacy `player.reducer.js` implemented: shuffle
 * order is kept in a parallel id list so that inserting a track does not
 * reshuffle the queue, and a failed track is skipped at most once per queue.
 */
import { PlayMode } from '../../api/types';
import type { Track } from '../../api/types';
import { generateShuffleIds, insertNextTo, usePlayerStore } from '../player';

function track(id: string): Track {
  return {
    id,
    title: `title-${id}`,
    artist: 'artist',
    album: 'album',
    source: 'netease',
  };
}

const A = track('netrack_a');
const B = track('netrack_b');
const C = track('netrack_c');

/** Reset the store between tests; the store is a module-level singleton. */
function resetStore(): void {
  usePlayerStore.setState({
    playMode: PlayMode.LOOP,
    nowplayingTrack: null,
    isPlaying: false,
    duration: 0,
    current: 0,
    progress: 0,
    isSeeking: false,
    tracks: [],
    shuffleIds: [],
    skipIds: {},
    isLoadingTrack: false,
    pendingSeek: null,
  });
}

beforeEach(resetStore);

describe('insertNextTo', () => {
  it('inserts the item directly after the matching entry', () => {
    expect(insertNextTo(['a', 'b', 'c'], 'x', 'b', (id) => id)).toEqual(['a', 'b', 'x', 'c']);
  });

  it('appends nothing when the target is absent', () => {
    expect(insertNextTo(['a', 'b'], 'x', 'zz', (id) => id)).toEqual(['a', 'b']);
  });
});

describe('generateShuffleIds', () => {
  it('keeps every id exactly once', () => {
    const ids = generateShuffleIds([A, B, C]);

    expect([...ids].sort()).toEqual([A.id, B.id, C.id].sort());
  });
});

describe('playTrackInPlaylist', () => {
  it('replaces the queue and starts the chosen track', () => {
    usePlayerStore.getState().playTrackInPlaylist(B, [A, B, C]);

    const state = usePlayerStore.getState();

    expect(state.nowplayingTrack?.id).toBe(B.id);
    expect(state.tracks.map((entry) => entry.id)).toEqual([A.id, B.id, C.id]);
    expect(state.isPlaying).toBe(true);
  });

  it('builds a shuffle order when shuffle is active', () => {
    usePlayerStore.setState({ playMode: PlayMode.SHUFFLE });
    usePlayerStore.getState().playTrackInPlaylist(B, [A, B, C]);

    const state = usePlayerStore.getState();

    expect(state.shuffleIds).toHaveLength(3);
    // The current track is still whatever the caller asked for.
    expect(state.nowplayingTrack?.id).toBe(B.id);
  });
});

describe('playTrack', () => {
  it('appends a new track and plays it', () => {
    usePlayerStore.getState().playTrack(A);

    expect(usePlayerStore.getState().tracks).toHaveLength(1);
    expect(usePlayerStore.getState().nowplayingTrack?.id).toBe(A.id);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('does not duplicate a track that is already queued', () => {
    usePlayerStore.getState().playTrack(A);
    usePlayerStore.getState().playTrack(B);
    usePlayerStore.getState().playTrack(A);

    const state = usePlayerStore.getState();

    expect(state.tracks.map((entry) => entry.id)).toEqual([A.id, B.id]);
    expect(state.nowplayingTrack?.id).toBe(A.id);
  });

  it('appends to the shuffle order too when shuffling', () => {
    usePlayerStore.setState({ playMode: PlayMode.SHUFFLE });
    usePlayerStore.getState().playTrack(A);
    usePlayerStore.getState().playTrack(B);

    expect(usePlayerStore.getState().shuffleIds).toEqual([A.id, B.id]);
  });
});

describe('next / prev in loop mode', () => {
  beforeEach(() => {
    usePlayerStore.getState().playTracks([A, B, C]);
    usePlayerStore.setState({ nowplayingTrack: A });
  });

  it('advances in order', () => {
    usePlayerStore.getState().next();

    expect(usePlayerStore.getState().nowplayingTrack?.id).toBe(B.id);
  });

  it('wraps from the last track to the first', () => {
    usePlayerStore.setState({ nowplayingTrack: C });
    usePlayerStore.getState().next();

    expect(usePlayerStore.getState().nowplayingTrack?.id).toBe(A.id);
  });

  it('wraps backwards from the first track to the last', () => {
    usePlayerStore.getState().prev();

    expect(usePlayerStore.getState().nowplayingTrack?.id).toBe(C.id);
  });
});

describe('addNextTrack', () => {
  it('queues the track right after the current one', () => {
    usePlayerStore.getState().playTracks([A, C]);
    usePlayerStore.setState({ nowplayingTrack: A });
    usePlayerStore.getState().addNextTrack(B);

    expect(usePlayerStore.getState().tracks.map((entry) => entry.id)).toEqual([
      A.id,
      B.id,
      C.id,
    ]);
  });

  it('mirrors the insertion into the shuffle order', () => {
    usePlayerStore.setState({ playMode: PlayMode.SHUFFLE });
    usePlayerStore.getState().playTracks([A, C]);
    usePlayerStore.setState({ nowplayingTrack: A, shuffleIds: [A.id, C.id] });
    usePlayerStore.getState().addNextTrack(B);

    expect(usePlayerStore.getState().shuffleIds).toEqual([A.id, B.id, C.id]);
  });
});

describe('handleLoadFail', () => {
  it('stops playback in repeat-one mode instead of skipping', () => {
    usePlayerStore.setState({ playMode: PlayMode.REPEAT_ONE });
    usePlayerStore.getState().playTracks([A, B]);
    usePlayerStore.getState().handleLoadFail();

    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('skips forward and records the failed id', () => {
    usePlayerStore.getState().playTracks([A, B]);
    usePlayerStore.getState().handleLoadFail();

    const state = usePlayerStore.getState();

    expect(state.nowplayingTrack?.id).toBe(B.id);
    expect(state.skipIds[A.id]).toBe(1);
  });

  it('stops once every track in the queue has failed', () => {
    usePlayerStore.getState().playTracks([A, B]);
    usePlayerStore.getState().handleLoadFail();
    usePlayerStore.getState().handleLoadFail();
    usePlayerStore.getState().handleLoadFail();

    const state = usePlayerStore.getState();

    // B loops back to A, which is already known to be broken.
    expect(state.isPlaying).toBe(false);
    expect(Object.keys(state.skipIds).length).toBeGreaterThanOrEqual(2);
  });
});

describe('cyclePlayMode', () => {
  it('cycles loop -> shuffle -> repeat-one -> loop', () => {
    expect(usePlayerStore.getState().playMode).toBe(PlayMode.LOOP);

    usePlayerStore.getState().cyclePlayMode();
    expect(usePlayerStore.getState().playMode).toBe(PlayMode.SHUFFLE);

    usePlayerStore.getState().cyclePlayMode();
    expect(usePlayerStore.getState().playMode).toBe(PlayMode.REPEAT_ONE);

    usePlayerStore.getState().cyclePlayMode();
    expect(usePlayerStore.getState().playMode).toBe(PlayMode.LOOP);
  });

  it('builds a shuffle order when entering shuffle mode', () => {
    usePlayerStore.getState().playTracks([A, B, C]);
    usePlayerStore.getState().cyclePlayMode();

    expect(usePlayerStore.getState().shuffleIds).toHaveLength(3);
  });

  it('clears the shuffle order when leaving shuffle mode', () => {
    usePlayerStore.getState().playTracks([A, B, C]);
    usePlayerStore.getState().cyclePlayMode();
    usePlayerStore.getState().cyclePlayMode();

    expect(usePlayerStore.getState().shuffleIds).toEqual([]);
  });
});

describe('removeTrack', () => {
  it('drops the track from both the queue and the shuffle order', () => {
    usePlayerStore.setState({ playMode: PlayMode.SHUFFLE });
    usePlayerStore.getState().playTracks([A, B, C]);
    usePlayerStore.getState().removeTrack(B.id);

    const state = usePlayerStore.getState();

    expect(state.tracks.map((entry) => entry.id)).toEqual([A.id, C.id]);
    expect(state.shuffleIds).not.toContain(B.id);
  });
});

describe('seekTo', () => {
  it('records a pending seek without moving the progress clock immediately', () => {
    usePlayerStore.getState().seekTo(42);

    expect(usePlayerStore.getState().pendingSeek).toBe(42);
  });

  it('clears the pending seek once applied', () => {
    usePlayerStore.getState().seekTo(42);
    usePlayerStore.getState().applySeek();

    expect(usePlayerStore.getState().pendingSeek).toBeNull();
  });
});

describe('setProgress', () => {
  it('derives a 0..1 ratio', () => {
    usePlayerStore.getState().setProgress(30, 120);

    expect(usePlayerStore.getState().progress).toBeCloseTo(0.25);
  });

  it('reports zero progress when the duration is unknown', () => {
    usePlayerStore.getState().setProgress(30, 0);

    expect(usePlayerStore.getState().progress).toBe(0);
  });
});
