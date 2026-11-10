// Estatísticas por pessoa e comparação entre duas (core/stats.js). Tudo vem dos resultados aprovados e das
// colocações gravadas no banco; entre modalidades, só aproveitamento (%) — unidades diferentes nunca são somadas.
import { html, useState, Ava, fmtDate, useMediaQuery } from './lib.js';
import { sports } from '../core/sports.js';
import { personStats, headToHead, compare } from '../core/stats.js';
import { useSports, useQuery, Gate } from './sports.js';

// Unidade do placar de cada modalidade (o que "a favor / contra" significa).
const UNIT = { pingpong: 'Games', jiujitsu: 'Pontos', eafc: 'Gols', cod: 'Placar', mk: 'Rounds', cs: 'Rounds' };
// Cores das duas pessoas na comparação: azul e dourado Tutory, validados no fundo escuro (dataviz/validate_palette).
const COLOR = { a: '#3b7bf5', b: '#b8862e' };
const nameOf = (id) => { const p = sports.people.get(id); return p ? p.nick || p.name : '—'; };
const pct = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';

function usePerson(uid) {
  const r = useQuery((db) => (uid && db.resultsOf ? db.resultsOf(uid) : Promise.resolve([])), [uid]);
  const a = useQuery((db) => (uid && db.awardsOf ? db.awardsOf(uid) : Promise.resolve([])), [uid]);
  return { loading: r.loading || a.loading, error: r.error || a.error, results: r.data || [], awards: a.data || [], stats: personStats(r.data || [], a.data || [], uid) };
}

function PersonPick({ value, onChange, label, exclude }) {
  const people = [...sports.people.values()].filter((p) => p.id !== exclude);
  return html`<label class="field">${label}<select class="input" value=${value || ''} onChange=${(e) => onChange(e.target.value)}>
    <option value="">Escolha</option>${people.map((p) => html`<option key=${p.id} value=${p.id}>${p.nick || p.name}</option>`)}</select></label>`;
}

const Num = ({ label, value, sub }) => html`<div class="ps-num"><b>${value}</b><span>${label}</span>${sub && html`<small>${sub}</small>`}</div>`;

function ModalityCard({ k, name, x, profile }) {
  const unit = UNIT[k];
  const methods = Object.entries(x.methodsWon);
  const mates = Object.entries(x.teammates).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const pod = x.podiums;
  return html`<article class="glass card ps-mod">
    <div class="ps-mod-head"><h3>${name}</h3><span class="ps-rate">${pct(x.winRate)}<small>aproveitamento</small></span></div>
    <div class="ps-nums">
      <${Num} label=${k === 'jiujitsu' ? 'Lutas' : 'Jogos'} value=${x.played} />
      <${Num} label="Vitórias" value=${x.wins} />
      <${Num} label="Derrotas" value=${x.losses} />
      ${x.scored > 0 && unit && html`<${Num} label=${unit + ' (pró x contra)'} value=${`${x.scoreFor} x ${x.scoreAgainst}`} />`}
    </div>
    <p class="muted ps-line">Amistosos ${x.friendly.w}V ${x.friendly.l}D · Campeonatos ${x.championship.w}V ${x.championship.l}D${x.wo ? ` · ${x.wo} WO` : ''}</p>
    ${k === 'jiujitsu' && profile?.belt && html`<p class="ps-line">Faixa ${profile.belt}${profile.belt_verified ? ' (validada)' : ' (aguardando validação)'}</p>`}
    ${methods.length > 0 && html`<p class="ps-line">Vitórias por: ${methods.map(([m, n]) => `${m} ${n}`).join(' · ')}</p>`}
    ${(pod.campeao || pod.vice || pod.terceiro || x.participations) > 0 && html`<p class="ps-line">🏆 ${pod.campeao} título${pod.campeao === 1 ? '' : 's'} · ${pod.vice} vice · ${pod.terceiro} 3º lugar · ${x.participations} participação${x.participations === 1 ? '' : 'ões'}</p>`}
    ${mates.length > 0 && html`<p class="ps-line">Jogou mais com: ${mates.map(([id, n]) => `${nameOf(id)} (${n})`).join(', ')}</p>`}
    ${x.recent.length > 0 && html`<ol class="ps-recent">${x.recent.map((r) => html`<li key=${r.id} class=${r.won ? 'w' : 'l'}>
      <b>${r.won ? 'V' : 'D'}</b><span>${nameOf(r.opponent)}</span><span class="muted">${r.score || ''}${r.kind === 'campeonato' ? ' · campeonato' : ''}</span><time class="muted">${r.on ? r.on.split('-').reverse().slice(0, 2).join('/') : ''}</time></li>`)}</ol>`}
  </article>`;
}

