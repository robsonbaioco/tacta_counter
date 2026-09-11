import type { ColorName, DetectionResult, Dot } from './types';
import type { Candidate, RawDetection } from './detect';
import { circularMean, hueDist } from './color';

export interface PaletteEntry {
  label: string;
  /** Typical hue of the card colour in a white-balanced photo, degrees. */
  hue: number;
  /** How much that hue drifts between cameras/lighting, degrees (purple is rendered anywhere from violet to magenta). */
  spread: number;
  /** Display colour for the UI. */
  rgb: [number, number, number];
}

export const COLOR_ORDER: ColorName[] = ['laranja', 'amarelo', 'verde', 'azul', 'roxo', 'rosa'];

export const PALETTE: Record<ColorName, PaletteEntry> = {
  laranja: { label: 'Laranja', hue: 8, spread: 15, rgb: [236, 84, 50] },
  amarelo: { label: 'Amarelo', hue: 38, spread: 12, rgb: [245, 170, 40] },
  verde: { label: 'Verde', hue: 85, spread: 20, rgb: [110, 190, 70] },
  azul: { label: 'Azul', hue: 210, spread: 20, rgb: [80, 150, 230] },
  roxo: { label: 'Roxo', hue: 265, spread: 35, rgb: [130, 90, 210] },
  rosa: { label: 'Rosa', hue: 338, spread: 15, rgb: [235, 80, 160] },
};

export interface HueCluster {
  name: ColorName;
  hue: number;
  count: number;
}

const BIN_SIGMA = 5;

/** Smoothed circular histogram (1° bins). */
function hueHistogram(hues: number[], weights: number[]): Float64Array {
  const hist = new Float64Array(360);
  hues.forEach((h, k) => {
    for (let d = -3 * BIN_SIGMA; d <= 3 * BIN_SIGMA; d++) {
      hist[(Math.round(h) + d + 720) % 360] += weights[k] * Math.exp(-(d * d) / (2 * BIN_SIGMA * BIN_SIGMA));
    }
  });
  return hist;
}

/**
 * How much to trust a colour's hue. Washed-out colours (glare, weak purple) have hues that swing wildly
 * with small white-balance errors, so they barely influence which colours are present; they are only
 * attached to the nearest detected colour afterwards.
 */
function hueWeight(chroma: number): number {
  return Math.min(1, Math.max(0.05, (chroma - 20) / 60));
}

/** Peaks of the histogram; each peak owns the hues up to the neighbouring valleys. */
function findPeaks(hist: Float64Array, minMass: number): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < 360; i++) {
    const v = hist[i];
    if (v <= 0) continue;
    let isMax = true;
    for (let d = 1; d <= 6 && isMax; d++) {
      if (hist[(i + d) % 360] > v || hist[(i - d + 360) % 360] >= v) isMax = false;
    }
    if (isMax) peaks.push(i);
  }
  // Mass of each peak = sum of histogram until valleys (approximated by nearest-peak ownership).
  const mass = peaks.map(() => 0);
  for (let i = 0; i < 360; i++) {
    let best = -1, bd = 999;
    peaks.forEach((p, k) => {
      const d = hueDist(p, i);
      if (d < bd) { bd = d; best = k; }
    });
    if (best >= 0) mass[best] += hist[i];
  }
  const norm = Math.sqrt(2 * Math.PI) * BIN_SIGMA;
  return peaks.filter((_, k) => mass[k] / norm >= minMass);
}

/** Best injective assignment of peak hues to palette names (cost: hue offset in units of each colour's spread). */
function namePeaks(peaks: number[]): ColorName[] {
  let best: ColorName[] = [];
  let bestCost = Infinity;
  const used = new Set<ColorName>();
  const cur: ColorName[] = [];
  const rec = (k: number, cost: number) => {
    if (cost >= bestCost) return;
    if (k === peaks.length) {
      bestCost = cost;
      best = [...cur];
      return;
    }
    for (const name of COLOR_ORDER) {
      if (used.has(name)) continue;
      const d = hueDist(peaks[k], PALETTE[name].hue) / PALETTE[name].spread;
      used.add(name);
      cur.push(name);
      rec(k + 1, cost + d * d);
      cur.pop();
      used.delete(name);
    }
  };
  rec(0, 0);
  return best;
}

export interface ColoredDetection extends DetectionResult {
  clusters: HueCluster[];
}

export function scoresOf(dots: Dot[], colors: ColorName[]) {
  return colors
    .map((color) => ({ color, score: dots.filter((d) => d.color === color).length }))
    .sort((a, b) => b.score - a.score || COLOR_ORDER.indexOf(a.color) - COLOR_ORDER.indexOf(b.color));
}

/** A ring colour as a point on the chroma plane: angle = hue, radius = chroma. */
function planePoint(c: Candidate): [number, number] {
  const a = (c.ring.hue * Math.PI) / 180;
  return [c.ring.chroma * Math.cos(a), c.ring.chroma * Math.sin(a)];
}

function groupHue(g: Candidate[]): number {
  return circularMean(
    g.map((c) => c.ring.hue),
    g.map((c) => hueWeight(c.ring.chroma)),
  ).mean;
}

export interface SplitResult {
  accept: boolean;
  a: Candidate[];
  b: Candidate[];
  /** Distance between the two centres on the chroma plane / RMS spread inside the halves. */
  separation: number;
  /** Hue difference between the halves, degrees. */
  hueGap: number;
}

