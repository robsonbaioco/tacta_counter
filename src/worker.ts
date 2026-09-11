/// <reference lib="webworker" />
// Runs the detector off the main thread. The pixels arrive by transfer and are dropped after use.
import { countDots, type DetectionResult, type RGBAImage } from './cv';

export type WorkerRequest = { id: number; image: RGBAImage };
export type WorkerResponse = { id: number; result: DetectionResult } | { id: number; error: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, image } = e.data;
  let msg: WorkerResponse;
  try {
    msg = { id, result: countDots(image) };
  } catch (err) {
    msg = { id, error: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
};
