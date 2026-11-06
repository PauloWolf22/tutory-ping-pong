import { html, useState, useEffect, useRef, useDoc, store, act, Ava, avatarOf, playerById, displayName, useStage, confirmDialog, go } from './lib.js';
import * as E from '../core/engine.js';
import { DrawStage } from '../three/stage.js';
import { sfx } from './sfx.js';

const wait = (ms) => new Promise((r) => setTimeout(r, document.hidden ? 0 : ms));
const pairOf = (slot) => Math.floor(slot / 2);

// Palco do sorteio: o mesmo componente roda no painel e no telão, reagindo ao documento.
export function DrawShow({ t, big = false, controls = null, onBusy }) {
  const [host, stage] = useStage((el) => new DrawStage(el));
  const d = t.draw;
  const initialPair = d.last ? pairOf(d.last.slot) : (d.order.length ? pairOf(d.order[d.cursor] ?? d.order[0]) : 0);
  const [pair, setPair] = useState(initialPair);
  const [shown, setShown] = useState(() => [d.slots[initialPair * 2] ?? null, d.slots[initialPair * 2 + 1] ?? null]);
  const [burst, setBurst] = useState(0);
  const [busy, setBusyState] = useState(false);
  const seenAt = useRef(d.last?.at ?? 0);
  const queue = useRef(Promise.resolve());
  const latest = useRef(t);
  latest.current = t;
  const setBusy = (v) => { setBusyState(v); onBusy?.(v); };
  const avatarFor = (id) => (id && id !== 'BYE' ? avatarOf(playerById(latest.current, id)) : null);

  // bolas: quem ainda está no pote
  const pool = d.status === 'live' ? E.drawPool(t) : [];
  useEffect(() => { stage.current?.setPool(pool); }, [pool.map((p) => p.id).join()]);

  // estado inicial ao abrir a tela
  useEffect(() => { stage.current?.setPair(avatarFor(shown[0]), avatarFor(shown[1])); }, []);

  // cada novo sorteado vira uma sequência: pote agita, bola voa, avatar aparece, confronto fecha
  useEffect(() => {
    const last = d.last;
    if (d.status === 'idle') { seenAt.current = 0; return; }
    if (!last || last.at === seenAt.current) return;
    seenAt.current = last.at;
    queue.current = queue.current.then(async () => {
      setBusy(true);
      const stg = stage.current;
      const nextPair = pairOf(last.slot);
      const side = last.slot % 2;
      const slots = latest.current.draw.slots;
      // lado parceiro: cabeça de chave ou BYE já definidos aparecem antes da bola
      const partner = slots[nextPair * 2 + (1 - side)];
      const partnerShown = partner && (partner === 'BYE' || !latest.current.draw.order.includes(nextPair * 2 + (1 - side)) || (pairOf(last.slot) === pair && shown[1 - side] === partner));
      const start = [null, null];
      start[1 - side] = partnerShown ? partner : null;
      setPair(nextPair);
      setShown(start);
      setBurst(0);
      await stg?.setPair(avatarFor(start[0]), avatarFor(start[1]));
      sfx.roll();
      await stg?.pickBall(last.playerId, side);
      const after = [...start];
      after[side] = last.playerId;
      setShown(after);
      sfx.reveal();
      await stg?.setPair(avatarFor(after[0]), avatarFor(after[1]), side);
      await wait(500);
      const complete = after[0] && after[1];
      // segunda bola do mesmo par: mantém o primeiro jogador no palco
      if (!complete) {
        const other = latest.current.draw.slots[nextPair * 2 + (1 - side)];
        if (other && other !== 'BYE') { after[1 - side] = other; setShown([...after]); await stg?.setPair(avatarFor(after[0]), avatarFor(after[1])); }
      }
      if (after[0] && after[1]) {
        if (after[0] !== 'BYE' && after[1] !== 'BYE') { setBurst((b) => b + 1); sfx.versus(); stg?.faceOff(); }
        await wait(1100);
      }
      setBusy(false);
    }).catch(() => setBusy(false));
  }, [d.last?.at, d.status]);

  const slotView = (side) => {
    const id = shown[side];
    if (id === 'BYE') return html`<div class="dr-name bye"><small>BYE</small><b>Avança direto</b></div>`;
    const p = playerById(t, id);
    if (!p) return html`<div class="dr-name wait"><small>Lado ${side === 0 ? 'A' : 'B'}</small><b>Aguardando…</b></div>`;
    return html`<div class="dr-name in" key=${id}><small>Nº ${String(p.number).padStart(2, '0')}${p.seed ? ` · Cabeça ${p.seed}` : ''}</small><b>${displayName(p)}</b></div>`;
  };

  const pairs = [];
  for (let i = 0; i < d.slots.length; i += 2) pairs.push([d.slots[i], d.slots[i + 1], i / 2]);
  const visible = pairs.filter(([a, b]) => (a && a !== 'BYE') || (b && b !== 'BYE'));

  return html`<div class=${'dr-show ' + (big ? 'big' : '')}>
    <div class="dr-canvas stage-host" ref=${host}></div>
    <div class="dr-pot-label"><span class="overline">No pote</span><b>${pool.length}</b></div>
    <div class="dr-names">
      <div>${slotView(0)}</div>
      <div class=${'dr-vs ' + (burst ? 'burst' : '')} key=${burst}>VS</div>
      <div>${slotView(1)}</div>
    </div>
    <aside class="dr-list glass">
      <span class="overline">Confrontos sorteados</span>
      <ol>
        ${visible.length === 0 && html`<li class="muted">Os confrontos aparecem aqui.</li>`}
        ${visible.map(([a, b, i]) => html`<li key=${i} class=${i === pair ? 'cur' : ''}>
          ${[a, b].map((id, s) => {
            const p = id && id !== 'BYE' ? playerById(t, id) : null;
            const hideUntilShown = i === pair && busy && shown[s] !== id;
            return html`<span class="dr-li" key=${s}><${Ava} player=${hideUntilShown ? null : p} size=${big ? 36 : 28} /><em class=${p && !hideUntilShown ? '' : 'tbd'}>${hideUntilShown ? '…' : p ? displayName(p) : id === 'BYE' ? 'BYE' : '…'}</em></span>`;
          })}
        </li>`)}
      </ol>
    </aside>
    ${controls && html`<div class="dr-controls">${controls({ busy, pool })}</div>`}
  </div>`;
}

