import type { DetectionResult, RGBAImage } from './types';
import { detectCandidates } from './detect';
import { assignColors } from './palette';

/** Full pipeline: photo pixels in, dots and per-colour scores out. */
export function countDots(image: RGBAImage): DetectionResult {
  const { width, height, dotRadius, dots, colors, scores } = assignColors(detectCandidates(image));
  return { width, height, dotRadius, dots, colors, scores };
}

export { WORK_MAX_SIDE } from './detect';
export { PALETTE, COLOR_ORDER, scoresOf } from './palette';
export type * from './types';
