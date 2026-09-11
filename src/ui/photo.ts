import { WORK_MAX_SIDE, type RGBAImage } from '../cv';

export interface LoadedPhoto {
  /** The photo at working resolution; kept only in memory for display. */
  canvas: HTMLCanvasElement;
  /** Its pixels, handed to the worker (the buffer is transferred away). */
  image: RGBAImage;
}

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
