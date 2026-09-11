// Runs the full detector on every fixture and compares with tests/fixtures/expected.json.
import { readFileSync } from 'node:fs';
import { readJpeg } from './nodeImage';
import { detectCandidates } from '../src/cv/detect';
import { assignColors } from '../src/cv/palette';

const dir = 'tests/fixtures/';
const expected: Record<string, Record<string, number> | null> = JSON.parse(readFileSync(dir + 'expected.json', 'utf8'));
let totalErr = 0;
for (const [file, exp] of Object.entries(expected)) {
  const t = Date.now();
  const raw = detectCandidates(readJpeg(dir + file));
  const res = assignColors(raw);
  const ms = Date.now() - t;
  const got = Object.fromEntries(res.scores.map((s) => [s.color, s.score]));
  const clusters = res.clusters.map((c) => `${c.name}@${c.hue.toFixed(0)}`).join(' ');
  if (!exp) {
    console.log(`${file} (${ms}ms, r=${raw.dotRadius.toFixed(2)} bg=${raw.ctx.bg.map(Math.round)}) no ground truth: ${JSON.stringify(got)} [${clusters}]`);
    continue;
  }
  const names = new Set([...Object.keys(exp), ...Object.keys(got)]);
  let err = 0;
  const parts: string[] = [];
  for (const n of names) {
    const e = exp[n] ?? 0, g = got[n] ?? 0;
    err += Math.abs(e - g);
    parts.push(`${n} ${g}/${e}${g === e ? '' : ` (${g > e ? '+' : ''}${g - e})`}`);
  }
  totalErr += err;
  console.log(`${file} (${ms}ms, r=${raw.dotRadius.toFixed(2)} bg=${raw.ctx.bg.map(Math.round)}) err=${err}: ${parts.join(', ')} [${clusters}]`);
}
console.log('TOTAL ABS ERROR', totalErr);
