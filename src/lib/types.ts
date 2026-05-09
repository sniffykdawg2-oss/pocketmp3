export type MediaKind = "audio" | "youtube";
export type MediaCategory = "podcast" | "song" | "other";
export type Accent = "blue" | "purple" | "green" | "red";
export type SortMode = "recent" | "alpha";
export type RepeatMode = "off" | "one" | "playlist";

export interface Track {
  id: string;
  kind: MediaKind;
  category: MediaCategory;
  title: string;
  creator: string;
  sourceLink?: string;
  notes?: string;
  file?: Blob;
  fileName?: string;
  mimeType?: string;
  size?: number;
  duration?: number;
  playlistIds: string[];
  lastPosition: number;
  addedAt: number;
  updatedAt: number;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  compactMode: boolean;
  accent: Accent;
}

export interface PlaybackState {
  currentTrackId?: string;
  queue: string[];
  queueName?: string;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  speed: number;
}

export interface MetadataExport {
  exportedAt: string;
  tracks: Omit<Track, "file">[];
  playlists: Playlist[];
  settings: Settings;
}
