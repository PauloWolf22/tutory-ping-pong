// Motor do campeonato: regras puras, sem DOM nem rede. Toda função recebe e altera o documento `t`.
// É o único lugar que muda jogadores, sorteio, chave e resultados — por isso os testes cobrem este arquivo.

export class UserError extends Error {}
const fail = (message) => { throw new UserError(message); };

export const SCHEMA = 1;
export const PLAYED = new Set(['live', 'paused', 'done', 'wo']);
export const STATUS_LABEL = {
  waiting: 'Aguardando', next: 'Próxima partida', live: 'Em andamento', paused: 'Pausada', done: 'Finalizada',
  postponed: 'Adiada', wo: 'WO', bye: 'BYE',
};
const IN_PLAY = new Set(['live', 'paused']);

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
    // thirdPlace: os perdedores das semifinais disputam o 3º lugar. consolation: repescagem dos eliminados na 1ª rodada.
    settings: { oddMode: 'byes', sound: true, thirdPlace: true, consolation: false },
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

// Categoria da pessoa: no masculino e no feminino vale a da competição; no misto, informada na inscrição.
const GENDER_NAME = { m: "masculino", f: "feminino" };
function genderFor(t, gender, name) {
  const g = gender === "m" || gender === "f" ? gender : null;
  const cat = t.category;
  if (cat === "m" || cat === "f") {
    if (g && g !== cat) fail(`${name || "Esta pessoa"} é do ${GENDER_NAME[g]}: esta competição é do ${GENDER_NAME[cat]}.`);
    return cat;
  }
  return g;
}

