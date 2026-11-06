import { html, useState, useEffect, useRef, useDoc, store, act, Ava, avatarOf, playerById, displayName, useStage, confirmDialog, go, toast, fmtDate, openDialog } from './lib.js';
import * as E from '../core/engine.js';
import { TableStage } from '../three/stage.js';
import { sfx } from './sfx.js';

const rowLabel = (t, m) => (m.bye ? 'BYE' : `Jogo ${m.number}`);

function chipStatus(t, m) {
  const s = E.displayStatus(t, m);
  return html`<span class=${'chip ' + s}>${E.STATUS_LABEL[s]}</span>`;
}

export function MatchesPage() {
  const t = useDoc();
  if (!t.bracket) {
    return html`<main class="page"><div class="page-head"><div><span class="overline">Partidas</span><h1>Agenda de <em>jogos</em></h1></div></div>
      <div class="glass empty"><h3>As partidas saem no sorteio</h3><a class="btn primary" href="#/sorteio">Ir para o sorteio <span class="arrow">→</span></a></div></main>`;
  }
  return html`<main class="page">
    <div class="page-head"><div><span class="overline">${E.realMatches(t).filter(E.isFinished).length} de ${E.realMatches(t).length} concluídas</span><h1>Agenda de <em>jogos</em></h1></div></div>
    <div class="matches">
      ${t.bracket.rounds.map((r) => {
        const list = r.matches.map((id) => t.matches[id]).filter((m) => !m.bye);
        if (!list.length) return null;
        return html`<section key=${r.index}>
          <h2 class="round-title">${r.name}</h2>
          <div class="match-list">
            ${list.map((m) => {
              const [a, b] = m.p.map((id) => playerById(t, id));
              const wins = E.gameWins(m, t.scoring);
              const val = (s) => (m.manual ? m.manual[s] : m.wo ? (m.winner === m.p[s] ? 'WO' : '') : (m.games.length || m.status === 'live' ? wins[s] : ''));
              return html`<a key=${m.id} class=${'glass match-row ' + m.status} href=${'#/partida/' + m.id}>
                <span class="mr-num">${m.number}</span>
                <span class=${'mr-p ' + (m.loser === m.p[0] && m.loser ? 'lost' : '')}><${Ava} player=${a} size=${38} /><b>${displayName(a) || 'A definir'}</b><i>${val(0)}</i></span>
                <span class=${'mr-p ' + (m.loser === m.p[1] && m.loser ? 'lost' : '')}><${Ava} player=${b} size=${38} /><b>${displayName(b) || 'A definir'}</b><i>${val(1)}</i></span>
                ${chipStatus(t, m)}
              </a>`;
            })}
          </div>
        </section>`;
      })}
    </div>
  </main>`;
}

// Placar grande: reaproveitado na página da partida e no telão.
function ScoreSide({ t, m, p, side, big }) {
  const wins = E.gameWins(m, t.scoring);
  const pendingSide = E.pendingWinner(t, m);
  const won = m.winner && m.winner === p?.id;
  const points = m.status === 'live' && pendingSide === null ? m.live[side] : null;
  return html`<div class=${`sb-side ${won ? 'won' : ''} ${m.loser && m.loser === p?.id ? 'lost' : ''} side-${side}`}>
    <div class="sb-id"><${Ava} player=${p} size=${big ? 148 : 92} state=${won ? 'win' : ''} />
      <div><span class="sb-num">${p ? 'Nº ' + String(p.number).padStart(2, '0') : ''}</span><h2>${displayName(p) || 'A definir'}</h2>${p?.nick && p?.name !== p?.nick ? html`<small>${p.name}</small>` : null}</div>
    </div>
    <div class="sb-games" aria-label="Games vencidos">${m.manual ? '' : Array.from({ length: E.gamesToWin(t.scoring) }, (_, i) => html`<i key=${i} class=${i < wins[side] ? 'on' : ''}></i>`)}</div>
    ${points !== null && html`<div class="sb-points" key=${m.live[side]}>${points}</div>`}
    ${points === null && (m.manual || m.wo || E.isFinished(m) || pendingSide !== null) && html`<div class="sb-points final">${m.manual ? m.manual[side] : m.wo ? (won ? 'WO' : '–') : wins[side]}</div>`}
  </div>`;
}

