// Central de notificações (sino no topo). Junta três fontes reais:
//  - as notificações da conta (supabase/fase8.sql: agenda, convites, respostas a comentários);
//  - os compromissos da agenda em que a pessoa está, nos próximos 7 dias;
//  - o campeonato: "sua partida é a próxima" e "sua partida começou", para quem está ligado à conta.
// Avisos do navegador só com permissão dada pela pessoa, e só enquanto o site está aberto.
import { html, useState, useEffect, store, fmtDate, displayName, playerById } from './lib.js';
import * as E from '../core/engine.js';
import { viewOf, CAT_LABEL } from '../core/event.js';
import { sports } from '../core/sports.js';
import { useQuery } from './sports.js';

const canAlert = () => typeof Notification !== 'undefined';
const SEEN = 'tutory-alertas-vistos';
const seen = () => { try { return new Set(JSON.parse(sessionStorage.getItem(SEEN) || '[]')); } catch { return new Set(); } };
const markSeen = (key) => { try { const s = seen(); s.add(key); sessionStorage.setItem(SEEN, JSON.stringify([...s].slice(-200))); } catch { /* sem armazenamento */ } };

function browserAlert(key, title, body, link) {
  if (!canAlert() || Notification.permission !== 'granted' || seen().has(key)) return;
  markSeen(key);
  try {
    const n = new Notification(title, { body: body || '', icon: 'assets/brand/favicon.svg', tag: key });
    n.onclick = () => { window.focus(); if (link) location.hash = link; n.close(); };
  } catch { /* alguns navegadores só permitem pelo service worker */ }
}

// Partidas do campeonato que envolvem a conta logada (em todas as categorias do evento).
export function myMatchAlerts() {
  const uid = sports.user?.id;
  const root = store.doc;
  if (!uid || !root?.comps) return [];
  const out = [];
  for (const cat of Object.keys(root.comps)) {
    const t = viewOf(root, cat);
    const mine = new Set(t.players.filter((p) => p.userId === uid).map((p) => p.id));
    if (!mine.size) continue;
    const vs = (m) => m.p.map((id) => displayName(playerById(t, id)) || 'a definir').join(' x ');
    const label = Object.keys(root.comps).length > 1 ? ` (${CAT_LABEL[cat]})` : '';
    for (const m of E.liveMatches(t).filter((x) => x.p.some((id) => mine.has(id)))) {
      out.push({ key: `live:${t.event.id}:${cat}:${m.id}`, cat, title: `Sua partida está em quadra${label}`, body: `${vs(m)} · ${E.roundOf(t, m).name}`, link: '#/partida/' + m.id });
    }
    const next = E.nextMatch(t);
    if (next && next.p.some((id) => mine.has(id))) {
      out.push({ key: `next:${t.event.id}:${cat}:${next.id}`, cat, title: `Sua partida é a próxima${label}`, body: `${vs(next)} · ${E.roundOf(t, next).name}`, link: '#/partida/' + next.id });
    }
  }
  return out;
}

export function Bell() {
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState(canAlert() ? Notification.permission : 'unsupported');
  const alerts = myMatchAlerts();
  const notes = sports.notes || [];
  const unread = notes.filter((n) => !n.read_at).length + alerts.length;
  // avisos do navegador: notificação nova da conta e mudança na sua partida
  useEffect(() => {
    sports.onNewNote = (n) => browserAlert('note:' + n.id, n.title, n.body, n.link);
    return () => { sports.onNewNote = null; };
  }, []);
  useEffect(() => { alerts.forEach((a) => browserAlert(a.key, a.title, a.body, a.link)); }, [alerts.map((a) => a.key).join('|')]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!e.target.closest?.('.bell-wrap')) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('pointerdown', close); addEventListener('keydown', esc);
    return () => { removeEventListener('pointerdown', close); removeEventListener('keydown', esc); };
  }, [open]);
  if (!sports.user) return null;
  const ask = async () => { try { setPerm(await Notification.requestPermission()); } catch { /* recusado */ } };
  const go = (a) => { if (a.cat) store.setCat(a.cat); setOpen(false); };
  return html`<div class="bell-wrap">
    <button class=${'btn sm bell' + (unread ? ' has' : '')} aria-label=${unread ? `${unread} ${unread === 1 ? 'aviso novo' : 'avisos novos'}` : 'Avisos'} aria-expanded=${open} onClick=${() => setOpen(!open)}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1Z"/></svg>
      ${unread > 0 && html`<b>${unread > 9 ? '9+' : unread}</b>`}
    </button>
    ${open && html`<${BellPanel} alerts=${alerts} notes=${notes} perm=${perm} ask=${ask} go=${go} close=${() => setOpen(false)} />`}
  </div>`;
}

function BellPanel({ alerts, notes, perm, ask, go, close }) {
  const uid = sports.user?.id;
  const agenda = useQuery((db) => (db.agenda ? db.agenda() : Promise.resolve([])), [uid]);
  const soon = (agenda.data || []).filter((a) => a.status === 'confirmed' && a.participants?.includes(uid)
    && Date.parse(a.starts_at) > Date.now() && Date.parse(a.starts_at) < Date.now() + 7 * 864e5);
  const unread = notes.filter((n) => !n.read_at);
  const read = async (n) => { if (!n.read_at) await sports.readNotes([n.id]).catch(() => {}); if (n.link) location.hash = n.link; close(); };
  return html`<div class="bell-panel glass" role="dialog" aria-label="Avisos">
    <div class="bp-head"><b>Avisos</b>${unread.length > 0 && html`<button class="btn sm ghost" onClick=${() => sports.readNotes(null).catch(() => {})}>Marcar todos como lidos</button>`}</div>
    ${alerts.map((a) => html`<a key=${a.key} class="bp-item hot" href=${a.link} onClick=${() => go(a)}><b>${a.title}</b><span>${a.body}</span></a>`)}
    ${soon.length > 0 && html`<span class="overline bp-sub">Próximos 7 dias</span>
      ${soon.map((a) => html`<a key=${a.id} class="bp-item" href="#/agenda" onClick=${close}><b>${a.title}</b><span>${fmtDate(Date.parse(a.starts_at))}${a.location ? ' · ' + a.location : ''}</span></a>`)}`}
    ${!sports.notesReady && html`<p class="muted bp-empty">A central da conta ainda não está ativa no banco (falta rodar supabase/fase8.sql).</p>`}
    ${sports.notesReady && notes.length === 0 && alerts.length === 0 && soon.length === 0 && html`<p class="muted bp-empty">Nenhum aviso por enquanto.</p>`}
    ${notes.length > 0 && html`<span class="overline bp-sub">Histórico</span>
      ${notes.map((n) => html`<button key=${n.id} class=${'bp-item' + (n.read_at ? '' : ' unread')} onClick=${() => read(n)}>
        <b>${n.title}</b>${n.body && html`<span>${n.body}</span>`}<small>${fmtDate(Date.parse(n.created_at))}</small></button>`)}`}
    <div class="bp-foot">
      ${perm === 'default' && html`<button class="btn sm" onClick=${ask}>Avisar também pelo navegador</button>`}
      ${perm === 'granted' && html`<span class="muted">Avisos do navegador ligados (com o site aberto).</span>`}
      ${perm === 'denied' && html`<span class="muted">Avisos do navegador bloqueados nas configurações do navegador.</span>`}
      <a class="btn sm ghost" href="#/agenda" onClick=${close}>Abrir agenda</a>
    </div>
  </div>`;
}
