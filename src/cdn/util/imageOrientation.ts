import { isAnimatedImage } from "./imageVariants";

type SharpImage = {
    metadata(): Promise<{ orientation?: number }>;
    rotate(): SharpImage;
    toBuffer(): Promise<Buffer>;
};
type SharpFactory = (input?: Buffer, options?: object) => SharpImage;

let sharpFactory: Promise<SharpFactory | null> | undefined;
const loadSharp = () =>
    (sharpFactory ??= import("sharp").then(
        (module) => (module.default ?? module) as unknown as SharpFactory,
        () => null,
    ));

const hasImageHeader = (buffer: Buffer) => {
    if (buffer.length < 12) return false;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
    if (buffer.toString("latin1", 1, 4) === "PNG") return true;
    return buffer.toString("latin1", 0, 4) === "RIFF" && buffer.toString("latin1", 8, 12) === "WEBP";
};

export async function autoOrientImage(buffer: Buffer, mime?: string): Promise<Buffer> {
    if (!hasImageHeader(buffer)) return buffer;
    if (mime && isAnimatedImage(buffer, mime)) return buffer;
    const sharp = await loadSharp();
    if (!sharp) return buffer;
    try {
        const image = sharp(buffer);
        const { orientation } = await image.metadata();
        if (typeof orientation !== "number" || orientation <= 1) return buffer;
        return await image.rotate().toBuffer();
    } catch {
        return buffer;
    }
}
