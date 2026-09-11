// Usage: tsx scripts/probe.ts <photo.jpg> x,y [x,y ...]   (working-resolution coordinates)
// Prints the detector features of the candidates nearest to each point.
import { readJpeg } from './nodeImage';
import { detectCandidates } from '../src/cv/detect';

const [, , file, ...pts] = process.argv;
const raw = detectCandidates(readJpeg(file));
console.log('dotRadius', raw.dotRadius.toFixed(2));
for (const pt of pts) {
  const [x, y] = pt.split(',').map(Number);
  const near = raw.candidates
    .map((c) => ({ c, d: Math.hypot(c.x - x, c.y - y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 2);
  for (const { c, d } of near) {
    const f = (v: number) => v.toFixed(2);
    console.log(
      `@${pt} d=${d.toFixed(1)} pos=${c.x.toFixed(1)},${c.y.toFixed(1)} ${c.reason} area=${c.area} r=${f(c.r)} el=${f(c.elong)} fill=${f(c.fill)} peak=${c.peak}` +
        ` ring: col=${f(c.ring.colored)} uni=${f(c.ring.uniform)} rgb=${c.ring.rgb} hue=${c.ring.hue.toFixed(0)} chroma=${c.ring.chroma.toFixed(0)} val=${c.ring.val.toFixed(0)} region=${f(c.region)}`,
    );
  }
}
