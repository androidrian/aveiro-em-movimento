import React, { useState } from 'react';
import { H0, H1 } from './Controlos.jsx';
import { fmt, hh } from './formato.js';

// Os gráficos mostram o dia das 6h às 22h (a API devolve as 24 horas).
const HORAS = Array.from({ length: H1 - H0 + 1 }, (_, i) => H0 + i);
const EIXO = [6, 10, 14, 18, 22];
const xDe = (h) => ((h - H0) / (H1 - H0)) * 100;

// Máximo "redondo" para o eixo (1, 2, 3, 4, 5, 6, 8 ou 10 vezes uma potência de 10), para a metade também ser redonda.
function topoRedondo(v) {
  if (!v || v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return [1, 2, 3, 4, 5, 6, 8, 10].find((x) => v / p <= x) * p;
}

// Caminho SVG de uma série por hora; valores nulos interrompem a linha.
function caminho(serie, topo) {
  let d = '';
  let aberto = false;
  HORAS.forEach((h) => {
    const v = serie[h];
    if (v == null) {
      aberto = false;
      return;
    }
    d += (aberto ? ' L' : ' M') + xDe(h).toFixed(2) + ' ' + (100 - (v / topo) * 100).toFixed(2);
    aberto = true;
  });
  return d.trim();
}

const limitar = (h) => Math.max(H0, Math.min(H1, h));
// A etiqueta flutuante vira para dentro perto das margens.
const lado = (h) => (h <= H0 + 3 ? ' esq' : h >= H1 - 3 ? ' dir' : '');

function Grelha({ topo, formato }) {
  return [topo, topo / 2, 0].map((t, i) => (
    <div key={t} className={'grelha' + (i === 2 ? ' base' : '')} style={{ top: (1 - t / topo) * 100 + '%' }} aria-hidden="true">
      <span>{formato(t)}</span>
    </div>
  ));
}

/**
 * Uma métrica ao longo do dia. A hora escolhida fica marcada; passar o rato mostra o valor de cada hora;
 * clicar (ou as setas do teclado) muda a hora. `referencia` é o dia normal, quando há simulação em vigor.
 * `tempo` é a hora do palco com meias horas: a marca e o ponto deslizam sobre a linha em vez de saltarem de hora em hora.
 */
export function LinhaDoDia({ nome, serie, referencia, nomeSerie, hora, tempo = hora, aoEscolherHora, formato = fmt }) {
  const [sobre, setSobre] = useState(null);
  // valor sobre a linha no momento `tempo`, entre a hora em curso e a seguinte
  const depois = Math.min(H1, hora + 1);
  const naLinha = serie[hora] == null || serie[depois] == null ? serie[hora] : serie[hora] + (serie[depois] - serie[hora]) * (tempo - hora);
  const topo = topoRedondo(Math.max(...HORAS.map((h) => Math.max(serie[h] ?? 0, referencia ? referencia[h] ?? 0 : 0))));
  const horaEm = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return limitar(Math.round(H0 + ((e.clientX - r.left) / (r.width || 1)) * (H1 - H0)));
  };
  const y = (v) => (1 - v / topo) * 100 + '%';
  // o ponto mostra a hora por onde o rato passa ou, sem rato, o momento do palco
  const ponto = sobre != null ? { h: sobre, v: serie[sobre] } : { h: Math.min(H1, tempo), v: naLinha };
  return (
    <div className="grafico">
      <div className="grafico-area">
        <Grelha topo={topo} formato={formato} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {referencia && <path className="linha-ref" d={caminho(referencia, topo)} />}
          <path className="linha" d={caminho(serie, topo)} />
        </svg>
        <i className="marca-hora" style={{ left: xDe(Math.min(H1, tempo)) + '%' }} aria-hidden="true" />
        {sobre != null && sobre !== hora && <i className="mira" style={{ left: xDe(sobre) + '%' }} aria-hidden="true" />}
        {ponto.v != null && <i className={'ponto-dado' + (sobre == null ? ' no-palco' : '')} style={{ left: xDe(ponto.h) + '%', top: y(ponto.v) }} aria-hidden="true" />}
        {sobre != null && (
          <div className={'etiqueta' + lado(sobre)} style={{ left: xDe(sobre) + '%' }} role="status">
            <b>{hh(sobre)}</b> {formato(serie[sobre])}
            {referencia && <span>dia normal: {formato(referencia[sobre])}</span>}
          </div>
        )}
        <button
          type="button"
          className="grafico-toque"
          aria-label={nome + '. Às ' + hh(hora) + ': ' + formato(serie[hora]) + '. Setas para mudar a hora.'}
          onMouseMove={(e) => setSobre(horaEm(e))}
          onMouseLeave={() => setSobre(null)}
          onClick={(e) => aoEscolherHora(horaEm(e))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') aoEscolherHora(limitar(hora - 1));
            if (e.key === 'ArrowRight') aoEscolherHora(limitar(hora + 1));
          }}
        />
      </div>
      <div className="eixo-horas" aria-hidden="true">
        {EIXO.map((e) => (
          <span key={e} style={{ left: xDe(e) + '%' }}>{hh(e)}</span>
        ))}
      </div>
      {referencia && (
        <ul className="chave">
          <li><i className="t-linha" />{nomeSerie}</li>
          <li><i className="t-ref" />dia normal, medido</li>
        </ul>
      )}
    </div>
  );
}

