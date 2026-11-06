// Camada de dados. Duas implementações com a mesma interface:
//  - servidor (server/server.ps1): senha verificada no servidor, sincronização entre aparelhos via SSE;
//  - local (sem servidor, ex.: hospedagem estática): localStorage + BroadcastChannel, só no mesmo navegador.
// Para trocar por Supabase, ver docs/INTEGRACAO-BANCO.md.
import { newTournament, UserError } from './engine.js';

const LOCAL_DOC = 'tutory-pp-doc';
const LOCAL_AUTH = 'tutory-pp-auth';
const SESSION_TOKEN = 'tutory-pp-token';
const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };

function withDefaults(doc) {
  const base = newTournament();
  if (!doc) return base;
  return {
    ...base, ...doc,
    meta: { ...base.meta, ...doc.meta },
    regulation: { ...base.regulation, ...doc.regulation },
    scoring: { ...base.scoring, ...doc.scoring },
    settings: { ...base.settings, ...doc.settings },
    draw: { ...base.draw, ...doc.draw },
    display: { ...base.display, ...doc.display },
  };
}

async function api(path, options = {}, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  let res;
  try {
    res = await fetch(path, { ...options, headers });
  } catch {
    throw new UserError('O servidor do campeonato está desligado. Dê dois cliques em start.bat, na pasta do projeto, e tente de novo.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) throw Object.assign(new UserError(data.error || 'Não foi possível concluir a ação.'), { status: res.status });
  return Object.assign(data, { httpStatus: res.status });
}

async function hashPassword(password, saltB64) {
  if (!crypto.subtle) throw new UserError('Sem o servidor, a senha só funciona em localhost ou HTTPS. Abra pelo start.bat.');
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256);
  return { salt: btoa(String.fromCharCode(...salt)), hash: btoa(String.fromCharCode(...new Uint8Array(bits))) };
}

class Store {
  constructor() {
    this.doc = null;
    this.rev = 0;
    this.mode = 'loading';
    this.admin = false;
    this.online = true;
    this.hasPassword = false;
    this.lan = [];
    this.token = safe(() => sessionStorage.getItem(SESSION_TOKEN));
    this.listeners = new Set();
    this.sending = false;
    this.dirty = false;
    this.version = 0;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.version++;
    this.listeners.forEach((fn) => fn(this.version));
  }

  async init() {
    let health = null;
    // Lentidão não pode virar modo local por engano: duas tentativas com folga antes de desistir do servidor.
    for (let attempt = 0; attempt < 2 && !health; attempt++) {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 6000);
        const res = await fetch('/api/health', { signal: ctl.signal });
        clearTimeout(timer);
        if (res.ok) health = await res.json();
        else break; // hospedagem estática responde 404: não há servidor
      } catch { /* tenta de novo; sem resposta, modo local */ }
    }
    if (health?.ok) await this.initServer(health);
    else this.initLocal();
    this.emit();
  }

  // ------------------------------------------------------------ servidor
  async initServer(health) {
    this.mode = 'server';
    this.hasPassword = health.hasPassword;
    this.lan = health.lan || [];
    await this.pull();
    if (this.token) {
      const s = await api('/api/session', {}, this.token).catch(() => ({}));
      this.admin = !!s.admin;
      if (!this.admin) this.setToken(null);
    }
    this.listen();
  }

  async pull() {
    const data = await api('/api/state');
    this.rev = data.rev;
    this.doc = withDefaults(data.state);
  }

  listen() {
    const es = new EventSource('/api/events');
    es.onopen = () => {
      if (!this.online) {
        this.online = true;
        this.pull().then(() => this.emit()).catch(() => {});
        this.emit();
      }
    };
    es.onmessage = (e) => {
      const { rev } = JSON.parse(e.data);
      if (rev > this.rev && !this.sending && !this.dirty) this.pull().then(() => this.emit()).catch(() => {});
    };
    es.onerror = () => {
      if (this.online) {
        this.online = false;
        this.emit();
      }
    };
  }

  setToken(token) {
    this.token = token;
    safe(() => (token ? sessionStorage.setItem(SESSION_TOKEN, token) : sessionStorage.removeItem(SESSION_TOKEN)));
  }

  async flush() {
    if (this.sending) return;
    this.sending = true;
    try {
      while (this.dirty) {
        this.dirty = false;
        const body = JSON.stringify(this.doc);
        const r = await api(`/api/state?rev=${this.rev}`, { method: 'PUT', body }, this.token);
        if (r.httpStatus === 409) {
          // outra sessão salvou antes: fica a versão do servidor, nada é sobrescrito às cegas
          this.rev = r.rev;
          this.doc = withDefaults(r.state);
          this.dirty = false;
          this.emit();
          throw new UserError('Outro administrador alterou o campeonato. Atualizei a tela; repita a ação se ainda fizer sentido.');
        }
        this.rev = r.rev;
      }
    } catch (e) {
      if (e.status === 401) {
        this.admin = false;
        this.setToken(null);
        this.emit();
      }
      this.onError?.(e);
      await this.pull().then(() => this.emit()).catch(() => {});
    } finally {
      this.sending = false;
    }
  }

  // ------------------------------------------------------------ local
  initLocal() {
    this.mode = 'local';
    const raw = safe(() => localStorage.getItem(LOCAL_DOC));
    this.doc = withDefaults(safe(() => JSON.parse(raw)));
    this.hasPassword = !!safe(() => localStorage.getItem(LOCAL_AUTH));
    this.admin = !!safe(() => sessionStorage.getItem(SESSION_TOKEN));
    this.channel = safe(() => new BroadcastChannel('tutory-pp'));
    if (this.channel) {
      this.channel.onmessage = () => {
        this.doc = withDefaults(safe(() => JSON.parse(localStorage.getItem(LOCAL_DOC))));
        this.emit();
      };
    }
  }

  persistLocal() {
    try {
      localStorage.setItem(LOCAL_DOC, JSON.stringify(this.doc));
      this.channel?.postMessage(1);
    } catch {
      this.onError?.(new UserError('Não foi possível salvar neste navegador (armazenamento cheio ou bloqueado).'));
    }
  }

  // ------------------------------------------------------------ interface comum
  // Toda alteração passa aqui: aplica numa cópia, só publica se não houver erro.
  update(fn) {
    if (!this.admin) throw new UserError('Entre como administrador para alterar o campeonato.');
    const next = structuredClone(this.doc);
    const result = fn(next);
    this.doc = next;
    this.emit();
    if (this.mode === 'local') this.persistLocal();
    else {
      this.dirty = true;
      this.flush();
    }
    return result;
  }

  async setupPassword(password) {
    if (password.length < 6) throw new UserError('Use uma senha com pelo menos 6 caracteres.');
    if (this.mode === 'local') {
      localStorage.setItem(LOCAL_AUTH, JSON.stringify(await hashPassword(password)));
      sessionStorage.setItem(SESSION_TOKEN, 'local');
    } else {
      const r = await api('/api/setup', { method: 'POST', body: JSON.stringify({ password }) });
      this.setToken(r.token);
    }
    this.hasPassword = true;
    this.admin = true;
    this.emit();
  }

  async login(password) {
    if (this.mode === 'local') {
      const saved = safe(() => JSON.parse(localStorage.getItem(LOCAL_AUTH)));
      const h = await hashPassword(password, saved?.salt);
      if (!saved || h.hash !== saved.hash) throw new UserError('Senha incorreta.');
      sessionStorage.setItem(SESSION_TOKEN, 'local');
    } else {
      const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
      this.setToken(r.token);
    }
    this.admin = true;
    this.emit();
  }

  async logout() {
    if (this.mode === 'server') await api('/api/logout', { method: 'POST' }, this.token).catch(() => {});
    this.setToken(null);
    this.admin = false;
    this.emit();
  }

  async changePassword(current, password) {
    if (password.length < 6) throw new UserError('Use uma senha com pelo menos 6 caracteres.');
    if (this.mode === 'local') {
      await this.login(current);
      localStorage.setItem(LOCAL_AUTH, JSON.stringify(await hashPassword(password)));
    } else {
      await api('/api/password', { method: 'POST', body: JSON.stringify({ current, password }) }, this.token);
    }
  }

  async playerCode(id) {
    if (this.mode === 'local') return null;
    const r = await api(`/api/player-code?id=${encodeURIComponent(id)}`, {}, this.token);
    return r.code;
  }

  // Participante salva só o próprio avatar, autorizado pelo código pessoal (ou pela sessão do administrador).
  async saveAvatar(id, avatar, code) {
    if (this.mode === 'local') {
      this.admin = true;
      const wasAdmin = !!safe(() => sessionStorage.getItem(SESSION_TOKEN));
      this.update((t) => {
        const p = t.players.find((x) => x.id === id);
        if (p) p.avatar = avatar;
      });
      this.admin = wasAdmin;
      return;
    }
    const r = await api('/api/avatar', { method: 'POST', body: JSON.stringify({ id, code, avatar }) }, this.token);
    this.rev = r.rev;
    const p = this.doc.players.find((x) => x.id === id);
    if (p) p.avatar = avatar;
    this.emit();
  }
}

export const store = new Store();
