import { html, useEffect, useDoc, Ava, store, useStage, avatarOf, playerById, displayName } from './lib.js';
import * as E from '../core/engine.js';
import { TableStage } from '../three/stage.js';
import { avatarFromName, webglAvailable } from '../three/avatars.js';

export function heroPair(t) {
  const m = E.liveMatches(t)[0] || E.nextMatch(t) || E.lastResult(t);
  const a = m && playerById(t, m.p[0]), b = m && playerById(t, m.p[1]);
  if (a && b) return [avatarOf(a), avatarOf(b)];
  if (t.players.length >= 2) return [avatarOf(t.players[0]), avatarOf(t.players[1])];
  return [avatarFromName('Tutory', 'male'), avatarFromName('Sports', 'female')];
}

export function Versus({ t, m, size = 72, label }) {
  const a = playerById(t, m.p[0]), b = playerById(t, m.p[1]);
  const wins = E.gameWins(m, t.scoring);
  const score = (s) => (m.manual ? m.manual[s] : m.wo ? (m.winner === m.p[s] ? 'WO' : '–') : wins[s]);
  const played = E.isFinished(m) || m.status === 'live';
  return html`<a class="vs-card" href=${'#/partida/' + m.id}>
    ${label && html`<span class="overline">${label}</span>`}
    <div class="vs-row">
      <div class=${'vs-side ' + (m.loser === m.p[0] ? 'lost' : '')}><${Ava} player=${a} size=${size} state=${m.winner && m.winner === m.p[0] ? 'win' : ''} /><b>${displayName(a) || 'A definir'}</b></div>
      ${played ? html`<div class="vs-score"><b>${score(0)}</b><i>x</i><b>${score(1)}</b></div>` : html`<div class="vs-mark">VS</div>`}
      <div class=${'vs-side ' + (m.loser === m.p[1] ? 'lost' : '')}><${Ava} player=${b} size=${size} state=${m.winner && m.winner === m.p[1] ? 'win' : ''} /><b>${displayName(b) || 'A definir'}</b></div>
    </div>
    <span class="muted vs-meta">${t.bracket.rounds[m.round].name} · Jogo ${m.number}${m.games.length ? ' · ' + E.scoreText(t, m) : ''}</span>
  </a>`;
}

const Stat = ({ value, label }) => html`<div class="stat"><b>${value}</b><span>${label}</span></div>`;

export function FlowSteps({ t }) {
  const status = E.tournamentStatus(t);
  const steps = [
    ['Definir as regras', '#/regulamento', !!t.regulation.location || !!t.regulation.date],
    ['Inscrever participantes', '#/jogadores', t.players.length >= 2],
    ['Cada um escolhe o avatar', '#/jogadores', t.players.length > 0 && t.players.every((p) => p.avatar)],
    ['Sortear ao vivo', '#/sorteio', t.draw.status === 'done'],
    ['Disputar as partidas', '#/partidas', status.key === 'finished'],
    ['Consagrar o campeão', '#/campeao', status.key === 'finished'],
  ];
  const current = steps.findIndex((s) => !s[2]);
  return html`<ol class="flow">${steps.map(([label, href, done], i) => html`<li key=${label} class=${done ? 'done' : i === current ? 'now' : ''}><a href=${href}><i>${String(i + 1).padStart(2, '0')}</i>${label}</a></li>`)}</ol>`;
}

export function HomePage() {
  const t = useDoc();
  const [host, stage] = useStage((el) => new TableStage(el));
  const [pa, pb] = heroPair(t);
  useEffect(() => { stage.current?.setPlayers(pa, pb); }, [JSON.stringify([pa, pb])]);
  const status = E.tournamentStatus(t);
  const stats = E.computeStats(t);
  const next = E.nextMatch(t);
  const live = E.liveMatches(t)[0];
  const last = E.lastResult(t);
  const champion = E.champion(t);
  const reg = t.regulation;
  const when = [reg.date && reg.date.split('-').reverse().join('/'), reg.time, reg.location].filter(Boolean).join(' · ');
  return html`<main>
    <section class="hero">
      <div class="hero-stage stage-host" ref=${host}></div>
      <div class="hero-fade"></div>
      <div class="hero-copy">
        ${t.meta.logo && html`<img class="hero-logo" src=${t.meta.logo} alt="" />`}
        <div class="hero-tags"><span class=${'chip ' + (status.key === 'running' || status.key === 'draw' ? 'live' : status.key === 'finished' ? 'champion' : 'next')}>${status.label}</span><span class="chip plain">${t.meta.edition}</span></div>
        <h1 class="hero-title">TUTORY SPORTS</h1>
        <p class="hero-sub">${t.meta.name}</p>
        ${when && html`<p class="hero-when">${when}</p>`}
        <div class="actions hero-cta">
          ${!E.isLocked(t) && t.draw.status !== 'done' && html`<a class="btn primary lg" href="#/sorteio">${t.draw.status === 'live' ? 'Acompanhar sorteio' : 'Iniciar sorteio'} <span class="arrow">→</span></a>`}
          ${(t.draw.status === 'done') && html`<a class="btn primary lg" href="#/chave">Ver chaveamento <span class="arrow">→</span></a>`}
          ${t.draw.status !== 'done' && html`<a class="btn lg" href="#/chave">Ver chaveamento</a>`}
          <a class="btn lg" href="#/jogadores">${store.admin ? 'Cadastrar participantes' : 'Participantes'}</a>
        </div>
      </div>
      <div class="hero-stats glass">
        <${Stat} value=${stats.totalPlayers} label="Participantes" />
        <${Stat} value=${stats.totalMatches} label="Partidas" />
        <${Stat} value=${stats.finished} label="Concluídas" />
        <${Stat} value=${stats.pending} label="Pendentes" />
      </div>
    </section>
    <div class="page home-grid">
      ${champion && html`<a href="#/campeao" class="glass champ-banner">
        <${Ava} player=${champion} size=${96} state="champ" />
        <div><span class="overline gold">Campeão</span><h2>${champion.name}</h2><p class="muted">Vice: ${E.viceChampion(t)?.name}. Toque para rever a consagração.</p></div>
      </a>`}
      ${live && html`<div class="glass card live-box"><${Versus} t=${t} m=${live} size=${96} label="Agora em quadra" /></div>`}
      ${!live && next && html`<div class="glass card"><${Versus} t=${t} m=${next} size=${84} label="Próximo confronto" /></div>`}
      ${last && html`<div class="glass card"><${Versus} t=${t} m=${last} size=${84} label="Último resultado" /></div>`}
      ${!next && !last && !champion && html`<div class="glass card home-wait"><span class="overline">Próximo confronto</span><h3>Sai no sorteio</h3><p class="muted">${t.players.length < 2 ? 'Inscreva os participantes para liberar o sorteio.' : `${t.players.length} participantes prontos. ${E.formatSummary(E.eligiblePlayers(t).length, t.settings.oddMode).text}`}</p></div>`}
      ${status.key !== 'finished' && html`<div class="glass card"><span class="overline">Como funciona</span><${FlowSteps} t=${t} /></div>`}
    </div>
    ${!webglAvailable() && html`<p class="muted" style="text-align:center;padding-bottom:40px">Este aparelho não oferece WebGL. As cenas 3D foram trocadas por retratos com as iniciais.</p>`}
  </main>`;
}
