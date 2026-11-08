// Tutory Sports: contas dos participantes, modalidades, amistosos e ranking (supabase/sports.sql).
// Funciona só com o Supabase configurado. O administrador continua sendo a senha do campeonato (store.token).
import { UserError } from './engine.js';
import { loadLibrary } from './cloud.js';
import { SUPABASE } from '../config.js';
import { store } from './store.js';

const OFFLINE = 'Sem conexão com o banco. Verifique a internet e tente de novo.';
const NOT_READY = 'O banco do Tutory Sports ainda não foi preparado. Rode o script supabase/sports.sql no Supabase.';

// Mensagens do Supabase Auth em português.
const AUTH_ERRORS = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'E-mail ainda não confirmado. Peça ao administrador para desligar a confirmação de e-mail no Supabase.'],
  [/already registered|already been registered/i, 'Este e-mail já tem conta. Use Entrar.'],
  [/password should be at least|weak password/i, 'Use uma senha com pelo menos 6 caracteres.'],
  [/unable to validate email|invalid email|email address .* is invalid/i, 'E-mail inválido.'],
  [/rate limit|too many/i, 'Muitas tentativas. Aguarde um pouco e tente de novo.'],
  [/signups not allowed|signup is disabled/i, 'O cadastro está desligado no Supabase.'],
];
const authMessage = (e) => (AUTH_ERRORS.find(([re]) => re.test(e?.message || '')) || [null, 'Não foi possível concluir. Tente de novo.'])[1];

export const GENDER_LABEL = { m: 'Masculino', f: 'Feminino' };
export const STATUS_LABEL = { pending: 'Aguardando aprovação', approved: 'Aprovada', blocked: 'Bloqueada' };

