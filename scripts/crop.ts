// Usage: tsx scripts/crop.ts <image.jpg> <x> <y> <w> <h> <scale> <out.png>
// Recorta e amplia (vizinho mais próximo) um trecho de uma foto, para olhar pontos de perto.
// Coordenadas da imagem original (sem a redução para WORK_MAX_SIDE).
import { readJpeg, writePng, cropScale } from './nodeImage';

const [, , file, x, y, w, h, s, out] = process.argv;
const img = readJpeg(file);
console.log('size', img.width, img.height);
writePng(out, cropScale(img, +x, +y, +w, +h, +s));
