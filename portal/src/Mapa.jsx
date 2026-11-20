import React, { useEffect, useRef, useState } from 'react';
import { fmt } from './formato.js';
import { useSuave } from './suave.jsx';

// O que cada consumidor quer ver no mapa quando está em foco.
const CAMADAS = {
  todos: ['ruas', 'passadeiras', 'postes', 'locais', 'prioridades', 'parque'],
  camara: ['ruas', 'passadeiras', 'prioridades'],
  ria: ['ruas', 'rota', 'paragens'],
  comercio: ['passadeiras', 'zona'],
  cidadaos: ['postes', 'locais', 'parque', 'caminho'],
};
// Locais turísticos com rótulo: os do centro ficam a poucos metros uns dos outros e partilham um.
const ROTULOS_LOCAIS = { rossio: 'Rossio', 'lourenco-peixinho': 'Av. Lourenço Peixinho', ria: 'Ria de Aveiro', estacao: 'Estação' };
export const NIVEL = { fluido: 0, moderado: 1, lento: 2 };

const raioPassadeira = (peoes) => 2.2 + Math.sqrt(peoes || 0) / 5;
const raioLocal = (presencas) => 4 + Math.sqrt(presencas || 0) / 5;

/** A placa de um parque: o P e os lugares livres, que rolam até ao valor novo. */
function Poste({ poste, livres, escolhido }) {
  const ativo = poste.estado === 'ativo';
  const aRolar = useSuave(ativo ? livres : null);
  const texto = ativo ? String(Math.round(aRolar)) : '?';
  // a largura segue o valor final, para a placa não tremer enquanto o número rola
  const largura = 9 + (ativo ? String(livres).length : 1) * 5.4;
  return (
    <g className={'poste' + (ativo ? '' : ' parado')} transform={'translate(' + poste.x + ' ' + poste.y + ') scale(1.35)'}>
      <title>{poste.nome + (ativo ? ': ' + livres + ' lugares livres de ' + poste.lugares : ': sem dados recentes')}</title>
      {escolhido && <rect className="poste-escolhido" x="-11" y="-11" width={largura + 22} height="22" rx="6" />}
      <rect className="poste-livres" x="-1" y="-7" width={largura + 8} height="14" rx="3.5" />
      <rect className="poste-p" x="-7" y="-7" width="14" height="14" rx="3" />
      <text className="poste-letra" x="0" y="3.6" textAnchor="middle">P</text>
      <text className="poste-numero" x={largura / 2 + 6.5} y="3.4" textAnchor="middle">{texto}</text>
    </g>
  );
}

/**
 * A cidade a uma hora: ruas por fluidez, passadeiras por peões, parques por lugares livres,
 * locais turísticos por presenças, e o que os consumidores destacam (prioridades, rota, parque).
 */
