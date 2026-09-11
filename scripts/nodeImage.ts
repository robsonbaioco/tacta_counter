// Node-only helpers to read/write images for tests and debugging.
import { readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import type { RGBAImage } from '../src/cv/types';

export function readJpeg(path: string): RGBAImage {
  const raw = jpeg.decode(readFileSync(path), { useTArray: true, formatAsRGBA: true });
  return { width: raw.width, height: raw.height, data: new Uint8ClampedArray(raw.data.buffer) };
}

export function writePng(path: string, img: RGBAImage): void {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  writeFileSync(path, PNG.sync.write(png));
}

/** Crop and nearest-neighbour upscale a region (for eyeballing small details). */
export function cropScale(img: RGBAImage, x0: number, y0: number, w: number, h: number, s: number): RGBAImage {
  const out = new Uint8ClampedArray(w * s * h * s * 4);
  for (let y = 0; y < h * s; y++) {
    for (let x = 0; x < w * s; x++) {
      const sx = Math.min(img.width - 1, x0 + Math.floor(x / s));
      const sy = Math.min(img.height - 1, y0 + Math.floor(y / s));
      const si = (sy * img.width + sx) * 4;
      const di = (y * w * s + x) * 4;
      out[di] = img.data[si];
      out[di + 1] = img.data[si + 1];
      out[di + 2] = img.data[si + 2];
      out[di + 3] = 255;
    }
  }
  return { width: w * s, height: h * s, data: out };
}
