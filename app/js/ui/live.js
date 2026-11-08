// Partidas ao vivo: tudo que está em quadra agora, em todas as categorias do evento. Espectadores só assistem;
// o administrador abre a partida para marcar pontos.
import { html, useDoc, store } from './lib.js';
import * as E from '../core/engine.js';
import { viewOf, CAT_LABEL } from '../core/event.js';
import { Scoreboard, MatchRow } from './match.js';

// Partidas em quadra (em andamento ou pausadas) de todas as categorias.
export function liveAcross(root) {
  if (!root?.comps) return [];
  return Object.keys(root.comps).flatMap((cat) => {
    const t = viewOf(root, cat);
    return E.liveMatches(t).map((m) => ({ cat, t, m }));
  });
}

export function LivePage() {
  useDoc();
  const root = store.doc;
  const live = liveAcross(root);
  const cats = Object.keys(root.comps);
  const several = cats.length > 1;
  const next = cats.map((cat) => { const t = viewOf(root, cat); return { cat, t, m: E.nextMatch(t) }; }).filter((x) => x.m);
  const open = (cat, m) => { store.setCat(cat); location.hash = '#/partida/' + m.id; };
  return html`<main class="page live-page">
    <div class="page-head">
      <div><span class="overline">${live.length ? `${live.length} em quadra` : 'Nada em quadra agora'}</span><h1>Partidas <em>ao vivo</em></h1>
        <p>O placar atualiza sozinho em todos os aparelhos. ${store.admin ? 'Toque na partida para marcar pontos.' : 'Só o administrador marca pontos.'}</p></div>
    </div>
    ${live.length === 0 && html`<div class="glass empty"><h3>Nenhuma partida em andamento</h3>
      <p class="muted">${next.length ? 'Próximas abaixo. Quando o administrador iniciar uma partida, ela aparece aqui.' : 'Assim que houver chave e uma partida começar, ela aparece aqui.'}</p></div>`}
    <div class="live-grid">
      ${live.map(({ cat, t, m }) => html`<button key=${cat + m.id} class="glass live-card" onClick=${() => open(cat, m)}>
        <div class="live-card-head">
          <span class="muted">${several ? CAT_LABEL[cat] + ' · ' : ''}${E.roundOf(t, m).name} · Jogo ${m.number}</span>
        </div>
        <${Scoreboard} t=${t} m=${m} />
      </button>`)}
    </div>
    ${next.length > 0 && html`<section class="live-next"><h2 class="round-title">A seguir</h2>
      <div class="match-list">${next.map(({ cat, t, m }) => html`<div key=${cat} class="live-next-row" onClickCapture=${() => store.setCat(cat)}>
        ${several && html`<span class=${'cat-tag ' + cat}>${CAT_LABEL[cat].toUpperCase()}</span>`}
        <${MatchRow} t=${t} m=${m} href=${'#/partida/' + m.id} />
      </div>`)}</div></section>`}
  </main>`;
}
