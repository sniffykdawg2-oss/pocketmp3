import { Home, Library as LibraryIcon, ListMusic, PlusCircle, Settings as SettingsIcon, X } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import AddMedia from "./components/AddMedia";
import Library from "./components/Library";
import MiniPlayer from "./components/MiniPlayer";
import Player from "./components/Player";
import Playlists from "./components/Playlists";
import Settings from "./components/Settings";
import { clearAllData, defaultSettings, deletePlaylist, deleteTrack, getPlaylists, getSettings, getTracks, savePlaylist, saveSettings, saveTrack } from "./lib/db";
import { setupMediaSession } from "./lib/mediaSession";
import { downloadJson, exportMetadata, formatTime } from "./lib/storage";
import type { MetadataExport, PlaybackState, Playlist, Settings as SettingsType, Track } from "./lib/types";

type Tab = "home" | "library" | "playlists" | "add" | "settings";

const initialPlayback: PlaybackState = {
  queue: [],
  isPlaying: false,
  shuffle: false,
  repeat: "off",
  speed: 1,
};

const accentVars: Record<SettingsType["accent"], CSSProperties> = {
  blue: {
    "--accent": "#38bdf8",
    "--accent-2": "#3b82f6",
    "--accent-soft": "rgb(56 189 248 / 0.2)",
    "--accent-border": "rgb(56 189 248 / 0.35)",
    "--accent-ring": "rgb(56 189 248 / 0.42)",
  } as CSSProperties,
  purple: {
    "--accent": "#c084fc",
    "--accent-2": "#8b5cf6",
    "--accent-soft": "rgb(192 132 252 / 0.2)",
    "--accent-border": "rgb(192 132 252 / 0.35)",
    "--accent-ring": "rgb(192 132 252 / 0.42)",
  } as CSSProperties,
  green: {
    "--accent": "#34d399",
    "--accent-2": "#14b8a6",
    "--accent-soft": "rgb(52 211 153 / 0.2)",
    "--accent-border": "rgb(52 211 153 / 0.35)",
    "--accent-ring": "rgb(52 211 153 / 0.42)",
  } as CSSProperties,
  red: {
    "--accent": "#fb7185",
    "--accent-2": "#ef4444",
    "--accent-soft": "rgb(251 113 133 / 0.2)",
    "--accent-border": "rgb(251 113 133 / 0.35)",
    "--accent-ring": "rgb(251 113 133 / 0.42)",
  } as CSSProperties,
};

