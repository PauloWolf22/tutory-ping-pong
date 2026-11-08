// Banco simulado do Tutory Sports, com as mesmas regras de supabase/sports.sql.
// Usado pelos testes e pela tela de demonstração: nada vai para o Supabase.
import { UserError } from '../js/core/engine.js';

const err = (m, status = 400) => { throw Object.assign(new UserError(m), { status }); };
const today = () => new Date().toISOString().slice(0, 10);
const uuid = () => crypto.randomUUID();

export function createMockSportsDb({ adminToken = 'tok' } = {}) {
  const db = {
    users: new Map(), // email -> {id, password}
    _p: new Map(),
    _r: [],
    _a: [],
    _ru: { win: 3, loss: 1, champion: 10, vice: 5 },
    _m: [
      { id: 'pingpong', name: 'Ping Pong', family: 'esporte', kind: 'individual', score_hint: 'Games, ex.: 2 x 1', methods: null, active: true, sort: 1 },
      { id: 'jiujitsu', name: 'Jiu-Jitsu', family: 'esporte', kind: 'individual', score_hint: 'Pontos, ex.: 4 x 2', methods: ['Finalização', 'Pontos', 'Vantagem', 'Decisão', 'Desclassificação'], active: true, sort: 2 },
      { id: 'eafc', name: 'EA FC', family: 'gaming', kind: 'individual', score_hint: 'Gols, ex.: 3 x 1', methods: null, active: true, sort: 3 },
      { id: 'cod', name: 'Call of Duty', family: 'gaming', kind: 'individual', score_hint: 'Abates ou rodadas', methods: null, active: true, sort: 4 },
      { id: 'mk', name: 'Mortal Kombat', family: 'gaming', kind: 'individual', score_hint: 'Rounds, ex.: 2 x 0', methods: null, active: true, sort: 5 },
    ],
    current: null, // usuário logado
    listener: null,
    bump() { this.listener?.(); },
    approved(id) { return this._p.get(id)?.status === 'approved'; },
    isAdmin(t) { if (t !== adminToken) err('Sessão de administrador expirada. Entre novamente.', 401); },
    visible(r) { return r.status === 'approved' || (this.current && [r.p1, r.p2].includes(this.current.id)); },

    async session() { return this.current; },
    onAuth() {},
    async signUp(email, password) {
      if (this.users.has(email)) throw new UserError('Este e-mail já tem conta. Use Entrar.');
      if (password.length < 6) throw new UserError('Use uma senha com pelo menos 6 caracteres.');
      const u = { id: uuid(), email };
      this.users.set(email, { ...u, password });
      this.current = u;
      return u;
    },
    async signIn(email, password) {
      const u = this.users.get(email);
      if (!u || u.password !== password) throw new UserError('E-mail ou senha incorretos.');
      this.current = { id: u.id, email };
      return this.current;
    },
    async signOut() { this.current = null; },
    async changePassword(p) { const u = [...this.users.values()].find((x) => x.id === this.current?.id); u.password = p; },
    async myProfile(uid) { const p = this._p.get(uid); return p && (p.status === 'approved' || uid === this.current?.id) ? structuredClone(p) : null; },
    async profiles() { return [...this._p.values()].filter((p) => p.status === 'approved').sort((a, b) => a.name.localeCompare(b.name)).map((p) => structuredClone(p)); },
    async modalities() { return structuredClone(this._m); },
    async rules() { return { ...this._ru }; },
    async results(modality, limit = 30) {
      return this._r.filter((r) => this.visible(r) && (!modality || r.modality === modality))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit).map((r) => ({ ...r }));
    },
    async awards(modality) { return this._a.filter((a) => a.modality === modality); },
    async ranking(modality, gender) {
      const rows = new Map();
      const row = (id) => rows.get(id) || rows.set(id, { wins: 0, losses: 0, titles: 0, vices: 0 }).get(id);
      for (const r of this._r.filter((x) => x.status === 'approved' && x.modality === modality)) {
        for (const id of [r.p1, r.p2]) { const x = row(id); if (r.winner === id) x.wins++; else x.losses++; }
      }
      for (const a of this._a.filter((x) => x.modality === modality)) { const x = row(a.user_id); if (a.place === 'campeao') x.titles++; else x.vices++; }
      const R = this._ru;
      return [...rows].map(([id, x]) => ({ id, p: this._p.get(id), ...x }))
        .filter(({ p }) => p?.status === 'approved' && (!gender || p.gender === gender))
        .map(({ id, p, ...x }) => ({ id, name: p.name, nick: p.nick, gender: p.gender, thumb: p.avatar?.thumb || null, ...x, points: x.wins * R.win + x.losses * R.loss + x.titles * R.champion + x.vices * R.vice }))
        .sort((a, b) => b.points - a.points || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name));
    },
    async saveProfile(p) {
      if (!this.current) err('Entre na sua conta.');
      const name = (p.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      if (name.length < 2) err('Informe seu nome.');
      if (!['m', 'f'].includes(p.gender)) err('Escolha a categoria: masculino ou feminino.');
      const old = this._p.get(this.current.id);
      const next = { status: 'pending', avatar: null, created_at: new Date().toISOString(), approved_at: null, ...old, id: this.current.id, name, nick: p.nick?.trim() || null, gender: p.gender, belt: p.belt || null };
      this._p.set(next.id, next);
      this.bump();
      return structuredClone(next);
    },
    async saveAvatar(a) {
      if (!this.current) err('Entre na sua conta.');
      const p = this._p.get(this.current.id);
      if (!p) err('Complete seu perfil antes do avatar.');
      if (JSON.stringify(a).length > 30000) err('Dados do avatar inválidos.');
      p.avatar = structuredClone(a);
      this.bump();
      return { ok: true };
    },
    async report(r) {
      const me = this.current?.id;
      if (!me) err('Entre na sua conta.');
      if (!this.approved(me)) err('Sua conta ainda aguarda aprovação do administrador.');
      if (!this.approved(r.opponent) || r.opponent === me) err('Escolha um adversário com conta aprovada.');
      if (!this._m.some((m) => m.id === r.modality)) err('Modalidade inválida.');
      if (r.playedOn && r.playedOn > today()) err('A data do jogo precisa ser dos últimos 60 dias.');
      if (this._r.filter((x) => x.reported_by === me && x.status === 'pending').length >= 20) err('Você já tem 20 resultados aguardando aprovação.');
      const id = uuid();
      this._r.push({ id, modality: r.modality, kind: 'amistoso', p1: me, p2: r.opponent, winner: r.won ? me : r.opponent, score: r.score || null, method: r.method || null, note: null, source: null, status: 'pending', reported_by: me, played_on: r.playedOn || today(), created_at: new Date().toISOString(), decided_at: null });
      this.bump();
      return { id };
    },
    async cancel(id) {
      const i = this._r.findIndex((r) => r.id === id && r.reported_by === this.current?.id && r.status === 'pending');
      if (i < 0) err('Só dá para cancelar um resultado seu ainda não aprovado.');
      this._r.splice(i, 1);
      this.bump();
      return { ok: true };
    },
    async adminPending(t) {
      this.isAdmin(t);
      return {
        profiles: [...this._p.values()].map((p) => ({ id: p.id, name: p.name, nick: p.nick, gender: p.gender, status: p.status, email: [...this.users.values()].find((u) => u.id === p.id)?.email, created_at: p.created_at, reset: this.resets.has([...this.users.values()].find((u) => u.id === p.id)?.email) })),
        results: this._r.filter((r) => r.status === 'pending').map((r) => ({ ...r })),
      };
    },
    async adminSetStatus(t, id, status) { this.isAdmin(t); const p = this._p.get(id); if (p) p.status = status; this.bump(); return { ok: true }; },
    async adminDecide(t, id, approve) {
      this.isAdmin(t);
      const r = this._r.find((x) => x.id === id && x.status === 'pending');
      if (!r) err('Resultado não encontrado ou já decidido.');
      r.status = approve ? 'approved' : 'rejected';
      this.bump();
      return { ok: true };
    },
    async adminDelete(t, id) { this.isAdmin(t); this._r = this._r.filter((r) => r.id !== id); this.bump(); return { ok: true }; },
    async adminImport(t, items, awards) {
      this.isAdmin(t);
      let nr = 0, na = 0;
      for (const i of items) {
        if (!this.approved(i.p1) || !this.approved(i.p2) || i.p1 === i.p2 || ![i.p1, i.p2].includes(i.winner)) continue;
        const old = this._r.find((r) => r.source === i.source);
        if (old) Object.assign(old, { winner: i.winner, score: i.score });
        else this._r.push({ id: uuid(), modality: i.modality, kind: 'campeonato', p1: i.p1, p2: i.p2, winner: i.winner, score: i.score, method: null, note: null, source: i.source, status: 'approved', reported_by: null, played_on: today(), created_at: new Date().toISOString(), decided_at: new Date().toISOString() });
        nr++;
      }
      for (const a of awards) {
        if (!this.approved(a.user_id)) continue;
        const old = this._a.find((x) => x.source === a.source);
        if (old) old.user_id = a.user_id; else this._a.push({ id: uuid(), ...a });
        na++;
      }
      this.bump();
      return { results: nr, awards: na };
    },
    resets: new Set(),
    async requestReset(email) { if (this.users.has(email.trim().toLowerCase())) this.resets.add(email.trim().toLowerCase()); return { ok: true }; },
    async adminResetPassword(t, id) {
      this.isAdmin(t);
      const u = [...this.users.values()].find((x) => x.id === id);
      if (!u) err('Conta não encontrada.');
      u.password = 'prov' + Math.random().toString(36).slice(2, 8);
      this.resets.delete(u.email);
      return { password: u.password, email: u.email };
    },
    _fin: { data: {}, rev: 0 },
    async finGet(t) { this.isAdmin(t); return structuredClone(this._fin); },
    async finSave(t, rev, data) {
      this.isAdmin(t);
      if (rev !== this._fin.rev) err('O financeiro foi alterado em outro aparelho. Os dados foram recarregados; repita a ação.', 409);
      this._fin = { data: structuredClone(data), rev: rev + 1 };
      return { rev: this._fin.rev };
    },
    listen(fn) { this.listener = fn; },
  };
  return db;
}
