// Ponto de entrada da página: liga o HTML (index.html) ao detector e ao editor.
// Fluxo: escolher/arrastar a foto -> photo.ts decodifica -> worker.ts conta -> PhotoView (editor.ts)
// mostra as marcações e scoreboard.ts mostra o placar. Toques na foto abrem o popover para trocar a
// cor, remover ou adicionar ponto; cada edição vai para o histórico do Desfazer. Nada é gravado.
import './styles.css';
import { COLOR_ORDER, PALETTE, scoresOf, type ColorName, type DetectionResult } from './cv';
import { loadPhoto } from './ui/photo';
import { PhotoView, type EditorDot, type TapEvent } from './ui/editor';
import { renderScoreboard } from './ui/scoreboard';
import { setupInstallPrompt } from './ui/install';
import type { WorkerRequest, WorkerResponse } from './worker';

/** Atalho para getElementById já com o tipo do elemento. */
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
/** Elementos do index.html usados aqui, buscados uma vez. */
const els = {
  intro: $('intro'),
  drop: $('drop'),
  file: $<HTMLInputElement>('file'),
  busy: $('busy'),
  error: $('error'),
  result: $('result'),
  reset: $<HTMLButtonElement>('reset'),
  scores: $<HTMLOListElement>('scores'),
  total: $('total'),
  undo: $<HTMLButtonElement>('undo'),
  marks: $<HTMLButtonElement>('marks'),
  stage: $('stage'),
  popover: $('popover'),
  popTitle: $('pop-title'),
  popColors: $('pop-colors'),
  popRemove: $<HTMLButtonElement>('pop-remove'),
};

// ---- State: in memory only. Nothing is ever uploaded or written to storage. ----
/** Pontos atuais (detectados + correções). */
let dots: EditorDot[] = [];
/** Cópias de `dots` antes de cada edição, para o Desfazer (máximo de 200). */
let history: EditorDot[][] = [];
let nextId = 1;
let showMarks = true;
/** Alvo do popover aberto: o ponto tocado ou, com dot nulo, o lugar onde um ponto será adicionado. */
let popTarget: { dot: EditorDot | null; x: number; y: number } | null = null;

const view = new PhotoView(els.stage, onTap);

// ---- Worker ----
// O Vite empacota o worker como módulo separado a partir deste `new URL(...)`.
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let requestId = 0;
/** Promessas à espera da resposta do worker, por id do pedido. */
const waiting = new Map<number, (r: WorkerResponse) => void>();
worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
  waiting.get(e.data.id)?.(e.data);
  waiting.delete(e.data.id);
};

/** Mostra só uma das seções (início, "contando" ou resultado); "Nova foto" aparece fora do início. */
function show(section: 'intro' | 'busy' | 'result') {
  els.intro.hidden = section !== 'intro';
  els.busy.hidden = section !== 'busy';
  els.result.hidden = section !== 'result';
  els.reset.hidden = section === 'intro';
}

/** Mostra a mensagem de erro (ou esconde, com null). */
function showError(msg: string | null) {
  els.error.hidden = !msg;
  els.error.textContent = msg ?? '';
}

/**
 * Processa a foto escolhida: decodifica, manda ao worker e abre o resultado. `requestId` descarta
 * respostas de um pedido antigo se a pessoa trocou de foto ou clicou em "Nova foto" no meio.
 */
async function handleFile(file: File | undefined) {
  if (!file) return;
  showError(null);
  show('busy');
  const id = ++requestId;
  try {
    const photo = await loadPhoto(file);
    const response = await new Promise<WorkerResponse>((resolve) => {
      waiting.set(id, resolve);
      const msg: WorkerRequest = { id, image: photo.image };
      worker.postMessage(msg, [photo.image.data.buffer]);
    });
    if (id !== requestId) return; // the user started over meanwhile
    if ('error' in response) throw new Error(response.error);
    start(photo.canvas, response.result);
  } catch (err) {
    if (id !== requestId) return;
    console.error(err);
    show('intro');
    showError('Não consegui abrir essa imagem. Tente uma foto em JPG ou PNG.');
  } finally {
    els.file.value = '';
  }
}

/** Abre a tela de resultado com a foto e os pontos detectados (zera o histórico). */
function start(photo: HTMLCanvasElement, result: DetectionResult) {
  dots = result.dots.map((d) => ({ id: nextId++, x: d.x, y: d.y, color: d.color }));
  history = [];
  show('result');
  view.setPhoto(photo, result.dotRadius);
  update(true);
  if (!dots.length) showError('Não encontrei pontos nesta foto. Você pode marcá-los tocando neles, ou tentar outra foto mais nítida.');
}

/** Volta ao início, descartando a foto e os pontos da memória. */
function reset() {
  requestId++;
  closePopover();
  view.setPhoto(null);
  dots = [];
  history = [];
  showError(null);
  show('intro');
}

/**
 * Recalcula placar e total a partir de `dots` e redesenha. As cores do placar são as que têm pelo menos
 * um ponto. `fresh` liga a animação de entrada do placar (só na primeira exibição).
 */
