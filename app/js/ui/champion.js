import { html, useEffect, useRef, useDoc, store, avatarOf, playerById, displayName, useStage, Ava, act } from './lib.js';
import * as E from '../core/engine.js';
import { ChampionStage } from '../three/stage.js';
import { sfx } from './sfx.js';

export function ChampionShow({ t, big = false, exit = true }) {
  const [host, stage] = useStage((el) => new ChampionStage(el));
  const champion = E.champion(t);
  const vice = E.viceChampion(t);
  useEffect(() => {
    stage.current?.setPlayers(champion ? { ...avatarOf(champion), medal: 'gold' } : null, vice ? avatarOf(vice) : null);
    if (champion) sfx.fanfare();
  }, [champion?.id, vice?.id]);
  if (!champion) {
    return html`<div class=${'ch-show ' + (big ? 'big' : '')}><div class="ch-empty"><span class="overline gold">Grande final</span><h2>O campeão ainda não foi definido</h2>
      ${exit && html`<a class="btn" href="#/chave">Ver chaveamento</a>`}</div></div>`;
  }
  const stats = E.computeStats(t);
  const row = stats.ranking.find((r) => r.player.id === champion.id);
  const campaign = E.playerMatches(t, champion.id).filter((m) => m.winner === champion.id);
  return html`<div class=${'ch-show ' + (big ? 'big' : '')}>
    <div class="ch-rays"></div>
    <div class="ch-canvas stage-host" ref=${host}></div>
    <header class="ch-title">
      <span class="overline gold">Campeão do ${t.meta.name}</span>
      <h1>${champion.name}</h1>
      ${champion.nick && html`<p class="ch-nick">"${champion.nick}"</p>`}
    </header>
    <aside class="ch-panel glass left">
      <span class="overline gold">Campanha</span>
      <ol class="ch-camp">${campaign.map((m) => {
        const opp = playerById(t, m.p.find((x) => x !== champion.id));
        return html`<li key=${m.id}><small>${E.roundOf(t, m).short}</small><span>${m.bye ? 'BYE' : displayName(opp)}</span><b>${m.bye ? '' : E.scoreText(t, m)}</b></li>`;
      })}</ol>
    </aside>
    <aside class="ch-panel glass right">
      <span class="overline gold">O torneio</span>
      <dl class="ch-stats">
        <div><dt>Vice-campeão</dt><dd>${vice?.name}</dd></div>
        ${stats.third && html`<div><dt>3º lugar</dt><dd>${stats.third.name}</dd></div>`}
        ${stats.consolation && html`<div><dt>Campeão da repescagem</dt><dd>${stats.consolation.name}</dd></div>`}
        <div><dt>Participantes</dt><dd>${stats.totalPlayers}</dd></div>
        <div><dt>Partidas</dt><dd>${stats.finished}</dd></div>
        <div><dt>Vitórias do campeão</dt><dd>${row.wins}</dd></div>
        <div><dt>Pontos do campeão</dt><dd>${row.pointsFor}</dd></div>
        ${stats.biggestMargin && html`<div><dt>Maior diferença</dt><dd>${stats.biggestMargin.margin} pts</dd></div>`}
      </dl>
    </aside>
    ${exit && html`<div class="ch-exit"><a class="btn" href="#/chave">Ver chaveamento</a><a class="btn" href="#/estatisticas">Estatísticas</a></div>`}
  </div>`;
}

export function ChampionPage() {
  const t = useDoc();
  return html`<main class="ch-page"><${ChampionShow} t=${t} /></main>`;
}
