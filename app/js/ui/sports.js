// Telas do Tutory Sports: conta, ranking, amistosos e aprovações do administrador.
import { html, useState, useEffect, useDoc, store, toast, handleError, confirmDialog, openDialog, fmtDate } from './lib.js';
import * as E from '../core/engine.js';
import { sports, GENDER_LABEL, STATUS_LABEL, championshipImport, rulesFor, BELTS, POINT_FIELDS, CATEGORY_LABEL } from '../core/sports.js';

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
export function AccountPage({ mode }) {
  const s = useSports();
  const out = !s.user;
  return html`<main class="page narrow">
    <div class="page-head"><div><span class="overline">Tutory Sports</span><h1>${out ? html`Sua <em>conta</em>` : html`Minha <em>conta</em>`}</h1>
      <p>Uma conta para tudo: avatar, ranking, amistosos e campeonatos.</p></div></div>
    <${Gate} s=${s}>${out ? html`<${AuthForms} key=${mode || 'in'} initial=${mode === 'criar' ? 'up' : 'in'} />` : !s.profile ? html`<${ProfileForm} first />` : html`<${AccountHome} s=${s} />`}<//>
    ${out && html`<p class="admin-door"><a href="#/admin">${store.admin ? 'Ir para o painel do administrador' : 'Sou administrador'} →</a></p>`}
  </main>`;
}

function AuthForms({ initial = 'in' }) {
  const [tab, setTab] = useState(initial);
  const [f, setF] = useState({ email: '', password: '', name: '', nick: '', gender: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!validEmail(f.email)) return setErr('Informe um e-mail válido.');
    if (tab === 'up') {
      if (f.name.trim().length < 2) return setErr('Informe seu nome.');
      if (!f.gender) return setErr('Escolha a categoria.');
    }
    if (tab !== 'reset' && f.password.length < 6) return setErr('A senha precisa ter pelo menos 6 caracteres.');
    setBusy(true);
    try {
      if (tab === 'reset') { await sports.need().requestReset(f.email.trim().toLowerCase()); setSent(true); }
      else if (tab === 'in') { await sports.signIn(f.email, f.password); toast('Bem-vindo de volta.', 'ok'); }
      else { await sports.signUp(f); toast('Conta criada. Agora é só aguardar a aprovação.', 'ok'); }
    } catch (x) { setErr(x.message || 'Não foi possível concluir.'); } finally { setBusy(false); }
  };
  const go2 = (v) => { setTab(v); setErr(''); setSent(false); };
  return html`<div class="auth">
    ${tab !== 'reset' && html`<div class="auth-choice" role="group" aria-label="Criar conta ou entrar">
      <button type="button" class=${'auth-btn ' + (tab === 'up' ? 'on' : '')} aria-pressed=${tab === 'up'} onClick=${() => go2('up')}><strong>Criar conta</strong><span>Primeira vez aqui</span></button>
      <button type="button" class=${'auth-btn ' + (tab === 'in' ? 'on' : '')} aria-pressed=${tab === 'in'} onClick=${() => go2('in')}><strong>Entrar</strong><span>Já tenho conta</span></button>
    </div>`}
    <form class="glass card form-card" onSubmit=${submit} novalidate>
      ${tab === 'reset' && html`<h3>Esqueci a senha</h3><p class="muted">Informe o e-mail da conta. O administrador recebe o pedido e te entrega uma senha provisória; depois você troca em Minha conta.</p>`}
      ${tab === 'up' && html`
        <label class="field">Nome<input class="input" autocomplete="name" value=${f.name} onInput=${up('name')} maxlength="60" /></label>
        <label class="field">Apelido (opcional)<input class="input" value=${f.nick} onInput=${up('nick')} maxlength="30" /></label>
        <div class="field">Categoria<${Seg} label="Categoria" items=${[['m', 'Masculino'], ['f', 'Feminino']]} value=${f.gender} onChange=${(v) => setF({ ...f, gender: v })} /></div>`}
      <label class="field">E-mail<input class="input" type="email" inputmode="email" autocomplete="email" value=${f.email} onInput=${up('email')} /></label>
      ${tab !== 'reset' && html`<label class="field">Senha<input class="input" type="password" autocomplete=${tab === 'in' ? 'current-password' : 'new-password'} value=${f.password} onInput=${up('password')} /></label>`}
      ${tab === 'up' && html`<p class="muted hint">Senha com no mínimo 6 caracteres. Depois do cadastro, o administrador aprova sua conta.</p>`}
      ${err && html`<p class="form-error" role="alert">${err}</p>`}
      ${sent && html`<p class="notice" role="status">Pedido registrado. Avise o administrador para gerar sua senha provisória.</p>`}
      <button class="btn primary wide" disabled=${busy}>${busy ? 'Aguarde…' : { in: 'Entrar', up: 'Criar conta', reset: 'Pedir nova senha' }[tab]}</button>
      ${tab === 'in' && html`<button type="button" class="linklike" onClick=${() => go2('reset')}>Esqueci a senha</button>`}
      ${tab === 'reset' && html`<button type="button" class="linklike" onClick=${() => go2('in')}>Voltar para Entrar</button>`}
    </form>
  </div>`;
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
      ${['', ...BELTS].map((b) => html`<option value=${b}>${b || 'Não pratico'}</option>`)}
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
          ${p.belt && html`<span class="chip plain" title=${p.belt_verified ? 'Faixa validada pelo administrador' : 'O administrador ainda vai validar a faixa'}>Faixa ${p.belt.toLowerCase()}${p.belt_verified ? ' ✓' : ' · aguardando validação'}</span>`}
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
      <span class="res-meta muted">${[mods?.get(r.modality)?.name, r.kind === 'campeonato' && 'campeonato', r.category && CATEGORY_LABEL[r.category], r.method, new Date(r.played_on + 'T12:00').toLocaleDateString('pt-BR')].filter(Boolean).join(' · ')}</span>
      ${r.team1 && html`<span class="res-meta muted">Equipes: ${r.team1.map((id) => who(byId.get(id))).join(', ')} x ${(r.team2 || []).map((id) => who(byId.get(id))).join(', ')}</span>`}
      ${me !== undefined && html`<span class=${'chip ' + cls}>${label}</span>`}
      ${actions?.(r)}
    </li>`;
  })}</ul>`;
}

