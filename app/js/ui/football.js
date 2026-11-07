// Football Team Draw: ferramenta só de nomes para o futebol de terça. Sem avatares e sem ranking, como pedido.
import { html, useState, useEffect, useRef, useLayoutEffect, useDoc, store, act, toast, confirmDialog, openDialog, fmtDate } from './lib.js';
import * as F from '../core/football.js';
import { sfx } from './sfx.js';

const NUM = (i) => String(i + 1).padStart(2, '0');

function Names({ f, ids, swap, onPick, reveal }) {
  return html`<ol class="fb-names">
    ${ids.map((id, i) => html`<li key=${id} data-fid=${id} class=${swap === id ? 'picked' : ''} style=${reveal ? `animation-delay:${i * 90}ms` : ''}>
      ${onPick
        ? html`<button class="fb-pick" onClick=${() => onPick(id)}><i>${i + 1}</i>${F.nameOf(f, id)}</button>`
        : html`<span class="fb-name"><i>${i + 1}</i>${F.nameOf(f, id)}</span>`}
    </li>`)}
  </ol>`;
}

function TeamBox({ f, slot, admin, swap, onPick, reveal, onResult }) {
  const s = f.session;
  const ids = s.teams[slot];
  const won = s.last?.winner === slot;
  const entered = s.last?.loser === slot;
  const short = ids.length < F.TEAM_SIZE;
  return html`<section class=${`fb-box team ${won ? 'won' : ''} ${entered ? 'entered' : ''}`}>
    <header><h2>Time ${slot}</h2><span class=${'chip ' + (won ? 'fb-win' : 'live')}>${won ? 'Vencedor · fica' : entered ? 'Entrou agora' : 'Em campo'}</span></header>
    <p class="fb-count">${ids.length} ${ids.length === 1 ? 'jogador' : 'jogadores'}${short ? ' · incompleto' : ''}</p>
    <${Names} f=${f} ids=${ids} swap=${swap} onPick=${onPick} reveal=${reveal} />
    ${admin && html`<div class="fb-result">
      <button class="btn fb-won" onClick=${() => onResult(slot)}>Time ${slot} venceu</button>
      <button class="btn fb-lost" onClick=${() => onResult(slot === 'A' ? 'B' : 'A')}>Time ${slot} perdeu</button>
    </div>`}
  </section>`;
}

function QueueBox({ f, ids, index, swap, onPick }) {
  const label = index === 0 ? 'Próximo time' : index === 1 ? 'Fila seguinte' : `Fila ${index + 1}`;
  const short = ids.length < F.TEAM_SIZE;
  return html`<section class=${'fb-box ' + (index === 0 ? 'next' : '')}>
    <header><h3>${label}</h3><span class="chip plain">${ids.length} de ${F.TEAM_SIZE}</span></header>
    ${short && html`<p class="fb-count">Completa com quem perder o próximo jogo.</p>`}
    <${Names} f=${f} ids=${ids} swap=${swap} onPick=${onPick} />
  </section>`;
}

// Nomes deslizam da posição antiga para a nova, para o administrador ver quem entrou e quem foi para a fila.
function useNameFlight(root, dep) {
  const before = useRef(new Map());
  useLayoutEffect(() => {
    if (!root.current) return;
    const now = new Map();
    root.current.querySelectorAll('[data-fid]').forEach((el) => {
      const r = el.getBoundingClientRect();
      now.set(el.dataset.fid, r);
      const old = before.current.get(el.dataset.fid);
      if (old && (Math.abs(old.left - r.left) > 2 || Math.abs(old.top - r.top) > 2) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.animate([{ transform: `translate(${old.left - r.left}px,${old.top - r.top}px)`, opacity: 0.55 }, { transform: 'none', opacity: 1 }], { duration: 650, easing: 'cubic-bezier(.3,.8,.2,1)' });
      }
    });
    before.current = now;
  }, [dep]);
}

function RenameDialog({ player, close }) {
  const [name, setName] = useState(player.name);
  return html`<form class="modal glass" onSubmit=${(e) => { e.preventDefault(); close(name); }}>
    <h2>Editar nome</h2>
    <label class="field">Nome<input class="input" autofocus value=${name} onInput=${(e) => setName(e.target.value)} /></label>
    <div class="foot"><button type="button" class="btn ghost" onClick=${() => close(false)}>Cancelar</button><button class="btn primary">Salvar</button></div>
  </form>`;
}

