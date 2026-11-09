// Seções da home abaixo do vídeo (master prompt, seção 3): apresentação, participantes, campeonatos recentes
// e anteriores, como participar e regulamento. Tudo vem de dados reais (contas aprovadas e eventos salvos);
// sem dados, a seção explica o que falta em vez de mostrar exemplos inventados.
import { html, store, Ava, displayName, fmtDate } from './lib.js';
import * as E from '../core/engine.js';
import { CAT_LABEL, FORMAT_LABEL, MODALITY_LABEL } from '../core/event.js';
import { sports } from '../core/sports.js';

const FRONTS = [
  ['Tutory Sports', 'Ping pong, futebol, tênis e os campeonatos internos, com chave, sorteio ao vivo e pódio.', '#/campeonatos', 'Ver campeonatos'],
  ['Tutory Gaming', 'EA FC, Call of Duty, Mortal Kombat e Counter-Strike, com resultados e ranking próprios.', '#/ranking', 'Ranking gamer'],
  ['Tutory Jiu-Jitsu', 'Lutas, pódios e ranking por faixa, com a graduação validada pelo administrador.', '#/ranking', 'Ranking por faixa'],
  ['Futebol de terça', 'Sorteio dos times, fila na ordem de chegada, rodízio de quem vence e rateio da quadra.', '#/futebol', 'Abrir o futebol'],
];

export function Intro() {
  return html`<section class="home-sec intro">
    <img class="brain-bg" src="assets/brand/cerebro-branco.png" alt="" aria-hidden="true" />
    <div class="sec-head"><span class="overline">A comunidade esportiva da Tutory</span>
      <h2>Competir, jogar e torcer <em>juntos</em></h2>
      <p class="muted">A Tutory Sports reúne os campeonatos, os amistosos e o ranking de quem trabalha na Tutory. Cada pessoa tem conta, avatar 3D e histórico, e tudo o que aparece aqui vem de resultados aprovados pela organização.</p></div>
    <div class="fronts">${FRONTS.map(([title, text, href, cta]) => html`<a key=${title} class="glass front" href=${href}>
      <h3>${title}</h3><p>${text}</p><span class="front-cta">${cta} <span class="arrow">→</span></span></a>`)}</div>
  </section>`;
}

// Contas aprovadas (com o avatar salvo na conta). Antes do banco responder, os inscritos do evento atual.
export function People({ t }) {
  const accounts = sports.people ? [...sports.people.values()] : [];
  const fromEvent = Object.values(t.comps || {}).flatMap((c) => c.players);
  const list = accounts.length ? accounts : fromEvent;
  const label = accounts.length ? `${accounts.length} pessoa${accounts.length > 1 ? 's' : ''} com conta` : `${fromEvent.length} inscrito${fromEvent.length === 1 ? '' : 's'} no evento`;
  return html`<section class="home-sec">
    <div class="sec-head row"><div><span class="overline">${list.length ? label : 'Participantes'}</span><h2>Quem faz a <em>Tutory Sports</em></h2></div>
      <a class="btn" href="#/ranking">Ver ranking</a></div>
    ${list.length === 0 ? html`<div class="glass empty"><p>Ainda não há contas aprovadas. Crie a sua e peça a aprovação ao administrador.</p><a class="btn primary" href="#/conta">Criar conta</a></div>`
    : html`<div class="people-strip">${list.slice(0, 24).map((p) => html`<div key=${p.id} class="person" title=${p.name}>
        <${Ava} player=${p} size=${72} /><span>${displayName(p)}</span>${p.gender && html`<small>${CAT_LABEL[p.gender]}</small>`}</div>`)}
      ${list.length > 24 && html`<a class="person more" href="#/ranking"><b>+${list.length - 24}</b><span>no ranking</span></a>`}</div>`}
  </section>`;
}

function CategoryPodium({ c }) {
  const champ = E.champion(c), vice = E.viceChampion(c), third = E.thirdPlace(c);
  const status = E.tournamentStatus(c);
  return html`<div class="hc-cat">
    <div class="hc-cat-head"><span class=${'cat-tag ' + c.category}>${CAT_LABEL[c.category].toUpperCase()}</span><span class="muted">${status.label} · ${c.players.length} participante${c.players.length === 1 ? '' : 's'}</span></div>
    ${champ ? html`<ol class="hc-podium">
      ${[[champ, 'Campeão', 'gold'], [vice, 'Vice', ''], [third, '3º lugar', '']].filter(([p]) => p).map(([p, place, cls]) => html`<li key=${place} class=${cls}>
        <${Ava} player=${p} size=${cls ? 52 : 40} /><span><small>${place}</small>${displayName(p)}</span></li>`)}
    </ol>` : html`<p class="muted hc-wait">${c.bracket ? `${E.realMatches(c).filter(E.isFinished).length} de ${E.realMatches(c).length} partidas jogadas.` : 'Pódio sai quando a final for jogada.'}</p>`}
  </div>`;
}

