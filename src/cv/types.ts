export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type ColorName = 'laranja' | 'amarelo' | 'verde' | 'azul' | 'roxo' | 'rosa';

export interface Dot {
  x: number;
  y: number;
  r: number;
  color: ColorName;
  /** 0..1, how sure the detector is this is a real dot of this color. */
  confidence: number;
}

export interface ScoreEntry {
  color: ColorName;
  score: number;
}

export interface DetectionResult {
  /** Size of the working image the coordinates refer to. */
  width: number;
  height: number;
  /** Typical dot radius in this photo, pixels. */
  dotRadius: number;
  dots: Dot[];
  colors: ColorName[];
  scores: ScoreEntry[];
}
