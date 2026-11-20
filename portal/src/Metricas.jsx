import React, { useEffect, useState } from 'react';
import { H0, H1 } from './Controlos.jsx';
import { BarrasPorLocal, ColunasDoDia, LinhaDoDia } from './Grafico.jsx';
import { NIVEL } from './Mapa.jsx';
import { fmt, hh } from './formato.js';
import { Numero } from './suave.jsx';

const DIAS = [
  ['dias_uteis', 'Dias úteis'],
  ['sabado', 'Sábado'],
  ['domingo', 'Domingo'],
];
const pct = (x) => (x == null ? '—' : fmt(x * 100) + '%');
const segundos = (x) => (x == null ? '—' : fmt(x, 1) + ' s');
const emHoras = (x) => Math.round(x) + 'h';

/**
 * Um vertical: os números da hora escolhida, o gráfico do dia, a discriminação por local e os pedidos que o alimentam.
 * `numeros` = [{ rotulo, n, formato, antes }] (rolam até ao valor novo) ou [{ rotulo, texto }].
 */
function Vertical({ titulo, numeros, pedidos, aoVerResposta, children }) {
  return (
    <article className="vertical">
      <h3>{titulo}</h3>
      <dl className="numeros">
        {numeros.map((n) => (
          <div key={n.rotulo}>
            <dt>{n.rotulo}</dt>
            {n.texto ? <dd className="nome">{n.texto}</dd> : <dd><Numero valor={n.n} formato={n.formato} /></dd>}
            {n.antes != null && <dd className="antes">{n.antes} num dia normal</dd>}
          </div>
        ))}
      </dl>
      {children}
      <div className="vertical-pedidos">
        {pedidos.map((p) => (
          <button key={p} type="button" title="Ver a resposta completa na consola" onClick={() => aoVerResposta(p)}>
            <code>GET {p}</code>
          </button>
        ))}
      </div>
    </article>
  );
}

/**
 * O dashboard do serviço: as métricas dos quatro verticais para a cidade inteira,
 * à hora e nas condições escolhidas no palco. Com simulação em vigor, o dia normal fica como referência.
 */