export const SPLIT = { minSize: 8, minSeparation: 3, minHueGap: 7, minChroma: 60, maxNameOffset: 2.2 };

/**
 * 2-means on the chroma plane. Accepted only for two well separated, sizeable halves whose hues also
 * differ: glare alone lowers chroma without shifting hue, so it must not create a fake extra colour.
 */
export function trySplit(g: Candidate[]): SplitResult {
  const none: SplitResult = { accept: false, a: g, b: [], separation: 0, hueGap: 0 };
  if (g.length < 2 * SPLIT.minSize) return none;
  const pts = g.map(planePoint);
  // Initialise along the principal axis.
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  let label = pts.map(([x, y]) => ((x - mx) * ux + (y - my) * uy > 0 ? 1 : 0));
  let ca: [number, number] = [0, 0], cb: [number, number] = [0, 0];
  for (let it = 0; it < 20; it++) {
    const acc = [[0, 0, 0], [0, 0, 0]];
    pts.forEach(([x, y], i) => {
      acc[label[i]][0] += x;
      acc[label[i]][1] += y;
      acc[label[i]][2]++;
    });
    if (!acc[0][2] || !acc[1][2]) return none;
    ca = [acc[0][0] / acc[0][2], acc[0][1] / acc[0][2]];
    cb = [acc[1][0] / acc[1][2], acc[1][1] / acc[1][2]];
    const next = pts.map(([x, y]) => ((x - ca[0]) ** 2 + (y - ca[1]) ** 2 <= (x - cb[0]) ** 2 + (y - cb[1]) ** 2 ? 0 : 1));
    if (next.every((l, i) => l === label[i])) break;
    label = next;
  }
  const a = g.filter((_, i) => label[i] === 0);
  const b = g.filter((_, i) => label[i] === 1);
  let sse = 0;
  pts.forEach(([x, y], i) => {
    const c = label[i] === 0 ? ca : cb;
    sse += (x - c[0]) ** 2 + (y - c[1]) ** 2;
  });
  const rms = Math.sqrt(sse / pts.length) || 1e-6;
  const separation = Math.hypot(ca[0] - cb[0], ca[1] - cb[1]) / rms;
  const hueGap = hueDist(groupHue(a), groupHue(b));
  const meanChroma = (h: Candidate[]) => h.reduce((s, c) => s + c.ring.chroma, 0) / h.length;
  const accept =
    Math.min(a.length, b.length) >= SPLIT.minSize &&
    separation >= SPLIT.minSeparation &&
    hueGap >= SPLIT.minHueGap &&
    // Hues of washed-out colours are unreliable; only split when both halves are clearly saturated.
    Math.min(meanChroma(a), meanChroma(b)) >= SPLIT.minChroma;
  return { accept, a, b, separation, hueGap };
}

/** Groups accepted dots by hue, decides which player colours are present and names them. */
export function assignColors(raw: RawDetection): ColoredDetection {
  const accepted = raw.candidates.filter((c) => c.accepted);
  const hues = accepted.map((c) => c.ring.hue);
  const weights = accepted.map((c) => hueWeight(c.ring.chroma));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const minMass = Math.max(4, totalWeight * 0.03);
  let peaks = findPeaks(hueHistogram(hues, weights), minMass);
  while (peaks.length > COLOR_ORDER.length) {
    // Merge the two closest peaks.
    const sorted = [...peaks].sort((a, b) => a - b);
    let bi = 0, bd = 999;
    for (let i = 0; i < sorted.length; i++) {
      const d = hueDist(sorted[i], sorted[(i + 1) % sorted.length]);
      if (d < bd) { bd = d; bi = i; }
    }
    sorted.splice(bi, 1);
    peaks = sorted;
  }
  // Group the dots by nearest hue peak, then split any group that is really two colours with close
  // hues but clearly different saturation (e.g. magenta-looking purple next to pink).
  let groups: Candidate[][] = peaks.map(() => []);
  for (const c of accepted) {
    let k = 0;
    for (let j = 1; j < peaks.length; j++) if (hueDist(c.ring.hue, peaks[j]) < hueDist(c.ring.hue, peaks[k])) k = j;
    groups[k].push(c);
  }
  groups = groups.filter((g) => g.length > 0);
  for (let k = 0; k < groups.length && groups.length < COLOR_ORDER.length; k++) {
    const split = trySplit(groups[k]);
    if (!split.accept) continue;
    const tentative = [...groups];
    tentative.splice(k, 1, split.a, split.b);
    // Both halves must look like actual Tacta colours (e.g. clipped highlights of red are not yellow).
    const hs = tentative.map(groupHue);
    const ns = namePeaks(hs);
    if (hs.every((h, i) => hueDist(h, PALETTE[ns[i]].hue) <= SPLIT.maxNameOffset * PALETTE[ns[i]].spread)) groups = tentative;
  }
  const groupHues = groups.map((g) => groupHue(g));
  const names = namePeaks(groupHues);
  const dots: Dot[] = [];
  groups.forEach((g, k) => {
    for (const c of g) dots.push({ x: c.x, y: c.y, r: c.r, color: names[k], confidence: Math.min(1, c.ring.colored * c.ring.uniform) });
  });
  const clusters = groups.map((g, k) => ({ name: names[k], hue: groupHues[k], count: g.length }));
  const colors = COLOR_ORDER.filter((n) => names.includes(n));
  return {
    width: raw.image.width,
    height: raw.image.height,
    dotRadius: raw.dotRadius,
    dots,
    colors,
    scores: scoresOf(dots, colors),
    clusters,
  };
}
