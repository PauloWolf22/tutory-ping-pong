// Motor do campeonato: regras puras, sem DOM nem rede. Toda função recebe e altera o documento `t`.
// É o único lugar que muda jogadores, sorteio, chave e resultados — por isso os testes cobrem este arquivo.

export class UserError extends Error {}
const fail = (message) => { throw new UserError(message); };

export const SCHEMA = 1;
export const PLAYED = new Set(['live', 'done', 'wo']);
export const STATUS_LABEL = {
  waiting: 'Aguardando', next: 'Próxima partida', live: 'Em andamento', done: 'Finalizada',
  postponed: 'Adiada', wo: 'WO', bye: 'BYE',
};

export const uid = (prefix = 'id') => {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return prefix + '_' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

export const cryptoRandom = (n) => {
  // índice uniforme em [0, n) sem viés de módulo
  const limit = Math.floor(0x100000000 / n) * n;
  const b = new Uint32Array(1);
  do crypto.getRandomValues(b); while (b[0] >= limit);
  return b[0] % n;
};

export function newTournament() {
  return {
    schema: SCHEMA,
    meta: { name: 'Campeonato de Ping Pong', edition: '1ª edição', logo: null },
    regulation: {
      date: '', time: '', location: '', modality: 'Simples', system: 'Eliminatória simples (mata-mata)',
      scoringText: '', tiebreak: 'Não há empate. Em caso de 10 x 10, o game segue até um jogador abrir dois pontos de diferença.',
      wo: 'Jogador ausente após 10 minutos do horário chamado perde por WO.',
      maxTime: '30 minutos por partida', conduct: 'Respeito ao adversário e à arbitragem. Vale a palavra do administrador.',
      prizes: '', notes: '', custom: [], log: [],
    },
    scoring: { bestOf: 3, points: 11, winBy: 2, cap: 0 },
    settings: { oddMode: 'byes', sound: true },
    players: [],
    draw: { status: 'idle', mode: 'auto', slots: [], order: [], cursor: 0, size: 0, last: null, history: [] },
    bracket: null,
    matches: {},
    nextMatchId: null,
    display: { mode: 'home', matchId: null, at: 0 },
    audit: [],
  };
}

export function audit(t, type, message) {
  t.audit.unshift({ at: Date.now(), type, message });
  if (t.audit.length > 500) t.audit.length = 500;
}

// ------------------------------------------------------------------ participantes
const normalize = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ');

export const eligiblePlayers = (t) => t.players.filter((p) => !p.absent);
export const nextPlayerNumber = (t) => t.players.reduce((m, p) => Math.max(m, p.number || 0), 0) + 1;

function assertPlayerUnique(t, data, ignoreId) {
  if (!clean(data.name)) fail('Informe o nome do participante.');
  for (const p of t.players) {
    if (p.id === ignoreId) continue;
    if (normalize(p.name) === normalize(data.name)) fail(`"${p.name}" já está inscrito.`);
    if (data.number && p.number === data.number) fail(`O número ${data.number} já é de ${p.name}.`);
  }
}

export function canChangeRoster(t) {
  return t.draw.status === 'idle';
}

export function addPlayer(t, data, avatar = null) {
  if (!canChangeRoster(t)) fail('As inscrições fecham quando o sorteio começa. Refaça o sorteio para alterar a lista.');
  const number = Number(data.number) || nextPlayerNumber(t);
  assertPlayerUnique(t, { ...data, number });
  const player = {
    id: uid('p'), name: clean(data.name), nick: clean(data.nick), number,
    seed: null, avatar, createdAt: Date.now(),
  };
  t.players.push(player);
  audit(t, 'player', `Inscrito: ${player.name}`);
  return player;
}

export function updatePlayer(t, id, data) {
  const p = t.players.find((x) => x.id === id) || fail('Participante não encontrado.');
  const number = data.number === undefined ? p.number : Number(data.number) || p.number;
  const name = data.name === undefined ? p.name : data.name;
  assertPlayerUnique(t, { name, number }, id);
  p.name = clean(name);
  p.number = number;
  if (data.nick !== undefined) p.nick = clean(data.nick);
  if (data.avatar !== undefined) p.avatar = data.avatar;
  if (data.absent !== undefined) {
    if (!canChangeRoster(t)) fail('A seleção de participantes fecha quando o sorteio começa.');
    p.absent = !!data.absent;
  }
  if (data.seed !== undefined) {
    if (!canChangeRoster(t)) fail('Cabeças de chave só mudam antes do sorteio.');
    p.seed = data.seed;
  }
  return p;
}

export function removePlayer(t, id) {
  if (!canChangeRoster(t)) fail('As inscrições fecham quando o sorteio começa. Refaça o sorteio para alterar a lista.');
  const p = t.players.find((x) => x.id === id) || fail('Participante não encontrado.');
  t.players = t.players.filter((x) => x.id !== id);
  audit(t, 'player', `Removido: ${p.name}`);
}

// Importação: uma pessoa por linha, com apelido opcional depois de ";" ou " - ".
export function importPlayers(t, text, avatarFor = () => null) {
  const added = [], skipped = [];
  for (const raw of String(text).split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const [name, nick = ''] = raw.split(/\s*[;\t]\s*|\s+-\s+/);
    try {
      added.push(addPlayer(t, { name, nick }, avatarFor(name)));
    } catch (e) {
      if (!(e instanceof UserError)) throw e;
      skipped.push({ line: raw.trim(), reason: e.message });
    }
  }
  return { added, skipped };
}

// ------------------------------------------------------------------ estrutura da chave
export const nextPow2 = (n) => { let s = 1; while (s < n) s *= 2; return s; };

// Ordem padrão de chaveamento: 1 e 2 só se encontram na final. Ex. 8 → [1,8,4,5,2,7,3,6]
export function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    order = order.flatMap((s) => [s, sum - s]);
  }
  return order;
}