function EventCard({ event, comps, current }) {
  const cats = Object.keys(comps);
  const first = comps[cats[0]];
  const date = first.regulation?.date ? first.regulation.date.split('-').reverse().join('/') : current ? '' : fmtDate(event.archivedAt).split(' ')[0];
  const results = cats.reduce((n, c) => n + E.realMatches(comps[c]).filter(E.isFinished).length, 0);
  return html`<article class=${'glass hc-event' + (current ? ' current' : '')}>
    <span class="overline">${current ? 'Evento atual' : 'Encerrado'}</span>
    <h3>${event.name}</h3>
    <p class="muted">${MODALITY_LABEL[event.modality] || event.modality} · ${FORMAT_LABEL[event.format] || ''}${date ? ' · ' + date : ''}${results ? ` · ${results} resultado${results > 1 ? 's' : ''}` : ''}</p>
    <div class="hc-cats">${cats.map((c) => html`<${CategoryPodium} key=${c} c=${comps[c]} />`)}</div>
  </article>`;
}

export function Championships({ t }) {
  const past = (t.history || []).slice(0, 3);
  return html`<section class="home-sec">
    <div class="sec-head row"><div><span class="overline">Recentes e anteriores</span><h2>Campeonatos</h2></div>
      <a class="btn" href="#/campeonatos">Todos os campeonatos</a></div>
    <div class="hc-grid">
      <${EventCard} event=${t.event} comps=${t.comps} current />
      ${past.map((h) => html`<${EventCard} key=${h.event.id} event=${h.event} comps=${h.comps} />`)}
    </div>
    ${past.length === 0 && html`<p class="muted hint">Os eventos encerrados aparecem aqui, com campeão, vice e 3º lugar de cada categoria.</p>`}
  </section>`;
}

export function HowTo() {
  const logged = !!sports.user;
  const steps = [
    ['Crie sua conta', 'Nome, apelido e categoria. O administrador aprova e você entra no ranking.', logged ? '#/conta' : '#/conta/criar', logged ? 'Minha conta' : 'Criar conta'],
    ['Monte seu avatar', 'Corpo, rosto, cabelo, roupa, uniforme Tutory e acessórios. Ele aparece em todo o site.', '#/meu-avatar', 'Personalizar avatar'],
    ['Participe', 'Os campeonatos são organizados pelo administrador. Amistosos você mesmo lança, e eles contam no ranking depois da aprovação.', '#/amistosos', 'Lançar amistoso'],
    ['Acompanhe', 'Chaves, partidas ao vivo com placar em tempo real, ranking por modalidade e histórico de cada pessoa.', '#/ao-vivo', 'Ver ao vivo'],
  ];
  return html`<section class="home-sec">
    <div class="sec-head"><span class="overline">Como participar</span><h2>Em quatro passos</h2></div>
    <ol class="howto">${steps.map(([title, text, href, cta], i) => html`<li key=${title} class="glass">
      <i>${String(i + 1).padStart(2, '0')}</i><h3>${title}</h3><p>${text}</p><a class="btn sm" href=${href}>${cta}</a></li>`)}</ol>
  </section>`;
}

export function RulesCard({ t }) {
  const reg = t.regulation;
  const lines = [
    ['Pontuação', reg.scoringText || E.scoringDescription(t.scoring)],
    ['Sistema', reg.system + (t.settings.thirdPlace ? ', com disputa de 3º lugar' : '') + (t.settings.consolation ? ' e repescagem' : '')],
    ['WO', reg.wo],
  ].filter(([, v]) => v);
  return html`<section class="home-sec">
    <a class="glass rules-card" href="#/regulamento">
      <div><span class="overline">Regulamento${Object.keys(t.comps || {}).length > 1 ? ' · ' + CAT_LABEL[t.cat] : ''}</span><h2>As regras do jogo</h2>
        <dl>${lines.map(([k, v]) => html`<div key=${k}><dt>${k}</dt><dd>${v}</dd></div>`)}</dl></div>
      <span class="btn">Ler o regulamento completo <span class="arrow">→</span></span>
    </a>
  </section>`;
}
