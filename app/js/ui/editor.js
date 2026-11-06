import { html, useState, useEffect, useRef, store, useDoc, useStage, go, toast, playerById, avatarOf, handleError } from './lib.js';
import { EditorStage } from '../three/stage.js';
import {
  loadLibrary, normalizeAvatar, presetToAvatar, PRESETS, SKIN_TONES, HAIR_COLORS, FABRIC_COLORS, HEAD_SHAPES, EXPRESSIONS, POSES, RACKETS, ACCESSORIES, autoEyeColor, webglAvailable,
} from '../three/avatars.js';

const TABS = [['look', 'Personagem'], ['clothes', 'Roupa'], ['head', 'Cabeça'], ['hair', 'Cabelo'], ['face', 'Rosto'], ['extras', 'Acessórios'], ['racket', 'Raquete'], ['pose', 'Pose']];

function Swatches({ colors, value, onChange, label, allowNone }) {
  return html`<div class="swatches" role="group" aria-label=${label}>
    ${allowNone && html`<button class=${'swatch none ' + (!value ? 'on' : '')} onClick=${() => onChange(null)} title=${allowNone} aria-label=${allowNone}></button>`}
    ${colors.map((c) => html`<button key=${c} class=${'swatch ' + (value === c ? 'on' : '')} style=${'background:' + c} onClick=${() => onChange(c)} aria-label=${'Cor ' + c}></button>`)}
    <label class="swatch custom" title="Outra cor"><input type="color" value=${value || '#3b7bf5'} onInput=${(e) => onChange(e.target.value)} aria-label=${'Escolher outra cor para ' + label} /></label>
  </div>`;
}

function Options({ items, value, onChange, none }) {
  return html`<div class="options">
    ${none && html`<button class=${'option ' + (!value ? 'on' : '')} onClick=${() => onChange(null)}>${none}</button>`}
    ${items.map(([id, label]) => html`<button key=${id} class=${'option ' + (value === id ? 'on' : '')} onClick=${() => onChange(id)}>${label}</button>`)}
  </div>`;
}

const Group = ({ title, hint, children }) => html`<section class="ed-group"><h4>${title}</h4>${hint && html`<p class="muted hint">${hint}</p>`}${children}</section>`;

function ColorSlots({ entry, entryKey, draft, patchColor }) {
  const slots = (entry?.parts || []).filter((p) => !['skin', 'shoes', 'hair', 'eyes', 'brows'].includes(p.slot));
  return slots.map((p) => html`<${Group} key=${p.slot} title=${p.slot}>
    <${Swatches} label=${p.slot} colors=${FABRIC_COLORS} value=${draft.colors[`${entryKey}:${p.slot}`] || p.color} onChange=${(c) => patchColor(`${entryKey}:${p.slot}`, c)} />
  <//>`);
}

