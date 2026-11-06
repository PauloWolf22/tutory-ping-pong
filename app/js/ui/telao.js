import { html, useState, useEffect, useRef, useDoc, store, Ava, avatarOf, playerById, displayName, useStage, toast } from './lib.js';
import * as E from '../core/engine.js';
import { TableStage, VersusStage } from '../three/stage.js';
import { DrawShow } from './draw.js';
import { Bracket } from './bracket.js';
import { Scoreboard } from './match.js';
import { ChampionShow } from './champion.js';
import { heroPair } from './home.js';
import { setSound, soundOn, sfx } from './sfx.js';

// Partida exibida: a escolhida pelo administrador, senão a que está rolando, senão a próxima.
const focusMatch = (t) => (t.display.matchId && t.matches[t.display.matchId]) || E.liveMatches(t)[0] || E.nextMatch(t) || E.lastResult(t);

function Brandbar({ t, right }) {
  return html`<header class="tv-bar">
    <div class="tv-brand"><img src=${t.meta.logo || 'assets/brand/logo-branco.png'} alt="" /><span>${t.meta.name}</span></div>
    <div class="tv-right">${right}</div>
  </header>`;
}

function MiniMatch({ t, m, label }) {
  const [a, b] = m.p.map((id) => playerById(t, id));
  return html`<div class="tv-mini glass"><span class="overline">${label}</span>
    <div class="tv-mini-row"><${Ava} player=${a} size=${64} /><b>${displayName(a) || 'A definir'}</b><i>${E.isFinished(m) ? E.scoreText(t, m) : 'VS'}</i><b>${displayName(b) || 'A definir'}</b><${Ava} player=${b} size=${64} /></div>
    <small>${t.bracket.rounds[m.round].name}</small></div>`;
}

function TvHome({ t }) {
  const [host, stage] = useStage((el) => new TableStage(el));
  const [pa, pb] = heroPair(t);
  useEffect(() => { stage.current?.setPlayers(pa, pb); }, [JSON.stringify([pa, pb])]);
  const next = E.nextMatch(t);
  const last = E.lastResult(t);
  const s = E.computeStats(t);
  const status = E.tournamentStatus(t);
  return html`<section class="tv-screen tv-home">
    <div class="tv-full stage-host" ref=${host}></div>
    <div class="tv-home-fade"></div>
    <div class="tv-home-copy">
      <span class=${'chip ' + (status.key === 'running' ? 'live' : 'next')}>${status.label}</span>
      <h1>${t.meta.name}</h1>
      <p>${t.meta.edition}</p>
    </div>
    <div class="tv-home-foot">
      <div class="tv-nums glass"><div><b>${s.totalPlayers}</b><span>Jogadores</span></div><div><b>${s.totalMatches}</b><span>Partidas</span></div><div><b>${s.finished}</b><span>Concluídas</span></div></div>
      ${next && html`<${MiniMatch} t=${t} m=${next} label="Próxima partida" />`}
      ${last && html`<${MiniMatch} t=${t} m=${last} label="Último resultado" />`}
    </div>
  </section>`;
}

function TvVersus({ t }) {
  const [host, stage] = useStage((el) => new VersusStage(el));
  const m = focusMatch(t);
  const [a, b] = m ? m.p.map((id) => playerById(t, id)) : [null, null];
  useEffect(() => { stage.current?.setPlayers(a ? avatarOf(a) : null, b ? avatarOf(b) : null); }, [JSON.stringify([a?.avatar, a?.id, b?.avatar, b?.id])]);
  useEffect(() => { if (m?.winner) setTimeout(() => stage.current?.setOutcome(m.p.indexOf(m.winner)), 300); }, [m?.winner]);
  if (!m) return html`<section class="tv-screen tv-center"><h1>Aguardando o sorteio</h1></section>`;
  return html`<section class="tv-screen tv-versus">
    <div class="tv-full stage-host" ref=${host}></div>
    <div class="tv-vs-head"><span class="overline">Jogo ${m.number}</span><h1>${t.bracket.rounds[m.round].name}</h1></div>
    <div class="tv-vs-mark" key=${m.id}>VS</div>
    <div class="tv-vs-foot">
      <div><small>${a ? 'Nº ' + String(a.number).padStart(2, '0') : ''}</small><h2>${displayName(a) || 'A definir'}</h2></div>
      <div class="r"><small>${b ? 'Nº ' + String(b.number).padStart(2, '0') : ''}</small><h2>${displayName(b) || 'A definir'}</h2></div>
    </div>
  </section>`;
}

