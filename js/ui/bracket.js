import { html, useState, useEffect, useRef, useMemo, useLayoutEffect, useDoc, Ava, playerById, displayName, store, useMediaQuery } from './lib.js';
import * as E from '../core/engine.js';
import { MatchRow } from './match.js';

const CARD_W = 232, CARD_H = 84, GAP_X = 46, GAP_Y = 16, HEAD_H = 44;

function computeLayout(t, twoSided) {
  const rounds = t.bracket.rounds;
  const R = rounds.length;
  const hide = t.bracket.oddMode === 'preliminary';
  const visible = (m) => !(m.bye && hide);
  const childrenOf = (m) => (m.round === 0 ? [] : [t.matches[`m${m.round - 1}-${m.index * 2}`], t.matches[`m${m.round - 1}-${m.index * 2 + 1}`]]);
  const positions = new Map();
  const place = (m, side, cursor) => {
    const kids = childrenOf(m).filter(visible);
    let y;
    if (kids.length === 0) {
      y = cursor.y;
      cursor.y += CARD_H + GAP_Y;
    } else {
      const ys = kids.map((k) => place(k, side, cursor));
      y = (ys[0] + ys[ys.length - 1]) / 2;
    }
    const col = side === 'R' ? 2 * R - 2 - m.round : m.round;
    positions.set(m.id, { x: col * (CARD_W + GAP_X), y, side, col });
    return y;
  };
  const final = t.matches[`m${R - 1}-0`];
  let height;
  if (twoSided && R > 1) {
    const [a, b] = childrenOf(final);
    const left = { y: 0 }, right = { y: 0 };
    const ya = visible(a) ? place(a, 'L', left) : 0;
    const yb = visible(b) ? place(b, 'R', right) : 0;
    const lh = left.y, rh = right.y;
    height = Math.max(lh, rh, CARD_H + GAP_Y);
    // centraliza o lado menor
    const shift = (side, h) => { positions.forEach((p) => { if (p.side === side) p.y += (height - h) / 2; }); };
    shift('L', lh);
    shift('R', rh);
    positions.set(final.id, { x: (R - 1) * (CARD_W + GAP_X), y: (positions.get(a.id)?.y ?? (ya)) / 2 + (positions.get(b.id)?.y ?? (yb)) / 2, side: 'C', col: R - 1 });
    if (!positions.has(a.id)) positions.get(final.id).y = positions.get(b.id).y;
    if (!positions.has(b.id)) positions.get(final.id).y = positions.get(a.id).y;
  } else {
    const c = { y: 0 };
    place(final, 'L', c);
    height = c.y;
  }
  const cols = twoSided && R > 1 ? 2 * R - 1 : R;
  const width = cols * CARD_W + (cols - 1) * GAP_X;
  const edges = [];
  for (const m of Object.values(t.matches)) {
    if (!m.next || !positions.has(m.id)) continue;
    const a = positions.get(m.id), b = positions.get(m.next.id);
    const fromRight = a.x < b.x;
    const x1 = fromRight ? a.x + CARD_W : a.x;
    const x2 = fromRight ? b.x : b.x + CARD_W;
    const y1 = a.y + CARD_H / 2;
    const y2 = b.y + CARD_H / 2 + (m.next.slot === 0 ? -15 : 15);
    const mx = (x1 + x2) / 2;
    const r = Math.min(10, Math.abs(y2 - y1) / 2);
    const dir = y2 > y1 ? 1 : -1, sx = fromRight ? 1 : -1;
    const d = Math.abs(y2 - y1) < 1
      ? `M${x1} ${y1} L${x2} ${y2}`
      : `M${x1} ${y1} L${mx - sx * r} ${y1} Q${mx} ${y1} ${mx} ${y1 + dir * r} L${mx} ${y2 - dir * r} Q${mx} ${y2} ${mx + sx * r} ${y2} L${x2} ${y2}`;
    edges.push({ id: m.id, d, hot: !!m.winner, live: m.status === 'live' });
  }
  const headers = [];
  rounds.forEach((r, i) => {
    headers.push({ key: 'L' + i, x: i * (CARD_W + GAP_X), label: r.short, final: i === R - 1 });
    if (twoSided && i < R - 1) headers.push({ key: 'R' + i, x: (2 * R - 2 - i) * (CARD_W + GAP_X), label: r.short });
  });
  return { positions, width, height: Math.max(height - GAP_Y, CARD_H), edges, headers };
}

