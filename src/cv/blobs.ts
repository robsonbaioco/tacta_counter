import type { Planes } from './image';
import { boxMean } from './image';

export interface Blob {
  x: number;
  y: number;
  area: number;
  /** Radius of a disc with the same area. */
  r: number;
  /** sqrt(major/minor) eigenvalue ratio of the pixel covariance; 1 for a disc. */
  elong: number;
  /** area / bounding-box area; ~0.7-0.8 for a small disc. */
  fill: number;
  /** Brightest min-channel value inside the blob. */
  peak: number;
}

export interface BlobParams {
  /** Half-size of the local-mean window. */
  win: number;
  /** How much brighter than the local mean a pixel must be. */
  delta: number;
  /** Absolute minimum whiteness. */
  minWhite: number;
  maxArea: number;
}

/** Finds compact bright spots (candidate dots) with local adaptive thresholding + 8-connected labelling. */
export function findBrightBlobs(p: Planes, params: BlobParams): Blob[] {
  const { width: w, height: h, white } = p;
  const mean = boxMean(white, w, h, params.win);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (white[i] >= params.minWhite && white[i] > mean[i] + params.delta) mask[i] = 1;
  }
  const blobs: Blob[] = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (mask[start] !== 1) continue;
    let sp = 0;
    stack[sp++] = start;
    mask[start] = 2;
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, peak = 0;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    let tooBig = false;
    while (sp > 0) {
      const i = stack[--sp];
      const x = i % w;
      const y = (i - x) / w;
      n++;
      if (n > params.maxArea) tooBig = true;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      if (white[i] > peak) peak = white[i];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (mask[j] === 1) {
            mask[j] = 2;
            stack[sp++] = j;
          }
        }
      }
    }
    if (tooBig) continue;
    const cx = sx / n, cy = sy / n;
    const vxx = sxx / n - cx * cx + 1 / 12;
    const vyy = syy / n - cy * cy + 1 / 12;
    const vxy = sxy / n - cx * cy;
    const tr = vxx + vyy;
    const det = vxx * vyy - vxy * vxy;
    const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    const l1 = tr / 2 + disc;
    const l2 = Math.max(1e-6, tr / 2 - disc);
    blobs.push({
      x: cx + 0.5,
      y: cy + 0.5,
      area: n,
      r: Math.sqrt(n / Math.PI),
      elong: Math.sqrt(l1 / l2),
      fill: n / ((maxX - minX + 1) * (maxY - minY + 1)),
      peak,
    });
  }
  return blobs;
}