export function byeCount(n) { return nextPow2(n) - n; }

const NAMES = { 2: 'Final', 4: 'Semifinal', 8: 'Quartas de final', 16: 'Oitavas de final', 32: '16-avos de final', 64: '32-avos de final', 128: '64-avos de final' };
const SHORT = { 2: 'Final', 4: 'Semi', 8: 'Quartas', 16: 'Oitavas', 32: '16-avos', 64: '32-avos', 128: '64-avos' };

export function roundNames(n, oddMode) {
  const size = nextPow2(n);
  const names = [];
  for (let s = size, i = 0; s >= 2; s /= 2, i++) {
    const preliminary = i === 0 && oddMode === 'preliminary' && size !== n;
    names.push({
      index: i, slots: s,
      name: preliminary ? 'Rodada preliminar' : NAMES[s] || `Rodada de ${s}`,
      short: preliminary ? 'Preliminar' : SHORT[s] || `R${s}`,
    });
  }
  return names;
}

// Resumo para explicar ao administrador o que o sistema fará com esta quantidade de jogadores.
export function formatSummary(n, oddMode) {
  if (n < 2) return { size: 0, byes: 0, matches: 0, rounds: [], text: 'Inscreva pelo menos 2 participantes.' };
  const size = nextPow2(n), byes = size - n, rounds = roundNames(n, oddMode);
  let text;
  if (!byes) text = `${n} jogadores formam uma chave completa.`;
  else if (oddMode === 'preliminary') text = `${n - byes} jogadores disputam a rodada preliminar; ${byes} entram direto na ${rounds[1].name.toLowerCase()}.`;
  else text = `${byes} ${byes > 1 ? 'jogadores recebem' : 'jogador recebe'} BYE e ${byes > 1 ? 'avançam' : 'avança'} direto na primeira rodada.`;
  return { size, byes, matches: n - 1, rounds, text };
}

// ------------------------------------------------------------------ sorteio
export function isLocked(t) {
  return Object.values(t.matches).some((m) => !m.bye && (PLAYED.has(m.status) || m.games.length > 0 || m.manual));
}

function normalizedSeeds(players) {
  return players.filter((p) => p.seed).sort((a, b) => a.seed - b.seed || a.number - b.number);
}

