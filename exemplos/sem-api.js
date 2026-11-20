/* As páginas de exemplo sem a API: para as publicar num alojamento de ficheiros estáticos (GitHub Pages).
 *
 * Define aveiroSemApi(caminho), que responde aos pedidos das páginas "Onde estaciono em Aveiro?" e
 * "Visitar Aveiro com menos gente" a partir dos dados da semana medida, embutidos na página por
 * scripts/publicar_paginas.py. As regras são as de api/app/respostas.py; scripts/conferir_paginas.mjs
 * compara as duas, pedido a pedido. Com a API à mão, as páginas não usam este ficheiro.
 */
(function (global) {
  'use strict';
  const D = global.AVEIRO_DADOS || JSON.parse(document.getElementById('dados').textContent);

  // as mesmas constantes de api/app/respostas.py
  const HORAS_VISITA = [9, 10, 11, 12, 13, 14, 15, 16, 17];
  const LUGARES_MINIMOS = 2;
  const METROS_POR_MINUTO_A_PE = 75;
  const DESVIO_A_PE = 1.3;
  const FOLGA_ROTEIRO = 0.05;
  const MASCULINOS = ['Cais', 'Largo', 'Parque', 'Rossio', 'Fórum', 'Campus', 'Bairro', 'Beco'];

  const masculino = (nome) => MASCULINOS.some((m) => nome.startsWith(m));
  const em = (nome) => (masculino(nome) ? 'no ' : 'na ') + nome;
  const pelo = (nome) => (masculino(nome) ? 'pelo ' : 'pela ') + nome;
  const enumerar = (p) => (p.length === 1 ? p[0] : p.slice(0, -1).join(', ') + ' e ' + p[p.length - 1]);
  const arredondar = (x, casas) => Math.round(x * 10 ** casas) / 10 ** casas;
  // o round() do Python: um valor exatamente a meio vai para o inteiro par
  const inteiro = (v) => {
    const baixo = Math.floor(v);
    const resto = v - baixo;
    return resto > 0.5 ? baixo + 1 : resto < 0.5 ? baixo : baixo % 2 === 0 ? baixo : baixo + 1;
  };
  const metros = (lon1, lat1, lon2, lat2) => {
    const kx = 111320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
    return Math.hypot((lon1 - lon2) * kx, (lat1 - lat2) * 110540);
  };
  const aPe = (a, b) => Math.max(1, inteiro((metros(a.lon, a.lat, b.lon, b.lat) * DESVIO_A_PE) / METROS_POR_MINUTO_A_PE));

  function ondeEstacionar(q) {
    const [lon, lat] = q.get('destino').split(',').map(Number);
    const hora = Number(q.get('hora'));
    const dia = q.get('dia');
    const limite = Number(q.get('limite') || 3);
    const est = D.estacionamento[dia];
    const itens = est.postes
      .filter((p) => p.estado === 'ativo' && p.livres[hora] >= LUGARES_MINIMOS)
      .map((p) => ({ id: p.id, nome: p.nome, livres: p.livres[hora], lugares: p.lugares, a_pe_min: aPe({ lon, lat }, p), de_carro_min: null, lon: p.lon, lat: p.lat, x: p.x, y: p.y }))
      .sort((a, b) => a.a_pe_min - b.a_pe_min || b.livres - a.livres)
      .slice(0, limite);
    const quando = 'Às ' + hora + 'h de ' + D.dias_semana[dia];
    const base = { id: 'onde-estacionar', hora, cenario: 'normal', incidente: false, simulado: false, fonte: est.fonte.replace('real (', 'real (lugares livres, '), itens, dia, destino: { lon, lat } };
    if (!itens.length) {
      return { ...base, resposta: quando + ' não há parques monitorizados com lugares livres.', acao: { titulo: 'Sem lugares livres monitorizados', detalhe: 'Nenhum parque com ' + LUGARES_MINIMOS + ' ou mais lugares livres' } };
    }
    const t = itens[0];
    return {
      ...base,
      resposta: quando + ' há ' + t.livres + ' lugares livres ' + em(t.nome) + ', a ' + t.a_pe_min + ' min a pé do destino.',
      acao: { titulo: 'Estacionar ' + em(t.nome), detalhe: t.livres + ' lugares livres de ' + t.lugares + ', a ' + t.a_pe_min + ' min a pé' },
    };
  }

  /** Todas as ordens de uma lista, pela ordem em que o itertools.permutations do Python as dá. */
  function ordens(lista) {
    if (lista.length <= 1) return [lista];
    const out = [];
    lista.forEach((x, i) => ordens(lista.slice(0, i).concat(lista.slice(i + 1))).forEach((resto) => out.push([x].concat(resto))));
    return out;
  }

  function roteiroVisita(q) {
    const locais = q.get('locais').split(',');
    const dia = q.get('dia') || 'dias_uteis';
    const inicio = q.has('inicio') ? Number(q.get('inicio')) : null;
    const n = locais.length;
    const lugar = Object.fromEntries(D.locais.map((l) => [l.id, l]));
    const serie = Object.fromEntries(locais.map((l) => [l, D.turismo[dia][l]]));
    // a hora de pico: a de mais presenças; em empate, a mais cedo
    const picoHora = Object.fromEntries(locais.map((l) => [l, HORAS_VISITA.reduce((m, h) => (serie[l][h] > serie[l][m] ? h : m), HORAS_VISITA[0])]));
    const pico = Object.fromEntries(locais.map((l) => [l, serie[l][picoHora[l]] || 1]));
    const custo = (ordem, h0) => ordem.reduce((s, l, i) => s + serie[l][h0 + i] / pico[l], 0);
    const caminhada = (ordem) => ordem.slice(1).reduce((s, l, i) => s + aPe(lugar[ordem[i]], lugar[l]), 0);

    const inicios = inicio !== null ? [inicio] : HORAS_VISITA.filter((h) => h + n <= HORAS_VISITA[HORAS_VISITA.length - 1] + 1);
    const todas = ordens(locais);
    const hipoteses = [];
    inicios.forEach((h) => todas.forEach((o) => hipoteses.push({ c: custo(o, h), h, o })));
    const menor = Math.min(...hipoteses.map((p) => p.c));
    // entre as ordens quase tão boas como a melhor, fica a que obriga a andar menos
    let escolhida = null;
    let chave = null;
    hipoteses.filter((p) => p.c <= menor + FOLGA_ROTEIRO * n).forEach((p) => {
      const k = [caminhada(p.o), arredondar(p.c, 4), p.h];
      if (!chave || k[0] < chave[0] || (k[0] === chave[0] && (k[1] < chave[1] || (k[1] === chave[1] && k[2] < chave[2])))) {
        chave = k;
        escolhida = p;
      }
    });
    const { h: h0, o: ordem } = escolhida;
    const media = arredondar(custo(ordem, h0) / n, 3);
    const melhor = arredondar(menor / n, 3);
    const pior = arredondar(Math.max(...todas.map((o) => custo(o, h0))) / n, 3);
    const pedida = arredondar(custo(locais, h0) / n, 3);

    const itens = ordem.map((l, i) => {
      const v = serie[l][h0 + i];
      const racio = v / pico[l];
      return {
        id: l, nome: lugar[l].nome, hora: h0 + i, presencas: v, pico: pico[l], pico_hora: picoHora[l], do_pico: arredondar(racio, 2),
        nivel: racio <= 0.33 ? 'calmo' : racio <= 0.66 ? 'moderado' : 'cheio',
        a_pe_min: i ? aPe(lugar[ordem[i - 1]], lugar[l]) : 0,
        lon: lugar[l].lon, lat: lugar[l].lat, x: lugar[l].x, y: lugar[l].y,
      };
    });
    const paragens = itens.map((i) => i.nome + ' às ' + i.hora + 'h');
    const quando = { dias_uteis: 'Num dia útil', sabado: 'Ao sábado', domingo: 'Ao domingo' }[dia];
    const pct = (x) => inteiro(x * 100);
    let resposta = quando + ', ' + (inicio === null ? 'o melhor é começar' : 'a começar') + ' às ' + h0 + 'h: ' + enumerar(paragens) + '. ';
    resposta += media < pior
      ? 'Nesta ordem, cada local é visitado em média a ' + pct(media) + '% do seu pico; na pior ordem seria a ' + pct(pior) + '%.'
      : 'A estas horas a ordem não faz diferença: cada local é visitado em média a ' + pct(media) + '% do seu pico.';
    return {
      id: 'roteiro-visita', hora: h0, cenario: 'normal', incidente: false, simulado: false,
      fonte: dia === 'dias_uteis' ? D.fonte_dias_uteis : 'real (' + D.periodo[dia] + ')',
      resposta,
      acao: { titulo: 'Começar ' + pelo(itens[0].nome) + ' às ' + h0 + 'h', detalhe: 'Depois ' + enumerar(paragens.slice(1)) },
      itens,
      dia, inicio: h0, fim: h0 + n, inicio_escolhido: inicio === null,
      ocupacao_media: media, ocupacao_melhor: melhor, ocupacao_pior: pior, ocupacao_pedida: pedida, a_pe_min: caminhada(ordem),
      grelha: { horas: HORAS_VISITA, locais: ordem.map((l) => ({ id: l, nome: lugar[l].nome, pico_hora: picoHora[l], presencas: HORAS_VISITA.map((h) => serie[l][h]) })) },
    };
  }

  global.aveiroSemApi = async function (caminho) {
    const [rota, consulta] = caminho.split('?');
    const q = new URLSearchParams(consulta || '');
    if (rota === '/v1/rede/mapa') return D.mapa;
    if (rota === '/v1/turismo/locais') return D.locais;
    if (rota === '/v1/estacionamento') return D.estacionamento[q.get('dia')];
    if (rota === '/v1/respostas/onde-estacionar') return ondeEstacionar(q);
    if (rota === '/v1/respostas/roteiro-visita') return roteiroVisita(q);
    throw new Error('pedido que esta página não sabe responder sem a API: ' + rota);
  };
})(typeof window !== 'undefined' ? window : globalThis);