/** Contagens empilhadas por hora (por exemplo, ruas moderadas e lentas). `series` vai de baixo para cima. */
export function ColunasDoDia({ nome, series, hora, aoEscolherHora }) {
  const [sobre, setSobre] = useState(null);
  const total = (h) => series.reduce((s, x) => s + (x.valores[h] || 0), 0);
  const topo = topoRedondo(Math.max(...HORAS.map(total)));
  return (
    <div className="grafico">
      <div className="grafico-area" role="group" aria-label={nome}>
        <Grelha topo={topo} formato={fmt} />
        <div className="colunas" onMouseLeave={() => setSobre(null)}>
          {HORAS.map((h) => (
            <button
              key={h}
              type="button"
              className={'coluna' + (h === hora ? ' agora' : '')}
              aria-pressed={h === hora}
              aria-label={hh(h) + ': ' + series.map((x) => fmt(x.valores[h]) + ' ' + x.nome).join(', ')}
              onMouseEnter={() => setSobre(h)}
              onFocus={() => setSobre(h)}
              onBlur={() => setSobre(null)}
              onClick={() => aoEscolherHora(h)}
            >
              {series
                .slice()
                .reverse()
                .map((x) => (
                  <i key={x.nome} className={x.classe} style={{ height: ((x.valores[h] || 0) / topo) * 100 + '%' }} />
                ))}
            </button>
          ))}
        </div>
        {sobre != null && (
          <div className={'etiqueta' + lado(sobre)} style={{ left: ((sobre - H0 + 0.5) / HORAS.length) * 100 + '%' }} role="status">
            <b>{hh(sobre)}</b>
            {series
              .slice()
              .reverse()
              .map((x) => (
                <span key={x.nome}>{fmt(x.valores[sobre])} {x.nome}</span>
              ))}
          </div>
        )}
      </div>
      <div className="eixo-horas colunas-eixo" aria-hidden="true">
        {EIXO.map((e) => (
          <span key={e} style={{ left: ((e - H0 + 0.5) / HORAS.length) * 100 + '%' }}>{hh(e)}</span>
        ))}
      </div>
      <ul className="chave">
        {series
          .slice()
          .reverse()
          .map((x) => (
            <li key={x.nome}><i className={'q ' + x.classe} />{x.nome}</li>
          ))}
      </ul>
    </div>
  );
}

/** Lista ordenada por local: nome, barra e valor. `itens` = [{ nome, valor, parte (0 a 1), texto, classe }]. */
export function BarrasPorLocal({ itens }) {
  return (
    <ol className="barras">
      {itens.map((x) => (
        <li key={x.nome}>
          <span className="barras-nome" title={x.nome}>{x.nome}</span>
          <span className="barras-pista" aria-hidden="true">
            <i className={x.classe || ''} style={{ width: Math.max(0, Math.min(1, x.parte)) * 100 + '%' }} />
          </span>
          <b>{x.texto}</b>
        </li>
      ))}
    </ol>
  );
}
