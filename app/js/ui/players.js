import { html, useState, useMemo, store, useDoc, act, Ava, openDialog, confirmDialog, toast, go, avatarOf, playerById, displayName, handleError } from './lib.js';
import * as E from '../core/engine.js';
import { avatarFromName } from '../three/avatars.js';

function PlayerForm({ player, close, t }) {
  const [form, set] = useState({ name: player?.name || '', nick: player?.nick || '', number: player?.number || E.nextPlayerNumber(t) });
  const [error, setError] = useState('');
  const save = (customize) => {
    try {
      let saved;
      store.update((d) => {
        saved = player
          ? E.updatePlayer(d, player.id, { ...form, number: Number(form.number) })
          : E.addPlayer(d, { ...form, number: Number(form.number) }, avatarFromName(form.name));
      });
      close(customize ? saved.id : true);
    } catch (e) {
      if (e instanceof E.UserError) setError(e.message);
      else handleError(e);
    }
  };
  return html`<form class="modal glass" onSubmit=${(e) => { e.preventDefault(); save(false); }}>
    <h2>${player ? 'Editar participante' : 'Novo participante'}</h2>
    <div class="grid2" style="margin-top:14px">
      <label class="field" style="grid-column:1/-1">Nome completo
        <input class="input" autofocus required value=${form.name} onInput=${(e) => set({ ...form, name: e.target.value })} /></label>
      <label class="field">Apelido <input class="input" value=${form.nick} onInput=${(e) => set({ ...form, nick: e.target.value })} /></label>
      <label class="field">Número <input class="input" type="number" min="1" value=${form.number} onInput=${(e) => set({ ...form, number: e.target.value })} /></label>
    </div>
    ${error && html`<p class="form-error" role="alert">${error}</p>`}
    <div class="foot">
      <button type="button" class="btn ghost" onClick=${() => close(false)}>Cancelar</button>
      <button type="button" class="btn" onClick=${() => save(true)}>Salvar e criar avatar</button>
      <button class="btn primary">Salvar</button>
    </div>
  </form>`;
}

function ImportForm({ close }) {
  const [text, setText] = useState('');
  const count = text.split(/\r?\n/).filter((l) => l.trim()).length;
  return html`<div class="modal glass">
    <h2>Importar lista de nomes</h2>
    <p class="body">Um participante por linha. Para informar apelido, use <b>Nome; Apelido</b>. Nomes repetidos são ignorados e listados no final.</p>
    <label class="field" style="margin-top:14px"><span class="sr">Lista de nomes</span>
      <textarea class="input" rows="10" autofocus placeholder=${'Ana Lima; Aninha\nBruno Souza\nCarla Dias'} value=${text} onInput=${(e) => setText(e.target.value)}></textarea></label>
    <div class="foot">
      <button class="btn ghost" onClick=${() => close(false)}>Cancelar</button>
      <button class="btn primary" disabled=${!count} onClick=${() => close(text)}>Importar ${count || ''}</button>
    </div>
  </div>`;
}

function HistoryDialog({ t, player, close }) {
  const matches = E.playerMatches(t, player.id);
  const stats = E.computeStats(t).ranking.find((r) => r.player.id === player.id);
  return html`<div class="modal glass">
    <div class="hist-head"><${Ava} player=${player} size=${72} />
      <div><h2>${player.name}</h2><p class="muted">${player.nick ? `"${player.nick}" · ` : ''}Nº ${player.number}</p></div></div>
    <p class="hist-score"><b>${stats.wins}</b> vitórias · <b>${stats.losses}</b> derrotas · <b>${stats.pointsFor}</b> pontos marcados</p>
    <ul class="hist-list">
      ${matches.length === 0 && html`<li class="muted">Ainda sem partidas.</li>`}
      ${matches.map((m) => {
        const opp = playerById(t, m.p.find((x) => x !== player.id));
        const res = m.bye ? 'BYE' : m.winner === player.id ? 'Vitória' : m.loser === player.id ? 'Derrota' : E.STATUS_LABEL[m.status];
        return html`<li key=${m.id}><span class="overline">${t.bracket.rounds[m.round].short}</span>
          <span class="grow">${m.bye ? 'Avançou direto' : opp ? `contra ${displayName(opp)}` : 'Adversário a definir'}</span>
          <span class="muted">${E.scoreText(t, m)}</span><b class=${m.winner === player.id ? 'c-win' : m.loser === player.id ? 'c-lose' : ''}>${res}</b></li>`;
      })}
    </ul>
    <div class="foot"><button class="btn" onClick=${() => close(false)}>Fechar</button></div>
  </div>`;
}

function CodeDialog({ player, code, close }) {
  const link = `${location.origin}${location.pathname}#/avatar/${player.id}`;
  return html`<div class="modal glass">
    <h2>Acesso de ${displayName(player)}</h2>
    <p class="body">Envie o link e o código. Com eles, a pessoa altera apenas o próprio avatar.</p>
    <label class="field" style="margin-top:14px">Link<input class="input" readonly value=${link} onFocus=${(e) => e.target.select()} /></label>
    <label class="field" style="margin-top:10px">Código pessoal<input class="input code-input" readonly value=${code} onFocus=${(e) => e.target.select()} /></label>
    <div class="foot">
      <button class="btn" onClick=${() => { navigator.clipboard?.writeText(`${link}\nCódigo: ${code}`); toast('Link e código copiados.', 'ok'); }}>Copiar</button>
      <button class="btn primary" onClick=${() => close(false)}>Fechar</button>
    </div>
  </div>`;
}

