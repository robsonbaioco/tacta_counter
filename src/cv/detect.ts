import type { RGBAImage } from './types';
import { computePlanes, limitSize, whiteBalance, type Planes } from './image';
import { findBrightBlobs, type Blob } from './blobs';
import { estimateCardBackground, ringPixels, ringStats, RegionMeter, type ColorContext, type RingStats } from './classify';

export const WORK_MAX_SIDE = 2400;

export interface Candidate extends Blob {
  ring: RingStats;
  /** Size of the same-colour area around the blob, in dot areas. */
  region: number;
  /** Farthest reach of that area from the blob centre, in dot radii. */
  extent: number;
  accepted: boolean;
  reason: string;
}

export interface RawDetection {
  image: RGBAImage;
  planes: Planes;
  dotRadius: number;
  ctx: ColorContext;
  candidates: Candidate[];
}

export const THRESHOLDS = {
  /** Blob brightness relative to the photo's typical dot brightness. */
  minPeak: 0.5,
  /** Blob brightness above the ring colour's darkest channel. */
  minContrast: 65,
  minColored: 0.4,
  minUniform: 0.4,
  /** Ring colours this close to the card background are "dull". */
  dullBgDist: 60,
  /** ...and so are low-chroma ones (glare makes the black card surface look light grey-brown). */
  dullChroma: 75,
  minUniformDull: 0.85,
  /** Minimum coloured area around a dot, in dot areas. */
  minRegion: 4,
  /** Minimum reach of that area from the dot centre, in dot radii. */
  minExtent: 4,
  /** Largest plausible card area of a greyish colour, in dot areas (larger ones are tables/objects). */
  maxDullRegion: 200,
  greyChroma: 45,
  regionCap: 400,
};

function isDull(ring: RingStats, chroma: number = THRESHOLDS.dullChroma): boolean {
  return ring.bgDist < THRESHOLDS.dullBgDist || ring.chroma < chroma;
}

function percentile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
}

function median(xs: number[]): number {
  return percentile(xs, 0.5);
}

function ringRadii(r: number): [number, number] {
  return [r + Math.max(1, 0.35 * r), r + Math.max(2, 0.9 * r)];
}

/** Finds white dots sitting on coloured card areas. Colours are assigned later (palette.ts). */
export function detectCandidates(input: RGBAImage): RawDetection {
  const image = whiteBalance(limitSize(input, WORK_MAX_SIDE));
  const planes = computePlanes(image);
  const scale = Math.max(image.width, image.height) / 1600;

  // Pass 1: generic parameters, used only to estimate the dot size in this photo.
  const blobs = findBrightBlobs(planes, {
    win: Math.round(10 * scale),
    delta: 25,
    minWhite: 100,
    maxArea: Math.round(600 * scale * scale),
  });
  const compact = blobs.filter((b) => b.area >= 3 && b.elong <= 1.8 && b.fill >= 0.5);
  // Dots and outlines are the brightest things around; texture specks are many but dimmer.
  const roughPeak = percentile(compact.map((b) => b.peak), 0.9) || 200;
  const ctx: ColorContext = {
    bg: estimateCardBackground(planes, blobs.filter((b) => b.peak >= 0.6 * roughPeak), 0.65 * roughPeak),
    white: 0.8 * roughPeak,
  };
  const sizes: number[] = [];
  const peaks: number[] = [];
  for (const b of compact) {
    if (b.peak < 0.6 * roughPeak) continue;
    const [r0, r1] = ringRadii(b.r);
    const ring = ringStats(planes, ringPixels(planes, b.x, b.y, r0, r1), ctx);
    if (ring.colored > 0.7 && ring.uniform > 0.7 && b.peak - Math.min(...ring.rgb) >= THRESHOLDS.minContrast) {
      sizes.push(b.r);
      peaks.push(b.peak);
    }
  }
  const dotRadius = median(sizes) || 2 * scale;
  const dotPeak = median(peaks) || 200;

  // On light colours (yellow) the loose threshold can merge a dot with a nearby white outline; a
  // stricter threshold separates them. Both sets are judged, duplicates removed at the end.
  const strict = findBrightBlobs(planes, {
    win: Math.round(10 * scale),
    delta: 50,
    minWhite: Math.round(0.8 * dotPeak),
    maxArea: Math.round(600 * scale * scale),
  });

  // Pass 2: judge every blob against the estimated dot size.
  const dotArea = Math.PI * dotRadius * dotRadius;
  const [r0, r1] = ringRadii(dotRadius);
  const meter = new RegionMeter(planes);
  const cap = Math.round(THRESHOLDS.regionCap * dotArea);
  const candidates: Candidate[] = [];
  for (const b of [...blobs, ...strict]) {
    if (b.area < 2 || b.r > dotRadius * 2.5) continue;
    const ringPx = ringPixels(planes, b.x, b.y, r0, r1);
    const ring = ringStats(planes, ringPx, ctx);
    const c: Candidate = { ...b, ring, region: 0, extent: 0, accepted: false, reason: '' };
    candidates.push(c);
    if (b.r < dotRadius * 0.55) c.reason = 'small';
    else if (b.r > dotRadius * 1.7) c.reason = 'big';
    else if (b.elong > 1.9) c.reason = 'elong';
    else if (b.fill < 0.45) c.reason = 'fill';
    else if (ring.colored < THRESHOLDS.minColored) c.reason = 'ring';
    // Printed dots stand out strongly from their colour (in its darkest channel); texture specks on
    // carpet or wood barely do. Absolute brightness is unreliable: JPEG colour bleed tints dots on yellow.
    else if (b.peak < THRESHOLDS.minPeak * dotPeak || b.peak - Math.min(...ring.rgb) < THRESHOLDS.minContrast)
      c.reason = 'dim';
    // Dull rings are ambiguous with the dark card background, so they must be much more uniform.
    else if (ring.uniform < (isDull(ring) ? THRESHOLDS.minUniformDull : THRESHOLDS.minUniform)) c.reason = 'uniform';
    else {
      const m = meter.measure(b.x, b.y, ringPx, ring.rgb, cap);
      c.region = m.area / dotArea;
      c.extent = m.extent / dotRadius;
      // The centre icon's fill hugs its white number (reach ~2-3 radii); a real dot's area always
      // extends further, even in the smallest one-dot triangles.
      if (c.region < THRESHOLDS.minRegion || c.extent < THRESHOLDS.minExtent) c.reason = 'region';
      // A dull colour spreading over a huge area is the table or some object, not a card area.
      // (Bright colours may legitimately leak, e.g. yellow cards into a wooden table.)
      else if (isDull(ring, THRESHOLDS.greyChroma) && c.region >= THRESHOLDS.maxDullRegion) c.reason = 'background';
      else {
        c.accepted = true;
        c.reason = 'ok';
      }
    }
  }
  suppressDuplicates(candidates, 2 * dotRadius);
  return { image, planes, dotRadius, ctx, candidates };
}

/** The same dot found by both thresholds: keep the rounder, better-filled detection. */
function suppressDuplicates(candidates: Candidate[], minDist: number): void {
  const acc = candidates.filter((c) => c.accepted).sort((a, b) => b.fill / b.elong - a.fill / a.elong);
  const kept: Candidate[] = [];
  for (const c of acc) {
    if (kept.some((k) => Math.hypot(k.x - c.x, k.y - c.y) < minDist)) {
      c.accepted = false;
      c.reason = 'duplicate';
    } else kept.push(c);
  }
}
