import { Pause, Play } from "lucide-react";
import type { Track } from "../lib/types";

interface MiniPlayerProps {
  track?: Track;
  isPlaying: boolean;
  onOpen: () => void;
  onToggle: () => void;
}

export default function MiniPlayer({ track, isPlaying, onOpen, onToggle }: MiniPlayerProps) {
  if (!track) return null;

  return (
    <div className="slide-up fixed bottom-[5.75rem] left-3 right-3 z-30">
      <div className="glass flex h-16 items-center gap-3 rounded-2xl px-3 shadow-2xl">
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onOpen}>
          <div className="accent-bg grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl">
            <span className="font-black">{track.title[0]}</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{track.title}</p>
            <p className="truncate text-xs text-white/55">{track.creator || "PocketMP3"}</p>
          </div>
        </button>
        <button className="grid h-11 w-11 place-items-center rounded-full bg-white text-black" onClick={onToggle} aria-label="Play or pause">
          {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </button>
      </div>
    </div>
  );
}