export function EditorPage({ id }) {
  const t = useDoc();
  const player = playerById(t, id);
  const [draft, setDraft] = useState(() => normalizeAvatar(player ? avatarOf(player) : {}));
  const [tab, setTab] = useState('look');
  const [lib, setLib] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [code, setCode] = useState('');
  const [host, stage] = useStage((el) => new EditorStage(el));

  useEffect(() => { loadLibrary().then(setLib).catch(handleError); }, []);
  useEffect(() => { stage.current?.setAvatar(draft, draft.pose); }, [JSON.stringify(draft)]);

  if (!player) {
    return html`<main class="page"><div class="glass empty"><h3>Participante não encontrado</h3><a class="btn" href="#/jogadores">Ver participantes</a></div></main>`;
  }
  const needsCode = store.remote && !store.admin;
  const patch = (p) => { setDirty(true); setDraft((d) => ({ ...d, ...p })); };
  const patchColor = (k, c) => { setDirty(true); setDraft((d) => ({ ...d, colors: { ...d.colors, [k]: c } })); };
  const save = async () => {
    setSaving(true);
    try {
      await store.saveAvatar(player.id, draft, code);
      setDirty(false);
      toast('Avatar salvo.', 'ok');
      go('jogadores');
    } catch (e) { handleError(e); } finally { setSaving(false); }
  };
  const surprise = () => {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    if (!lib) return;
    const outfit = pick(lib.catalog.outfits).id;
    patch({
      outfit, head: 'human', preset: null, hair: pick(lib.catalog.hairs).id, hat: Math.random() < 0.25 ? pick(lib.catalog.hats).id : null, facial: null,
      skin: pick(SKIN_TONES.slice(0, 7)), hairColor: pick(HAIR_COLORS), face: pick(['classic', 'lashes', 'chef', 'doctor']), shoes: pick(FABRIC_COLORS),
      expression: pick(Object.keys(EXPRESSIONS)), colors: {},
    });
  };
  const head = lib?.heads[draft.head];
  const outfit = lib?.outfits[draft.outfit];
  const hatEntry = draft.hat && lib?.hats[draft.hat];

  return html`<main class="editor">
    <section class="ed-stage">
      <div class="ed-canvas stage-host" ref=${host}>
        ${!webglAvailable() && html`<div class="stage-loading">Este aparelho não oferece suporte a WebGL. O avatar pode ser editado, mas a prévia 3D não aparece.</div>`}
        ${webglAvailable() && !lib && html`<div class="stage-loading">Carregando personagens…</div>`}
      </div>
      <div class="ed-who">
        <span class="overline">Avatar de</span>
        <h1>${player.name}</h1>
        <p class="muted">Arraste para girar · role para aproximar</p>
      </div>
    </section>
    <aside class="ed-panel glass">
      <div class="ed-tabs" role="tablist">
        ${TABS.map(([k, label]) => html`<button key=${k} role="tab" aria-selected=${tab === k} class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${label}</button>`)}
      </div>
      <div class="ed-body">
        ${!lib && html`<div class="skeleton" style="height:240px;border-radius:16px"></div>`}
        ${lib && tab === 'look' && html`
          <${Group} title="Personagens do pack" hint="Combinações originais. Depois, ajuste o que quiser nas outras abas.">
            <div class="options">${PRESETS.map((p) => html`<button key=${p.id} class=${'option ' + (draft.preset === p.id ? 'on' : '')} onClick=${() => { setDirty(true); setDraft({ ...presetToAvatar(p), pose: draft.pose, racket: draft.racket }); }}>${p.label}</button>`)}</div>
          <//>
          <button class="btn" onClick=${surprise}>Surpreenda-me</button>`}
        ${lib && tab === 'clothes' && html`
          <${Group} title="Roupa"><${Options} items=${lib.catalog.outfits.map((o) => [o.id, o.label])} value=${draft.outfit} onChange=${(v) => patch({ outfit: v, preset: null })} /><//>
          <${ColorSlots} entry=${outfit} entryKey=${draft.outfit} draft=${draft} patchColor=${patchColor} />
          <${Group} title="Calçados" hint="Pintura dos pés do modelo: o pack não traz calçados como peças separadas.">
            <${Swatches} label="Calçados" colors=${FABRIC_COLORS} value=${draft.shoes} onChange=${(c) => patch({ shoes: c })} />
          <//>
          <${Group} title="Escudo no peito"><${Options} none="Sem escudo" items=${Object.entries(ACCESSORIES.badge.options)} value=${draft.badge} onChange=${(v) => patch({ badge: v })} /><//>`}
        ${lib && tab === 'head' && html`
          <${Group} title="Tom de pele"><${Swatches} label="Tom de pele" colors=${SKIN_TONES} value=${draft.skin} onChange=${(c) => patch({ skin: c })} /><//>
          <${Group} title="Tipo de cabeça"><${Options} items=${lib.catalog.heads.map((o) => [o.id, o.label])} value=${draft.head} onChange=${(v) => patch({ head: v })} /><//>
          <${ColorSlots} entry=${head} entryKey=${'head:' + draft.head} draft=${draft} patchColor=${patchColor} />
          <${Group} title="Formato" hint="Proporção da cabeça, aplicada no esqueleto. O pack não tem formas de rosto editáveis.">
            <${Options} items=${Object.entries(HEAD_SHAPES).map(([k, v]) => [k, v.label])} value=${draft.headShape} onChange=${(v) => patch({ headShape: v })} />
          <//>`}
        ${lib && tab === 'hair' && (head?.noHair
          ? html`<p class="notice">A cabeça "${head.label}" cobre o cabelo. Escolha outro tipo de cabeça para ver as opções.</p>`
          : html`
          <${Group} title="Cabelo"><${Options} none="Careca" items=${lib.catalog.hairs.map((o) => [o.id, o.label])} value=${draft.hair} onChange=${(v) => patch({ hair: v, preset: null })} /><//>
          <${Group} title="Cor do cabelo"><${Swatches} label="Cor do cabelo" colors=${HAIR_COLORS} value=${draft.hairColor} onChange=${(c) => patch({ hairColor: c })} allowNone="Cor original" /><//>
          <${Group} title="Barba e bigode"><${Options} none="Nenhum" items=${lib.catalog.facials.map((o) => [o.id, o.label])} value=${draft.facial} onChange=${(v) => patch({ facial: v })} /><//>`)}
        ${lib && tab === 'face' && (head?.noFace || head?.lockFace
          ? html`<p class="notice">A cabeça "${head.label}" já vem com rosto próprio.</p>`
          : html`
          <${Group} title="Olhos e sobrancelhas"><${Options} items=${lib.catalog.faces.filter((f) => !f.hidden).map((o) => [o.id, o.label])} value=${draft.face} onChange=${(v) => patch({ face: v })} /><//>
          <${Group} title="Cor dos olhos"><${Swatches} label="Cor dos olhos" colors=${['#141414', '#fffff0', '#3b7bf5', '#2fa39a', '#6b4226']} value=${draft.eyeColor} onChange=${(c) => patch({ eyeColor: c })} allowNone="Automática pelo tom de pele" /><//>
          <${Group} title="Cor das sobrancelhas"><${Swatches} label="Cor das sobrancelhas" colors=${HAIR_COLORS} value=${draft.browColor} onChange=${(c) => patch({ browColor: c })} allowNone="Igual ao cabelo" /><//>
          <${Group} title="Expressão" hint="Movimento de olhos e sobrancelhas: o pack não traz expressões prontas.">
            <${Options} items=${Object.entries(EXPRESSIONS).map(([k, v]) => [k, v.label])} value=${draft.expression} onChange=${(v) => patch({ expression: v })} />
          <//>`)}
        ${lib && tab === 'extras' && html`
          ${head?.noHat ? html`<p class="notice">A cabeça "${head.label}" não aceita chapéu.</p>` : html`
          <${Group} title="Chapéus e capacetes"><${Options} none="Nenhum" items=${lib.catalog.hats.map((o) => [o.id, o.label])} value=${draft.hat} onChange=${(v) => patch({ hat: v, preset: null })} /><//>
          <${ColorSlots} entry=${hatEntry} entryKey=${'hat:' + draft.hat} draft=${draft} patchColor=${patchColor} />`}
          ${!head?.noFace && html`<${Group} title="Óculos"><${Options} none="Sem óculos" items=${Object.entries(ACCESSORIES.glasses.options)} value=${draft.glasses} onChange=${(v) => patch({ glasses: v })} /><//>`}
          <${Group} title="Munhequeira"><${Options} none="Sem munhequeira" items=${Object.entries(ACCESSORIES.wrist.options)} value=${draft.wrist} onChange=${(v) => patch({ wrist: v })} />
            ${draft.wrist && html`<${Swatches} label="Cor da munhequeira" colors=${FABRIC_COLORS} value=${draft.colors.wrist || '#ffffff'} onChange=${(c) => patchColor('wrist', c)} />`}<//>`}
        ${lib && tab === 'racket' && html`
          <${Group} title="Raquete" hint="Modelo criado para este projeto: o pack não inclui raquetes.">
            <${Options} items=${Object.entries(RACKETS).map(([k, v]) => [k, v.label])} value=${draft.racket?.style || 'classic'} onChange=${(v) => patch({ racket: { ...draft.racket, style: v } })} />
          <//>
          <${Group} title="Cor da borracha"><${Swatches} label="Cor da borracha" colors=${['#c0262d', '#0040c8', '#1f8a55', '#a23f96', '#d9772c', '#15171c']} value=${draft.racket?.color} onChange=${(c) => patch({ racket: { ...draft.racket, color: c } })} /><//>`}
        ${lib && tab === 'pose' && html`
          <${Group} title="Animações originais" hint="Toque para ver. A escolhida vira a pose do editor.">
            <${Options} items=${Object.entries(POSES)} value=${draft.pose} onChange=${(v) => { stage.current?.setPose(v); patch({ pose: v }); }} />
          <//>`}
      </div>
      <div class="ed-foot">
        ${needsCode && html`<label class="field code-field">Seu código pessoal
          <input class="input code-input" autocomplete="off" maxlength="6" value=${code} onInput=${(e) => setCode(e.target.value)} placeholder="ABC123" /></label>`}
        <div class="actions">
          <a class="btn ghost" href="#/jogadores">Voltar</a>
          <button class="btn primary grow" disabled=${saving || (needsCode && code.trim().length < 6)} onClick=${save}>${saving ? 'Salvando…' : dirty ? 'Salvar avatar' : 'Salvar avatar'}</button>
        </div>
      </div>
    </aside>
  </main>`;
}