function Prep({ t }) {
  const n = E.eligiblePlayers(t).length;
  const sum = E.formatSummary(n, t.settings.oddMode);
  const [mode, setMode] = useState('auto');
  const seeds = t.players.filter((p) => p.seed && !p.absent).length;
  const toggleSeed = (p) => act((d) => {
    const used = d.players.filter((x) => x.seed).map((x) => x.seed);
    let next = 1;
    while (used.includes(next)) next++;
    E.updatePlayer(d, p.id, { seed: p.seed ? null : next });
  });
  const start = () => act((d) => {
    E.startDraw(d, { mode });
    E.setDisplay(d, 'draw');
  });
  return html`<div class="prep">
    <div class="glass card prep-side">
      <span class="overline">Formato</span>
      <h3 class="prep-count">${n} <small>selecionados</small></h3>
      <p class="muted">${sum.text}</p>
      <div class="prep-rounds">${sum.rounds.map((r) => html`<span key=${r.index} class="chip plain">${r.name}</span>`)}</div>
      <label class="field">Números que não fecham a chave
        <select class="input" value=${t.settings.oddMode} onChange=${(e) => act((d) => { d.settings.oddMode = e.target.value; })}>
          <option value="byes">BYE: alguns avançam direto, com o confronto visível</option>
          <option value="preliminary">Rodada preliminar: só as partidas reais aparecem</option>
        </select></label>
      <label class="field">Forma do sorteio
        <select class="input" value=${mode} onChange=${(e) => setMode(e.target.value)}>
          <option value="auto">Automático: o sistema sorteia cada bola</option>
          <option value="manual">Manual: o administrador escolhe cada jogador</option>
        </select></label>
      ${seeds > 0 && html`<p class="muted">${seeds} ${seeds > 1 ? 'cabeças de chave ficam' : 'cabeça de chave fica'} em posições fixas e ${seeds > 1 ? 'só se enfrentam' : 'só enfrenta'} tarde na chave.</p>`}
      <button class="btn primary lg" disabled=${n < 2} onClick=${start}>Iniciar sorteio ao vivo <span class="arrow">→</span></button>
      ${n < 2 && html`<a class="btn" href="#/jogadores">Cadastrar participantes</a>`}
    </div>
    <div class="glass card prep-main">
      <div class="prep-head"><span class="overline">Quem entra no pote</span><p class="muted">Desmarque quem não vai jogar. A estrela define cabeça de chave.</p></div>
      ${t.players.length === 0 && html`<p class="muted">Nenhum participante inscrito ainda.</p>`}
      <div class="prep-grid">
        ${t.players.map((p) => html`<div key=${p.id} class=${'prep-player ' + (p.absent ? 'off' : '')}>
          <label><input type="checkbox" checked=${!p.absent} onChange=${(e) => act((d) => E.updatePlayer(d, p.id, { absent: !e.target.checked }))} />
            <${Ava} player=${p} size=${44} /><span>${displayName(p)}</span></label>
          <button class=${'seed ' + (p.seed ? 'on' : '')} disabled=${p.absent} onClick=${() => toggleSeed(p)} aria-pressed=${!!p.seed} aria-label=${(p.seed ? 'Remover cabeça de chave de ' : 'Definir como cabeça de chave: ') + p.name}>${p.seed ? `★ ${p.seed}` : '☆'}</button>
        </div>`)}
      </div>
    </div>
  </div>`;
}