function update(fresh = false) {
  const colors = COLOR_ORDER.filter((c) => dots.some((d) => d.color === c));
  const scores = scoresOf(
    dots.map((d) => ({ ...d, r: 0, confidence: 1 })),
    colors,
  );
  renderScoreboard(els.scores, scores, fresh);
  els.total.textContent = `${dots.length} pontos visíveis · ${colors.length} ${colors.length === 1 ? 'cor' : 'cores'}`;
  els.undo.disabled = history.length === 0;
  view.setDots(dots);
}

/** Guarda o estado atual no histórico, aplica a mudança e atualiza a tela. */
function edit(change: () => void) {
  history.push(dots.map((d) => ({ ...d })));
  if (history.length > 200) history.shift();
  change();
  update();
}

// ---- Tap → popover to recolour / remove / add a dot ----
/**
 * Toque na foto: com o popover aberto, só fecha; senão abre o popover com os botões de cor (e "Remover"
 * se tocou num ponto), posicionado perto do toque e dentro da área da foto.
 */
function onTap(e: TapEvent) {
  if (popTarget) {
    closePopover();
    return;
  }
  popTarget = { dot: e.dot, x: e.x, y: e.y };
  els.popTitle.textContent = e.dot ? `Ponto ${PALETTE[e.dot.color].label.toLowerCase()}` : 'Adicionar ponto';
  els.popRemove.hidden = !e.dot;
  els.popColors.replaceChildren(
    ...COLOR_ORDER.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.title = PALETTE[c].label;
      b.setAttribute('aria-label', PALETTE[c].label);
      b.style.setProperty('--c', `rgb(${PALETTE[c].rgb.join(',')})`);
      if (e.dot?.color === c) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => choose(c));
      return b;
    }),
  );
  view.setSelection(e.dot?.id ?? null, e.dot ? null : { x: e.x, y: e.y });
  els.popover.hidden = false;
  // Anchor next to the tap, kept inside the stage.
  const pw = els.popover.offsetWidth, ph = els.popover.offsetHeight;
  const sw = els.stage.clientWidth, sh = els.stage.clientHeight;
  const left = Math.min(Math.max(8, e.hostX - pw / 2), sw - pw - 8);
  const top = e.hostY + 24 + ph < sh ? e.hostY + 24 : Math.max(8, e.hostY - ph - 24);
  els.popover.style.left = `${left}px`;
  els.popover.style.top = `${top}px`;
}

/** Botão de cor do popover: troca a cor do ponto tocado ou adiciona um ponto novo dessa cor. */
function choose(color: ColorName) {
  const t = popTarget;
  closePopover();
  if (!t) return;
  if (t.dot) {
    const id = t.dot.id;
    if (t.dot.color !== color) edit(() => (dots = dots.map((d) => (d.id === id ? { ...d, color } : d))));
  } else {
    edit(() => dots.push({ id: nextId++, x: t.x, y: t.y, color }));
  }
}

/** Fecha o popover e tira o destaque da foto. */
function closePopover() {
  popTarget = null;
  els.popover.hidden = true;
  view.setSelection(null);
}

// Botão "Remover ponto" do popover.
els.popRemove.addEventListener('click', () => {
  const t = popTarget;
  closePopover();
  if (t?.dot) edit(() => (dots = dots.filter((d) => d.id !== t.dot!.id)));
});

// ---- Controls ----
els.file.addEventListener('change', () => handleFile(els.file.files?.[0]));
els.reset.addEventListener('click', reset);
// Desfazer: volta para a última cópia do histórico.
els.undo.addEventListener('click', () => {
  const prev = history.pop();
  if (!prev) return;
  closePopover();
  dots = prev;
  update();
});
// Mostrar/ocultar as marcações (para ver a foto limpa); com elas ocultas, tocar não seleciona pontos.
els.marks.addEventListener('click', () => {
  showMarks = !showMarks;
  closePopover();
  view.setShowMarks(showMarks);
  els.marks.textContent = showMarks ? 'Ocultar marcações' : 'Mostrar marcações';
  els.marks.setAttribute('aria-pressed', String(showMarks));
});
$('zoom-in').addEventListener('click', () => view.zoomBy(1.5));
$('zoom-out').addEventListener('click', () => view.zoomBy(1 / 1.5));
$('zoom-fit').addEventListener('click', () => view.fit());
setupInstallPrompt($('install'), $<HTMLButtonElement>('install-accept'), $<HTMLButtonElement>('install-dismiss'));
// Teclado: Esc fecha o popover; Ctrl/Cmd+Z desfaz.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePopover();
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !els.result.hidden) els.undo.click();
});

// Drag & drop anywhere on the page.
for (const type of ['dragenter', 'dragover'] as const) {
  window.addEventListener(type, (e) => {
    e.preventDefault();
    els.drop.classList.add('over');
  });
}
window.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) els.drop.classList.remove('over');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  els.drop.classList.remove('over');
  const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
  if (file) handleFile(file);
});
