// Campeonatos: o evento atual e os anteriores, cada um com as suas categorias (masculino, feminino ou misto),
// pódio, participantes e resultados. Só leitura; tudo vem do documento salvo (nada inventado).
import { html, useState, useDoc, store, Ava, displayName, playerById, fmtDate, GenderTag } from './lib.js';
import * as E from '../core/engine.js';
import { CAT_LABEL, FORMAT_LABEL, MODALITY_LABEL } from '../core/event.js';

const modalityName = (key) => MODALITY_LABEL[key] || key;

function Podium({ t }) {
  const champ = E.champion(t), vice = E.viceChampion(t), third = E.thirdPlace(t), cons = E.consolationChampion(t);
  if (!champ) return null;
  return html`<ol class="ev-podium">
    <li class="gold"><${Ava} player=${champ} size=${44} /><span><small>Campeão</small>${displayName(champ)}</span></li>
    ${vice && html`<li><${Ava} player=${vice} size=${36} /><span><small>Vice</small>${displayName(vice)}</span></li>`}
    ${third && html`<li><${Ava} player=${third} size=${32} /><span><small>3º lugar</small>${displayName(third)}</span></li>`}
    ${cons && html`<li><${Ava} player=${cons} size=${28} /><span><small>Repescagem</small>${displayName(cons)}</span></li>`}
  </ol>`;
}

function Results({ t }) {
  const [open, setOpen] = useState(false);
  const done = E.realMatches(t).filter((m) => E.isFinished(m));
  if (!done.length) return null;
  return html`<div class="ev-results">
    <button class="btn sm ghost" aria-expanded=${open} onClick=${() => setOpen(!open)}>${open ? 'Esconder resultados' : `Ver ${done.length} resultado${done.length > 1 ? 's' : ''}`}</button>
    ${open && html`<ul>${done.map((m) => html`<li key=${m.id}>
      <span class="overline">${E.roundOf(t, m).short}</span>
      <span class=${m.winner === m.p[0] ? 'w' : ''}>${displayName(playerById(t, m.p[0]))}</span>
      <b>${E.scoreText(t, m)}</b>
      <span class=${m.winner === m.p[1] ? 'w' : ''}>${displayName(playerById(t, m.p[1]))}</span></li>`)}</ul>`}
  </div>`;
}

function CategoryCard({ t, current }) {
  const status = E.tournamentStatus(t);
  const males = t.players.filter((p) => p.gender === 'm').length, females = t.players.filter((p) => p.gender === 'f').length;
  return html`<article class="ev-cat">
    <header>
      <span class=${'cat-tag ' + t.category}>${CAT_LABEL[t.category].toUpperCase()}</span>
      <span class="muted">${status.label}</span>
    </header>
    <p class="ev-count"><b>${t.players.length}</b> participante${t.players.length === 1 ? '' : 's'}
      ${t.category === 'misto' && t.players.length > 0 && html`<span class="muted"> · ${males} do masculino, ${females} do feminino</span>`}</p>
    ${t.players.length > 0 && html`<div class="ev-faces">${t.players.slice(0, 12).map((p) => html`<span key=${p.id} title=${p.name}><${Ava} player=${p} size=${30} />${t.category === 'misto' && html`<${GenderTag} gender=${p.gender} />`}</span>`)}
      ${t.players.length > 12 && html`<span class="muted more">+${t.players.length - 12}</span>`}</div>`}
    <${Podium} t=${t} />
    <${Results} t=${t} />
    ${current && html`<div class="actions"><button class="btn sm" onClick=${() => { store.setCat(t.category); location.hash = '#/chave'; }}>Abrir chave</button></div>`}
  </article>`;
}

function EventBlock({ event, comps, current }) {
  const cats = Object.keys(comps);
  const date = comps[cats[0]].regulation?.date;
  return html`<section class=${'glass ev-block' + (current ? ' current' : '')}>
    <div class="ev-head">
      <div>
        <span class="overline">${current ? 'Evento atual' : 'Encerrado em ' + fmtDate(event.archivedAt)}</span>
        <h2>${event.name}</h2>
        <p class="muted">${modalityName(event.modality)} · ${FORMAT_LABEL[event.format] || ''}${date ? ' · ' + date : ''}</p>
      </div>
    </div>
    <div class=${'ev-cats n' + cats.length}>${cats.map((c) => html`<${CategoryCard} key=${c} t=${comps[c]} current=${current} />`)}</div>
  </section>`;
}

export function EventsPage() {
  const t = useDoc();
  return html`<main class="page events">
    <div class="page-head">
      <div><span class="overline">Masculino · Feminino · Misto</span><h1>Campeonatos <em>Tutory Sports</em></h1>
        <p>Cada categoria tem inscrições, sorteio, chave e pódio próprios. Eventos encerrados ficam guardados aqui.</p></div>
      ${store.admin && html`<a class="btn" href="#/admin">Organizar evento</a>`}
    </div>
    <${EventBlock} event=${t.event} comps=${t.comps} current />
    ${t.history.length > 0 && html`<h2 class="ev-sub">Anteriores</h2>`}
    ${t.history.map((h) => html`<${EventBlock} key=${h.event.id} event=${h.event} comps=${h.comps} />`)}
    ${t.history.length === 0 && html`<p class="muted ev-none">Nenhum evento encerrado ainda. Quando o administrador abrir um novo evento, este aparece aqui com o pódio de cada categoria.</p>`}
  </main>`;
}
