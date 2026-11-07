// Telas do Tutory Sports: conta, ranking, amistosos e aprovações do administrador.
import { html, useState, useEffect, useDoc, store, toast, handleError, confirmDialog, fmtDate } from './lib.js';
import * as E from '../core/engine.js';
import { sports, GENDER_LABEL, STATUS_LABEL, championshipImport } from '../core/sports.js';

// ---------------------------------------------------------------- estado e dados
export function useSports() {
  const [, force] = useState(0);
  useEffect(() => {
    const off = sports.subscribe((v) => force(v));
    sports.init().catch(handleError);
    return off;
  }, []);
  return sports;
}

// Carrega dados do banco e recarrega quando algo muda (aviso do Realtime chega como nova versão).
function useQuery(fn, deps) {
  const [state, set] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    let live = true;
    if (!sports.db) return undefined;
    set((s) => ({ ...s, loading: true }));
    fn(sports.db).then((data) => live && set({ data, error: null, loading: false }))
      .catch((error) => live && set({ data: null, error, loading: false }));
    return () => { live = false; };
  }, [sports.db, sports.version, ...deps]);
  return state;
}

const initials = (name = '?') => name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
export const PAva = ({ p, size = 40 }) => html`<span class="ava" style=${`width:${size}px;height:${size}px`} title=${p?.name || ''}>
  ${p?.thumb || p?.avatar?.thumb ? html`<img src=${p.thumb || p.avatar.thumb} alt="" />` : html`<span class="mono" style=${`font-size:${Math.round(size * 0.36)}px`}>${initials(p?.name)}</span>`}
</span>`;
const who = (p) => (p ? p.nick || p.name : 'Conta removida');

function Gate({ s, children, needApproval = false }) {
  if (!s.available) return html`<div class="glass card empty"><h3>Disponível no site online</h3><p class="muted">Contas, ranking e amistosos usam o banco do Supabase. Abra o endereço público do app.</p></div>`;
  if (!s.ready) return html`<div class="skeleton" style="height:220px;border-radius:20px"></div>`;
  if (!s.db) return html`<div class="glass card empty"><h3>Sem conexão com o banco</h3><p class="muted">Confira a internet e recarregue a página.</p></div>`;
  if (needApproval && !s.user) return html`<div class="glass card empty"><h3>Entre na sua conta</h3><p class="muted">Para lançar resultados, você precisa de uma conta aprovada.</p><a class="btn primary" href="#/conta">Entrar ou criar conta</a></div>`;
  if (needApproval && !s.approved) return html`<div class="glass card empty"><h3>Conta aguardando aprovação</h3><p class="muted">Assim que o administrador aprovar, você pode lançar amistosos e aparecer no ranking.</p><a class="btn" href="#/conta">Ver minha conta</a></div>`;
  return children;
}

const Seg = ({ items, value, onChange, label }) => html`<div class="seg" role="group" aria-label=${label}>
  ${items.map(([k, l]) => html`<button key=${k} type="button" class=${value === k ? 'on' : ''} aria-pressed=${value === k} onClick=${() => onChange(k)}>${l}</button>`)}
</div>`;

const ModalityChips = ({ list, value, onChange }) => html`<div class="mod-chips" role="group" aria-label="Modalidade">
  ${list.map((m) => html`<button key=${m.id} type="button" class=${'option ' + (value === m.id ? 'on' : '')} onClick=${() => onChange(m.id)}>${m.name}</button>`)}
</div>`;

// ---------------------------------------------------------------- conta
export function AccountPage() {
  const s = useSports();
  return html`<main class="page narrow">
    <div class="page-head"><div><span class="overline">Tutory Sports</span><h1>Minha <em>conta</em></h1>
      <p>Sua conta vale para todas as modalidades: ranking, amistosos e avatar.</p></div></div>
    <${Gate} s=${s}>${!s.user ? html`<${AuthForms} />` : !s.profile ? html`<${ProfileForm} first />` : html`<${AccountHome} s=${s} />`}<//>
  </main>`;
}

