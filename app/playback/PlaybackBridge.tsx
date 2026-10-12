/**
 * Keeps the Zustand player store and the native TrackPlayer in sync.
 *
 * The legacy app did this inside `BackgroundPlayer` with `componentWillReceiveProps`
 * comparisons against the previous props. A small subscription component is
 * clearer and cannot miss an update when a screen stops re-rendering.
 */
import { useEffect, useRef } from 'react';

import { usePlayerStore } from '../store/player';
import { loadTrack, pause, play, seekTo, setVolume, setupPlayer } from './service';

export function PlaybackBridge(): null {
  const nowplayingTrack = usePlayerStore((state) => state.nowplayingTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const pendingSeek = usePlayerStore((state) => state.pendingSeek);
  const volume = usePlayerStore((state) => state.volume);

  const lastTrackId = useRef<string | null>(null);
  const lastIsPlaying = useRef<boolean>(false);

  useEffect(() => {
    void setupPlayer();
  }, []);

  // Load a new track whenever the store's current track changes.
  useEffect(() => {
    if (!nowplayingTrack) {
      lastTrackId.current = null;

      return;
    }
    if (lastTrackId.current === nowplayingTrack.id) return;

    lastTrackId.current = nowplayingTrack.id;
    void loadTrack(nowplayingTrack, usePlayerStore.getState().isPlaying);
  }, [nowplayingTrack]);

  useEffect(() => {
    if (lastIsPlaying.current === isPlaying) return;

    lastIsPlaying.current = isPlaying;
    void (isPlaying ? play() : pause());
  }, [isPlaying]);

  // The seek bar sets `pendingSeek`; apply it once and clear the marker.
  useEffect(() => {
    if (pendingSeek === null) return;

    void seekTo(pendingSeek).finally(() => {
      usePlayerStore.getState().applySeek();
    });
  }, [pendingSeek]);

  useEffect(() => {
    void setVolume(volume);
  }, [volume]);

  return null;
}