export function startDraw(t, { mode = 'auto' } = {}) {
  const eligible = eligiblePlayers(t);
  if (eligible.length < 2) fail('Selecione pelo menos 2 participantes para sortear.');
  if (t.draw.status === 'live') fail('O sorteio já está em andamento.');
  if (isLocked(t)) fail('As partidas já começaram: o sorteio não pode mais ser refeito.');
  const n = eligible.length, size = nextPow2(n);
  const positions = seedOrder(size);
  const seeds = normalizedSeeds(eligible);
  const slots = positions.map((rank) => {
    if (rank > n) return 'BYE';
    if (rank <= seeds.length) return seeds[rank - 1].id;
    return null;
  });
  const order = [];
  slots.forEach((s, i) => { if (s === null) order.push(i); });
  t.draw = {
    ...t.draw, status: 'live', mode, size, slots, order, cursor: 0, last: null, startedAt: Date.now(),
    oddMode: t.settings.oddMode, finishedAt: null,
  };
  t.bracket = null;
  t.matches = {};
  t.nextMatchId = null;
  audit(t, 'draw', `Sorteio iniciado (${mode === 'auto' ? 'automático' : 'manual'}) com ${n} participantes.`);
  if (!order.length) finishDraw(t);
  return t.draw;
}

export function drawPool(t) {
  const placed = new Set(t.draw.slots);
  return eligiblePlayers(t).filter((p) => !placed.has(p.id));
}

// Sorteia (auto) ou posiciona (manual) o próximo jogador. `random(n)` é injetável para os testes.
export function drawNext(t, playerId = null, random = cryptoRandom) {
  const d = t.draw;
  if (d.status !== 'live') fail('Não há sorteio em andamento.');
  const pool = drawPool(t);
  if (!pool.length || d.cursor >= d.order.length) fail('Todos os participantes já foram sorteados.');
  const chosen = playerId ? pool.find((p) => p.id === playerId) : pool[random(pool.length)];
  if (!chosen) fail('Este participante já foi sorteado.');
  const slot = d.order[d.cursor];
  d.slots[slot] = chosen.id;
  d.cursor += 1;
  d.last = { slot, playerId: chosen.id, at: Date.now() };
  if (d.cursor >= d.order.length) finishDraw(t);
  return { slot, player: chosen };
}

// Sorteio manual: desfaz o último jogador posicionado.
export function undoDraw(t) {
  const d = t.draw;
  if (d.status !== 'live' || d.cursor === 0) fail('Não há sorteio para desfazer.');
  d.cursor -= 1;
  d.slots[d.order[d.cursor]] = null;
  d.last = null;
}

export function finishDraw(t) {
  const d = t.draw;
  d.status = 'done';
  d.finishedAt = Date.now();
  buildBracket(t, d.slots, d.oddMode || t.settings.oddMode);
  d.history.unshift({
    at: d.finishedAt, mode: d.mode,
    pairs: Object.values(t.matches).filter((m) => m.round === 0).map((m) => [m.p[0] || 'BYE', m.p[1] || 'BYE']),
  });
  if (d.history.length > 20) d.history.length = 20;
  audit(t, 'draw', 'Sorteio concluído e chave criada.');
}

export function resetDraw(t) {
  if (isLocked(t)) fail('As partidas já começaram: o sorteio não pode mais ser refeito.');
  t.draw = { ...t.draw, status: 'idle', slots: [], order: [], cursor: 0, size: 0, last: null };
  t.bracket = null;
  t.matches = {};
  t.nextMatchId = null;
  audit(t, 'draw', 'Sorteio desfeito; inscrições reabertas.');
}

