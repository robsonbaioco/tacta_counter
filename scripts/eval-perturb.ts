// Checks that results are stable under small photometric changes (brightness, colour cast, noise),
// standing in for differences between JPEG decoders, cameras and lighting.
// Parte de `npm run eval:robust`: refaz a avaliação com a foto mais escura, mais clara, quente, fria e com
// ruído. COLORS! indica que o conjunto de cores mudou (o pior tipo de erro).
import { readFileSync } from 'node:fs';
import { readJpeg } from './nodeImage';
import { countDots } from '../src/cv';
import type { RGBAImage } from '../src/cv/types';

/** Cópia da imagem com ganho por canal e ruído pseudoaleatório (semente fixa: resultado reproduzível). */
function perturb(img: RGBAImage, gain: [number, number, number], noise: number, seed = 1): RGBAImage {
  let s = seed;
  // Gerador congruencial linear simples, de -1 a 1: com a mesma semente, o ruído é sempre o mesmo.
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 2;
  const out = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    for (let c = 0; c < 3; c++) out[i + c] = img.data[i + c] * gain[c] + noise * rnd();
    out[i + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}

const expected: Record<string, Record<string, number> | null> = JSON.parse(readFileSync('tests/fixtures/expected.json', 'utf8'));
const variants: [string, [number, number, number], number][] = [
  ['darker', [0.85, 0.85, 0.85], 0],
  ['brighter', [1.1, 1.1, 1.1], 0],
  ['warm', [1.06, 1, 0.9], 0],
  ['cool', [0.92, 1, 1.08], 0],
  ['noise', [1, 1, 1], 8],
];
for (const [name, gain, noise] of variants) {
  const parts: string[] = [];
  for (const [file, exp] of Object.entries(expected)) {
    const res = countDots(perturb(readJpeg('tests/fixtures/' + file), gain, noise));
    const got = Object.fromEntries(res.scores.map((s) => [s.color, s.score]));
    if (!exp) { parts.push(`glass ${JSON.stringify(got)}`); continue; }
    let err = 0;
    for (const n of new Set([...Object.keys(exp), ...Object.keys(got)])) err += Math.abs((exp[n] ?? 0) - (got[n] ?? 0));
    parts.push(`${file.slice(16, 22)} err=${err}${Object.keys(got).length !== Object.keys(exp).length ? ' COLORS!' : ''}`);
  }
  console.log(name.padEnd(9), parts.join(' | '));
}