export function Scoreboard({ t, m, big = false }) {
  const [a, b] = m.p.map((id) => playerById(t, id));
  const pendingSide = E.pendingWinner(t, m);
  const gameNo = m.games.length + (pendingSide === null ? 1 : 0);
  return html`<div class=${'scoreboard ' + (big ? 'big' : '')}>
    <${ScoreSide} t=${t} m=${m} big=${big} p=${a} side=${0} />
    <div class="sb-mid">
      <span class="overline">${m.status === 'live' ? (pendingSide === null ? `Game ${gameNo}` : 'Decidida') : E.STATUS_LABEL[E.displayStatus(t, m)]}</span>
      <b>×</b>
      ${m.games.length > 0 && html`<ul class="sb-history">${m.games.map(([x, y], i) => html`<li key=${i}><span class=${x > y ? 'w' : ''}>${x}</span>–<span class=${y > x ? 'w' : ''}>${y}</span></li>`)}</ul>`}
    </div>
    <${ScoreSide} t=${t} m=${m} big=${big} p=${b} side=${1} />
  </div>`;
}

function ScoreForm({ t, m, requestCorrection }) {
  const need = E.gamesToWin(t.scoring);
  const blank = () => Array.from({ length: t.scoring.bestOf }, (_, i) => (m.games[i] ? m.games[i].map(String) : ['', '']));
  const [games, setGames] = useState(blank);
  const [manual, setManual] = useState(m.manual ? m.manual.map(String) : ['', '']);
  const [tab, setTab] = useState(m.manual ? 'manual' : 'games');
  const [a, b] = m.p.map((id) => playerById(t, id));
  const toInt = (v) => (v === '' ? NaN : Number(v));
  const filled = games.filter(([x, y]) => x !== '' || y !== '').map(([x, y]) => [toInt(x), toInt(y)]);
  let previewSide = null;
  try { previewSide = E.validateGames(filled, t.scoring); } catch { previewSide = null; }
  const saveGames = () => requestCorrection(filled.length ? (() => { try { return E.validateGames(filled, t.scoring); } catch { return undefined; } })() : undefined, (d) => E.saveGames(d, m.id, filled));
  const saveManual = () => {
    const x = toInt(manual[0]), y = toInt(manual[1]);
    requestCorrection(x > y ? 0 : y > x ? 1 : undefined, (d) => E.saveManual(d, m.id, x, y));
  };
  return html`<div class="score-form">
    <div class="seg" role="tablist">
      <button role="tab" aria-selected=${tab === 'games'} class=${tab === 'games' ? 'on' : ''} onClick=${() => setTab('games')}>Games</button>
      <button role="tab" aria-selected=${tab === 'manual'} class=${tab === 'manual' ? 'on' : ''} onClick=${() => setTab('manual')}>Placar final</button>
    </div>
    ${tab === 'games' ? html`
      <p class="muted hint">${E.scoringDescription(t.scoring)}. O vencedor é calculado pelos games.</p>
      <div class="games-grid">
        <span></span><b class="clip">${displayName(a)}</b><b class="clip">${displayName(b)}</b>
        ${games.map((g, i) => html`<span class="muted" key=${'l' + i}>Game ${i + 1}</span>
          ${[0, 1].map((s) => html`<input key=${`${i}-${s}`} class="input num" type="number" min="0" inputmode="numeric" aria-label=${`Game ${i + 1}, ${displayName(s ? b : a)}`} value=${g[s]}
            onInput=${(e) => setGames((list) => list.map((row, ri) => (ri === i ? row.map((v, si) => (si === s ? e.target.value : v)) : row)))} />`)}`)}
      </div>
      <p class=${'preview ' + (previewSide !== null ? 'ok' : '')}>${previewSide !== null ? `Vencedor: ${displayName(previewSide ? b : a)}` : `Preencha até alguém vencer ${need} ${need > 1 ? 'games' : 'game'}.`}</p>
      <button class="btn primary" onClick=${saveGames}>${E.isFinished(m) ? 'Salvar correção' : 'Salvar resultado'}</button>
    ` : html`
      <p class="muted hint">Para quando só importa o resultado final. Ex.: 11 x 7 ou 3 x 1.</p>
      <div class="manual-grid">
        <label class="field">${displayName(a)}<input class="input num" type="number" min="0" inputmode="numeric" value=${manual[0]} onInput=${(e) => setManual([e.target.value, manual[1]])} /></label>
        <label class="field">${displayName(b)}<input class="input num" type="number" min="0" inputmode="numeric" value=${manual[1]} onInput=${(e) => setManual([manual[0], e.target.value])} /></label>
      </div>
      <button class="btn primary" onClick=${saveManual}>${E.isFinished(m) ? 'Salvar correção' : 'Salvar resultado'}</button>
    `}
  </div>`;
}