function Row({ t, m, side, ava }) {
  const id = m.p[side];
  const p = playerById(t, id);
  const won = m.winner && m.winner === id, lost = m.loser && m.loser === id;
  let score = '';
  if (m.manual) score = m.manual[side];
  else if (m.wo) score = won ? 'WO' : '';
  else if (m.games.length || m.status === 'live' || m.status === 'paused') score = E.gameWins(m, E.scoringOf(t, m))[side];
  const empty = !p && (m.bye ? 'BYE' : 'A definir');
  return html`<div class=${`bk-row ${won ? 'won' : ''} ${lost ? 'lost' : ''}`} data-slot=${`${m.id}:${side}`}>
    <${Ava} player=${p} size=${ava} state=${won ? 'win' : ''} />
    <span class=${'bk-name ' + (p ? '' : 'tbd')}>${p ? displayName(p) : empty}</span>
    <span class="bk-score">${score}${won && html`<i class="bk-tick" aria-label="Vencedor">▸</i>`}</span>
  </div>`;
}

function Card({ t, m, pos, link }) {
  const status = E.displayStatus(t, m);
  const cls = `bk-card glass ${status} ${pos.col === t.bracket.rounds.length - 1 && !pos.onesided ? '' : ''} ${m.next ? '' : 'is-final'}`;
  const inner = html`
    <span class="bk-tag">${m.bye ? 'BYE' : `Jogo ${m.number}`}${status === 'live' ? html`<i class="bk-dot"></i>` : ''}</span>
    <${Row} t=${t} m=${m} side=${0} ava=${28} />
    <${Row} t=${t} m=${m} side=${1} ava=${28} />`;
  const style = `transform:translate(${pos.x}px,${pos.y}px);width:${CARD_W}px;height:${CARD_H}px`;
  return link && !m.bye
    ? html`<a class=${cls} style=${style} href=${'#/partida/' + m.id} aria-label=${`Jogo ${m.number}`}>${inner}</a>`
    : html`<div class=${cls} style=${style}>${inner}</div>`;
}

