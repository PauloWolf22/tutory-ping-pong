// Banco simulado da fase 8, com as mesmas regras de supabase/fase8.sql: agenda, notificações, comunidade e regulamentos.
import { UserError } from '../js/core/engine.js';

const err = (m, status = 400) => { throw Object.assign(new UserError(m), { status }); };
const uuid = () => crypto.randomUUID();
const clean = (s, n) => (String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, n) || null);
const TARGET = /^[a-z]+:[A-Za-z0-9:_-]{1,160}$/;
const EMOJIS = ['aplauso', 'fogo', 'trofeu', 'risada', 'uau'];
const whenBr = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(',', ' às');

export function addFase8(db) {
  Object.assign(db, {
    _ag: [], _rsvp: [], _n: [], _c: [], _re: [], _rep: [], _reg: [],
    now: () => Date.now(),
    nameOf(id) { const p = this._p.get(id); return p?.nick || p?.name; },
    notify(user, kind, title, body, link, dedupe) {
      if (!user || !this.approved(user)) return;
      if (dedupe && this._n.some((n) => n.user_id === user && n.dedupe === dedupe)) return;
      this._n.push({ id: uuid(), user_id: user, kind, title: title.slice(0, 140), body: body?.slice(0, 400) || null, link, dedupe, created_at: new Date(this.now()).toISOString(), read_at: null });
    },
    me() { if (!this.current) err('Entre na sua conta.'); return this.current.id; },
    meApproved(msg = 'Sua conta ainda aguarda aprovação do administrador.') { const id = this.me(); if (!this.approved(id)) err(msg); return id; },

    // ------------------------------------------------ agenda
    async agenda() {
      const me = this.current?.id;
      const from = this.now() - 30 * 864e5;
      return this._ag.filter((a) => Date.parse(a.starts_at) >= from && (['confirmed', 'cancelled'].includes(a.status) || a.participants.includes(me) || a.proposed_by === me))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((a) => structuredClone(a));
    },
    async rsvps() { return structuredClone(this._rsvp); },
    async agendaAdminSave(t, item) {
      this.isAdmin(t);
      const title = clean(item.title, 120);
      if (!title) err('Informe o título.');
      if (!item.starts_at || Number.isNaN(Date.parse(item.starts_at))) err('Informe data e horário.');
      const kind = item.kind || 'evento';
      if (!['evento', 'partida', 'amistoso'].includes(kind)) err('Tipo inválido.');
      if (item.modality && !this._m.some((m) => m.id === item.modality)) err('Modalidade inválida.');
      const people = [...new Set(item.participants || [])];
      if (people.length > 60) err('No máximo 60 participantes por compromisso.');
      if (people.some((x) => !this.approved(x))) err('Todos os participantes precisam ter conta aprovada.');
      const starts_at = new Date(item.starts_at).toISOString();
      const row = { kind, modality: item.modality || null, title, starts_at, location: clean(item.location, 120), notes: clean(item.notes, 600), participants: people, status: 'confirmed', updated_at: new Date(this.now()).toISOString() };
      let a;
      if (item.id) { a = this._ag.find((x) => x.id === item.id); if (!a) err('Compromisso não encontrado.'); Object.assign(a, row); }
      else { a = { id: uuid(), proposed_by: null, created_at: row.updated_at, ...row }; this._ag.push(a); }
      for (const u of people) this.notify(u, 'agenda', 'Agendado: ' + title, whenBr(starts_at) + (a.location ? ' · ' + a.location : ''), '#/agenda', `agenda:${a.id}:${Math.floor(Date.parse(starts_at) / 1000)}`);
      this.bump();
      return { id: a.id };
    },
    async agendaAdminCancel(t, id) {
      this.isAdmin(t);
      const a = this._ag.find((x) => x.id === id && x.status !== 'cancelled');
      if (!a) err('Compromisso não encontrado ou já cancelado.');
      a.status = 'cancelled';
      for (const u of a.participants) this.notify(u, 'agenda', 'Cancelado: ' + a.title, whenBr(a.starts_at), '#/agenda', 'agenda-cancel:' + a.id);
      this.bump();
      return { ok: true };
    },
    async agendaPropose({ modality, opponent, startsAt, location, notes }) {
      this.asUser();
      const me = this.meApproved();
      if (!opponent || opponent === me || !this.approved(opponent)) err('Escolha um adversário com conta aprovada.');
      const m = this._m.find((x) => x.id === modality && x.active);
      if (!m) err('Modalidade inválida.');
      const at = Date.parse(startsAt);
      if (Number.isNaN(at) || at < this.now() || at > this.now() + 90 * 864e5) err('Escolha uma data nos próximos 90 dias.');
      if (this._ag.filter((a) => a.proposed_by === me && a.status === 'proposed').length >= 10) err('Você já tem 10 convites aguardando resposta.');
      const iso = new Date(at).toISOString();
      if (this._ag.some((a) => a.proposed_by === me && ['proposed', 'confirmed'].includes(a.status) && a.modality === modality && a.participants.includes(opponent) && a.starts_at === iso)) err('Esse convite já foi enviado.');
      const a = { id: uuid(), kind: 'amistoso', modality, title: 'Amistoso de ' + m.name, starts_at: iso, location: clean(location, 120), notes: clean(notes, 600), participants: [me, opponent], proposed_by: me, status: 'proposed', created_at: new Date(this.now()).toISOString() };
      this._ag.push(a);
      this.notify(opponent, 'convite', `${this.nameOf(me)} chamou você para um amistoso de ${m.name}`, whenBr(iso) + (a.location ? ' · ' + a.location : '') + '. Aceite ou recuse na agenda.', '#/agenda', 'agenda-invite:' + a.id);
      this.bump();
      return { id: a.id };
    },
    async agendaAnswer(id, accept) {
      const me = this.me();
      const a = this._ag.find((x) => x.id === id && x.status === 'proposed' && x.participants.includes(me) && x.proposed_by !== me);
      if (!a) err('Convite não encontrado ou já respondido.');
      a.status = accept ? 'confirmed' : 'declined';
      this.notify(a.proposed_by, 'convite', `${this.nameOf(me)} ${accept ? 'aceitou' : 'recusou'} o amistoso`, whenBr(a.starts_at), '#/agenda', 'agenda-answer:' + a.id);
      this.bump();
      return { ok: true };
    },
    async agendaCancelMine(id) {
      const me = this.me();
      const a = this._ag.find((x) => x.id === id && x.proposed_by === me && ['proposed', 'confirmed'].includes(x.status));
      if (!a) err('Só quem propôs pode cancelar.');
      a.status = 'cancelled';
      for (const u of a.participants) if (u !== me) this.notify(u, 'agenda', 'Cancelado: ' + a.title, whenBr(a.starts_at), '#/agenda', 'agenda-cancel:' + a.id);
      this.bump();
      return { ok: true };
    },
    async agendaRsvp(id, answer) {
      const me = this.me();
      if (!['sim', 'nao'].includes(answer)) err('Resposta inválida.');
      const a = this._ag.find((x) => x.id === id && x.status === 'confirmed' && x.participants.includes(me) && Date.parse(x.starts_at) > this.now() - 864e5);
      if (!a) err('Só quem foi chamado confirma presença, antes do compromisso.');
      this._rsvp = this._rsvp.filter((r) => !(r.agenda_id === id && r.user_id === me));
      this._rsvp.push({ agenda_id: id, user_id: me, answer, at: new Date(this.now()).toISOString() });
      this.bump();
      return { ok: true };
    },
    async notifications() {
      const me = this.current?.id;
      return this._n.filter((n) => n.user_id === me).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50).map((n) => ({ ...n }));
    },
    async notificationsRead(ids) {
      const me = this.me();
      for (const n of this._n) if (n.user_id === me && !n.read_at && (!ids || ids.includes(n.id))) n.read_at = new Date(this.now()).toISOString();
      return { ok: true };
    },

    // ------------------------------------------------ comunidade
    async comments(target) { const me = this.current?.id; return this._c.filter((c) => c.target === target && (!c.hidden || c.user_id === me)).map((c) => ({ ...c })); },
    async reactions(target) { return this._re.filter((r) => r.target === target).map((r) => ({ ...r })); },
    async comment(target, body, parent) {
      this.asUser();
      const me = this.meApproved();
      if (this._p.get(me).muted) err('O administrador suspendeu seus comentários.');
      const text = String(body ?? '').trim().slice(0, 500);
      if (!text) err('Escreva o comentário.');
      if (!TARGET.test(target)) err('Destino inválido.');
      const mine = this._c.filter((c) => c.user_id === me);
      if (mine.some((c) => Date.parse(c.created_at) > this.now() - 5000)) err('Espere alguns segundos antes de comentar de novo.');
      if (mine.filter((c) => Date.parse(c.created_at) > this.now() - 3600e3).length >= 30) err('Limite de 30 comentários por hora.');
      let p = null;
      if (parent) {
        p = this._c.find((c) => c.id === parent);
        if (!p || p.target !== target || p.hidden) err('Comentário respondido não existe mais.');
        if (p.parent_id) parent = p.parent_id;
      }
      const c = { id: uuid(), target, user_id: me, parent_id: parent || null, body: text, created_at: new Date(this.now()).toISOString(), hidden: false, hidden_at: null };
      this._c.push(c);
      if (p && p.user_id !== me) this.notify(p.user_id, 'resposta', `${this.nameOf(me)} respondeu seu comentário`, text.slice(0, 120), null, 'reply:' + c.id);
      this.bump();
      return { id: c.id };
    },
    async commentDelete(id) {
      const me = this.current?.id;
      const before = this._c.length;
      this._c = this._c.filter((c) => !(c.id === id && c.user_id === me) && !(c.parent_id === id && this._c.some((x) => x.id === id && x.user_id === me)));
      if (this._c.length === before) err('Só quem escreveu pode apagar.');
      this.bump();
      return { ok: true };
    },
    async react(target, emoji) {
      const me = this.meApproved();
      if (!EMOJIS.includes(emoji) || !TARGET.test(target)) err('Reação inválida.');
      const i = this._re.findIndex((r) => r.target === target && r.user_id === me && r.emoji === emoji);
      if (i >= 0) this._re.splice(i, 1); else this._re.push({ target, user_id: me, emoji, at: new Date(this.now()).toISOString() });
      this.bump();
      return { ok: true };
    },
    async reportComment(id, reason) {
      if (!this.current || !this.approved(this.current.id)) err('Entre com uma conta aprovada para denunciar.');
      if (!this._c.some((c) => c.id === id)) err('Comentário não encontrado.');
      this._rep = this._rep.filter((r) => !(r.comment_id === id && r.user_id === this.current.id));
      this._rep.push({ comment_id: id, user_id: this.current.id, reason: clean(reason, 200), resolved: false, at: new Date(this.now()).toISOString() });
      return { ok: true };
    },
    async adminReports(t) {
      this.isAdmin(t);
      const open = (c) => this._rep.filter((r) => r.comment_id === c.id && !r.resolved);
      return this._c.filter((c) => c.hidden || open(c).length).map((c) => ({
        id: c.id, target: c.target, body: c.body, created_at: c.created_at, hidden: c.hidden, user_id: c.user_id, author: this._p.get(c.user_id)?.name,
        muted: !!this._p.get(c.user_id)?.muted, reports: open(c).length, reasons: open(c).map((r) => r.reason || 'sem motivo').join(' · ') || null,
      })).sort((a, b) => b.reports - a.reports || b.created_at.localeCompare(a.created_at));
    },
    async adminComment(t, id, action) {
      this.isAdmin(t);
      const c = this._c.find((x) => x.id === id);
      if (action === 'hide' && c) Object.assign(c, { hidden: true, hidden_at: new Date(this.now()).toISOString() });
      else if (action === 'show' && c) Object.assign(c, { hidden: false, hidden_at: null });
      else if (action === 'delete') this._c = this._c.filter((x) => x.id !== id && x.parent_id !== id);
      else if (action !== 'dismiss') err('Ação inválida.');
      for (const r of this._rep) if (r.comment_id === id) r.resolved = true;
      this.bump();
      return { ok: true };
    },
    async adminMute(t, user, mute) { this.isAdmin(t); const p = this._p.get(user); if (p) p.muted = !!mute; this.bump(); return { ok: true }; },

    // ------------------------------------------------ estatísticas (mesmo filtro de resultsOf/awardsOf do Supabase)
    async resultsOf(uid) { return this._r.filter((r) => r.status === 'approved' && (r.p1 === uid || r.p2 === uid || r.team1?.includes(uid) || r.team2?.includes(uid))).map((r) => structuredClone(r)); },
    async awardsOf(uid) { return this._a.filter((a) => a.user_id === uid).map((a) => ({ ...a })); },

    // ------------------------------------------------ regulamentos
    async regulations() { return this._reg.filter((r) => r.status === 'published').sort((a, b) => b.version - a.version).map((r) => ({ ...r })); },
    async adminRegulations(t, modality) { this.isAdmin(t); return this._reg.filter((r) => r.modality === modality).sort((a, b) => b.version - a.version).map((r) => ({ ...r })); },
    async adminRegulationSave(t, r) {
      this.isAdmin(t);
      if (!/^[a-z0-9_-]{2,30}$/.test(r.modality || '')) err('Modalidade inválida.');
      const title = clean(r.title, 120);
      if (!title) err('Informe o título.');
      let d = this._reg.find((x) => x.modality === r.modality && x.status === 'draft');
      const fields = { title, official: r.official?.slice(0, 12000) || null, internal: r.internal?.slice(0, 12000) || null, sources: r.sources?.slice(0, 2000) || null };
      if (d) Object.assign(d, fields);
      else {
        const version = Math.max(0, ...this._reg.filter((x) => x.modality === r.modality).map((x) => x.version)) + 1;
        d = { id: uuid(), modality: r.modality, version, status: 'draft', created_at: new Date(this.now()).toISOString(), published_at: null, ...fields };
        this._reg.push(d);
      }
      return { id: d.id };
    },
    async adminRegulationPublish(t, id) {
      this.isAdmin(t);
      const d = this._reg.find((x) => x.id === id && x.status === 'draft');
      if (!d) err('Rascunho não encontrado.');
      Object.assign(d, { status: 'published', published_at: new Date(this.now()).toISOString() });
      this.bump();
      return { ok: true };
    },
  });
  return db;
}
