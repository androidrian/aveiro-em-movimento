// Confere que as páginas publicadas sem API respondem o mesmo que a API, pedido a pedido.
// Uso, com a API a correr:  node scripts/conferir_paginas.mjs docs exemplos http://localhost:8000
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const [docs, exemplos, api] = process.argv.slice(2);
if (!docs || !exemplos || !api) {
  console.error('Uso: node scripts/conferir_paginas.mjs <pasta docs> <pasta exemplos> <endereço da API>');
  process.exit(2);
}

// os dados embutidos nas duas páginas, juntos
const dados = {};
for (const nome of ['estacionar', 'visitar']) {
  const pagina = fs.readFileSync(path.join(docs, nome, 'index.html'), 'utf8');
  const m = pagina.match(/<script id="dados" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'a página ' + nome + ' não traz os dados embutidos');
  Object.assign(dados, JSON.parse(m[1]));
  assert.ok(pagina.includes('aveiroSemApi = async function'), 'a página ' + nome + ' não traz o sem-api.js');
}
globalThis.AVEIRO_DADOS = dados;
vm.runInThisContext(fs.readFileSync(path.join(exemplos, 'sem-api.js'), 'utf8'));

const daApi = async (caminho) => {
  const r = await fetch(api + caminho);
  assert.equal(r.status, 200, caminho + ' → ' + r.status);
  return r.json();
};
const so = (o, chaves) => Object.fromEntries(chaves.map((k) => [k, o[k]]));
let pedidos = 0;
async function comparar(caminho, campos, deItem) {
  const [a, b] = await Promise.all([daApi(caminho), aveiroSemApi(caminho)]);
  pedidos++;
  try {
    assert.deepEqual(so(b, campos), so(a, campos));
    if (deItem) assert.deepEqual(b.itens.map((i) => so(i, deItem)), a.itens.map((i) => so(i, deItem)));
  } catch (e) {
    console.error('Diferença em ' + caminho);
    throw e;
  }
}

// sorteio repetível, para os pontos e as ordens ao acaso serem sempre os mesmos
let semente = 20261120;
const acaso = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);

// ---- dados de base
assert.deepEqual(so(await aveiroSemApi('/v1/rede/mapa'), ['viewBox', 'd', 'projecao']), so(await daApi('/v1/rede/mapa'), ['viewBox', 'd', 'projecao']));
assert.deepEqual(await aveiroSemApi('/v1/turismo/locais'), await daApi('/v1/turismo/locais'));
const DIAS = Object.keys(dados.dias_semana);
for (const dia of DIAS) assert.deepEqual(await aveiroSemApi('/v1/estacionamento?dia=' + dia), await daApi('/v1/estacionamento?dia=' + dia));

// ---- onde estacionar: os destinos da página e pontos ao acaso, em todos os dias e horas
const destinos = ['-8.65740,40.63810', '-8.65650,40.64120', '-8.65310,40.64160', '-8.63980,40.64330', '-8.65640,40.63120'];
for (let i = 0; i < 12; i++) destinos.push((-8.665 + acaso() * 0.03).toFixed(5) + ',' + (40.628 + acaso() * 0.018).toFixed(5));
for (const destino of destinos) {
  for (const dia of DIAS) {
    for (let hora = 0; hora < 24; hora++) {
      await comparar('/v1/respostas/onde-estacionar?destino=' + destino + '&dia=' + dia + '&hora=' + hora + '&cenario=normal&limite=3', ['resposta', 'acao', 'fonte', 'simulado'], ['id', 'nome', 'livres', 'lugares', 'a_pe_min', 'x', 'y']);
    }
  }
}
const estacionar = pedidos;

// ---- roteiro de visita: todos os conjuntos de locais, mais ordens ao acaso, em todos os dias e horas de começar
const LOCAIS = dados.locais.map((l) => l.id);
const conjuntos = [];
for (let mascara = 1; mascara < 1 << LOCAIS.length; mascara++) {
  const c = LOCAIS.filter((_, i) => mascara & (1 << i));
  if (c.length >= 2) conjuntos.push(c);
}
const baralhados = conjuntos.map((c) => c.map((l) => [acaso(), l]).sort((a, b) => a[0] - b[0]).map((x) => x[1]));
const CAMPOS = ['resposta', 'acao', 'fonte', 'simulado', 'inicio', 'fim', 'inicio_escolhido', 'ocupacao_media', 'ocupacao_melhor', 'ocupacao_pior', 'ocupacao_pedida', 'a_pe_min', 'grelha'];
const DO_ITEM = ['id', 'nome', 'hora', 'presencas', 'pico', 'pico_hora', 'do_pico', 'nivel', 'a_pe_min', 'x', 'y'];
for (const c of conjuntos.concat(baralhados)) {
  for (const dia of ['dias_uteis', 'sabado', 'domingo']) {
    const base = '/v1/respostas/roteiro-visita?locais=' + c.join(',') + '&dia=' + dia;
    await comparar(base + '&cenario=normal', CAMPOS, DO_ITEM);
    for (let inicio = 9; inicio + c.length <= 18; inicio++) await comparar(base + '&inicio=' + inicio + '&cenario=normal', CAMPOS, DO_ITEM);
  }
}
console.log('Igual à API em ' + pedidos + ' pedidos (' + estacionar + ' de estacionamento, ' + (pedidos - estacionar) + ' de roteiros).');