// ---------------------------------------------------------------- ranking
// Abas: Geral (consolidado), uma por modalidade e TUTORY Gaming (jogos individuais somados por nota).
// Geral e Gaming usam nota normalizada (líder de cada modalidade = 100 × peso): unidades diferentes não se somam direto.
const GENERAL = [['geral', 'Geral', null], ['gaming', 'TUTORY Gaming', 'gaming']];
const placeLine = (x) => [x.titles && `${x.titles} título${x.titles > 1 ? 's' : ''}`, x.vices && `${x.vices} vice`, x.thirds && `${x.thirds} 3º`].filter(Boolean).join(' · ');

function rulesLine(r) {
  if (!r) return 'Só contam resultados aprovados pelo administrador.';
  const parts = [`vitória ${r.win}`, `derrota ${r.loss}`, `amistoso ${r.friendly_win}/${r.friendly_loss}`, r.participation && `participação ${r.participation}`, `campeão ${r.champion}`, `vice ${r.vice}`, `3º ${r.third}`, r.achievement && `conquista ${r.achievement}`];
  return `Pontos: ${parts.filter(Boolean).join(' · ')}. Só contam resultados aprovados.`;
}

export function RankingPage() {
  const s = useSports();
  const [tab, setTab] = useState('pingpong');
  const [gender, setGender] = useState('');
  const [belt, setBelt] = useState('');
  const mods = useQuery((db) => db.modalities(), []);
  const points = useQuery((db) => db.points(), []);
  const people = useQuery((db) => db.profiles(), []);
  const general = GENERAL.find((g) => g[0] === tab);
  const isJJ = tab === 'jiujitsu';
  const rows = useQuery((db) => (general ? db.rankingGeneral(general[2], gender) : db.ranking(tab, gender, isJJ ? belt : '')), [tab, gender, belt]);
  const recent = useQuery((db) => (general ? Promise.resolve([]) : db.results(tab, 12)), [tab]);
  const byId = new Map((people.data || []).map((x) => [x.id, x]));
  const modList = mods.data || [];
  const mod = modList.find((m) => m.id === tab);
  // enquanto a aba nova carrega, os dados da aba anterior têm outro formato: não mistura
  const list = (rows.data || []).filter((x) => (general ? !!x.parts : !x.parts));
  const title = general ? general[1] : mod?.name || 'Ranking';
  const genderLabel = gender === 'm' ? 'masculino' : gender === 'f' ? 'feminino' : '';
  return html`<main class="page">
    <div class="page-head"><div><span class="overline">Tutory Sports · Ranking${genderLabel ? ' ' + genderLabel : ''}</span><h1>${title}</h1>
      <p>${general ? `Nota de 0 a 100 em cada modalidade (o líder tem 100), multiplicada pelo peso da modalidade. ${tab === 'gaming' ? 'Soma os jogos individuais da TUTORY Gaming.' : 'Soma todas as modalidades. Futebol não tem ranking individual.'}` : rulesLine(rulesFor(points.data, tab))}</p></div>
      <a class="btn primary" href="#/amistosos">Lançar amistoso</a></div>
    <${Gate} s=${s}>
      <div class="rank-tabs" role="tablist" aria-label="Ranking">
        ${[...GENERAL.slice(0, 1), ...modList.map((m) => [m.id, m.name]), GENERAL[1]].map(([k, l]) => html`<button key=${k} role="tab" aria-selected=${tab === k} class=${'option ' + (tab === k ? 'on' : '')} onClick=${() => { setTab(k); setBelt(''); }}>${l}</button>`)}
      </div>
      <div class="rank-filters">
        <${Seg} label="Categoria" items=${[['', 'Todos'], ['m', 'Masculino'], ['f', 'Feminino']]} value=${gender} onChange=${setGender} />
        ${isJJ && html`<label class="rank-belt">Faixa <select class="input" value=${belt} onChange=${(e) => setBelt(e.target.value)}>
          <option value="">Todas</option>${BELTS.map((b) => html`<option value=${b}>${b}</option>`)}</select></label>`}
      </div>
      ${isJJ && belt && html`<p class="muted hint">Só aparecem faixas validadas pelo administrador.</p>`}
      ${rows.error && html`<p class="notice">${rows.error.message}</p>`}
      ${rows.loading && !rows.data && html`<div class="skeleton" style="height:200px;border-radius:20px"></div>`}
      ${rows.data && !list.length && html`<div class="glass card empty"><h3>Ninguém pontuou ainda</h3><p class="muted">${general ? 'O ranking consolidado aparece quando houver resultados aprovados.' : 'Os pontos aparecem quando o administrador aprova o primeiro resultado desta modalidade.'}</p></div>`}
      ${list.length > 0 && html`
        <div class="podium">${list.slice(0, 3).map((x, i) => html`<div key=${x.id} class=${'podium-card glass p' + (i + 1)}>
          <span class="podium-pos">${i + 1}º</span><${PAva} p=${x} size=${i === 0 ? 92 : 72} />
          <strong>${who(x)}</strong><span class="podium-pts">${general ? `${x.score}` : `${x.points} pts`}</span>
          <span class="muted">${general ? `${x.modalities} modalidade${x.modalities > 1 ? 's' : ''}` : `${x.wins}V · ${x.losses}D${placeLine(x) ? ' · ' + placeLine(x) : ''}`}</span></div>`)}</div>
        ${general ? html`<div class="glass card rank-table" role="table" aria-label="Ranking consolidado">
          <div class="rank-row gen head" role="row"><span>#</span><span>Participante</span><span>Nota</span><span>Modalidades</span></div>
          ${list.map((x, i) => html`<div key=${x.id} class="rank-row gen" role="row">
            <span class="mono">${i + 1}</span><span class="rank-who"><${PAva} p=${x} size=${32} />${x.name}</span>
            <span class="mono strong">${x.score}</span>
            <span class="rank-parts">${x.parts.map((p) => html`<span key=${p.modality} class="chip plain" title=${`${p.points} pts · nota ${p.norm}`}>${p.modality_name} ${p.score}</span>`)}</span></div>`)}
        </div>` : html`<div class="glass card rank-table" role="table" aria-label="Ranking">
          <div class="rank-row head" role="row"><span>#</span><span>Participante</span><span>Pts</span><span>V</span><span>D</span><span>Pódios</span></div>
          ${list.map((x, i) => html`<div key=${x.id} class="rank-row" role="row">
            <span class="mono">${i + 1}</span><span class="rank-who"><${PAva} p=${x} size=${32} />${x.name}${x.nick ? html` <em class="muted">"${x.nick}"</em>` : ''}${isJJ && x.belt && x.belt_verified ? html` <span class="chip plain belt">${x.belt}</span>` : ''}</span>
            <span class="mono strong">${x.points}</span><span class="mono" title=${`${x.cwins} em campeonato, ${x.fwins} em amistoso`}>${x.wins}</span><span class="mono" title=${`${x.closses} em campeonato, ${x.flosses} em amistoso`}>${x.losses}</span><span class="mono">${placeLine(x) || (x.achievements ? `${x.achievements} conquista${x.achievements > 1 ? 's' : ''}` : '—')}</span></div>`)}
        </div>`}`}
      ${!general && html`<section class="glass card"><h3>Últimos resultados</h3>
        <${ResultList} list=${(recent.data || []).filter((x) => x.status === 'approved')} byId=${byId} empty="Nenhum resultado aprovado nesta modalidade." />
      </section>`}
    <//>
  </main>`;
}

