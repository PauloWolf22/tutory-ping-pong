import { html, useDoc, Ava, displayName, playerById } from './lib.js';
import * as E from '../core/engine.js';

const Tile = ({ label, value, sub }) => html`<div class="glass tile"><span>${label}</span><b>${value}</b>${sub && html`<small>${sub}</small>`}</div>`;
const Leader = ({ label, row, value, gold }) => html`<div class="glass leader">
  <span class=${'overline ' + (gold ? 'gold' : '')}>${label}</span>
  ${row ? html`<div class="leader-row"><${Ava} player=${row} size=${56} state=${gold ? 'champ' : ''} /><div><b>${displayName(row)}</b><small>${value}</small></div></div>` : html`<p class="muted">Sem dados ainda</p>`}
</div>`;

export function StatsPage() {
  const t = useDoc();
  const s = E.computeStats(t);
  const big = s.biggestMargin;
  const bigPlayer = big && playerById(t, big.match.winner);
  return html`<main class="page">
    <div class="page-head"><div><span class="overline">Calculado a partir dos resultados registrados</span><h1>Números do <em>campeonato</em></h1></div></div>
    <div class="tiles">
      <${Tile} label="Participantes" value=${s.totalPlayers} />
      <${Tile} label="Partidas" value=${s.totalMatches} />
      <${Tile} label="Concluídas" value=${s.finished} />
      <${Tile} label="Pendentes" value=${s.pending} />
    </div>
    <div class="leaders">
      <${Leader} label="Campeão" gold=${true} row=${s.champion} value="Título" />
      <${Leader} label="Vice-campeão" row=${s.vice} value="Final" />
      <${Leader} label="Mais vitórias" row=${s.mostWins?.player} value=${s.mostWins && `${s.mostWins.wins} vitórias`} />
      <${Leader} label="Mais pontos marcados" row=${s.mostPoints?.player} value=${s.mostPoints && `${s.mostPoints.pointsFor} pontos`} />
      <${Leader} label="Maior diferença de pontos" row=${bigPlayer} value=${big && `${big.margin} pontos · ${E.scoreText(t, big.match)}`} />
      <${Leader} label="Melhor campanha" row=${s.bestCampaign?.player} value=${s.bestCampaign && `${s.bestCampaign.wins} V · saldo de games ${s.bestCampaign.gamesFor - s.bestCampaign.gamesAgainst > 0 ? '+' : ''}${s.bestCampaign.gamesFor - s.bestCampaign.gamesAgainst}`} />
    </div>
    <section class="glass card rank-box">
      <h2>Ranking</h2>
      ${s.ranking.length === 0 ? html`<p class="muted">Nenhum participante inscrito.</p>` : html`<div class="rank-scroll"><table class="rank">
        <thead><tr><th>#</th><th>Jogador</th><th>Situação</th><th class="n">V</th><th class="n">D</th><th class="n">Games</th><th class="n">Pontos</th><th class="n">Saldo</th></tr></thead>
        <tbody>${s.ranking.map((r, i) => html`<tr key=${r.player.id} class=${r.status.key}>
          <td>${i + 1}</td><td><span class="rank-p"><${Ava} player=${r.player} size=${34} state=${r.status.key === 'champion' ? 'champ' : ''} />${displayName(r.player)}</span></td>
          <td><span class=${'chip ' + r.status.key}>${r.status.label}</span></td>
          <td class="n">${r.wins}</td><td class="n">${r.losses}</td><td class="n">${r.gamesFor}-${r.gamesAgainst}</td><td class="n">${r.pointsFor}</td><td class="n">${r.pointsFor - r.pointsAgainst}</td>
        </tr>`)}</tbody>
      </table></div>`}
    </section>
  </main>`;
}
