import { GripVertical, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Playlist, Track } from "../lib/types";

interface PlaylistsProps {
  playlists: Playlist[];
  tracks: Track[];
  onCreate: (name: string) => void;
  onUpdate: (playlist: Playlist) => void;
  onDelete: (id: string) => void;
  onPlay: (playlist: Playlist) => void;
}

export default function Playlists({ playlists, tracks, onCreate, onUpdate, onDelete, onPlay }: PlaylistsProps) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string | null>(playlists[0]?.id ?? null);
  const playlist = playlists.find((item) => item.id === selected) ?? playlists[0];

  function moveTrack(index: number, direction: -1 | 1) {
    if (!playlist) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= playlist.trackIds.length) return;
    const trackIds = [...playlist.trackIds];
    const [item] = trackIds.splice(index, 1);
    trackIds.splice(nextIndex, 0, item);
    onUpdate({ ...playlist, trackIds, updatedAt: Date.now() });
  }

  function toggleTrack(trackId: string) {
    if (!playlist) return;
    const exists = playlist.trackIds.includes(trackId);
    onUpdate({
      ...playlist,
      trackIds: exists ? playlist.trackIds.filter((id) => id !== trackId) : [...playlist.trackIds, trackId],
      updatedAt: Date.now(),
    });
  }

  return (
    <section className="space-y-5 pb-32">
      <div>
        <h1 className="text-3xl font-black">Playlists</h1>
        <p className="mt-2 text-sm text-white/55">Build queues from local media and saved links.</p>
      </div>

      <div className="glass flex gap-2 rounded-3xl p-3">
        <input className="min-w-0 flex-1 rounded-2xl bg-black/35 px-4 outline-none" placeholder="New playlist" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-400 text-black"
          onClick={() => {
            if (!name.trim()) return;
            onCreate(name.trim());
            setName("");
          }}
          aria-label="Create playlist"
        >
          <Plus />
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {playlists.map((item) => (
          <button key={item.id} className={`h-11 shrink-0 rounded-full px-4 font-bold ${playlist?.id === item.id ? "bg-white text-black" : "bg-white/10"}`} onClick={() => setSelected(item.id)}>
            {item.name}
          </button>
        ))}
      </div>

      {playlist ? (
        <div className="space-y-4">
          <div className="glass rounded-3xl p-4">
            <div className="flex items-center justify-between gap-3">
              <input className="min-w-0 flex-1 bg-transparent text-xl font-black outline-none" value={playlist.name} onChange={(e) => onUpdate({ ...playlist, name: e.target.value, updatedAt: Date.now() })} />
              <button className="grid h-11 w-11 place-items-center rounded-full bg-white text-black" onClick={() => onPlay(playlist)} aria-label="Play playlist">
                <Play size={19} fill="currentColor" />
              </button>
              <button className="grid h-11 w-11 place-items-center rounded-full bg-red-500/15 text-red-200" onClick={() => onDelete(playlist.id)} aria-label="Delete playlist">
                <Trash2 size={18} />
              </button>
            </div>
            <p className="mt-2 text-xs text-white/45">Playback uses playable local media and skips YouTube references.</p>
          </div>

          <div className="space-y-3">
            {playlist.trackIds.map((trackId, index) => {
              const track = tracks.find((item) => item.id === trackId);
              if (!track) return null;
              return (
                <article key={`${trackId}-${index}`} className="glass flex items-center gap-3 rounded-2xl p-3">
                  <button className="grid h-10 w-8 place-items-center rounded-xl bg-white/5" onClick={() => moveTrack(index, index === 0 ? 1 : -1)} aria-label="Reorder item">
                    <GripVertical size={18} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{track.title}</p>
                    <p className="truncate text-xs text-white/50">{track.kind === "youtube" ? "Open on YouTube" : track.creator || "Local media"}</p>
                  </div>
                  <button className="grid h-10 w-10 place-items-center rounded-full bg-white/10" onClick={() => toggleTrack(track.id)} aria-label="Remove from playlist">
                    <Trash2 size={16} />
                  </button>
                </article>
              );
            })}
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white/60">
              <Pencil size={16} /> Add or remove tracks
            </div>
            <div className="space-y-2">
              {tracks.map((track) => (
                <button key={track.id} className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left ${playlist.trackIds.includes(track.id) ? "bg-sky-400/20" : "bg-white/10"}`} onClick={() => toggleTrack(track.id)}>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{track.title}</span>
                    <span className="text-xs text-white/45">{track.kind}</span>
                  </span>
                  <span className="text-sm font-black">{playlist.trackIds.includes(track.id) ? "Added" : "Add"}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="glass rounded-3xl p-6 text-center text-white/55">Create your first playlist.</div>
      )}
    </section>
  );
}
