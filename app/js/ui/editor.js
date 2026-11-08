import { html, useState, useEffect, useRef, store, useDoc, useStage, toast, playerById, avatarOf, handleError, setLeaveGuard } from './lib.js';
import { EditorStage } from '../three/stage.js';
import { sports } from '../core/sports.js';
import { useSports } from './sports.js';
import {
  loadGender, normalizeAvatar, avatarFromName, dressed, BODY_TYPES, BODY_TYPE_KEYS, portrait, webglAvailable, GENDERS, SKINS, HAIR_COLORS, CLOTH_COLORS, CATEGORIES, OPTIONAL, SLIDERS, RACKETS, POSES,
} from '../three/avatars.js';

const TABS = [['base', 'Base'], ['face', 'Rosto'], ['body', 'Corpo'], ['clothes', 'Roupas'], ['hair', 'Cabelo'], ['extras', 'Acessórios'], ['pose', 'Pose']];
const FACE_GROUPS = ['Rosto', 'Testa', 'Olhos e sobrancelhas', 'Nariz e boca', 'Expressão'];
const BODY_GROUPS = ['Corpo', 'Proporções', 'Braços e pernas', 'Traços de origem'];

const Group = ({ title, hint, children }) => html`<section class="ed-group"><h4>${title}</h4>${hint && html`<p class="muted hint">${hint}</p>`}${children}</section>`;

function Options({ items, value, onChange, none }) {
  return html`<div class="options">
    ${none && html`<button class=${'option ' + (!value ? 'on' : '')} onClick=${() => onChange(null)}>${none}</button>`}
    ${items.map(([id, label]) => html`<button key=${id} class=${'option ' + (value === id ? 'on' : '')} onClick=${() => onChange(id)}>${label}</button>`)}
  </div>`;
}

function Swatches({ colors, value, onChange, label, none }) {
  return html`<div class="swatches" role="group" aria-label=${label}>
    ${none && html`<button class=${'swatch none ' + (!value ? 'on' : '')} onClick=${() => onChange(null)} title=${none} aria-label=${none}></button>`}
    ${colors.map((c) => html`<button key=${c} class=${'swatch ' + (value === c ? 'on' : '')} style=${'background:' + c} onClick=${() => onChange(c)} aria-label=${'Cor ' + c}></button>`)}
    <label class="swatch custom" title="Outra cor"><input type="color" value=${value || '#3b7bf5'} onInput=${(e) => onChange(e.target.value)} aria-label=${'Outra cor para ' + label} /></label>
  </div>`;
}

// k: alcance do controle (comprimentos usam parte do intervalo do modelo para não sair do natural)
function Slider({ label, neg, pos, morph, onChange, k = 1 }) {
  const value = ((morph[pos] || 0) - (neg ? morph[neg] || 0 : 0)) / k;
  return html`<label class="ed-slider"><span>${label}</span>
    <input type="range" min=${neg ? -1 : 0} max="1" step="0.02" value=${value} onInput=${(e) => onChange(neg, pos, +e.target.value * k)} /></label>`;
}

