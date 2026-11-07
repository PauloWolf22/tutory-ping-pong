import { html, useState, useDoc, store, act, fmtDate } from './lib.js';
import * as E from '../core/engine.js';

const FIELDS = E.REGULATION_FIELDS;
const LONG = new Set(['scoringText', 'tiebreak', 'wo', 'conduct', 'prizes', 'notes']);
const SECTIONS = [
  ['Quando e onde', ['date', 'time', 'location']],
  ['Disputa', ['modality', 'system', 'maxTime']],
  ['Pontuação', ['scoringText', 'tiebreak', 'wo']],
  ['Conduta e premiação', ['conduct', 'prizes', 'notes']],
];
const fmt = (k, v) => (k === 'date' && v ? v.split('-').reverse().join('/') : v);

function Editor({ t, close }) {
  const reg = t.regulation;
  const [form, setForm] = useState(Object.fromEntries(Object.keys(FIELDS).map((k) => [k, reg[k] || ''])));
  const [custom, setCustom] = useState(reg.custom || []);
  const save = () => {
    const changed = act((d) => E.updateRegulation(d, { ...form, custom: custom.filter((c) => c.title.trim() || c.text.trim()) }), 'Regulamento salvo.');
    if (changed) close();
  };
  return html`<div class="glass card reg-form">
    ${SECTIONS.map(([title, keys]) => html`<fieldset key=${title}><legend>${title}</legend>
      <div class="grid2">${keys.map((k) => html`<label key=${k} class=${'field ' + (LONG.has(k) ? 'full' : '')}>${FIELDS[k]}
        ${k === 'scoringText' && html`<small>Em branco, usa a configuração atual: ${E.scoringDescription(t.scoring)}.</small>`}
        ${LONG.has(k)
          ? html`<textarea class="input" value=${form[k]} onInput=${(e) => setForm({ ...form, [k]: e.target.value })}></textarea>`
          : html`<input class="input" type=${k === 'date' ? 'date' : k === 'time' ? 'time' : 'text'} value=${form[k]} onInput=${(e) => setForm({ ...form, [k]: e.target.value })} />`}
      </label>`)}</div></fieldset>`)}
    <fieldset><legend>Regras personalizadas</legend>
      ${custom.map((c, i) => html`<div class="custom-rule" key=${c.id}>
        <label class="field">Título<input class="input" value=${c.title} onInput=${(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /></label>
        <label class="field">Regra<textarea class="input" value=${c.text} onInput=${(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}></textarea></label>
        <button class="btn sm ghost" onClick=${() => setCustom(custom.filter((_, j) => j !== i))}>Remover regra</button>
      </div>`)}
      <button class="btn sm" onClick=${() => setCustom([...custom, { id: E.uid('r'), title: '', text: '' }])}>Adicionar regra</button>
    </fieldset>
    <div class="actions reg-foot"><button class="btn ghost" onClick=${close}>Cancelar</button><button class="btn primary" onClick=${save}>Salvar regulamento</button></div>
  </div>`;
}

export function RegulationPage() {
  const t = useDoc();
  const [editing, setEditing] = useState(false);
  const reg = t.regulation;
  const value = (k) => (k === 'scoringText' ? reg.scoringText || E.scoringDescription(t.scoring) : reg[k]);
  const filled = SECTIONS.map(([title, keys]) => [title, keys.filter((k) => value(k))]).filter(([, keys]) => keys.length);
  let n = 0;
  return html`<main class="page reg-page">
    <div class="page-head">
      <div><span class="overline">Regulamento</span><h1>As regras do <em>jogo</em></h1><p>${t.meta.name} · ${t.meta.edition}</p></div>
      ${store.admin && !editing && html`<button class="btn primary" onClick=${() => setEditing(true)}>Editar regulamento</button>`}
    </div>
    ${editing ? html`<${Editor} t=${t} close=${() => setEditing(false)} />` : html`
      <div class="reg-doc">
        ${filled.map(([title, keys]) => html`<section key=${title} class="glass card">
          <h2>${title}</h2>
          <dl>${keys.map((k) => { n++; return html`<div key=${k} class="reg-item"><i>${String(n).padStart(2, '0')}</i><div><dt>${FIELDS[k]}</dt><dd>${fmt(k, value(k))}</dd></div></div>`; })}</dl>
        </section>`)}
        ${reg.custom.length > 0 && html`<section class="glass card"><h2>Regras do campeonato</h2>
          <dl>${reg.custom.map((c) => { n++; return html`<div key=${c.id} class="reg-item"><i>${String(n).padStart(2, '0')}</i><div><dt>${c.title}</dt><dd>${c.text}</dd></div></div>`; })}</dl></section>`}
      </div>
      ${reg.log.length > 0 && html`<details class="reg-log glass card"><summary>Histórico de alterações (${reg.log.length})</summary>
        <ul>${reg.log.map((l) => html`<li key=${l.at}><span class="muted">${fmtDate(l.at)}</span> ${l.fields.join(', ')}</li>`)}</ul></details>`}
      <details class="reg-log glass card" id="creditos"><summary>Créditos dos avatares</summary>
        <p class="muted">Corpos, roupas e cabelos feitos com o MakeHuman e o MPFB, a partir de peças da comunidade MakeHuman (makehumancommunity.org). A maioria das peças é de domínio público (CC0). As peças abaixo são CC BY (Creative Commons Atribuição) e usadas com crédito aos autores:</p>
        <ul>
          <li><strong>Elvaerwyn</strong>: cabelos Wavy Bob, Braided Rows, Grump Hair e Micky Afro; barba Scruffy Beard</li>
          <li><strong>punkduck</strong>: cabelos Alpha7 Curly e Alpha7 Long</li>
          <li><strong>grinsegold</strong>: barba cheia e bigode</li>
        </ul>
        <p class="muted">Sobre a licença: <a href="https://creativecommons.org/licenses/" target="_blank" rel="noopener">creativecommons.org/licenses</a>. As peças foram adaptadas para a web (malha, texturas e encaixe no esqueleto).</p>
      </details>
    `}
  </main>`;
}
