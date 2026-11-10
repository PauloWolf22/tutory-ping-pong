// Agenda (supabase/fase8.sql). O administrador marca eventos e partidas; contas aprovadas propõem amistosos e o
// adversário aceita ou recusa. Quem foi chamado confirma presença. A data do evento atual do campeonato também aparece.
import { html, useState, store, toast, handleError, confirmDialog, openDialog, fmtDate } from './lib.js';
import { sports } from '../core/sports.js';
import { useSports, useQuery, Gate } from './sports.js';
import { MODALITY_LABEL } from '../core/event.js';

const KIND = { evento: 'Evento', partida: 'Partida', amistoso: 'Amistoso' };
const STATUS = { proposed: 'Aguardando resposta', confirmed: 'Confirmado', declined: 'Recusado', cancelled: 'Cancelado' };
const nameOf = (id) => { const p = sports.people.get(id); return p ? p.nick || p.name : 'Conta removida'; };
const dayKey = (iso) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const time = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
// <input type="datetime-local"> trabalha no horário local, sem fuso
const toLocalInput = (iso) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

async function run(fn, ok) {
  try { await fn(sports.need()); if (ok) toast(ok, 'ok'); } catch (e) { handleError(e); }
}

function AdminForm({ item, mods, close }) {
  const people = [...sports.people.values()];
  const [f, set] = useState({
    id: item?.id || null, kind: item?.kind || 'evento', modality: item?.modality || '', title: item?.title || '',
    starts_at: item ? toLocalInput(item.starts_at) : '', location: item?.location || '', notes: item?.notes || '', participants: item?.participants || [],
  });
  const [q, setQ] = useState('');
  const upd = (k) => (e) => { const v = e.target.value; set((c) => ({ ...c, [k]: v })); };
  const toggle = (id) => set((c) => ({ ...c, participants: c.participants.includes(id) ? c.participants.filter((x) => x !== id) : [...c.participants, id] }));
  const list = people.filter((p) => !q || (p.name + ' ' + (p.nick || '')).toLowerCase().includes(q.toLowerCase()));
  return html`<form class="modal glass wide" onSubmit=${(e) => { e.preventDefault(); close({ ...f, starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null }); }}>
    <h2>${f.id ? 'Editar compromisso' : 'Novo compromisso'}</h2>
    <div class="grid2" style="margin-top:14px">
      <label class="field" style="grid-column:1/-1">Título<input class="input" required value=${f.title} onInput=${upd('title')} placeholder="Ex.: Final do ping pong" /></label>
      <label class="field">Tipo<select class="input" value=${f.kind} onChange=${upd('kind')}>${Object.entries(KIND).map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}</select></label>
      <label class="field">Modalidade<select class="input" value=${f.modality} onChange=${upd('modality')}><option value="">Nenhuma</option>${mods.map((m) => html`<option key=${m.id} value=${m.id}>${m.name}</option>`)}</select></label>
      <label class="field">Data e horário<input class="input" type="datetime-local" required value=${f.starts_at} onInput=${upd('starts_at')} /></label>
      <label class="field">Local<input class="input" value=${f.location} onInput=${upd('location')} placeholder="Ex.: Sala de jogos" /></label>
      <label class="field" style="grid-column:1/-1">Observações<textarea class="input" rows="2" value=${f.notes} onInput=${upd('notes')}></textarea></label>
    </div>
    <div class="field" style="margin-top:12px">Participantes (${f.participants.length}) <small class="muted">Cada um recebe um aviso e pode confirmar presença.</small>
      <input class="input" type="search" placeholder="Buscar pessoa" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <div class="pick-list">${list.map((p) => html`<label key=${p.id} class=${'chip-radio' + (f.participants.includes(p.id) ? ' on' : '')}>
        <input type="checkbox" checked=${f.participants.includes(p.id)} onChange=${() => toggle(p.id)} />${p.nick || p.name}</label>`)}
        ${list.length === 0 && html`<span class="muted">Nenhuma conta aprovada encontrada.</span>`}</div>
    </div>
    <div class="foot"><button type="button" class="btn ghost" onClick=${() => close(null)}>Cancelar</button><button class="btn primary">Salvar e avisar</button></div>
  </form>`;
}