function AuthForms() {
  const [tab, setTab] = useState('in');
  const [f, setF] = useState({ email: '', password: '', name: '', nick: '', gender: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (tab === 'up') {
      if (f.name.trim().length < 2) return setErr('Informe seu nome.');
      if (!f.gender) return setErr('Escolha a categoria.');
    }
    if (f.password.length < 6) return setErr('A senha precisa ter pelo menos 6 caracteres.');
    setBusy(true);
    try {
      if (tab === 'in') await sports.signIn(f.email, f.password);
      else { await sports.signUp(f); toast('Conta criada. Agora é só aguardar a aprovação.', 'ok'); }
    } catch (x) { setErr(x.message || 'Não foi possível concluir.'); } finally { setBusy(false); }
  };
  return html`<form class="glass card form-card" onSubmit=${submit} novalidate>
    <${Seg} label="Entrar ou criar conta" items=${[['in', 'Entrar'], ['up', 'Criar conta']]} value=${tab} onChange=${(v) => { setTab(v); setErr(''); }} />
    ${tab === 'up' && html`
      <label class="field">Nome<input class="input" autocomplete="name" value=${f.name} onInput=${up('name')} maxlength="60" /></label>
      <label class="field">Apelido (opcional)<input class="input" value=${f.nick} onInput=${up('nick')} maxlength="30" /></label>
      <div class="field">Categoria<${Seg} label="Categoria" items=${[['m', 'Masculino'], ['f', 'Feminino']]} value=${f.gender} onChange=${(v) => setF({ ...f, gender: v })} /></div>`}
    <label class="field">E-mail<input class="input" type="email" autocomplete="email" value=${f.email} onInput=${up('email')} /></label>
    <label class="field">Senha<input class="input" type="password" autocomplete=${tab === 'in' ? 'current-password' : 'new-password'} value=${f.password} onInput=${up('password')} /></label>
    ${tab === 'up' && html`<p class="muted hint">Mínimo de 6 caracteres. Depois do cadastro, o administrador aprova sua conta.</p>`}
    ${err && html`<p class="form-error" role="alert">${err}</p>`}
    <button class="btn primary wide" disabled=${busy}>${busy ? 'Aguarde…' : tab === 'in' ? 'Entrar' : 'Criar conta'}</button>
  </form>`;
}

function ProfileForm({ first = false, done }) {
  const p = sports.profile || {};
  const [f, setF] = useState({ name: p.name || '', nick: p.nick || '', gender: p.gender || '', belt: p.belt || '' });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await sports.saveProfile(f); toast('Perfil salvo.', 'ok'); done?.(); } catch (x) { handleError(x); } finally { setBusy(false); }
  };
  return html`<form class="glass card form-card" onSubmit=${save} novalidate>
    ${first && html`<p class="notice">Falta completar seu perfil.</p>`}
    <label class="field">Nome<input class="input" value=${f.name} onInput=${(e) => setF({ ...f, name: e.target.value })} maxlength="60" /></label>
    <label class="field">Apelido (opcional)<input class="input" value=${f.nick} onInput=${(e) => setF({ ...f, nick: e.target.value })} maxlength="30" /></label>
    <div class="field">Categoria<${Seg} label="Categoria" items=${[['m', 'Masculino'], ['f', 'Feminino']]} value=${f.gender} onChange=${(v) => setF({ ...f, gender: v })} /></div>
    <label class="field">Faixa no jiu-jitsu (opcional)<select class="input" value=${f.belt} onChange=${(e) => setF({ ...f, belt: e.target.value })}>
      ${['', 'Branca', 'Cinza', 'Amarela', 'Laranja', 'Verde', 'Azul', 'Roxa', 'Marrom', 'Preta'].map((b) => html`<option value=${b}>${b || 'Não pratico'}</option>`)}
    </select></label>
    <div class="actions">${done && html`<button type="button" class="btn ghost" onClick=${done}>Cancelar</button>`}<button class="btn primary grow" disabled=${busy}>${busy ? 'Salvando…' : 'Salvar perfil'}</button></div>
  </form>`;
}