export function buildBracket(t, slots, oddMode) {
  const size = slots.length;
  const n = slots.filter((s) => s !== 'BYE').length;
  const seen = new Set();
  for (const s of slots) {
    if (s === 'BYE') continue;
    if (!s) fail('Há posições sem jogador no sorteio.');
    if (seen.has(s)) fail('Um jogador apareceu duas vezes no sorteio.');
    seen.add(s);
  }
  const rounds = roundNames(n, oddMode);
  const matches = {};
  rounds.forEach((r) => { r.matches = []; });
  rounds.forEach((r, ri) => {
    const count = r.slots / 2;
    for (let i = 0; i < count; i++) {
      const id = `m${ri}-${i}`;
      r.matches.push(id);
      matches[id] = {
        id, round: ri, index: i, p: [null, null], status: 'waiting', games: [], live: [0, 0], manual: null,
        winner: null, loser: null, wo: false, bye: false, number: 0, startedAt: null, endedAt: null,
        next: ri < rounds.length - 1 ? { id: `m${ri + 1}-${Math.floor(i / 2)}`, slot: i % 2 } : null,
      };
    }
  });
  t.bracket = { size, players: n, oddMode, rounds: rounds.map(({ index, name, short, matches: ids }) => ({ index, name, short, matches: ids })), createdAt: Date.now() };
  t.matches = matches;
  t.nextMatchId = null;
  // primeira rodada: BYE avança sozinho, sem depender de resultado manual
  rounds[0].matches.forEach((id, i) => {
    const m = matches[id];
    const a = slots[i * 2], b = slots[i * 2 + 1];
    m.p = [a === 'BYE' ? null : a, b === 'BYE' ? null : b];
    if (a === 'BYE' || b === 'BYE') {
      m.bye = true;
      m.status = 'bye';
      m.winner = m.p[0] || m.p[1];
      propagate(t, m);
    }
  });
  let number = 1;
  for (const r of t.bracket.rounds) for (const id of r.matches) if (!matches[id].bye) matches[id].number = number++;
}

// ------------------------------------------------------------------ pontuação
export const gamesToWin = (s) => Math.floor(s.bestOf / 2) + 1;

// Devolve 0 ou 1 (lado vencedor) ou dispara erro com a explicação.
export function validateGame(a, b, s) {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) fail('Use apenas números inteiros no placar.');
  if (a === b) fail(`Um game não termina empatado (${a} x ${b}).`);
  const hi = Math.max(a, b), lo = Math.min(a, b), gap = hi - lo;
  if (hi < s.points) fail(`${a} x ${b}: o game vai até ${s.points} pontos.`);
  const capped = s.cap > 0 && hi === s.cap && lo >= s.cap - s.winBy;
  if (s.cap > 0 && hi > s.cap) fail(`${a} x ${b}: o limite é de ${s.cap} pontos.`);
  if (!capped) {
    if (hi === s.points && gap < s.winBy) fail(`${a} x ${b}: é preciso vencer por ${s.winBy} pontos de diferença.`);
    if (hi > s.points && gap !== s.winBy) fail(`${a} x ${b}: o game teria terminado antes.`);
  }
  return a > b ? 0 : 1;
}

export function gameIsOver(a, b, s) {
  const hi = Math.max(a, b), gap = Math.abs(a - b);
  if (s.cap > 0 && hi >= s.cap && gap >= 1) return true;
  return hi >= s.points && gap >= s.winBy;
}

export function validateGames(games, s) {
  const need = gamesToWin(s);
  const wins = [0, 0];
  if (!games.length) fail('Informe pelo menos um game.');
  games.forEach(([a, b], i) => {
    if (wins[0] === need || wins[1] === need) fail(`O game ${i + 1} sobra: a partida já estava decidida.`);
    wins[validateGame(a, b, s)]++;
  });
  if (wins[0] < need && wins[1] < need) fail(`Partida incompleta: é preciso vencer ${need} ${need > 1 ? 'games' : 'game'}.`);
  return wins[0] === need ? 0 : 1;
}

export const gameWins = (m, s) => {
  const wins = [0, 0];
  for (const [a, b] of m.games) wins[a > b ? 0 : 1]++;
  return wins;
};

// ------------------------------------------------------------------ partidas
export const getMatch = (t, id) => t.matches[id] || fail('Partida não encontrada.');
export const isReady = (m) => !!(m.p[0] && m.p[1]) && !m.bye;
export const isFinished = (m) => m.status === 'done' || m.status === 'wo' || m.status === 'bye';

function clearResult(m) {
  m.games = [];
  m.live = [0, 0];
  m.manual = null;
  m.winner = null;
  m.loser = null;
  m.wo = false;
  m.startedAt = null;
  m.endedAt = null;
  m.status = 'waiting';
}

// Sincroniza o vencedor com a partida seguinte. Se o ocupante mudou, tudo que dependia dele é refeito em cascata.
function propagate(t, m) {
  if (!m.next) return;
  const nx = t.matches[m.next.id];
  const incoming = m.winner || null;
  if (nx.p[m.next.slot] === incoming) return;
  nx.p[m.next.slot] = incoming;
  const hadResult = nx.winner || nx.games.length || nx.manual || nx.status === 'live' || nx.live[0] || nx.live[1];
  if (hadResult) {
    clearResult(nx);
    audit(t, 'correction', `Jogo ${nx.number} foi reiniciado porque um participante mudou.`);
  }
  if (t.nextMatchId === nx.id) t.nextMatchId = null;
  propagate(t, nx);
}

