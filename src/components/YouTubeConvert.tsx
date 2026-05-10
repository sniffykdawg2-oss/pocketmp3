import { Loader2, Music2, Youtube } from "lucide-react";
import { useState } from "react";
import type { Playlist, Track } from "../lib/types";
import { extractMp3Cover, fileToBytes, readDuration, requestPersistentStorage } from "../lib/storage";

interface YouTubeConvertProps {
  playlists: Playlist[];
  onAdd: (track: Track) => Promise<void>;
  onError: (message: string) => void;
}

const now = () => Date.now();
const id = () => crypto.randomUUID();
const converterApiBase = String(import.meta.env.VITE_CONVERTER_API_URL || "").replace(/\/$/, "");
const converterApiUrls = [
  converterApiBase ? `${converterApiBase}/api/convert-youtube` : "/api/convert-youtube",
  "http://localhost:10000/api/convert-youtube",
  "http://127.0.0.1:10000/api/convert-youtube",
].filter((url, index, urls) => urls.indexOf(url) === index);

function decodeHeader(value: string | null) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function filenameFromDisposition(value: string | null) {
  const match = value?.match(/filename="([^"]+)"/i);
  return match?.[1] || "youtube-audio.mp3";
}

async function convertYouTube(url: string) {
  let lastError = "Could not convert this YouTube link.";

  for (const endpoint of converterApiUrls) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (response.ok) return response;

      try {
        const body = await response.json();
        if (body?.error) lastError = body.error;
      } catch {
        lastError = "Could not convert this YouTube link.";
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Could not reach the converter.";
    }
  }

  throw new Error(lastError);
}

export default function YouTubeConvert({ playlists, onAdd, onError }: YouTubeConvertProps) {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<Track["category"]>("podcast");
  const [playlistId, setPlaylistId] = useState("");
  const [notes, setNotes] = useState("");
  const [converting, setConverting] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  async function convert() {
    const youtubeUrl = url.trim();
    if (!youtubeUrl) return onError("Paste a YouTube link first.");

    setConverting(true);
    setLastAdded(null);
    try {
      const response = await convertYouTube(youtubeUrl);

      const blob = await response.blob();
      const title = decodeHeader(response.headers.get("X-Video-Title")) || "YouTube audio";
      const creator = decodeHeader(response.headers.get("X-Video-Creator"));
      const serverDuration = Number(response.headers.get("X-Video-Duration"));
      const fileName = filenameFromDisposition(response.headers.get("Content-Disposition"));
      const file = new File([blob], fileName, { type: "audio/mpeg" });
      await requestPersistentStorage();
      const [browserDuration, cover, fileData] = await Promise.all([readDuration(file), extractMp3Cover(file), fileToBytes(file)]);
      const duration = Number.isFinite(serverDuration) && serverDuration > 0 ? serverDuration : browserDuration;
      const stamp = now();

      await onAdd({
        id: id(),
        category,
        title,
        creator,
        notes: notes.trim() || youtubeUrl,
        file,
        fileData,
        fileName,
        mimeType: "audio/mpeg",
        size: file.size,
        duration,
        cover,
        playlistIds: playlistId ? [playlistId] : [],
        lastPosition: 0,
        addedAt: stamp,
        updatedAt: stamp,
      });

      setLastAdded(title);
      setUrl("");
      setNotes("");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not convert this YouTube link.");
    } finally {
      setConverting(false);
    }
  }

  return (
    <section className="page-enter space-y-5 pb-32">
      <div>
        <p className="accent-gradient-text text-sm font-black uppercase">YouTube</p>
        <h1 className="mt-1 text-3xl font-black">Convert to MP3</h1>
        <p className="mt-2 text-sm leading-6 text-white/55">Paste a link from your channel and save the audio in PocketMP3.</p>
      </div>

      <div className="glass space-y-4 rounded-3xl p-4">
        <label className="flex min-h-24 items-center gap-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-4">
          <Youtube className="accent-text shrink-0" size={30} />
          <span className="min-w-0 flex-1">
            <span className="block font-bold">YouTube link</span>
            <input
              className="accent-ring mt-3 h-12 w-full rounded-2xl bg-white/10 px-4 outline-none"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              inputMode="url"
            />
          </span>
        </label>
      </div>

      <div className="space-y-3">
        <select className="h-12 w-full rounded-2xl bg-white/10 px-4 capitalize outline-none" value={category} onChange={(event) => setCategory(event.target.value as Track["category"])}>
          <option value="podcast">Podcast</option>
          <option value="song">Song</option>
          <option value="other">Other</option>
        </select>
        <select className="h-12 w-full rounded-2xl bg-white/10 px-4 outline-none" value={playlistId} onChange={(event) => setPlaylistId(event.target.value)}>
          <option value="">No playlist</option>
          {playlists.map((playlist) => (
            <option key={playlist.id} value={playlist.id}>
              {playlist.name}
            </option>
          ))}
        </select>
        <textarea className="accent-ring min-h-24 w-full rounded-2xl bg-white/10 px-4 py-3 outline-none" placeholder="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>

      <button className="accent-bg flex h-14 w-full items-center justify-center gap-2 rounded-2xl font-black" onClick={convert} disabled={converting}>
        {converting ? <Loader2 className="animate-spin" size={20} /> : <Music2 size={20} />}
        {converting ? "Converting" : "Convert"}
      </button>

      {lastAdded && (
        <div className="slide-up rounded-2xl border border-emerald-300/20 bg-emerald-950/60 p-4 text-sm text-emerald-100">
          Saved {lastAdded} to your library.
        </div>
      )}
    </section>
  );
}