export default function Metricas({ cliente, hora, tempo, cen, versao, aoMudarHora, aoVerResposta }) {
  const [dia, setDia] = useState('dias_uteis');
  const [d, setD] = useState(null);
  const chuva = cen.cenario === 'chuva';

  useEffect(() => {
    let atual = true;
    Promise.all([
      cliente.get('/v1/metricas?dia=' + dia, versao),
      chuva ? cliente.get('/v1/metricas?cenario=normal&dia=' + dia) : null,
      cliente.get('/v1/segmentos?hora=' + hora, versao),
      cliente.get('/v1/passadeiras?hora=' + hora, versao),
      cliente.get('/v1/estacionamento'),
    ])
      .then(([m, ref, seg, pas, est]) => atual && setD({ m, ref, seg, pas, est }))
      .catch(() => {});
    return () => {
      atual = false;
    };
  }, [cliente, hora, versao, dia, chuva]);

  if (!d) return null;
  const { m, ref, seg, pas, est } = d;
  const mob = m.mobilidade;
  const sr = m.seguranca;
  const park = m.estacionamento;
  const tur = m.turismo;
  const antes = (bloco, campo, formato = fmt) => (ref && ref[bloco][campo][hora] !== m[bloco][campo][hora] ? formato(ref[bloco][campo][hora]) : null);
  const nomeSerie = chuva ? 'dia de chuva, simulado' : '';

  // as ruas mais lentas agora: uma linha por rua, com trânsito suficiente para a medida contar
  const porRua = {};
  seg.segmentos.forEach((s) => {
    if (s.fluidez == null || s.veiculos_hora < 20) return;
    if (!porRua[s.rua] || s.fluidez < porRua[s.rua].fluidez) porRua[s.rua] = s;
  });
  const lentas = Object.values(porRua)
    .sort((a, b) => a.fluidez - b.fluidez)
    .slice(0, 5)
    .map((s) => ({ nome: s.rua, parte: s.fluidez, texto: pct(s.fluidez), classe: 'n' + NIVEL[s.nivel] }));

  const maisPeoes = pas
    .filter((p) => p.estado_sensor === 'ativo')
    .sort((a, b) => b.peoes_hora - a.peoes_hora)
    .slice(0, 5);
  const topoPeoes = maisPeoes.length ? maisPeoes[0].peoes_hora || 1 : 1;
  const passadeiras = maisPeoes.map((p) => ({ nome: p.rua + ' (' + p.id + ')', parte: p.peoes_hora / topoPeoes, texto: fmt(p.peoes_hora) }));

  const parques = est.postes
    .filter((p) => p.estado === 'ativo')
    .sort((a, b) => b.livres[hora] - a.livres[hora])
    .slice(0, 5)
    .map((p) => ({ nome: p.nome, parte: p.livres[hora] / p.lugares, texto: p.livres[hora] + ' de ' + p.lugares }));

  const locaisOrdenados = tur.locais.slice().sort((a, b) => b.presencas_hora[hora] - a.presencas_hora[hora]);
  const topoLocais = locaisOrdenados[0].presencas_hora[hora] || 1;
  const locais = locaisOrdenados.map((l) => ({ nome: l.nome, parte: l.presencas_hora[hora] / topoLocais, texto: fmt(l.presencas_hora[hora]) }));
  let pico = H0;
  for (let h = H0; h <= H1; h++) if (tur.presencas_hora[h] > tur.presencas_hora[pico]) pico = h;

  return (
    <section className="metricas" id="metricas" aria-labelledby="t-metricas">
      <div className="secao-topo com-hora">
        <div>
          <h2 id="t-metricas">As métricas do serviço</h2>
          <p>
            O dia inteiro nos quatro verticais, para a cidade toda, com um só pedido a <code>/v1/metricas</code>.
            {chuva ? ' Está em vigor o dia de chuva: a linha a tracejado é o dia normal, medido.' : ' Tudo medido pelos sensores nos dias úteis de 3 a 10 de novembro de 2026.'}
          </p>
        </div>
        <div className="hora-metricas">
          <label htmlFor="hora-metricas">
            Hora escolhida <b>{hh(hora)}</b>
          </label>
          <input id="hora-metricas" type="range" min={H0} max={H1} step="1" value={hora} onChange={(e) => aoMudarHora(Number(e.target.value))} />
        </div>
      </div>

      <div className="verticais-grelha">
        <Vertical
          titulo="Mobilidade"
          aoVerResposta={aoVerResposta}
          pedidos={['/v1/metricas', '/v1/segmentos?hora=' + hora]}
          numeros={[
            { rotulo: 'ruas lentas, de ' + mob.ruas_medidas + ' medidas', n: mob.ruas_lentas[hora], antes: antes('mobilidade', 'ruas_lentas') },
            { rotulo: 'fluidez média', n: mob.fluidez_media[hora], formato: pct, antes: antes('mobilidade', 'fluidez_media', pct) },
            { rotulo: 'veículos por hora', n: mob.veiculos_hora[hora], antes: antes('mobilidade', 'veiculos_hora') },
          ]}
        >
          <h4>Ruas moderadas e lentas, ao longo do dia</h4>
          <ColunasDoDia
            nome="Número de ruas moderadas e lentas em cada hora"
            hora={hora}
            aoEscolherHora={aoMudarHora}
            series={[
              { nome: 'moderadas', classe: 'n1', valores: mob.ruas_moderadas },
              { nome: 'lentas', classe: 'n2', valores: mob.ruas_lentas },
            ]}
          />
          <h4>As mais lentas às {hh(hora)}, em % da velocidade livre</h4>
          <BarrasPorLocal itens={lentas} />
        </Vertical>

        <Vertical
          titulo="Segurança rodoviária"
          aoVerResposta={aoVerResposta}
          pedidos={['/v1/metricas', '/v1/passadeiras?hora=' + hora + '&ordenar=peoes']}
          numeros={[
            { rotulo: 'travessias a pé por hora', n: sr.travessias_hora[hora], antes: antes('seguranca', 'travessias_hora') },
            { rotulo: 'espera média para atravessar', n: sr.espera_media_s[hora], formato: segundos },
            { rotulo: 'veículos acima do limite', n: sr.acima_limite[hora], formato: pct, antes: antes('seguranca', 'acima_limite', pct) },
          ]}
        >
          <h4>Travessias a pé nas {sr.passadeiras} passadeiras, por hora</h4>
          <LinhaDoDia nome="Travessias a pé por hora" serie={sr.travessias_hora} referencia={ref && ref.seguranca.travessias_hora} nomeSerie={nomeSerie} hora={hora} tempo={tempo} aoEscolherHora={aoMudarHora} />
          <h4>As passadeiras com mais peões às {hh(hora)}</h4>
          <BarrasPorLocal itens={passadeiras} />
        </Vertical>

        <Vertical
          titulo="Estacionamento"
          aoVerResposta={aoVerResposta}
          pedidos={['/v1/metricas', '/v1/estacionamento']}
          numeros={[
            { rotulo: 'lugares livres, de ' + park.lugares, n: park.livres[hora] },
            { rotulo: 'ocupação', n: park.ocupacao[hora], formato: pct },
            { rotulo: 'lugares sem informação', n: park.sem_informacao },
          ]}
        >
          <h4>Lugares livres na cidade, por hora</h4>
          <LinhaDoDia nome="Lugares de estacionamento livres por hora" serie={park.livres} hora={hora} tempo={tempo} aoEscolherHora={aoMudarHora} />
          <h4>Os parques com mais lugares livres às {hh(hora)}</h4>
          <BarrasPorLocal itens={parques} />
        </Vertical>

        <Vertical
          titulo="Turismo"
          aoVerResposta={aoVerResposta}
          pedidos={['/v1/metricas?dia=' + dia, '/v1/turismo/locais']}
          numeros={[
            { rotulo: 'presenças por hora', n: tur.presencas_hora[hora], antes: antes('turismo', 'presencas_hora') },
            { rotulo: 'local com mais gente', texto: locaisOrdenados[0].nome },
            { rotulo: 'hora de pico do dia', n: pico, formato: emHoras },
          ]}
        >
          <div className="titulo-com-escolha">
            <h4>Presenças nos {tur.locais.length} locais turísticos, por hora</h4>
            <div className="segmentos pequenos" role="group" aria-label="Dia da semana">
              {DIAS.map(([id, nome]) => (
                <button key={id} type="button" aria-pressed={dia === id} className={dia === id ? 'on' : ''} onClick={() => setDia(id)}>{nome}</button>
              ))}
            </div>
          </div>
          <LinhaDoDia nome="Presenças nos locais turísticos por hora" serie={tur.presencas_hora} referencia={ref && ref.turismo.presencas_hora} nomeSerie={nomeSerie} hora={hora} tempo={tempo} aoEscolherHora={aoMudarHora} />
          <h4>Presenças por local às {hh(hora)}</h4>
          <BarrasPorLocal itens={locais} />
        </Vertical>
      </div>
    </section>
  );
}
