// Football Team Draw: ferramenta só de nomes para o futebol de terça. Sem avatares e sem ranking, como pedido.
import { html, useState, useEffect, useRef, useLayoutEffect, useDoc, store, act, toast, confirmDialog, openDialog, fmtDate, handleError } from './lib.js';
import { sports } from '../core/sports.js';
import * as F from '../core/football.js';
import { sfx } from './sfx.js';

const NUM = (i) => String(i + 1).padStart(2, '0');
const RD = (n) => String(n).padStart(2, '0');
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hhmm = (ms) => (ms ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

// ------------------------------------------------------------------ menu do participante
function PlayerMenu({ f, p, close }) {
  const team = F.teamOf(f, p.id);
  const pos = f.session?.queue.indexOf(p.id) ?? -1;
  const played = F.playedRounds(f, p.id);
  const where = p.quit ? 'Desistiu' : !p.present ? 'Ausente' : team ? `Em campo · Time ${team}` : pos >= 0 ? `Na fila · posição ${pos + 1}` : 'Presente';
  return html`<div class="modal glass fb-menu" role="dialog" aria-modal="true" aria-labelledby="fbm-t">
    <h2 id="fbm-t">${p.name}</h2>
    <p class="muted">${where}${played ? ` · ${played} ${played === 1 ? 'jogo' : 'jogos'} hoje` : ''}</p>
    <div class="fb-menu-list">
      ${p.quit
        ? html`<button class="btn" onClick=${() => close('rejoin')}>Voltar a jogar</button>`
        : html`<button class="btn danger" onClick=${() => close('quit')}>Essa pessoa não quer mais jogar</button>`}
      <button class="btn ghost" onClick=${() => close('rename')}>Editar nome</button>
      ${!played && html`<button class="btn ghost" onClick=${() => close('remove')}>Remover da lista (nome errado)</button>`}
    </div>
    <div class="foot"><button class="btn ghost" onClick=${() => close(false)}>Fechar</button></div>
  </div>`;
}

function RenameDialog({ player, close }) {
  const [name, setName] = useState(player.name);
  return html`<form class="modal glass" onSubmit=${(e) => { e.preventDefault(); close(name); }}>
    <h2>Editar nome</h2>
    <label class="field">Nome<input class="input" autofocus value=${name} onInput=${(e) => setName(e.target.value)} /></label>
    <div class="foot"><button type="button" class="btn ghost" onClick=${() => close(false)}>Cancelar</button><button class="btn primary">Salvar</button></div>
  </form>`;
}

async function playerMenu(f, id) {
  const p = f.players.find((x) => x.id === id);
  if (!p) return;
  const choice = await openDialog((close) => html`<${PlayerMenu} f=${f} p=${p} close=${close} />`);
  if (choice === 'quit') {
    const team = F.teamOf(f, p.id);
    const next = f.session?.queue[0];
    const body = team
      ? (next ? `${F.nameOf(f, next)}, o primeiro da fila, entra no lugar de ${p.name} no Time ${team}. O placar e as rodadas anteriores não mudam; a troca fica registrada nesta rodada.` : `Não há ninguém na fila: o Time ${team} fica com um jogador a menos. O placar e as rodadas anteriores não mudam.`)
      : 'O nome fica riscado na lista e sai das próximas escalações. O histórico é mantido.';
    if (!await confirmDialog({ title: `${p.name} não quer mais jogar?`, body, confirmLabel: 'Confirmar desistência', danger: true })) return;
    const sub = act((d) => F.withdraw(d.football, p.id));
    if (sub !== undefined) toast(sub?.inName ? `${sub.inName} entrou no lugar de ${p.name}.` : `${p.name} saiu do rodízio.`, 'ok');
  } else if (choice === 'rejoin') {
    if (await confirmDialog({ title: `${p.name} vai voltar a jogar?`, body: f.session ? 'Entra no fim da fila, sem passar na frente de ninguém.' : 'Volta para a lista de presentes.', confirmLabel: 'Voltar a jogar' })) act((d) => F.rejoin(d.football, p.id), `${p.name} voltou para a fila.`);
  } else if (choice === 'rename') {
    const next = await openDialog((close) => html`<${RenameDialog} player=${p} close=${close} />`);
    if (next) act((d) => F.renamePlayer(d.football, p.id, next));
  } else if (choice === 'remove') {
    if (await confirmDialog({ title: `Remover ${p.name}?`, body: 'Use só para nome digitado errado. Dá para desfazer depois.', confirmLabel: 'Remover', danger: true })) act((d) => F.removePlayer(d.football, p.id));
  }
}

// ------------------------------------------------------------------ campo e filas
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

// ------------------------------------------------------------------ lista de chegada
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
  const present = F.presentPlayers(f).length;
  const quit = f.players.filter((p) => p.quit).length;
  return html`<section class="glass card fb-list">
    <div class="panel-head"><div><span class="overline">Ordem de chegada</span><h2>${present} jogando <small>de ${f.players.length}${quit ? ` · ${quit} ${quit === 1 ? 'desistiu' : 'desistiram'}` : ''}</small></h2></div></div>
    ${admin && html`<form class="fb-add" onSubmit=${add}>
      <label class="sr" for="fb-new">Nome do jogador</label>
      <input id="fb-new" ref=${input} class="input" placeholder=${f.players.length >= F.MAX_PLAYERS ? 'Lista completa' : `Jogador ${NUM(f.players.length)}`} autocomplete="off" disabled=${f.players.length >= F.MAX_PLAYERS} value=${name} onInput=${(e) => setName(e.target.value)} />
      <button class="btn primary" disabled=${!name.trim()}>Adicionar</button>
    </form>`}
    ${f.players.length === 0 && html`<p class="muted fb-empty">${admin ? 'Conforme a galera for chegando, adicione os nomes aqui.' : 'A lista ainda está vazia.'}</p>`}
    ${admin && f.players.length > 0 && html`<p class="muted hint fb-tip">Toque num nome para marcar desistência, editar ou remover.</p>`}
    <ol class="fb-arrivals">
      ${f.players.map((p, i) => html`<li key=${p.id} class=${p.quit ? 'quit' : p.present ? '' : 'away'}>
        <i>${NUM(i)}</i>
        ${admin ? html`<button class="fb-arr-name linklike" onClick=${() => playerMenu(f, p.id)}>${p.name}</button>` : html`<span class="fb-arr-name">${p.name}</span>`}
        ${p.quit && html`<span class="chip fb-quit">Desistiu</span>`}
        ${admin && !p.quit && html`<label class="fb-here" title="Presente"><input type="checkbox" checked=${p.present} onChange=${(e) => act((d) => F.setPresent(d.football, p.id, e.target.checked))} aria-label=${'Presença de ' + p.name} /></label>`}
      </li>`)}
    </ol>
  </section>`;
}

