import { ExternalLink, Home, Library as LibraryIcon, ListMusic, PlusCircle, Settings as SettingsIcon, X } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import AddMedia from "./components/AddMedia";
import Library from "./components/Library";
import MiniPlayer from "./components/MiniPlayer";
import Player from "./components/Player";
import Playlists from "./components/Playlists";
import Settings from "./components/Settings";
import { clearAllData, defaultSettings, deletePlaylist, deleteTrack, getPlaylists, getSettings, getTrack, getTracks, savePlaylist, saveSettings, saveTrack } from "./lib/db";
import { setupMediaSession } from "./lib/mediaSession";
import { downloadJson, exportMetadata, extractMp3Cover, formatTime } from "./lib/storage";
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
  const audioUrlRef = useRef<string | null>(null);
  const loadedTrackIdRef = useRef<string | null>(null);
  const coverUrlsRef = useRef<string[]>([]);
  const coverBackfillRef = useRef<Set<string>>(new Set());
  const loadRequestRef = useRef(0);
  const [tab, setTab] = useState<Tab>("home");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [settings, setSettingsState] = useState<SettingsType>(defaultSettings);
  const [playback, setPlayback] = useState<PlaybackState>(initialPlayback);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playableTracks = useMemo(() => tracks.filter((track) => track.file), [tracks]);
  const currentTrack = tracks.find((track) => track.id === playback.currentTrackId);

  function clearLoadedAudio() {
    audioRef.current?.removeAttribute("src");
    loadedTrackIdRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
  }

  async function refresh() {
    try {
      const [nextTracks, nextPlaylists, nextSettings] = await Promise.all([getTracks(), getPlaylists(), getSettings()]);
      coverUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      coverUrlsRef.current = [];
      const hydrated = nextTracks.map((track) => {
        const coverUrl = track.cover ? URL.createObjectURL(track.cover) : undefined;
        if (coverUrl) coverUrlsRef.current.push(coverUrl);
        return { ...track, category: track.category ?? "song", coverUrl };
      });
      setTracks(hydrated);
      setPlaylists(nextPlaylists.sort((a, b) => b.updatedAt - a.updatedAt));
      setSettingsState(nextSettings);
      void backfillMissingCovers(nextTracks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "IndexedDB unavailable. PocketMP3 cannot load local storage.");
    }
  }

  async function backfillMissingCovers(items: Track[]) {
    const missing = items.filter((track) => track.file && !track.cover && !coverBackfillRef.current.has(track.id));
    if (!missing.length) return;

    let changed = false;
    for (const track of missing) {
      if (!track.file) continue;
      coverBackfillRef.current.add(track.id);
      const cover = await extractMp3Cover(track.file);
      if (cover) {
        await saveTrack({ ...track, cover, updatedAt: Date.now() });
        changed = true;
      }
    }
    if (changed) await refresh();
  }

  useEffect(() => {
    refresh();
    return () => {
      clearLoadedAudio();
      coverUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

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
    if (playback.currentTrackId === trackId) {
      pause();
      clearLoadedAudio();
      setPlayback((state) => ({ ...state, currentTrackId: undefined, isPlaying: false }));
    }
    await refresh();
  }

  async function createPlaylist(name: string) {
    const stamp = Date.now();
    const id = crypto.randomUUID();
    await savePlaylist({ id, name, trackIds: [], createdAt: stamp, updatedAt: stamp });
    setSelectedPlaylistId(id);
    await refresh();
  }

  async function updatePlaylist(playlist: Playlist) {
    await savePlaylist(playlist);
    await refresh();
  }

  async function removePlaylist(id: string) {
    await deletePlaylist(id);
    if (selectedPlaylistId === id) setSelectedPlaylistId(null);
    await refresh();
  }

  function openPlaylist(playlist: Playlist) {
    setSelectedPlaylistId(playlist.id);
    setTab("playlists");
  }

  function makePlayableBlob(file: Blob, fallbackType?: string) {
    return file.slice(0, file.size, fallbackType || file.type || "audio/mpeg");
  }

  async function loadAudioTrack(trackId: string, startAt = 0, shouldPlay = true, showBlockedMessage = false) {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    const stateTrack = tracks.find((item) => item.id === trackId);
    const audio = audioRef.current;
    if (!stateTrack?.file || !audio) return false;

    const storedTrack = await getTrack(trackId).catch(() => undefined);
    if (requestId !== loadRequestRef.current) return false;
    const track = storedTrack?.file ? storedTrack : stateTrack;
    if (!track.file) return false;
    const playableFile = makePlayableBlob(track.file, track.mimeType);

    audio.pause();
    clearLoadedAudio();
    const src = URL.createObjectURL(playableFile);
    audioUrlRef.current = src;
    loadedTrackIdRef.current = trackId;
    audio.src = src;
    audio.autoplay = shouldPlay;
    audio.playbackRate = playback.speed;
    setCurrentTime(startAt);
    setDuration(track.duration ?? 0);

    const applyStart = () => {
      try {
        audio.currentTime = startAt;
      } catch {
        // Some browsers only allow seeking after metadata is ready.
      }
    };

    const tryPlay = () => {
      if (!shouldPlay) return;
      audio.play().catch(() => {
        const retry = () => {
          audio.play().catch(() => {
            if (showBlockedMessage) showError("Playback was blocked by the browser. Tap play again.");
          });
        };
        audio.addEventListener("canplay", retry, { once: true });
      });
    };

    audio.addEventListener("loadedmetadata", applyStart, { once: true });
    audio.addEventListener("canplay", tryPlay, { once: true });
    audio.load();
    applyStart();
    tryPlay();
    return true;
  }

  function queueAndPlay(ids: string[], startId?: string, queueName?: string, startAt = 0) {
    const playableIds = ids.filter((id) => tracks.find((track) => track.id === id && track.file));
    if (!playableIds.length) {
      showError("This playlist has no saved MP3 files yet.");
      return;
    }
    const currentTrackId = startId && playableIds.includes(startId) ? startId : playableIds[0];
    void loadAudioTrack(currentTrackId, startAt, true, true);
    setPlayback((state) => ({ ...state, queue: playableIds, queueName, currentTrackId, isPlaying: true }));
    setPlayerOpen(true);
  }

  function playTrack(trackId: string) {
    const track = tracks.find((item) => item.id === trackId);
    queueAndPlay(playableTracks.map((track) => track.id), trackId, "Library", track?.lastPosition ?? 0);
  }

  function playPlaylist(playlist: Playlist) {
    queueAndPlay(playlist.trackIds, undefined, playlist.name, 0);
  }

  function play() {
    const audio = audioRef.current;
    if (!audio) return;
    const needsFreshSource =
      currentTrack?.file &&
      (loadedTrackIdRef.current !== currentTrack.id || !audio.currentSrc || audio.error || audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE);

    if (needsFreshSource && currentTrack) {
      const startAt = playback.queueName === "Library" ? currentTrack.lastPosition ?? 0 : 0;
      void loadAudioTrack(currentTrack.id, startAt, true, true);
      setPlayback((state) => ({ ...state, isPlaying: true }));
      return;
    }
    audio.play().then(() => setPlayback((state) => ({ ...state, isPlaying: true }))).catch(() => {
      if (currentTrack?.file) {
        const startAt = playback.queueName === "Library" ? currentTrack.lastPosition ?? currentTime : 0;
        void loadAudioTrack(currentTrack.id, startAt, true, true);
        setPlayback((state) => ({ ...state, isPlaying: true }));
        return;
      }
      showError("Playback could not start. Choose a saved MP3 and try again.");
    });
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
    const nextId = nextIndex >= queue.length ? queue[0] : queue[nextIndex];
    void loadAudioTrack(nextId, 0, true, false);
    if (nextIndex >= queue.length) {
      setPlayback((state) => ({ ...state, currentTrackId: queue[0], isPlaying: true }));
      return;
    }
    setPlayback((state) => ({ ...state, currentTrackId: queue[nextIndex], isPlaying: true }));
  }

  function previousTrack() {
    if (!playback.queue.length || !playback.currentTrackId) return;
    const index = playback.queue.indexOf(playback.currentTrackId);
    const previousId = playback.queue[Math.max(0, index - 1)];
    void loadAudioTrack(previousId, 0, true, false);
    setPlayback((state) => ({ ...state, currentTrackId: previousId, isPlaying: true }));
  }

  function seek(time: number) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(time, audioRef.current.duration || time));
  }

  function skip(delta: number) {
    seek((audioRef.current?.currentTime ?? 0) + delta);
  }

  async function persistPosition(time: number) {
    if (!currentTrack) return;
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
    clearLoadedAudio();
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
          <section className="page-enter space-y-5 pb-32">
            <div className="flex items-center justify-between">
              <div>
                <p className="accent-gradient-text text-sm font-black uppercase">PocketMP3</p>
                <h1 className="mt-1 text-4xl font-black tracking-normal">Your pocket player</h1>
              </div>
              <button className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-black shadow-lg shadow-white/5" onClick={() => setTab("add")} aria-label="Add media">
                <PlusCircle />
              </button>
            </div>

            <div className="glass slide-up rounded-[2rem] p-5">
              <p className="text-sm font-bold text-white/55">Current track</p>
              <h2 className="mt-3 line-clamp-2 text-2xl font-black">{currentTrack?.title ?? "Nothing playing"}</h2>
              <p className="mt-2 text-sm text-white/55">{currentTrack?.creator || playback.queueName || "Upload a file to begin"}</p>
              <div className="mt-5 flex items-center gap-3">
                <button className="h-16 flex-1 rounded-3xl bg-white text-lg font-black text-black shadow-lg shadow-white/5" onClick={togglePlayback}>
                  {playback.isPlaying ? "Pause" : "Play"}
                </button>
                <button className="accent-bg h-16 flex-1 rounded-3xl text-lg font-black shadow-glow" onClick={() => setTab("add")}>
                  Add
                </button>
              </div>
              {currentTrack && <p className="mt-4 text-xs text-white/45">Resume at {formatTime(currentTrack.lastPosition)}</p>}
            </div>

            <a className="glass slide-up flex items-center justify-between gap-4 rounded-3xl p-4" href="https://cnvmp3.com/v54" target="_blank" rel="noreferrer">
              <span>
                <span className="block font-black">MP3 converter</span>
                <span className="mt-2 block text-sm leading-6 text-white/55">Open cnvmp3.com/v54</span>
              </span>
              <ExternalLink className="accent-text shrink-0" size={22} />
            </a>

            <div>
              <h2 className="mb-3 text-lg font-black">Recent Tracks</h2>
              <div className="space-y-2">
                {recentTracks.map((track) => (
                  <button key={track.id} className="flex w-full items-center gap-3 rounded-2xl bg-white/10 p-3 text-left" onClick={() => playTrack(track.id)}>
                    <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/10">
                      {track.coverUrl ? <img src={track.coverUrl} alt="" className="h-full w-full object-cover" /> : track.title[0]}
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{track.title}</span>
                      <span className="block truncate text-xs text-white/45">{track.creator || "Local media"}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-3 text-lg font-black">Recent Playlists</h2>
              <div className="grid grid-cols-2 gap-3">
                {recentPlaylists.map((playlist) => (
                  <button key={playlist.id} className="glass min-h-28 rounded-3xl p-4 text-left" onClick={() => openPlaylist(playlist)}>
                    <span className="block text-lg font-black">{playlist.name}</span>
                    <span className="mt-2 block text-xs text-white/45">{playlist.trackIds.length} items</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {tab === "library" && <Library tracks={tracks} onPlay={playTrack} onDelete={removeTrack} onUpdate={updateTrack} />}
        {tab === "playlists" && (
          <Playlists
            playlists={playlists}
            tracks={tracks}
            selectedId={selectedPlaylistId}
            onCreate={createPlaylist}
            onUpdate={updatePlaylist}
            onDelete={removePlaylist}
            onPlay={playPlaylist}
            onSelect={setSelectedPlaylistId}
          />
        )}
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
        <div className="slide-up fixed left-3 right-3 top-4 z-[60] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-red-300/20 bg-red-950/95 p-4 text-sm shadow-2xl">
          <p className="min-w-0 flex-1">{error}</p>
          <button onClick={() => setError(null)} aria-label="Dismiss error">
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