function ProposeForm({ mods, close }) {
  const me = sports.user?.id;
  const people = [...sports.people.values()].filter((p) => p.id !== me);
  const [f, set] = useState({ modality: mods[0]?.id || '', opponent: '', startsAt: '', location: '', notes: '' });
  const upd = (k) => (e) => { const v = e.target.value; set((c) => ({ ...c, [k]: v })); };
  return html`<form class="modal glass" onSubmit=${(e) => { e.preventDefault(); close({ ...f, startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null }); }}>
    <h2>Propor amistoso</h2>
    <p class="body">O convite vai para o adversário, que aceita ou recusa. Confirmado, aparece na agenda de todos.</p>
    <div class="grid2" style="margin-top:14px">
      <label class="field">Modalidade<select class="input" value=${f.modality} onChange=${upd('modality')}>${mods.map((m) => html`<option key=${m.id} value=${m.id}>${m.name}</option>`)}</select></label>
      <label class="field">Adversário<select class="input" required value=${f.opponent} onChange=${upd('opponent')}><option value="">Escolha</option>${people.map((p) => html`<option key=${p.id} value=${p.id}>${p.nick || p.name}</option>`)}</select></label>
      <label class="field">Data e horário<input class="input" type="datetime-local" required value=${f.startsAt} onInput=${upd('startsAt')} /></label>
      <label class="field">Local<input class="input" value=${f.location} onInput=${upd('location')} /></label>
      <label class="field" style="grid-column:1/-1">Recado<textarea class="input" rows="2" value=${f.notes} onInput=${upd('notes')}></textarea></label>
    </div>
    <div class="foot"><button type="button" class="btn ghost" onClick=${() => close(null)}>Cancelar</button><button class="btn primary">Enviar convite</button></div>
  </form>`;
}

function Item({ a, rsvps, mods }) {
  const me = sports.user?.id;
  const admin = store.admin;
  const mine = a.participants?.includes(me);
  const answers = rsvps.filter((r) => r.agenda_id === a.id);
  const my = answers.find((r) => r.user_id === me)?.answer;
  const yes = answers.filter((r) => r.answer === 'sim').length;
  const past = Date.parse(a.starts_at) < Date.now();
  const inviteToMe = a.status === 'proposed' && mine && a.proposed_by !== me;
  const edit = async () => {
    const f = await openDialog((close) => html`<${AdminForm} item=${a} mods=${mods} close=${close} />`);
    if (f) run((db) => db.agendaAdminSave(store.token, f), 'Compromisso salvo. Participantes avisados.');
  };
  const cancel = async () => {
    if (!(await confirmDialog({ title: `Cancelar "${a.title}"?`, body: 'Os participantes recebem um aviso de cancelamento.', confirmLabel: 'Cancelar compromisso', danger: true }))) return;
    if (a.proposed_by === me) run((db) => db.agendaCancelMine(a.id), 'Cancelado.');
    else run((db) => db.agendaAdminCancel(store.token, a.id), 'Cancelado. Participantes avisados.');
  };
  return html`<article class=${'glass ag-item ' + a.status + (past ? ' past' : '') + (mine ? ' mine' : '')}>
    <time class="ag-time">${time(a.starts_at)}</time>
    <div class="ag-body">
      <div class="ag-tags"><span class="chip plain">${KIND[a.kind]}</span>${a.modality && html`<span class="chip plain">${MODALITY_LABEL[a.modality] || a.modality}</span>`}
        ${a.status !== 'confirmed' && html`<span class=${'chip ' + (a.status === 'proposed' ? 'next' : 'wo')}>${STATUS[a.status]}</span>`}</div>
      <h3>${a.title}</h3>
      <p class="muted">${[a.location, a.participants?.length ? a.participants.map(nameOf).join(', ') : null].filter(Boolean).join(' · ')}</p>
      ${a.notes && html`<p class="ag-notes">${a.notes}</p>`}
      ${a.status === 'confirmed' && a.participants?.length > 0 && html`<p class="muted ag-rsvp">${yes} de ${a.participants.length} confirmaram presença</p>`}
      <div class="actions">
        ${inviteToMe && html`<button class="btn sm primary" onClick=${() => run((db) => db.agendaAnswer(a.id, true), 'Amistoso confirmado.')}>Aceitar</button>
          <button class="btn sm" onClick=${() => run((db) => db.agendaAnswer(a.id, false), 'Convite recusado.')}>Recusar</button>`}
        ${a.status === 'confirmed' && mine && !past && html`<button class=${'btn sm ' + (my === 'sim' ? 'primary' : '')} aria-pressed=${my === 'sim'} onClick=${() => run((db) => db.agendaRsvp(a.id, 'sim'), 'Presença confirmada.')}>Vou</button>
          <button class=${'btn sm ' + (my === 'nao' ? 'danger' : '')} aria-pressed=${my === 'nao'} onClick=${() => run((db) => db.agendaRsvp(a.id, 'nao'), 'Resposta registrada.')}>Não vou</button>`}
        ${admin && !a.proposed_by && a.status !== 'cancelled' && html`<button class="btn sm ghost" onClick=${edit}>Editar</button>`}
        ${a.status !== 'cancelled' && a.status !== 'declined' && !past && ((admin && !a.proposed_by) || a.proposed_by === me) && html`<button class="btn sm ghost" onClick=${cancel}>Cancelar</button>`}
      </div>
    </div>
  </article>`;
}