function PlayerList({ f, admin }) {
  const [name, setName] = useState('');
  const input = useRef(null);
  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const ok = act((d) => F.addPlayer(d.football, name));
    if (ok) setName('');
    input.current?.focus();
  };
  const rename = async (p) => {
    const next = await openDialog((close) => html`<${RenameDialog} player=${p} close=${close} />`);
    if (next) act((d) => F.renamePlayer(d.football, p.id, next));
  };
  const remove = async (p) => {
    const inGame = f.session && p.present;
    if (await confirmDialog({ title: `Remover ${p.name}?`, body: inGame ? 'A vaga dele em campo é ocupada pelo primeiro da fila. Dá para desfazer depois.' : 'Dá para desfazer depois.', confirmLabel: 'Remover', danger: true })) act((d) => F.removePlayer(d.football, p.id));
  };
  const present = F.presentPlayers(f).length;
  return html`<section class="glass card fb-list">
    <div class="panel-head"><div><span class="overline">Ordem de chegada</span><h2>${present} ${present === 1 ? 'presente' : 'presentes'} <small>de ${f.players.length}</small></h2></div></div>
    ${admin && html`<form class="fb-add" onSubmit=${add}>
      <label class="sr" for="fb-new">Nome do jogador</label>
      <input id="fb-new" ref=${input} class="input" placeholder=${f.players.length >= F.MAX_PLAYERS ? 'Lista completa' : `Jogador ${NUM(f.players.length)}`} autocomplete="off" disabled=${f.players.length >= F.MAX_PLAYERS} value=${name} onInput=${(e) => setName(e.target.value)} />
      <button class="btn primary" disabled=${!name.trim()}>Adicionar</button>
    </form>`}
    ${f.players.length === 0 && html`<p class="muted fb-empty">${admin ? 'Conforme a galera for chegando, adicione os nomes aqui.' : 'A lista ainda está vazia.'}</p>`}
    <ol class="fb-arrivals">
      ${f.players.map((p, i) => html`<li key=${p.id} class=${p.present ? '' : 'away'}>
        <i>${NUM(i)}</i><span class="fb-arr-name">${p.name}</span>
        ${admin && html`<span class="fb-arr-actions">
          <label class="fb-here" title="Presente"><input type="checkbox" checked=${p.present} onChange=${(e) => act((d) => F.setPresent(d.football, p.id, e.target.checked))} aria-label=${'Presença de ' + p.name} /></label>
          <button class="btn sm ghost" onClick=${() => rename(p)}>Editar</button>
          <button class="btn sm ghost" onClick=${() => remove(p)} aria-label=${'Remover ' + p.name}>Remover</button>
        </span>`}
      </li>`)}
    </ol>
  </section>`;
}

function History({ s }) {
  if (!s.history.length) return null;
  return html`<section class="glass card fb-history">
    <span class="overline">Histórico</span>
    <ol>${s.history.map((h) => html`<li key=${h.no}>
      <b>Jogo ${String(h.no).padStart(2, '0')}</b>
      <span>Time ${h.winner} venceu. Time ${h.loser} perdeu.</span>
      <small>${h.sameTeam ? 'Sem fila de espera: os mesmos 5 voltam.' : `Entraram: ${h.entering.join(', ')}.`}</small>
    </li>`)}</ol>
  </section>`;
}

