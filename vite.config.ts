// @ts-nocheck
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);

function isYouTubeUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && youtubeHosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function safeHeader(value = "") {
  return encodeURIComponent(value.slice(0, 180));
}

function firstExisting(paths) {
  return paths.find((path) => path && existsSync(path));
}

function newestCellarBinary(formula, binary) {
  const cellar = `/opt/homebrew/Cellar/${formula}`;
  if (!existsSync(cellar)) return undefined;
  const versions = readdirSync(cellar).sort().reverse();
  return firstExisting(versions.map((version) => join(cellar, version, "bin", binary)));
}

function resolveCommand(command) {
  const home = process.env.HOME || "";
  const common = [
    join(process.cwd(), ".tools", command),
    `/opt/homebrew/bin/${command}`,
    `/usr/local/bin/${command}`,
    `/usr/bin/${command}`,
    `/bin/${command}`,
  ];
  const extra =
    command === "yt-dlp"
      ? [
          `${home}/Library/Python/3.13/bin/yt-dlp`,
          `${home}/Library/Python/3.12/bin/yt-dlp`,
          `${home}/Library/Python/3.11/bin/yt-dlp`,
          `${home}/Library/Python/3.10/bin/yt-dlp`,
          `${home}/Library/Python/3.9/bin/yt-dlp`,
          `${home}/.local/bin/yt-dlp`,
          newestCellarBinary("yt-dlp", "yt-dlp"),
        ]
      : command === "ffmpeg"
        ? [newestCellarBinary("ffmpeg", "ffmpeg")]
        : command === "ffprobe"
          ? [newestCellarBinary("ffmpeg", "ffprobe")]
        : [];

  return firstExisting([...common, ...extra]) || command;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function runCommand(command, args, cwd) {
  return new Promise(async (resolve, reject) => {
    const { spawn } = await import("node:child_process");
    const commonPath = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].join(":");
    const child = spawn(resolveCommand(command), args, {
      cwd,
      env: { ...process.env, PATH: `${process.env.PATH || ""}:${commonPath}` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

function youtubeDownloadArgs(url, tempDir) {
  return [
    "--ignore-config",
    "--no-playlist",
    "-f",
    "bestaudio/best",
    "-x",
    "--audio-format",
    "mp3",
    "--ffmpeg-location",
    dirname(resolveCommand("ffmpeg")),
    "--extractor-args",
    "youtube:player_client=default,-tv,web_safari,web_embedded",
    "-o",
    "audio.%(ext)s",
    url,
  ];
}

async function normalizeMp3(input, output, cwd) {
  await runCommand(
    "ffmpeg",
    ["-y", "-i", input, "-map", "0:a:0", "-codec:a", "libmp3lame", "-b:a", "192k", "-ar", "44100", "-write_xing", "1", output],
    cwd,
  );
}

async function readAudioDuration(file, cwd) {
  try {
    const result = await runCommand("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], cwd);
    const duration = Number(result.stdout.trim());
    return Number.isFinite(duration) && duration > 0 ? duration : undefined;
  } catch {
    return undefined;
  }
}

function youtubeConverterPlugin() {
  function attachConverter(server) {
    server.middlewares.use("/api/convert-youtube", async (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405, { Allow: "POST" });
        res.end("Method not allowed");
        return;
      }

      let tempDir;
      try {
        req.socket.setTimeout(20 * 60 * 1000);
        const [{ mkdtemp, readFile, rm, readdir }, { join }, { tmpdir }] = await Promise.all([
          import("node:fs/promises"),
          import("node:path"),
          import("node:os"),
        ]);
        const body = await readBody(req);
        const url = String(body.url || "").trim();

        if (!isYouTubeUrl(url)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Paste a valid YouTube link." }));
          return;
        }

        tempDir = await mkdtemp(join(tmpdir(), "pocketmp3-"));
        let metadata = {};
        try {
          const info = await runCommand("yt-dlp", ["--ignore-config", "--dump-json", "--no-playlist", "--skip-download", "--extractor-args", "youtube:player_client=default,-tv,web_safari,web_embedded", url], tempDir);
          metadata = JSON.parse(info.stdout);
        } catch {
          metadata = {};
        }

        await runCommand("yt-dlp", youtubeDownloadArgs(url, tempDir), tempDir);
        const files = await readdir(tempDir);
        const mp3File = files.find((file) => file.toLowerCase().endsWith(".mp3"));
        if (!mp3File) throw new Error("Conversion finished, but no MP3 file was created. Check that ffmpeg is installed.");

        const sourceMp3 = join(tempDir, mp3File);
        const normalizedMp3 = join(tempDir, "pocketmp3-normalized.mp3");
        await normalizeMp3(sourceMp3, normalizedMp3, tempDir);
        const duration = await readAudioDuration(normalizedMp3, tempDir);
        const mp3 = await readFile(normalizedMp3);
        const title = metadata.title || mp3File.replace(/\.mp3$/i, "") || "YouTube audio";
        const uploader = metadata.uploader || metadata.channel || "";
        const filename = `${String(title).replace(/[\\/:*?"<>|]+/g, "").slice(0, 120) || "youtube-audio"}.mp3`;

        res.writeHead(200, {
          "Content-Type": "audio/mpeg",
          "Content-Length": mp3.length,
            "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
            "X-Video-Title": safeHeader(title),
            "X-Video-Creator": safeHeader(uploader),
            ...(duration ? { "X-Video-Duration": String(duration) } : {}),
          });
        res.end(mp3);
        await rm(tempDir, { recursive: true, force: true });
        tempDir = undefined;
      } catch (error) {
        if (tempDir) {
          const { rm } = await import("node:fs/promises");
          await rm(tempDir, { recursive: true, force: true });
        }
        const message = error?.code === "ENOENT" ? "yt-dlp or ffmpeg was not found on PATH." : error?.message || "Could not convert this YouTube link.";
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: message }));
      }
    });
  }

  return {
    name: "pocketmp3-youtube-converter",
    configureServer(server) {
      attachConverter(server);
    },
    configurePreviewServer(server) {
      attachConverter(server);
    },
  };
}

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: new URL("./index.vite.html", import.meta.url).pathname,
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  plugins: [react(), youtubeConverterPlugin()],
});
