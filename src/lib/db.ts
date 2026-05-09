import { openDB, type DBSchema } from "idb";
import type { Playlist, Settings, Track } from "./types";

interface PocketDb extends DBSchema {
  tracks: {
    key: string;
    value: Track;
    indexes: { "by-added": number; "by-title": string };
  };
  playlists: {
    key: string;
    value: Playlist;
    indexes: { "by-updated": number };
  };
  settings: {
    key: string;
    value: Settings;
  };
}

const DB_NAME = "pocketmp3";
const DB_VERSION = 1;

export const defaultSettings: Settings = {
  compactMode: false,
  accent: "blue",
};

export async function getDb() {
  if (!("indexedDB" in window)) {
    throw new Error("IndexedDB unavailable. This browser cannot store PocketMP3 files locally.");
  }

  return openDB<PocketDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const tracks = db.createObjectStore("tracks", { keyPath: "id" });
      tracks.createIndex("by-added", "addedAt");
      tracks.createIndex("by-title", "title");

      const playlists = db.createObjectStore("playlists", { keyPath: "id" });
      playlists.createIndex("by-updated", "updatedAt");

      db.createObjectStore("settings");
    },
  });
}

export async function getTracks() {
  const db = await getDb();
  return db.getAll("tracks");
}

export async function getTrack(id: string) {
  const db = await getDb();
  return db.get("tracks", id);
}

export async function saveTrack(track: Track) {
  const db = await getDb();
  const { coverUrl: _coverUrl, ...storedTrack } = track;
  await db.put("tracks", storedTrack);
}

export async function updateTrackFields(id: string, fields: Partial<Omit<Track, "id" | "coverUrl">>) {
  const db = await getDb();
  const track = await db.get("tracks", id);
  if (!track) return;
  await db.put("tracks", { ...track, ...fields, id });
}

export async function deleteTrack(id: string) {
  const db = await getDb();
  await db.delete("tracks", id);
}

export async function getPlaylists() {
  const db = await getDb();
  return db.getAll("playlists");
}

export async function savePlaylist(playlist: Playlist) {
  const db = await getDb();
  await db.put("playlists", playlist);
}

export async function deletePlaylist(id: string) {
  const db = await getDb();
  await db.delete("playlists", id);
}

export async function getSettings() {
  const db = await getDb();
  return (await db.get("settings", "user")) ?? defaultSettings;
}

export async function saveSettings(settings: Settings) {
  const db = await getDb();
  await db.put("settings", settings, "user");
}

export async function clearAllData() {
  const db = await getDb();
  await Promise.all([db.clear("tracks"), db.clear("playlists"), db.put("settings", defaultSettings, "user")]);
}
