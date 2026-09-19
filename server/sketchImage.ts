import type { SketchImage } from "./levelFromSketch";

/** ~9 MB of decoded image. The client sends ~1600px JPEGs well under 1 MB. */
export const MAX_IMAGE_BASE64_CHARS = 12_000_000;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const DATA_URL = /^data:([\w/+.-]+);base64,/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export type ParsedImage = { ok: true; image: SketchImage } | { ok: false; error: string };

/** Accepts raw base64 or a data URL; defaults to JPEG when there's no prefix. */
export function parseSketchImage(input: string): ParsedImage {
  let data = input.trim();
  let mimeType = "image/jpeg";

  const prefix = DATA_URL.exec(data);
  if (prefix) {
    mimeType = prefix[1]!.toLowerCase();
    data = data.slice(prefix[0].length);
  }

  if (!ALLOWED_MIME.has(mimeType)) return { ok: false, error: `Unsupported image type ${mimeType}` };
  if (data.length > MAX_IMAGE_BASE64_CHARS) return { ok: false, error: "Image is too large" };
  if (data.length === 0 || !BASE64.test(data)) return { ok: false, error: "Image is not valid base64" };
  return { ok: true, image: { data, mimeType } };
}