function AccountHome({ s }) {
  const [editing, setEditing] = useState(false);
  const [pw, setPw] = useState(null);
  const p = s.profile;
  const mine = useQuery((db) => db.results(null, 60), []);
  const people = useQuery((db) => db.profiles(), []);
  const byId = new Map((people.data || []).map((x) => [x.id, x]));
  const myResults = (mine.data || []).filter((r) => r.p1 === p.id || r.p2 === p.id);
  if (editing) return html`<${ProfileForm} done=${() => setEditing(false)} />`;
  return html`
    <section class="glass card acct">
      <${PAva} p=${p} size=${84} />
      <div class="acct-info">
        <h2>${p.name}</h2>
        ${p.nick && html`<p class="muted">"${p.nick}"</p>`}
        <div class="acct-chips">
          <span class=${'chip ' + (p.status === 'approved' ? 'done' : p.status === 'blocked' ? 'wo' : 'next')}>${STATUS_LABEL[p.status]}</span>
          <span class="chip plain">${GENDER_LABEL[p.gender]}</span>
          ${p.belt && html`<span class="chip plain">Faixa ${p.belt.toLowerCase()}</span>`}
        </div>
      </div>
      <div class="acct-actions">
        <a class="btn primary" href="#/meu-avatar">${p.avatar ? 'Editar meu avatar' : 'Montar meu avatar'}</a>
        <button class="btn" onClick=${() => setEditing(true)}>Editar perfil</button>
        <button class="btn" onClick=${() => setPw('')}>Trocar senha</button>
        <button class="btn ghost" onClick=${() => sports.signOut().catch(handleError)}>Sair</button>
      </div>
    </section>
    ${pw !== null && html`<form class="glass card form-card" onSubmit=${async (e) => { e.preventDefault(); if (pw.length < 6) { toast('Use pelo menos 6 caracteres.', 'error'); return; } try { await s.need().changePassword(pw); toast('Senha trocada.', 'ok'); setPw(null); } catch (x) { handleError(x); } }}>
      <label class="field">Nova senha<input class="input" type="password" autocomplete="new-password" value=${pw} onInput=${(e) => setPw(e.target.value)} /></label>
      <div class="actions"><button type="button" class="btn ghost" onClick=${() => setPw(null)}>Cancelar</button><button class="btn primary grow">Salvar senha</button></div>
    </form>`}
    ${p.status === 'pending' && html`<p class="notice">O administrador ainda vai aprovar sua conta. Enquanto isso, você já pode montar seu avatar.</p>`}
    <section class="glass card">
      <h3>Meus resultados</h3>
      <${ResultList} list=${myResults} byId=${byId} me=${p.id} empty="Nenhum resultado ainda. Lance um amistoso em Amistosos." />
    </section>`;
}

// ---------------------------------------------------------------- lista de resultados
const STATUS_CHIP = { pending: ['next', 'Aguardando'], approved: ['done', 'Aprovado'], rejected: ['wo', 'Recusado'] };
function ResultList({ list, byId, me, empty, mods, actions }) {
  if (!list.length) return html`<p class="muted">${empty}</p>`;
  return html`<ul class="res-list">${list.map((r) => {
    const a = byId.get(r.p1), b = byId.get(r.p2), w = r.winner === r.p1 ? 0 : 1;
    const [cls, label] = STATUS_CHIP[r.status];
    return html`<li key=${r.id} class="res-row">
      <span class=${'res-side ' + (w === 0 ? 'win' : '')}><${PAva} p=${a} size=${30} />${who(a)}</span>
      <span class="res-score mono">${r.score || (w === 0 ? 'V x D' : 'D x V')}</span>
      <span class=${'res-side right ' + (w === 1 ? 'win' : '')}>${who(b)}<${PAva} p=${b} size=${30} /></span>
      <span class="res-meta muted">${[mods?.get(r.modality)?.name, r.kind === 'campeonato' && 'campeonato', r.method, new Date(r.played_on + 'T12:00').toLocaleDateString('pt-BR')].filter(Boolean).join(' · ')}</span>
      ${me !== undefined && html`<span class=${'chip ' + cls}>${label}</span>`}
      ${actions?.(r)}
    </li>`;
  })}</ul>`;
}