// Conexão real. Os testes trocam por um banco simulado com o mesmo contrato.
export async function createSportsDb({ url, anonKey }) {
  await loadLibrary();
  const client = self.supabase.createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'tutory-sports-auth' },
  });
  const guard = async (fn) => {
    let res;
    try { res = await fn(); } catch { throw new UserError(OFFLINE); }
    if (res.error) {
      console.error(res.error);
      if (/fetch|network/i.test(res.error.message)) throw new UserError(OFFLINE);
      if (/does not exist|could not find|schema cache/i.test(res.error.message)) throw new UserError(NOT_READY);
      throw new UserError('O banco recusou a operação.');
    }
    if (res.data?.error) throw Object.assign(new UserError(res.data.error), { status: res.data.unauthorized ? 401 : res.data.conflict ? 409 : 400 });
    return res.data;
  };
  const rpc = (name, args) => guard(() => client.rpc(name, args));
  return {
    async session() { return (await client.auth.getSession()).data.session?.user || null; },
    onAuth(fn) { client.auth.onAuthStateChange((_e, s) => fn(s?.user || null)); },
    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw new UserError(authMessage(error));
      if (!data.session) throw new UserError('Conta criada, mas o Supabase pediu confirmação por e-mail. O administrador precisa desligar "Confirm email" em Authentication > Sign In / Providers > Email.');
      return data.user;
    },
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new UserError(authMessage(error));
      return data.user;
    },
    async signOut() { await client.auth.signOut(); },
    async changePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw new UserError(authMessage(error));
    },
    myProfile: (uid) => guard(() => client.from('profiles').select('*').eq('id', uid).maybeSingle()),
    profiles: () => guard(() => client.from('profiles').select('id,name,nick,gender,belt,avatar').eq('status', 'approved').order('name')),
    modalities: () => guard(() => client.from('modalities').select('*').eq('active', true).order('sort')),
    points: () => guard(() => client.from('ranking_points').select('*')),
    modalitiesAll: () => guard(() => client.from('modalities').select('*').order('sort')),
    results: (modality, limit = 30) => guard(() => {
      let q = client.from('results').select('*').order('created_at', { ascending: false }).limit(limit);
      if (modality) q = q.eq('modality', modality);
      return q;
    }),
    awards: (modality) => guard(() => client.from('awards').select('*').eq('modality', modality).order('created_at', { ascending: false })),
    ranking: (modality, gender, belt) => rpc('sp_ranking', { p_modality: modality, p_gender: gender || null, ...(belt && { p_belt: belt }) }),
    rankingGeneral: (family, gender) => rpc('sp_ranking_general', { p_family: family || null, p_gender: gender || null }),
    saveProfile: (p) => rpc('sp_save_profile', { p_name: p.name, p_nick: p.nick || null, p_gender: p.gender, p_belt: p.belt || null }),
    saveAvatar: (avatar) => rpc('sp_save_my_avatar', { p_avatar: avatar }),
    report: (r) => rpc('sp_report_result', { p_modality: r.modality, p_opponent: r.opponent, p_won: r.won, p_score: r.score || null, p_method: r.method || null, p_played_on: r.playedOn || null, p_team: r.team?.length ? r.team : null, p_opponents: r.opponents?.length ? r.opponents : null }),
    cancel: (id) => rpc('sp_cancel_result', { p_id: id }),
    adminPending: (token) => rpc('sp_admin_pending', { p_token: token }),
    adminSetStatus: (token, id, status) => rpc('sp_admin_set_status', { p_token: token, p_id: id, p_status: status }),
    adminDecide: (token, id, approve) => rpc('sp_admin_decide', { p_token: token, p_id: id, p_approve: approve }),
    adminDelete: (token, id) => rpc('sp_admin_delete_result', { p_token: token, p_id: id }),
    adminImport: (token, items, awards) => rpc('sp_admin_import', { p_token: token, p_items: items, p_awards: awards }),
    adminSetPoints: (token, modality, rules) => rpc('sp_admin_set_points', { p_token: token, p_modality: modality, p_rules: rules }),
    adminSetBelt: (token, id, belt, verified) => rpc('sp_admin_set_belt', { p_token: token, p_id: id, p_belt: belt || null, p_verified: verified }),
    adminSaveModality: (token, m) => rpc('sp_admin_save_modality', { p_token: token, p_m: m }),
    adminAward: (token, user, modality, label) => rpc('sp_admin_award', { p_token: token, p_user: user, p_modality: modality, p_label: label }),
    adminDeleteAward: (token, id) => rpc('sp_admin_delete_award', { p_token: token, p_id: id }),
    adminAudit: (token, limit = 100) => rpc('sp_admin_audit', { p_token: token, p_limit: limit }),
    finGet: (token) => rpc('sp_fin_get', { p_token: token }),
    finSave: (token, rev, data) => rpc('sp_fin_save', { p_token: token, p_rev: rev, p_data: data }),
    requestReset: (email) => rpc('sp_request_reset', { p_email: email }),
    adminResetPassword: (token, id) => rpc('sp_admin_reset_password', { p_token: token, p_id: id }),
    listen(fn) {
      client.channel('sports').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sports_signal' }, () => fn()).subscribe();
    },
  };
}

// Estado compartilhado das telas: quem está logado e o perfil dessa pessoa.
export const sports = {
  db: null,
  available: !!(SUPABASE.url && SUPABASE.anonKey),
  ready: false,
  user: null,
  profile: null,
  people: new Map(), // contas aprovadas, para mostrar o avatar da conta no campeonato
  version: 0,
  listeners: new Set(),
  initPromise: null,

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { this.version++; this.listeners.forEach((fn) => fn(this.version)); },

  init(db) {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      if (!db && !this.available) { this.ready = true; this.emit(); return; }
      this.db = db || await createSportsDb(SUPABASE);
      this.user = await this.db.session();
      await this.loadProfile();
      this.db.onAuth?.(async (u) => {
        if ((u?.id || null) === (this.user?.id || null)) return;
        this.user = u;
        await this.loadProfile();
      });
      await this.loadPeople();
      this.db.listen?.(() => { this.loadProfile(); this.loadPeople(); });
      this.ready = true;
      this.emit();
    })().catch((e) => { this.initPromise = null; this.ready = true; this.emit(); throw e; });
    return this.initPromise;
  },
  async loadProfile() {
    this.profile = this.user ? await this.db.myProfile(this.user.id).catch(() => null) : null;
    this.emit();
  },
  async loadPeople() {
    const list = await this.db.profiles().catch(() => null);
    if (list) { this.people = new Map(list.map((p) => [p.id, p])); this.emit(); }
  },
  need() {
    if (!this.db) throw new UserError(this.available ? 'Conectando ao banco… tente de novo em instantes.' : 'Contas e ranking funcionam só no site online, com o Supabase.');
    return this.db;
  },
  get approved() { return this.profile?.status === 'approved'; },

  async signUp({ email, password, name, nick, gender }) {
    const db = this.need();
    this.user = await db.signUp(email.trim(), password);
    this.profile = await db.saveProfile({ name, nick, gender });
    this.emit();
  },
  async signIn(email, password) {
    const db = this.need();
    this.user = await db.signIn(email.trim(), password);
    await this.loadProfile();
  },
  async signOut() { await this.need().signOut(); this.user = null; this.profile = null; this.emit(); },
  async saveProfile(p) { this.profile = await this.need().saveProfile(p); this.emit(); },
  async saveAvatar(avatar) { await this.need().saveAvatar(avatar); await this.loadProfile(); await this.loadPeople(); },

  // Chamadas do administrador: usam a sessão da senha do campeonato.
  admin(fn) {
    if (!store.admin || !store.token) throw new UserError('Entre como administrador.');
    return fn(this.need(), store.token);
  },
};

