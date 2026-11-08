// Eventos e categorias. O documento salvo guarda um evento com uma ou duas categorias (competições).
// Cada categoria é um campeonato completo no formato do motor (engine.js): inscrições, sorteio, chave e partidas próprios.
//
//   { schema: 2, event: { id, name, modality, format, createdAt }, comps: { m: T, f: T }, active: 'm', history: [...], football }
//
// Formatos: m (masculino), f (feminino), misto (todos numa chave só, sorteio integrado) e mf (masculino e feminino no
// mesmo evento, com sorteios e chaves separados). Eventos encerrados vão para `history`, intactos.
import { newTournament, UserError, uid, audit, isLocked } from './engine.js';
import { newFootball, normalizeFootball } from './football.js';

const fail = (message) => { throw new UserError(message); };

export const SCHEMA_ROOT = 2;
export const CAT_LABEL = { m: 'Masculino', f: 'Feminino', misto: 'Misto' };
export const FORMATS = { m: ['m'], f: ['f'], misto: ['misto'], mf: ['m', 'f'] };
export const FORMAT_LABEL = {
  m: 'Campeonato masculino',
  f: 'Campeonato feminino',
  misto: 'Misto, com sorteio integrado',
  mf: 'Masculino e feminino no mesmo evento',
};
export const FORMAT_HINT = {
  m: 'Só participantes do masculino. Sorteio, chave e resultados próprios.',
  f: 'Só participantes do feminino. Sorteio, chave e resultados próprios.',
  misto: 'Todos juntos numa única chave. Cada participante aparece com a sua categoria.',
  mf: 'Duas competições no mesmo dia: inscrições, sorteios, chaves e pódios separados.',
};
export const GENDERS = { m: 'Masculino', f: 'Feminino' };
// Modalidades individuais que usam chave de mata-mata (mesmas chaves de supabase/sports.sql).
export const MODALITY_LABEL = { pingpong: 'Ping Pong', jiujitsu: 'Jiu-Jitsu', eafc: 'EA FC', cod: 'Call of Duty', mk: 'Mortal Kombat' };
export const DEFAULT_NAME = 'Campeonato de Ping Pong';

export function newComp(cat, base = null) {
  const t = newTournament();
  t.category = cat;
  if (base) {
    // categorias do mesmo evento começam com a mesma identidade, regulamento e pontuação
    t.meta = { ...t.meta, ...base.meta };
    t.regulation = structuredClone(base.regulation);
    t.scoring = { ...base.scoring };
    t.settings = { ...base.settings };
  }
  return t;
}

export function newEvent({ name = DEFAULT_NAME, modality = 'pingpong', format = 'misto', edition = '' } = {}) {
  if (!FORMATS[format]) fail('Escolha o formato do campeonato.');
  const comps = {};
  let first = null;
  for (const cat of FORMATS[format]) {
    comps[cat] = newComp(cat, first);
    comps[cat].meta.name = name;
    comps[cat].meta.edition = edition;
    first ||= comps[cat];
  }
  return { id: uid('ev'), name, modality, format, createdAt: Date.now(), comps };
}

// Um campeonato do formato antigo (schema 1) por completo, com os padrões de cada campo.
export function normalizeComp(doc, cat) {
  const base = newTournament();
  if (!doc) return Object.assign(base, { category: cat });
  return {
    ...base, ...doc,
    category: cat,
    meta: { ...base.meta, ...doc.meta },
    regulation: { ...base.regulation, ...doc.regulation },
    scoring: { ...base.scoring, ...doc.scoring },
    settings: { ...base.settings, ...doc.settings },
    draw: { ...base.draw, ...doc.draw },
    display: { ...base.display, ...doc.display },
  };
}

export function normalizeRoot(doc) {
  const football = normalizeFootball({ ...newFootball(), ...doc?.football });
  if (!doc || doc.schema !== SCHEMA_ROOT || !doc.comps || !doc.event) {
    // Documento do formato antigo (um campeonato só, sem categorias): o Paulo pediu para começar do zero
    // (08/11/2026; cópia em backups/). Só o futebol continua.
    const { comps, ...event } = newEvent();
    return { schema: SCHEMA_ROOT, event, comps, active: Object.keys(comps)[0], history: [], football };
  }
  const cats = FORMATS[doc.event.format] || Object.keys(doc.comps);
  const comps = {};
  for (const cat of cats) comps[cat] = normalizeComp(doc.comps[cat], cat);
  return {
    schema: SCHEMA_ROOT,
    event: { ...doc.event },
    comps,
    active: comps[doc.active] ? doc.active : cats[0],
    history: Array.isArray(doc.history) ? doc.history : [],
    football,
  };
}

