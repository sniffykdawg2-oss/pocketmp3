import type { Track } from "./types";

interface Handlers {
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeekForward: () => void;
  onSeekBackward: () => void;
}

export function setupMediaSession(track: Track | undefined, handlers: Handlers) {
  if (!("mediaSession" in navigator) || !track) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.creator || "PocketMP3",
    album: "PocketMP3",
  });

  // iOS/Safari controls whether HTML5 media can keep playing in the background
  // or while the screen is locked. PocketMP3 exposes standard media actions but
  // cannot guarantee background playback on every browser/device combination.
  navigator.mediaSession.setActionHandler("play", handlers.onPlay);
  navigator.mediaSession.setActionHandler("pause", handlers.onPause);
  navigator.mediaSession.setActionHandler("nexttrack", handlers.onNext);
  navigator.mediaSession.setActionHandler("previoustrack", handlers.onPrevious);
  navigator.mediaSession.setActionHandler("seekforward", handlers.onSeekForward);
  navigator.mediaSession.setActionHandler("seekbackward", handlers.onSeekBackward);
}