export function AgendaPage() {
  const s = useSports();
  const items = useQuery((db) => (db.agenda ? db.agenda() : Promise.resolve([])), [s.user?.id]);
  const rsvps = useQuery((db) => (db.rsvps ? db.rsvps() : Promise.resolve([])), []);
  const mods = useQuery((db) => db.modalities(), []);
  const [showPast, setShowPast] = useState(false);
  const list = items.data || [];
  const now = Date.now();
  // data do evento atual do campeonato (regulamento), quando o administrador definiu
  const reg = store.view()?.regulation;
  const eventDay = reg?.date ? { id: 'evento-atual', kind: 'evento', title: store.doc.event.name, starts_at: new Date(`${reg.date}T${reg.time || '09:00'}`).toISOString(), location: reg.location, participants: [], status: 'confirmed', fromChampionship: true } : null;
  const all = [...list, ...(eventDay && !list.some((a) => a.title === eventDay.title && a.starts_at === eventDay.starts_at) ? [eventDay] : [])];
  const upcoming = all.filter((a) => Date.parse(a.starts_at) >= now - 3 * 3600e3).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = all.filter((a) => Date.parse(a.starts_at) < now - 3 * 3600e3).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const invites = upcoming.filter((a) => a.status === 'proposed' && a.participants?.includes(s.user?.id) && a.proposed_by !== s.user?.id);
  const groups = [];
  for (const a of upcoming) { const k = dayKey(a.starts_at); if (groups.at(-1)?.k !== k) groups.push({ k, list: [] }); groups.at(-1).list.push(a); }
  const add = async () => {
    const f = await openDialog((close) => html`<${AdminForm} mods=${mods.data || []} close=${close} />`);
    if (f) run((db) => db.agendaAdminSave(store.token, f), 'Compromisso criado. Participantes avisados.');
  };
  const propose = async () => {
    const f = await openDialog((close) => html`<${ProposeForm} mods=${(mods.data || []).filter((m) => m.kind === 'individual')} close=${close} />`);
    if (f) run((db) => db.agendaPropose(f), 'Convite enviado.');
  };
  const missing = items.error && /schema|relation|does not exist|recusou/i.test(items.error.message || '');
  return html`<main class="page agenda-page">
    <div class="page-head">
      <div><span class="overline">${upcoming.length} compromisso${upcoming.length === 1 ? '' : 's'} pela frente</span><h1>Agenda</h1>
        <p>Campeonatos, partidas marcadas e amistosos. Quem é chamado recebe um aviso e confirma presença.</p></div>
      <div class="actions">
        ${s.approved && html`<button class="btn" onClick=${propose}>Propor amistoso</button>`}
        ${store.admin && s.db && html`<button class="btn primary" onClick=${add}>Novo compromisso</button>`}
      </div>
    </div>
    <${Gate} s=${s}>
      ${missing && html`<p class="notice warn">A agenda ainda não está ativa no banco: falta rodar <b>supabase/fase8.sql</b> no Supabase.</p>`}
      ${!s.user && html`<p class="notice">Entre na sua conta para ver convites, confirmar presença e propor amistosos.</p>`}
      ${invites.length > 0 && html`<section class="ag-invites"><h2 class="round-title">Convites para você</h2>
        ${invites.map((a) => html`<${Item} key=${a.id} a=${a} rsvps=${rsvps.data || []} mods=${mods.data || []} />`)}</section>`}
      ${groups.length === 0 && !items.loading && html`<div class="glass empty"><h3>Nada marcado</h3><p class="muted">${store.admin ? 'Crie um compromisso para avisar os participantes.' : 'Quando houver compromissos, eles aparecem aqui.'}</p></div>`}
      ${groups.map((g) => html`<section key=${g.k} class="ag-day"><h2 class="round-title">${g.k}</h2>
        ${g.list.filter((a) => !invites.includes(a)).map((a) => a.fromChampionship
          ? html`<article key=${a.id} class="glass ag-item champ"><time class="ag-time">${time(a.starts_at)}</time><div class="ag-body"><div class="ag-tags"><span class="chip champion">Campeonato</span></div><h3>${a.title}</h3><p class="muted">${a.location || ''}</p><div class="actions"><a class="btn sm" href="#/campeonatos">Ver campeonato</a></div></div></article>`
          : html`<${Item} key=${a.id} a=${a} rsvps=${rsvps.data || []} mods=${mods.data || []} />`)}</section>`)}
      ${past.length > 0 && html`<button class="btn ghost" onClick=${() => setShowPast(!showPast)}>${showPast ? 'Esconder' : 'Ver'} os últimos 30 dias (${past.length})</button>
        ${showPast && html`<div class="ag-past">${past.map((a) => html`<p key=${a.id} class="muted">${fmtDate(Date.parse(a.starts_at))} · ${a.title} · ${STATUS[a.status] || ''}</p>`)}</div>`}`}
    <//>
  </main>`;
}
