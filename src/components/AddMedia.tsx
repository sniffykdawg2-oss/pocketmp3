import { FileAudio, Image, Link, Plus } from "lucide-react";
import { useState } from "react";
import type { Playlist, Track } from "../lib/types";
import { isSupportedFile, isYoutubeUrl, maxFileSize, readDuration } from "../lib/storage";

interface AddMediaProps {
  playlists: Playlist[];
  onAdd: (track: Track) => Promise<void>;
  onError: (message: string) => void;
}

const now = () => Date.now();
const id = () => crypto.randomUUID();

export default function AddMedia({ playlists, onAdd, onError }: AddMediaProps) {
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const [notes, setNotes] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveUpload() {
    if (!file) return onError("Choose an audio or video file first.");
    if (!isSupportedFile(file)) return onError("That file type is not supported here.");
    if (file.size > maxFileSize) return onError("That file is too large for comfortable browser storage.");

    setSaving(true);
    try {
      const duration = await readDuration(file);
      const stamp = now();
      await onAdd({
        id: id(),
        kind: file.type.startsWith("video/") ? "video" : "audio",
        title: title.trim() || file.name.replace(/\.[^/.]+$/, ""),
        creator: creator.trim(),
        notes: notes.trim(),
        sourceLink: youtubeUrl.trim() || undefined,
        file,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        duration,
        cover: cover ?? undefined,
        playlistIds: playlistId ? [playlistId] : [],
        lastPosition: 0,
        addedAt: stamp,
        updatedAt: stamp,
      });
      setFile(null);
      setCover(null);
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

  async function saveYoutubeReference() {
    if (!isYoutubeUrl(youtubeUrl)) return onError("Paste a valid YouTube link.");
    const stamp = now();
    await onAdd({
      id: id(),
      kind: "youtube",
      title: title.trim() || "Saved YouTube link",
      creator: creator.trim(),
      sourceLink: youtubeUrl.trim(),
      notes: notes.trim(),
      playlistIds: playlistId ? [playlistId] : [],
      lastPosition: 0,
      addedAt: stamp,
      updatedAt: stamp,
    });
    setYoutubeUrl("");
    setTitle("");
    setCreator("");
    setNotes("");
    setPlaylistId("");
  }

  return (
    <section className="space-y-5 pb-32">
      <div>
        <h1 className="text-3xl font-black">Add Media</h1>
        <p className="mt-2 text-sm leading-6 text-white/55">Upload files you own, or save YouTube links as references.</p>
      </div>

      <div className="glass space-y-4 rounded-3xl p-4">
        <label className="flex min-h-24 cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-4">
          <FileAudio className="text-sky-300" size={30} />
          <span className="min-w-0">
            <span className="block font-bold">{file ? file.name : "Choose local file"}</span>
            <span className="text-xs text-white/50">MP3, M4A, WAV, AAC, MP4, MOV when supported</span>
          </span>
          <input className="hidden" type="file" accept=".mp3,.m4a,.wav,.aac,.mp4,.mov,audio/*,video/mp4,video/quicktime" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>

        <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl bg-white/5 px-4">
          <Image size={19} className="text-white/55" />
          <span className="min-w-0 flex-1 truncate text-sm text-white/70">{cover ? cover.name : "Optional cover image"}</span>
          <input className="hidden" type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
        </label>
      </div>

      <div className="glass space-y-3 rounded-3xl p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-sky-200">
          <Link size={17} /> YouTube reference
        </div>
        <input className="h-12 w-full rounded-2xl bg-black/35 px-4 outline-none ring-sky-400/40 focus:ring-2" placeholder="https://youtube.com/watch..." value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} />
        <p className="text-xs leading-5 text-white/45">PocketMP3 saves the link and metadata only. Browser-only YouTube-to-MP3 conversion is not included.</p>
      </div>

      <div className="space-y-3">
        <input className="h-12 w-full rounded-2xl bg-white/10 px-4 outline-none ring-sky-400/40 focus:ring-2" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="h-12 w-full rounded-2xl bg-white/10 px-4 outline-none ring-sky-400/40 focus:ring-2" placeholder="Creator / artist / channel" value={creator} onChange={(e) => setCreator(e.target.value)} />
        <select className="h-12 w-full rounded-2xl bg-white/10 px-4 outline-none" value={playlistId} onChange={(e) => setPlaylistId(e.target.value)}>
          <option value="">No playlist</option>
          {playlists.map((playlist) => (
            <option key={playlist.id} value={playlist.id}>
              {playlist.name}
            </option>
          ))}
        </select>
        <textarea className="min-h-24 w-full rounded-2xl bg-white/10 px-4 py-3 outline-none ring-sky-400/40 focus:ring-2" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-white text-black font-black" onClick={saveUpload} disabled={saving}>
          <Plus size={20} /> Upload
        </button>
        <button className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-sky-400 text-black font-black" onClick={saveYoutubeReference}>
          <Link size={20} /> Save Link
        </button>
      </div>
    </section>
  );
}
