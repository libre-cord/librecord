import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { remuxMatroska } from "../../src/util/util/VideoRemux.ts";

const ffmpeg = (args: string[]) => {
    const result = spawnSync("ffmpeg", args, { stdio: "ignore" });
    assert.equal(result.status, 0, "ffmpeg command failed");
};

test("remuxes H264 MKV to MP4 and VP9 MKV to WebM without re-encoding", async (t) => {
    const dir = await mkdtemp(path.join(tmpdir(), "meowcord-remux-test-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const h264 = path.join(dir, "h264.mkv");
    const vp9 = path.join(dir, "vp9.mkv");
    ffmpeg([
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=160x90:rate=5",
        "-frames:v",
        "10",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "ultrafast",
        "-f",
        "matroska",
        "-y",
        h264,
    ]);
    ffmpeg([
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=160x90:rate=5",
        "-frames:v",
        "10",
        "-c:v",
        "libvpx-vp9",
        "-b:v",
        "100k",
        "-f",
        "matroska",
        "-y",
        vp9,
    ]);

    const mp4 = await remuxMatroska(await readFile(h264));
    assert.ok(mp4);
    assert.equal(mp4.extension, "mp4");
    assert.equal(mp4.mime, "video/mp4");
    assert.equal(mp4.body.subarray(4, 8).toString("ascii"), "ftyp");

    const webm = await remuxMatroska(await readFile(vp9));
    assert.ok(webm);
    assert.equal(webm.extension, "webm");
    assert.equal(webm.mime, "video/webm");
    assert.equal(webm.body.subarray(0, 4).toString("hex"), "1a45dfa3");
});

test("remuxes H264 with Vorbis audio to MP4", async (t) => {
    const dir = await mkdtemp(path.join(tmpdir(), "meowcord-remux-test-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const file = path.join(dir, "h264-vorbis.mkv");
    ffmpeg([
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=160x90:rate=5",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000",
        "-frames:v",
        "10",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "ultrafast",
        "-c:a",
        "libvorbis",
        "-f",
        "matroska",
        "-y",
        file,
    ]);
    const out = await remuxMatroska(await readFile(file));
    assert.ok(out);
    assert.equal(out.extension, "mp4");
    assert.equal(out.mime, "video/mp4");
});

test("leaves non-MKV buffers alone", async () => {
    assert.equal(await remuxMatroska(Buffer.from("not a video")), undefined);
});
