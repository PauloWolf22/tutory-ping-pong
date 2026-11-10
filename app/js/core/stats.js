// Estatísticas por pessoa e por modalidade, e comparação entre duas pessoas. Regras puras: recebem os resultados
// aprovados (public.results) e as colocações (public.awards) e devolvem números. Nada de banco nem de tela aqui.
//
// Placar: "A x B" é sempre do ponto de vista de p1 (quem lançou o amistoso ou o lado 0 do campeonato).
// Em equipe (Counter-Strike), p1/p2 são os capitães e team1/team2 os times.

const SCORE = /^\s*(\d+)\s*x\s*(\d+)\s*$/i;

// Lado da pessoa no resultado: 0, 1 ou null (não jogou).
export function sideOf(r, uid) {
  if (r.p1 === uid || r.team1?.includes(uid)) return 0;
  if (r.p2 === uid || r.team2?.includes(uid)) return 1;
  return null;
}

const blank = () => ({
  played: 0, wins: 0, losses: 0, friendly: { w: 0, l: 0 }, championship: { w: 0, l: 0 }, wo: 0,
  scoreFor: 0, scoreAgainst: 0, scored: 0, methodsWon: {}, methodsLost: {},
  podiums: { campeao: 0, vice: 0, terceiro: 0 }, participations: 0, achievements: 0, teammates: {}, recent: [], winRate: 0,
});

export function personStats(results, awards, uid) {
  const by = {};
  const row = (m) => (by[m] ||= blank());
  const list = results.filter((r) => r.status === 'approved' && sideOf(r, uid) !== null)
    .sort((a, b) => String(b.played_on || b.created_at).localeCompare(String(a.played_on || a.created_at)));
  for (const r of list) {
    const side = sideOf(r, uid);
    const won = r.winner === (side === 0 ? r.p1 : r.p2);
    const x = row(r.modality);
    x.played++;
    x[won ? 'wins' : 'losses']++;
    x[r.kind === 'campeonato' ? 'championship' : 'friendly'][won ? 'w' : 'l']++;
    const wo = String(r.score || '').toUpperCase() === 'WO' || String(r.method || '').toUpperCase() === 'WO';
    if (wo) x.wo++;
    const m = SCORE.exec(r.score || '');
    if (m && !wo) {
      const [a, b] = [+m[1], +m[2]];
      x.scoreFor += side === 0 ? a : b;
      x.scoreAgainst += side === 0 ? b : a;
      x.scored++;
    }
    if (r.method && !wo) { const k = won ? 'methodsWon' : 'methodsLost'; x[k][r.method] = (x[k][r.method] || 0) + 1; }
    for (const id of (side === 0 ? r.team1 : r.team2) || []) if (id !== uid) x.teammates[id] = (x.teammates[id] || 0) + 1;
    if (x.recent.length < 5) x.recent.push({ id: r.id, won, score: r.score, opponent: side === 0 ? r.p2 : r.p1, kind: r.kind, on: r.played_on });
  }
  for (const a of awards.filter((x) => x.user_id === uid)) {
    const x = row(a.modality);
    if (a.place === 'participacao') x.participations++;
    else if (a.place === 'conquista') x.achievements++;
    else if (a.place in x.podiums) x.podiums[a.place]++;
  }
  let played = 0, wins = 0;
  for (const x of Object.values(by)) {
    x.winRate = x.played ? Math.round((x.wins / x.played) * 1000) / 10 : 0;
    played += x.played; wins += x.wins;
  }
  return { byModality: by, played, wins, losses: played - wins, winRate: played ? Math.round((wins / played) * 1000) / 10 : 0 };
}

// Confronto direto: resultados em que as duas pessoas estavam em lados opostos.
export function headToHead(results, a, b) {
  const list = results.filter((r) => r.status === 'approved').filter((r) => {
    const sa = sideOf(r, a), sb = sideOf(r, b);
    return sa !== null && sb !== null && sa !== sb;
  });
  const winsOf = (uid) => list.filter((r) => r.winner === (sideOf(r, uid) === 0 ? r.p1 : r.p2)).length;
  return { played: list.length, a: winsOf(a), b: winsOf(b), list };
}

// Comparação entre modalidades só em métrica normalizada: aproveitamento (%) e a nota 0-100 do ranking geral.
export function compare(statsA, statsB, mods) {
  const keys = mods.map((m) => m.id).filter((k) => statsA.byModality[k] || statsB.byModality[k]);
  return keys.map((k) => {
    const A = statsA.byModality[k], B = statsB.byModality[k];
    return { modality: k, name: mods.find((m) => m.id === k)?.name || k, a: A ? A.winRate : null, b: B ? B.winRate : null, aPlayed: A?.played || 0, bPlayed: B?.played || 0 };
  });
}
