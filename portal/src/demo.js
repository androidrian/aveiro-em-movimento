// Demonstração automática: percorre o guião sozinha, para gravar o vídeo sem mãos.
// Cada passo diz ao fim de quantos segundos acontece e o que muda no palco.

const passo = (aos, legenda, mudancas) => ({ aos, legenda, ...mudancas });

// Das 08:30 às 13:00 de meia em meia hora, um passo a cada 0,55 s a partir dos 6 s.
const MANHA = Array.from({ length: 10 }, (_, i) => passo(6 + i * 0.55, i === 0 ? 'O dia avança. Ruas, passadeiras, parques e zonas turísticas mudam ao longo da manhã.' : null, { hora: 8.5 + i * 0.5 }));

export const GUIAO = [
  passo(0, 'São 8 da manhã de um dia útil em Aveiro. Tudo o que está no mapa foi medido pelos sensores da cidade.', { condicoes: ['normal', false], hora: 8, foco: 'todos' }),
  ...MANHA,
  passo(13,'A Câmara pergunta onde intervir. A API aponta a passadeira com mais peões, mais carros e mais velocidade.', { foco: 'camara' }),
  passo(20, 'A Ria Express pede tempos de percurso e ordena as suas 10 entregas.', { foco: 'ria' }),
  passo(27, 'O comércio fica a saber a que horas passa mais gente à porta.', { foco: 'comercio' }),
  passo(34, 'Quem vai ao Rossio de carro recebe o parque com lugares mais perto.', { foco: 'cidadaos' }),
  passo(41, 'Agora chove. A plataforma publica a mudança e a API avisa todos ao mesmo tempo.', { foco: 'todos', condicoes: ['chuva', false] }),
  passo(50, 'Um incidente na Av. de Santa Joana. A Ria Express recebe o aviso e refaz a rota com os novos tempos.', { condicoes: ['chuva', true], foco: 'ria' }),
  passo(59, 'A mesma API, quatro decisões diferentes. Os sinais amarelos assentam em simulação; os azuis, em dados medidos.', { foco: 'todos' }),
  passo(67, null, { condicoes: ['normal', false] }),
];
export const DURACAO = 70;

/**
 * Reproduz um guião. `acoes` = { hora(h), foco(id), publicar(cenario, incidente), legenda(texto), fim() }.
 * Devolve a função que pára a reprodução.
 */
export function reproduzir(guiao, acoes, duracao = DURACAO) {
  const marcados = guiao.map((p) =>
    setTimeout(() => {
      if (p.condicoes) acoes.publicar(...p.condicoes);
      if (p.hora != null) acoes.hora(p.hora);
      if (p.foco) acoes.foco(p.foco);
      if (p.legenda) acoes.legenda(p.legenda);
    }, p.aos * 1000),
  );
  marcados.push(setTimeout(acoes.fim, duracao * 1000));
  return () => marcados.forEach(clearTimeout);
}
