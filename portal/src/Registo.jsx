import React from 'react';
import { fmt } from './formato.js';

// Nomes das entidades tal como a API os regista, pela ordem dos cartões.
export const ENTIDADES = [
  { api: 'Câmara Municipal · Painel', nome: 'Câmara Municipal' },
  { api: 'Ria Express Entregas', nome: 'Ria Express' },
  { api: 'Associação Comercial de Aveiro', nome: 'Comércio' },
  { api: 'App Passadeiras Amigas', nome: 'Cidadãos e visitantes' },
  { api: 'Assistente de IA (MCP)', nome: 'Assistente de IA' },
  { api: 'Leitura pública (sem chave)', nome: 'Sem chave' },
];

/** Pedidos que a API está a receber, por entidade, desde que a página abriu. */
export default function Registo({ contagens, ligado }) {
  const total = Object.values(contagens).reduce((a, c) => a + c.n, 0);
  return (
    <section className="registo" aria-label="Pedidos à API em direto">
      <div className="registo-titulo">
        <span className={'ligacao' + (ligado ? ' on' : '')} aria-hidden="true" />
        <div>
          <strong>{ligado ? 'Pedidos à API, em direto' : 'Sem ligação à API'}</strong>
          <span>{ligado ? fmt(total) + ' desde que abriste esta página' : 'A tentar ligar de novo…'}</span>
        </div>
      </div>
      <ul>
        {ENTIDADES.map((e) => {
          const c = contagens[e.api];
          return (
            <li key={e.api}>
              <span className="registo-nome">{e.nome}</span>
              <b key={c ? c.n : 0} className={c ? 'novo' : ''}>{fmt(c ? c.n : 0)}</b>
              <code>{c ? c.ultimo.pedido.split('?')[0] : 'sem pedidos'}</code>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