// ---------------------------------------------------------------- ranking
export function RankingPage() {
  const s = useSports();
  const [mod, setMod] = useState('pingpong');
  const [gender, setGender] = useState('');
  const mods = useQuery((db) => db.modalities(), []);
  const rules = useQuery((db) => db.rules(), []);
  const rows = useQuery((db) => db.ranking(mod, gender), [mod, gender]);
  const recent = useQuery((db) => db.results(mod, 12), [mod]);
  const people = useQuery((db) => db.profiles(), []);
  const byId = new Map((people.data || []).map((x) => [x.id, x]));
  const list = rows.data || [];
  const r = rules.data;
  return html`<main class="page">
    <div class="page-head"><div><span class="overline">Tutory Sports</span><h1>Ranking <em>geral</em></h1>
      <p>${r ? `Vitória ${r.win} pts · derrota ${r.loss} pt${r.loss === 1 ? '' : 's'} por jogar · título ${r.champion} · vice ${r.vice}. Só contam resultados aprovados.` : 'Pontos por resultado. Só contam resultados aprovados.'}</p></div>
      <a class="btn primary" href="#/amistosos">Lançar amistoso</a></div>
    <${Gate} s=${s}>
      ${mods.data && html`<${ModalityChips} list=${mods.data} value=${mod} onChange=${setMod} />`}
      <${Seg} label="Categoria" items=${[['', 'Geral'], ['m', 'Masculino'], ['f', 'Feminino']]} value=${gender} onChange=${setGender} />
      ${rows.error && html`<p class="notice">${rows.error.message}</p>`}
      ${rows.loading && !rows.data && html`<div class="skeleton" style="height:200px;border-radius:20px"></div>`}
      ${rows.data && !list.length && html`<div class="glass card empty"><h3>Ninguém pontuou ainda</h3><p class="muted">Os pontos aparecem quando o administrador aprova o primeiro resultado desta modalidade.</p></div>`}
      ${list.length > 0 && html`
        <div class="podium">${list.slice(0, 3).map((x, i) => html`<div key=${x.id} class=${'podium-card glass p' + (i + 1)}>
          <span class="podium-pos">${i + 1}º</span><${PAva} p=${x} size=${i === 0 ? 92 : 72} />
          <strong>${who(x)}</strong><span class="podium-pts">${x.points} pts</span>
          <span class="muted">${x.wins}V · ${x.losses}D${x.titles ? ` · ${x.titles} título${x.titles > 1 ? 's' : ''}` : ''}</span></div>`)}</div>
        <div class="glass card rank-table" role="table" aria-label="Ranking">
          <div class="rank-row head" role="row"><span>#</span><span>Participante</span><span>Pts</span><span>V</span><span>D</span><span>Títulos</span></div>
          ${list.map((x, i) => html`<div key=${x.id} class="rank-row" role="row">
            <span class="mono">${i + 1}</span><span class="rank-who"><${PAva} p=${x} size=${32} />${x.name}${x.nick ? html` <em class="muted">"${x.nick}"</em>` : ''}</span>
            <span class="mono strong">${x.points}</span><span class="mono">${x.wins}</span><span class="mono">${x.losses}</span><span class="mono">${x.titles}${x.vices ? ` (+${x.vices} vice)` : ''}</span></div>`)}
        </div>`}
      <section class="glass card"><h3>Últimos resultados</h3>
        <${ResultList} list=${(recent.data || []).filter((x) => x.status === 'approved')} byId=${byId} empty="Nenhum resultado aprovado nesta modalidade." />
      </section>
    <//>
  </main>`;
}

