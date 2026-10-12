/**
 * Background audio service.
 *
 * Replaces the legacy `BackgroundPlayer` screen, which rendered a 0x0
 * `react-native-video` element and wired `react-native-music-control` by hand.
 * `react-native-track-player` owns the media session, the notification and the
 * lock-screen controls, so the app only has to keep the player store and the
 * native queue in sync.
 *
 * Registered from `index.js` via `TrackPlayer.registerPlaybackService`; it runs
 * in a separate JS context, so it must not touch UI state directly — it only
 * dispatches into the Zustand store.
 */
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  RepeatMode,
  State,
  type Track as PlayerTrack,
} from 'react-native-track-player';

import { bootstrapTrack } from '../api/client';
import type { Track } from '../api/types';
import { PlayMode } from '../api/types';
import { usePlayerStore } from '../store/player';

/** Convert our domain track into a TrackPlayer queue entry. */
function toPlayerTrack(track: Track, url: string): PlayerTrack {
  return {
    id: track.id,
    url,
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.img_url || undefined,
    // Kept so remote control handlers can look the track up again.
    sourceUrl: track.source_url,
  };
}

let isSetup = false;

/** Idempotent player setup; safe to call from both the app and the service. */
export async function setupPlayer(): Promise<boolean> {
  if (isSetup) return true;

  try {
    await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
    await TrackPlayer.updateOptions({
      android: {
        // Keep playing when the user swipes the app away.
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
      ],
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
      ],
    });
    isSetup = true;

    return true;
  } catch {
    // setupPlayer() throws when it was already initialised (e.g. fast refresh).
    isSetup = true;

    return false;
  }
}

/**
 * Load a track into the native player.
 * `playWhenReady` mirrors the store's `isPlaying` so we never start audio the
 * user did not ask for.
 */
export async function loadTrack(track: Track, playWhenReady: boolean): Promise<void> {
  const { setLoading, handleLoadFail } = usePlayerStore.getState();

  setLoading(true);
  try {
    const url = await bootstrapTrack(track.id);

    if (!url) {
      // Platform reported the song as unavailable: advance like the legacy app.
      handleLoadFail();

      return;
    }

    await setupPlayer();
    await TrackPlayer.reset();
    await TrackPlayer.add(toPlayerTrack(track, url));
    // Repeat-one is handled natively; the store's `next()` covers every other mode.
    await TrackPlayer.setRepeatMode(
      usePlayerStore.getState().playMode === PlayMode.REPEAT_ONE
        ? RepeatMode.Track
        : RepeatMode.Off
    );
    if (playWhenReady) await TrackPlayer.play();
  } catch {
    handleLoadFail();
  } finally {
    setLoading(false);
  }
}

export async function play(): Promise<void> {
  await TrackPlayer.play();
}

export async function pause(): Promise<void> {
  await TrackPlayer.pause();
}

export async function seekTo(seconds: number): Promise<void> {
  await TrackPlayer.seekTo(seconds);
}

export async function setVolume(volume: number): Promise<void> {
  // TrackPlayer expects a 0..1 gain while the store keeps a 0..100 percentage.
  await TrackPlayer.setVolume(Math.max(0, Math.min(1, volume / 100)));
}

/**
 * The service body registered with TrackPlayer. It reacts to remote controls
 * and reports progress back into the store.
 */
export async function playbackService(): Promise<void> {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    usePlayerStore.getState().play();
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    usePlayerStore.getState().pause();
  });
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    usePlayerStore.getState().next();
  });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    usePlayerStore.getState().prev();
  });
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => {
    usePlayerStore.getState().seekTo(position);
  });

  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, ({ position, duration }) => {
    usePlayerStore.getState().setProgress(position, duration);
  });

  // A track that ends naturally advances the queue, except in repeat-one mode,
  // where TrackPlayer itself loops the single track.
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
    usePlayerStore.getState().next();
  });

  TrackPlayer.addEventListener(Event.PlaybackState, ({ state }) => {
    if (state === State.Playing || state === State.Paused) {
      usePlayerStore.getState().setPlaying(state === State.Playing);
    }
  });
}
