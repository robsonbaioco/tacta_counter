// End-to-end check of the detector on real end-of-game photos, against scores counted by hand.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readJpeg } from '../scripts/nodeImage';
import { countDots } from '../src/cv';

const dir = 'tests/fixtures/';
const expected: Record<string, Record<string, number> | null> = JSON.parse(readFileSync(dir + 'expected.json', 'utf8'));

/** Max allowed difference per colour. The ground truth is itself a manual count of small dots. */
const TOLERANCE = 3;

describe('countDots on real photos', () => {
  for (const [file, exp] of Object.entries(expected)) {
    if (!exp) continue;
    it(`${file}: finds the same colours and scores within ±${TOLERANCE}`, () => {
      const res = countDots(readJpeg(dir + file));
      const got = Object.fromEntries(res.scores.map((s) => [s.color, s.score]));
      expect(Object.keys(got).sort()).toEqual(Object.keys(exp).sort());
      for (const [color, score] of Object.entries(exp)) {
        expect(Math.abs(got[color] - score), `${color}: got ${got[color]}, expected ${score}`).toBeLessThanOrEqual(TOLERANCE);
      }
    });
  }

  // Different cameras, lighting and JPEG decoders shift colours slightly; the colour set must not change.
  for (const [name, gain] of [
    ['warm', [1.06, 1, 0.9]],
    ['cool', [0.92, 1, 1.08]],
    ['darker', [0.85, 0.85, 0.85]],
  ] as const) {
    it(`is stable under a ${name} colour shift`, () => {
      for (const [file, exp] of Object.entries(expected)) {
        if (!exp) continue;
        const img = readJpeg(dir + file);
        for (let i = 0; i < img.data.length; i += 4) for (let c = 0; c < 3; c++) img.data[i + c] = img.data[i + c] * gain[c];
        const got = Object.fromEntries(countDots(img).scores.map((s) => [s.color, s.score]));
        expect(Object.keys(got).sort()).toEqual(Object.keys(exp).sort());
        for (const [color, score] of Object.entries(exp)) expect(Math.abs(got[color] - score)).toBeLessThanOrEqual(5);
      }
    });
  }

  it('glass-table photo (no ground truth): five plausible colours', () => {
    const res = countDots(readJpeg(dir + 'game-2026-08-24-glass.jpeg'));
    expect(res.colors.sort()).toEqual(['azul', 'laranja', 'rosa', 'roxo', 'verde']);
    for (const s of res.scores) {
      expect(s.score).toBeGreaterThan(25);
      expect(s.score).toBeLessThan(70);
    }
  });
});
