// A tiny PNG encoder. Node has zlib, so a valid PNG is just three chunks and
// a CRC — no image library needed. Used for the agents' Discord avatars.
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Buffer|Uint8Array} rgba width*height*4 bytes
 * @returns {Buffer} a complete PNG file
 */
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Each scanline is prefixed with its filter type (0 = none).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer ?? rgba, rgba.byteOffset ?? 0, rgba.length).copy(
      raw,
      y * (stride + 1) + 1,
      y * stride,
      y * stride + stride
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A little pixel canvas that can only fill rectangles. That is all we need. */
export class Pixels {
  constructor(width, height, background = [0, 0, 0, 0]) {
    this.w = width;
    this.h = height;
    this.data = Buffer.alloc(width * height * 4);
    this.fill(0, 0, width, height, background);
  }

  fill(x, y, w, h, colour) {
    const [r, g, b, a = 255] = colour;
    for (let py = Math.max(0, y | 0); py < Math.min(this.h, (y + h) | 0); py++) {
      for (let px = Math.max(0, x | 0); px < Math.min(this.w, (x + w) | 0); px++) {
        const i = (py * this.w + px) * 4;
        this.data[i] = r;
        this.data[i + 1] = g;
        this.data[i + 2] = b;
        this.data[i + 3] = a;
      }
    }
    return this;
  }

  /** Draw a scaled-up pixel grid: rows of characters mapped to colours. */
  stamp(rows, palette, originX, originY, scale) {
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const colour = palette[ch];
        if (!colour) return;
        this.fill(originX + x * scale, originY + y * scale, scale, scale, colour);
      });
    });
    return this;
  }

  toPng() {
    return encodePng(this.w, this.h, this.data);
  }
}

export default encodePng;
