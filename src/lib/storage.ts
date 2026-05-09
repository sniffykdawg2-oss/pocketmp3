import type { MetadataExport, Playlist, Settings, Track } from "./types";

export const supportedTypes = [
  "audio/mpeg",
  "audio/mp3",
];

export const supportedExtensions = [".mp3"];
export const maxFileSize = 350 * 1024 * 1024;

export function isSupportedFile(file: File) {
  const lower = file.name.toLowerCase();
  return supportedTypes.includes(file.type) || supportedExtensions.some((ext) => lower.endsWith(ext));
}

export function formatTime(seconds = 0) {
  if (!Number.isFinite(seconds)) return "0:00";
  const safe = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = String(safe % 60).padStart(2, "0");
  return hrs ? `${hrs}:${String(mins).padStart(2, "0")}:${secs}` : `${mins}:${secs}`;
}

export function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function estimateStorage(tracks: Track[]) {
  return tracks.reduce((sum, track) => sum + (track.size ?? 0), 0);
}

export function exportMetadata(tracks: Track[], playlists: Playlist[], settings: Settings): MetadataExport {
  return {
    exportedAt: new Date().toISOString(),
    tracks: tracks.map(({ file: _file, ...track }) => track),
    playlists,
    settings,
  };
}

export async function readDuration(file: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    const el = document.createElement("audio");
    const url = URL.createObjectURL(file);
    el.preload = "metadata";
    el.src = url;
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(el.duration) ? el.duration : undefined);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
  });
}

export function isYoutubeUrl(value: string) {
  try {
    const url = new URL(value);
    return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