// Partidas já disputadas que seriam reiniciadas se o vencedor desta mudasse. Usado na confirmação de correção.
export function correctionImpact(t, id, newWinnerSide) {
  const m = getMatch(t, id);
  const newWinner = newWinnerSide == null ? null : m.p[newWinnerSide];
  if (m.winner === newWinner) return [];
  const out = [];
  let cur = m;
  while (cur.next) {
    const nx = t.matches[cur.next.id];
    if (nx.winner || nx.games.length || nx.manual || nx.status === 'live') out.push(nx);
    if (!nx.winner) break;
    cur = nx;
  }
  return out;
}

function conclude(t, m, side, patch) {
  if (!isReady(m)) fail('Esta partida ainda não tem os dois jogadores definidos.');
  const correcting = isFinished(m);
  Object.assign(m, patch);
  m.winner = m.p[side];
  m.loser = m.p[1 - side];
  m.status = patch.wo ? 'wo' : 'done';
  m.live = [0, 0];
  m.startedAt = m.startedAt || Date.now();
  m.endedAt = Date.now();
  if (t.nextMatchId === m.id) t.nextMatchId = null;
  propagate(t, m);
  const nameOf = (id) => t.players.find((p) => p.id === id)?.name || '?';
  audit(t, correcting ? 'correction' : 'result', `${correcting ? 'Correção' : 'Resultado'} jogo ${m.number}: ${nameOf(m.winner)} venceu ${nameOf(m.loser)} (${scoreText(t, m)}).`);
}

export function scoreText(t, m) {
  if (m.wo) return 'WO';
  if (m.manual) return `${m.manual[0]} x ${m.manual[1]}`;
  return m.games.map(([a, b]) => `${a}-${b}`).join(', ');
}

export function saveGames(t, id, games) {
  const m = getMatch(t, id);
  conclude(t, m, validateGames(games, t.scoring), { games, manual: null, wo: false });
}

export function saveManual(t, id, a, b) {
  const m = getMatch(t, id);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) fail('Use apenas números inteiros no placar.');
  if (a === b) fail('O placar final não pode ser empate: esta é uma fase eliminatória.');
  conclude(t, m, a > b ? 0 : 1, { manual: [a, b], games: [], wo: false });
}

export function saveWO(t, id, winnerSide) {
  const m = getMatch(t, id);
  conclude(t, m, winnerSide, { wo: true, games: [], manual: null });
}

export function revertResult(t, id) {
  const m = getMatch(t, id);
  if (m.bye) fail('Partidas com BYE não têm resultado para corrigir.');
  clearResult(m);
  if (t.nextMatchId === id) t.nextMatchId = null;
  propagate(t, m);
  audit(t, 'correction', `Resultado do jogo ${m.number} foi removido.`);
}

export function startMatch(t, id) {
  const m = getMatch(t, id);
  if (!isReady(m)) fail('Esta partida ainda não tem os dois jogadores definidos.');
  if (isFinished(m)) fail('Esta partida já terminou. Use a correção de resultado.');
  m.status = 'live';
  m.startedAt = m.startedAt || Date.now();
  if (t.nextMatchId === id) t.nextMatchId = null;
}

export function postponeMatch(t, id) {
  const m = getMatch(t, id);
  if (isFinished(m)) fail('Esta partida já terminou.');
  m.status = 'postponed';
  if (t.nextMatchId === id) t.nextMatchId = null;
}

export function setNextMatch(t, id) {
  const m = getMatch(t, id);
  if (!isReady(m) || isFinished(m)) fail('Só uma partida pronta pode ser a próxima.');
  if (m.status === 'postponed') m.status = 'waiting';
  t.nextMatchId = id;
}

