// Re-runs the evaluation with inputs resampled by several factors, to check that the detector's
// parameters really adapt to the photo resolution.
import { readFileSync } from 'node:fs';
import { readJpeg } from './nodeImage';
import { detectCandidates } from '../src/cv/detect';
import { assignColors } from '../src/cv/palette';
import type { RGBAImage } from '../src/cv/types';

function resample(img: RGBAImage, f: number): RGBAImage {
  const w = Math.round(img.width * f), h = Math.round(img.height * f);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(img.width - 1.001, Math.max(0, (x + 0.5) / f - 0.5));
    const sy = Math.min(img.height - 1.001, Math.max(0, (y + 0.5) / f - 0.5));
    const x0 = Math.floor(sx), y0 = Math.floor(sy), ax = sx - x0, ay = sy - y0;
    for (let c = 0; c < 3; c++) {
      const g = (xx: number, yy: number) => img.data[(yy * img.width + xx) * 4 + c];
      out[(y * w + x) * 4 + c] = (g(x0, y0) * (1 - ax) + g(x0 + 1, y0) * ax) * (1 - ay) + (g(x0, y0 + 1) * (1 - ax) + g(x0 + 1, y0 + 1) * ax) * ay;
    }
    out[(y * w + x) * 4 + 3] = 255;
  }
  return { width: w, height: h, data: out };
}

const expected: Record<string, Record<string, number> | null> = JSON.parse(readFileSync('tests/fixtures/expected.json', 'utf8'));
for (const f of [0.75, 1.5, 2.5]) {
  let total = 0;
  const parts: string[] = [];
  for (const [file, exp] of Object.entries(expected)) {
    if (!exp) continue;
    const res = assignColors(detectCandidates(resample(readJpeg('tests/fixtures/' + file), f)));
    const got = Object.fromEntries(res.scores.map((s) => [s.color, s.score]));
    let err = 0;
    for (const n of new Set([...Object.keys(exp), ...Object.keys(got)])) err += Math.abs((exp[n] ?? 0) - (got[n] ?? 0));
    total += err;
    parts.push(`${file.slice(5, 22)} err=${err} ${JSON.stringify(got)}`);
  }
  console.log(`scale ${f}: total=${total}\n  ${parts.join('\n  ')}`);
}
