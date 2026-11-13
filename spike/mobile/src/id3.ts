// A minimal ID3v2.3 writer on Uint8Array: runs on Hermes, in browsers and in
// Node alike (node-id3 needs Node's fs and Buffer, so it can't run here).

export type Tag = {
  title: string;
  artist: string;
  album: string;
  track: string; // "3/10"
  year?: string;
  genre?: string;
  coverJpeg?: Uint8Array;
};

function utf16(text: string): Uint8Array {
  const out = new Uint8Array(3 + text.length * 2);
  out[0] = 0x01; // UTF-16 with BOM, the Unicode encoding v2.3 has
  out[1] = 0xff;
  out[2] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out[3 + i * 2] = code & 0xff;
    out[4 + i * 2] = code >> 8;
  }
  return out;
}

function frame(id: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(10 + body.length);
  for (let i = 0; i < 4; i++) out[i] = id.charCodeAt(i);
  new DataView(out.buffer).setUint32(4, body.length); // plain size in v2.3
  out.set(body, 10);
  return out;
}

function picture(jpeg: Uint8Array): Uint8Array {
  const mime = "image/jpeg";
  const body = new Uint8Array(1 + mime.length + 1 + 1 + 1 + jpeg.length);
  let at = 0;
  body[at++] = 0x00; // ISO-8859-1 for the (empty) description
  for (let i = 0; i < mime.length; i++) body[at++] = mime.charCodeAt(i);
  body[at++] = 0x00;
  body[at++] = 0x03; // front cover
  body[at++] = 0x00; // empty description
  body.set(jpeg, at);
  return frame("APIC", body);
}

export function createTag(tag: Tag): Uint8Array {
  const frames = [
    frame("TIT2", utf16(tag.title)),
    frame("TPE1", utf16(tag.artist)),
    frame("TPE2", utf16(tag.artist)),
    frame("TALB", utf16(tag.album)),
    frame("TRCK", utf16(tag.track)),
  ];
  if (tag.year) frames.push(frame("TYER", utf16(tag.year)));
  if (tag.genre) frames.push(frame("TCON", utf16(tag.genre)));
  if (tag.coverJpeg) frames.push(picture(tag.coverJpeg));

  const size = frames.reduce((sum, f) => sum + f.length, 0);
  const out = new Uint8Array(10 + size);
  out.set([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]); // "ID3", v2.3.0, no flags
  out[6] = (size >> 21) & 0x7f; // sync-safe size
  out[7] = (size >> 14) & 0x7f;
  out[8] = (size >> 7) & 0x7f;
  out[9] = size & 0x7f;
  let at = 10;
  for (const f of frames) {
    out.set(f, at);
    at += f.length;
  }
  return out;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? "=" : ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? "=" : ALPHABET[c & 63];
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let at = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (ALPHABET.indexOf(clean[i]) << 18) |
      (ALPHABET.indexOf(clean[i + 1]) << 12) |
      ((ALPHABET.indexOf(clean[i + 2] ?? "A") & 63) << 6) |
      (ALPHABET.indexOf(clean[i + 3] ?? "A") & 63);
    out[at++] = n >> 16;
    if (at < out.length) out[at++] = (n >> 8) & 0xff;
    if (at < out.length) out[at++] = n & 0xff;
  }
  return out;
}
