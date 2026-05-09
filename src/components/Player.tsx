import { FastForward, Pause, Play, Repeat, Repeat1, Rewind, Shuffle, SkipBack, SkipForward, X } from "lucide-react";
import type { RepeatMode, Track } from "../lib/types";
import { formatTime } from "../lib/storage";

interface PlayerProps {
  track?: Track;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  shuffle: boolean;
  repeat: RepeatMode;
  onClose: () => void;
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onSkip: (delta: number) => void;
  onSpeed: (speed: number) => void;
  onShuffle: () => void;
  onRepeat: () => void;
}

export default function Player(props: PlayerProps) {
  const {
    track,
    isPlaying,
    currentTime,
    duration,
    speed,
    shuffle,
    repeat,
    onClose,
    onToggle,
    onPrevious,
    onNext,
    onSeek,
    onSkip,
    onSpeed,
    onShuffle,
    onRepeat,
  } = props;

  const repeatIcon = repeat === "one" ? <Repeat1 size={21} /> : <Repeat size={21} />;

  return (
    <div className="page-enter fixed inset-0 z-40 flex flex-col bg-[#05070c] px-5 pb-5 pt-4">
      <div className="flex items-center justify-between pt-2">
        <button className="grid h-11 w-11 place-items-center rounded-full bg-white/10" onClick={onClose} aria-label="Close player">
          <X size={22} />
        </button>
        <p className="text-sm font-semibold text-white/70">Now Playing</p>
        <div className="h-11 w-11" />
      </div>

      <div className="flex flex-1 flex-col justify-center gap-8">
        <div className="pulse-soft mx-auto grid aspect-square w-full max-w-[20rem] place-items-center overflow-hidden rounded-[2rem] bg-slate-900 shadow-glow">
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-sky-500/60 via-fuchsia-500/25 to-emerald-400/40">
            <span className="text-7xl font-black text-white/90">{track?.title?.[0]?.toUpperCase() ?? "P"}</span>
          </div>
        </div>

        <div className="text-center">
          <h1 className="line-clamp-2 text-3xl font-black tracking-normal">{track?.title ?? "Nothing queued"}</h1>
          <p className="mt-2 text-base text-white/60">{track?.creator || "Add local media to start"}</p>
        </div>

        <div className="space-y-3">
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={Math.min(currentTime, duration || currentTime)}
            onChange={(event) => onSeek(Number(event.target.value))}
            className="accent-range w-full"
            aria-label="Playback progress"
          />
          <div className="flex justify-between text-xs text-white/50">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            className={`grid h-11 w-11 place-items-center rounded-full ${shuffle ? "accent-bg" : "bg-white/10"}`}
            onClick={onShuffle}
            aria-label="Shuffle"
          >
            <Shuffle size={20} />
          </button>
          <button className="grid h-12 w-12 place-items-center rounded-full bg-white/10" onClick={onPrevious} aria-label="Previous track">
            <SkipBack size={23} />
          </button>
          <button className="grid h-16 w-16 place-items-center rounded-full bg-white text-black shadow-glow" onClick={onToggle} aria-label="Play or pause">
            {isPlaying ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" />}
          </button>
          <button className="grid h-12 w-12 place-items-center rounded-full bg-white/10" onClick={onNext} aria-label="Next track">
            <SkipForward size={23} />
          </button>
          <button
            className={`grid h-11 w-11 place-items-center rounded-full ${repeat !== "off" ? "accent-bg" : "bg-white/10"}`}
            onClick={onRepeat}
            aria-label="Repeat"
          >
            {repeatIcon}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button className="glass flex h-12 items-center justify-center gap-2 rounded-2xl" onClick={() => onSkip(-15)}>
            <Rewind size={18} /> 15s
          </button>
          <select className="glass h-12 rounded-2xl px-3 text-center" value={speed} onChange={(event) => onSpeed(Number(event.target.value))}>
            {[0.75, 1, 1.25, 1.5, 2].map((value) => (
              <option key={value} value={value}>
                {value}x
              </option>
            ))}
          </select>
          <button className="glass flex h-12 items-center justify-center gap-2 rounded-2xl" onClick={() => onSkip(15)}>
            15s <FastForward size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