export function EditorPage({ id, account = false }) {
  const t = useDoc();
  const s = useSports();
  const player = account ? (s.profile ? { id: s.profile.id, name: s.profile.name, avatar: s.profile.avatar } : null) : playerById(t, id);
  // Quem está logado e é o dono deste jogador salva na própria conta, sem código.
  const ownAccount = account || (!!player?.userId && player.userId === s.user?.id);
  const [saved, setSaved] = useState(() => normalizeAvatar(player ? avatarOf(player) : {}));
  const [draft, setDraftRaw] = useState(saved);
  // histórico para "Desfazer": mudanças seguidas (arrastar um controle) viram um passo só
  const hist = useRef({ list: [], at: 0 });
  const [, bump] = useState(0);
  const setDraft = (fn) => setDraftRaw((d) => {
    const n = typeof fn === "function" ? fn(d) : fn;
    if (JSON.stringify(n) === JSON.stringify(d)) return d;
    const h = hist.current, now = Date.now();
    if (now - h.at > 500) { h.list = [...h.list.slice(-39), d]; bump((x) => x + 1); }
    h.at = now;
    return n;
  });
  const undo = () => { const h = hist.current; const prev = h.list.pop(); h.at = 0; if (prev) setDraftRaw(prev); bump((x) => x + 1); };
  const [tab, setTab] = useState('base');
  const [meta, setMeta] = useState(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // 'ok' | 'error' | null
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [host, stage] = useStage((el) => new EditorStage(el));
  const keyOf = (a) => JSON.stringify({ ...a, thumb: null, provisional: false });
  const dirty = keyOf(draft) !== keyOf(saved);

  useEffect(() => { loadGender(draft.gender).then((lib) => setMeta(lib.meta)).catch(handleError); }, [draft.gender]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const job = stage.current?.setAvatar(draft, draft.pose);
    if (!job) setLoading(false);
    else job.then(() => live && setLoading(false)).catch((e) => { if (live) setLoading(false); handleError(e); });
    return () => { live = false; };
  }, [keyOf(draft)]);
  // Protege contra perder alterações: fechar a aba ou trocar de tela pede confirmação.
  useEffect(() => {
    if (!dirty || saving) return undefined;
    const ask = (e) => { e.preventDefault(); e.returnValue = ''; };
    addEventListener('beforeunload', ask);
    setLeaveGuard(() => confirm('Você tem alterações no avatar que não foram salvas. Sair mesmo assim?'));
    return () => { removeEventListener('beforeunload', ask); setLeaveGuard(null); };
  }, [dirty, saving]);
  useEffect(() => { if (dirty) setStatus(null); }, [dirty]);

  if (!player) return html`<main class="page"><div class="glass empty"><h3>Participante não encontrado</h3><a class="btn" href="#/jogadores">Ver participantes</a></div></main>`;
  const needsCode = !ownAccount && store.remote && !store.admin;
  const patch = (p) => setDraft((d) => ({ ...d, ...p, provisional: false }));
  // roupa obrigatória: trocar para peças separadas completa a outra metade com a peça básica
  const setPart = (cat, name) => setDraft((d) => {
    const parts = { ...d.parts, [cat]: name };
    if (cat === "full" && name) { delete parts.top; delete parts.bottom; }
    if ((cat === "top" || cat === "bottom") && name) delete parts.full;
    return { ...d, parts: dressed(parts, d.gender), provisional: false };
  });
  const setBodyType = (k) => setDraft((d) => {
    const morph = Object.fromEntries(Object.entries(d.morph).filter(([n]) => !BODY_TYPE_KEYS.has(n)));
    return { ...d, morph: { ...morph, ...BODY_TYPES[k].morph }, provisional: false };
  });
  const setColor = (k, c) => setDraft((d) => ({ ...d, colors: { ...d.colors, [k]: c }, provisional: false }));
  const setMorph = (neg, pos, v) => setDraft((d) => {
    const morph = { ...d.morph };
    if (neg) morph[neg] = Math.max(0, -v);
    morph[pos] = Math.max(0, v);
    return { ...d, morph };
  });
  const setGender = (g) => {
    if (g === draft.gender) return;
    // as peças são próprias de cada corpo: troca para o conjunto padrão do outro
    const base = avatarFromName(player.name, g);
    setDraft((d) => ({ ...d, gender: g, parts: base.parts, colors: { hair: d.colors.hair }, morph: {}, provisional: false }));
  };
  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const thumb = await portrait({ ...draft, thumb: null }, { fresh: true, size: 256 }).catch(() => null);
      const final = { ...draft, thumb, provisional: false };
      if (ownAccount) await sports.saveAvatar(final);
      else await store.saveAvatar(player.id, final, code);
      setSaved(final);
      setDraft(final);
      setStatus('ok');
      toast('Avatar salvo. Ele aparece igual em qualquer aparelho.', 'ok');
    } catch (e) { setStatus('error'); handleError(e); } finally { setSaving(false); }
  };
  const back = account || ownAccount ? '#/conta' : '#/jogadores';
  const catalog = meta?.catalog || {};
  const items = (cat) => (catalog[cat] || []).map((x) => [x.name, x.label]);
  const morphGroups = (groups) => groups.map((g) => html`<${Group} key=${g} title=${g}>
    ${SLIDERS[g].filter(([, , pos]) => meta?.morphs.includes(pos)).map(([label, neg, pos, k]) => html`<${Slider} key=${pos} label=${label} neg=${neg} pos=${pos} k=${k || 1} morph=${draft.morph} onChange=${setMorph} />`)}
  <//>`);

  return html`<main class="editor">
    <section class="ed-stage">
      <div class="ed-canvas stage-host" ref=${host}>
        ${!webglAvailable() && html`<div class="stage-loading">Este aparelho não oferece suporte a WebGL: o avatar pode ser editado, mas a prévia 3D não aparece.</div>`}
        ${webglAvailable() && loading && html`<div class="stage-loading">Carregando peças…</div>`}
      </div>
      <div class="ed-who"><span class="overline">Avatar de</span><h1>${player.name}</h1><p class="muted">Arraste para girar · role para aproximar · <a href="#/regulamento">créditos</a></p></div>
      <div class="ed-cams">
        ${[['face', 'Rosto'], ['bust', 'Busto'], ['body', 'Corpo']].map(([k, l]) => html`<button key=${k} class="btn sm" onClick=${() => stage.current?.focus(k)}>${l}</button>`)}
        <span class="ed-cams-sep"></span>
        ${[["front", "Frente"], ["side", "Lado"], ["back", "Costas"]].map(([k, l]) => html`<button key=${k} class="btn sm ghost" onClick=${() => stage.current?.view(k)}>${l}</button>`)}
      </div>
    </section>
    <aside class="ed-panel glass">
      <div class="ed-tabs" role="tablist">
        ${TABS.map(([k, label]) => html`<button key=${k} role="tab" aria-selected=${tab === k} class=${tab === k ? 'on' : ''} onClick=${() => { setTab(k); stage.current?.focus(k === 'face' || k === 'hair' ? 'face' : k === 'clothes' || k === 'body' || k === 'pose' ? 'body' : 'bust'); }}>${label}</button>`)}
      </div>
      <div class="ed-body">
        ${!meta && html`<div class="skeleton" style="height:240px;border-radius:16px"></div>`}
        ${meta && tab === 'base' && html`
          ${draft.provisional && html`<p class="notice">Este é um avatar provisório, sorteado pelo nome. Monte o seu e salve.</p>`}
          <${Group} title="Corpo base"><${Options} items=${Object.entries(GENDERS)} value=${draft.gender} onChange=${setGender} /><//>
          <${Group} title="Tom de pele" hint="Texturas reais de pele. Os traços do rosto ficam na aba Corpo, em Traços de origem.">
            <${Options} items=${Object.entries(SKINS)} value=${draft.skin} onChange=${(v) => patch({ skin: v })} />
          <//>
          <${Group} title="Altura"><label class="ed-slider"><span>${Math.round(draft.height * 175)} cm aprox.</span>
            <input type="range" min="0.9" max="1.1" step="0.005" value=${draft.height} onInput=${(e) => patch({ height: +e.target.value })} /></label><//>`}
        ${meta && tab === 'face' && morphGroups(FACE_GROUPS)}
        ${meta && tab === "body" && html`<${Group} title="Tipo de corpo" hint="Ponto de partida. Ajuste os detalhes nos controles abaixo; o esqueleto e as roupas acompanham.">
          <${Options} items=${Object.entries(BODY_TYPES).map(([k, t]) => [k, t.label])} value=${Object.entries(BODY_TYPES).find(([, t]) => [...BODY_TYPE_KEYS].every((n) => (draft.morph[n] || 0) === (t.morph[n] || 0)))?.[0] || null} onChange=${setBodyType} />
        <//>`}
        ${meta && tab === "body" && morphGroups(BODY_GROUPS)}
        ${meta && tab === 'clothes' && ['full', 'top', 'bottom', 'shoes'].map((cat) => html`<${Group} key=${cat} title=${CATEGORIES.find((c) => c[0] === cat)[1]}>
          <${Options} none=${null} items=${items(cat)} value=${draft.parts[cat] || null} onChange=${(v) => setPart(cat, v)} />
          ${draft.parts[cat] && html`<${Swatches} label=${'Cor de ' + cat} colors=${CLOTH_COLORS} value=${draft.colors[cat]} onChange=${(c) => setColor(cat, c)} none="Cor original" />`}
        <//>`)}
        ${meta && tab === 'hair' && html`
          <${Group} title="Cabelo"><${Options} none="Careca" items=${items('hair')} value=${draft.parts.hair || null} onChange=${(v) => setPart('hair', v)} /><//>
          <${Group} title="Cor do cabelo, barba e sobrancelha"><${Swatches} label="Cor do cabelo" colors=${HAIR_COLORS} value=${draft.colors.hair} onChange=${(c) => setColor('hair', c)} /><//>
          ${items('beard').length > 0 && html`<${Group} title="Barba e bigode"><${Options} none="Sem barba" items=${items('beard')} value=${draft.parts.beard || null} onChange=${(v) => setPart('beard', v)} /><//>`}`}
        ${meta && tab === 'extras' && html`
          <${Group} title="Óculos"><${Options} none="Sem óculos" items=${items('glasses')} value=${draft.parts.glasses || null} onChange=${(v) => setPart('glasses', v)} /><//>
          <${Group} title="Chapéus"><${Options} none="Sem chapéu" items=${items('hat')} value=${draft.parts.hat || null} onChange=${(v) => setPart('hat', v)} /><//>
          <${Group} title="Raquete"><${Options} items=${Object.entries(RACKETS)} value=${draft.racket.style} onChange=${(v) => patch({ racket: { ...draft.racket, style: v } })} />
            <${Swatches} label="Cor da borracha" colors=${['#c0262d', '#0040c8', '#1f8a55', '#a23f96', '#15171c']} value=${draft.racket.color} onChange=${(c) => patch({ racket: { ...draft.racket, color: c } })} /><//>`}
        ${meta && tab === 'pose' && html`
          <${Group} title="Animações" hint="Toque para ver. A escolhida vira a pose do editor.">
            <${Options} items=${Object.entries(POSES)} value=${draft.pose} onChange=${(v) => { stage.current?.setPose(v); patch({ pose: v }); }} />
          <//>`}
      </div>
      <div class="ed-foot">
        ${needsCode && html`<label class="field code-field">Seu código pessoal
          <input class="input code-input" autocomplete="off" maxlength="6" value=${code} onInput=${(e) => setCode(e.target.value)} placeholder="ABC123" /></label>
          <p class="muted hint">Tem conta? <a href="#/conta">Entre</a> e peça ao administrador para ligar sua conta a este jogador: aí o avatar salva sem código.</p>`}
        <p class=${'save-state ' + (saving ? 'busy' : status === 'error' ? 'err' : dirty ? 'dirty' : 'ok')} role="status" aria-live="polite">
          ${saving ? 'Salvando no banco…' : status === 'error' ? 'Não foi salvo. Confira a mensagem e tente de novo.' : dirty ? 'Alterações ainda não salvas' : status === 'ok' ? 'Salvo ✓' : draft.provisional ? 'Avatar provisório: salve para guardar' : 'Tudo salvo'}
        </p>
        <div class="actions">
          <a class="btn ghost" href=${back}>Voltar</a>
          <button class="btn ghost" disabled=${saving || !hist.current.list.length} onClick=${undo} title="Desfaz a última mudança">Desfazer</button>
          ${dirty && html`<button class="btn" disabled=${saving} onClick=${() => setDraft(saved)} title="Volta para a última versão salva">Restaurar salvo</button>`}
          <button class="btn primary grow" disabled=${saving || (!dirty && !draft.provisional) || (needsCode && code.trim().length < 6)} onClick=${save}>${saving ? 'Salvando…' : 'Salvar avatar'}</button>
        </div>
      </div>
    </aside>
  </main>`;
}