export function FootballPage() {
  const t = useDoc();
  const f = t.football;
  const admin = store.admin;
  const s = f.session;
  const root = useRef(null);
  const [swapping, setSwapping] = useState(false);
  const [picked, setPicked] = useState(null);
  const [drawing, setDrawing] = useState(null);
  useNameFlight(root, JSON.stringify(s ? [s.teams, s.queue] : 0));
  useEffect(() => () => clearInterval(root.spin), []);

  if (!admin && !f.visible) {
    return html`<main class="page"><div class="page-head"><div><span class="overline">Futebol de terça</span><h1>Sorteio de <em>times</em></h1></div></div>
      <div class="glass empty"><h3>Visualização não liberada</h3><p>O administrador ainda não abriu esta tela para os participantes.</p></div></main>`;
  }

  const present = F.presentPlayers(f).length;
  const missing = F.MIN_PLAYERS - present;
  const groups = F.queueGroups(f);
  const check = F.integrity(f);

  const runDraw = () => {
    const names = F.presentPlayers(f).map((p) => p.name);
    if (names.length < F.MIN_PLAYERS) { act((d) => F.startSession(d.football)); return; }
    sfx.roll();
    // alguns instantes de nomes girando; o sorteio de verdade acontece no fim, uma única vez
    const spin = () => setDrawing(F.shuffle(names).slice(0, F.MIN_PLAYERS));
    spin();
    root.spin = setInterval(spin, 110);
    setTimeout(() => {
      clearInterval(root.spin);
      setDrawing(null);
      act((d) => F.startSession(d.football));
      sfx.reveal();
    }, 1500);
  };
  const draw = async () => {
    if (s && !await confirmDialog({ title: 'Sortear de novo?', body: 'Os times, as filas e o histórico atuais serão substituídos. Dá para desfazer depois.', confirmLabel: 'Sortear de novo', danger: true })) return;
    runDraw();
  };
  const result = (winner) => {
    act((d) => F.registerWinner(d.football, winner));
    sfx.win();
  };
  const pick = swapping ? (id) => {
    if (!picked) { setPicked(id); return; }
    if (picked !== id) act((d) => F.swapPlayers(d.football, picked, id));
    setPicked(null);
  } : null;
  const reset = async () => {
    if (await confirmDialog({ title: 'Reiniciar a sessão?', body: 'Times, filas e histórico desta sessão serão apagados. A lista de nomes fica.', confirmLabel: 'Reiniciar sessão', danger: true, phrase: 'REINICIAR' })) act((d) => F.resetSession(d.football), 'Sessão reiniciada.');
  };
  const tuesday = async () => {
    if (await confirmDialog({ title: 'Começar uma nova terça?', body: 'A lista de nomes fica vazia. O histórico de hoje é guardado para consulta.', confirmLabel: 'Nova terça', danger: true, phrase: 'NOVA' })) act((d) => F.newTuesday(d.football, true), 'Pronto para a próxima terça.');
  };

  return html`<main class="page football" ref=${root}>
    <div class="page-head">
      <div><span class="overline">${s ? `Jogo ${s.gameNo} em campo` : 'Futebol de terça'}</span><h1>Sorteio de <em>times</em></h1></div>
      ${admin && html`<label class="fb-visible"><input type="checkbox" checked=${f.visible} onChange=${(e) => act((d) => { d.football.visible = e.target.checked; })} /> Participantes podem ver esta tela</label>`}
    </div>

    ${!check.ok && html`<p class="notice warn" role="alert">A lista e o rodízio não batem. Use Desfazer ou Reorganizar para corrigir antes do próximo jogo.</p>`}

    ${drawing && html`<div class="fb-spin" aria-live="polite"><section class="fb-box team"><header><h2>Time A</h2></header><ol class="fb-names spin">${drawing.slice(0, 5).map((n) => html`<li><span class="fb-name">${n}</span></li>`)}</ol></section>
      <section class="fb-box team"><header><h2>Time B</h2></header><ol class="fb-names spin">${drawing.slice(5).map((n) => html`<li><span class="fb-name">${n}</span></li>`)}</ol></section></div>`}

    ${s && !drawing && html`
      ${s.last && html`<p class="fb-banner"><b>Time ${s.last.winner} venceu</b> e fica em campo. O Time ${s.last.loser} saiu e o próximo grupo entrou.</p>`}
      <div class="fb-field">
        <${TeamBox} f=${f} slot="A" admin=${admin} swap=${picked} onPick=${pick} reveal=${s.gameNo === 1 && !s.last} onResult=${result} />
        <div class="fb-vs" aria-hidden="true">x</div>
        <${TeamBox} f=${f} slot="B" admin=${admin} swap=${picked} onPick=${pick} reveal=${s.gameNo === 1 && !s.last} onResult=${result} />
      </div>
      ${groups.length > 0 ? html`<div class="fb-queue">${groups.map((ids, i) => html`<${QueueBox} key=${i} f=${f} ids=${ids} index=${i} swap=${picked} onPick=${pick} />`)}</div>`
        : html`<p class="notice" style="margin-top:14px">Ninguém na fila: quem perder volta como próximo time. Com 10 jogadores, os mesmos times se repetem.</p>`}
    `}

    ${admin && html`<section class="glass card fb-control">
      <span class="overline">Controle do futebol</span>
      <div class="actions">
        <button class="btn primary" disabled=${!!drawing || present < F.MIN_PLAYERS} onClick=${draw}>${s ? 'Sortear de novo' : 'Sortear times'}</button>
        <button class="btn" disabled=${!f.undo.length} onClick=${() => { const label = act((d) => F.undo(d.football)); if (label) toast(`Desfeito: ${label}.`); }}>Desfazer última ação</button>
        ${s && html`<button class="btn" aria-pressed=${swapping} onClick=${() => { setSwapping(!swapping); setPicked(null); }}>${swapping ? 'Concluir reorganização' : 'Reorganizar fila'}</button>`}
        ${s && html`<button class="btn ghost" onClick=${reset}>Reiniciar sessão</button>`}
        <button class="btn ghost" disabled=${!f.players.length} onClick=${tuesday}>Nova terça</button>
      </div>
      ${!s && missing > 0 && html`<p class="muted hint fb-hint">Faltam ${missing} ${missing === 1 ? 'jogador presente' : 'jogadores presentes'} para sortear.</p>`}
      ${swapping && html`<p class="notice fb-hint">${picked ? `Agora toque em quem vai trocar de lugar com ${F.nameOf(f, picked)}.` : 'Toque em dois nomes para trocar os dois de lugar.'}</p>`}
    </section>`}

    <div class="fb-bottom">
      <${PlayerList} f=${f} admin=${admin} />
      ${s && html`<${History} s=${s} />`}
    </div>

    ${admin && f.archive.length > 0 && html`<details class="glass card fb-archive"><summary>Terças anteriores (${f.archive.length})</summary>
      <ul>${f.archive.map((a) => html`<li key=${a.at}>${fmtDate(a.at)}: ${a.players} jogadores, ${a.games.length} ${a.games.length === 1 ? 'jogo' : 'jogos'}</li>`)}</ul></details>`}
  </main>`;
}