// ------------------------------------------------------------------ rodadas (fotografias, nunca reescritas)
function RoundTeam({ names, label, state }) {
  return html`<div class=${'fb-rt ' + state}><b>${label}</b>${state === 'won' ? html`<span class="chip fb-win">Venceu · ficou</span>` : state === 'lost' ? html`<span class="chip fb-lost-chip">Perdeu · fila</span>` : null}
    <span>${names.join(', ')}</span></div>`;
}

function Rounds({ f }) {
  const s = f.session;
  if (!s) return null;
  return html`<section class="glass card fb-history">
    <span class="overline">Rodadas de hoje</span>
    <ol>
      ${s.rounds.map((r) => html`<li key=${r.no} class="fb-round">
        <header><b>Rodada ${RD(r.no)}</b><small>${hhmm(r.at)}</small></header>
        ${r.names ? html`<${RoundTeam} label="Time A" names=${r.names.A} state=${r.winner === 'A' ? 'won' : 'lost'} />
          <${RoundTeam} label="Time B" names=${r.names.B} state=${r.winner === 'B' ? 'won' : 'lost'} />`
          : html`<span>Time ${r.winner} venceu. Time ${r.loser} perdeu.</span>`}
        ${r.subs?.map((x, i) => html`<small key=${i} class="fb-sub">Substituição: ${x.inName ? `${x.inName} entrou no lugar de ${x.outName}` : `${x.outName} saiu sem reposição`} (${x.reason}, ${hhmm(x.at)}).</small>`)}
      </li>`)}
      <li class="fb-round current">
        <header><b>Rodada ${RD(s.gameNo)}</b><span class="chip live">Em campo</span></header>
        <${RoundTeam} label="Time A" names=${s.teams.A.map((id) => F.nameOf(f, id))} state="now" />
        <${RoundTeam} label="Time B" names=${s.teams.B.map((id) => F.nameOf(f, id))} state="now" />
        ${s.subs.filter((x) => x.round === s.gameNo).map((x, i) => html`<small key=${i} class="fb-sub">Substituição: ${x.inName ? `${x.inName} entrou no lugar de ${x.outName}` : `${x.outName} saiu sem reposição`} (${x.reason}).</small>`)}
      </li>
    </ol>
  </section>`;
}

