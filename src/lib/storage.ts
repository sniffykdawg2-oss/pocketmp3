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

export async function copyFileToStoredBlob(file: File) {
  const bytes = await file.arrayBuffer();
  return new Blob([bytes], { type: file.type || "audio/mpeg" });
}

export async function extractMp3Cover(file: Blob): Promise<Blob | undefined> {
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).arrayBuffer());
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return undefined;

  const version = bytes[3];
  const tagSize = syncSafeInt(bytes[6], bytes[7], bytes[8], bytes[9]);
  let offset = 10;
  const end = Math.min(bytes.length, 10 + tagSize);

  while (offset + 10 <= end) {
    const frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

    const frameSize =
      version === 4
        ? syncSafeInt(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
        : (bytes[offset + 4] << 24) | (bytes[offset + 5] << 16) | (bytes[offset + 6] << 8) | bytes[offset + 7];

    const dataStart = offset + 10;
    const dataEnd = Math.min(dataStart + frameSize, end);
    if (frameId === "APIC" && frameSize > 0) {
      const image = extractImageFromFrame(bytes.slice(dataStart, dataEnd));
      if (image) return image;
    }
    offset = dataEnd;
  }

  return undefined;
}

function syncSafeInt(a: number, b: number, c: number, d: number) {
  return (a << 21) | (b << 14) | (c << 7) | d;
}

function extractImageFromFrame(frame: Uint8Array) {
  for (let index = 0; index < frame.length - 8; index += 1) {
    const isJpeg = frame[index] === 0xff && frame[index + 1] === 0xd8 && frame[index + 2] === 0xff;
    const isPng =
      frame[index] === 0x89 &&
      frame[index + 1] === 0x50 &&
      frame[index + 2] === 0x4e &&
      frame[index + 3] === 0x47 &&
      frame[index + 4] === 0x0d &&
      frame[index + 5] === 0x0a &&
      frame[index + 6] === 0x1a &&
      frame[index + 7] === 0x0a;

    if (isJpeg || isPng) {
      return new Blob([frame.slice(index)], { type: isJpeg ? "image/jpeg" : "image/png" });
    }
  }
  return undefined;
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted?.()) return true;
    return navigator.storage.persist();
  } catch {
    return false;
  }
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
  return tracks.reduce((sum, track) => sum + (track.size ?? 0) + (track.cover?.size ?? 0), 0);
}

export function exportMetadata(tracks: Track[], playlists: Playlist[], settings: Settings): MetadataExport {
  return {
    exportedAt: new Date().toISOString(),
    tracks: tracks.map(({ file: _file, cover: _cover, coverUrl: _coverUrl, ...track }) => track),
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

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
