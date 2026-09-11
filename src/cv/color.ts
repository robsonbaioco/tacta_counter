/** Hue in degrees [0,360), saturation [0,1], value [0,255]. */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

/** Smallest angular distance between two hues, in degrees [0,180]. */
export function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Weighted circular mean of hues; `R` in [0,1] measures how concentrated they are. */
export function circularMean(hues: ArrayLike<number>, weights?: ArrayLike<number>): { mean: number; R: number } {
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (let i = 0; i < hues.length; i++) {
    const w = weights ? weights[i] : 1;
    const a = (hues[i] * Math.PI) / 180;
    sx += Math.cos(a) * w;
    sy += Math.sin(a) * w;
    sw += w;
  }
  if (sw === 0) return { mean: 0, R: 0 };
  let mean = (Math.atan2(sy, sx) * 180) / Math.PI;
  if (mean < 0) mean += 360;
  return { mean, R: Math.hypot(sx, sy) / sw };
}