// ---------------------------------------------------------------- amistosos
export function FriendliesPage() {
  const s = useSports();
  const mods = useQuery((db) => db.modalities(), []);
  const people = useQuery((db) => db.profiles(), []);
  const recent = useQuery((db) => db.results(null, 40), []);
  const [f, setF] = useState({ modality: 'pingpong', opponent: '', won: null, score: '', method: '', playedOn: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const me = s.profile?.id;
  const byId = new Map((people.data || []).map((x) => [x.id, x]));
  const modMap = new Map((mods.data || []).map((m) => [m.id, m]));
  const mod = modMap.get(f.modality);
  const others = (people.data || []).filter((x) => x.id !== me);
  const submit = async (e) => {
    e.preventDefault();
    if (!f.opponent) { toast('Escolha o adversário.', 'error'); return; }
    if (f.won === null) { toast('Diga se você venceu ou perdeu.', 'error'); return; }
    setBusy(true);
    try {
      await s.need().report(f);
      toast('Resultado enviado. Conta no ranking depois da aprovação do administrador.', 'ok');
      setF({ ...f, opponent: '', won: null, score: '', method: '' });
    } catch (x) { handleError(x); } finally { setBusy(false); }
  };
  const mine = (recent.data || []).filter((r) => me && (r.p1 === me || r.p2 === me) && r.status !== 'approved');
  return html`<main class="page">
    <div class="page-head"><div><span class="overline">Tutory Sports</span><h1>Amistosos</h1>
      <p>Jogou fora do campeonato? Lance aqui. O administrador confere e aprova antes de contar no ranking.</p></div></div>
    <${Gate} s=${s} needApproval>
      <div class="two-col">
        <form class="glass card form-card" onSubmit=${submit} novalidate>
          <h3>Novo resultado</h3>
          <label class="field">Modalidade<select class="input" value=${f.modality} onChange=${(e) => setF({ ...f, modality: e.target.value, method: '' })}>
            ${(mods.data || []).map((m) => html`<option value=${m.id}>${m.name}</option>`)}</select></label>
          <label class="field">Adversário<select class="input" value=${f.opponent} onChange=${(e) => setF({ ...f, opponent: e.target.value })}>
            <option value="">Escolha…</option>
            ${others.map((x) => html`<option value=${x.id}>${x.name}${x.nick ? ` (${x.nick})` : ''}</option>`)}</select></label>
          ${people.data && !others.length && html`<p class="muted hint">Ainda não há outra conta aprovada.</p>`}
          <div class="field">Resultado<${Seg} label="Resultado" items=${[['w', 'Eu venci'], ['l', 'Eu perdi']]} value=${f.won === null ? '' : f.won ? 'w' : 'l'} onChange=${(v) => setF({ ...f, won: v === 'w' })} /></div>
          <label class="field">Placar (opcional)<input class="input" value=${f.score} maxlength="40" placeholder=${mod?.score_hint || 'ex.: 2 x 1'} onInput=${(e) => setF({ ...f, score: e.target.value })} /></label>
          ${mod?.methods && html`<label class="field">Como terminou<select class="input" value=${f.method} onChange=${(e) => setF({ ...f, method: e.target.value })}>
            <option value="">Não informar</option>${mod.methods.map((m) => html`<option value=${m}>${m}</option>`)}</select></label>`}
          <label class="field">Data do jogo<input class="input" type="date" value=${f.playedOn} max=${new Date().toISOString().slice(0, 10)} onInput=${(e) => setF({ ...f, playedOn: e.target.value })} /></label>
          <button class="btn primary wide" disabled=${busy}>${busy ? 'Enviando…' : 'Enviar para aprovação'}</button>
        </form>
        <section class="glass card"><h3>Meus envios</h3>
          <${ResultList} list=${mine} byId=${byId} me=${me} mods=${modMap} empty="Nada aguardando aprovação."
            actions=${(r) => r.status === 'pending' && r.reported_by === me && html`<button class="btn sm ghost" onClick=${async () => { try { await s.need().cancel(r.id); toast('Resultado cancelado.', 'ok'); } catch (x) { handleError(x); } }}>Cancelar</button>`} />
          <h3 style="margin-top:22px">Aprovados recentemente</h3>
          <${ResultList} list=${(recent.data || []).filter((r) => r.status === 'approved').slice(0, 10)} byId=${byId} mods=${modMap} empty="Nenhum ainda." />
        </section>
      </div>
    <//>
  </main>`;
}

// ---------------------------------------------------------------- aprovações (administrador)
export function ApprovalsPage() {
  const s = useSports();
  const t = useDoc();
  const pend = useQuery((db) => (store.admin ? db.adminPending(store.token) : Promise.resolve(null)), [store.admin]);
  const mods = useQuery((db) => db.modalities(), []);
  const [filter, setFilter] = useState('pending');
  if (!store.admin) return html`<main class="page narrow"><div class="glass card empty"><h3>Área do administrador</h3><a class="btn primary" href="#/admin">Entrar</a></div></main>`;
  const data = pend.data || { profiles: [], results: [] };
  const byId = new Map(data.profiles.map((x) => [x.id, x]));
  const modMap = new Map((mods.data || []).map((m) => [m.id, m]));
  const run = async (fn, ok) => { try { await sports.admin(fn); if (ok) toast(ok, 'ok'); await sports.loadProfile(); } catch (x) { handleError(x); } };
  const profiles = data.profiles.filter((p) => filter === 'all' || p.status === filter);
  const waiting = data.profiles.filter((p) => p.status === 'pending').length;
  return html`<main class="page">
    <div class="page-head"><div><span class="overline">Painel</span><h1>Aprovações</h1>
      <p>Contas novas e resultados de amistosos esperam sua decisão. Nada conta no ranking antes disso.</p></div>
      <a class="btn" href="#/admin">Voltar ao painel</a></div>
    <${Gate} s=${s}>
      ${pend.error && html`<p class="notice">${pend.error.message}</p>`}
      <section class="glass card">
        <div class="card-head"><h3>Contas ${waiting ? html`<span class="chip next">${waiting} aguardando</span>` : ''}</h3>
          <${Seg} label="Filtro" items=${[['pending', 'Aguardando'], ['approved', 'Aprovadas'], ['blocked', 'Bloqueadas'], ['all', 'Todas']]} value=${filter} onChange=${setFilter} /></div>
        ${!profiles.length && html`<p class="muted">Nenhuma conta aqui.</p>`}
        <ul class="res-list">${profiles.map((p) => html`<li key=${p.id} class="acct-row">
          <span><strong>${p.name}</strong>${p.nick ? ` "${p.nick}"` : ''}<br /><span class="muted">${p.email} · ${GENDER_LABEL[p.gender]} · ${fmtDate(Date.parse(p.created_at))}</span></span>
          <span class="actions">
            ${p.status !== 'approved' && html`<button class="btn sm primary" onClick=${() => run((db, tk) => db.adminSetStatus(tk, p.id, 'approved'), 'Conta aprovada.')}>Aprovar</button>`}
            ${p.status !== 'blocked' && html`<button class="btn sm ghost" onClick=${async () => { if (await confirmDialog({ title: `Bloquear ${p.name}?`, body: 'A pessoa sai do ranking e não lança resultados. Dá para desfazer depois.', confirmLabel: 'Bloquear', danger: true })) run((db, tk) => db.adminSetStatus(tk, p.id, 'blocked'), 'Conta bloqueada.'); }}>Bloquear</button>`}
          </span></li>`)}</ul>
      </section>
      <section class="glass card">
        <h3>Resultados aguardando ${data.results.length ? html`<span class="chip next">${data.results.length}</span>` : ''}</h3>
        <${ResultList} list=${data.results} byId=${byId} mods=${modMap} empty="Nenhum resultado aguardando."
          actions=${(r) => html`<span class="actions">
            <button class="btn sm primary" onClick=${() => run((db, tk) => db.adminDecide(tk, r.id, true), 'Resultado aprovado.')}>Aprovar</button>
            <button class="btn sm ghost" onClick=${() => run((db, tk) => db.adminDecide(tk, r.id, false), 'Resultado recusado.')}>Recusar</button></span>`} />
      </section>
      <${ChampionshipLink} t=${t} accounts=${data.profiles.filter((p) => p.status === 'approved')} run=${run} />
    <//>
  </main>`;
}

// Liga os jogadores do campeonato às contas e leva os jogos ao ranking de Ping Pong.
function ChampionshipLink({ t, accounts, run }) {
  const key = 'pp-' + (t.bracket?.createdAt || 'sem-chave');
  const plan = championshipImport(t, { key, gameWins: E.gameWins, champion: E.champion(t), vice: E.viceChampion(t) });
  const linked = t.players.filter((p) => p.userId).length;
  const link = (pid, uid) => {
    try { store.update((d) => { const p = d.players.find((x) => x.id === pid); if (p) p.userId = uid || null; }); } catch (x) { handleError(x); }
  };
  const guess = (p) => accounts.find((a) => a.name.trim().toLowerCase() === p.name.trim().toLowerCase());
  return html`<section class="glass card">
    <h3>Campeonato de Ping Pong no ranking</h3>
    <p class="muted">Ligue cada jogador do campeonato à conta dele. Depois, envie os jogos encerrados: cada jogo entra uma vez só, mesmo que você envie de novo.</p>
    <p><span class="chip plain">${linked} de ${t.players.length} ligados</span> <span class="chip plain">${plan.items.length} jogos prontos</span>${plan.awards.length ? html` <span class="chip champion">${plan.awards.length} título(s)</span>` : ''}</p>
    ${!accounts.length && html`<p class="notice">Nenhuma conta aprovada ainda.</p>`}
    ${accounts.length > 0 && html`<div class="link-grid">${t.players.map((p) => html`<label key=${p.id} class="link-row"><span>${p.name}</span>
      <select class="input" value=${p.userId || ''} onChange=${(e) => link(p.id, e.target.value)}>
        <option value="">${guess(p) && !p.userId ? `Sugestão: ${guess(p).name}` : 'Sem conta'}</option>
        ${accounts.map((a) => html`<option value=${a.id}>${a.name}${a.nick ? ` (${a.nick})` : ''}</option>`)}
      </select></label>`)}</div>
      <div class="actions">
        <button class="btn" onClick=${() => t.players.forEach((p) => { const g = !p.userId && guess(p); if (g) link(p.id, g.id); })}>Ligar por nome igual</button>
        <button class="btn primary" disabled=${!plan.items.length && !plan.awards.length} onClick=${() => run(async (db, tk) => { const r = await db.adminImport(tk, plan.items, plan.awards); toast(`${r.results} jogo(s) e ${r.awards} título(s) no ranking.`, 'ok'); })}>Enviar ao ranking</button>
      </div>
      ${plan.skipped > 0 && html`<p class="muted hint">${plan.skipped} jogo(s) encerrado(s) ficam de fora porque algum jogador não tem conta ligada.</p>`}`}
  </section>`;
}