export function PlayersPage() {
  const t = useDoc();
  const [q, setQ] = useState('');
  const admin = store.admin;
  const stats = useMemo(() => new Map(E.computeStats(t).ranking.map((r) => [r.player.id, r])), [t]);
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = t.players.filter((p) => !q || norm(`${p.name} ${p.nick} ${p.number}`).includes(norm(q)));
  const roster = E.canChangeRoster(t);

  const add = async () => {
    const r = await openDialog((close) => html`<${PlayerForm} t=${t} close=${close} />`);
    if (typeof r === 'string') go('avatar/' + r);
  };
  const edit = async (p) => {
    const r = await openDialog((close) => html`<${PlayerForm} t=${t} player=${p} close=${close} />`);
    if (typeof r === 'string') go('avatar/' + r);
  };
  const remove = async (p) => {
    if (await confirmDialog({ title: `Excluir ${p.name}?`, body: 'O participante e o avatar dele serão apagados.', confirmLabel: 'Excluir', danger: true })) act((d) => E.removePlayer(d, p.id), 'Participante excluído.');
  };
  const importList = async () => {
    const text = await openDialog((close) => html`<${ImportForm} close=${close} />`);
    if (!text) return;
    const r = act((d) => E.importPlayers(d, text, (name) => avatarFromName(name)));
    if (!r) return;
    toast(`${r.added.length} inscritos.${r.skipped.length ? ` ${r.skipped.length} ignorados: ${r.skipped.map((s) => s.line).join(', ')}.` : ''}`, r.skipped.length ? '' : 'ok');
  };
  const access = async (p) => {
    try {
      const code = await store.playerCode(p.id);
      if (!code) { go('avatar/' + p.id); return; }
      openDialog((close) => html`<${CodeDialog} player=${p} code=${code} close=${close} />`);
    } catch (e) { handleError(e); }
  };

  return html`<main class="page">
    <div class="page-head">
      <div><span class="overline">${t.players.length} inscritos</span><h1>Quem entra em <em>quadra</em></h1>
        <p>Cada jogador tem nome, número e um personagem 3D próprio.</p></div>
      ${admin && html`<div class="actions">
        <button class="btn" disabled=${!roster} onClick=${importList}>Importar lista</button>
        <button class="btn primary" disabled=${!roster} onClick=${add}>Adicionar participante</button>
      </div>`}
    </div>
    ${admin && !roster && html`<div class="notice" style="margin-bottom:18px">As inscrições fecharam com o sorteio. Para alterar a lista, refaça o sorteio antes das partidas começarem.</div>`}
    ${t.players.length > 0 && html`<label class="field search"><span class="sr">Pesquisar participantes</span>
      <input class="input" type="search" placeholder="Pesquisar por nome, apelido ou número" value=${q} onInput=${(e) => setQ(e.target.value)} /></label>`}
    ${t.players.length === 0 ? html`<div class="glass empty"><h3>Nenhum participante ainda</h3>
        <p>${admin ? 'Adicione um por um ou importe a lista inteira.' : 'As inscrições são feitas pelo administrador.'}</p>
        ${admin && html`<div class="actions" style="justify-content:center"><button class="btn" onClick=${importList}>Importar lista</button><button class="btn primary" onClick=${add}>Adicionar participante</button></div>`}
      </div>`
    : list.length === 0 ? html`<div class="glass empty"><p>Ninguém encontrado para "${q}".</p></div>`
    : html`<div class="player-grid">
      ${list.map((p) => {
        const r = stats.get(p.id);
        return html`<article key=${p.id} class="glass player-card">
          <button class="player-open" onClick=${() => openDialog((close) => html`<${HistoryDialog} t=${t} player=${p} close=${close} />`)} aria-label=${'Histórico de ' + p.name}>
            <span class="player-num">${String(p.number).padStart(2, '0')}</span>
            <${Ava} player=${p} size=${112} state=${r.status.key === 'champion' ? 'champ' : ''} />
            <h3>${p.name}</h3>
            <p class="muted nick">${p.nick ? `"${p.nick}"` : ' '}</p>
            <div class="player-meta">
              <span class=${'chip ' + r.status.key}>${r.status.label}</span>
              ${p.seed && html`<span class="chip plain next">Cabeça ${p.seed}</span>`}
            </div>
            <p class="player-rec"><b>${r.wins}</b> V <span>·</span> <b>${r.losses}</b> D</p>
          </button>
          <div class="player-actions">
            <a class="btn sm" href=${'#/avatar/' + p.id}>Avatar</a>
            ${admin && html`
              ${store.remote && html`<button class="btn sm ghost" onClick=${() => access(p)}>Acesso</button>`}
              <button class="btn sm ghost" onClick=${() => edit(p)}>Editar</button>
              ${roster && html`<button class="btn sm ghost" onClick=${() => remove(p)} aria-label=${'Excluir ' + p.name}>Excluir</button>`}`}
          </div>
        </article>`;
      })}
    </div>`}
  </main>`;
}