// Marca um ponto. Quando o game fecha, ele entra em `games`; a partida só encerra na confirmação do administrador.
export function addPoint(t, id, side) {
  const m = getMatch(t, id);
  if (m.status !== 'live') startMatch(t, id);
  if (pendingWinner(t, m) !== null) fail('A partida já está decidida. Confirme o resultado ou desfaça o último ponto.');
  m.live[side]++;
  m.lastPoint = { side, at: Date.now() };
  if (gameIsOver(m.live[0], m.live[1], t.scoring)) {
    m.games.push([...m.live]);
    m.live = [0, 0];
  }
}

export function undoPoint(t, id) {
  const m = getMatch(t, id);
  if (m.status !== 'live') fail('A partida não está em andamento.');
  if (m.live[0] === 0 && m.live[1] === 0) {
    if (!m.games.length) fail('Não há pontos para desfazer.');
    m.live = m.games.pop();
    m.live[m.live[0] > m.live[1] ? 0 : 1]--;
  } else {
    const side = m.lastPoint && m.live[m.lastPoint.side] > 0 ? m.lastPoint.side : (m.live[0] >= m.live[1] ? 0 : 1);
    m.live[side]--;
  }
  m.lastPoint = null;
}

export function pendingWinner(t, m) {
  const wins = gameWins(m, t.scoring), need = gamesToWin(t.scoring);
  if (wins[0] >= need) return 0;
  if (wins[1] >= need) return 1;
  return null;
}

export function confirmLive(t, id) {
  const m = getMatch(t, id);
  const side = pendingWinner(t, m);
  if (side === null) fail('A partida ainda não tem um vencedor.');
  conclude(t, m, side, { games: m.games, manual: null, wo: false });
}

// Próxima partida: escolha do administrador ou a primeira pronta da rodada mais antiga.
export function nextMatch(t) {
  if (t.nextMatchId && t.matches[t.nextMatchId]) return t.matches[t.nextMatchId];
  if (!t.bracket) return null;
  for (const r of t.bracket.rounds) {
    for (const id of r.matches) {
      const m = t.matches[id];
      if (isReady(m) && m.status === 'waiting') return m;
    }
  }
  return null;
}

export const liveMatches = (t) => orderedMatches(t).filter((m) => m.status === 'live');

export function orderedMatches(t) {
  if (!t.bracket) return [];
  return t.bracket.rounds.flatMap((r) => r.matches.map((id) => t.matches[id]));
}

export function realMatches(t) { return orderedMatches(t).filter((m) => !m.bye); }

export function displayStatus(t, m) {
  if (m.status === 'waiting' && nextMatch(t)?.id === m.id) return 'next';
  return m.status;
}

export function lastResult(t) {
  return realMatches(t).filter((m) => m.endedAt && isFinished(m)).sort((a, b) => b.endedAt - a.endedAt)[0] || null;
}

export function finalMatch(t) {
  if (!t.bracket) return null;
  const r = t.bracket.rounds[t.bracket.rounds.length - 1];
  return t.matches[r.matches[0]];
}

export function champion(t) {
  const f = finalMatch(t);
  return f && f.winner ? t.players.find((p) => p.id === f.winner) || null : null;
}

export function viceChampion(t) {
  const f = finalMatch(t);
  return f && f.loser ? t.players.find((p) => p.id === f.loser) || null : null;
}

export function tournamentStatus(t) {
  if (champion(t)) return { key: 'finished', label: 'Encerrado' };
  if (isLocked(t)) return { key: 'running', label: 'Em andamento' };
  if (t.draw.status === 'live') return { key: 'draw', label: 'Sorteio ao vivo' };
  if (t.draw.status === 'done') return { key: 'ready', label: 'Chave definida' };
  return { key: 'open', label: t.players.length ? 'Inscrições abertas' : 'Aguardando inscrições' };
}

// ------------------------------------------------------------------ jogador e estatísticas
export function playerStatus(t, id) {
  if (champion(t)?.id === id) return { key: 'champion', label: 'Campeão' };
  if (viceChampion(t)?.id === id) return { key: 'vice', label: 'Vice-campeão' };
  const ms = orderedMatches(t).filter((m) => m.p.includes(id));
  if (ms.some((m) => m.loser === id)) return { key: 'out', label: 'Eliminado' };
  if (ms.some((m) => m.status === 'live')) return { key: 'live', label: 'Em quadra' };
  if (ms.length) return { key: 'in', label: 'Na disputa' };
  if (t.players.find((p) => p.id === id)?.absent) return { key: 'absent', label: 'Fora deste sorteio' };
  if (t.draw.status === 'live' && t.draw.slots.includes(id)) return { key: 'drawn', label: 'Sorteado' };
  if (t.draw.status === 'live') return { key: 'pool', label: 'Aguardando sorteio' };
  return { key: 'enrolled', label: 'Inscrito' };
}