export default function Mapa({ mapa, ruas, niveis, passadeiras, postes, locais, presencas, zonas, destaques, foco, hora, fracao = 0, incidente }) {
  const ve = (camada) => CAMADAS[foco].includes(camada);
  // lugares livres de um parque: os da hora, ou o ponto médio com a hora seguinte nas meias horas
  const livresDe = (p) => Math.round(p.livres[hora] + (p.livres[Math.min(23, hora + 1)] - p.livres[hora]) * fracao);
  const cls = (camada, extra = '') => 'camada ' + extra + (ve(camada) ? '' : ' apagada');
  const d = destaques;
  const prioridades = (d.camara && d.camara.prioridades) || [];
  const ordem = Object.fromEntries(prioridades.map((p, i) => [p.id, i + 1]));
  const rota = (d.ria && d.ria.rota) || [];
  const parque = d.cidadaos && d.cidadaos.parque;
  const caminho = (d.cidadaos && d.cidadaos.caminho) || [];
  const zona = d.comercio && zonas.find((z) => z.id === d.comercio.zona);
  const inc = mapa.incidente;

  // As ruas que acabaram de mudar de nível largam uma onda da cor nova, para se ver onde a cidade mudou.
  const niveisAntes = useRef(niveis);
  const [ondas, setOndas] = useState({ vez: 0, ruas: [] });
  useEffect(() => {
    const antes = niveisAntes.current;
    niveisAntes.current = niveis;
    if (antes === niveis) return;
    const mudaram = ruas.filter((r) => antes[r.id] != null && niveis[r.id] != null && antes[r.id] !== niveis[r.id]);
    setOndas((o) => (mudaram.length || o.ruas.length ? { vez: o.vez + 1, ruas: mudaram.map((r) => ({ id: r.id, d: r.d, nivel: niveis[r.id] })) } : o));
  }, [niveis, ruas]);

  return (
    <svg className="mapa-svg" viewBox={mapa.viewBox.join(' ')} role="img" aria-label={'Mapa do centro de Aveiro às ' + hora + ' horas: fluidez das ruas, passadeiras, estacionamento e locais turísticos'}>
      <path className="rede" d={mapa.d} />

      {/* uma rua por traço, sempre pela mesma ordem: é o que deixa a cor e a espessura mudarem sem salto */}
      <g className={cls('ruas')}>
        {ruas.map((r) => niveis[r.id] != null && <path key={r.id} className={'rua n' + niveis[r.id]} d={r.d} />)}
        <g key={ondas.vez}>
          {ondas.ruas.map((r) => (
            <path key={r.id} className={'onda n' + r.nivel} d={r.d} />
          ))}
        </g>
      </g>

      {incidente && <path className="incidente-faixa" d={inc.d} />}

      {ve('rota') && rota.length > 0 && (
        <g className="rota">
          <path className="rota-fundo" d={rota.map((r) => r.d).join(' ')} />
          <path className="rota-linha" d={rota.map((r) => r.d).join(' ')} />
        </g>
      )}

      {ve('caminho') && caminho.length > 0 && <path className="caminho" d={caminho.join(' ')} />}

      {zona && ve('zona') && (
        <g className="zona-foco">
          <circle cx={zona.localizacao.x} cy={zona.localizacao.y} r="46" />
          <text x={zona.localizacao.x} y={zona.localizacao.y - 52} textAnchor="middle">{zona.nome}</text>
        </g>
      )}

      <g className={cls('passadeiras')}>
        {passadeiras.map((p) => {
          const { x, y } = p.localizacao;
          const parada = p.estado_sensor !== 'ativo';
          return (
            <circle key={p.id} className={'passadeira' + (parada ? ' parada' : '')} cx={x} cy={y} r={parada ? 2.6 : raioPassadeira(p.peoes_hora)}>
              <title>{'Passadeira ' + p.id + ' · ' + p.rua + (parada ? ': sem dados recentes' : ': ' + fmt(p.peoes_hora) + ' peões por hora')}</title>
            </circle>
          );
        })}
      </g>

      {ve('prioridades') &&
        passadeiras
          .filter((p) => ordem[p.id])
          .map((p) => {
            const { x, y } = p.localizacao;
            const r = raioPassadeira(p.peoes_hora) + 4;
            return (
              <g key={p.id} className={'prioridade' + (ordem[p.id] === 1 ? ' primeira' : '')}>
                <circle cx={x} cy={y} r={r} />
                <text x={x + 3} y={y + 3.2} style={{ transform: 'translateX(' + r + 'px)' }}>{ordem[p.id]}</text>
              </g>
            );
          })}

      <g className={cls('postes')}>
        {postes.map((p) => (
          <Poste key={p.id} poste={p} livres={livresDe(p)} escolhido={Boolean(parque && parque.id === p.id && ve('parque'))} />
        ))}
      </g>

      {/* os locais turísticos ficam por cima dos parques: são anéis vazios e os rótulos têm de se ler */}
      <g className={cls('locais')}>
        {locais.map((l) => (
          <g key={l.id} className="local">
            <circle cx={l.x} cy={l.y} r={raioLocal(presencas[l.id])}>
              <title>{l.nome + ': ' + fmt(presencas[l.id]) + ' presenças por hora'}</title>
            </circle>
            {/* o rótulo acompanha o anel a deslizar e nunca desce até às placas dos parques ao lado */}
            {ROTULOS_LOCAIS[l.id] && (
              <text x={l.x} y={l.y - 6} textAnchor="middle" style={{ transform: 'translateY(' + -Math.max(raioLocal(presencas[l.id]), 10) + 'px)' }}>{ROTULOS_LOCAIS[l.id]}</text>
            )}
          </g>
        ))}
      </g>

      {ve('paragens') && d.ria && (
        <g className="paragens">
          <g transform={'translate(' + d.ria.armazem.x + ' ' + d.ria.armazem.y + ') scale(1.25)'}>
            <rect x="-7" y="-7" width="14" height="14" rx="3" />
            <path className="casa" d="M-4 0.5 L0 -3.5 L4 0.5 V4 H-4 Z" />
          </g>
          {d.ria.paragens.map((s) => (
            <g key={s.n} transform={'translate(' + s.x + ' ' + s.y + ') scale(1.25)'}>
              <circle r="6.5" />
              <text y="2.8" textAnchor="middle">{s.n}</text>
            </g>
          ))}
        </g>
      )}

      {incidente && (
        <g className="incidente-sinal" transform={'translate(' + inc.x + ' ' + inc.y + ')'}>
          <title>{'Incidente simulado na ' + inc.rua}</title>
          <path d="M0 -11 L11 8 H-11 Z" />
          <path className="exclamacao" d="M0 -4 V2.5 M0 5 V5.6" />
        </g>
      )}
    </svg>
  );
}
