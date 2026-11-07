// Football Team Draw: sorteio e rodízio do futebol de terça. Regras puras, independentes dos campeonatos.
//
// Modelo: dois times em campo e UMA fila, em ordem. Quem perde vai para o fim da fila, na ordem do time;
// o próximo time são os 5 primeiros da fila. Os grupos exibidos são só a fila cortada de 5 em 5.
// Isso garante a regra das filas incompletas sem caso especial: fila de 3 + 5 perdedores
// vira um grupo com os 3 + os 2 primeiros perdedores, e outro com os 3 perdedores restantes.
import { UserError, cryptoRandom, uid } from './engine.js';

export const TEAM_SIZE = 5;
export const MIN_PLAYERS = TEAM_SIZE * 2;
export const MAX_PLAYERS = 30;
const MAX_UNDO = 40;

const fail = (m) => { throw new UserError(m); };
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ');

export const newFootball = () => ({ players: [], session: null, undo: [], archive: [], visible: false });

export const presentPlayers = (f) => f.players.filter((p) => p.present);
export const nameOf = (f, id) => f.players.find((p) => p.id === id)?.name || '?';

function snapshot(f, label) {
  f.undo.push({ label, players: structuredClone(f.players), session: structuredClone(f.session) });
  if (f.undo.length > MAX_UNDO) f.undo.shift();
}

export function undo(f) {
  const s = f.undo.pop();
  if (!s) fail('Não há ação para desfazer.');
  f.players = s.players;
  f.session = s.session;
  return s.label;
}

function inField(f, id) {
  const s = f.session;
  return !!s && (s.teams.A.includes(id) || s.teams.B.includes(id));
}

// Tira o jogador do rodízio. Vaga aberta em campo é preenchida pelo primeiro da fila, sem furar a ordem.
function leaveRotation(f, id) {
  const s = f.session;
  if (!s) return;
  s.queue = s.queue.filter((x) => x !== id);
  for (const k of ['A', 'B']) {
    const i = s.teams[k].indexOf(id);
    if (i >= 0) {
      s.teams[k].splice(i, 1);
      if (s.queue.length) s.teams[k].splice(i, 0, s.queue.shift());
    }
  }
}

// ------------------------------------------------------------------ lista de chegada
export function addPlayer(f, rawName) {
  const name = clean(rawName);
  if (!name) fail('Digite o nome do jogador.');
  if (f.players.length >= MAX_PLAYERS) fail(`A lista vai até ${MAX_PLAYERS} jogadores.`);
  if (f.players.some((p) => norm(p.name) === norm(name))) fail(`${name} já está na lista.`);
  snapshot(f, `Adicionar ${name}`);
  const player = { id: uid('f'), name, present: true };
  f.players.push(player);
  // com o jogo rolando, quem chega entra no fim da fila
  if (f.session) f.session.queue.push(player.id);
  return player;
}

export function renamePlayer(f, id, rawName) {
  const name = clean(rawName);
  if (!name) fail('Digite o nome do jogador.');
  if (f.players.some((p) => p.id !== id && norm(p.name) === norm(name))) fail(`${name} já está na lista.`);
  const p = f.players.find((x) => x.id === id) || fail('Jogador não encontrado.');
  if (p.name === name) return;
  snapshot(f, `Renomear ${p.name}`);
  p.name = name;
}

export function removePlayer(f, id) {
  const p = f.players.find((x) => x.id === id) || fail('Jogador não encontrado.');
  snapshot(f, `Remover ${p.name}`);
  leaveRotation(f, id);
  f.players = f.players.filter((x) => x.id !== id);
}

export function setPresent(f, id, present) {
  const p = f.players.find((x) => x.id === id) || fail('Jogador não encontrado.');
  if (p.present === present) return;
  snapshot(f, `${present ? 'Marcar presença de' : 'Marcar ausência de'} ${p.name}`);
  p.present = present;
  if (!f.session) return;
  if (present) f.session.queue.push(id);
  else leaveRotation(f, id);
}