function afterFinish(t, id) {
  if (E.champion(t)) {
    act((d) => E.setDisplay(d, 'champion'));
    go('campeao');
  }
}

export function MatchPage({ id }) {
  const t = useDoc();
  const m = t.matches[id];
  const [host, stage] = useStage((el) => new TableStage(el, { rally: false }));
  const admin = store.admin;
  const [a, b] = m ? m.p.map((pid) => playerById(t, pid)) : [null, null];
  const lastPoint = useRef(m?.lastPoint?.at);
  const prevFinished = useRef(m ? E.isFinished(m) : false);

  useEffect(() => {
    if (!m) return;
    stage.current?.setPlayers(a ? avatarOf(a) : null, b ? avatarOf(b) : null);
  }, [JSON.stringify([a?.avatar, a?.id, b?.avatar, b?.id])]);
  useEffect(() => {
    const s = stage.current;
    if (!s || !m) return;
    s.rallyOn = m.status === 'live' && E.pendingWinner(t, m) === null;
    if (m.winner && !prevFinished.current) { s.finish(m.p.indexOf(m.winner)); sfx.win(); } else if (m.winner) setTimeout(() => s.finish(m.p.indexOf(m.winner)), 400);
    prevFinished.current = E.isFinished(m);
  }, [m?.status, m?.winner]);
  useEffect(() => {
    if (!m?.lastPoint || m.lastPoint.at === lastPoint.current) return;
    lastPoint.current = m.lastPoint.at;
    sfx.point();
    stage.current?.celebrate(m.lastPoint.side);
  }, [m?.lastPoint?.at]);

  if (!m) return html`<main class="page"><div class="glass empty"><h3>Partida não encontrada</h3><a class="btn" href="#/partidas">Ver partidas</a></div></main>`;
  const ready = E.isReady(m);
  const finished = E.isFinished(m);
  const pending = E.pendingWinner(t, m);

  // Correção: mostra o que será refeito antes de aplicar. `newSide` undefined deixa a validação explicar o erro.
  const requestCorrection = async (newSide, apply) => {
    if (finished && newSide !== undefined) {
      const impact = E.correctionImpact(t, m.id, newSide);
      if (impact.length) {
        const ok = await confirmDialog({
          title: 'Esta correção muda quem avançou',
          body: html`<p>Estas partidas serão reiniciadas, porque um dos jogadores delas muda:</p><ul>${impact.map((x) => html`<li key=${x.id}>Jogo ${x.number}: ${t.bracket.rounds[x.round].name}</li>`)}</ul>`,
          confirmLabel: 'Corrigir e reiniciar', danger: true,
        });
        if (!ok) return;
      }
    }
    let result;
    act((d) => { apply(d); result = d; }, finished ? 'Resultado corrigido.' : 'Resultado registrado. Vencedor avançou.');
    if (result && result.matches[m.id].winner) afterFinish(result, m.id);
  };

  const confirmEnd = () => {
    let result;
    act((d) => { E.confirmLive(d, m.id); result = d; }, 'Resultado registrado. Vencedor avançou.');
    if (result) afterFinish(result, m.id);
  };
  const giveWO = async (side) => {
    const p = side ? b : a;
    const loser = side ? a : b;
    const impact = E.correctionImpact(t, m.id, side);
    if (await confirmDialog({
      title: `WO para ${displayName(p)}?`, body: `${displayName(loser)} será eliminado sem placar.${impact.length ? ` ${impact.length} partida(s) seguinte(s) serão reiniciadas.` : ''}`, confirmLabel: 'Registrar WO', danger: true,
    })) {
      let result;
      act((d) => { E.saveWO(d, m.id, side); result = d; });
      if (result) afterFinish(result, m.id);
    }
  };
  const revert = async () => {
    const impact = E.correctionImpact(t, m.id, null);
    if (await confirmDialog({ title: 'Remover este resultado?', body: `A partida volta a aguardar.${impact.length ? ` ${impact.length} partida(s) seguinte(s) também serão reiniciadas.` : ''}`, confirmLabel: 'Remover resultado', danger: true })) act((d) => E.revertResult(d, m.id), 'Resultado removido.');
  };

  return html`<main class="match-page">
    <div class="mp-stage stage-host" ref=${host}></div>
    <div class="page mp-inner">
      <div class="mp-head">
        <a class="btn sm ghost" href="#/partidas">← Partidas</a>
        <div class="mp-title"><span class="overline">${rowLabel(t, m)}</span><h1>${t.bracket.rounds[m.round].name}</h1></div>
        ${chipStatus(t, m)}
      </div>
      <div class="mp-board"><${Scoreboard} t=${t} m=${m} /></div>
      ${m.bye && html`<p class="notice">${displayName(playerById(t, m.winner))} avançou direto por BYE.</p>`}
      ${admin && !m.bye && !ready && html`<p class="notice">Esta partida aguarda os vencedores das fases anteriores.</p>`}
      ${admin && ready && html`<div class="mp-admin">
        ${!finished && html`<section class="glass card live-panel">
          <div class="panel-head"><span class="overline">Marcação ao vivo</span>
            <div class="actions">
              ${E.nextMatch(t)?.id !== m.id && m.status !== 'live' && html`<button class="btn sm" onClick=${() => act((d) => E.setNextMatch(d, m.id), 'Definida como próxima partida.')}>Marcar como próxima</button>`}
              <button class="btn sm" onClick=${() => act((d) => E.setDisplay(d, m.status === 'live' ? 'score' : 'versus', m.id), 'Enviado ao telão.')}>Mostrar no telão</button>
            </div>
          </div>
          ${m.status !== 'live' ? html`<button class="btn primary lg wide" onClick=${() => act((d) => { E.startMatch(d, m.id); E.setDisplay(d, 'score', m.id); })}>Iniciar partida</button>`
          : pending !== null ? html`<div class="decided"><h3>${displayName(pending ? b : a)} venceu a partida</h3>
              <div class="actions"><button class="btn primary lg" onClick=${confirmEnd}>Confirmar resultado</button><button class="btn lg" onClick=${() => act((d) => E.undoPoint(d, m.id))}>Desfazer último ponto</button></div></div>`
          : html`<div class="point-grid">
              <button class="btn point" onClick=${() => act((d) => E.addPoint(d, m.id, 0))}><span>+1</span>${displayName(a)}</button>
              <button class="btn point" onClick=${() => act((d) => E.addPoint(d, m.id, 1))}><span>+1</span>${displayName(b)}</button>
            </div>
            <button class="btn sm" onClick=${() => act((d) => E.undoPoint(d, m.id))}>Desfazer último ponto</button>`}
          <div class="actions sub-actions">
            ${m.status !== 'postponed' && html`<button class="btn sm ghost" onClick=${() => act((d) => E.postponeMatch(d, m.id), 'Partida adiada.')}>Adiar</button>`}
            <button class="btn sm ghost" onClick=${() => giveWO(0)}>WO para ${displayName(a)}</button>
            <button class="btn sm ghost" onClick=${() => giveWO(1)}>WO para ${displayName(b)}</button>
          </div>
        </section>`}
        <section class="glass card">
          <span class="overline">${finished ? 'Corrigir resultado' : 'Registrar resultado completo'}</span>
          <${ScoreForm} key=${(m.endedAt || 0) + m.status} t=${t} m=${m} requestCorrection=${requestCorrection} />
          ${finished && html`<div class="actions sub-actions"><button class="btn sm danger" onClick=${revert}>Remover resultado</button>
            <button class="btn sm ghost" onClick=${() => giveWO(0)}>WO para ${displayName(a)}</button><button class="btn sm ghost" onClick=${() => giveWO(1)}>WO para ${displayName(b)}</button></div>`}
        </section>
      </div>`}
      ${!admin && finished && !m.bye && html`<p class="muted" style="text-align:center;margin-top:18px">Encerrada em ${fmtDate(m.endedAt)}.</p>`}
    </div>
  </main>`;
}
