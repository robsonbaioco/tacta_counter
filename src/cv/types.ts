/** Imagem crua: largura, altura e os pixels em RGBA (4 bytes por pixel, linha a linha), como no ImageData do canvas. */
// Tipos compartilhados do detector (src/cv/) com a interface (src/main.ts, src/ui/) e o worker.
// Só declarações: nenhum código roda aqui.
export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** As seis cores de jogador do Tacta, pelo id usado no código (o nome de tela fica em PALETTE). */
export type ColorName = 'laranja' | 'amarelo' | 'verde' | 'azul' | 'roxo' | 'rosa';

/** Um ponto branco aceito: centro e raio em pixels da imagem de trabalho, e a cor da área onde ele está. */
export interface Dot {
  x: number;
  y: number;
  r: number;
  color: ColorName;
}

/** Pontuação de uma cor (quantidade de pontos visíveis dela). */
export interface ScoreEntry {
  color: ColorName;
  score: number;
}

/** O que o detector devolve para a interface: pontos, cores em jogo e placar já ordenado. */
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
