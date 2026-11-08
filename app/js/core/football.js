// Football Team Draw: sorteio e rodízio do futebol de terça. Regras puras, independentes dos campeonatos.
//
// Modelo: dois times em campo e UMA fila, em ordem de chegada (FIFO). Quem perde vai para o fim da fila,
// na ordem do time; o próximo time são os 5 primeiros da fila. Os grupos exibidos são a fila cortada de 5 em 5.
// Isso garante a regra das filas incompletas sem caso especial: fila de 3 + 5 perdedores
// vira um grupo com os 3 + os 2 primeiros perdedores, e outro com os 3 perdedores restantes.
//
// Rodadas: cada jogo encerrado vira uma fotografia (quem jogou em cada time, resultado, hora e substituições).
// Fotografias nunca são reescritas: sorteio refeito, sessão reiniciada e nova terça preservam as anteriores.
// Desistência não é exclusão: o nome fica na lista, riscado, com o histórico intacto.
import { UserError, cryptoRandom, uid } from './engine.js';

export const TEAM_SIZE = 5;
export const MIN_PLAYERS = TEAM_SIZE * 2;
export const MAX_PLAYERS = 30;
const MAX_UNDO = 40;
const MAX_ARCHIVE = 30;
const MAX_LOG = 300;

const fail = (m) => { throw new UserError(m); };
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ');

export const newFinance = () => ({ pricePerHour: 0, hours: 0, payers: {}, log: [] });
export const newFootball = () => ({ players: [], session: null, undo: [], archive: [], visible: false, finance: newFinance() });

// Documentos salvos antes desta versão: histórico (mais recente primeiro) vira rodadas (mais antiga primeiro).
function normalizeSession(s) {
  if (!s) return;
  if (!s.rounds) s.rounds = (s.history || []).slice().reverse().map((h) => ({ ...h, legacy: true }));
  delete s.history;
  s.subs ||= [];
}

export function normalizeFootball(f) {
  f.finance = { ...newFinance(), ...(f.finance || {}) };
  normalizeSession(f.session);
  for (const u of f.undo || []) normalizeSession(u.session);
  for (const a of f.archive || []) a.games ||= [];
  return f;
}

export const playing = (p) => p.present && !p.quit;
export const presentPlayers = (f) => f.players.filter(playing);
export const nameOf = (f, id) => f.players.find((p) => p.id === id)?.name || '?';
const player = (f, id) => f.players.find((x) => x.id === id) || fail('Jogador não encontrado.');

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

export function teamOf(f, id) {
  const s = f.session;
  if (!s) return null;
  return s.teams.A.includes(id) ? 'A' : s.teams.B.includes(id) ? 'B' : null;
}

// Tira o jogador do rodízio. Vaga aberta em campo é preenchida pelo primeiro da fila, sem furar a ordem.
// Devolve a substituição feita em campo, se houve.
function leaveRotation(f, id, reason) {
  const s = f.session;
  if (!s) return null;
  s.queue = s.queue.filter((x) => x !== id);
  for (const k of ['A', 'B']) {
    const i = s.teams[k].indexOf(id);
    if (i < 0) continue;
    s.teams[k].splice(i, 1);
    const enters = s.queue.length ? s.queue.shift() : null;
    if (enters) s.teams[k].splice(i, 0, enters);
    const sub = { at: Date.now(), round: s.gameNo, team: k, out: id, outName: nameOf(f, id), in: enters, inName: enters ? nameOf(f, enters) : null, reason };
    s.subs.push(sub);
    return sub;
  }
  return null;
}

// ------------------------------------------------------------------ lista de chegada
export function addPlayer(f, rawName) {
  const name = clean(rawName);
  if (!name) fail('Digite o nome do jogador.');
  if (f.players.length >= MAX_PLAYERS) fail(`A lista vai até ${MAX_PLAYERS} jogadores.`);
  if (f.players.some((p) => norm(p.name) === norm(name))) fail(`${name} já está na lista.`);
  snapshot(f, `Adicionar ${name}`);
  const p = { id: uid('f'), name, present: true, quit: false, arrivedAt: Date.now() };
  f.players.push(p);
  // com o jogo rolando, quem chega entra no fim da fila
  if (f.session) f.session.queue.push(p.id);
  return p;
}

export function renamePlayer(f, id, rawName) {
  const name = clean(rawName);
  if (!name) fail('Digite o nome do jogador.');
  if (f.players.some((p) => p.id !== id && norm(p.name) === norm(name))) fail(`${name} já está na lista.`);
  const p = player(f, id);
  if (p.name === name) return;
  snapshot(f, `Renomear ${p.name}`);
  p.name = name;
}

// Exclusão de verdade, para nome digitado errado. Quem jogou deve ser marcado como desistente.
export function removePlayer(f, id) {
  const p = player(f, id);
  if (playedRounds(f, id) > 0) fail(`${p.name} já jogou hoje. Use "Essa pessoa não quer mais jogar" para manter o histórico.`);
  snapshot(f, `Remover ${p.name}`);
  leaveRotation(f, id, 'removido');
  f.players = f.players.filter((x) => x.id !== id);
  delete f.finance?.payers[id];
}

