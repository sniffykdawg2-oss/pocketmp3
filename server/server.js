import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 10000);
const YT_DLP = process.env.YT_DLP_PATH || "yt-dlp";
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://sniffykdawg2-oss.github.io";
const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);

function isAllowedOrigin(origin = "") {
  if (!origin) return true;
  return ALLOWED_ORIGIN.split(",").map((item) => item.trim()).includes(origin);
}

function corsHeaders(origin) {
  const allowedOrigin = isAllowedOrigin(origin) ? origin || ALLOWED_ORIGIN.split(",")[0] : ALLOWED_ORIGIN.split(",")[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "Content-Disposition,X-Video-Title,X-Video-Creator,X-Video-Duration",
    "Vary": "Origin",
  };
}

function sendJson(res, status, body, origin) {
  res.writeHead(status, { "Content-Type": "application/json", ...corsHeaders(origin) });
  res.end(JSON.stringify(body));
}

function safeHeader(value = "") {
  return encodeURIComponent(String(value).slice(0, 180));
}

function isYouTubeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && youtubeHosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
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

function extractorArgs() {
  return ["--extractor-args", "youtube:player_client=default,-tv,web_safari,web_embedded"];
}

function youtubeDownloadArgs(url) {
  return [
    "--ignore-config",
    "--no-playlist",
    "-f",
    "bestaudio/best",
    "-x",
    "--audio-format",
    "mp3",
    "--ffmpeg-location",
    dirname(FFMPEG),
    ...extractorArgs(),
    "-o",
    "audio.%(ext)s",
    url,
  ];
}

async function normalizeMp3(input, output, cwd) {
  await runCommand(FFMPEG, ["-y", "-i", input, "-map", "0:a:0", "-codec:a", "libmp3lame", "-b:a", "192k", "-ar", "44100", "-write_xing", "1", output], cwd);
}

async function readAudioDuration(file, cwd) {
  try {
    const result = await runCommand(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], cwd);
    const duration = Number(result.stdout.trim());
    return Number.isFinite(duration) && duration > 0 ? duration : undefined;
  } catch {
    return undefined;
  }
}

async function convertYouTube(req, res) {
  const origin = req.headers.origin;
  let tempDir;

  if (!isAllowedOrigin(origin)) {
    sendJson(res, 403, { error: "Origin is not allowed." }, origin);
    return;
  }

  try {
    req.socket.setTimeout(20 * 60 * 1000);
    const body = await readJson(req);
    const url = String(body.url || "").trim();

    if (!isYouTubeUrl(url)) {
      sendJson(res, 400, { error: "Paste a valid YouTube link." }, origin);
      return;
    }

    tempDir = await mkdtemp(join(tmpdir(), "pocketmp3-"));
    let metadata = {};
    try {
      const info = await runCommand(YT_DLP, ["--ignore-config", "--dump-json", "--no-playlist", "--skip-download", ...extractorArgs(), url], tempDir);
      metadata = JSON.parse(info.stdout);
    } catch {
      metadata = {};
    }

    await runCommand(YT_DLP, youtubeDownloadArgs(url), tempDir);
    const files = await readdir(tempDir);
    const mp3File = files.find((file) => file.toLowerCase().endsWith(".mp3"));
    if (!mp3File) throw new Error("Conversion finished, but no MP3 file was created.");

    const sourceMp3 = join(tempDir, mp3File);
    const normalizedMp3 = join(tempDir, "pocketmp3-normalized.mp3");
    await normalizeMp3(sourceMp3, normalizedMp3, tempDir);
    const duration = await readAudioDuration(normalizedMp3, tempDir);
    const mp3 = await readFile(normalizedMp3);

    const title = metadata.title || mp3File.replace(/\.mp3$/i, "") || "YouTube audio";
    const uploader = metadata.uploader || metadata.channel || "";
    const filename = `${String(title).replace(/[\\/:*?"<>|]+/g, "").slice(0, 120) || "youtube-audio"}.mp3`;

    res.writeHead(200, {
      ...corsHeaders(origin),
      "Content-Type": "audio/mpeg",
      "Content-Length": mp3.length,
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "X-Video-Title": safeHeader(title),
      "X-Video-Creator": safeHeader(uploader),
      ...(duration ? { "X-Video-Duration": String(duration) } : {}),
    });
    res.end(mp3);
  } catch (error) {
    const message = error?.message || "Could not convert this YouTube link.";
    sendJson(res, 500, { error: message }, origin);
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  }
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true }, origin);
    return;
  }

  if (req.method === "POST" && req.url === "/api/convert-youtube") {
    await convertYouTube(req, res);
    return;
  }

  sendJson(res, 404, { error: "Not found." }, origin);
});

server.listen(PORT, () => {
  console.log(`PocketMP3 converter listening on ${PORT}`);
});
