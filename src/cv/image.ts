import type { RGBAImage } from './types';
import { rgbToHsv } from './color';

/** Area-average downscale so the longest side is at most `maxSide`. Never upscales. */
export function limitSize(img: RGBAImage, maxSide: number): RGBAImage {
  const f = Math.max(img.width, img.height) / maxSide;
  if (f <= 1) return img;
  const w = Math.round(img.width / f);
  const h = Math.round(img.height / f);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * f);
    const y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((y + 1) * f)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * f);
      const x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((x + 1) * f)));
      let r = 0, g = 0, b = 0;
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * img.width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, i += 4) {
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const o = (y * w + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * White balance using the brightest near-neutral pixels (the white dots and outlines on the cards)
 * as the white reference. Returns a corrected copy.
 */
export function whiteBalance(img: RGBAImage): RGBAImage {
  const { data } = img;
  const n = img.width * img.height;
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    hist[Math.min(data[o], data[o + 1], data[o + 2])]++;
  }
  // Threshold = top 1% of min-channel brightness.
  let acc = 0;
  let t = 255;
  for (; t > 0; t--) {
    acc += hist[t];
    if (acc >= n * 0.01) break;
  }
  let sr = 0, sg = 0, sb = 0, cnt = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    if (Math.min(r, g, b) >= t && Math.max(r, g, b) < 255) {
      sr += r; sg += g; sb += b; cnt++;
    }
  }
  if (cnt < 50) return img;
  const mr = sr / cnt, mg = sg / cnt, mb = sb / cnt;
  const ref = Math.max(mr, mg, mb);
  const gr = ref / mr, gg = ref / mg, gb = ref / mb;
  const out = new Uint8ClampedArray(data.length);
  for (let o = 0; o < data.length; o += 4) {
    out[o] = data[o] * gr;
    out[o + 1] = data[o + 1] * gg;
    out[o + 2] = data[o + 2] * gb;
    out[o + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}

/** Per-pixel planes used by the detector. */
export interface Planes {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  /** min(R,G,B): high only for white/light-gray pixels. */
  white: Uint8Array;
  hue: Uint16Array;
  /** Chroma, max(R,G,B) - min(R,G,B): unlike HSV saturation it stays low on dark, tinted pixels. */
  chroma: Uint8Array;
  val: Uint8Array;
}

export function computePlanes(img: RGBAImage): Planes {
  const n = img.width * img.height;
  const white = new Uint8Array(n);
  const hue = new Uint16Array(n);
  const chroma = new Uint8Array(n);
  const val = new Uint8Array(n);
  const d = img.data;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = d[o], g = d[o + 1], b = d[o + 2];
    const [h, , v] = rgbToHsv(r, g, b);
    const mn = Math.min(r, g, b);
    white[i] = mn;
    hue[i] = Math.round(h) % 360;
    chroma[i] = v - mn;
    val[i] = v;
  }
  return { width: img.width, height: img.height, rgba: img.data, white, hue, chroma, val };
}

/** Mean over a (2r+1)x(2r+1) box for every pixel, via an integral image. */
export function boxMean(src: Uint8Array, w: number, h: number, r: number): Float32Array {
  const W = w + 1;
  const integral = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      integral[(y + 1) * W + x + 1] = integral[y * W + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0];
      out[y * w + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}