export const categories = (root) => Object.keys(root.comps);
export const allPlayers = (root) => categories(root).flatMap((c) => root.comps[c].players);

// Começou a valer quando qualquer categoria passou do sorteio.
export function eventStarted(root) {
  return categories(root).some((c) => root.comps[c].draw.status !== 'idle' || isLocked(root.comps[c]));
}

export function hasContent(root) {
  return categories(root).some((c) => root.comps[c].players.length > 0 || Object.keys(root.comps[c].matches).length > 0);
}

// Troca de formato antes do sorteio: as inscrições são redistribuídas pela categoria de cada pessoa.
export function changeFormat(root, format) {
  if (!FORMATS[format]) fail('Escolha o formato do campeonato.');
  if (format === root.event.format) return;
  if (eventStarted(root)) fail('O formato só muda antes do sorteio. Refaça o sorteio das categorias para mudar.');
  const players = allPlayers(root);
  const target = FORMATS[format];
  if (target.length > 1 || target[0] !== 'misto') {
    const missing = players.filter((p) => p.gender !== 'm' && p.gender !== 'f');
    if (missing.length) fail(`Informe a categoria de ${missing.slice(0, 3).map((p) => p.name).join(', ')}${missing.length > 3 ? ' e outros' : ''} antes de separar as categorias.`);
    const out = players.filter((p) => !target.includes(p.gender));
    if (out.length) fail(`${out.length === 1 ? out[0].name + ' não pertence' : out.length + ' inscritos não pertencem'} a ${target.map((c) => CAT_LABEL[c].toLowerCase()).join(' nem ')}. Remova antes de trocar.`);
  }
  const base = root.comps[categories(root)[0]];
  const comps = {};
  for (const cat of target) {
    comps[cat] = newComp(cat, base);
    comps[cat].players = players.filter((p) => cat === 'misto' || p.gender === cat).map((p) => ({ ...p, seed: null }));
    comps[cat].audit = [...base.audit];
    audit(comps[cat], 'format', `Formato do evento: ${FORMAT_LABEL[format]}.`);
  }
  root.event.format = format;
  root.comps = comps;
  root.active = target[0];
}

export function renameEvent(root, name) {
  const n = String(name || '').trim();
  if (!n) fail('Informe o nome do evento.');
  root.event.name = n;
  for (const c of categories(root)) root.comps[c].meta.name = n;
}

// Encerra o evento atual (vai para o histórico, intacto) e abre outro.
export function startNewEvent(root, opts) {
  if (hasContent(root)) {
    root.history.unshift({ event: { ...root.event, archivedAt: Date.now() }, comps: root.comps });
  }
  const { comps, ...event } = newEvent(opts);
  root.event = event;
  root.comps = comps;
  root.active = categories(root)[0];
}

// Visão de uma categoria para as telas: os campos do campeonato (como no formato antigo) + o que é do evento.
// As telas leem e alteram `t` como sempre; `applyView` devolve as alterações ao documento.
const ROOT_KEYS = ['football', 'event', 'comps', 'history', 'active', 'cat', 'root', 'schema'];
export function viewOf(root, cat) {
  const c = root.comps[cat] || root.comps[root.active] || root.comps[categories(root)[0]];
  return { ...c, schema: c.schema, football: root.football, event: root.event, comps: root.comps, history: root.history, active: root.active, cat: c.category, root };
}

export function applyView(root, v) {
  const comp = root.comps[v.cat];
  const prevDisplay = comp.display;
  for (const k of Object.keys(v)) {
    if (ROOT_KEYS.includes(k) && k !== 'schema') continue;
    comp[k] = v[k];
  }
  for (const k of Object.keys(comp)) if (!(k in v)) delete comp[k];
  comp.category = v.cat;
  root.football = v.football;
  // o telão acompanha a categoria em que o administrador mexeu por último no telão
  if (comp.display !== prevDisplay && JSON.stringify(comp.display) !== JSON.stringify(prevDisplay)) root.active = v.cat;
}
