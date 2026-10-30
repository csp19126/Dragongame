/**
 * Removes every metadata block (EXIF with GPS location, XMP, comments, text chunks, timestamps)
 * from a JPEG, PNG or WebP without touching the picture itself. The phone already re-encodes
 * photos through a canvas (which drops metadata); this is the server's guarantee on top.
 * Returns null when the file isn't a well-formed image of that type.
 */
export function stripImageMetadata(buf: Uint8Array, mime: string): Uint8Array | null {
  if (mime === "image/jpeg") return stripJpeg(buf);
  if (mime === "image/png") return stripPng(buf);
  if (mime === "image/webp") return stripWebp(buf);
  return null;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((t, p) => t + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function stripJpeg(b: Uint8Array): Uint8Array | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    let m = b[i + 1];
    // Fill bytes
    while (m === 0xff && i + 2 < b.length) { i++; m = b[i + 1]; }
    if (m === undefined) return null;
    if (m === 0xd9) { parts.push(b.subarray(i, i + 2)); return concat(parts); }
    // Markers without a length
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) { parts.push(b.subarray(i, i + 2)); i += 2; continue; }
    if (i + 4 > b.length) return null;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) return null;
    const seg = b.subarray(i, i + 2 + len);
    if (m === 0xda) {
      // Start of scan: the compressed picture runs to the end of the file
      parts.push(b.subarray(i));
      return concat(parts);
    }
    // APP1..APP15 (EXIF, XMP, ICC, maker notes…) and COM are dropped; APP0 (JFIF) and the codec's own segments stay
    const drop = (m >= 0xe1 && m <= 0xef) || m === 0xfe;
    if (!drop) parts.push(seg);
    i += 2 + len;
  }
  return null;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Chunks that describe the picture itself; everything else (eXIf, tEXt, zTXt, iTXt, tIME, …) goes */
const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "bKGD", "pHYs", "acTL", "fcTL", "fdAT"]);

function stripPng(b: Uint8Array): Uint8Array | null {
  if (b.length < 8 || !PNG_SIG.every((x, i) => b[i] === x)) return null;
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    const end = i + 12 + len;
    if (end > b.length) return null;
    if (PNG_KEEP.has(type)) parts.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") return concat(parts);
  }
  return null;
}

function stripWebp(b: Uint8Array): Uint8Array | null {
  const str = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (b.length < 12 || str(0) !== "RIFF" || str(8) !== "WEBP") return null;
  const parts: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const type = str(i);
    const len = b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | ((b[i + 7] << 24) >>> 0);
    const end = i + 8 + len + (len & 1);
    if (i + 8 + len > b.length) return null;
    if (type === "EXIF" || type === "XMP ") { i = end; continue; }
    const chunk = new Uint8Array(b.subarray(i, Math.min(end, b.length)));
    // VP8X flags: clear "has EXIF" (bit 3) and "has XMP" (bit 2)
    if (type === "VP8X" && chunk.length > 8) chunk[8] &= ~0x0c;
    parts.push(chunk);
    i = end;
  }
  const body = concat(parts);
  const head = new Uint8Array(12);
  head.set([0x52, 0x49, 0x46, 0x46], 0);
  const size = body.length + 4;
  head.set([size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >>> 24) & 0xff], 4);
  head.set([0x57, 0x45, 0x42, 0x50], 8);
  return concat([head, body]);
}