function WaitingPublic({ t }) {
  return html`<div class="glass empty"><h3>O sorteio ainda não começou</h3>
    <p>${t.players.length} participantes inscritos. Esta tela acompanha o sorteio ao vivo quando ele iniciar.</p>
    <div class="dr-preview">${t.players.slice(0, 24).map((p) => html`<${Ava} key=${p.id} player=${p} size=${52} />`)}</div>
  </div>`;
}

export function DrawPage() {
  const t = useDoc();
  const d = t.draw;
  const admin = store.admin;
  const locked = E.isLocked(t);
  const [auto, setAuto] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!auto || d.status !== 'live') return undefined;
    const timer = setInterval(() => { if (!busyRef.current) act((x) => E.drawNext(x)); }, 700);
    return () => clearInterval(timer);
  }, [auto, d.status]);

  const redo = async () => {
    if (await confirmDialog({ title: 'Refazer o sorteio?', body: 'A chave atual será apagada e as inscrições reabrem. O sorteio anterior fica salvo no histórico.', confirmLabel: 'Refazer sorteio', danger: true })) {
      act((x) => E.resetDraw(x), 'Sorteio desfeito.');
      setAuto(false);
    }
  };

  const controls = admin ? ({ busy, pool }) => {
    if (d.status !== 'live') return null;
    if (d.mode === 'manual') {
      return html`<div class="dr-manual glass">
        <span class="overline">Escolha o próximo jogador</span>
        <div class="dr-pool">${pool.map((p) => html`<button key=${p.id} class="dr-pick" disabled=${busy} onClick=${() => act((x) => E.drawNext(x, p.id))}><${Ava} player=${p} size=${34} /><span>${displayName(p)}</span></button>`)}</div>
        <div class="actions"><button class="btn sm" disabled=${busy || d.cursor === 0} onClick=${() => act((x) => E.undoDraw(x))}>Desfazer último</button><button class="btn sm ghost" onClick=${redo}>Cancelar sorteio</button></div>
      </div>`;
    }
    return html`<div class="actions dr-buttons">
      <button class="btn primary lg" disabled=${busy || auto} onClick=${() => act((x) => E.drawNext(x))}>${busy ? 'Sorteando…' : 'Sortear próximo'}</button>
      <button class="btn lg" onClick=${() => setAuto(!auto)} aria-pressed=${auto}>${auto ? 'Pausar sequência' : 'Sortear em sequência'}</button>
      <button class="btn ghost" disabled=${busy} onClick=${redo}>Cancelar</button>
    </div>`;
  } : null;

  return html`<main class="page draw-page">
    <div class="page-head">
      <div><span class="overline">${d.status === 'live' ? 'Ao vivo' : d.status === 'done' ? 'Concluído' : 'Preparação'}</span>
        <h1>Sorteio <em>ao vivo</em></h1></div>
      <div class="actions">
        ${(d.status === 'live' || d.status === 'done') && html`<a class="btn" href="#/telao" target="_blank" rel="noopener">Abrir no telão</a>`}
        ${d.status === 'done' && html`
          <a class="btn primary" href="#/chave">Ver chaveamento <span class="arrow">→</span></a>
          ${admin && !locked && html`<button class="btn danger" onClick=${redo}>Refazer sorteio</button>`}`}
      </div>
    </div>
    ${d.status === 'idle' && (admin ? html`<${Prep} t=${t} />` : html`<${WaitingPublic} t=${t} />`)}
    ${d.status !== 'idle' && html`<${DrawShow} t=${t} controls=${controls} onBusy=${(v) => { busyRef.current = v; }} />`}
    ${d.status === 'done' && locked && admin && html`<p class="notice" style="margin-top:16px">As partidas já começaram, por isso o sorteio não pode mais ser refeito.</p>`}
  </main>`;
}
