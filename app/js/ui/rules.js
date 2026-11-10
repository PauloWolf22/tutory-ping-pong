// Regulamentos por modalidade (supabase/fase8.sql): regras oficiais separadas das adaptações internas da Tutory,
// com versões. Participantes leem a versão publicada mais recente e podem consultar as anteriores. O administrador
// edita um rascunho e publica; versão publicada nunca muda (a correção vira a versão seguinte).
import { html, useState, store, toast, handleError, confirmDialog, fmtDate } from './lib.js';
import { sports } from '../core/sports.js';
import { useSports, useQuery } from './sports.js';

export const RULE_TABS = [
  ['pingpong', 'Ping Pong'], ['jiujitsu', 'Jiu-Jitsu'], ['futebol', 'Futebol'], ['gaming', 'Tutory Gaming'], ['cs', 'Counter-Strike'],
];

// Texto com linhas começando por "•" vira lista; o resto, parágrafos.
function Text({ value }) {
  if (!value) return null;
  const blocks = [];
  for (const line of value.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (/^[•\-*]\s*/.test(t)) {
      if (blocks.at(-1)?.list) blocks.at(-1).items.push(t.replace(/^[•\-*]\s*/, ''));
      else blocks.push({ list: true, items: [t.replace(/^[•\-*]\s*/, '')] });
    } else blocks.push({ list: false, text: t });
  }
  return html`${blocks.map((b, i) => (b.list ? html`<ul key=${i}>${b.items.map((x, j) => html`<li key=${j}>${x}</li>`)}</ul>` : html`<p key=${i}>${b.text}</p>`))}`;
}

function Editor({ modality, label, base, close }) {
  const drafts = useQuery((db) => db.adminRegulations(store.token, modality), [modality]);
  const draft = (drafts.data || []).find((r) => r.status === 'draft');
  const src = draft || base || {};
  const [f, set] = useState(null);
  const form = f || { title: src.title || label, official: src.official || '', internal: src.internal || '', sources: src.sources || '' };
  const upd = (k) => (e) => { const v = e.target.value; set((c) => ({ ...(c || form), [k]: v })); };
  const save = async (publish) => {
    try {
      const db = sports.need();
      const { id } = await db.adminRegulationSave(store.token, { modality, ...form });
      if (publish) {
        if (!(await confirmDialog({ title: 'Publicar esta versão?', body: 'Ela passa a valer para todos. A versão anterior continua disponível no histórico.', confirmLabel: 'Publicar' }))) { toast('Rascunho salvo.', 'ok'); return; }
        await db.adminRegulationPublish(store.token, id);
        toast('Nova versão publicada.', 'ok');
        close();
      } else toast('Rascunho salvo. Só você vê até publicar.', 'ok');
    } catch (e) { handleError(e); }
  };
  if (drafts.loading && !drafts.data) return html`<div class="skeleton" style="height:240px;border-radius:20px"></div>`;
  return html`<div class="glass card reg-form">
    <p class="muted hint">${draft ? `Editando o rascunho da versão ${draft.version}.` : `A próxima versão será a ${((drafts.data || [])[0]?.version || 0) + 1}.`} Linhas que começam com "•" viram lista.</p>
    <label class="field">Título<input class="input" value=${form.title} onInput=${upd('title')} /></label>
    <label class="field">Regras oficiais (resumo da entidade, sem adaptações)<textarea class="input tall" value=${form.official} onInput=${upd('official')}></textarea></label>
    <label class="field">Adaptações internas da Tutory<textarea class="input tall" value=${form.internal} onInput=${upd('internal')}></textarea></label>
    <label class="field">Fontes<input class="input" value=${form.sources} onInput=${upd('sources')} placeholder="Ex.: ITTF Handbook, capítulo 2" /></label>
    <div class="actions reg-foot"><button class="btn ghost" onClick=${close}>Fechar</button><button class="btn" onClick=${() => save(false)}>Salvar rascunho</button><button class="btn primary" onClick=${() => save(true)}>Publicar</button></div>
  </div>`;
}

export function ModalityRules({ modality }) {
  const s = useSports();
  const all = useQuery((db) => (db.regulations ? db.regulations() : Promise.resolve([])), []);
  const [ver, setVer] = useState(null);
  const [editing, setEditing] = useState(false);
  const label = RULE_TABS.find(([k]) => k === modality)?.[1] || modality;
  if (!s.available) return html`<div class="glass card empty"><p class="muted">Os regulamentos por modalidade ficam no banco do site online.</p></div>`;
  if (all.error) return html`<p class="notice warn">${/schema|does not exist|recusou/i.test(all.error.message || '') ? 'Os regulamentos por modalidade ainda não estão ativos no banco: falta rodar supabase/fase8.sql.' : all.error.message}</p>`;
  const versions = (all.data || []).filter((r) => r.modality === modality).sort((a, b) => b.version - a.version);
  const cur = versions.find((r) => r.version === ver) || versions[0];
  if (editing) return html`<${Editor} key=${modality} modality=${modality} label=${label} base=${versions[0]} close=${() => setEditing(false)} />`;
  return html`<div class="rules">
    <div class="rules-head">
      <div>${cur ? html`<span class="overline">Versão ${cur.version} · publicada em ${fmtDate(Date.parse(cur.published_at))}${cur !== versions[0] ? ' · versão anterior' : ''}</span><h2>${cur.title}</h2>` : html`<h2>${label}</h2>`}</div>
      <div class="actions">
        ${versions.length > 1 && html`<label class="field inline">Versão<select class="input" value=${cur?.version} onChange=${(e) => setVer(+e.target.value)}>
          ${versions.map((r) => html`<option key=${r.version} value=${r.version}>${r.version}${r === versions[0] ? ' (vigente)' : ''} · ${fmtDate(Date.parse(r.published_at)).split(',')[0]}</option>`)}</select></label>`}
        ${store.admin && html`<button class="btn primary" onClick=${() => setEditing(true)}>Editar e publicar nova versão</button>`}
      </div>
    </div>
    ${!cur ? html`<div class="glass card empty"><p class="muted">Ainda não há regulamento publicado para ${label}.</p></div>` : html`
      <div class="rules-cols">
        ${cur.official && html`<section class="glass card rules-official"><span class="overline">Regras oficiais</span><${Text} value=${cur.official} /></section>`}
        ${cur.internal && html`<section class="glass card rules-internal"><span class="overline">Adaptações Tutory</span><${Text} value=${cur.internal} /></section>`}
      </div>
      ${!cur.official && html`<p class="muted hint">Não existe regulamento oficial para este formato: tudo acima é regra interna da Tutory.</p>`}
      ${cur.sources && html`<p class="muted rules-src">Fontes: ${cur.sources}</p>`}`}
  </div>`;
}
