// Leitura da foto escolhida: decodifica o arquivo (respeitando a rotação EXIF), reduz para o tamanho de
// trabalho e devolve um canvas (para mostrar) e os pixels (para o worker). Usado por main.ts.
import { WORK_MAX_SIDE, type RGBAImage } from '../cv';

/** Foto carregada: o canvas para exibição e os mesmos pixels para a detecção. */
export interface LoadedPhoto {
  /** The photo at working resolution; kept only in memory for display. */
  canvas: HTMLCanvasElement;
  /** Its pixels, handed to the worker (the buffer is transferred away). */
  image: RGBAImage;
}

/** Decodifica o arquivo em ImageBitmap; se o navegador não aceitar a opção de orientação, tenta sem ela. */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    // Respect the EXIF rotation of phone photos.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

/** Decodes the chosen file and scales it to the working resolution. Nothing is stored or uploaded. */
export async function loadPhoto(file: File): Promise<LoadedPhoto> {
  const bitmap = await decode(file);
  try {
    const f = Math.min(1, WORK_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * f);
    const h = Math.round(bitmap.height * f);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D indisponível');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    return { canvas, image: { width: w, height: h, data: data.data } };
  } finally {
    bitmap.close();
  }
}
