import { Edit3, ExternalLink, Play, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { MediaCategory, Track } from "../lib/types";
import { formatBytes, formatTime } from "../lib/storage";

interface LibraryProps {
  tracks: Track[];
  onPlay: (trackId: string) => void;
  onDelete: (trackId: string) => void;
  onUpdate: (track: Track) => void;
}

export default function Library({ tracks, onPlay, onDelete, onUpdate }: LibraryProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MediaCategory | "all" | "recent">("all");
  const [editing, setEditing] = useState<Track | null>(null);

  const filtered = useMemo(() => {
    return tracks
      .filter((track) => filter === "all" || filter === "recent" || track.category === filter)
      .filter((track) => `${track.title} ${track.creator} ${track.notes}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => (filter === "recent" ? b.addedAt - a.addedAt : a.title.localeCompare(b.title)));
  }, [filter, query, tracks]);

  return (
    <section className="space-y-5 pb-32">
      <div>
        <h1 className="text-3xl font-black">Library</h1>
        <p className="mt-2 text-sm text-white/55">{tracks.length} saved items</p>
      </div>

      <div className="glass flex h-12 items-center gap-3 rounded-2xl px-4">
        <Search size={18} className="text-white/45" />
        <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {(["all", "recent", "podcast", "song"] as const).map((item) => (
          <button key={item} className={`h-10 rounded-full px-4 text-sm font-bold capitalize ${filter === item ? "accent-bg" : "bg-white/10"}`} onClick={() => setFilter(item)}>
            {item === "recent" ? "Recently added" : item === "podcast" ? "Podcasts" : item === "song" ? "Songs" : "All"}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((track) => (
          <article key={track.id} className="glass rounded-3xl p-4">
            <div className="flex gap-3">
              <button className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-slate-800" onClick={() => (track.kind === "youtube" ? window.open(track.sourceLink, "_blank") : onPlay(track.id))}>
                {track.kind === "youtube" ? <ExternalLink size={22} /> : <Play size={22} />}
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-bold">{track.title}</h2>
                <p className="truncate text-sm text-white/55">{track.creator || "Unknown creator"}</p>
                <p className="mt-1 text-xs text-white/40">
                  {track.kind === "youtube" ? `YouTube reference • ${track.category}` : `${track.category} • ${formatTime(track.duration)} • ${formatBytes(track.size)}`}
                </p>
              </div>
              <div className="flex gap-1">
                <button className="grid h-10 w-10 place-items-center rounded-full bg-white/10" onClick={() => setEditing(track)} aria-label="Edit metadata">
                  <Edit3 size={17} />
                </button>
                <button className="grid h-10 w-10 place-items-center rounded-full bg-red-500/15 text-red-200" onClick={() => onDelete(track.id)} aria-label="Delete item">
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
            {track.kind === "youtube" && <p className="mt-3 rounded-2xl bg-black/25 px-3 py-2 text-xs text-white/55">Cannot play locally. Open on YouTube.</p>}
          </article>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-3">
          <div className="glass w-full rounded-3xl p-4">
            <h2 className="text-xl font-black">Edit Metadata</h2>
            <div className="mt-4 space-y-3">
              <input className="h-12 w-full rounded-2xl bg-black/35 px-4 outline-none" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              <input className="h-12 w-full rounded-2xl bg-black/35 px-4 outline-none" value={editing.creator} onChange={(e) => setEditing({ ...editing, creator: e.target.value })} />
              <textarea className="min-h-24 w-full rounded-2xl bg-black/35 px-4 py-3 outline-none" value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button className="h-12 rounded-2xl bg-white/10 font-bold" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                className="accent-bg h-12 rounded-2xl font-black"
                onClick={() => {
                  onUpdate({ ...editing, updatedAt: Date.now() });
                  setEditing(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
