import { FileAudio, Link, Plus } from "lucide-react";
import { useState } from "react";
import type { Playlist, Track } from "../lib/types";
import { copyFileToStoredBlob, isSupportedFile, isYoutubeUrl, maxFileSize, readDuration, requestPersistentStorage } from "../lib/storage";

interface AddMediaProps {
  playlists: Playlist[];
  onAdd: (track: Track) => Promise<void>;
  onError: (message: string) => void;
}

const now = () => Date.now();
const id = () => crypto.randomUUID();

export default function AddMedia({ playlists, onAdd, onError }: AddMediaProps) {
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [category, setCategory] = useState<Track["category"]>("song");
  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const [notes, setNotes] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveMedia() {
    if (!file && !youtubeUrl.trim()) return onError("Choose an MP3 file or paste a YouTube link first.");
    if (!file && youtubeUrl.trim()) {
      if (!isYoutubeUrl(youtubeUrl)) return onError("Paste a valid YouTube link or choose an MP3 file.");
      return onError("YouTube-to-MP3 conversion is not available in PocketMP3. Upload an MP3 file you own for local playback.");
    }

    if (!file) return;
    if (!isSupportedFile(file)) return onError("That file type is not supported here.");
    if (file.size > maxFileSize) return onError("That file is too large for comfortable browser storage.");

    setSaving(true);
    try {
      const storedFile = await copyFileToStoredBlob(file);
      await requestPersistentStorage();
      const duration = await readDuration(storedFile);
      const stamp = now();
      await onAdd({
        id: id(),
        kind: "audio",
        category,
        title: title.trim() || file.name.replace(/\.[^/.]+$/, ""),
        creator: creator.trim(),
        notes: notes.trim(),
        sourceLink: youtubeUrl.trim() || undefined,
        file: storedFile,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        duration,
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
      setYoutubeUrl("");
      setPlaylistId("");
    } catch {
      onError("Could not save this file. Storage may be full or unavailable.");
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

      <div className="glass space-y-3 rounded-3xl p-4">
        <div className="accent-text flex items-center gap-2 text-sm font-bold">
          <Link size={17} /> Source link
        </div>
        <input className="accent-ring h-12 w-full rounded-2xl bg-black/35 px-4 outline-none" placeholder="https://youtube.com/watch..." value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} />
        <p className="text-xs leading-5 text-white/45">Optional metadata only. PocketMP3 does not convert YouTube videos to MP3.</p>
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
