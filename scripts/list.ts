// Usage: tsx scripts/list.ts <photo> <jsExpr on c>   e.g. "c.extent>=4 && c.extent<6 && c.region<10"
import { readJpeg } from './nodeImage';
import { detectCandidates } from '../src/cv/detect';
const [, , file, expr] = process.argv;
const raw = detectCandidates(readJpeg(file));
const pred = new Function('c', `return ${expr};`) as (c: unknown) => boolean;
for (const c of raw.candidates.filter(pred))
  console.log(`${c.x.toFixed(0)},${c.y.toFixed(0)} ${c.reason} r=${c.r.toFixed(2)} region=${c.region.toFixed(1)} extent=${c.extent.toFixed(1)} uni=${c.ring.uniform.toFixed(2)} peak=${c.peak} el=${c.elong.toFixed(2)} fill=${c.fill.toFixed(2)} area=${c.area} rgb=${c.ring.rgb}`);