// ---------------------------------------------------------------- amistosos
// Até 4 colegas por lado (5 com quem lança ou com o capitão).
function TeamPick({ label, people, value, onChange }) {
  const toggle = (id) => {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else if (value.length >= 4) toast('Cada equipe tem no máximo 5 pessoas.', 'error');
    else onChange([...value, id]);
  };
  return html`<fieldset class="field team-pick"><legend>${label} <span class="muted">${value.length}/4</span></legend>
    <div class="team-chips">${people.map((x) => html`<button type="button" key=${x.id} class=${'option ' + (value.includes(x.id) ? 'on' : '')} aria-pressed=${value.includes(x.id)} onClick=${() => toggle(x.id)}>${who(x)}</button>`)}</div>
  </fieldset>`;
}

export function FriendliesPage() {
  const s = useSports();
  const mods = useQuery((db) => db.modalities(), []);
  const people = useQuery((db) => db.profiles(), []);
  const recent = useQuery((db) => db.results(null, 40), []);
  const [f, setF] = useState({ modality: 'pingpong', opponent: '', won: null, score: '', method: '', team: [], opponents: [], playedOn: new Date().toISOString().slice(0, 10) });
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
      setF({ ...f, opponent: '', won: null, score: '', method: '', team: [], opponents: [] });
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
          <label class="field">Modalidade<select class="input" value=${f.modality} onChange=${(e) => setF({ ...f, modality: e.target.value, method: '', team: [], opponents: [] })}>
            ${(mods.data || []).map((m) => html`<option value=${m.id}>${m.name}</option>`)}</select></label>
          ${mod?.kind === 'equipe' && html`<p class="notice">Partida por equipe: escolha o capitão adversário e marque quem jogou em cada lado. Cada integrante ganha ou perde a partida no ranking.</p>`}
          <label class="field">${mod?.kind === 'equipe' ? 'Capitão adversário' : 'Adversário'}<select class="input" value=${f.opponent} onChange=${(e) => setF({ ...f, opponent: e.target.value, team: f.team.filter((x) => x !== e.target.value), opponents: f.opponents.filter((x) => x !== e.target.value) })}>
            <option value="">Escolha…</option>
            ${others.map((x) => html`<option value=${x.id}>${x.name}${x.nick ? ` (${x.nick})` : ''}</option>`)}</select></label>
          ${people.data && !others.length && html`<p class="muted hint">Ainda não há outra conta aprovada.</p>`}
          ${mod?.kind === 'equipe' && f.opponent && html`
            <${TeamPick} label="Minha equipe (além de mim)" people=${others.filter((x) => x.id !== f.opponent && !f.opponents.includes(x.id))} value=${f.team} onChange=${(team) => setF({ ...f, team })} />
            <${TeamPick} label="Equipe adversária (além do capitão)" people=${others.filter((x) => x.id !== f.opponent && !f.team.includes(x.id))} value=${f.opponents} onChange=${(opponents) => setF({ ...f, opponents })} />`}
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
  const profiles = data.profiles.filter((p) => filter === 'all' || p.status === filter || (filter === 'pending' && p.reset) || (filter === 'belt' && p.belt && !p.belt_verified));
  const belts = data.profiles.filter((p) => p.belt && !p.belt_verified).length;
  const waiting = data.profiles.filter((p) => p.status === 'pending').length;
  const resets = data.profiles.filter((p) => p.reset).length;
  const resetPw = async (p) => {
    if (!await confirmDialog({ title: `Gerar senha provisória para ${p.name}?`, body: 'A senha atual dessa conta deixa de funcionar. Entregue a nova pessoalmente.', confirmLabel: 'Gerar senha' })) return;
    run(async (db, tk) => {
      const r = await db.adminResetPassword(tk, p.id);
      await openDialog((close) => html`<div class="modal glass" role="dialog" aria-modal="true"><h2>Senha provisória</h2>
        <div class="body"><p>Entregue para <strong>${p.name}</strong> (${r.email}):</p><p class="temp-pw mono">${r.password}</p>
        <p class="muted">Ela entra com essa senha e troca em Minha conta. Esta senha não aparece de novo.</p></div>
        <div class="foot"><button class="btn primary" onClick=${() => close(true)}>Pronto</button></div></div>`);
    });
  };
  return html`<main class="page">
    <div class="page-head"><div><span class="overline">Painel</span><h1>Aprovações</h1>
      <p>Contas novas e resultados de amistosos esperam sua decisão. Nada conta no ranking antes disso.</p></div>
      <div class="actions"><a class="btn" href="#/pontuacao">Pontuação e modalidades</a><a class="btn ghost" href="#/admin">Voltar ao painel</a></div></div>
    <${Gate} s=${s}>
      ${pend.error && html`<p class="notice">${pend.error.message}</p>`}
      <section class="glass card">
        <div class="card-head"><h3>Contas ${waiting ? html`<span class="chip next">${waiting} aguardando</span>` : ''} ${resets ? html`<span class="chip wo">${resets} pediu nova senha</span>` : ''}</h3>
          <${Seg} label="Filtro" items=${[['pending', 'Aguardando'], ['belt', `Faixas${belts ? ` (${belts})` : ''}`], ['approved', 'Aprovadas'], ['blocked', 'Bloqueadas'], ['all', 'Todas']]} value=${filter} onChange=${setFilter} /></div>
        ${!profiles.length && html`<p class="muted">Nenhuma conta aqui.</p>`}
        <ul class="res-list">${profiles.map((p) => html`<li key=${p.id} class="acct-row">
          <span><strong>${p.name}</strong>${p.nick ? ` "${p.nick}"` : ''}${p.reset ? html` <span class="chip wo">pediu nova senha</span>` : ''}<br /><span class="muted">${p.email} · ${GENDER_LABEL[p.gender]} · ${fmtDate(Date.parse(p.created_at))}</span>
            ${p.belt && html`<br /><span class=${'chip ' + (p.belt_verified ? 'done' : 'next')}>Faixa ${p.belt}${p.belt_verified ? ' validada' : ' a validar'}</span>`}</span>
          <span class="actions">
            <button class="btn sm ghost" onClick=${async () => { const r = await openDialog((close) => html`<${BeltDialog} p=${p} close=${close} />`); if (r) run((db, tk) => db.adminSetBelt(tk, p.id, r.belt, r.ok), 'Faixa salva.'); }}>${p.belt && !p.belt_verified ? 'Validar faixa' : 'Faixa'}</button>
            ${p.status !== 'approved' && html`<button class="btn sm primary" onClick=${() => run((db, tk) => db.adminSetStatus(tk, p.id, 'approved'), 'Conta aprovada.')}>Aprovar</button>`}
            <button class="btn sm" onClick=${() => resetPw(p)}>Senha provisória</button>
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
      <${ChampionshipLink} t=${t} mods=${mods.data || []} accounts=${data.profiles.filter((p) => p.status === 'approved')} run=${run} />
    <//>
  </main>`;
}

// Liga os jogadores do campeonato às contas e leva jogos, colocações e participação ao ranking da modalidade.
function ChampionshipLink({ t, accounts, mods, run }) {
  const [modality, setModality] = useState(t.event.modality || 'pingpong');
  // a categoria vem do próprio campeonato (masculino, feminino ou misto): não há como enviar na categoria errada
  const category = t.cat;
  const cats = Object.keys(t.comps);
  const key = (modality === 'pingpong' ? 'pp-' : modality + '-') + category + '-' + (t.bracket?.createdAt || 'sem-chave');
  const plan = championshipImport(t, { modality, key, gameWins: E.gameWins, champion: E.champion(t), vice: E.viceChampion(t), category });
  const fits = (a) => category === 'misto' || a.gender === category;
  const linked = t.players.filter((p) => p.userId).length;
  const places = plan.awards.filter((a) => a.place !== 'participacao').length;
  const link = (pid, uid) => {
    try { store.update((d) => { const p = d.players.find((x) => x.id === pid); if (p) p.userId = uid || null; }); } catch (x) { handleError(x); }
  };
  const guess = (p) => accounts.find((a) => fits(a) && a.name.trim().toLowerCase() === p.name.trim().toLowerCase());
  return html`<section class="glass card">
    <h3>Campeonato no ranking</h3>
    <p class="muted">Ligue cada jogador do campeonato à conta dele e envie. Entram os jogos encerrados, campeão, vice e a participação de quem jogou. Cada item entra uma vez só, mesmo que você envie de novo.</p>
    <div class="champ-opts">
      <label class="field">Modalidade<select class="input" value=${modality} onChange=${(e) => setModality(e.target.value)}>${mods.map((m) => html`<option value=${m.id}>${m.name}</option>`)}</select></label>
      <div class="field">Categoria${cats.length > 1
        ? html`<${Seg} label="Categoria do campeonato" items=${cats.map((c) => [c, CATEGORY_LABEL[c]])} value=${category} onChange=${(c) => store.setCat(c)} />`
        : html`<span class=${'cat-tag ' + category}>${CATEGORY_LABEL[category].toUpperCase()}</span>`}</div>
    </div>
    <p><span class="chip plain">${linked} de ${t.players.length} ligados</span> <span class="chip plain">${plan.items.length} jogos prontos</span>${places ? html` <span class="chip champion">${places} colocação(ões)</span>` : ''}</p>
    ${!accounts.length && html`<p class="notice">Nenhuma conta aprovada ainda.</p>`}
    ${accounts.length > 0 && html`<div class="link-grid">${t.players.map((p) => html`<label key=${p.id} class="link-row"><span>${p.name}</span>
      <select class="input" value=${p.userId || ''} onChange=${(e) => link(p.id, e.target.value)}>
        <option value="">${guess(p) && !p.userId ? `Sugestão: ${guess(p).name}` : 'Sem conta'}</option>
        ${accounts.filter((a) => fits(a) || a.id === p.userId).map((a) => html`<option value=${a.id}>${a.name}${a.nick ? ` (${a.nick})` : ''}</option>`)}
      </select></label>`)}</div>
      <div class="actions">
        <button class="btn" onClick=${() => t.players.forEach((p) => { const g = !p.userId && guess(p); if (g) link(p.id, g.id); })}>Ligar por nome igual</button>
        <button class="btn primary" disabled=${!plan.items.length && !plan.awards.length} onClick=${() => run(async (db, tk) => { const r = await db.adminImport(tk, plan.items, plan.awards); toast(r.results || r.awards ? `${r.results} jogo(s) e ${r.awards} colocação(ões)/participação(ões) novos ou atualizados.` : 'Nada novo: tudo já estava no ranking.', 'ok'); })}>Enviar ao ranking</button>
      </div>
      ${plan.skipped > 0 && html`<p class="muted hint">${plan.skipped} jogo(s) encerrado(s) ficam de fora porque algum jogador não tem conta ligada.</p>`}`}
  </section>`;
}

// ---------------------------------------------------------------- faixa (administrador)
function BeltDialog({ p, close }) {
  const [belt, setBelt] = useState(p.belt || '');
  const [ok, setOk] = useState(p.belt_verified || !!p.belt);
  return html`<form class="modal glass" onSubmit=${(e) => { e.preventDefault(); close({ belt, ok }); }}>
    <h2>Faixa de ${p.name}</h2>
    <p class="muted">${p.belt ? `Informada pela pessoa: ${p.belt}.` : 'A pessoa não informou faixa.'} Só faixa validada entra no ranking por faixa.</p>
    <label class="field">Faixa<select class="input" value=${belt} onChange=${(e) => setBelt(e.target.value)}>${['', ...BELTS].map((b) => html`<option value=${b}>${b || 'Sem faixa'}</option>`)}</select></label>
    <label class="check"><input type="checkbox" checked=${ok && !!belt} disabled=${!belt} onChange=${(e) => setOk(e.target.checked)} /> Graduação conferida e validada</label>
    <div class="foot"><button type="button" class="btn ghost" onClick=${() => close(false)}>Cancelar</button><button class="btn primary">Salvar</button></div>
  </form>`;
}

// ---------------------------------------------------------------- pontuação, modalidades, conquistas e auditoria (administrador)
const TBL_LABEL = { results: 'Resultado', awards: 'Colocação/conquista', ranking_points: 'Pontuação', modalities: 'Modalidade', profiles: 'Conta' };
const OP_LABEL = { insert: 'criou', update: 'alterou', delete: 'apagou' };

function auditLine(a, names, mods) {
  const x = a.after || a.before || {};
  if (a.tbl === 'results') {
    const st = a.op === 'update' && a.before?.status !== a.after?.status ? ` (${a.before?.status} → ${a.after?.status})` : '';
    return `${mods.get(x.modality)?.name || x.modality}: ${names.get(x.p1) || '?'} x ${names.get(x.p2) || '?'}${x.score ? ' ' + x.score : ''}${st}`;
  }
  if (a.tbl === 'awards') return `${names.get(x.user_id) || '?'} · ${x.place} · ${x.label || ''}`;
  if (a.tbl === 'ranking_points') return `Pontuação ${x.modality === '*' ? 'padrão' : mods.get(x.modality)?.name || x.modality}`;
  if (a.tbl === 'modalities') return `${x.name || x.id}${a.after && a.after.active === false ? ' (desativada)' : ''}`;
  if (a.tbl === 'profiles') {
    const ch = [];
    if (a.before?.status !== a.after?.status) ch.push(`status ${a.before?.status || '—'} → ${a.after?.status}`);
    if (a.before?.belt !== a.after?.belt || a.before?.belt_verified !== a.after?.belt_verified) ch.push(`faixa ${a.after?.belt || 'nenhuma'}${a.after?.belt_verified ? ' validada' : ''}`);
    return `${x.name}${ch.length ? ': ' + ch.join(', ') : ''}`;
  }
  return '';
}

function PointsRow({ m, rules, own, run }) {
  const [edit, setEdit] = useState(null);
  const r = edit || rules;
  const save = () => run((db, tk) => db.adminSetPoints(tk, m.id, Object.fromEntries([...POINT_FIELDS.map(([k]) => [k, Number(r[k])]), ['weight', Number(String(r.weight).replace(',', '.'))]])), 'Pontuação salva.').then((ok) => ok && setEdit(null));
  return html`<tr class=${own || m.id === '*' ? 'own' : ''}>
    <th scope="row">${m.name}${m.id !== '*' && !own ? html`<br /><small class="muted">usa a padrão</small>` : ''}</th>
    ${[...POINT_FIELDS.map(([k]) => k), 'weight'].map((k) => html`<td key=${k}><input class="input pts-in" inputmode="decimal" aria-label=${`${m.name}: ${k}`} value=${r[k]} onInput=${(e) => setEdit({ ...r, [k]: e.target.value })} /></td>`)}
    <td class="pts-act">${edit ? html`<button class="btn sm primary" onClick=${save}>Salvar</button><button class="btn sm ghost" onClick=${() => setEdit(null)}>Cancelar</button>`
      : own && m.id !== '*' ? html`<button class="btn sm ghost" onClick=${async () => { if (await confirmDialog({ title: `Voltar ${m.name} para a pontuação padrão?`, body: 'O ranking desta modalidade é recalculado com a pontuação padrão.', confirmLabel: 'Usar padrão' })) run((db, tk) => db.adminSetPoints(tk, m.id, null), 'Pontuação padrão aplicada.'); }}>Usar padrão</button>` : null}</td>
  </tr>`;
}

export function PointsPage() {
  const s = useSports();
  const admin = store.admin;
  const mods = useQuery((db) => db.modalitiesAll(), []);
  const points = useQuery((db) => db.points(), []);
  const people = useQuery((db) => db.profiles(), []);
  const audit = useQuery((db) => (admin ? db.adminAudit(store.token, 150) : Promise.resolve([])), [admin]);
  const [award, setAward] = useState({ user: '', modality: 'pingpong', label: '' });
  const [nm, setNm] = useState({ id: '', name: '', family: 'esporte', kind: 'individual', score_hint: '' });
  const [awards, setAwards] = useState(null);
  if (!admin) return html`<main class="page narrow"><div class="glass card empty"><h3>Área do administrador</h3><a class="btn primary" href="#/admin">Entrar</a></div></main>`;
  const run = async (fn, ok) => { try { await sports.admin(fn); if (ok) toast(ok, 'ok'); sports.emit(); return true; } catch (x) { handleError(x); return false; } };
  const modList = mods.data || [];
  const modMap = new Map(modList.map((m) => [m.id, m]));
  const names = new Map((people.data || []).map((p) => [p.id, p.name]));
  const pts = points.data || [];
  const loadAwards = async (modality) => { try { setAwards((await sports.need().awards(modality)).filter((a) => a.place === 'conquista')); } catch (x) { handleError(x); } };
  return html`<main class="page">
    <div class="page-head"><div><span class="overline">Painel</span><h1>Pontuação e <em>modalidades</em></h1>
      <p>Defina quanto vale cada resultado em cada modalidade. O ranking é recalculado na hora, sem duplicar nada. Peso: quanto a modalidade conta no ranking geral (0 a 10).</p></div>
      <a class="btn" href="#/aprovacoes">Aprovações</a></div>
    <${Gate} s=${s}>
      ${(points.error || mods.error) && html`<p class="notice">${(points.error || mods.error).message}</p>`}
      <section class="glass card">
        <h3>Pontos por modalidade</h3>
        <div class="pts-wrap"><table class="pts-table">
          <thead><tr><th>Modalidade</th>${POINT_FIELDS.map(([k, l]) => html`<th key=${k} title=${l}>${l}</th>`)}<th>Peso no geral</th><th></th></tr></thead>
          <tbody>
            ${pts.length > 0 && html`<${PointsRow} m=${{ id: '*', name: 'Padrão (todas)' }} rules=${rulesFor(pts, '*')} own=${true} run=${run} />`}
            ${pts.length > 0 && modList.map((m) => html`<${PointsRow} key=${m.id + (pts.find((r) => r.modality === m.id) ? 1 : 0)} m=${m} rules=${rulesFor(pts, m.id)} own=${pts.some((r) => r.modality === m.id)} run=${run} />`)}
          </tbody>
        </table></div>
        <p class="muted hint">Modalidade sem pontuação própria usa a padrão. Editar uma linha cria a pontuação própria dela. Futebol não tem ranking individual.</p>
      </section>

      <div class="two-col">
        <section class="glass card form-card">
          <h3>Conquistas</h3>
          <p class="muted">Reconhecimento manual (ex.: "Virada histórica"). Vale os pontos de conquista da modalidade.</p>
          <label class="field">Pessoa<select class="input" value=${award.user} onChange=${(e) => setAward({ ...award, user: e.target.value })}><option value="">Escolha…</option>${(people.data || []).map((p) => html`<option value=${p.id}>${p.name}</option>`)}</select></label>
          <label class="field">Modalidade<select class="input" value=${award.modality} onChange=${(e) => { setAward({ ...award, modality: e.target.value }); setAwards(null); }}>${modList.map((m) => html`<option value=${m.id}>${m.name}</option>`)}</select></label>
          <label class="field">Conquista<input class="input" maxlength="80" value=${award.label} onInput=${(e) => setAward({ ...award, label: e.target.value })} /></label>
          <div class="actions">
            <button class="btn ghost" onClick=${() => loadAwards(award.modality)}>Ver conquistas desta modalidade</button>
            <button class="btn primary grow" disabled=${!award.user || !award.label.trim()} onClick=${async () => { if (await run((db, tk) => db.adminAward(tk, award.user, award.modality, award.label), 'Conquista registrada.')) { setAward({ ...award, label: '' }); if (awards) loadAwards(award.modality); } }}>Registrar conquista</button>
          </div>
          ${awards && html`<ul class="plain-list">${awards.length ? awards.map((a) => html`<li key=${a.id}>${names.get(a.user_id) || '?'} · ${a.label}
            <button class="btn sm ghost" onClick=${async () => { if (await confirmDialog({ title: 'Remover conquista?', body: `${names.get(a.user_id) || ''}: ${a.label}. Os pontos saem do ranking.`, confirmLabel: 'Remover', danger: true })) { await run((db, tk) => db.adminDeleteAward(tk, a.id), 'Conquista removida.'); loadAwards(award.modality); } }}>Remover</button></li>`) : html`<li class="muted">Nenhuma conquista nesta modalidade.</li>`}</ul>`}
        </section>
        <section class="glass card form-card">
          <h3>Modalidades</h3>
          <ul class="plain-list">${modList.map((m) => html`<li key=${m.id}><span>${m.name} <small class="muted">${m.family === 'gaming' ? 'TUTORY Gaming' : m.family === 'esports' ? 'eSports' : 'Esporte'} · ${m.kind === 'equipe' ? 'por equipe' : 'individual'}</small></span>
            <button class="btn sm ghost" onClick=${() => run((db, tk) => db.adminSaveModality(tk, { ...m, active: !m.active }), m.active ? 'Modalidade desativada. Os resultados ficam guardados.' : 'Modalidade ativada.')}>${m.active ? 'Desativar' : 'Ativar'}</button></li>`)}</ul>
          <h4>Nova modalidade</h4>
          <label class="field">Nome<input class="input" maxlength="40" value=${nm.name} onInput=${(e) => setNm({ ...nm, name: e.target.value, id: nm.idTouched ? nm.id : e.target.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) })} /></label>
          <label class="field">Código (endereço interno)<input class="input mono" maxlength="30" value=${nm.id} onInput=${(e) => setNm({ ...nm, id: e.target.value, idTouched: true })} /></label>
          <div class="field">Tipo<${Seg} label="Tipo" items=${[['esporte', 'Esporte'], ['gaming', 'TUTORY Gaming'], ['esports', 'eSports']]} value=${nm.family} onChange=${(v) => setNm({ ...nm, family: v })} /></div>
          <div class="field">Disputa<${Seg} label="Disputa" items=${[['individual', 'Individual'], ['equipe', 'Por equipe']]} value=${nm.kind} onChange=${(v) => setNm({ ...nm, kind: v })} /></div>
          <label class="field">Dica de placar (opcional)<input class="input" maxlength="60" value=${nm.score_hint} onInput=${(e) => setNm({ ...nm, score_hint: e.target.value })} placeholder="ex.: Sets, 2 x 1" /></label>
          <button class="btn primary" disabled=${!nm.name.trim()} onClick=${async () => { if (modMap.has(nm.id) && !await confirmDialog({ title: 'Código já existe', body: `Isso vai substituir os dados de ${modMap.get(nm.id).name}.`, confirmLabel: 'Substituir' })) return; if (await run((db, tk) => db.adminSaveModality(tk, { ...nm, sort: (modList.at(-1)?.sort || 0) + 1, active: true }), 'Modalidade salva.')) setNm({ id: '', name: '', family: 'esporte', kind: 'individual', score_hint: '' }); }}>Salvar modalidade</button>
        </section>
      </div>

      <section class="glass card">
        <h3>Registro de alterações</h3>
        <p class="muted">Toda mudança em resultados, colocações, pontuação, modalidades, status e faixa de contas fica registrada no banco.</p>
        ${audit.error && html`<p class="notice">${audit.error.message}</p>`}
        <ul class="audit-list">${(audit.data || []).map((a) => html`<li key=${a.id}><span class="muted mono">${fmtDate(Date.parse(a.at))}</span>
          <span><b>${TBL_LABEL[a.tbl] || a.tbl}</b> ${OP_LABEL[a.op] || a.op} · ${auditLine(a, names, modMap)}</span>
          <small class="muted">${a.actor === 'administrador' ? 'administrador' : names.get(a.actor) || 'conta'}</small></li>`)}</ul>
        ${audit.data && !audit.data.length && html`<p class="muted">Nada registrado ainda.</p>`}
      </section>
    <//>
  </main>`;
}