export const playerMatches = (t, id) => orderedMatches(t).filter((m) => m.p.includes(id));

function matchTotals(t, m) {
  // totais do ponto de vista dos lados [0, 1]
  const out = { points: [0, 0], games: [0, 0], hasPoints: false };
  if (m.manual) {
    const need = gamesToWin(t.scoring);
    if (Math.max(...m.manual) <= need) out.games = [...m.manual];
    else { out.points = [...m.manual]; out.hasPoints = true; out.games = m.manual[0] > m.manual[1] ? [1, 0] : [0, 1]; }
    return out;
  }
  for (const [a, b] of m.games) {
    out.points[0] += a;
    out.points[1] += b;
    out.games[a > b ? 0 : 1]++;
    out.hasPoints = true;
  }
  return out;
}

export function computeStats(t) {
  const rows = new Map(t.players.map((p) => [p.id, {
    player: p, played: 0, wins: 0, losses: 0, wo: 0, byes: 0, gamesFor: 0, gamesAgainst: 0, pointsFor: 0, pointsAgainst: 0,
    bestMargin: 0, furthest: -1, alive: false, status: playerStatus(t, p.id),
  }]));
  const all = orderedMatches(t);
  const played = all.filter((m) => !m.bye && isFinished(m));
  let biggest = null;
  for (const m of all) {
    m.p.forEach((id) => {
      const r = rows.get(id);
      if (r) r.furthest = Math.max(r.furthest, m.round);
    });
    if (m.bye) {
      const r = rows.get(m.winner);
      if (r) r.byes++;
      continue;
    }
    if (!isFinished(m)) continue;
    const tot = matchTotals(t, m);
    m.p.forEach((id, side) => {
      const r = rows.get(id);
      if (!r) return;
      if (!m.wo) {
        r.played++;
        r.gamesFor += tot.games[side];
        r.gamesAgainst += tot.games[1 - side];
        r.pointsFor += tot.points[side];
        r.pointsAgainst += tot.points[1 - side];
      } else if (m.winner === id) r.wo++;
      if (m.winner === id) r.wins++;
      else r.losses++;
    });
    if (!m.wo && tot.hasPoints) {
      const side = m.winner === m.p[0] ? 0 : 1;
      const margin = tot.points[side] - tot.points[1 - side];
      const w = rows.get(m.winner);
      if (w) w.bestMargin = Math.max(w.bestMargin, margin);
      if (!biggest || margin > biggest.margin) biggest = { match: m, margin };
    }
  }
  const finalRound = t.bracket ? t.bracket.rounds.length - 1 : 0;
  const ranking = [...rows.values()].sort((a, b) =>
    (b.status.key === 'champion') - (a.status.key === 'champion') ||
    (b.status.key === 'vice') - (a.status.key === 'vice') ||
    b.furthest - a.furthest || b.wins - a.wins ||
    (b.gamesFor - b.gamesAgainst) - (a.gamesFor - a.gamesAgainst) ||
    (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst) ||
    b.pointsFor - a.pointsFor || a.player.number - b.player.number);
  const by = (fn) => ranking.filter((r) => fn(r) > 0).sort((a, b) => fn(b) - fn(a))[0] || null;
  const real = all.filter((m) => !m.bye);
  return {
    totalPlayers: t.players.length,
    totalMatches: t.players.length >= 2 ? (t.bracket ? real.length : t.players.length - 1) : 0,
    finished: played.length,
    pending: t.bracket ? real.length - played.length : Math.max(0, t.players.length - 1),
    ranking,
    mostWins: by((r) => r.wins),
    mostPoints: by((r) => r.pointsFor),
    biggestMargin: biggest,
    bestCampaign: by((r) => r.played ? (r.gamesFor - r.gamesAgainst) * 1000 + (r.pointsFor - r.pointsAgainst) + 1000000 * r.wins : 0),
    champion: champion(t),
    vice: viceChampion(t),
    finalRound,
  };
}

