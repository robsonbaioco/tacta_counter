import type { Planes } from './image';
import { rgbToHsv } from './color';

type RGB = [number, number, number];

export function rgbDist(p: Planes, i: number, rgb: RGB): number {
  const o = i * 4;
  return Math.max(Math.abs(p.rgba[o] - rgb[0]), Math.abs(p.rgba[o + 1] - rgb[1]), Math.abs(p.rgba[o + 2] - rgb[2]));
}

/**
 * Estimates the colour of the cards' "black" background as seen in this photo (often brownish or grey
 * under warm light): the most common dark colour right around white features (outlines, icons, dots),
 * since on a card every white mark is drawn on it. The table never touches white marks directly.
 */
export function estimateCardBackground(p: Planes, blobs: { x: number; y: number; r: number; area: number }[], maxVal: number): RGB {
  const hist = new Uint32Array(4096);
  const sums = new Float64Array(4096 * 3);
  for (const b of blobs) {
    if (b.area < 3) continue;
    for (const i of ringPixels(p, b.x, b.y, b.r + 1, b.r + 3)) {
      if (p.val[i] >= maxVal || p.val[i] < 15 || p.chroma[i] > 80) continue;
      const o = i * 4;
      const k = ((p.rgba[o] >> 4) << 8) | ((p.rgba[o + 1] >> 4) << 4) | (p.rgba[o + 2] >> 4);
      hist[k]++;
      sums[k * 3] += p.rgba[o];
      sums[k * 3 + 1] += p.rgba[o + 1];
      sums[k * 3 + 2] += p.rgba[o + 2];
    }
  }
  // Mode over 3x3x3 neighbourhoods of bins, to be robust to bin edges.
  let best = 0, bestK = 0;
  for (let k = 0; k < 4096; k++) {
    if (!hist[k]) continue;
    const r = k >> 8, g = (k >> 4) & 15, b = k & 15;
    let s = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dg = -1; dg <= 1; dg++) for (let db = -1; db <= 1; db++) {
      const rr = r + dr, gg = g + dg, bb = b + db;
      if (rr < 0 || gg < 0 || bb < 0 || rr > 15 || gg > 15 || bb > 15) continue;
      s += hist[(rr << 8) | (gg << 4) | bb];
    }
    if (s > best) { best = s; bestK = k; }
  }
  const n = hist[bestK] || 1;
  return [sums[bestK * 3] / n, sums[bestK * 3 + 1] / n, sums[bestK * 3 + 2] / n];
}

export interface RingStats {
  /** Fraction of ring samples that are coloured at all. */
  colored: number;
  /** Fraction of ring samples close to the ring's dominant colour. */
  uniform: number;
  /** Dominant ring colour (per-channel median of the coloured samples). */
  rgb: [number, number, number];
  hue: number;
  chroma: number;
  val: number;
  /** Distance of the dominant colour from the card background colour. */
  bgDist: number;
}

/** Per-photo colour references. */
export interface ColorContext {
  /** Card background colour (see estimateCardBackground). */
  bg: RGB;
  /** min(R,G,B) at or above which a pixel counts as white print. */
  white: number;
}

const MIN_CHROMA = 14;
const MIN_BG_DIST = 32;

function isColored(p: Planes, i: number, ctx: ColorContext): boolean {
  return (
    p.chroma[i] >= MIN_CHROMA && p.chroma[i] >= 0.08 * p.val[i] && p.white[i] < ctx.white && rgbDist(p, i, ctx.bg) >= MIN_BG_DIST
  );
}

/** Colour tolerance (max per-channel difference) for "same card colour". */
export function colorTolerance(rgb: [number, number, number]): number {
  return Math.max(30, 0.22 * Math.max(rgb[0], rgb[1], rgb[2]));
}

function close(p: Planes, i: number, rgb: [number, number, number], tol: number): boolean {
  const o = i * 4;
  return (
    Math.abs(p.rgba[o] - rgb[0]) <= tol && Math.abs(p.rgba[o + 1] - rgb[1]) <= tol && Math.abs(p.rgba[o + 2] - rgb[2]) <= tol
  );
}

