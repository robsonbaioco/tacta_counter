// Usage: tsx scripts/crop.ts <image.jpg> <x> <y> <w> <h> <scale> <out.png>
import { readJpeg, writePng, cropScale } from './nodeImage';

const [, , file, x, y, w, h, s, out] = process.argv;
const img = readJpeg(file);
console.log('size', img.width, img.height);
writePng(out, cropScale(img, +x, +y, +w, +h, +s));