// ------------------------------------------------------------------ campeonato e regulamento
const REG_LABELS = {
  date: 'Data', time: 'Horário', location: 'Local', modality: 'Modalidade', system: 'Sistema de disputa', scoringText: 'Regras de pontuação',
  tiebreak: 'Critérios de desempate', wo: 'Regras de WO', maxTime: 'Tempo máximo por partida', conduct: 'Regras de conduta', prizes: 'Premiações', notes: 'Observações gerais',
};
export const REGULATION_FIELDS = REG_LABELS;

export function updateRegulation(t, patch) {
  const changed = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'custom') {
      if (JSON.stringify(t.regulation.custom) !== JSON.stringify(v)) changed.push('Regras personalizadas');
      t.regulation.custom = v;
    } else if (REG_LABELS[k] && t.regulation[k] !== v) {
      changed.push(REG_LABELS[k]);
      t.regulation[k] = v;
    }
  }
  if (changed.length) {
    t.regulation.log.unshift({ at: Date.now(), fields: changed });
    if (t.regulation.log.length > 100) t.regulation.log.length = 100;
    audit(t, 'regulation', `Regulamento alterado: ${changed.join(', ')}.`);
  }
  return changed;
}

export function updateScoring(t, patch) {
  const s = { ...t.scoring, ...patch };
  if (![1, 3, 5, 7].includes(s.bestOf)) fail('Escolha melhor de 1, 3, 5 ou 7 games.');
  if (!Number.isInteger(s.points) || s.points < 1 || s.points > 99) fail('Os pontos por game devem ficar entre 1 e 99.');
  if (!Number.isInteger(s.winBy) || s.winBy < 1 || s.winBy > 5) fail('A diferença mínima deve ficar entre 1 e 5.');
  if (!Number.isInteger(s.cap) || s.cap < 0 || (s.cap > 0 && s.cap <= s.points)) fail('O limite de pontos precisa ser maior que os pontos por game (ou 0 para sem limite).');
  if (Object.values(t.matches).some((m) => !m.bye && isFinished(m)) && JSON.stringify(s) !== JSON.stringify(t.scoring)) audit(t, 'regulation', 'Pontuação alterada com o campeonato em andamento; vale para os próximos registros.');
  t.scoring = s;
}

export function restartTournament(t) {
  t.draw = { status: 'idle', mode: 'auto', slots: [], order: [], cursor: 0, size: 0, last: null, history: t.draw.history };
  t.bracket = null;
  t.matches = {};
  t.nextMatchId = null;
  t.display = { mode: 'home', matchId: null, at: Date.now() };
  audit(t, 'reset', 'Campeonato reiniciado: resultados e chave apagados, participantes mantidos.');
}

export function setDisplay(t, mode, matchId = null) {
  t.display = { mode, matchId, at: Date.now() };
}

// Texto de pontuação gerado a partir da configuração, para o regulamento público.
export function scoringDescription(s) {
  const parts = [`Melhor de ${s.bestOf} ${s.bestOf > 1 ? 'games' : 'game'}`, `games de ${s.points} pontos`];
  parts.push(s.winBy > 1 ? `vitória com ${s.winBy} pontos de diferença` : 'sem vantagem');
  if (s.cap) parts.push(`limite de ${s.cap} pontos`);
  return parts.join(' · ');
}

// ------------------------------------------------------------------ exportação
export function toCSV(t) {
  const name = (id) => t.players.find((p) => p.id === id)?.name || (id ? '?' : '');
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Jogo', 'Fase', 'Jogador 1', 'Jogador 2', 'Placar', 'Vencedor', 'Status', 'Início', 'Fim'].map(q).join(';')];
  const when = (x) => (x ? new Date(x).toLocaleString('pt-BR') : '');
  for (const m of orderedMatches(t)) {
    if (m.bye) continue;
    lines.push([m.number, t.bracket.rounds[m.round].name, name(m.p[0]), name(m.p[1]), scoreText(t, m), name(m.winner), STATUS_LABEL[m.status], when(m.startedAt), when(m.endedAt)].map(q).join(';'));
  }
  return '﻿' + lines.join('\r\n');
}