function medianOf(xs: number[]): number {
  xs.sort((a, b) => a - b);
  return xs[xs.length >> 1];
}

/** Pixel indices on rings between radii r0..r1 around (cx, cy). */
export function ringPixels(p: Planes, cx: number, cy: number, r0: number, r1: number): number[] {
  const out: number[] = [];
  const steps = Math.max(2, Math.round(r1 - r0) + 1);
  for (let k = 0; k < steps; k++) {
    const rho = r0 + ((r1 - r0) * k) / (steps - 1);
    const n = Math.max(16, Math.round(2 * Math.PI * rho));
    for (let a = 0; a < n; a++) {
      const t = (2 * Math.PI * (a + 0.5 * k)) / n;
      const x = Math.round(cx + rho * Math.cos(t) - 0.5);
      const y = Math.round(cy + rho * Math.sin(t) - 0.5);
      if (x < 0 || y < 0 || x >= p.width || y >= p.height) continue;
      out.push(y * p.width + x);
    }
  }
  return out;
}

export function ringStats(p: Planes, ring: number[], ctx: ColorContext): RingStats {
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (const i of ring) {
    if (!isColored(p, i, ctx)) continue;
    rs.push(p.rgba[i * 4]);
    gs.push(p.rgba[i * 4 + 1]);
    bs.push(p.rgba[i * 4 + 2]);
  }
  const colored = ring.length ? rs.length / ring.length : 0;
  if (rs.length === 0) return { colored, uniform: 0, rgb: [0, 0, 0], hue: 0, chroma: 0, val: 0, bgDist: 0 };
  const rgb: RGB = [medianOf(rs), medianOf(gs), medianOf(bs)];
  const tol = colorTolerance(rgb);
  let near = 0;
  for (const i of ring) if (close(p, i, rgb, tol)) near++;
  const [hue, , val] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  const bgDist = Math.max(Math.abs(rgb[0] - ctx.bg[0]), Math.abs(rgb[1] - ctx.bg[1]), Math.abs(rgb[2] - ctx.bg[2]));
  return { colored, uniform: near / ring.length, rgb, hue, chroma: val - Math.min(...rgb), val, bgDist };
}

/**
 * Size of the connected area of (nearly) the ring's dominant colour around a dot: a "magic wand" fill
 * from the ring, capped. Real dots sit on large coloured areas; the white number or the orientation
 * marks around the centre icon only touch the icon's tiny fill.
 */
export class RegionMeter {
  private stamp: Int32Array;
  private id = 0;
  private queue: Int32Array;

  constructor(private p: Planes) {
    this.stamp = new Int32Array(p.width * p.height);
    this.queue = new Int32Array(p.width * p.height);
  }

  /** Returns the filled area (pixels, capped) and the farthest filled pixel's distance from (cx, cy). */
  measure(cx: number, cy: number, ring: number[], rgb: [number, number, number], cap: number): { area: number; extent: number } {
    const { p, stamp, queue } = this;
    const w = p.width, h = p.height;
    const id = ++this.id;
    const tol = colorTolerance(rgb);
    const ok = (i: number) => stamp[i] !== id && close(p, i, rgb, tol);
    let head = 0, tail = 0;
    for (const i of ring) {
      if (ok(i)) {
        stamp[i] = id;
        queue[tail++] = i;
      }
    }
    let far2 = 0;
    while (head < tail && tail < cap) {
      const i = queue[head++];
      const x = i % w;
      const y = (i - x) / w;
      const d2 = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
      if (d2 > far2) far2 = d2;
      if (x > 0 && ok(i - 1)) { stamp[i - 1] = id; queue[tail++] = i - 1; }
      if (x < w - 1 && ok(i + 1)) { stamp[i + 1] = id; queue[tail++] = i + 1; }
      if (y > 0 && ok(i - w)) { stamp[i - w] = id; queue[tail++] = i - w; }
      if (y < h - 1 && ok(i + w)) { stamp[i + w] = id; queue[tail++] = i + w; }
    }
    return { area: Math.min(tail, cap), extent: Math.sqrt(far2) };
  }
}