// O avatar de quem avançou voa da partida vencida até a vaga na fase seguinte.
function useAdvanceAnimation(t, root) {
  const prev = useRef(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = Object.fromEntries(Object.values(t.matches).map((m) => [m.id, m.winner]));
    if (!before || !root.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const m of Object.values(t.matches)) {
      if (!m.next || !m.winner || before[m.id] === m.winner || before[m.id] === undefined) continue;
      const side = m.p.indexOf(m.winner);
      const from = root.current.querySelector(`[data-slot="${m.id}:${side}"] .ava`);
      const to = root.current.querySelector(`[data-slot="${m.next.id}:${m.next.slot}"] .ava`);
      if (!from || !to) continue;
      const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
      const clone = from.cloneNode(true);
      Object.assign(clone.style, { position: 'fixed', left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px', zIndex: 80, margin: 0, boxShadow: '0 0 26px rgba(59,123,245,.9)', pointerEvents: 'none' });
      document.body.append(clone);
      to.style.opacity = 0;
      clone.animate([
        { transform: 'translate(0,0) scale(1)' },
        { transform: `translate(${(b.left - a.left) / 2}px,${(b.top - a.top) / 2 - 40}px) scale(1.9)`, offset: 0.5 },
        { transform: `translate(${b.left - a.left}px,${b.top - a.top}px) scale(${b.width / a.width})` },
      ], { duration: 1100, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => { clone.remove(); to.style.opacity = ''; };
    }
  }, [t]);
}

// fit: escala para caber no contêiner (telão). Fora dele, usa rolagem quando a escala ficaria pequena demais.
export function Bracket({ t, fit = false, link = true }) {
  const wrap = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!wrap.current) return undefined;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const R = t.bracket.rounds.length;
  const twoCols = (2 * R - 1) * (CARD_W + GAP_X);
  const canTwoSided = fit || (box.w > 0 && box.w / twoCols >= 0.62);
  const twoSided = canTwoSided && R > 1;
  const layout = useMemo(() => computeLayout(t, twoSided), [t, twoSided]);
  const fullH = layout.height + HEAD_H;
  const fitScale = fit
    ? Math.min(box.w / layout.width, box.h / fullH, 1.6)
    : Math.min(box.w / layout.width, 1);
  const scale = fit || twoSided ? (fitScale > 0 ? fitScale : 1) : 1;
  const root = useRef(null);
  useAdvanceAnimation(t, root);
  const finalTop = t.matches[`m${R - 1}-0`];
  const champion = E.champion(t);
  return html`<div class=${'bk-wrap ' + (fit ? 'fit' : '')} ref=${wrap}>
    <div class="bk-scroll" style=${!fit && !twoSided ? 'overflow-x:auto' : ''}>
      <div class="bk-canvas" ref=${root} style=${`width:${layout.width}px;height:${fullH}px;transform:scale(${scale});${fit ? 'transform-origin:center center;position:absolute;left:50%;top:50%;margin-left:' + -layout.width / 2 + 'px;margin-top:' + -fullH / 2 + 'px' : 'transform-origin:top left'}`}>
        ${layout.headers.map((h) => html`<div key=${h.key} class=${'bk-head ' + (h.final ? 'final' : '')} style=${`left:${h.x}px;width:${CARD_W}px`}>${h.label}</div>`)}
        <div class="bk-body" style=${`top:${HEAD_H}px;width:${layout.width}px;height:${layout.height}px`}>
          <svg class="bk-lines" width=${layout.width} height=${layout.height} aria-hidden="true">
            ${layout.edges.map((e) => html`<path key=${e.id} d=${e.d} class=${(e.hot ? 'hot ' : '') + (e.live ? 'live' : '')} />`)}
          </svg>
          ${[...layout.positions.entries()].map(([id, pos]) => html`<${Card} key=${id} t=${t} m=${t.matches[id]} pos=${pos} link=${link} />`)}
        </div>
      </div>
      ${!fit && html`<div style=${`height:${fullH * scale}px;width:${layout.width * scale}px`}></div>`}
    </div>
  </div>`;
}

export function BracketPage() {
  const t = useDoc();
  const status = E.tournamentStatus(t);
  const champion = E.champion(t);
  return html`<main class="page bracket-page">
    <div class="page-head">
      <div><span class="overline">${status.label}</span><h1>O caminho até a <em>final</em></h1>
        ${t.bracket && html`<p>${t.bracket.players} jogadores · ${E.realMatches(t).length} partidas. ${store.admin ? 'Toque em um confronto para registrar o resultado.' : 'Toque em um confronto para ver os detalhes.'}</p>`}</div>
      ${champion && html`<a class="btn gold" href="#/campeao">Ver campeão <span class="arrow">→</span></a>`}
    </div>
    ${t.bracket ? html`<${Bracket} t=${t} /><${Extras} t=${t} />` : html`<div class="glass empty"><h3>A chave ainda não foi sorteada</h3>
      <p>Ela aparece aqui assim que o sorteio terminar.</p><a class="btn primary" href="#/sorteio">Ir para o sorteio <span class="arrow">→</span></a></div>`}
  </main>`;
}

// Fora da árvore: disputa de 3º lugar e repescagem (eliminados da 1ª rodada), na ordem em que são jogadas.
function Extras({ t }) {
  const extra = t.bracket.extra || [];
  if (!extra.length) return null;
  const third = extra.find((e) => e.kind === 'third');
  const cons = extra.filter((e) => e.kind === 'consolation');
  const champ = E.consolationChampion(t);
  return html`<div class="bk-extras">
    ${third && html`<section class="glass card bk-extra third">
      <div class="panel-head"><div><span class="overline">Perdedores das semifinais</span><h2>Disputa de 3º lugar</h2></div>
        ${E.thirdPlace(t) && html`<span class="chip champion">3º: ${E.thirdPlace(t).name}</span>`}</div>
      <div class="match-list">${third.matches.map((id) => html`<${MatchRow} key=${id} t=${t} m=${t.matches[id]} />`)}</div>
    </section>`}
    ${cons.length > 0 && html`<section class="glass card bk-extra cons">
      <div class="panel-head"><div><span class="overline">Eliminados na 1ª rodada</span><h2>Repescagem</h2></div>
        ${champ && html`<span class="chip champion">Campeão: ${champ.name}</span>`}</div>
      <p class="muted hint">Quem perde o primeiro jogo continua jogando aqui. Não volta para a chave principal.</p>
      <div class="cons-rounds">${cons.map((r) => {
        const list = r.matches.map((id) => t.matches[id]);
        const byes = list.filter((m) => m.bye && m.winner);
        return html`<div key=${r.key} class="cons-round"><h3 class="round-title consolation">${r.name}</h3>
          <div class="match-list">${list.filter((m) => !m.bye).map((m) => html`<${MatchRow} key=${m.id} t=${t} m=${m} />`)}</div>
          ${byes.map((m) => html`<p key=${m.id} class="muted hint">${playerById(t, m.winner)?.name} avança direto (sem adversário nesta rodada).</p>`)}
        </div>`;
      })}</div>
    </section>`}
  </div>`;
}