export function setPresent(f, id, present) {
  const p = player(f, id);
  if (p.present === present) return;
  snapshot(f, `${present ? 'Marcar presença de' : 'Marcar ausência de'} ${p.name}`);
  p.present = present;
  if (!f.session || p.quit) return;
  if (present) f.session.queue.push(id);
  else leaveRotation(f, id, 'ausente');
}

// "Essa pessoa não quer mais jogar": risca o nome, tira das filas e das próximas escalações e
// chama o primeiro da fila para a vaga. Partidas anteriores e o resultado em andamento não mudam.
export function withdraw(f, id) {
  const p = player(f, id);
  if (p.quit) fail(`${p.name} já está marcado como desistente.`);
  snapshot(f, `Desistência de ${p.name}`);
  p.quit = true;
  p.quitAt = Date.now();
  return leaveRotation(f, id, 'desistiu');
}

// Volta a jogar: entra no fim da fila, sem passar na frente de quem já esperava.
export function rejoin(f, id) {
  const p = player(f, id);
  if (!p.quit) fail(`${p.name} não está como desistente.`);
  snapshot(f, `${p.name} voltou a jogar`);
  p.quit = false;
  p.quitAt = null;
  if (f.session && p.present) f.session.queue.push(id);
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

// Os 10 primeiros presentes são sorteados entre os dois times; os demais esperam na ordem de chegada.
// Refazer o sorteio mantém as rodadas já jogadas.
export function startSession(f, random = cryptoRandom) {
  const present = presentPlayers(f);
  if (present.length < MIN_PLAYERS) fail(`O sorteio precisa de pelo menos ${MIN_PLAYERS} jogadores presentes. Agora são ${present.length}.`);
  const old = f.session;
  snapshot(f, old ? 'Refazer sorteio' : 'Sorteio');
  const first = shuffle(present.slice(0, MIN_PLAYERS).map((p) => p.id), random);
  f.session = {
    teams: { A: first.slice(0, TEAM_SIZE), B: first.slice(TEAM_SIZE) },
    queue: present.slice(MIN_PLAYERS).map((p) => p.id),
    gameNo: old?.gameNo || 1, last: null,
    rounds: old?.rounds || [], subs: old?.subs || [],
    draws: [...(old?.draws || []), Date.now()],
    startedAt: old?.startedAt || Date.now(), drawAt: Date.now(),
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
  if (!s.teams.A.length || !s.teams.B.length) fail('Um dos times está vazio. Adicione jogadores antes de registrar o resultado.');
  const loser = winner === 'A' ? 'B' : 'A';
  snapshot(f, `Rodada ${s.gameNo}: Time ${winner} venceu`);
  const at = Date.now();
  const teams = { A: [...s.teams.A], B: [...s.teams.B] };
  const out = s.teams[loser];
  s.queue.push(...out);
  const entering = s.queue.splice(0, TEAM_SIZE);
  s.teams[loser] = entering;
  const entry = {
    no: s.gameNo, winner, loser, at,
    teams, names: { A: teams.A.map((id) => nameOf(f, id)), B: teams.B.map((id) => nameOf(f, id)) },
    subs: s.subs.filter((x) => x.round === s.gameNo).map((x) => ({ ...x })),
    winners: teams[winner].map((id) => nameOf(f, id)),
    out: out.map((id) => nameOf(f, id)),
    entering: entering.map((id) => nameOf(f, id)),
    sameTeam: entering.length === out.length && entering.every((id, i) => id === out[i]),
  };
  s.rounds.push(entry);
  s.gameNo += 1;
  s.last = { winner, loser, at };
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

function archiveDay(f, reason) {
  const s = f.session;
  if (!s?.rounds.length) return;
  f.archive.unshift({
    at: s.startedAt, closedAt: Date.now(), reason,
    players: f.players.map((p) => ({ id: p.id, name: p.name, quit: !!p.quit })),
    games: s.rounds, subs: s.subs, finance: financeSummary(f),
  });
  if (f.archive.length > MAX_ARCHIVE) f.archive.length = MAX_ARCHIVE;
}

// Sessão nova: mantém a lista; as rodadas jogadas vão para o arquivo, nunca para o lixo.
export function resetSession(f) {
  snapshot(f, 'Reiniciar sessão');
  archiveDay(f, 'sessão reiniciada');
  f.session = null;
}

// Nova terça: lista vazia. O dia (rodadas, desistências e pagamentos) fica no arquivo.
export function newTuesday(f) {
  archiveDay(f, 'nova terça');
  f.players = [];
  f.session = null;
  f.undo = [];
  f.finance = { ...newFinance(), pricePerHour: f.finance?.pricePerHour || 0, hours: f.finance?.hours || 0 };
}

// Ninguém pode sumir nem aparecer duas vezes. Usada pelos testes e como última barreira na tela.
export function integrity(f) {
  const active = new Set(presentPlayers(f).map((p) => p.id));
  const s = f.session;
  if (!s) return { ok: true, missing: [], duplicated: [], unknown: [] };
  const all = [...s.teams.A, ...s.teams.B, ...s.queue];
  const seen = new Set();
  const duplicated = [];
  for (const id of all) {
    if (seen.has(id)) duplicated.push(id);
    seen.add(id);
  }
  const missing = [...active].filter((id) => !seen.has(id));
  const unknown = [...seen].filter((id) => !active.has(id));
  return { ok: !duplicated.length && !missing.length && !unknown.length, missing, duplicated, unknown };
}

// ------------------------------------------------------------------ estatísticas do dia
const roundsOf = (f) => (f.session?.rounds || []).filter((r) => r.teams);
export const playedRounds = (f, id) => roundsOf(f).filter((r) => r.teams.A.includes(id) || r.teams.B.includes(id)).length;

// Só a partir das rodadas registradas: nada estimado.
export function stats(f) {
  const rounds = roundsOf(f);
  const subs = f.session?.subs || [];
  return f.players.map((p, order) => {
    const row = { id: p.id, name: p.name, order, present: p.present, quit: !!p.quit, games: 0, wins: 0, losses: 0, teams: [], subIn: 0, subOut: 0 };
    for (const r of rounds) {
      const k = r.teams.A.includes(p.id) ? 'A' : r.teams.B.includes(p.id) ? 'B' : null;
      if (!k) continue;
      row.games++;
      if (r.winner === k) row.wins++; else row.losses++;
      row.teams.push({ round: r.no, team: k, won: r.winner === k });
    }
    for (const x of subs) { if (x.in === p.id) row.subIn++; if (x.out === p.id) row.subOut++; }
    row.state = p.quit ? 'desistiu' : !p.present ? 'ausente' : teamOf(f, p.id) ? 'em campo' : row.games ? 'na fila' : f.session ? 'ainda não jogou' : 'presente';
    return row;
  });
}

// ------------------------------------------------------------------ financeiro (sem integração bancária)
const cents = (v) => Math.round(Number(v) * 100);

export function setFinance(f, { pricePerHour, hours }) {
  const price = Number(pricePerHour), h = Number(hours);
  if (!Number.isFinite(price) || price < 0 || price > 100000) fail('Informe um preço por hora válido.');
  if (!Number.isFinite(h) || h < 0 || h > 24) fail('Informe a duração em horas (até 24).');
  const fin = f.finance;
  if (fin.pricePerHour === price && fin.hours === h) return;
  fin.log.push({ at: Date.now(), what: `Valor: R$ ${price.toFixed(2)}/h × ${h} h` });
  fin.pricePerHour = price;
  fin.hours = h;
  trimLog(fin);
}

// Quem entra no rateio: por padrão, quem está presente ou já jogou hoje.
export const inSplit = (f, p) => f.finance.payers[p.id]?.split ?? (p.present || playedRounds(f, p.id) > 0);

export function setSplit(f, id, on) {
  const p = player(f, id);
  const row = (f.finance.payers[id] ||= {});
  if (!on && row.paid) fail(`${p.name} já pagou. Desmarque o pagamento antes de tirar do rateio.`);
  row.split = !!on;
  f.finance.log.push({ at: Date.now(), what: `${p.name} ${on ? 'entrou no' : 'saiu do'} rateio` });
  trimLog(f.finance);
}

export function setPaid(f, id, paid) {
  const p = player(f, id);
  if (!inSplit(f, p)) fail(`${p.name} não está no rateio.`);
  const row = (f.finance.payers[id] ||= {});
  if (!!row.paid === !!paid) return;
  row.paid = !!paid;
  row.paidAt = paid ? Date.now() : null;
  f.finance.log.push({ at: Date.now(), what: `${p.name}: ${paid ? 'marcado como pago' : 'pagamento desmarcado'}` });
  trimLog(f.finance);
}

function trimLog(fin) { if (fin.log.length > MAX_LOG) fin.log.splice(0, fin.log.length - MAX_LOG); }

// Valores em centavos: a soma das cotas é sempre igual ao total (os centavos que sobram vão para os primeiros da lista).
export function financeSummary(f) {
  const fin = f.finance || newFinance();
  const total = cents(fin.pricePerHour * fin.hours);
  const list = f.players.filter((p) => inSplit(f, p));
  const n = list.length;
  const base = n ? Math.floor(total / n) : 0;
  let extra = n ? total - base * n : 0;
  const rows = list.map((p) => {
    const due = base + (extra-- > 0 ? 1 : 0);
    const paid = !!fin.payers[p.id]?.paid;
    return { id: p.id, name: p.name, due, paid, paidAt: fin.payers[p.id]?.paidAt || null, quit: !!p.quit };
  });
  const received = rows.filter((r) => r.paid).reduce((a, r) => a + r.due, 0);
  return { total, perPerson: n ? total / n : 0, count: n, rows, received, pending: total - received, paidCount: rows.filter((r) => r.paid).length, pendingCount: rows.filter((r) => !r.paid).length };
}
