// Web Worker: roda countDots (src/cv/) fora da thread da página, para a interface não travar
// durante os segundos de contagem. Conversa só com main.ts, por mensagens com `id` (respostas de
// pedidos antigos são ignoradas lá).
/// <reference lib="webworker" />
// Runs the detector off the main thread. The pixels arrive by transfer and are dropped after use.
import { countDots, type DetectionResult, type RGBAImage } from './cv';

/** Pedido do main.ts: id do pedido e a imagem (o buffer de pixels é transferido, não copiado). */
export type WorkerRequest = { id: number; image: RGBAImage };
/** Resposta: o resultado da detecção ou a mensagem de erro, com o mesmo id do pedido. */
export type WorkerResponse = { id: number; result: DetectionResult } | { id: number; error: string };

/** Recebe uma imagem, conta os pontos e devolve o resultado (ou o erro) ao main.ts. */
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