// ------------------------------------------------------------------ sorteio
export function shuffle(list, random = cryptoRandom) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Os 10 primeiros a chegar formam os times; os demais são embaralhados na fila.
export function startSession(f, random = cryptoRandom) {
  const present = presentPlayers(f);
  if (present.length < MIN_PLAYERS) fail(`O sorteio precisa de pelo menos ${MIN_PLAYERS} jogadores presentes. Agora são ${present.length}.`);
  snapshot(f, f.session ? 'Refazer sorteio' : 'Sorteio');
  const first = shuffle(present.slice(0, MIN_PLAYERS).map((p) => p.id), random);
  f.session = {
    teams: { A: first.slice(0, TEAM_SIZE), B: first.slice(TEAM_SIZE) },
    queue: shuffle(present.slice(MIN_PLAYERS).map((p) => p.id), random),
    gameNo: 1, last: null, history: [], startedAt: Date.now(), drawAt: Date.now(),
  };
}

// Grupos só para exibição: a fila de 5 em 5.
export function queueGroups(f) {
  const q = f.session?.queue || [];
  const groups = [];
  for (let i = 0; i < q.length; i += TEAM_SIZE) groups.push(q.slice(i, i + TEAM_SIZE));
  return groups;
}

// ------------------------------------------------------------------ rodízio
export function registerWinner(f, winner) {
  const s = f.session || fail('Faça o sorteio antes de registrar um resultado.');
  if (winner !== 'A' && winner !== 'B') fail('Informe o time vencedor.');
  const loser = winner === 'A' ? 'B' : 'A';
  snapshot(f, `Jogo ${s.gameNo}: Time ${winner} venceu`);
  const out = s.teams[loser];
  s.queue.push(...out);
  const entering = s.queue.splice(0, TEAM_SIZE);
  s.teams[loser] = entering;
  const entry = {
    no: s.gameNo, winner, loser, at: Date.now(),
    winners: s.teams[winner].map((id) => nameOf(f, id)),
    out: out.map((id) => nameOf(f, id)),
    entering: entering.map((id) => nameOf(f, id)),
    sameTeam: entering.length === out.length && entering.every((id, i) => id === out[i]),
  };
  s.history.unshift(entry);
  s.gameNo += 1;
  s.last = { winner, loser, at: entry.at };
  return entry;
}

// ------------------------------------------------------------------ correção manual
function locate(s, id) {
  for (const k of ['A', 'B']) {
    const i = s.teams[k].indexOf(id);
    if (i >= 0) return [s.teams[k], i];
  }
  const i = s.queue.indexOf(id);
  return i >= 0 ? [s.queue, i] : null;
}

export function swapPlayers(f, a, b) {
  const s = f.session || fail('Faça o sorteio antes de reorganizar.');
  if (a === b) return;
  const pa = locate(s, a), pb = locate(s, b);
  if (!pa || !pb) fail('Jogador fora do rodízio.');
  snapshot(f, `Trocar ${nameOf(f, a)} e ${nameOf(f, b)}`);
  pa[0][pa[1]] = b;
  pb[0][pb[1]] = a;
}

// Sessão nova: mantém a lista, apaga times, filas e histórico da sessão.
export function resetSession(f) {
  snapshot(f, 'Reiniciar sessão');
  f.session = null;
}

// Nova terça: lista vazia. O resumo do dia pode ficar guardado.
export function newTuesday(f, keepHistory = true) {
  if (keepHistory && f.session?.history.length) {
    f.archive.unshift({ at: f.session.startedAt, players: f.players.length, games: f.session.history });
    if (f.archive.length > 30) f.archive.length = 30;
  }
  f.players = [];
  f.session = null;
  f.undo = [];
}

// Ninguém pode sumir nem aparecer duas vezes. Usada pelos testes e como última barreira na tela.
export function integrity(f) {
  const present = new Set(presentPlayers(f).map((p) => p.id));
  const s = f.session;
  if (!s) return { ok: true, missing: [], duplicated: [], unknown: [] };
  const all = [...s.teams.A, ...s.teams.B, ...s.queue];
  const seen = new Set();
  const duplicated = [];
  for (const id of all) {
    if (seen.has(id)) duplicated.push(id);
    seen.add(id);
  }
  const missing = [...present].filter((id) => !seen.has(id));
  const unknown = [...seen].filter((id) => !present.has(id));
  return { ok: !duplicated.length && !missing.length && !unknown.length, missing, duplicated, unknown };
}