export function addPlayer(t, data, avatar = null) {
  if (!canChangeRoster(t)) fail('As inscrições fecham quando o sorteio começa. Refaça o sorteio para alterar a lista.');
  const number = Number(data.number) || nextPlayerNumber(t);
  assertPlayerUnique(t, { ...data, number });
  const gender = genderFor(t, data.gender, clean(data.name));
  const player = {
    id: uid('p'), name: clean(data.name), nick: clean(data.nick), number,
    seed: null, avatar, createdAt: Date.now(),
  };
  if (gender) player.gender = gender;
  if (data.userId) player.userId = data.userId;
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
  if (data.gender !== undefined && (data.gender || null) !== (p.gender || null)) {
    if (!canChangeRoster(t)) fail("A categoria só muda antes do sorteio.");
    const g = genderFor(t, data.gender, p.name);
    if (g) p.gender = g; else delete p.gender;
  }
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

// Importação: uma pessoa por linha, com apelido opcional depois de ";" ou " - " e categoria opcional no fim: (M) ou (F).
export function importPlayers(t, text, avatarFor = () => null) {
  const added = [], skipped = [];
  for (const raw of String(text).split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const g = raw.match(/\s*\((m|f)\)\s*$/i);
    const line = g ? raw.slice(0, g.index) : raw;
    const [name, nick = ''] = line.split(/\s*[;\t]\s*|\s+-\s+/);
    try {
      const gender = g ? g[1].toLowerCase() : (t.category === 'm' || t.category === 'f' ? t.category : undefined);
      added.push(addPlayer(t, { name, nick, gender }, avatarFor(name, gender)));
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
  t.bracket = { size, players: n, oddMode, rounds: rounds.map(({ index, name, short, matches: ids }) => ({ index, name, short, matches: ids })), extra: [], createdAt: Date.now() };
  t.matches = matches;
  t.nextMatchId = null;
  buildExtras(t, slots);
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
  for (const m of orderedMatches(t)) if (!m.bye) m.number = number++;
}

const blankMatch = (id, extra) => ({
  id, round: extra.round, index: extra.index, stage: extra.stage, p: [null, null], status: 'waiting', games: [], live: [0, 0], manual: null,
  winner: null, loser: null, wo: false, bye: false, number: 0, startedAt: null, endedAt: null, next: extra.next || null,
});

// Partidas fora da árvore principal (a árvore continua igual, para a chave desenhada não mudar):
//  - disputa de 3º lugar: os dois perdedores das semifinais;
//  - repescagem: os perdedores de cada partida real da 1ª rodada, numa chave de consolação própria.
// Cada uma entra em t.bracket.extra com `after` = rodada principal depois da qual ela é jogada.
function buildExtras(t, slots) {
  const main = t.bracket.rounds, L = main.length, n = t.bracket.players;
  if (t.settings.thirdPlace && L >= 2 && n >= 4) {
    t.bracket.extra.push({ key: 'third', kind: 'third', name: 'Disputa de 3º lugar', short: '3º LUGAR', after: L - 2, matches: ['t3'] });
    t.matches.t3 = blankMatch('t3', { round: 0, index: 0, stage: 'third' });
    main[L - 2].matches.forEach((id, i) => { t.matches[id].loserNext = { id: 't3', slot: i }; });
  }
  // com só semifinal e final, quem perde na 1ª rodada já disputa o 3º lugar: não há repescagem
  if (!t.settings.consolation || L < 3) return;
  const real0 = main[0].matches.filter((id, i) => slots[i * 2] !== 'BYE' && slots[i * 2 + 1] !== 'BYE');
  if (real0.length < 2) return;
  const S = nextPow2(real0.length), R = Math.log2(S);
  const names = (r) => (r === R - 1 ? ['Final da repescagem', 'REP · FINAL'] : r === R - 2 ? ['Semifinal da repescagem', 'REP · SEMI'] : [`Repescagem · ${r + 1}ª rodada`, `REP · ${r + 1}ª`]);
  for (let r = 0; r < R; r++) {
    const key = 'cons-' + r;
    const ids = [];
    for (let i = 0; i < S >> (r + 1); i++) {
      const id = `c${r}-${i}`;
      ids.push(id);
      t.matches[id] = blankMatch(id, { round: r, index: i, stage: key, next: r < R - 1 ? { id: `c${r + 1}-${i >> 1}`, slot: i & 1 } : null });
    }
    const [name, short] = names(r);
    t.bracket.extra.push({ key, kind: 'consolation', name, short, after: Math.min(r, L - 2), matches: ids });
  }
  // cada partida da 1ª rodada manda o perdedor para uma vaga; as vagas vazias viram BYE, nunca BYE contra BYE
  const filled = new Set();
  real0.forEach((id, j) => {
    const pos = j < S / 2 ? 2 * j : 2 * (j - S / 2) + 1;
    filled.add(pos);
    t.matches[id].loserNext = { id: `c0-${pos >> 1}`, slot: pos & 1 };
  });
  for (let i = 0; i < S / 2; i++) {
    if (filled.has(2 * i) && filled.has(2 * i + 1)) continue;
    Object.assign(t.matches[`c0-${i}`], { bye: true, status: 'bye' });
  }
}

export const extraRound = (t, key) => t.bracket?.extra?.find((e) => e.key === key) || null;
// Fase de uma partida (nome e sigla), da árvore principal ou das extras.
export const roundOf = (t, m) => (m.stage ? extraRound(t, m.stage) : t.bracket.rounds[m.round]);

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
  m.log = [];
  m.lastPoint = null;
}

const hasResult = (m) => !!(m.winner || m.games.length || m.manual || IN_PLAY.has(m.status) || m.live[0] || m.live[1]);

// Coloca alguém numa vaga de outra partida. Se o ocupante mudou, o que dependia dele é refeito em cascata.
function setSlot(t, ref, incoming) {
  const nx = t.matches[ref.id];
  if (!nx || nx.p[ref.slot] === incoming) return;
  nx.p[ref.slot] = incoming;
  if (nx.bye) {
    // vaga sem adversário (repescagem): quem chega avança sozinho
    nx.winner = nx.p[0] || nx.p[1] || null;
    propagate(t, nx);
    return;
  }
  if (hasResult(nx)) {
    clearResult(nx);
    audit(t, 'correction', `Jogo ${nx.number} foi reiniciado porque um participante mudou.`);
  }
  if (t.nextMatchId === nx.id) t.nextMatchId = null;
  propagate(t, nx);
}

// Vencedor segue na chave; perdedor vai para o 3º lugar ou para a repescagem, quando houver.
function propagate(t, m) {
  if (m.next) setSlot(t, m.next, m.winner || null);
  if (m.loserNext) setSlot(t, m.loserNext, m.bye ? null : m.loser || null);
}

// Partidas já disputadas que seriam reiniciadas se o vencedor desta mudasse (simulado numa cópia).
export function correctionImpact(t, id, newWinnerSide) {
  const m = getMatch(t, id);
  const newWinner = newWinnerSide == null ? null : m.p[newWinnerSide];
  if (m.winner === newWinner) return [];
  const c = structuredClone(t);
  const cm = c.matches[id];
  if (newWinner == null) clearResult(cm);
  else { cm.winner = newWinner; cm.loser = cm.p[1 - newWinnerSide]; }
  propagate(c, cm);
  return orderedMatches(t).filter((x) => x.id !== id && hasResult(x) && !hasResult(c.matches[x.id]));
}

// ------------------------------------------------------------------ formato de cada confronto
// Cada partida pode ter a própria regra (melhor de 1, 3 ou 5, pontos, vantagem); sem ela, vale a do campeonato.
export const scoringOf = (t, m) => (m && m.scoring) || t.scoring;

export function setMatchScoring(t, id, s) {
  const m = getMatch(t, id);
  if (isFinished(m) || hasResult(m)) fail('O formato só muda antes do primeiro ponto. Remova o resultado para mudar.');
  if (!s) { delete m.scoring; audit(t, 'scoring', `Jogo ${m.number}: volta à pontuação do campeonato.`); return; }
  const next = { bestOf: Number(s.bestOf), points: Number(s.points), winBy: Number(s.winBy), cap: Number(s.cap) || 0 };
  if (![1, 3, 5, 7].includes(next.bestOf)) fail('Melhor de 1, 3, 5 ou 7 games.');
  if (!Number.isInteger(next.points) || next.points < 1 || next.points > 99) fail('Pontos por game entre 1 e 99.');
  if (![1, 2, 3].includes(next.winBy)) fail('Vantagem mínima de 1, 2 ou 3 pontos.');
  if (next.cap && next.cap < next.points) fail('O limite de pontos não pode ser menor que os pontos do game.');
  m.scoring = next;
  audit(t, 'scoring', `Jogo ${m.number}: ${scoringDescription(next)}.`);
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
  conclude(t, m, validateGames(games, scoringOf(t, m)), { games, manual: null, wo: false });
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
  if (m.status === 'paused') fail('A partida está pausada. Use "Retomar".');
  m.status = 'live';
  m.startedAt = m.startedAt || Date.now();
  if (!Array.isArray(m.log)) m.log = [];
  if (t.nextMatchId === id) t.nextMatchId = null;
}

// Pausa (atendimento, intervalo, problema na mesa): o placar fica como está e ninguém marca ponto até retomar.
export function pauseMatch(t, id) {
  const m = getMatch(t, id);
  if (m.status !== 'live') fail('Só uma partida em andamento pode ser pausada.');
  m.status = 'paused';
  m.pausedAt = Date.now();
  (m.log ||= []).push({ kind: 'pause', at: m.pausedAt, score: [...m.live], game: m.games.length + 1 });
}

export function resumeMatch(t, id) {
  const m = getMatch(t, id);
  if (m.status !== 'paused') fail('A partida não está pausada.');
  m.status = 'live';
  m.pausedAt = null;
  (m.log ||= []).push({ kind: 'resume', at: Date.now(), score: [...m.live], game: m.games.length + 1 });
}

// Corrige o placar do game em andamento (ex.: um ponto marcado para o lado errado várias jogadas atrás).
export function correctLive(t, id, a, b) {
  const m = getMatch(t, id);
  if (!IN_PLAY.has(m.status)) fail('A partida não está em andamento.');
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) fail('Use apenas números inteiros no placar.');
  const s = scoringOf(t, m);
  if (pendingWinner(t, m) !== null) fail('A partida já está decidida. Desfaça o último ponto ou confirme o resultado.');
  const closes = gameIsOver(a, b, s);
  if (closes) validateGame(a, b, s); // valida antes de mexer: correção recusada não deixa rastro
  m.live = [a, b];
  (m.log ||= []).push({ kind: 'fix', at: Date.now(), score: [a, b], game: m.games.length + 1 });
  if (closes) {
    m.games.push([a, b]);
    m.live = [0, 0];
  }
  m.lastPoint = null;
  audit(t, 'correction', `Jogo ${m.number}: placar do game corrigido para ${a} x ${b}.`);
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
  if (m.status === 'paused') fail('A partida está pausada. Retome para marcar pontos.');
  if (m.status !== 'live') startMatch(t, id);
  if (pendingWinner(t, m) !== null) fail('A partida já está decidida. Confirme o resultado ou desfaça o último ponto.');
  m.live[side]++;
  m.lastPoint = { side, at: Date.now() };
  // histórico de pontuação: cada ponto com o placar que ficou (aparece na partida e no telão)
  (m.log ||= []).push({ kind: 'point', side, at: m.lastPoint.at, score: [...m.live], game: m.games.length + 1 });
  if (m.log.length > 400) m.log.splice(0, m.log.length - 400);
  if (gameIsOver(m.live[0], m.live[1], scoringOf(t, m))) {
    m.games.push([...m.live]);
    m.live = [0, 0];
  }
}

export function undoPoint(t, id) {
  const m = getMatch(t, id);
  if (m.status === 'paused') fail('A partida está pausada. Retome para desfazer pontos.');
  if (m.status !== 'live') fail('A partida não está em andamento.');
  const lastPointIdx = (m.log || []).map((e) => e.kind).lastIndexOf('point');
  if (lastPointIdx >= 0) m.log.splice(lastPointIdx, 1);
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
  const s = scoringOf(t, m);
  const wins = gameWins(m, s), need = gamesToWin(s);
  if (wins[0] >= need) return 0;
  if (wins[1] >= need) return 1;
  return null;
}

export function confirmLive(t, id) {
  const m = getMatch(t, id);
  if (m.status === 'paused') fail('A partida está pausada. Retome antes de confirmar.');
  const side = pendingWinner(t, m);
  if (side === null) fail('A partida ainda não tem um vencedor.');
  conclude(t, m, side, { games: m.games, manual: null, wo: false });
}

// Próxima partida: escolha do administrador ou a primeira pronta na ordem de jogo.
export function nextMatch(t) {
  if (t.nextMatchId && t.matches[t.nextMatchId]) return t.matches[t.nextMatchId];
  if (!t.bracket) return null;
  return orderedMatches(t).find((m) => isReady(m) && m.status === 'waiting') || null;
}

// Em quadra: em andamento ou pausada (o placar continua no ar).
export const liveMatches = (t) => orderedMatches(t).filter((m) => IN_PLAY.has(m.status));

// Ordem de jogo: rodadas da árvore principal, com a repescagem e o 3º lugar intercalados, e a final por último.
export function orderedMatches(t) {
  if (!t.bracket) return [];
  const main = t.bracket.rounds, L = main.length;
  const blocks = main.map((r, ri) => ({ key: ri === L - 1 ? 1e6 : ri * 2, ids: r.matches }));
  for (const e of t.bracket.extra || []) blocks.push({ key: e.after * 2 + 1 + (e.kind === 'third' ? 0.5 : 0), ids: e.matches });
  return blocks.sort((a, b) => a.key - b.key).flatMap((b) => b.ids.map((id) => t.matches[id]).filter(Boolean));
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

const playerOf = (t, id) => (id ? t.players.find((p) => p.id === id) || null : null);

export function champion(t) {
  const f = finalMatch(t);
  return f && f.winner ? playerOf(t, f.winner) : null;
}

export function viceChampion(t) {
  const f = finalMatch(t);
  return f && f.loser ? playerOf(t, f.loser) : null;
}

// 3º lugar: vencedor da disputa de 3º. Com 3 jogadores não há essa partida: o perdedor da única semifinal real é o 3º.
export function thirdPlace(t) {
  if (!t.bracket) return null;
  if (t.matches.t3) return playerOf(t, t.matches.t3.winner);
  const L = t.bracket.rounds.length;
  if (t.bracket.players !== 3 || L < 2) return null;
  const semi = t.bracket.rounds[L - 2].matches.map((id) => t.matches[id]).find((x) => !x.bye);
  return playerOf(t, semi?.loser);
}

export function fourthPlace(t) {
  return playerOf(t, t.matches?.t3?.loser);
}

export function consolationChampion(t) {
  const cons = (t.bracket?.extra || []).filter((e) => e.kind === 'consolation');
  if (!cons.length) return null;
  return playerOf(t, t.matches[cons[cons.length - 1].matches[0]]?.winner);
}

export function tournamentStatus(t) {
  if (champion(t) && realMatches(t).every(isFinished)) return { key: 'finished', label: 'Encerrado' };
  if (isLocked(t)) return { key: 'running', label: champion(t) ? 'Final decidida' : 'Em andamento' };
  if (t.draw.status === 'live') return { key: 'draw', label: 'Sorteio ao vivo' };
  if (t.draw.status === 'done') return { key: 'ready', label: 'Chave definida' };
  return { key: 'open', label: t.players.length ? 'Inscrições abertas' : 'Aguardando inscrições' };
}

// ------------------------------------------------------------------ jogador e estatísticas
export function playerStatus(t, id) {
  if (champion(t)?.id === id) return { key: 'champion', label: 'Campeão' };
  if (viceChampion(t)?.id === id) return { key: 'vice', label: 'Vice-campeão' };
  if (thirdPlace(t)?.id === id) return { key: 'third', label: '3º lugar' };
  if (fourthPlace(t)?.id === id) return { key: 'fourth', label: '4º lugar' };
  if (consolationChampion(t)?.id === id) return { key: 'cons', label: 'Campeão da repescagem' };
  const ms = orderedMatches(t).filter((m) => m.p.includes(id));
  if (ms.some((m) => IN_PLAY.has(m.status))) return { key: 'live', label: 'Em quadra' };
  // quem perdeu mas ainda tem jogo (3º lugar ou repescagem) continua na disputa
  if (ms.some((m) => !m.bye && !isFinished(m))) return { key: 'in', label: ms.some((m) => m.loser === id) ? (ms.some((m) => !isFinished(m) && m.stage === 'third') ? 'Disputa o 3º lugar' : 'Na repescagem') : 'Na disputa' };
  if (ms.some((m) => m.loser === id)) return { key: 'out', label: 'Eliminado' };
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
    const need = gamesToWin(scoringOf(t, m));
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
      if (r && !m.stage) r.furthest = Math.max(r.furthest, m.round);
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
    (b.status.key === 'third') - (a.status.key === 'third') ||
    (b.status.key === 'fourth') - (a.status.key === 'fourth') ||
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
    third: thirdPlace(t),
    fourth: fourthPlace(t),
    consolation: consolationChampion(t),
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

// 3º lugar e repescagem entram na chave quando ela é criada (fim do sorteio): mudam só antes disso.
export function setBracketOptions(t, { thirdPlace, consolation }) {
  if (t.bracket) fail('A chave já foi criada. Para mudar 3º lugar ou repescagem, refaça o sorteio antes das partidas.');
  if (thirdPlace !== undefined) t.settings.thirdPlace = !!thirdPlace;
  if (consolation !== undefined) t.settings.consolation = !!consolation;
  audit(t, 'settings', `Chave: 3º lugar ${t.settings.thirdPlace ? 'sim' : 'não'}, repescagem ${t.settings.consolation ? 'sim' : 'não'}.`);
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
    lines.push([m.number, roundOf(t, m).name, name(m.p[0]), name(m.p[1]), scoreText(t, m), name(m.winner), STATUS_LABEL[m.status], when(m.startedAt), when(m.endedAt)].map(q).join(';'));
  }
  return '﻿' + lines.join('\r\n');
}
