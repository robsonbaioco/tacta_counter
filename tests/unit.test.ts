import { describe, expect, it } from 'vitest';
import { circularMean, hueDist, rgbToHsv } from '../src/cv/color';
import { countDots } from '../src/cv';
import type { RGBAImage } from '../src/cv/types';

describe('colour helpers', () => {
  it('converts RGB to HSV', () => {
    expect(rgbToHsv(255, 0, 0)).toEqual([0, 1, 255]);
    expect(rgbToHsv(0, 255, 0)[0]).toBeCloseTo(120);
    expect(rgbToHsv(0, 0, 255)[0]).toBeCloseTo(240);
    expect(rgbToHsv(128, 128, 128)).toEqual([0, 0, 128]);
  });

  it('measures hue distance around the circle', () => {
    expect(hueDist(350, 10)).toBe(20);
    expect(hueDist(10, 350)).toBe(20);
    expect(hueDist(0, 180)).toBe(180);
  });

  it('averages hues across 0°', () => {
    const { mean, R } = circularMean([350, 10]);
    expect(hueDist(mean, 0)).toBeLessThan(1e-6);
    expect(R).toBeGreaterThan(0.98);
  });
});

/** A tiny painter for synthetic "table photos". */
function canvas(w: number, h: number, bg: [number, number, number]): RGBAImage & { rect: Function; disc: Function } {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...bg, 255], i * 4);
  const put = (x: number, y: number, c: number[]) => {
    if (x >= 0 && y >= 0 && x < w && y < h) data.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
  };
  return {
    width: w,
    height: h,
    data,
    rect(x0: number, y0: number, rw: number, rh: number, c: number[]) {
      for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) put(x, y, c);
    },
    disc(cx: number, cy: number, r: number, c: number[]) {
      for (let y = Math.floor(cy - r); y <= cy + r; y++)
        for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) put(x, y, c);
    },
  };
}

const WHITE = [245, 245, 245];
const BLACK = [22, 22, 24];

/** One card: black body, white inner outline, a coloured strip with `n` dots and a centre icon. */
function card(img: ReturnType<typeof canvas>, x: number, y: number, color: number[], n: number) {
  img.rect(x, y, 180, 120, color); // coloured border
  img.rect(x + 4, y + 4, 172, 112, WHITE); // inner white outline
  img.rect(x + 6, y + 6, 168, 108, BLACK);
  img.rect(x + 6, y + 84, 168, 2, WHITE); // outline above the strip
  img.rect(x + 6, y + 86, 168, 28, color); // strip with the dots
  for (let k = 0; k < n; k++) img.disc(x + 30 + k * 30, y + 100, 4.5, WHITE);
  // Centre icon: small coloured square framed in white, with a white "number" inside, and a marker.
  img.rect(x + 76, y + 30, 28, 28, WHITE);
  img.rect(x + 78, y + 32, 24, 24, color);
  img.rect(x + 88, y + 38, 5, 11, WHITE);
  img.disc(x + 112, y + 44, 3, WHITE);
  // A long white line, like the card's region outlines.
  img.rect(x + 20, y + 20, 40, 2, WHITE);
}

describe('countDots on a synthetic table', () => {
  it('counts only the dots on coloured areas, per colour', () => {
    const img = canvas(900, 700, [150, 110, 70]); // wooden table
    const orange = [232, 82, 48], blue = [70, 140, 228], green = [104, 190, 62];
    card(img, 40, 40, orange, 5);
    card(img, 260, 40, orange, 3);
    card(img, 480, 40, blue, 4);
    card(img, 40, 260, blue, 5);
    card(img, 260, 260, green, 2);
    card(img, 480, 260, green, 5);
    card(img, 260, 480, orange, 1);
    const res = countDots(img);
    const got = Object.fromEntries(res.scores.map((s) => [s.color, s.score]));
    expect(got).toEqual({ laranja: 9, azul: 9, verde: 7 });
    expect(res.scores.map((s) => s.score)).toEqual([9, 9, 7]);
  });
});
