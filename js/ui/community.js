// Comunidade (supabase/fase8.sql): comentários com uma camada de respostas, reações e denúncia nas partidas.
// Só contas aprovadas comentam e reagem; visitantes leem. O administrador modera em Aprovações.
import { html, useState, store, toast, handleError, confirmDialog, openDialog, fmtDate, Ava } from './lib.js';
import { sports } from '../core/sports.js';
import { useSports, useQuery } from './sports.js';

export const EMOJI = { aplauso: '👏', fogo: '🔥', trofeu: '🏆', risada: '😂', uau: '😮' };
const person = (id) => sports.people.get(id) || null;
const nameOf = (id) => { const p = person(id); return p ? p.nick || p.name : 'Conta removida'; };

async function run(fn, ok) {
  try { await fn(sports.need()); if (ok) toast(ok, 'ok'); return true; } catch (e) { handleError(e); return false; }
}

export function Reactions({ target }) {
  const s = useSports();
  const q = useQuery((db) => (db.reactions ? db.reactions(target) : Promise.resolve([])), [target]);
  if (q.error) return null;
  const list = q.data || [];
  const can = s.approved;
  return html`<div class="reactions" role="group" aria-label="Reações">
    ${Object.entries(EMOJI).map(([k, e]) => {
      const n = list.filter((r) => r.emoji === k).length;
      const mine = list.some((r) => r.emoji === k && r.user_id === s.user?.id);
      return html`<button key=${k} class=${'react' + (mine ? ' on' : '')} disabled=${!can} aria-pressed=${mine}
        title=${can ? '' : 'Entre com uma conta aprovada para reagir'} onClick=${() => run((db) => db.react(target, k))}>${e}${n > 0 && html`<b>${n}</b>`}</button>`;
    })}
  </div>`;
}

function ReportForm({ close }) {
  const [reason, setReason] = useState('');
  return html`<form class="modal glass" onSubmit=${(e) => { e.preventDefault(); close(reason || ''); }}>
    <h2>Denunciar comentário</h2>
    <p class="body">O administrador recebe a denúncia e decide. Quem escreveu não sabe quem denunciou.</p>
    <label class="field" style="margin-top:12px">Motivo (opcional)<input class="input" maxlength="200" value=${reason} onInput=${(e) => setReason(e.target.value)} placeholder="Ex.: ofensivo, spam" /></label>
    <div class="foot"><button type="button" class="btn ghost" onClick=${() => close(null)}>Cancelar</button><button class="btn primary">Enviar denúncia</button></div>
  </form>`;
}

function Comment({ c, replies, target, onReply }) {
  const s = sports;
  const mine = c.user_id === s.user?.id;
  const remove = async () => {
    if (await confirmDialog({ title: 'Apagar seu comentário?', body: replies?.length ? 'As respostas a ele também somem.' : 'Não dá para desfazer.', confirmLabel: 'Apagar', danger: true })) run((db) => db.commentDelete(c.id), 'Comentário apagado.');
  };
  const report = async () => {
    const reason = await openDialog((close) => html`<${ReportForm} close=${close} />`);
    if (reason !== null && reason !== undefined) run((db) => db.reportComment(c.id, reason), 'Denúncia enviada ao administrador.');
  };
  const p = person(c.user_id);
  return html`<li class=${'cmt' + (c.hidden ? ' hidden' : '')}>
    <div class="cmt-ava">${p ? html`<${Ava} player=${p} size=${34} />` : html`<span class="cmt-ghost"></span>`}</div>
    <div class="cmt-main">
      <div class="cmt-head"><b>${nameOf(c.user_id)}</b><time class="muted">${fmtDate(Date.parse(c.created_at))}</time>
        ${c.hidden && html`<span class="chip wo">Oculto pelo administrador</span>`}</div>
      <p class="cmt-body">${c.body}</p>
      <div class="cmt-actions">
        ${s.approved && !c.parent_id && html`<button class="link-btn" onClick=${() => onReply(c)}>Responder</button>`}
        ${mine && html`<button class="link-btn" onClick=${remove}>Apagar</button>`}
        ${s.approved && !mine && html`<button class="link-btn" onClick=${report}>Denunciar</button>`}
      </div>
      ${replies?.length > 0 && html`<ul class="cmt-replies">${replies.map((r) => html`<${Comment} key=${r.id} c=${r} target=${target} onReply=${onReply} />`)}</ul>`}
    </div>
  </li>`;
}

