import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { autoOrientImage } from "../../src/cdn/util/imageOrientation.ts";

const makeTagged = async (orientation: number) => {
    const base = await sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 255, g: 0, b: 0 } } })
        .jpeg()
        .toBuffer();
    return sharp(base).withMetadata({ orientation }).jpeg().toBuffer();
};

test("autoOrientImage bakes orientation into the pixels so it survives EXIF stripping", async () => {
    const tagged = await makeTagged(6);
    const before = await sharp(tagged).metadata();
    assert.equal(before.orientation, 6);
    assert.equal(before.width, 40);
    assert.equal(before.height, 20);

    const oriented = await autoOrientImage(tagged, "image/jpeg");
    const after = await sharp(oriented).metadata();
    assert.equal(after.width, 20);
    assert.equal(after.height, 40);
    assert.notEqual(after.orientation, 6);

    const exifStripped = await sharp(oriented).withMetadata({}).jpeg().toBuffer();
    const final = await sharp(exifStripped).metadata();
    assert.equal(final.width, 20);
    assert.equal(final.height, 40);
});

test("autoOrientImage leaves upright and non-image buffers unchanged", async () => {
    const upright = await makeTagged(1);
    assert.deepEqual(await autoOrientImage(upright, "image/jpeg"), upright);
    const other = Buffer.from("not an image");
    assert.deepEqual(await autoOrientImage(other), other);
});
