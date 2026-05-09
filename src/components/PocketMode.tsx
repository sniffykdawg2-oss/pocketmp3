import { Lock, Moon, Radio } from "lucide-react";
import type { Track } from "../lib/types";

interface PocketModeProps {
  active: boolean;
  track?: Track;
  onToggle: () => void;
}

export default function PocketMode({ active, track, onToggle }: PocketModeProps) {
  return (
    <div className={`glass rounded-3xl p-5 transition ${active ? "border-sky-300/50 shadow-glow" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-sky-200">
            <Lock size={16} /> Pocket Mode
          </div>
          <p className="mt-2 text-sm leading-6 text-white/60">
            {active
              ? "Keep playback on this screen, then lock your phone if your browser allows background media."
              : "A calm player surface for locked-screen listening with standard HTML5 audio."}
          </p>
        </div>
        <button
          className={`grid h-12 w-16 place-items-center rounded-full transition ${active ? "bg-sky-400 text-black" : "bg-white/10"}`}
          onClick={onToggle}
          aria-label="Toggle Pocket Mode"
        >
          {active ? <Radio size={22} /> : <Moon size={22} />}
        </button>
      </div>
      {track && <p className="mt-4 truncate rounded-2xl bg-black/25 px-4 py-3 text-sm text-white/75">{track.title}</p>}
    </div>
  );
}