export function PersonStatsView({ initial }) {
  const s = useSports();
  const mods = useQuery((db) => db.modalities(), []);
  const [uid, setUid] = useState(initial || s.user?.id || '');
  const p = usePerson(uid);
  const profile = sports.people.get(uid);
  const st = p.stats;
  const modName = (k) => (mods.data || []).find((m) => m.id === k)?.name || k;
  const order = (mods.data || []).map((m) => m.id).filter((k) => st.byModality[k]);
  return html`<${Gate} s=${s}>
    <div class="ps-pick"><${PersonPick} label="Pessoa" value=${uid} onChange=${setUid} /></div>
    ${!uid ? html`<p class="muted">Escolha uma pessoa para ver os números.</p>` : html`
      <div class="ps-hero glass card">
        ${profile && html`<${Ava} player=${profile} size=${72} />`}
        <div><h2>${profile ? profile.name : '—'}</h2><p class="muted">${st.played} jogos em ${order.length} modalidade${order.length === 1 ? '' : 's'}</p></div>
        <div class="ps-nums"><${Num} label="Vitórias" value=${st.wins} /><${Num} label="Derrotas" value=${st.losses} /><${Num} label="Aproveitamento" value=${pct(st.winRate)} /></div>
      </div>
      ${p.error && html`<p class="notice">${p.error.message}</p>`}
      ${!p.loading && order.length === 0 && html`<div class="glass empty"><p class="muted">Ainda sem resultados aprovados. Amistosos e campeonatos aparecem aqui depois da aprovação do administrador.</p></div>`}
      <div class="ps-grid">${order.map((k) => html`<${ModalityCard} key=${k} k=${k} name=${modName(k)} x=${st.byModality[k]} profile=${profile} />`)}</div>
      <p class="muted hint">Futebol de terça: presença, jogos e times ficam em <a href="#/futebol">Futebol › Estatísticas</a> (a lista do futebol é por nome, não por conta).</p>`}
  <//>`;
}

// Barras horizontais agrupadas: aproveitamento de A e B em cada modalidade (0 a 100%).
function CompareChart({ rows, a, b }) {
  const [tip, setTip] = useState(null);
  // no celular o desenho fica mais estreito, para o texto não encolher junto com o SVG
  const narrow = useMediaQuery('(max-width: 560px)');
  const W = narrow ? 340 : 640, LABEL = narrow ? 82 : 120, BAR = 14, GAP = 2, ROW = BAR * 2 + GAP + 22, H = rows.length * ROW + 24;
  const x = (v) => LABEL + (v / 100) * (W - LABEL - 56);
  const bar = (row, who, i, y) => {
    const v = row[who];
    if (v === null) return html`<text x=${LABEL + 4} y=${y + BAR - 3} class="cc-none">não jogou</text>`;
    const w = Math.max(x(v) - LABEL, 2);
    const played = who === 'a' ? row.aPlayed : row.bPlayed;
    // retângulo com a ponta de dados arredondada (4px) e a base reta no eixo
    const d = `M${LABEL},${y} h${Math.max(w - 4, 0)} q4,0 4,4 v${BAR - 8} q0,4 -4,4 h${-Math.max(w - 4, 0)} z`;
    return html`<g key=${who + i} onPointerEnter=${() => setTip({ row, who, v, played })} onPointerLeave=${() => setTip(null)}>
      <rect x=${LABEL} y=${y - 4} width=${W - LABEL} height=${BAR + 8} fill="transparent" />
      <path d=${d} fill=${COLOR[who]} />
      <text x=${LABEL + w + 6} y=${y + BAR - 3} class="cc-val">${pct(v)}</text>
    </g>`;
  };
  return html`<figure class="cc">
    <div class="cc-legend"><span><i style=${'background:' + COLOR.a}></i>${nameOf(a)}</span><span><i style=${'background:' + COLOR.b}></i>${nameOf(b)}</span></div>
    <div class="cc-wrap">
      <svg viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${`Aproveitamento por modalidade: ${nameOf(a)} e ${nameOf(b)}`}>
        ${[0, 50, 100].map((g) => html`<g key=${g}><line x1=${x(g)} x2=${x(g)} y1="0" y2=${H - 20} class="cc-grid" /><text x=${x(g)} y=${H - 6} class="cc-axis">${g}%</text></g>`)}
        ${rows.map((row, i) => {
          const y = i * ROW + 6;
          return html`<g key=${row.modality}><text x="0" y=${y + BAR + 2} class="cc-label">${row.name}</text>${bar(row, 'a', i, y)}${bar(row, 'b', i, y + BAR + GAP)}</g>`;
        })}
      </svg>
      ${tip && html`<div class="cc-tip" role="status"><b>${tip.row.name}</b><span><i style=${'background:' + COLOR[tip.who]}></i>${nameOf(tip.who === 'a' ? a : b)}: ${pct(tip.v)}</span><small>${tip.played} jogo${tip.played === 1 ? '' : 's'}</small></div>`}
    </div>
    <figcaption class="muted">Aproveitamento = vitórias ÷ jogos, em cada modalidade. Não soma pontos de modalidades diferentes.</figcaption>
  </figure>`;
}

