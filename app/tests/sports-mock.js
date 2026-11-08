// Banco simulado do Tutory Sports, com as mesmas regras de supabase/sports.sql.
// Usado pelos testes e pela tela de demonstração: nada vai para o Supabase.
import { UserError } from '../js/core/engine.js';

const err = (m, status = 400) => { throw Object.assign(new UserError(m), { status }); };
const today = () => new Date().toISOString().slice(0, 10);
const uuid = () => crypto.randomUUID();
const BELTS = ['Branca', 'Cinza', 'Amarela', 'Laranja', 'Verde', 'Azul', 'Roxa', 'Marrom', 'Preta'];
const PLACES = ['campeao', 'vice', 'terceiro', 'participacao'];
const POINT_KEYS = ['win', 'loss', 'friendly_win', 'friendly_loss', 'participation', 'champion', 'vice', 'third', 'achievement'];
const clean = (s, n) => (String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, n) || null);

export function createMockSportsDb({ adminToken = 'tok' } = {}) {
  const db = {
    users: new Map(), // email -> {id, password}
    _p: new Map(),
    _r: [],
    _a: [],
    // migração do SQL: a linha '*' herda ranking_rules (vitória 3, derrota 1, título 10, vice 5)
    _pts: [{ modality: '*', win: 3, loss: 1, friendly_win: 3, friendly_loss: 1, participation: 1, champion: 10, vice: 5, third: 3, achievement: 2, weight: 1 }],
    _audit: [],
    _m: [
      { id: 'pingpong', name: 'Ping Pong', family: 'esporte', kind: 'individual', score_hint: 'Games, ex.: 2 x 1', methods: null, active: true, sort: 1 },
      { id: 'jiujitsu', name: 'Jiu-Jitsu', family: 'esporte', kind: 'individual', score_hint: 'Pontos, ex.: 4 x 2', methods: ['Finalização', 'Pontos', 'Vantagem', 'Decisão', 'Desclassificação'], active: true, sort: 2 },
      { id: 'eafc', name: 'EA FC', family: 'gaming', kind: 'individual', score_hint: 'Gols, ex.: 3 x 1', methods: null, active: true, sort: 3 },
      { id: 'cod', name: 'Call of Duty', family: 'gaming', kind: 'individual', score_hint: 'Abates ou rodadas', methods: null, active: true, sort: 4 },
      { id: 'mk', name: 'Mortal Kombat', family: 'gaming', kind: 'individual', score_hint: 'Rounds, ex.: 2 x 0', methods: null, active: true, sort: 5 },
      { id: 'cs', name: 'Counter-Strike', family: 'esports', kind: 'equipe', score_hint: 'Rounds, ex.: 13 x 9', methods: null, active: true, sort: 6 },
    ],
    current: null, // usuário logado
    listener: null,
    bump() { this.listener?.(); },
    audit(tbl, op, before, after) {
      this._audit.unshift({ id: this._audit.length + 1, at: new Date().toISOString(), actor: this._adm ? 'administrador' : this.current?.id || 'administrador', tbl, op, row_id: (after || before)?.id || (after || before)?.modality, before, after });
    },
    approved(id) { return this._p.get(id)?.status === 'approved'; },
    isAdmin(t) { if (t !== adminToken) err('Sessão de administrador expirada. Entre novamente.', 401); this._adm = true; },
    asUser() { this._adm = false; },
    visible(r) { return r.status === 'approved' || (this.current && [r.p1, r.p2].includes(this.current.id)); },
    pointsFor(m) { return this._pts.find((x) => x.modality === m) || this._pts.find((x) => x.modality === '*'); },

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
    async modalities() { return structuredClone(this._m.filter((m) => m.active).sort((a, b) => a.sort - b.sort)); },
    async modalitiesAll() { return structuredClone([...this._m].sort((a, b) => a.sort - b.sort)); },
    async points() { return structuredClone(this._pts); },
    async results(modality, limit = 30) {
      return this._r.filter((r) => this.visible(r) && (!modality || r.modality === modality))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit).map((r) => ({ ...r }));
    },
    async awards(modality) { return this._a.filter((a) => a.modality === modality); },
    // mesmo cálculo de sp_ranking
    async ranking(modality, gender, belt) {
      const rows = new Map();
      const row = (id) => rows.get(id) || rows.set(id, { cwins: 0, closses: 0, fwins: 0, flosses: 0, titles: 0, vices: 0, thirds: 0, events: 0, achievements: 0 }).get(id);
      for (const r of this._r.filter((x) => x.status === 'approved' && x.modality === modality)) {
        for (const [team, side] of [[r.team1 || [r.p1], r.p1], [r.team2 || [r.p2], r.p2]]) {
          for (const id of team) {
            const x = row(id), won = r.winner === side, camp = r.kind === 'campeonato';
            x[camp ? (won ? 'cwins' : 'closses') : (won ? 'fwins' : 'flosses')]++;
          }
        }
      }
      const field = { campeao: 'titles', vice: 'vices', terceiro: 'thirds', participacao: 'events', conquista: 'achievements' };
      for (const a of this._a.filter((x) => x.modality === modality)) row(a.user_id)[field[a.place]]++;
      const R = this.pointsFor(modality);
      return [...rows].map(([id, x]) => ({ id, p: this._p.get(id), ...x }))
        .filter(({ p }) => p?.status === 'approved' && (!gender || p.gender === gender) && (!belt || (p.belt_verified && p.belt === belt)))
        .map(({ id, p, ...x }) => ({
          id, name: p.name, nick: p.nick, gender: p.gender, belt: p.belt, belt_verified: !!p.belt_verified, thumb: p.avatar?.thumb || null, wins: x.cwins + x.fwins, losses: x.closses + x.flosses, ...x,
          points: x.cwins * R.win + x.closses * R.loss + x.fwins * R.friendly_win + x.flosses * R.friendly_loss + x.events * R.participation
            + x.titles * R.champion + x.vices * R.vice + x.thirds * R.third + x.achievements * R.achievement,
        }))
        .sort((a, b) => b.points - a.points || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name));
    },
    // mesmo cálculo de sp_ranking_general: nota 0-100 por modalidade × peso
    async rankingGeneral(family, gender) {
      const all = [];
      for (const m of this._m.filter((x) => x.active && (!family || x.family === family)).sort((a, b) => a.sort - b.sort)) {
        const rows = await this.ranking(m.id, gender);
        const max = Math.max(0, ...rows.map((r) => r.points));
        if (max <= 0) continue;
        const w = this.pointsFor(m.id).weight;
        for (const r of rows) all.push({ id: r.id, modality: m.id, modality_name: m.name, points: r.points, norm: Math.round(r.points / max * 1000) / 10, score: Math.round(r.points / max * 100 * w * 10) / 10 });
      }
      const by = new Map();
      for (const e of all) { const l = by.get(e.id) || by.set(e.id, []).get(e.id); l.push(e); }
      return [...by].map(([id, parts]) => {
        const p = this._p.get(id);
        return { id, name: p.name, nick: p.nick, gender: p.gender, thumb: p.avatar?.thumb || null, score: Math.round(parts.reduce((s, e) => s + e.score, 0) * 10) / 10, modalities: parts.length, parts: parts.sort((a, b) => b.score - a.score).map(({ id: _, ...e }) => e) };
      }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    },
    async saveProfile(p) {
      this.asUser();
      if (!this.current) err('Entre na sua conta.');
      const name = (p.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      if (name.length < 2) err('Informe seu nome.');
      if (!['m', 'f'].includes(p.gender)) err('Escolha a categoria: masculino ou feminino.');
      const belt = clean(p.belt, 20);
      if (belt && !BELTS.includes(belt)) err('Faixa inválida.');
      const old = this._p.get(this.current.id);
      const next = { status: 'pending', avatar: null, belt_verified: false, created_at: new Date().toISOString(), approved_at: null, ...old, id: this.current.id, name, nick: p.nick?.trim() || null, gender: p.gender, belt };
      if (old && old.belt !== belt) next.belt_verified = false;
      this._p.set(next.id, next);
      this.audit('profiles', old ? 'update' : 'insert', old && { ...old, avatar: undefined }, { ...next, avatar: undefined });
      this.bump();
      return structuredClone(next);
    },
    async saveAvatar(a) {
      if (!this.current) err('Entre na sua conta.');
      const p = this._p.get(this.current.id);
      if (!p) err('Complete seu perfil antes do avatar.');
      if (JSON.stringify(a).length > 30000) err('Dados do avatar inválidos.');
      p.avatar = { ...structuredClone(a), belt: p.belt_verified && p.belt ? p.belt : 'Branca' };
      this.bump();
      return { ok: true };
    },
    async report(r) {
      this.asUser();
      const me = this.current?.id;
      if (!me) err('Entre na sua conta.');
      if (!this.approved(me)) err('Sua conta ainda aguarda aprovação do administrador.');
      if (!this.approved(r.opponent) || r.opponent === me) err('Escolha um adversário com conta aprovada.');
      const mod = this._m.find((m) => m.id === r.modality && m.active);
      if (!mod) err('Modalidade inválida.');
      if (r.playedOn && r.playedOn > today()) err('A data do jogo precisa ser dos últimos 60 dias.');
      if (this._r.filter((x) => x.reported_by === me && x.status === 'pending').length >= 20) err('Você já tem 20 resultados aguardando aprovação.');
      let team1 = null, team2 = null;
      if (mod.kind === 'equipe') {
        team1 = [...new Set([me, ...(r.team || [])])];
        team2 = [...new Set([r.opponent, ...(r.opponents || [])])];
        if (team1.length > 5 || team2.length > 5) err('Cada equipe tem no máximo 5 pessoas.');
        if (team1.some((x) => team2.includes(x))) err('A mesma pessoa não pode estar nas duas equipes.');
        if ([...team1, ...team2].some((x) => !this.approved(x))) err('Todos da equipe precisam ter conta aprovada.');
      }
      const day = r.playedOn || today(), score = clean(r.score, 40), winner = r.won ? me : r.opponent;
      const pair = [me, r.opponent].sort().join();
      if (this._r.some((x) => x.modality === r.modality && x.kind === 'amistoso' && x.status !== 'rejected' && x.played_on === day && [x.p1, x.p2].sort().join() === pair && x.score === score && x.winner === winner)) {
        err('Esse resultado já foi lançado. Se foi outro jogo, informe o placar para diferenciar.');
      }
      const id = uuid();
      const row = { id, modality: r.modality, kind: 'amistoso', p1: me, p2: r.opponent, winner, score, method: r.method || null, note: null, source: null, status: 'pending', reported_by: me, played_on: day, created_at: new Date().toISOString(), decided_at: null, category: null, team1, team2 };
      this._r.push(row);
      this.audit('results', 'insert', null, row);
      this.bump();
      return { id };
    },
    async cancel(id) {
      this.asUser();
      const i = this._r.findIndex((r) => r.id === id && r.reported_by === this.current?.id && r.status === 'pending');
      if (i < 0) err('Só dá para cancelar um resultado seu ainda não aprovado.');
      this.audit('results', 'delete', this._r[i], null);
      this._r.splice(i, 1);
      this.bump();
      return { ok: true };
    },
    async adminPending(t) {
      this.isAdmin(t);
      const email = (id) => [...this.users.values()].find((u) => u.id === id)?.email;
      return {
        profiles: [...this._p.values()].map((p) => ({ id: p.id, name: p.name, nick: p.nick, gender: p.gender, status: p.status, email: email(p.id), created_at: p.created_at, belt: p.belt, belt_verified: !!p.belt_verified, reset: this.resets.has(email(p.id)) })),
        results: this._r.filter((r) => r.status === 'pending').map((r) => ({ ...r })),
      };
    },
    async adminSetStatus(t, id, status) { this.isAdmin(t); const p = this._p.get(id); if (p) { const b = { ...p }; p.status = status; this.audit('profiles', 'update', b, { ...p }); } this.bump(); return { ok: true }; },
    async adminDecide(t, id, approve) {
      this.isAdmin(t);
      const r = this._r.find((x) => x.id === id && x.status === 'pending');
      if (!r) err('Resultado não encontrado ou já decidido.');
      const b = { ...r };
      r.status = approve ? 'approved' : 'rejected';
      this.audit('results', 'update', b, { ...r });
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
        if (old) {
          if (old.winner === i.winner && old.score === i.score && old.category === (i.category || null)) continue;
          Object.assign(old, { winner: i.winner, score: i.score, category: i.category || null });
        } else this._r.push({ id: uuid(), modality: i.modality, kind: 'campeonato', p1: i.p1, p2: i.p2, winner: i.winner, score: i.score, method: null, note: null, source: i.source, status: 'approved', reported_by: null, played_on: i.played_on || today(), created_at: new Date().toISOString(), decided_at: new Date().toISOString(), category: i.category || null, team1: null, team2: null });
        nr++;
      }
      for (const a of awards) {
        if (!this.approved(a.user_id) || !PLACES.includes(a.place)) continue;
        const old = this._a.find((x) => x.source === a.source);
        if (old) {
          if (old.user_id === a.user_id && old.category === (a.category || null)) continue;
          Object.assign(old, { user_id: a.user_id, category: a.category || null });
        } else this._a.push({ id: uuid(), ...a, category: a.category || null });
        na++;
      }
      this.bump();
      return { results: nr, awards: na };
    },
    async adminSetPoints(t, modality, rules) {
      this.isAdmin(t);
      if (modality !== '*' && !this._m.some((m) => m.id === modality)) err('Modalidade inválida.');
      const i = this._pts.findIndex((x) => x.modality === modality);
      if (rules === null) {
        if (modality === '*') err('A pontuação padrão não pode ser apagada.');
        if (i >= 0) { this.audit('ranking_points', 'delete', this._pts[i], null); this._pts.splice(i, 1); }
      } else {
        const row = { modality };
        for (const k of POINT_KEYS) {
          const v = Number(rules[k]);
          if (!Number.isInteger(v) || v < 0 || v > 1000) err('Pontuação inválida: use números inteiros de 0 a 1000 e peso de 0 a 10.');
          row[k] = v;
        }
        row.weight = Number(rules.weight);
        if (!Number.isFinite(row.weight) || row.weight < 0 || row.weight > 10) err('Pontuação inválida: use números inteiros de 0 a 1000 e peso de 0 a 10.');
        this.audit('ranking_points', i >= 0 ? 'update' : 'insert', i >= 0 ? this._pts[i] : null, row);
        if (i >= 0) this._pts[i] = row; else this._pts.push(row);
      }
      this.bump();
      return { ok: true };
    },
    async adminSetBelt(t, id, belt, verified) {
      this.isAdmin(t);
      const b = clean(belt, 20);
      if (b && !BELTS.includes(b)) err('Faixa inválida.');
      const p = this._p.get(id) || err('Conta não encontrada.');
      const before = { ...p, avatar: undefined };
      p.belt = b;
      p.belt_verified = !!verified && !!b;
      if (p.avatar) p.avatar = { ...p.avatar, belt: p.belt_verified ? b : 'Branca' };
      this.audit('profiles', 'update', before, { ...p, avatar: undefined });
      this.bump();
      return { ok: true };
    },
    async adminSaveModality(t, m) {
      this.isAdmin(t);
      const id = String(m.id || '').trim().toLowerCase();
      if (!/^[a-z0-9-]{2,30}$/.test(id)) err('Código da modalidade: letras minúsculas, números ou hífen.');
      if (!clean(m.name, 40)) err('Informe o nome da modalidade.');
      const row = { id, name: clean(m.name, 40), family: m.family || 'esporte', kind: m.kind || 'individual', score_hint: clean(m.score_hint, 60), methods: null, active: m.active ?? true, sort: m.sort ?? 50 };
      if (!['esporte', 'gaming', 'esports'].includes(row.family) || !['individual', 'equipe'].includes(row.kind)) err('Dados da modalidade inválidos.');
      const i = this._m.findIndex((x) => x.id === id);
      if (i >= 0) { row.methods = this._m[i].methods; this.audit('modalities', 'update', this._m[i], row); this._m[i] = row; } else { this.audit('modalities', 'insert', null, row); this._m.push(row); }
      this.bump();
      return { ok: true, id };
    },
    async adminAward(t, user, modality, label) {
      this.isAdmin(t);
      if (!this.approved(user)) err('Escolha uma conta aprovada.');
      if (!this._m.some((m) => m.id === modality)) err('Modalidade inválida.');
      const l = clean(label, 80) || err('Descreva a conquista.');
      if (this._a.some((a) => a.user_id === user && a.modality === modality && a.place === 'conquista' && a.label.toLowerCase() === l.toLowerCase())) err('Essa pessoa já tem essa conquista nesta modalidade.');
      const row = { id: uuid(), modality, user_id: user, place: 'conquista', label: l, source: null, category: null, created_at: new Date().toISOString() };
      this._a.push(row);
      this.audit('awards', 'insert', null, row);
      this.bump();
      return { id: row.id };
    },
    async adminDeleteAward(t, id) {
      this.isAdmin(t);
      const i = this._a.findIndex((a) => a.id === id);
      if (i < 0) err('Registro não encontrado.');
      this.audit('awards', 'delete', this._a[i], null);
      this._a.splice(i, 1);
      this.bump();
      return { ok: true };
    },
    async adminAudit(t, limit = 100) { this.isAdmin(t); return structuredClone(this._audit.slice(0, limit)); },
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
