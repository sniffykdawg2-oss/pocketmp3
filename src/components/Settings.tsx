import { Download, HardDrive, Shield, Trash2, Upload } from "lucide-react";
import type { Accent, MetadataExport, Settings as SettingsType, Track } from "../lib/types";
import { estimateStorage, formatBytes, requestPersistentStorage } from "../lib/storage";

interface SettingsProps {
  tracks: Track[];
  settings: SettingsType;
  onSettings: (settings: SettingsType) => void;
  onClear: () => void;
  onExport: () => void;
  onImport: (data: MetadataExport) => void;
  onError: (message: string) => void;
}

export default function Settings({ tracks, settings, onSettings, onClear, onExport, onImport, onError }: SettingsProps) {
  const canPersistStorage = Boolean(navigator.storage && "persist" in navigator.storage);
  const storageLabel = canPersistStorage ? "Request persistent storage" : "Persistent storage unavailable";
  const accentSwatches: Record<Accent, string> = {
    blue: "bg-sky-400",
    purple: "bg-fuchsia-400",
    green: "bg-emerald-400",
    red: "bg-rose-400",
  };

  async function importFile(file?: File) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as MetadataExport;
      if (!Array.isArray(data.tracks) || !Array.isArray(data.playlists)) throw new Error("Invalid metadata");
      onImport(data);
    } catch {
      onError("That metadata file could not be imported.");
    }
  }

  return (
    <section className="page-enter space-y-5 pb-32">
      <div>
        <h1 className="text-3xl font-black">Settings</h1>
        <p className="mt-2 text-sm text-white/55">Private, local, and tuned for your phone.</p>
      </div>

      <div className="glass rounded-3xl p-5">
        <div className="flex items-center gap-3">
          <Shield className="text-emerald-300" />
          <div>
            <h2 className="font-black">Privacy</h2>
            <p className="text-sm text-white/55">Your files stay on this device.</p>
          </div>
        </div>
        <button
          className="mt-4 h-11 w-full rounded-2xl bg-white/10 font-bold"
          onClick={async () => {
            const granted = await requestPersistentStorage();
            onError(granted ? "Persistent storage is enabled for PocketMP3 on this device." : "This browser did not grant persistent storage.");
          }}
          disabled={!canPersistStorage}
        >
          {storageLabel}
        </button>
      </div>

      <div className="glass rounded-3xl p-5">
        <div className="flex items-center gap-3">
          <HardDrive className="accent-text" />
          <div>
            <h2 className="font-black">Storage</h2>
            <p className="text-sm text-white/55">{formatBytes(estimateStorage(tracks))} estimated local media storage</p>
          </div>
        </div>
      </div>

      <div className="glass space-y-4 rounded-3xl p-5">
        <h2 className="font-black">Appearance</h2>
        <label className="flex h-12 items-center justify-between rounded-2xl bg-black/25 px-4">
          <span className="font-bold">Compact mode</span>
          <input type="checkbox" checked={settings.compactMode} onChange={(e) => onSettings({ ...settings, compactMode: e.target.checked })} />
        </label>
        <div className="grid grid-cols-4 gap-2">
          {(["blue", "purple", "green", "red"] as Accent[]).map((accent) => (
            <button
              key={accent}
              className={`flex h-11 items-center justify-center gap-2 rounded-2xl font-bold capitalize ${settings.accent === accent ? "accent-bg" : "bg-white/10"}`}
              onClick={() => onSettings({ ...settings, accent })}
            >
              <span className={`h-3 w-3 rounded-full ${accentSwatches[accent]}`} />
              {accent}
            </button>
          ))}
        </div>
      </div>

      <div className="glass space-y-3 rounded-3xl p-5">
        <h2 className="font-black">Metadata</h2>
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 font-bold" onClick={onExport}>
          <Download size={18} /> Export metadata JSON
        </button>
        <label className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white/10 font-bold">
          <Upload size={18} /> Import metadata JSON
          <input className="hidden" type="file" accept="application/json" onChange={(e) => importFile(e.target.files?.[0])} />
        </label>
      </div>

      <div className="glass rounded-3xl p-5">
        <h2 className="font-black">YouTube links</h2>
        <p className="mt-2 text-sm leading-6 text-white/55">
          YouTube items are saved as references and cannot be played locally unless you upload a file you own. Platform rules and browser limits control what can be downloaded or played in the background.
        </p>
      </div>

      <button className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-red-500/15 font-black text-red-100" onClick={onClear}>
        <Trash2 size={19} /> Clear all local data
      </button>
    </section>
  );
}
