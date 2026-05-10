import { Home, Library as LibraryIcon, ListMusic, PlusCircle, Settings as SettingsIcon, X, Youtube } from "lucide-react";
import type { CSSProperties, SyntheticEvent, TouchEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import AddMedia from "./components/AddMedia";
import Library from "./components/Library";
import MiniPlayer from "./components/MiniPlayer";
import Player from "./components/Player";
import Playlists from "./components/Playlists";
import Settings from "./components/Settings";
import YouTubeConvert from "./components/YouTubeConvert";
import { clearAllData, defaultSettings, deletePlaylist, deleteTrack, getPlaylists, getSettings, getTrack, getTracks, savePlaylist, saveSettings, saveTrack, updateTrackFields } from "./lib/db";
import { setupMediaSession } from "./lib/mediaSession";
import { createPlaybackBlob, downloadJson, exportMetadata, extractMp3Cover, formatTime } from "./lib/storage";
import type { MetadataExport, PlaybackState, Playlist, Settings as SettingsType, Track } from "./lib/types";

type Tab = "home" | "library" | "playlists" | "youtube" | "add" | "settings";

const initialPlayback: PlaybackState = {
  queue: [],
  isPlaying: false,
  shuffle: false,
  repeat: "off",
  speed: 1,
};

const tabOrder: Tab[] = ["home", "library", "playlists", "youtube", "add", "settings"];

function isInteractiveElement(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [data-no-swipe]"));
}

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
  const playbackRequestRef = useRef(0);
  const pendingSeekRef = useRef(0);
  const coverUrlCacheRef = useRef<Map<string, string>>(new Map());
  const coverBackfillRef = useRef<Set<string>>(new Set());
  const lastPersistedSecondRef = useRef<Record<string, number>>({});
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
  const pageSwipeRef = useRef<{ x: number; y: number; tracking: boolean }>({ x: 0, y: 0, tracking: false });

  const playableTracks = useMemo(() => tracks.filter((track) => track.file || track.fileData), [tracks]);
  const currentTrack = tracks.find((track) => track.id === playback.currentTrackId);

  function resetAudioElement() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (audioUrlRef.current) {
      const previousUrl = audioUrlRef.current;
      window.setTimeout(() => URL.revokeObjectURL(previousUrl), 1000);
    }
    audioUrlRef.current = null;
    setCurrentTime(0);
    setDuration(0);
  }

  async function refresh() {
    try {
      const [nextTracks, nextPlaylists, nextSettings] = await Promise.all([getTracks(), getPlaylists(), getSettings()]);
      const hydrated = nextTracks.map((track) => {
        const coverKey = track.cover ? `${track.id}:${track.cover.size}` : undefined;
        let coverUrl = coverKey ? coverUrlCacheRef.current.get(coverKey) : undefined;
        if (track.cover && coverKey && !coverUrl) {
          coverUrl = URL.createObjectURL(track.cover);
          coverUrlCacheRef.current.set(coverKey, coverUrl);
        }
        return { ...track, category: track.category ?? "song", coverUrl };
      });
      setTracks(hydrated);
      setPlaylists(nextPlaylists.sort((a, b) => b.updatedAt - a.updatedAt));
      setSettingsState(nextSettings);
      void migrateBlobTracksToBytes(nextTracks);
      void backfillMissingCovers(nextTracks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "IndexedDB unavailable. PocketMP3 cannot load local storage.");
    }
  }

  async function backfillMissingCovers(items: Track[]) {
    const missing = items.filter((track) => (track.file || track.fileData) && !track.cover && !coverBackfillRef.current.has(track.id));
    if (!missing.length) return;

    let changed = false;
    for (const track of missing) {
      if (!track.file && !track.fileData) continue;
      coverBackfillRef.current.add(track.id);
      let cover: Blob | undefined;
      try {
        cover = await extractMp3Cover(await createPlaybackBlob(track));
      } catch {
        continue;
      }
      if (cover) {
        await saveTrack({ ...track, cover, updatedAt: Date.now() });
        changed = true;
      }
    }
    if (changed) await refresh();
  }

  async function migrateBlobTracksToBytes(items: Track[]) {
    let changed = false;
    for (const track of items) {
      if (track.fileData || !track.file || coverBackfillRef.current.has(`bytes:${track.id}`)) continue;
      coverBackfillRef.current.add(`bytes:${track.id}`);
      try {
        await saveTrack({ ...track, fileData: await track.file.arrayBuffer(), updatedAt: Date.now() });
        changed = true;
      } catch {
        // Older Safari-created Blob records can become unreadable; those need to be re-added.
      }
    }
    if (changed) await refresh();
  }

  useEffect(() => {
    refresh();
    return () => {
      playbackRequestRef.current += 1;
      resetAudioElement();
      coverUrlCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      coverUrlCacheRef.current.clear();
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
      resetAudioElement();
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

  function shiftTab(direction: -1 | 1) {
    setTab((current) => {
      const index = tabOrder.indexOf(current);
      return tabOrder[Math.max(0, Math.min(tabOrder.length - 1, index + direction))] ?? current;
    });
  }

  function handlePageTouchStart(event: TouchEvent<HTMLElement>) {
    if (playerOpen || isInteractiveElement(event.target)) {
      pageSwipeRef.current.tracking = false;
      return;
    }
    const touch = event.touches[0];
    pageSwipeRef.current = { x: touch.clientX, y: touch.clientY, tracking: true };
  }

  function handlePageTouchEnd(event: TouchEvent<HTMLElement>) {
    const swipe = pageSwipeRef.current;
    pageSwipeRef.current.tracking = false;
    if (!swipe.tracking || playerOpen) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - swipe.x;
    const dy = touch.clientY - swipe.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    shiftTab(dx > 0 ? 1 : -1);
  }

  async function startTrack(trackId: string, startAt = 0, shouldPlay = true, showBlockedMessage = false) {
    const audio = audioRef.current;
    if (!audio) return false;

    const requestId = playbackRequestRef.current + 1;
    playbackRequestRef.current = requestId;
    pendingSeekRef.current = Math.max(0, startAt);
    resetAudioElement();

    try {
      const storedTrack = await getTrack(trackId);
      if (!storedTrack?.file && !storedTrack?.fileData) {
        showError("This track is missing its saved MP3 data. Delete it and add it again.");
        setPlayback((state) => (state.currentTrackId === trackId ? { ...state, isPlaying: false } : state));
        return false;
      }

      setDuration(storedTrack.duration ?? 0);
      const playbackBlob = await createPlaybackBlob(storedTrack);
      if (playbackRequestRef.current !== requestId || !audioRef.current) return false;

      const src = URL.createObjectURL(playbackBlob);
      audioUrlRef.current = src;
      audio.src = src;
      audio.preload = "auto";
      audio.playbackRate = playback.speed;
      audio.load();

      if (shouldPlay) {
        audio.play().catch(() => {
          if (showBlockedMessage) showError("Playback was blocked by the browser. Tap play again.");
          setPlayback((state) => (state.currentTrackId === trackId ? { ...state, isPlaying: false } : state));
        });
      }

      return true;
    } catch (error) {
      const isMissingBlob = error instanceof DOMException && error.name === "NotFoundError";
      showError(isMissingBlob ? "This saved MP3 was corrupted by browser storage. Delete it and add it again." : "Could not load this MP3. Delete it and add it again.");
      setPlayback((state) => (state.currentTrackId === trackId ? { ...state, isPlaying: false } : state));
      return false;
    }
  }

  function queueAndPlay(ids: string[], startId?: string, queueName?: string, startAt = 0) {
    const playableIds = ids.filter((id) => tracks.find((track) => track.id === id && (track.file || track.fileData)));
    if (!playableIds.length) {
      showError("This playlist has no saved MP3 files yet.");
      return;
    }
    const currentTrackId = startId && playableIds.includes(startId) ? startId : playableIds[0];
    setPlayback((state) => ({ ...state, queue: playableIds, queueName, currentTrackId, isPlaying: true }));
    setPlayerOpen(true);
    void startTrack(currentTrackId, startAt, true, true);
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

    if (!currentTrack?.file && !currentTrack?.fileData) {
      showError("Choose a saved MP3 and try again.");
      return;
    }

    if (!audio.currentSrc || audio.error || audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
      const startAt = Math.min(currentTrack.lastPosition ?? 0, currentTrack.duration ?? currentTrack.lastPosition ?? 0);
      setPlayback((state) => ({ ...state, isPlaying: true }));
      void startTrack(currentTrack.id, startAt, true, true);
      return;
    }

    audio.play().then(() => setPlayback((state) => ({ ...state, isPlaying: true }))).catch(() => {
      showError("Playback could not start. Choose a saved MP3 and try again.");
      setPlayback((state) => ({ ...state, isPlaying: false }));
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
    setPlayback((state) => ({ ...state, currentTrackId: nextId, isPlaying: true }));
    void startTrack(nextId, 0, true, false);
  }

  function previousTrack() {
    if (!playback.queue.length || !playback.currentTrackId) return;
    const index = playback.queue.indexOf(playback.currentTrackId);
    const previousId = playback.queue[Math.max(0, index - 1)];
    setPlayback((state) => ({ ...state, currentTrackId: previousId, isPlaying: true }));
    void startTrack(previousId, 0, true, false);
  }

  function handleTrackEnded(event: SyntheticEvent<HTMLAudioElement>) {
    const audio = event.currentTarget;
    const expectedDuration = currentTrack?.duration ?? 0;
    const endedEarly = expectedDuration > 30 && audio.currentTime < expectedDuration - 5;

    if (endedEarly) {
      setPlayback((state) => ({ ...state, isPlaying: false }));
      showError("Playback stopped early because the browser misread this MP3. Delete it and add it again with the new uploader.");
      return;
    }

    nextTrack();
  }

  function handleAudioMetadata(event: SyntheticEvent<HTMLAudioElement>) {
    const audio = event.currentTarget;
    const metadataDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const nextDuration = currentTrack?.duration && currentTrack.duration > 0 ? currentTrack.duration : metadataDuration;
    setDuration(nextDuration);

    const startAt = pendingSeekRef.current;
    if (startAt > 0) {
      try {
        audio.currentTime = Math.min(startAt, metadataDuration || nextDuration || startAt);
        setCurrentTime(audio.currentTime);
      } catch {
        // The seek can be retried from the normal controls once the browser is ready.
      }
    }
  }

  function seek(time: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const maxTime = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : currentTrack?.duration || time;
    const nextTime = Math.max(0, Math.min(time, maxTime));
    if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
      pendingSeekRef.current = nextTime;
      return;
    }
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function skip(delta: number) {
    seek((audioRef.current?.currentTime ?? 0) + delta);
  }

  async function persistPosition(time: number) {
    if (!currentTrack) return;
    const second = Math.floor(time);
    if (lastPersistedSecondRef.current[currentTrack.id] === second) return;
    lastPersistedSecondRef.current[currentTrack.id] = second;
    await updateTrackFields(currentTrack.id, { lastPosition: time });
    setTracks((items) => items.map((item) => (item.id === currentTrack.id ? { ...item, lastPosition: time } : item)));
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
    resetAudioElement();
    await clearAllData();
    setPlayback(initialPlayback);
    await refresh();
  }

  const nav = [
    ["home", Home, "Home"],
    ["library", LibraryIcon, "Library"],
    ["playlists", ListMusic, "Playlists"],
    ["youtube", Youtube, "YouTube"],
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
        onLoadedMetadata={handleAudioMetadata}
        onEnded={handleTrackEnded}
      />

      <main className="mx-auto min-h-screen w-full max-w-md px-4 pb-28 pt-5" onTouchStart={handlePageTouchStart} onTouchEnd={handlePageTouchEnd}>
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

            <button className="glass slide-up flex w-full items-center justify-between gap-4 rounded-3xl p-4 text-left" onClick={() => setTab("youtube")}>
              <span>
                <span className="block font-black">YouTube converter</span>
                <span className="mt-2 block text-sm leading-6 text-white/55">Convert your channel videos to MP3</span>
              </span>
              <Youtube className="accent-text shrink-0" size={22} />
            </button>

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
        {tab === "youtube" && <YouTubeConvert playlists={playlists} onAdd={addTrack} onError={showError} />}
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

      <MiniPlayer track={currentTrack} isPlaying={playback.isPlaying} onOpen={() => setPlayerOpen(true)} onToggle={togglePlayback} onPrevious={previousTrack} onNext={nextTrack} />

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-black/80 px-2 pt-2 backdrop-blur-xl safe-bottom">
        <div className="mx-auto grid max-w-md grid-cols-6 gap-1">
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