function TvScore({ t }) {
  const [host, stage] = useStage((el) => new TableStage(el, { rally: false }));
  const m = focusMatch(t);
  const [a, b] = m ? m.p.map((id) => playerById(t, id)) : [null, null];
  const lastPoint = useRef(m?.lastPoint?.at);
  useEffect(() => { stage.current?.setPlayers(a ? avatarOf(a) : null, b ? avatarOf(b) : null); }, [JSON.stringify([a?.avatar, a?.id, b?.avatar, b?.id])]);
  useEffect(() => {
    if (!stage.current || !m) return;
    stage.current.rallyOn = m.status === 'live' && E.pendingWinner(t, m) === null;
    if (m.winner) setTimeout(() => stage.current?.finish(m.p.indexOf(m.winner)), 400);
  }, [m?.status, m?.winner, m?.id]);
  useEffect(() => {
    if (!m?.lastPoint || m.lastPoint.at === lastPoint.current) return;
    lastPoint.current = m.lastPoint.at;
    sfx.point();
    stage.current?.celebrate(m.lastPoint.side);
  }, [m?.lastPoint?.at]);
  if (!m) return html`<section class="tv-screen tv-center"><h1>Aguardando o sorteio</h1></section>`;
  return html`<section class="tv-screen tv-score">
    <div class="tv-score-stage stage-host" ref=${host}></div>
    <div class="tv-score-title"><span class="overline">Jogo ${m.number}</span><h1>${t.bracket.rounds[m.round].name}</h1></div>
    <div class="tv-score-board"><${Scoreboard} t=${t} m=${m} big=${true} /></div>
  </section>`;
}

function TvBracket({ t }) {
  if (!t.bracket) return html`<section class="tv-screen tv-center"><span class="overline">Chaveamento</span><h1>A chave sai no sorteio</h1></section>`;
  return html`<section class="tv-screen tv-bracket"><div class="tv-bracket-box"><${Bracket} t=${t} fit=${true} link=${false} /></div></section>`;
}

function TvDraw({ t }) {
  if (t.draw.status === 'idle') {
    return html`<section class="tv-screen tv-center"><span class="overline">Sorteio ao vivo</span><h1>Prepare-se: o sorteio vai começar</h1>
      <div class="tv-grid">${E.eligiblePlayers(t).slice(0, 40).map((p) => html`<${Ava} key=${p.id} player=${p} size=${88} />`)}</div></section>`;
  }
  return html`<section class="tv-screen tv-draw"><${DrawShow} t=${t} big=${true} /></section>`;
}

export function TelaoPage() {
  const t = useDoc();
  const [sound, setSoundState] = useState(soundOn());
  const [idle, setIdle] = useState(false);
  const mode = t.display.mode;
  useEffect(() => {
    let timer;
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), 3000);
    };
    wake();
    addEventListener('pointermove', wake);
    return () => { removeEventListener('pointermove', wake); clearTimeout(timer); };
  }, []);
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else {
      const r = document.documentElement.requestFullscreen?.();
      if (r) r.catch(() => toast('O navegador bloqueou a tela cheia. Pressione F11.'));
      else toast('Pressione F11 para usar a tela cheia.');
    }
  };
  const screen = {
    home: () => html`<${TvHome} t=${t} />`, draw: () => html`<${TvDraw} t=${t} />`, versus: () => html`<${TvVersus} t=${t} />`,
    score: () => html`<${TvScore} t=${t} />`, bracket: () => html`<${TvBracket} t=${t} />`, champion: () => html`<section class="tv-screen"><${ChampionShow} t=${t} big=${true} exit=${false} /></section>`,
  }[mode] || (() => html`<${TvHome} t=${t} />`);
  const key = mode + (mode === 'score' || mode === 'versus' ? t.display.matchId : '');
  return html`<div class=${'telao ' + (idle ? 'idle' : '')}>
    ${mode !== 'champion' && mode !== 'home' && html`<${Brandbar} t=${t} />`}
    <div class="tv-stage" key=${key}>${screen()}</div>
    <div class="tv-tools">
      <button class="btn sm" onClick=${() => { setSound(!sound); setSoundState(!sound); }} aria-pressed=${sound}>${sound ? 'Som ligado' : 'Ligar som'}</button>
      <button class="btn sm" onClick=${fullscreen}>Tela cheia</button>
    </div>
    ${store.remote && !store.online && html`<div class="offline" role="status">Reconectando…</div>`}
  </div>`;
}
