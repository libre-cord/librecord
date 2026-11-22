import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const REMUX_TIMEOUT_MS = 15000;
const MAX_REMUX_BYTES = 512 * 1024 * 1024;
const WEBM_VIDEO_CODECS = new Set(["vp8", "vp9", "av1"]);

const run = (command: "ffmpeg" | "ffprobe", args: string[]) =>
    new Promise<{ ok: boolean; stdout: string }>((resolve) => {
        const binary = command === "ffprobe" ? process.env.FFPROBE_PATH || "ffprobe" : process.env.FFMPEG_PATH || "ffmpeg";
        const child = spawn(binary, args, { stdio: ["ignore", "pipe", "ignore"] });
        let stdout = "";
        child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
        const timer = setTimeout(() => child.kill("SIGKILL"), REMUX_TIMEOUT_MS);
        child.on("error", () => {
            clearTimeout(timer);
            resolve({ ok: false, stdout });
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({ ok: code === 0, stdout });
        });
    });

export async function remuxMatroska(source: Buffer): Promise<{ body: Buffer; extension: "webm" | "mp4"; mime: string } | undefined> {
    if (source.length > MAX_REMUX_BYTES || source.length < 12) return undefined;
    const directory = path.join(tmpdir(), `meowcord-remux-${randomUUID()}`);
    const input = path.join(directory, "input.mkv");
    await mkdir(directory, { recursive: true });
    try {
        await writeFile(input, source);
        const probe = await run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,codec_type", "-of", "compact=p=0:nk=1", input]);
        if (!probe.ok) return undefined;
        const codecs = probe.stdout
            .trim()
            .split("\n")
            .map((line) => line.split("|"))
            .filter((parts) => parts.length >= 2);
        if (!codecs.some(([, kind]) => kind === "video")) return undefined;
        const hasVideo = codecs.some(([, kind]) => kind === "video");
        if (!hasVideo) return undefined;
        const webm = codecs.some(([codec, kind]) => kind === "video" && WEBM_VIDEO_CODECS.has(codec));
        const extension: "webm" | "mp4" = webm ? "webm" : "mp4";
        const output = path.join(directory, `output.${extension}`);
        const result = await run("ffmpeg", ["-loglevel", "error", "-y", "-i", input, "-map", "0", "-c", "copy", "-f", extension, output]);
        if (!result.ok) return undefined;
        const body = await readFile(output);
        if (!body.length) return undefined;
        return { body, extension, mime: extension === "webm" ? "video/webm" : "video/mp4" };
    } catch {
        return undefined;
    } finally {
        await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
}
