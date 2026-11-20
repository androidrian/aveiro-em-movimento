import React from 'react';
import { fmt } from './formato.js';
import { Numero } from './suave.jsx';

const ICONES = {
  // faixas de passadeira
  passadeira: <path d="M4 20l3-16h2.6l-3 16zM10.2 20l3-16h2.6l-3 16zM16.4 20l3-16H22l-3 16z" fill="currentColor" stroke="none" />,
  carrinha: (
    <>
      <path d="M2.5 6.5h11.5v10H2.5zM14 9.5h4.2l3.3 3.4v3.6H14z" />
      <circle cx="7" cy="17.6" r="1.9" />
      <circle cx="17.5" cy="17.6" r="1.9" />
    </>
  ),
  loja: <path d="M4 10.5V20h16v-9.5M3 10.5l2-6h14l2 6zM9.5 20v-5.5h5V20" />,
  estacionamento: <path d="M8.5 20V4.5h5a4.5 4.5 0 010 9h-5" strokeWidth="3" />,
};

/**
 * Um consumidor da API: a pergunta que faz, a ação que recebe (o sinal),
 * os factos que a sustentam e o pedido feito com a chave da entidade.
 */
export default function Cartao({ consumidor, estado, ativo, apagado, atraso, aoFocar, aoVerResposta }) {
  const d = estado && estado.dados;
  const c = consumidor;
  return (
    <article className={'cartao' + (ativo ? ' ativo' : '') + (apagado ? ' apagado' : '')} onClick={aoFocar}>
      <header className="cartao-topo">
        <button type="button" className="entidade" aria-pressed={ativo} onClick={(e) => { e.stopPropagation(); aoFocar(); }}>
          {c.entidade}
        </button>
        <span className="perfil">{c.perfil}</span>
        {c.app && (
          <a className="abrir" href={c.app.href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
            {c.app.texto}
          </a>
        )}
      </header>

      {!d && <p className="cartao-espera">{estado && estado.erro ? 'Sem resposta da API: ' + estado.erro : 'A perguntar à API…'}</p>}

      {d && (
        <>
          <p className="pergunta">{d.pergunta}</p>
          <div key={estado.versao} className={'sinal' + (d.simulado ? ' temporario' : '')} style={{ animationDelay: atraso + 'ms' }}>
            <svg className="sinal-icone" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
              {ICONES[c.icone]}
            </svg>
            <div className="sinal-texto">
              {/* o título só entra de novo quando a ação muda; se mudar só um número (1h43, 1h44), fica quieto */}
              <strong key={d.titulo.replace(/\d+/g, '0')}>{d.titulo}</strong>
              <span>{d.detalhe}</span>
            </div>
            {d.simulado && <em className="sinal-origem">simulação</em>}
          </div>
          {d.extra && (
            <p className={'sinal-menor' + (d.extra.simulado ? ' temporario' : '')}>
              <strong>{d.extra.titulo}</strong>
              <span>{d.extra.detalhe}</span>
            </p>
          )}
          <dl className="factos">
            {d.factos.map((f) => (
              <div key={f.rotulo}>
                <dt>{f.rotulo}</dt>
                <dd><Numero valor={f.n} formato={f.formato} /></dd>
              </div>
            ))}
          </dl>
          <button type="button" className="pedido" title="Ver a resposta completa na consola" onClick={(e) => { e.stopPropagation(); aoVerResposta(d.consola, c.chave); }}>
            <code>{d.pedido}</code>
            <span><b>200</b> {fmt(Math.max(1, d.ms))} ms</span>
          </button>
        </>
      )}
    </article>
  );
}
