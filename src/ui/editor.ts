// Visualizador/editor da foto (classe PhotoView), usado por main.ts: desenha a foto e os círculos dos
// pontos num canvas, faz arrastar e zoom (roda, pinça, botões) e avisa os toques com coordenadas da imagem.
// Não altera os pontos: só desenha os que main.ts passa em setDots e reporta toques via onTap.
import { PALETTE, type ColorName } from '../cv';

/** Ponto como o editor conhece: id estável (para seleção e edição), posição na imagem e cor. */
export interface EditorDot {
  id: number;
  x: number;
  y: number;
  color: ColorName;
}

/** Toque simples na foto (sem arrasto nem pinça): onde caiu e qual ponto marcado ficou mais perto, se algum. */
export interface TapEvent {
  /** Image coordinates. */
  x: number;
  y: number;
  /** Position inside the host element, for anchoring a popover. */
  hostX: number;
  hostY: number;
  dot: EditorDot | null;
}

/** Ponto 2D genérico. */
type Pt = { x: number; y: number };

/**
 * Shows the photo with the detected dots on a canvas, with pan (drag), zoom (wheel, pinch, buttons)
 * and tap reporting. Coordinates: screen = image * scale + (tx, ty), in CSS pixels.
 */
export class PhotoView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private photo: HTMLCanvasElement | null = null;
  private dots: EditorDot[] = [];
  private dotRadius = 3;
  private scale = 1;
  private tx = 0;
  private ty = 0;
  // Se a pessoa já mexeu no zoom/posição; enquanto não mexeu, redimensionar a janela reajusta a foto à tela.
  private userMoved = false;
  private showMarks = true;
  private selected: number | null = null;
  private pending: Pt | null = null;
  private readonly pointers = new Map<number, Pt>();
  private gesture:
    | { kind: 'pan'; start: Pt; tx: number; ty: number; moved: boolean }
    | { kind: 'pinch'; dist: number; mid: Pt; scale: number; tx: number; ty: number }
    | null = null;
  // O gesto atual teve dois dedos: ao soltar, não conta como toque.
  private pinched = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly onTap: (e: TapEvent) => void,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'photo-canvas';
    host.prepend(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível');
    this.ctx = ctx;
    new ResizeObserver(() => this.resize()).observe(host);
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => this.up(e));
    this.canvas.addEventListener('pointercancel', (e) => this.up(e, true));
    this.canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
  }

  /** Troca a foto (null = sem foto) e o raio típico dos pontos, e reajusta o enquadramento. */
  setPhoto(photo: HTMLCanvasElement | null, dotRadius = 3): void {
    this.photo = photo;
    this.dotRadius = dotRadius;
    this.selected = null;
    this.pending = null;
    this.userMoved = false;
    this.fit();
  }

  /** Pontos a desenhar (main.ts chama a cada mudança). */
  setDots(dots: EditorDot[]): void {
    this.dots = dots;
    this.render();
  }

  /** Liga/desliga o desenho das marcações. */
  setShowMarks(show: boolean): void {
    this.showMarks = show;
    this.render();
  }

  /** Highlights a dot (or an empty spot about to receive one) while its popover is open. */
  setSelection(dotId: number | null, pending: Pt | null = null): void {
    this.selected = dotId;
    this.pending = pending;
    this.render();
  }

  /** Enquadra a foto inteira na área disponível, centralizada. */
  fit(): void {
    const { w, h } = this.size();
    if (this.photo && w > 0 && h > 0) {
      this.scale = Math.min(w / this.photo.width, h / this.photo.height);
      this.tx = (w - this.photo.width * this.scale) / 2;
      this.ty = (h - this.photo.height * this.scale) / 2;
    }
    this.userMoved = false;
    this.render();
  }

  /** Multiplica o zoom por `factor` mantendo parado o ponto `at` da tela (o centro, se omitido). */
  zoomBy(factor: number, at?: Pt): void {
    const { w, h } = this.size();
    const c = at ?? { x: w / 2, y: h / 2 };
    const s = this.clampScale(this.scale * factor);
    this.tx = c.x - ((c.x - this.tx) * s) / this.scale;
    this.ty = c.y - ((c.y - this.ty) * s) / this.scale;
    this.scale = s;
    this.userMoved = true;
    this.render();
  }

  /** Tamanho da área disponível (o elemento hospedeiro), em pixels CSS. */
  private size() {
    return { w: this.host.clientWidth, h: this.host.clientHeight };
  }

  /** Escala que faz a foto inteira caber na área. */
  private fitScale(): number {
    const { w, h } = this.size();
    return this.photo ? Math.min(w / this.photo.width, h / this.photo.height) : 1;
  }

  /** Limita o zoom: mínimo um pouco menor que o enquadramento; máximo onde um ponto fica com ~40 px de raio. */
  private clampScale(s: number): number {
    const min = this.fitScale() * 0.8;
    const max = Math.max(min * 2, 40 / this.dotRadius);
    return Math.min(max, Math.max(min, s));
  }

  /** Acompanha o tamanho do hospedeiro, com resolução multiplicada pelo devicePixelRatio (tela nítida). */
  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = this.size();
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (this.userMoved) this.render();
    else this.fit();
  }

  /** Posição do ponteiro relativa ao canvas, em pixels CSS. */
  private local(e: PointerEvent | WheelEvent): Pt {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Dedo/botão abaixado: um ponteiro começa um arrasto; o segundo transforma em pinça. */
  private down(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, this.local(e));
    if (this.pointers.size === 1) {
      this.pinched = false;
      this.gesture = { kind: 'pan', start: this.local(e), tx: this.tx, ty: this.ty, moved: false };
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinched = true;
      this.gesture = {
        kind: 'pinch',
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        scale: this.scale,
        tx: this.tx,
        ty: this.ty,
      };
    }
  }

  /** Movimento: arrasta (depois de 6 px, para não confundir com toque) ou aplica a pinça. */
  private move(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    const g = this.gesture;
    if (!g) return;
    if (g.kind === 'pan') {
      const dx = p.x - g.start.x, dy = p.y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) < 6) return;
      g.moved = true;
      this.tx = g.tx + dx;
      this.ty = g.ty + dy;
    } else if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = this.clampScale((g.scale * Math.hypot(a.x - b.x, a.y - b.y)) / g.dist);
      // Keep the image point that was under the initial midpoint under the current midpoint.
      this.tx = mid.x - ((g.mid.x - g.tx) * s) / g.scale;
      this.ty = mid.y - ((g.mid.y - g.ty) * s) / g.scale;
      this.scale = s;
    }
    this.userMoved = true;
    this.render();
  }

  /** Soltou: sem ter arrastado nem pinçado, é um toque; numa pinça, o dedo que sobra continua arrastando. */
  private up(e: PointerEvent, cancelled = false): void {
    if (!this.pointers.has(e.pointerId)) return;
    const g = this.gesture;
    const p = this.local(e);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) {
      if (!cancelled && g?.kind === 'pan' && !g.moved && !this.pinched) this.tap(p);
      this.gesture = null;
    } else if (this.pointers.size === 1) {
      // Pinch ended with one finger still down: continue as a pan from here.
      const [q] = [...this.pointers.values()];
      this.gesture = { kind: 'pan', start: q, tx: this.tx, ty: this.ty, moved: true };
    }
  }

  /** Roda do mouse: zoom suave em volta do cursor. */
  private wheel(e: WheelEvent): void {
    e.preventDefault();
    this.zoomBy(Math.exp(-e.deltaY * 0.0015), this.local(e));
  }

  /** Converte o toque para coordenadas da imagem, acha o ponto marcado mais próximo e avisa main.ts. */
  private tap(p: Pt): void {
    if (!this.photo) return;
    const x = (p.x - this.tx) / this.scale;
    const y = (p.y - this.ty) / this.scale;
    if (x < 0 || y < 0 || x > this.photo.width || y > this.photo.height) return;
    // Generous hit area: a finger is much bigger than a dot at normal zoom.
    const hit = Math.max(this.dotRadius * 2.2, 16 / this.scale);
    let best: EditorDot | null = null;
    let bd = hit;
    if (this.showMarks) {
      for (const d of this.dots) {
        const dist = Math.hypot(d.x - x, d.y - y);
        if (dist < bd) {
          bd = dist;
          best = d;
        }
      }
    }
    this.onTap({ x, y, hostX: p.x, hostY: p.y, dot: best });
  }

  /** Redesenha tudo: foto, círculos das marcações (contorno escuro + cor; branco no selecionado) e o lugar de um ponto novo. */
  render(): void {
    const { ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.photo) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = this.scale < 1 ? 'high' : 'low';
    ctx.drawImage(this.photo, this.tx, this.ty, this.photo.width * this.scale, this.photo.height * this.scale);
    if (!this.showMarks) return;
    const r = Math.max(this.dotRadius * this.scale * 1.8, 3.5);
    const lw = Math.max(1.5, Math.min(4, r * 0.3));
    for (const d of this.dots) {
      const sx = d.x * this.scale + this.tx;
      const sy = d.y * this.scale + this.ty;
      const [cr, cg, cb] = PALETTE[d.color].rgb;
      const sel = d.id === this.selected;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.lineWidth = lw + (sel ? 4 : 1.5);
      ctx.strokeStyle = sel ? '#fff' : 'rgba(0,0,0,0.85)';
      ctx.stroke();
      ctx.lineWidth = lw;
      ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
      ctx.stroke();
    }
    if (this.pending) {
      const sx = this.pending.x * this.scale + this.tx;
      const sy = this.pending.y * this.scale + this.ty;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
