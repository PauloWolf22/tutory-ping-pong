// Utilitários de interface compartilhados: estado global, avatares 2D, diálogos, toasts e hook de cena 3D.
import { html, render, useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from '../vendor/preact-htm.js';
import { store } from '../core/store.js';
import { UserError } from '../core/engine.js';
import { avatarFromName, normalizeAvatar, portrait, portraitReady, webglAvailable } from '../three/avatars.js';
import { sports } from '../core/sports.js';

export { html, render, useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback, store };

// ---------------------------------------------------------------- estado
export function useDoc() {
  const [, force] = useState(0);
  useEffect(() => {
    const a = store.subscribe((v) => force(v));
    const b = sports.subscribe(() => force((n) => n + 1e6));
    return () => { a(); b(); };
  }, []);
  return store.doc;
}

export function useRoute() {
  const read = () => (location.hash.replace(/^#\/?/, '') || '').split('?')[0].split('/').filter(Boolean);
  const [parts, set] = useState(read());
  useEffect(() => {
    const fn = (e) => {
      if (leaveGuard && !leaveGuard()) { history.replaceState(null, '', e.oldURL); return; }
      leaveGuard = null;
      set(read()); window.scrollTo(0, 0);
    };
    addEventListener('hashchange', fn);
    return () => removeEventListener('hashchange', fn);
  }, []);
  return parts;
}

export const go = (path) => { location.hash = '#/' + path; };

// Uma tela com alterações não salvas pode impedir a troca de rota (o editor de avatar usa).
let leaveGuard = null;
export const setLeaveGuard = (fn) => { leaveGuard = fn; };

// Executa uma alteração no campeonato com tratamento de erro para o usuário.
export function act(fn, okMessage) {
  try {
    const result = store.update(fn);
    if (okMessage) toast(okMessage, 'ok');
    return result;
  } catch (e) {
    handleError(e);
    return undefined;
  }
}

export function handleError(e) {
  if (e instanceof UserError) toast(e.message, 'error');
  else {
    console.error(e);
    toast('Algo deu errado. Tente novamente.', 'error');
  }
}
store.onError = handleError;

// ---------------------------------------------------------------- toast + diálogos
let overlaySetter = null;
let toastSetter = null;
let toastId = 0;

export function toast(message, type = '') {
  const id = ++toastId;
  toastSetter?.((list) => [...list, { id, message, type }]);
  setTimeout(() => toastSetter?.((list) => list.filter((t) => t.id !== id)), type === 'error' ? 5200 : 3200);
}

export function openDialog(render_) {
  return new Promise((resolve) => {
    overlaySetter?.({ render: render_, resolve: (v) => { overlaySetter?.(null); resolve(v); } });
  });
}

export function confirmDialog({ title, body, confirmLabel = 'Confirmar', danger = false, phrase = null }) {
  return openDialog((close) => html`<${ConfirmBody} ...${{ title, body, confirmLabel, danger, phrase, close }} />`);
}

function ConfirmBody({ title, body, confirmLabel, danger, phrase, close }) {
  const [typed, setTyped] = useState('');
  const blocked = phrase && typed.trim().toUpperCase() !== phrase;
  return html`<div class="modal glass" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t">
    <h2 id="dlg-t">${title}</h2>
    <div class="body">${body}</div>
    ${phrase && html`<label class="field" style="margin-top:16px">Digite ${phrase} para confirmar
      <input class="input" autofocus value=${typed} onInput=${(e) => setTyped(e.target.value)} /></label>`}
    <div class="foot">
      <button class="btn ghost" onClick=${() => close(false)}>Cancelar</button>
      <button class=${'btn ' + (danger ? 'danger' : 'primary')} disabled=${blocked} onClick=${() => close(true)}>${confirmLabel}</button>
    </div>
  </div>`;
}

export function Overlays() {
  const [dialog, setDialog] = useState(null);
  const [toasts, setToasts] = useState([]);
  overlaySetter = setDialog;
  toastSetter = setToasts;
  useEffect(() => {
    if (!dialog) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') dialog.resolve(false); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [dialog]);
  return html`
    ${dialog && html`<div class="overlay" onClick=${(e) => { if (e.target === e.currentTarget) dialog.resolve(false); }}>${dialog.render(dialog.resolve)}</div>`}
    <div class="toasts" role="status" aria-live="polite">${toasts.map((t) => html`<div key=${t.id} class=${'toast ' + t.type}>${t.message}</div>`)}</div>`;
}

// ---------------------------------------------------------------- avatares 2D
// Jogador ligado a uma conta usa o avatar da conta; senão, o salvo no campeonato; senão, o provisório pelo nome.
export const avatarOf = (player) => {
  const linked = player?.userId && sports.people.get(player.userId)?.avatar;
  if (linked?.v === 2) return normalizeAvatar(linked);
  return player?.avatar?.v === 2 ? normalizeAvatar(player.avatar) : avatarFromName(player?.name || '?');
};
const initials = (name = '?') => name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase();

export function Ava({ player, size = 48, kind = 'bust', state = '' }) {
  const res = size > 110 ? 512 : 192;
  const [url, setUrl] = useState(() => (player ? portraitReady(avatarOf(player), { kind, size: res }) : null));
  const config = player ? JSON.stringify(avatarOf(player)) : '';
  useEffect(() => {
    let live = true;
    if (!player || !webglAvailable()) { setUrl(null); return undefined; }
    portrait(avatarOf(player), { kind, size: res }).then((u) => { if (live) setUrl(u); }).catch(() => {});
    return () => { live = false; };
  }, [config, kind, res]);
  const style = `width:${size}px;height:${size}px`;
  if (!player) return html`<span class="ava tbd" style=${style}></span>`;
  return html`<span class=${'ava ' + state} style=${style} title=${player.name}>
    ${url ? html`<img src=${url} alt="" />` : html`<span class="mono" style=${`font-size:${Math.round(size * 0.36)}px`}>${initials(player.name)}</span>`}
  </span>`;
}

export const playerById = (t, id) => t.players.find((p) => p.id === id) || null;
export const displayName = (p) => p ? (p.nick || p.name) : '';
export const fmtDate = (ms) => (ms ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

// ---------------------------------------------------------------- cena 3D
// A cena nasce no layout effect para que os efeitos do componente já possam usá-la.
export function useStage(factory, deps = []) {
  const host = useRef(null);
  const stage = useRef(null);
  useLayoutEffect(() => {
    if (!host.current) return undefined;
    stage.current = factory(host.current);
    return () => {
      stage.current?.dispose();
      stage.current = null;
    };
  }, deps);
  return [host, stage];
}

export function download(filename, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function useMediaQuery(q) {
  const [m, set] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const fn = () => set(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [q]);
  return m;
}