export function Comments({ target, title = 'Comentários' }) {
  const s = useSports();
  const q = useQuery((db) => (db.comments ? db.comments(target) : Promise.resolve([])), [target, s.user?.id]);
  const [text, setText] = useState('');
  const [reply, setReply] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!s.available) return null;
  const list = q.data || [];
  const roots = list.filter((c) => !c.parent_id);
  const repliesOf = (id) => list.filter((c) => c.parent_id === id);
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const ok = await run((db) => db.comment(target, text, reply?.id || null));
    setBusy(false);
    if (ok) { setText(''); setReply(null); }
  };
  const missing = q.error && /schema|relation|does not exist|recusou/i.test(q.error.message || '');
  return html`<section class="glass card comments">
    <div class="panel-head"><div><span class="overline">Comunidade</span><h2>${title}${roots.length ? html` <small class="muted">${list.length}</small>` : ''}</h2></div>
      <${Reactions} target=${target} /></div>
    ${missing && html`<p class="muted hint">Os comentários ainda não estão ativos no banco (falta rodar supabase/fase8.sql).</p>`}
    ${!missing && html`
      ${s.approved ? html`<form class="cmt-form" onSubmit=${send}>
          ${reply && html`<p class="muted hint">Respondendo a <b>${nameOf(reply.user_id)}</b> <button type="button" class="link-btn" onClick=${() => setReply(null)}>cancelar</button></p>`}
          <textarea class="input" rows="2" maxlength="500" placeholder=${reply ? 'Sua resposta' : 'Comente a partida'} value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
          <div class="cmt-send"><small class="muted">${text.length}/500</small><button class="btn sm primary" disabled=${!text.trim() || busy}>${reply ? 'Responder' : 'Comentar'}</button></div>
        </form>`
      : html`<p class="muted hint">${s.user ? 'Sua conta aguarda aprovação para comentar.' : html`<a href="#/conta">Entre na sua conta</a> para comentar e reagir.`}</p>`}
      ${roots.length === 0 && !q.loading && html`<p class="muted">Ninguém comentou ainda.</p>`}
      <ul class="cmt-list">${roots.map((c) => html`<${Comment} key=${c.id} c=${c} replies=${repliesOf(c.id)} target=${target} onReply=${(x) => setReply(x)} />`)}</ul>`}
  </section>`;
}

// Painel do administrador: denúncias pendentes e comentários ocultos.
export function Moderation() {
  const q = useQuery((db) => (store.admin && db.adminReports ? db.adminReports(store.token) : Promise.resolve([])), [store.admin]);
  if (q.error) return html`<section class="glass card"><h3>Comentários</h3><p class="muted">${/schema|does not exist|recusou/i.test(q.error.message || '') ? 'A moderação fica disponível depois de rodar supabase/fase8.sql.' : q.error.message}</p></section>`;
  const list = q.data || [];
  const act = (fn, ok) => run((db) => sports.admin((d, tk) => fn(d, tk)), ok);
  const where = (t) => (t.startsWith('match:') ? 'Partida ' + t.split(':').pop() : t);
  return html`<section class="glass card">
    <h3>Comentários denunciados ${list.filter((c) => c.reports > 0).length ? html`<span class="chip next">${list.filter((c) => c.reports > 0).length}</span>` : ''}</h3>
    ${list.length === 0 && html`<p class="muted">Nenhuma denúncia nem comentário oculto.</p>`}
    <ul class="res-list">${list.map((c) => html`<li key=${c.id} class="acct-row">
      <span><strong>${c.author}</strong> <span class="muted">· ${where(c.target)} · ${fmtDate(Date.parse(c.created_at))}</span>
        ${c.reports > 0 && html` <span class="chip next">${c.reports} denúncia${c.reports > 1 ? 's' : ''}</span>`}${c.hidden && html` <span class="chip wo">oculto</span>`}${c.muted && html` <span class="chip wo">silenciado</span>`}
        <br />"${c.body}"${c.reasons && html`<br /><small class="muted">Motivo: ${c.reasons}</small>`}</span>
      <span class="actions">
        ${c.hidden ? html`<button class="btn sm" onClick=${() => act((d, tk) => d.adminComment(tk, c.id, 'show'), 'Comentário visível de novo.')}>Mostrar</button>`
          : html`<button class="btn sm primary" onClick=${() => act((d, tk) => d.adminComment(tk, c.id, 'hide'), 'Comentário oculto.')}>Ocultar</button>`}
        ${c.reports > 0 && !c.hidden && html`<button class="btn sm ghost" onClick=${() => act((d, tk) => d.adminComment(tk, c.id, 'dismiss'), 'Denúncia descartada.')}>Manter</button>`}
        <button class="btn sm ghost" onClick=${async () => { if (await confirmDialog({ title: 'Apagar o comentário?', body: 'Some para todos, com as respostas. Não dá para desfazer.', confirmLabel: 'Apagar', danger: true })) act((d, tk) => d.adminComment(tk, c.id, 'delete'), 'Comentário apagado.'); }}>Apagar</button>
        <button class="btn sm ghost" onClick=${() => act((d, tk) => d.adminMute(tk, c.user_id, !c.muted), c.muted ? 'Comentários liberados.' : 'Pessoa silenciada: não comenta até você liberar.')}>${c.muted ? 'Liberar' : 'Silenciar'} ${c.author?.split(' ')[0]}</button>
      </span></li>`)}</ul>
  </section>`;
}
