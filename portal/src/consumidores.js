// Os quatro consumidores do palco. Cada um pergunta à API o que precisa, com a sua chave,
// e devolve a ação para o sinal, os factos que a sustentam e o que quer destacar no mapa.
import { CHAVES } from './api.js';
import { fmt, hc, hm } from './formato.js';
// A Ria Express usa o seu próprio planeador e os seus próprios dados: o portal não os copia.
import { PONTOS, PRAZOS, SERVICO } from '../../transportadora/src/dados.js';
import { criarT, planear } from '../../transportadora/src/planeador.js';

export const ROSSIO = { nome: 'Rossio', lon: -8.6565, lat: 40.6412 };
export const ESTACAO = { nome: 'Estação de Comboios', lon: -8.6398, lat: 40.6433 };
const ZONA_COMERCIO = '25-abril';
const par = (p) => p.lon + ',' + p.lat;
const virgula = (x, casas = 1) => fmt(x, casas);
// Os factos são números com formato (e não texto feito), para o cartão os poder fazer rolar até ao valor novo.
const facto = (n, rotulo, formato = fmt) => ({ n, rotulo, formato });
const emHoras = (x) => Math.round(x) + 'h';
const emMinutos = (x) => fmt(x) + ' min';
const emMinutosDecimais = (x) => virgula(x) + ' min';
const emKm = (x) => virgula(x) + ' km';

async function camara(cliente, { hora, versao }) {
  const caminho = '/v1/respostas/onde-intervir?hora=' + hora;
  const { corpo: r, ms } = await cliente.medir(caminho, versao);
  const t = r.itens[0];
  return {
    pergunta: r.pergunta,
    titulo: r.acao.titulo,
    detalhe: r.acao.detalhe,
    simulado: r.simulado,
    factos: [facto(t.peoes_hora, 'peões por hora'), facto(t.veiculos_hora, 'veículos por hora'), facto(r.ruas_lentas, 'ruas lentas na cidade')],
    pedido: 'GET ' + caminho,
    consola: caminho,
    ms,
    mapa: { prioridades: r.itens },
  };
}

async function riaExpress(cliente, { hora, tempo, cen, versao }) {
  // a transportadora pode sair à meia hora; os tempos de percurso pedem-se por hora
  const partida = Math.round(tempo * 60);
  const termino = partida + 150;
  const sel = PONTOS.map((_, i) => i).slice(1);
  const lista = encodeURIComponent(PONTOS.map(par).join(';'));
  const horas = [];
  for (let h = hora; h <= Math.min(23, hora + 5); h++) horas.push(h);
  const eNormal = cen.cenario === 'normal' && !cen.incidente;
  // em vigor: sem parâmetro de cenário (tempo real); referência: dia normal sem incidente
  const tempos = (h, emVigor) => cliente.medir('/v1/rede/tempos-percurso?pontos=' + lista + '&hora=' + h + (emVigor ? '' : '&cenario=normal&incidente=false'), emVigor ? versao : '');
  const percurso = (t, emVigor) =>
    cliente.get('/v1/rede/percurso?de=' + par(PONTOS[t.de]) + '&para=' + par(PONTOS[t.para]) + '&hora=' + t.hora + (emVigor ? '' : '&cenario=normal&incidente=false'), emVigor ? versao : '');

  const respostas = await Promise.all(horas.map((h) => tempos(h, true)));
  const base = eNormal ? respostas : await Promise.all(horas.map((h) => tempos(h, false)));
  const T = criarT(Object.fromEntries(horas.map((h, i) => [h, respostas[i].corpo.minutos])));
  const TN = criarT(Object.fromEntries(horas.map((h, i) => [h, base[i].corpo.minutos])));
  const P = planear(T, partida, sel, PRAZOS, SERVICO[cen.cenario]);
  const B = eNormal ? P : planear(TN, partida, sel, PRAZOS, SERVICO.normal);
  const trocos = await Promise.all(P.trocos.map((t) => percurso(t, true)));

  let km = 0;
  let naAvenida = 0;
  const rota = [];
  trocos.forEach((g) => {
    km += g.metros / 1000;
    g.ruas.forEach((r) => {
      rota.push({ d: r.d, nivel: r.nivel });
      if (r.na_rua_do_incidente) naAvenida += r.metros;
    });
  });
  // metros que a rota de um dia normal faria pela rua do incidente, para dizer se a nova a contorna
  let naAvenidaAntes = 0;
  if (cen.incidente) {
    const antes = await Promise.all(B.trocos.map((t) => percurso(t, false)));
    antes.forEach((g) => g.ruas.forEach((r) => { if (r.na_rua_do_incidente) naAvenidaAntes += r.metros; }));
  }

  const comPrazo = P.paragens.filter((s) => PRAZOS[s.k]);
  const cumpridas = comPrazo.filter((s) => !s.atraso && s.saida <= termino + 0.01).length;
  const delta = Math.round(P.total) - Math.round(B.total);
  const prazos = cumpridas + ' de ' + comPrazo.length + ' prazos';
  const mudouOrdem = P.ordem.join() !== B.ordem.join();
  const face = (delta >= 0 ? '+' : '−') + Math.abs(delta) + ' min face ao dia normal';
  let titulo;
  let detalhe;
  if (eNormal) {
    titulo = sel.length + ' entregas em ' + hm(P.total);
    detalhe = 'Saída às ' + hc(partida) + ', ' + prazos + ' cumpridos, regresso às ' + hc(P.fim);
  } else if (cen.incidente && naAvenidaAntes >= 1 && naAvenida < naAvenidaAntes) {
    // a rota nova faz menos metros (ou nenhum) pela avenida do incidente
    titulo = (naAvenida < 1 ? 'Contornar a' : 'Desviar da') + ' Av. de Santa Joana';
    detalhe = 'Rota refeita em ' + hm(P.total) + ' (' + face + '), ' + prazos + ' cumpridos';
  } else {
    titulo = (mudouOrdem ? 'Mudar a ordem das entregas: ' : 'Contar com ') + hm(P.total);
    detalhe = face + ', ' + prazos + ' cumpridos, regresso às ' + hc(P.fim);
  }
  const pontos = respostas[0].corpo.pontos;
  return {
    pergunta: 'Por que ordem fazer as ' + sel.length + ' entregas das ' + hc(partida) + '?',
    titulo,
    detalhe,
    simulado: !eNormal,
    factos: [facto(P.total, 'tempo total da rota', hm), facto(km, 'percorridos', emKm), facto(cumpridas, 'prazos cumpridos', (x) => Math.round(x) + ' de ' + comPrazo.length)],
    pedido: 'GET /v1/rede/tempos-percurso?pontos=…&hora=' + hora,
    consola: '/v1/rede/tempos-percurso?pontos=' + PONTOS.slice(0, 3).map(par).join(';') + '&hora=' + hora,
    ms: respostas[0].ms,
    mapa: { rota, paragens: P.paragens.map((s, i) => ({ n: i + 1, x: pontos[s.k].x, y: pontos[s.k].y })), armazem: { x: pontos[0].x, y: pontos[0].y } },
  };
}

