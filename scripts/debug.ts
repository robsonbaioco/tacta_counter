// Usage: tsx scripts/debug.ts <photo.jpg> <out.png> [x y w h scale]
// Renders the detector's view: accepted dots (thick circle, in the assigned colour) and rejected
// candidates (thin circle, grey = shape, dark red = ring/hue, cyan = region). Coordinates are in the
// working-resolution image.
import { readJpeg, writePng, cropScale } from './nodeImage';
import { detectCandidates } from '../src/cv/detect';
import { assignColors, PALETTE } from '../src/cv/palette';
import type { RGBAImage } from '../src/cv/types';

const [, , file, out, ...rest] = process.argv;
const raw = detectCandidates(readJpeg(file));
const { image, candidates, dotRadius } = raw;
const result = assignColors(raw);
const [x0, y0, w, h, s] = rest.length ? rest.map(Number) : [0, 0, image.width, image.height, 1];

const counts: Record<string, number> = {};
for (const c of candidates) counts[c.reason] = (counts[c.reason] ?? 0) + 1;
console.log(`image ${image.width}x${image.height}  dotRadius=${dotRadius.toFixed(2)}  candidates=${candidates.length}`);
console.log('reasons', counts);
console.log('clusters', result.clusters.map((c) => `${c.name}:${c.hue.toFixed(0)}°(n=${c.count})`).join('  '));
console.log('scores', result.scores.map((e) => `${e.color}=${e.score}`).join('  '));

const view = cropScale(image, x0, y0, w, h, s);

function circle(img: RGBAImage, cx: number, cy: number, r: number, rgb: number[], thick: number) {
  for (let y = Math.floor(cy - r - thick); y <= cy + r + thick; y++) {
    for (let x = Math.floor(cx - r - thick); x <= cx + r + thick; x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (Math.abs(d - r) <= thick / 2) {
        const i = (y * img.width + x) * 4;
        img.data[i] = rgb[0];
        img.data[i + 1] = rgb[1];
        img.data[i + 2] = rgb[2];
      }
    }
  }
}

const dotColor = new Map(result.dots.map((d) => [`${d.x},${d.y}`, PALETTE[d.color].rgb]));
for (const c of candidates) {
  const cx = (c.x - x0) * s, cy = (c.y - y0) * s;
  if (cx < -20 || cy < -20 || cx > view.width + 20 || cy > view.height + 20) continue;
  const r = Math.max(c.r * s + 2 * s, 4);
  if (c.accepted) {
    circle(view, cx, cy, r + s, [0, 0, 0], Math.max(3, s));
    circle(view, cx, cy, r, dotColor.get(`${c.x},${c.y}`) ?? [255, 255, 255], Math.max(2, s * 0.8));
  } else if (c.reason === 'region') circle(view, cx, cy, r, [0, 255, 255], Math.max(1, s * 0.4));
  else if (c.reason === 'ring' || c.reason === 'uniform') circle(view, cx, cy, r, [160, 0, 0], Math.max(1, s * 0.3));
  else if (c.r >= dotRadius * 0.5) circle(view, cx, cy, r, [128, 128, 128], Math.max(1, s * 0.3));
}
writePng(out, view);
