import { html, useState, useRef, useDoc, store, act, toast, confirmDialog, download, fmtDate, handleError, displayName, playerById, go } from './lib.js';
import * as E from '../core/engine.js';
import { FlowSteps } from './home.js';
import { setSound, soundOn } from './sfx.js';

function Login() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const setup = !store.hasPassword;
  const offline = store.mode === 'server' && !store.online;
  const submit = async (e) => {
    e.preventDefault();
    if (setup && password.length < 6) {
      setError(`Use pelo menos 6 caracteres. Faltam ${6 - password.length}.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (setup) await store.setupPassword(password);
      else await store.login(password);
    } catch (err) {
      if (err instanceof E.UserError) setError(err.message);
      else handleError(err);
    } finally { setBusy(false); }
  };
  return html`<main class="page login-page"><form class="glass card login" novalidate onSubmit=${submit}>
    <span class="overline">Administração</span>
    <h1>${setup ? 'Crie a senha do administrador' : 'Entrar no painel'}</h1>
    <p class="muted">${setup ? 'É o primeiro acesso. Essa senha controla sorteio, resultados e regras do campeonato.' : 'Participantes e telão não precisam de senha para acompanhar.'}</p>
    ${store.mode === 'local' && html`<p class="notice warn">Modo local: sem o servidor, os dados ficam só neste navegador e a senha é apenas uma trava de uso, não uma proteção real.</p>`}
    ${offline && html`<p class="notice warn" role="alert">O servidor do campeonato está desligado. Dê dois cliques em <b>start.bat</b>, na pasta do projeto, e tente de novo.</p>`}
    <label class="field">Senha${setup && html`<small>Mínimo de 6 caracteres</small>`}
      <input class="input" type=${show ? 'text' : 'password'} autofocus autocomplete=${setup ? 'new-password' : 'current-password'} value=${password} onInput=${(e) => { setPassword(e.target.value); setError(''); }} /></label>
    <label class="show-pass"><input type="checkbox" checked=${show} onChange=${(e) => setShow(e.target.checked)} /> Mostrar senha</label>
    ${error && html`<p class="form-error" role="alert">${error}</p>`}
    <button class="btn primary lg" disabled=${busy || !password}>${busy ? 'Aguarde…' : setup ? 'Criar senha e entrar' : 'Entrar'}</button>
  </form></main>`;
}

const SCREENS = [['home', 'Início'], ['draw', 'Sorteio'], ['versus', 'Confronto'], ['score', 'Placar'], ['bracket', 'Chaveamento'], ['champion', 'Campeão']];

function TvControl({ t }) {
  const matches = E.realMatches(t).filter((m) => E.isReady(m));
  const url = (host) => `http://${host}:${location.port}/#/telao`;
  const needsMatch = t.display.mode === 'versus' || t.display.mode === 'score';
  return html`<section class="glass card admin-tv">
    <div class="panel-head"><div><span class="overline">Telão</span><h2>O que está no ar</h2></div>
      <a class="btn" href="#/telao" target="_blank" rel="noopener">Abrir telão</a></div>
    <div class="tv-switch" role="group" aria-label="Tela exibida no telão">
      ${SCREENS.map(([k, label]) => html`<button key=${k} class=${t.display.mode === k ? 'on' : ''} aria-pressed=${t.display.mode === k} onClick=${() => act((d) => E.setDisplay(d, k, d.display.matchId))}>${label}</button>`)}
    </div>
    ${needsMatch && html`<label class="field">Partida exibida
      <select class="input" value=${t.display.matchId || ''} onChange=${(e) => act((d) => E.setDisplay(d, d.display.mode, e.target.value || null))}>
        <option value="">Automática (em andamento ou próxima)</option>
        ${matches.map((m) => html`<option key=${m.id} value=${m.id}>Jogo ${m.number}: ${displayName(playerById(t, m.p[0]))} x ${displayName(playerById(t, m.p[1]))} (${E.STATUS_LABEL[m.status]})</option>`)}
      </select></label>`}
    ${store.mode === 'server' && store.lan.length > 0 && html`<p class="muted hint">Em outra TV ou computador na mesma rede: <b>${url(store.lan[0])}</b></p>`}
    ${store.mode === 'cloud' && html`<p class="muted hint">Em qualquer TV ou computador: <b>${location.origin}${location.pathname}#/telao</b></p>`}
    ${store.mode === 'local' && html`<p class="notice warn">Sem servidor, o telão só acompanha janelas deste mesmo navegador.</p>`}
  </section>`;
}

function Settings({ t }) {
  const [meta, setMeta] = useState({ name: t.meta.name, edition: t.meta.edition });
  const [scoring, setScoring] = useState({ ...t.scoring });
  const [sound, setS] = useState(soundOn());
  const file = useRef(null);
  const onLogo = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 640 / img.width);
      const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      act((d) => { d.meta.logo = c.toDataURL('image/png'); }, 'Logo atualizado.');
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => toast('Não consegui abrir essa imagem. Use PNG, JPG, SVG ou WEBP.', 'error');
    img.src = URL.createObjectURL(f);
  };
  return html`<section class="glass card">
    <span class="overline">Campeonato</span>
    <h2>Identidade e pontuação</h2>
    <div class="grid2" style="margin-top:14px">
      <label class="field">Nome<input class="input" value=${meta.name} onInput=${(e) => setMeta({ ...meta, name: e.target.value })} onBlur=${() => meta.name.trim() && act((d) => { d.meta.name = meta.name.trim(); })} /></label>
      <label class="field">Edição<input class="input" value=${meta.edition} onInput=${(e) => setMeta({ ...meta, edition: e.target.value })} onBlur=${() => act((d) => { d.meta.edition = meta.edition.trim(); })} /></label>
    </div>
    <div class="logo-row">
      <img src=${t.meta.logo || 'assets/brand/logo-branco.png'} alt="Logo atual" />
      <input ref=${file} type="file" accept="image/*" class="sr" onChange=${onLogo} aria-label="Enviar logotipo" />
      <button class="btn sm" onClick=${() => file.current.click()}>Trocar logo</button>
      ${t.meta.logo && html`<button class="btn sm ghost" onClick=${() => act((d) => { d.meta.logo = null; })}>Voltar ao logo Tutory</button>`}
    </div>
    <div class="grid2 score-config">
      <label class="field">Melhor de
        <select class="input" value=${scoring.bestOf} onChange=${(e) => setScoring({ ...scoring, bestOf: +e.target.value })}>${[1, 3, 5, 7].map((n) => html`<option key=${n} value=${n}>${n} ${n > 1 ? 'games' : 'game'}</option>`)}</select></label>
      <label class="field">Pontos por game<input class="input" type="number" min="1" value=${scoring.points} onInput=${(e) => setScoring({ ...scoring, points: +e.target.value })} /></label>
      <label class="field">Vantagem mínima<select class="input" value=${scoring.winBy} onChange=${(e) => setScoring({ ...scoring, winBy: +e.target.value })}><option value="2">2 pontos (regra oficial)</option><option value="1">Sem vantagem</option><option value="3">3 pontos</option></select></label>
      <label class="field">Limite de pontos<input class="input" type="number" min="0" value=${scoring.cap} onInput=${(e) => setScoring({ ...scoring, cap: +e.target.value })} /><small>0 = sem limite</small></label>
    </div>
    <div class="actions" style="margin-top:14px">
      <button class="btn primary" onClick=${() => act((d) => E.updateScoring(d, scoring), 'Pontuação salva.')}>Salvar pontuação</button>
      <a class="btn" href="#/regulamento">Editar regulamento</a>
      <button class="btn" aria-pressed=${sound} onClick=${() => { setSound(!sound); setS(!sound); }}>${sound ? 'Som ligado' : 'Ligar som aqui'}</button>
    </div>
  </section>`;
}

function DataBox({ t }) {
  const backup = useRef(null);
  const stamp = () => new Date().toISOString().slice(0, 10);
  const slug = t.meta.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-');
  const restart = async () => {
    if (await confirmDialog({ title: 'Reiniciar o campeonato?', body: 'Chave, sorteio e todos os resultados serão apagados. Participantes, avatares e regulamento ficam.', confirmLabel: 'Reiniciar', danger: true, phrase: 'REINICIAR' })) {
      act((d) => E.restartTournament(d), 'Campeonato reiniciado.');
    }
  };
  const newOne = async () => {
    if (await confirmDialog({ title: 'Criar um novo campeonato?', body: 'Tudo será apagado, inclusive participantes e regulamento. Exporte um backup antes, se quiser guardar.', confirmLabel: 'Apagar e criar novo', danger: true, phrase: 'NOVO' })) {
      act((d) => {
        const fresh = E.newTournament();
        Object.keys(d).forEach((k) => delete d[k]);
        Object.assign(d, fresh);
      }, 'Novo campeonato criado.');
    }
  };
  const restore = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const doc = JSON.parse(await f.text());
      if (!doc || doc.schema !== E.SCHEMA || !Array.isArray(doc.players)) throw new E.UserError('Este arquivo não é um backup válido do campeonato.');
      if (await confirmDialog({ title: 'Restaurar este backup?', body: `Os dados atuais serão substituídos por "${doc.meta?.name}", com ${doc.players.length} participantes.`, confirmLabel: 'Restaurar', danger: true })) {
        act((d) => {
          Object.keys(d).forEach((k) => delete d[k]);
          Object.assign(d, doc);
        }, 'Backup restaurado.');
      }
    } catch (err) {
      handleError(err instanceof SyntaxError ? new E.UserError('Este arquivo não é um backup válido do campeonato.') : err);
    }
  };
  return html`<section class="glass card">
    <span class="overline">Dados</span>
    <h2>Exportar e reiniciar</h2>
    <div class="actions" style="margin-top:14px">
      <button class="btn" disabled=${!t.bracket} onClick=${() => download(`${slug}-resultados-${stamp()}.csv`, E.toCSV(t), 'text/csv;charset=utf-8')}>Resultados (CSV)</button>
      <button class="btn" onClick=${() => download(`${slug}-backup-${stamp()}.json`, JSON.stringify(t, null, 1), 'application/json')}>Backup completo (JSON)</button>
      <input ref=${backup} type="file" accept=".json,application/json" class="sr" onChange=${restore} aria-label="Restaurar backup" />
      <button class="btn" onClick=${() => backup.current.click()}>Restaurar backup</button>
    </div>
    <div class="actions" style="margin-top:12px">
      <button class="btn danger" onClick=${restart}>Reiniciar campeonato</button>
      <button class="btn danger" onClick=${newOne}>Criar novo campeonato</button>
    </div>
  </section>`;
}

function Security() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = async (e) => {
    e.preventDefault();
    try {
      await store.changePassword(current, next);
      setCurrent('');
      setNext('');
      toast('Senha alterada.', 'ok');
    } catch (err) { handleError(err); }
  };
  return html`<section class="glass card">
    <span class="overline">Segurança</span>
    <h2>Acesso</h2>
    <p class="muted hint">${store.remote ? 'A senha fica protegida fora do navegador. Participantes usam um código pessoal para o próprio avatar.' : 'Modo local: sem servidor. Veja README para ligar o servidor.'}</p>
    <form class="grid2" onSubmit=${change}>
      <label class="field">Senha atual<input class="input" type="password" autocomplete="current-password" value=${current} onInput=${(e) => setCurrent(e.target.value)} /></label>
      <label class="field">Nova senha<input class="input" type="password" autocomplete="new-password" value=${next} onInput=${(e) => setNext(e.target.value)} /></label>
      <div class="actions"><button class="btn" disabled=${!current || !next}>Alterar senha</button></div>
    </form>
    <button class="btn ghost" style="margin-top:8px" onClick=${() => store.logout()}>Sair do painel</button>
  </section>`;
}

export function AdminPage() {
  const t = useDoc();
  if (!store.admin) return html`<${Login} />`;
  const status = E.tournamentStatus(t);
  const next = E.nextMatch(t);
  const live = E.liveMatches(t)[0];
  const focus = live || next;
  return html`<main class="page admin">
    <div class="page-head">
      <div><span class="overline">${status.label}</span><h1>Painel do <em>campeonato</em></h1></div>
      <div class="actions">
        ${t.draw.status !== 'done' && html`<a class="btn primary" href="#/sorteio">${t.draw.status === 'live' ? 'Continuar sorteio' : 'Abrir sorteio'} <span class="arrow">→</span></a>`}
        ${focus && html`<a class="btn primary" href=${'#/partida/' + focus.id}>${live ? 'Partida em andamento' : 'Próxima partida'} <span class="arrow">→</span></a>`}
        <a class="btn" href="#/jogadores">Participantes</a>
      </div>
    </div>
    ${store.mode === 'local' && html`<p class="notice warn" style="margin-bottom:18px">Modo local: sem o servidor, os dados ficam só neste navegador. Para vários aparelhos, abra pelo <b>start.bat</b>.</p>`}
    <div class="admin-grid">
      <section class="glass card"><span class="overline">Passo a passo</span><${FlowSteps} t=${t} /></section>
      <${TvControl} t=${t} />
      <${Settings} key=${t.meta.name + t.scoring.points + t.scoring.bestOf} t=${t} />
      <${DataBox} t=${t} />
      <${Security} />
      <section class="glass card audit-box"><span class="overline">Histórico</span><h2>Últimas ações</h2>
        <ul class="audit">${t.audit.slice(0, 40).map((a, i) => html`<li key=${i}><span class="muted">${fmtDate(a.at)}</span> ${a.message}</li>`)}
          ${t.audit.length === 0 && html`<li class="muted">Nada registrado ainda.</li>`}</ul></section>
    </div>
  </main>`;
}
