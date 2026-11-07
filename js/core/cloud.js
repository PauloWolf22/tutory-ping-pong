// Acesso ao Supabase. O contrato espelha o servidor local, para o Store tratar os dois do mesmo jeito.
import { UserError } from './engine.js';

const OFFLINE = 'Sem conexão com o banco do campeonato. Verifique a internet e tente de novo.';

// O pacote UMD precisa de document.currentScript, então entra como script comum, não como módulo.
export const loadLibrary = () => new Promise((resolve, reject) => {
  if (self.supabase) { resolve(); return; }
  const s = document.createElement('script');
  s.src = new URL('../vendor/supabase.js', import.meta.url).href;
  s.onload = resolve;
  s.onerror = () => reject(new UserError(OFFLINE));
  document.head.append(s);
});

export async function createCloud({ url, anonKey }) {
  await loadLibrary();
  const client = self.supabase.createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const rpc = async (name, args) => {
    let res;
    try {
      res = await client.rpc(name, args);
    } catch {
      throw new UserError(OFFLINE);
    }
    if (res.error) {
      console.error(name, res.error);
      throw new UserError(/fetch|network/i.test(res.error.message) ? OFFLINE : 'O banco recusou a operação. Confira se o script supabase/schema.sql foi executado.');
    }
    const data = res.data;
    if (data?.error) throw Object.assign(new UserError(data.error), { status: data.unauthorized ? 401 : 400 });
    return data;
  };

  const select = async (table, columns) => {
    let res;
    try {
      res = await client.from(table).select(columns).eq('id', 1).maybeSingle();
    } catch {
      throw new UserError(OFFLINE);
    }
    if (res.error) {
      console.error(table, res.error);
      throw new UserError(/fetch|network/i.test(res.error.message) ? OFFLINE : 'O banco ainda não foi preparado. Execute o script supabase/schema.sql no Supabase.');
    }
    if (!res.data) throw new UserError('O banco ainda não foi preparado. Execute o script supabase/schema.sql no Supabase.');
    return res.data;
  };

  return {
    async load() {
      const row = await select('tournament', 'rev,doc');
      return { rev: Number(row.rev), doc: row.doc };
    },
    async currentRev() {
      return Number((await select('tournament_signal', 'rev')).rev);
    },
    listen(onRev) {
      client.channel('tournament')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournament_signal' }, (p) => onRev(Number(p.new.rev)))
        .subscribe();
    },
    async login(password) { return (await rpc('pp_login', { p_password: password })).token; },
    session: (token) => rpc('pp_session', { p_token: token }),
    logout: (token) => rpc('pp_logout', { p_token: token }),
    changePassword: (token, current, next) => rpc('pp_change_password', { p_token: token, p_current: current, p_new: next }),
    async playerCode(token, id) { return (await rpc('pp_player_code', { p_token: token, p_id: id })).code; },
    async saveAvatar(token, id, code, avatar) {
      return Number((await rpc('pp_save_avatar', { p_token: token, p_id: id, p_code: code || null, p_avatar: avatar })).rev);
    },
    // Mesma forma de resposta do PUT /api/state: 200 com rev, ou 409 com a versão atual.
    async save(token, rev, doc) {
      const r = await rpc('pp_save_state', { p_token: token, p_rev: rev, p_doc: doc });
      if (r.conflict) return { httpStatus: 409, rev: Number(r.rev), state: r.doc };
      return { httpStatus: 200, rev: Number(r.rev) };
    },
  };
}
