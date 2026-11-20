// Planeamento de rotas da Ria Express (lógica da transportadora, não da API).
// A API dá os tempos de percurso entre pontos, por hora e cenário; aqui decide-se a ordem das entregas.

export const horaDe = (t) => Math.min(23, Math.max(0, Math.floor(t / 60)));

/** T(t, i, j): minutos de i para j, saindo ao minuto t do dia. `matrizes` = { hora: matriz }. */
export function criarT(matrizes) {
  const horas = Object.keys(matrizes).map(Number).sort((a, b) => a - b);
  return (t, i, j) => {
    let h = horaDe(t);
    if (!matrizes[h]) h = h < horas[0] ? horas[0] : horas[horas.length - 1];
    return matrizes[h][i][j];
  };
}

const atraso = (t, k, partida, prazos) => {
  const p = prazos[k];
  return p && t > partida + p ? t - (partida + p) : 0;
};

/**
 * Melhor ordem de visita (programação dinâmica sobre subconjuntos), a partir do armazém (índice 0).
 * Custo = tempo total + penalização por cada entrega fora do prazo.
 * `sel`: índices dos pontos a visitar (1..n). Devolve a rota já percorrida (ver `percorrer`).
 * A meio da rota, `origem` é o ponto onde a carrinha está e `agora` o minuto em que sai de lá;
 * os prazos continuam a contar desde a `partida` do armazém.
 */
export function planear(T, partida, sel, prazos, servico, origem = 0, agora = partida) {
  const n = sel.length;
  if (!n) return percorrer(T, partida, [], prazos, servico, origem, agora);
  const full = 1 << n;
  const custo = new Float64Array(full * n).fill(Infinity);
  const tm = new Float64Array(full * n);
  const ant = new Int8Array(full * n).fill(-1);
  for (let a = 0; a < n; a++) {
    const t = agora + T(agora, origem, sel[a]);
    const lt = atraso(t, sel[a], partida, prazos);
    const x = (1 << a) * n + a;
    tm[x] = t + servico;
    custo[x] = t + servico - agora + 5 * lt + (lt > 0 ? 20 : 0);
  }
  for (let mask = 1; mask < full; mask++) {
    for (let a = 0; a < n; a++) {
      const x = mask * n + a;
      const c = custo[x];
      if (!((mask >> a) & 1) || c === Infinity) continue;
      const t = tm[x];
      for (let b = 0; b < n; b++) {
        if ((mask >> b) & 1) continue;
        const ta = t + T(t, sel[a], sel[b]);
        const lt = atraso(ta, sel[b], partida, prazos);
        const nc = c + ta + servico - t + 5 * lt + (lt > 0 ? 20 : 0);
        const y = (mask | (1 << b)) * n + b;
        if (nc < custo[y]) {
          custo[y] = nc;
          tm[y] = ta + servico;
          ant[y] = a;
        }
      }
    }
  }
  let melhor = -1;
  let mc = Infinity;
  for (let a = 0; a < n; a++) {
    const x = (full - 1) * n + a;
    const c = custo[x] + T(tm[x], sel[a], 0);
    if (c < mc) {
      mc = c;
      melhor = a;
    }
  }
  const ordem = [];
  for (let mask = full - 1, a = melhor; a >= 0; ) {
    ordem.push(sel[a]);
    const p = ant[mask * n + a];
    mask &= ~(1 << a);
    a = p;
  }
  ordem.reverse();
  return percorrer(T, partida, ordem, prazos, servico, origem, agora);
}

/**
 * Percorre uma ordem dada e devolve horas de chegada, atrasos e os troços a pedir à API.
 * Começa em `origem` ao minuto `agora` (por omissão, no armazém à hora da partida) e acaba no armazém.
 */
export function percorrer(T, partida, ordem, prazos, servico, origem = 0, agora = partida) {
  let t = agora;
  let cur = origem;
  let conduzir = 0;
  let nAtrasos = 0;
  const paragens = [];
  const trocos = [];
  ordem.forEach((k) => {
    const dt = T(t, cur, k);
    trocos.push({ de: cur, para: k, hora: horaDe(t) });
    conduzir += dt;
    t += dt;
    const lt = atraso(t, k, partida, prazos);
    if (lt > 0) nAtrasos++;
    paragens.push({ k, chegada: t, saida: t + servico, atraso: lt > 0 ? Math.max(1, Math.round(lt)) : 0 });
    t += servico;
    cur = k;
  });
  const dt = T(t, cur, 0);
  trocos.push({ de: cur, para: 0, hora: horaDe(t) });
  conduzir += dt;
  t += dt;
  return { ordem, paragens, trocos, fim: t, total: t - agora, conduzir, servico, nAtrasos };
}