export default function App() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [settings, setSettingsState] = useState<SettingsType>(defaultSettings);
  const [playback, setPlayback] = useState<PlaybackState>(initialPlayback);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playableTracks = useMemo(() => tracks.filter((track) => track.kind !== "youtube" && track.file), [tracks]);
  const currentTrack = tracks.find((track) => track.id === playback.currentTrackId);

  async function refresh() {
    try {
      const [nextTracks, nextPlaylists, nextSettings] = await Promise.all([getTracks(), getPlaylists(), getSettings()]);
      const hydrated = nextTracks.map((track) => ({ ...track, category: track.category ?? "song" }));
      setTracks(hydrated);
      setPlaylists(nextPlaylists.sort((a, b) => b.updatedAt - a.updatedAt));
      setSettingsState(nextSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "IndexedDB unavailable. PocketMP3 cannot load local storage.");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.file) return;

    const src = URL.createObjectURL(currentTrack.file);
    audio.src = src;
    audio.playbackRate = playback.speed;
    audio.currentTime = currentTrack.lastPosition || 0;
    setCurrentTime(currentTrack.lastPosition || 0);

    if (playback.isPlaying) {
      audio.play().catch(() => {
        setPlayback((state) => ({ ...state, isPlaying: false }));
        setError("Playback was blocked by the browser. Tap play to start.");
      });
    }

    return () => URL.revokeObjectURL(src);
  }, [currentTrack?.id]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playback.speed;
  }, [playback.speed]);

  useEffect(() => {
    setupMediaSession(currentTrack, {
      onPlay: play,
      onPause: pause,
      onNext: nextTrack,
      onPrevious: previousTrack,
      onSeekForward: () => skip(15),
      onSeekBackward: () => skip(-15),
    });
  }, [currentTrack, playback.queue, playback.repeat, playback.shuffle]);

  function showError(message: string) {
    setError(message);
    window.setTimeout(() => setError(null), 5200);
  }

  async function addTrack(track: Track) {
    await saveTrack(track);
    for (const playlistId of track.playlistIds) {
      const playlist = playlists.find((item) => item.id === playlistId);
      if (playlist) await savePlaylist({ ...playlist, trackIds: [...playlist.trackIds, track.id], updatedAt: Date.now() });
    }
    await refresh();
  }

  async function updateTrack(track: Track) {
    await saveTrack(track);
    await refresh();
  }

  async function removeTrack(trackId: string) {
    await deleteTrack(trackId);
    await Promise.all(
      playlists.map((playlist) =>
        playlist.trackIds.includes(trackId) ? savePlaylist({ ...playlist, trackIds: playlist.trackIds.filter((id) => id !== trackId), updatedAt: Date.now() }) : Promise.resolve(),
      ),
    );
    if (playback.currentTrackId === trackId) setPlayback((state) => ({ ...state, currentTrackId: undefined, isPlaying: false }));
    await refresh();
  }

  async function createPlaylist(name: string) {
    const stamp = Date.now();
    await savePlaylist({ id: crypto.randomUUID(), name, trackIds: [], createdAt: stamp, updatedAt: stamp });
    await refresh();
  }

  async function updatePlaylist(playlist: Playlist) {
    await savePlaylist(playlist);
    await refresh();
  }

  async function removePlaylist(id: string) {
    await deletePlaylist(id);
    await refresh();
  }

  function queueAndPlay(ids: string[], startId?: string, queueName?: string) {
    const playableIds = ids.filter((id) => tracks.find((track) => track.id === id && track.kind !== "youtube" && track.file));
    if (!playableIds.length) {
      showError("This playlist has no local playable media. YouTube references open on YouTube instead.");
      return;
    }
    const currentTrackId = startId && playableIds.includes(startId) ? startId : playableIds[0];
    setPlayback((state) => ({ ...state, queue: playableIds, queueName, currentTrackId, isPlaying: true }));
    setPlayerOpen(true);
  }

  function playTrack(trackId: string) {
    queueAndPlay(playableTracks.map((track) => track.id), trackId, "Library");
  }

  function playPlaylist(playlist: Playlist) {
    queueAndPlay(playlist.trackIds, undefined, playlist.name);
  }

  function play() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().then(() => setPlayback((state) => ({ ...state, isPlaying: true }))).catch(() => showError("Playback was blocked. Tap play again after choosing a track."));
  }

  function pause() {
    audioRef.current?.pause();
    setPlayback((state) => ({ ...state, isPlaying: false }));
  }

  function togglePlayback() {
    if (!currentTrack) {
      if (playableTracks[0]) playTrack(playableTracks[0].id);
      return;
    }
    playback.isPlaying ? pause() : play();
  }

  function nextTrack() {
    if (!playback.queue.length || !playback.currentTrackId) return;
    if (playback.repeat === "one") {
      seek(0);
      play();
      return;
    }
    const queue = playback.queue;
    const index = queue.indexOf(playback.currentTrackId);
    const nextIndex = playback.shuffle ? Math.floor(Math.random() * queue.length) : index + 1;
    if (nextIndex >= queue.length) {
      if (playback.repeat === "playlist") setPlayback((state) => ({ ...state, currentTrackId: queue[0], isPlaying: true }));
      else setPlayback((state) => ({ ...state, isPlaying: false }));
      return;
    }
    setPlayback((state) => ({ ...state, currentTrackId: queue[nextIndex], isPlaying: true }));
  }

  function previousTrack() {
    if (!playback.queue.length || !playback.currentTrackId) return;
    const index = playback.queue.indexOf(playback.currentTrackId);
    setPlayback((state) => ({ ...state, currentTrackId: playback.queue[Math.max(0, index - 1)], isPlaying: true }));
  }

  function seek(time: number) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(time, audioRef.current.duration || time));
  }

  function skip(delta: number) {
    seek((audioRef.current?.currentTime ?? 0) + delta);
  }

  async function persistPosition(time: number) {
    if (!currentTrack || currentTrack.kind === "youtube") return;
    const next = { ...currentTrack, lastPosition: time, updatedAt: Date.now() };
    await saveTrack(next);
    setTracks((items) => items.map((item) => (item.id === next.id ? { ...item, lastPosition: time } : item)));
  }

  async function changeSettings(next: SettingsType) {
    setSettingsState(next);
    await saveSettings(next);
  }

  async function importMetadata(data: MetadataExport) {
    await Promise.all(data.tracks.map((track) => saveTrack({ ...track, category: track.category ?? "song", playlistIds: track.playlistIds ?? [], lastPosition: track.lastPosition ?? 0 })));
    await Promise.all(data.playlists.map(savePlaylist));
    if (data.settings) await changeSettings(data.settings);
    await refresh();
  }

  async function clearData() {
    if (!confirm("Clear all PocketMP3 local data on this device?")) return;
    pause();
    await clearAllData();
    setPlayback(initialPlayback);
    await refresh();
  }

  const nav = [
    ["home", Home, "Home"],
    ["library", LibraryIcon, "Library"],
    ["playlists", ListMusic, "Playlists"],
    ["add", PlusCircle, "Add"],
    ["settings", SettingsIcon, "Settings"],
  ] as const;

  const recentTracks = [...tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 6);
  const recentPlaylists = playlists.slice(0, 4);

  return (
    <div className={`min-h-screen text-white ${settings.compactMode ? "text-[14px]" : ""}`} style={accentVars[settings.accent]}>
      <audio
        ref={audioRef}
        className="hidden"
        onTimeUpdate={(event) => {
          const time = event.currentTarget.currentTime;
          setCurrentTime(time);
          if (Math.floor(time) % 8 === 0) persistPosition(time);
        }}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || currentTrack?.duration || 0)}
        onEnded={nextTrack}
      />

      <main className="mx-auto min-h-screen w-full max-w-md px-4 pb-28 pt-5">
        {tab === "home" && (
          <section className="space-y-5 pb-32">
            <div className="flex items-center justify-between">
              <div>
                <p className="accent-gradient-text text-sm font-black uppercase">PocketMP3</p>
                <h1 className="mt-1 text-4xl font-black tracking-normal">Your pocket player</h1>
              </div>
              <button className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-black" onClick={() => setTab("add")} aria-label="Add media">
                <PlusCircle />
              </button>
            </div>

            <div className="glass rounded-[2rem] p-5">
              <p className="text-sm font-bold text-white/55">Current track</p>
              <h2 className="mt-3 line-clamp-2 text-2xl font-black">{currentTrack?.title ?? "Nothing playing"}</h2>
              <p className="mt-2 text-sm text-white/55">{currentTrack?.creator || playback.queueName || "Upload a file to begin"}</p>
              <div className="mt-5 flex items-center gap-3">
                <button className="h-16 flex-1 rounded-3xl bg-white text-lg font-black text-black" onClick={togglePlayback}>
                  {playback.isPlaying ? "Pause" : "Play"}
                </button>
                <button className="accent-bg h-16 flex-1 rounded-3xl text-lg font-black" onClick={() => setTab("add")}>
                  Add
                </button>
              </div>
              {currentTrack && <p className="mt-4 text-xs text-white/45">Resume at {formatTime(currentTrack.lastPosition)}</p>}
            </div>

            <div className="glass rounded-3xl p-4">
              <h2 className="font-black">Locked-screen playback</h2>
              <p className="mt-2 text-sm leading-6 text-white/55">
                Uploaded audio uses the normal HTML5 player and media controls. Your phone/browser decides whether it keeps playing after the screen locks.
              </p>
            </div>

            <div>
              <h2 className="mb-3 text-lg font-black">Recent Tracks</h2>
              <div className="space-y-2">
                {recentTracks.map((track) => (
                  <button key={track.id} className="flex w-full items-center gap-3 rounded-2xl bg-white/10 p-3 text-left" onClick={() => (track.kind === "youtube" ? window.open(track.sourceLink, "_blank") : playTrack(track.id))}>
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10">{track.title[0]}</div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{track.title}</span>
                      <span className="block truncate text-xs text-white/45">{track.kind === "youtube" ? "Open on YouTube" : track.creator || "Local media"}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-3 text-lg font-black">Recent Playlists</h2>
              <div className="grid grid-cols-2 gap-3">
                {recentPlaylists.map((playlist) => (
                  <button key={playlist.id} className="glass min-h-28 rounded-3xl p-4 text-left" onClick={() => playPlaylist(playlist)}>
                    <span className="block text-lg font-black">{playlist.name}</span>
                    <span className="mt-2 block text-xs text-white/45">{playlist.trackIds.length} items</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {tab === "library" && <Library tracks={tracks} onPlay={playTrack} onDelete={removeTrack} onUpdate={updateTrack} />}
        {tab === "playlists" && <Playlists playlists={playlists} tracks={tracks} onCreate={createPlaylist} onUpdate={updatePlaylist} onDelete={removePlaylist} onPlay={playPlaylist} />}
        {tab === "add" && <AddMedia playlists={playlists} onAdd={addTrack} onError={showError} />}
        {tab === "settings" && (
          <Settings
            tracks={tracks}
            settings={settings}
            onSettings={changeSettings}
            onClear={clearData}
            onExport={() => downloadJson("pocketmp3-metadata.json", exportMetadata(tracks, playlists, settings))}
            onImport={importMetadata}
            onError={showError}
          />
        )}
      </main>

      <MiniPlayer track={currentTrack} isPlaying={playback.isPlaying} onOpen={() => setPlayerOpen(true)} onToggle={togglePlayback} />

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-black/80 px-2 pt-2 backdrop-blur-xl safe-bottom">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {nav.map(([key, Icon, label]) => (
            <button key={key} className={`flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold ${tab === key ? "accent-bg" : "text-white/55"}`} onClick={() => setTab(key)}>
              <Icon size={20} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {playerOpen && (
        <Player
          track={currentTrack}
          isPlaying={playback.isPlaying}
          currentTime={currentTime}
          duration={duration || currentTrack?.duration || 0}
          speed={playback.speed}
          shuffle={playback.shuffle}
          repeat={playback.repeat}
          onClose={() => setPlayerOpen(false)}
          onToggle={togglePlayback}
          onPrevious={previousTrack}
          onNext={nextTrack}
          onSeek={seek}
          onSkip={skip}
          onSpeed={(speed) => setPlayback((state) => ({ ...state, speed }))}
          onShuffle={() => setPlayback((state) => ({ ...state, shuffle: !state.shuffle }))}
          onRepeat={() => setPlayback((state) => ({ ...state, repeat: state.repeat === "off" ? "one" : state.repeat === "one" ? "playlist" : "off" }))}
        />
      )}

      {error && (
        <div className="fixed left-3 right-3 top-4 z-[60] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-red-300/20 bg-red-950/95 p-4 text-sm shadow-2xl">
          <p className="min-w-0 flex-1">{error}</p>
          <button onClick={() => setError(null)} aria-label="Dismiss error">
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