export function CompareView() {
  const s = useSports();
  const mods = useQuery((db) => db.modalities(), []);
  const general = useQuery((db) => db.rankingGeneral(null, null), []);
  const [a, setA] = useState(s.user?.id || '');
  const [b, setB] = useState('');
  const A = usePerson(a), B = usePerson(b);
  const rows = a && b ? compare(A.stats, B.stats, mods.data || []) : [];
  const h2h = a && b ? headToHead(A.results, a, b) : null;
  const score = (id) => (general.data || []).find((r) => r.id === id)?.score;
  const metrics = (st) => [st.played, st.wins, st.losses, pct(st.winRate)];
  return html`<${Gate} s=${s}>
    <div class="ps-pick two"><${PersonPick} label="Pessoa A" value=${a} onChange=${setA} exclude=${b} /><${PersonPick} label="Pessoa B" value=${b} onChange=${setB} exclude=${a} /></div>
    ${!(a && b) ? html`<p class="muted">Escolha duas pessoas para comparar.</p>` : html`
      <div class="cmp-head glass card">
        ${[a, b].map((id, i) => html`<div key=${id} class="cmp-side"><span class="cmp-dot" style=${'background:' + (i ? COLOR.b : COLOR.a)}></span>
          ${sports.people.get(id) && html`<${Ava} player=${sports.people.get(id)} size=${56} />`}<b>${nameOf(id)}</b>
          ${score(id) !== undefined && html`<small class="muted">Nota geral ${score(id).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</small>`}</div>`)}
        <div class="cmp-h2h"><span class="overline">Confronto direto</span><b>${h2h.a} x ${h2h.b}</b><small class="muted">${h2h.played} jogo${h2h.played === 1 ? '' : 's'} entre os dois</small></div>
      </div>
      ${rows.length === 0 ? html`<div class="glass empty"><p class="muted">Nenhum resultado aprovado para nenhum dos dois ainda.</p></div>` : html`
        <section class="glass card"><h2>Aproveitamento por modalidade</h2><${CompareChart} rows=${rows} a=${a} b=${b} /></section>
        <section class="glass card"><h2>Números</h2><div class="rank-scroll"><table class="rank">
          <thead><tr><th>Modalidade</th><th class="n">Jogos</th><th class="n">V</th><th class="n">D</th><th class="n">%</th><th class="n">Jogos</th><th class="n">V</th><th class="n">D</th><th class="n">%</th></tr>
            <tr class="cmp-who"><th></th><th colspan="4">${nameOf(a)}</th><th colspan="4">${nameOf(b)}</th></tr></thead>
          <tbody>${rows.map((r) => {
            const xa = A.stats.byModality[r.modality], xb = B.stats.byModality[r.modality];
            const cells = (x) => (x ? metrics(x).map((v, i) => html`<td key=${i} class="n">${v}</td>`) : html`<td class="n muted" colspan="4">não jogou</td>`);
            return html`<tr key=${r.modality}><td>${r.name}</td>${cells(xa)}${cells(xb)}</tr>`;
          })}
          <tr class="cmp-total"><td>Total</td>${metrics(A.stats).map((v, i) => html`<td key=${'a' + i} class="n">${v}</td>`)}${metrics(B.stats).map((v, i) => html`<td key=${'b' + i} class="n">${v}</td>`)}</tr></tbody>
        </table></div>
        ${h2h.list.length > 0 && html`<h3 style="margin-top:16px">Jogos entre os dois</h3><ul class="res-list">${h2h.list.slice(0, 10).map((r) => html`<li key=${r.id}>
          <span><b>${nameOf(r.winner === r.p1 ? r.p1 : r.p2)} venceu</b>${r.score ? ' · ' + r.score : ''}<br /><small class="muted">${(mods.data || []).find((m) => m.id === r.modality)?.name || r.modality} · ${r.played_on ? r.played_on.split('-').reverse().join('/') : fmtDate(Date.parse(r.created_at))}</small></span></li>`)}</ul>`}
        </section>`}`}
  <//>`;
}
