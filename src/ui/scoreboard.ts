import { PALETTE, type ScoreEntry } from '../cv';

/** Renders the ranking (ties share a position, e.g. 1º, 1º, 3º). `scores` must be sorted desc. */
export function renderScoreboard(list: HTMLOListElement, scores: ScoreEntry[], animate = false): void {
  list.replaceChildren();
  list.classList.toggle('animate', animate);
  const max = Math.max(1, ...scores.map((s) => s.score));
  scores.forEach((s, i) => {
    const rank = scores.findIndex((o) => o.score === s.score) + 1;
    const { label, rgb } = PALETTE[s.color];
    const li = document.createElement('li');
    li.className = rank === 1 ? 'score winner' : 'score';
    li.style.setProperty('--c', `rgb(${rgb.join(',')})`);
    li.style.setProperty('--w', `${(s.score / max) * 100}%`);
    li.style.animationDelay = `${i * 60}ms`;
    const pos = document.createElement('span');
    pos.className = 'rank';
    pos.textContent = `${rank}º`;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = label;
    const pts = document.createElement('span');
    pts.className = 'points';
    pts.textContent = String(s.score);
    const unit = document.createElement('small');
    unit.textContent = s.score === 1 ? ' ponto' : ' pontos';
    pts.append(unit);
    const bar = document.createElement('span');
    bar.className = 'bar';
    li.append(pos, name, pts, bar);
    list.append(li);
  });
}
