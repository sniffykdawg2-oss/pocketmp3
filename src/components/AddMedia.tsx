import { FileAudio, Plus } from "lucide-react";
import { useState } from "react";
import type { Playlist, Track } from "../lib/types";
import { copyFileToStoredFile, extractMp3Cover, fileToBytes, isSupportedFile, maxFileSize, readDuration, requestPersistentStorage } from "../lib/storage";

interface AddMediaProps {
  playlists: Playlist[];
  onAdd: (track: Track) => Promise<void>;
  onError: (message: string) => void;
}

const now = () => Date.now();
const id = () => crypto.randomUUID();

export default function AddMedia({ playlists, onAdd, onError }: AddMediaProps) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<Track["category"]>("song");
  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const [notes, setNotes] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveMedia() {
    const selected = file;
    if (!selected) return onError("Choose an MP3 file first.");
    if (!isSupportedFile(selected)) return onError("That file type is not supported here.");
    if (selected.size > maxFileSize) return onError("That file is too large for comfortable browser storage.");

    setSaving(true);
    try {
      await requestPersistentStorage();
      const storedFile = await copyFileToStoredFile(selected);
      const [duration, cover, fileData] = await Promise.all([readDuration(storedFile), extractMp3Cover(storedFile), fileToBytes(storedFile)]);
      const stamp = now();
      await onAdd({
        id: id(),
        category,
        title: title.trim() || selected.name.replace(/\.[^/.]+$/, ""),
        creator: creator.trim(),
        notes: notes.trim(),
        file: storedFile,
        fileData,
        fileName: selected.name,
        mimeType: storedFile.type || "audio/mpeg",
        size: storedFile.size,
        duration,
        cover,
        playlistIds: playlistId ? [playlistId] : [],
        lastPosition: 0,
        addedAt: stamp,
        updatedAt: stamp,
      });
      setFile(null);
      setCategory("song");
      setTitle("");
      setCreator("");
      setNotes("");
      setPlaylistId("");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save this file. Storage may be full or unavailable.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page-enter space-y-5 pb-32">
      <div>
        <h1 className="text-3xl font-black">Add Media</h1>
        <p className="mt-2 text-sm leading-6 text-white/55">Upload MP3 files you own for local playback.</p>
      </div>

      <div className="glass space-y-4 rounded-3xl p-4">
        <label className="flex min-h-24 cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-4">
          <FileAudio className="accent-text" size={30} />
          <span className="min-w-0">
            <span className="block font-bold">{file ? file.name : "Choose MP3 file"}</span>
            <span className="text-xs text-white/50">MP3 files only for local playback.</span>
          </span>
          <input className="hidden" type="file" accept=".mp3,audio/mpeg,audio/mp3" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>

      <div className="space-y-3">
        <select className="h-12 w-full rounded-2xl bg-white/10 px-4 capitalize outline-none" value={category} onChange={(e) => setCategory(e.target.value as Track["category"])}>
          <option value="song">Song</option>
          <option value="podcast">Podcast</option>
          <option value="other">Other</option>
        </select>
        <input className="accent-ring h-12 w-full rounded-2xl bg-white/10 px-4 outline-none" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="accent-ring h-12 w-full rounded-2xl bg-white/10 px-4 outline-none" placeholder="Creator / artist / channel" value={creator} onChange={(e) => setCreator(e.target.value)} />
        <select className="h-12 w-full rounded-2xl bg-white/10 px-4 outline-none" value={playlistId} onChange={(e) => setPlaylistId(e.target.value)}>
          <option value="">No playlist</option>
          {playlists.map((playlist) => (
            <option key={playlist.id} value={playlist.id}>
              {playlist.name}
            </option>
          ))}
        </select>
        <textarea className="accent-ring min-h-24 w-full rounded-2xl bg-white/10 px-4 py-3 outline-none" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <button className="accent-bg flex h-14 w-full items-center justify-center gap-2 rounded-2xl font-black" onClick={saveMedia} disabled={saving}>
        <Plus size={20} /> Upload
      </button>
    </section>
  );
}