async function comercio(cliente, { hora, versao }) {
  const caminho = '/v1/respostas/melhor-hora?zona=' + ZONA_COMERCIO + '&para=montra&hora=' + hora;
  const [{ corpo: r, ms }, cargas] = await Promise.all([cliente.medir(caminho, versao), cliente.get('/v1/respostas/melhor-hora?zona=' + ZONA_COMERCIO + '&para=cargas&hora=' + hora, versao)]);
  const naHoraDasCargas = cargas.itens.find((i) => i.hora === cargas.hora_recomendada);
  const media = r.evidencia.find((e) => e.indicador.startsWith('Média'));
  return {
    pergunta: 'Quando passa mais gente à porta?',
    titulo: r.acao.titulo,
    detalhe: r.acao.detalhe,
    simulado: r.simulado,
    factos: [facto(r.agora, 'pessoas por hora, agora'), facto(r.pico_hora, 'pico do dia (' + fmt(r.pico_valor) + ')', emHoras), facto(media.valor, 'média das 7h às 21h')],
    // a segunda indicação, como no cartão dos cidadãos: os dois sinais da linha ficam com a mesma altura
    extra: { titulo: cargas.acao.titulo, detalhe: fmt(naHoraDasCargas.peoes_hora) + ' peões e ' + fmt(naHoraDasCargas.veiculos_hora) + ' veículos por hora', simulado: cargas.simulado },
    pedido: 'GET ' + caminho,
    consola: caminho,
    ms,
    mapa: { zona: ZONA_COMERCIO },
  };
}

async function cidadaos(cliente, { hora, versao }) {
  const caminho = '/v1/respostas/onde-estacionar?destino=' + par(ROSSIO) + '&origem=' + par(ESTACAO) + '&hora=' + hora;
  const [{ corpo: r, ms }, v] = await Promise.all([cliente.medir(caminho, versao), cliente.get('/v1/respostas/quando-visitar?local=rossio&hora=' + hora, versao)]);
  const t = r.itens[0];
  const caminhoDeCarro = t ? await cliente.get('/v1/rede/percurso?de=' + par(ESTACAO) + '&para=' + par(t) + '&hora=' + hora, versao) : null;
  return {
    pergunta: 'Vou de carro ao Rossio: onde deixo o carro?',
    titulo: r.acao.titulo,
    detalhe: t ? fmt(t.livres) + ' lugares livres de ' + fmt(t.lugares) + ', a ' + t.a_pe_min + ' min a pé do Rossio' : r.acao.detalhe,
    simulado: r.simulado,
    factos: t ? [facto(t.livres, 'lugares livres'), facto(t.a_pe_min, 'a pé até ao Rossio', emMinutos), facto(t.de_carro_min, 'de carro desde a Estação', emMinutosDecimais)] : [],
    extra: { titulo: v.acao.titulo, detalhe: fmt(v.agora) + ' presenças por hora, pico às ' + v.hora_pico + 'h', simulado: v.simulado },
    pedido: 'GET /v1/respostas/onde-estacionar?destino=…&hora=' + hora,
    consola: caminho,
    ms,
    mapa: { parque: t, alternativas: r.itens.slice(1), local: v.local, caminho: caminhoDeCarro ? caminhoDeCarro.ruas.map((x) => x.d) : [] },
  };
}

export const CONSUMIDORES = [
  { id: 'camara', entidade: 'Câmara Municipal', perfil: 'município', chave: CHAVES.camara, icone: 'passadeira', app: { href: './painel/', texto: 'Abrir o painel' }, carregar: camara },
  { id: 'ria', entidade: 'Ria Express', perfil: 'logística, empresa fictícia', chave: CHAVES.ria, icone: 'carrinha', app: { href: './transportadora/', texto: 'Abrir o planeador' }, carregar: riaExpress },
  { id: 'comercio', entidade: 'Comércio da Av. 25 de Abril', perfil: 'comércio', chave: CHAVES.comercio, icone: 'loja', carregar: comercio },
  { id: 'cidadaos', entidade: 'Cidadãos e visitantes', perfil: 'aplicação de cidadãos', chave: CHAVES.cidadaos, icone: 'estacionamento', carregar: cidadaos },
];