// Campos da pontuação (tabela ranking_points), na ordem da tela do administrador.
export const POINT_FIELDS = [
  ['win', 'Vitória em campeonato'], ['loss', 'Derrota em campeonato'],
  ['friendly_win', 'Vitória em amistoso'], ['friendly_loss', 'Derrota em amistoso'],
  ['participation', 'Participação em campeonato'], ['champion', 'Campeão'], ['vice', 'Vice'], ['third', 'Terceiro lugar'],
  ['achievement', 'Conquista'],
];
export const BELTS = ['Branca', 'Cinza', 'Amarela', 'Laranja', 'Verde', 'Azul', 'Roxa', 'Marrom', 'Preta'];
export const CATEGORY_LABEL = { m: 'Masculino', f: 'Feminino', misto: 'Misto' };

// Pontuação de uma modalidade: a linha própria ou a padrão ('*').
export const rulesFor = (list, modality) => (list || []).find((r) => r.modality === modality) || (list || []).find((r) => r.modality === '*') || null;

// Monta o lote que leva um campeonato encerrado ao ranking. Só entram jogos com os dois jogadores ligados a contas.
// Cada jogo e cada colocação tem um "source" fixo: enviar de novo atualiza, nunca duplica.
export function championshipImport(t, { modality = 'pingpong', key, gameWins, champion, vice, third = null, category = null }) {
  const link = new Map(t.players.filter((p) => p.userId).map((p) => [p.id, p.userId]));
  const day = (ms) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : null);
  const items = [];
  const played = new Set();
  for (const m of Object.values(t.matches || {})) {
    if (m.bye || !m.winner || !m.p?.[0] || !m.p?.[1]) continue;
    const a = link.get(m.p[0]), b = link.get(m.p[1]), w = link.get(m.winner);
    if (a) played.add(a);
    if (b) played.add(b);
    if (!a || !b || !w || a === b) continue;
    const g = m.manual || (m.wo ? null : gameWins(m, t.scoring));
    items.push({ source: `${key}:${m.id}`, modality, p1: a, p2: b, winner: w, score: m.wo ? 'WO' : g ? `${g[0]} x ${g[1]}` : null, category, played_on: day(m.endedAt) });
  }
  const label = `${t.meta.name} · ${t.meta.edition}`;
  const awards = [];
  for (const [p, place] of [[champion, 'campeao'], [vice, 'vice'], [third, 'terceiro']]) {
    if (p && link.get(p.id)) awards.push({ source: `${key}:${place}`, modality, user_id: link.get(p.id), place, label, category });
  }
  for (const uid of played) awards.push({ source: `${key}:participacao:${uid}`, modality, user_id: uid, place: 'participacao', label, category });
  const skipped = Object.values(t.matches || {}).filter((m) => !m.bye && m.winner && m.p?.[0] && m.p?.[1]).length - items.length;
  return { items, awards, skipped };
}