// ------------------------------------------------------------------ estatísticas
function Stats({ f }) {
  const rows = F.stats(f);
  if (!rows.length) return null;
  const notYet = rows.filter((r) => r.state === 'ainda não jogou').length;
  return html`<details class="glass card fb-stats">
    <summary><span class="overline">Estatísticas do dia</span> <b>${rows.filter((r) => r.games).length} jogaram</b>${notYet ? ` · ${notYet} ainda não jogaram` : ''}</summary>
    <div class="fb-table-wrap"><table class="fb-table">
      <thead><tr><th>Nome</th><th title="Jogos">J</th><th title="Vitórias">V</th><th title="Derrotas">D</th><th>Times</th><th>Situação</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr key=${r.id} class=${r.quit ? 'quit' : ''}>
        <td>${r.name}</td><td>${r.games}</td><td>${r.wins}</td><td>${r.losses}</td>
        <td class="fb-teams">${r.teams.map((t) => html`<span class=${t.won ? 'w' : 'l'} title=${`Rodada ${t.round}`}>${RD(t.round)}${t.team}</span>`)}</td>
        <td>${r.state}${r.subIn ? ` · entrou ${r.subIn}×` : ''}${r.subOut ? ` · substituído ${r.subOut}×` : ''}</td>
      </tr>`)}</tbody>
    </table></div>
  </details>`;
}

// ------------------------------------------------------------------ financeiro (só administrador)
// No site online (Supabase) o financeiro fica numa tabela protegida, fora do documento público.
// No servidor da rede interna e no modo local ele continua no documento.
function useFinance(f, admin) {
  const prot = store.mode === 'cloud';
  const [remote, setRemote] = useState(null);
  const [error, setError] = useState(null);
  const call = (fn) => sports.init().then(() => sports.admin(fn));
  const load = async () => {
    setError(null);
    try {
      const r = await call((db, t) => db.finGet(t));
      const rec = F.normalizeFinanceRecord(r.data);
      let rev = r.rev;
      // financeiro gravado no documento público por uma versão anterior: move para a tabela e limpa o documento
      if (F.hasFinance(f.finance)) {
        if (!F.hasFinance(rec.current)) {
          rec.current = structuredClone(f.finance);
          rev = (await call((db, t) => db.finSave(t, rev, rec))).rev;
        }
        act((d) => { d.football.finance = F.newFinance(); });
      }
      setRemote({ rec, rev });
    } catch (e) { setError(e.message || 'Não foi possível abrir o financeiro.'); }
  };
  useEffect(() => { if (prot && admin) load(); }, [prot, admin]);
  const write = async (mutate) => {
    const rec = structuredClone(remote.rec);
    mutate(rec);
    try {
      const { rev } = await call((db, t) => db.finSave(t, remote.rev, rec));
      setRemote({ rec, rev });
    } catch (e) {
      if (e.status === 409) load();
      throw e;
    }
  };
  const fin = prot ? remote?.rec.current : f.finance;
  return {
    prot, fin, error, reload: load,
    view: fin && { ...f, finance: fin },
    archive: prot ? remote?.rec.archive || [] : [],
    async run(fn, msg) {
      if (!prot) return act((d) => fn(d.football), msg);
      try {
        await write((rec) => fn({ ...f, finance: rec.current }));
        if (msg) toast(msg, 'ok');
      } catch (e) { handleError(e); }
    },
    // nova terça: guarda o resumo do dia e zera os pagamentos. false = não conseguiu gravar.
    async closeDay() {
      if (!prot) return true;
      if (!remote) return false;
      try { await write((rec) => F.closeFinanceDay(f, rec)); return true; } catch (e) { handleError(e); return false; }
    },
  };
}

function Finance({ f, money }) {
  const { fin, view, run, prot, error, reload, archive } = money;
  const [price, setPrice] = useState(String(fin?.pricePerHour || ''));
  const [hours, setHours] = useState(String(fin?.hours || ''));
  useEffect(() => { setPrice(String(fin?.pricePerHour || '')); setHours(String(fin?.hours || '')); }, [fin?.pricePerHour, fin?.hours]);
  if (!fin) {
    return html`<section class="glass card fb-finance"><span class="overline">Financeiro</span>
      ${error ? html`<p class="notice warn">${error} <button class="btn sm" onClick=${reload}>Tentar de novo</button></p>`
        : html`<p class="muted">Abrindo o financeiro protegido…</p>`}</section>`;
  }
  const sum = F.financeSummary(view);
  const save = (e) => {
    e.preventDefault();
    run((x) => F.setFinance(x, { pricePerHour: String(price).replace(',', '.') || 0, hours: String(hours).replace(',', '.') || 0 }), 'Valores salvos.');
  };
  const outOfSplit = f.players.filter((p) => !F.inSplit(view, p));
  return html`<details class="glass card fb-finance" open=${sum.total > 0}>
    <summary><span class="overline">Financeiro</span> <b>${sum.total ? `${brl(sum.received)} de ${brl(sum.total)} recebidos` : 'Defina o valor da quadra'}</b></summary>
    <form class="fb-fin-form" onSubmit=${save}>
      <label class="field">Preço por hora (R$)<input class="input" inputmode="decimal" value=${price} onInput=${(e) => setPrice(e.target.value)} /></label>
      <label class="field">Duração (horas)<input class="input" inputmode="decimal" value=${hours} onInput=${(e) => setHours(e.target.value)} /></label>
      <button class="btn primary">Salvar valores</button>
    </form>
    ${sum.total > 0 && html`
      <div class="fb-fin-tiles">
        <div><small>Total previsto</small><b>${brl(sum.total)}</b></div>
        <div><small>Por pessoa</small><b>${sum.count ? brl(Math.round(sum.perPerson)) : '—'}</b><small>${sum.count} no rateio</small></div>
        <div class="ok"><small>Recebido</small><b>${brl(sum.received)}</b><small>${sum.paidCount} pagos</small></div>
        <div class="warn"><small>Pendente</small><b>${brl(sum.pending)}</b><small>${sum.pendingCount} pendentes</small></div>
      </div>
      <ul class="fb-pay">${sum.rows.map((r) => html`<li key=${r.id} class=${r.paid ? 'paid' : ''}>
        <span class="fb-pay-name">${r.name}${r.quit ? html` <small class="muted">(desistiu)</small>` : ''}</span>
        <b>${brl(r.due)}</b>
        <span class=${'chip ' + (r.paid ? 'fb-win' : 'plain')}>${r.paid ? 'PAGO' : 'Pendente'}</span>
        <button class="btn sm ${r.paid ? 'ghost' : ''}" onClick=${() => run((x) => F.setPaid(x, r.id, !r.paid))}>${r.paid ? 'Desmarcar' : 'Marcar pago'}</button>
        ${!r.paid && html`<button class="btn sm ghost" title="Tirar do rateio" onClick=${() => run((x) => F.setSplit(x, r.id, false))}>Tirar</button>`}
      </li>`)}</ul>
      ${outOfSplit.length > 0 && html`<p class="muted hint">Fora do rateio: ${outOfSplit.map((p, i) => html`${i ? ', ' : ''}<button class="linklike" onClick=${() => run((x) => F.setSplit(x, p.id, true))}>${p.name}</button>`)}. Toque para incluir.</p>`}
    `}
    ${fin.log.length > 0 && html`<details class="fb-fin-log"><summary>Histórico de alterações (${fin.log.length})</summary>
      <ul>${fin.log.slice().reverse().map((l, i) => html`<li key=${i}>${fmtDate(l.at)} · ${l.what}</li>`)}</ul></details>`}
    ${archive.length > 0 && html`<details class="fb-fin-log"><summary>Terças anteriores (${archive.length})</summary>
      <ul>${archive.map((a) => html`<li key=${a.closedAt}>${fmtDate(a.at)} · ${brl(a.summary.received)} de ${brl(a.summary.total)} recebidos · ${a.summary.paidCount} pagos, ${a.summary.pendingCount} pendentes${a.summary.pendingCount ? `: ${a.summary.rows.filter((r) => !r.paid).map((r) => r.name).join(", ")}` : ""}</li>`)}</ul></details>`}
    <p class="muted hint">${prot ? "Guardado em área protegida: só o administrador vê. " : ""}Sem integração com banco: o administrador marca quem pagou.</p>
  </details>`;
}

// ------------------------------------------------------------------ página
export function FootballPage() {
  const t = useDoc();
  const f = t.football;
  const admin = store.admin;
  const s = f.session;
  const root = useRef(null);
  const [swapping, setSwapping] = useState(false);
  const [picked, setPicked] = useState(null);
  const [drawing, setDrawing] = useState(null);
  const money = useFinance(f, admin);
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
    const names = F.presentPlayers(f).slice(0, F.MIN_PLAYERS).map((p) => p.name);
    if (names.length < F.MIN_PLAYERS) { act((d) => F.startSession(d.football)); return; }
    sfx.roll();
    // alguns instantes de nomes girando; o sorteio de verdade acontece no fim, uma única vez
    const spin = () => setDrawing(F.shuffle(names));
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
    if (s && !await confirmDialog({ title: 'Sortear de novo?', body: 'Os times em campo e a fila serão refeitos. As rodadas já jogadas ficam no histórico. Dá para desfazer depois.', confirmLabel: 'Sortear de novo', danger: true })) return;
    runDraw();
  };
  const result = (winner) => {
    act((d) => F.registerWinner(d.football, winner));
    sfx.win();
  };
  // fora do modo de troca, tocar num nome abre o menu do participante
  const pick = swapping ? (id) => {
    if (!picked) { setPicked(id); return; }
    if (picked !== id) act((d) => F.swapPlayers(d.football, picked, id));
    setPicked(null);
  } : admin ? (id) => playerMenu(f, id) : null;
  const reset = async () => {
    if (await confirmDialog({ title: 'Reiniciar a sessão?', body: 'Times e filas desta sessão são desfeitos. A lista de nomes fica e as rodadas jogadas vão para "Terças anteriores".', confirmLabel: 'Reiniciar sessão', danger: true, phrase: 'REINICIAR' })) act((d) => F.resetSession(d.football), 'Sessão reiniciada.');
  };
  const tuesday = async () => {
    if (await confirmDialog({ title: 'Começar uma nova terça?', body: 'A lista de nomes e os pagamentos ficam vazios. Rodadas, desistências e pagamentos de hoje são guardados em "Terças anteriores". O valor da quadra é mantido.', confirmLabel: 'Nova terça', danger: true, phrase: 'NOVA' })) {
      // o financeiro protegido fecha antes; se falhar, os pagamentos de hoje ficam abertos e o administrador decide
      if (!await money.closeDay() && !await confirmDialog({ title: 'Financeiro não foi fechado', body: `${money.error || 'Não foi possível gravar o financeiro.'} Começar a nova terça mesmo assim? Os pagamentos de hoje continuam abertos no financeiro.`, confirmLabel: 'Continuar mesmo assim', danger: true })) return;
      act((d) => F.newTuesday(d.football), 'Pronto para a próxima terça.');
    }
  };

  return html`<main class="page football" ref=${root}>
    <div class="page-head">
      <div><span class="overline">${s ? `Rodada ${s.gameNo} em campo` : 'Futebol de terça'}</span><h1>Sorteio de <em>times</em></h1></div>
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
      ${!s && missing <= 0 && html`<p class="muted hint fb-hint">Os 10 primeiros presentes são sorteados entre os dois times. Os demais esperam na ordem de chegada.</p>`}
      ${swapping && html`<p class="notice fb-hint">${picked ? `Agora toque em quem vai trocar de lugar com ${F.nameOf(f, picked)}.` : 'Toque em dois nomes para trocar os dois de lugar.'}</p>`}
      ${s && !swapping && html`<p class="muted hint fb-hint">Toque num nome para marcar que a pessoa não quer mais jogar.</p>`}
    </section>`}

    <div class="fb-bottom">
      <${PlayerList} f=${f} admin=${admin} />
      <${Rounds} f=${f} />
    </div>
    <${Stats} f=${f} />
    ${admin && html`<${Finance} f=${f} money=${money} />`}

    ${admin && f.archive.length > 0 && html`<details class="glass card fb-archive"><summary>Terças anteriores (${f.archive.length})</summary>
      <ul>${f.archive.map((a) => html`<li key=${a.at + '-' + (a.closedAt || 0)}><details><summary>${fmtDate(a.at)}: ${a.players.length ?? a.players} jogadores, ${a.games.length} ${a.games.length === 1 ? 'rodada' : 'rodadas'}${a.finance?.total ? ` · ${brl(a.finance.received)} de ${brl(a.finance.total)} recebidos` : ''}</summary>
        <ol class="fb-arch-rounds">${(a.games[0]?.legacy || (a.games.length > 1 && a.games[0].no > a.games[1].no) ? a.games.slice().reverse() : a.games).map((r) => html`<li key=${r.no}>Rodada ${RD(r.no)}: ${r.names ? `${r.names.A.join(', ')} x ${r.names.B.join(', ')} · Time ${r.winner} venceu` : `Time ${r.winner} venceu`}</li>`)}</ol>
        ${a.players.filter?.((p) => p.quit).length > 0 && html`<p class="muted">Desistências: ${a.players.filter((p) => p.quit).map((p) => p.name).join(', ')}</p>`}
      </details></li>`)}</ul></details>`}
  </main>`;
}
