import React from 'react';

// Horas mostradas no painel: das 6h às 22h (a API devolve as 24).
export const H0 = 6;
export const H1 = 22;
export const HORAS = Array.from({ length: H1 - H0 + 1 }, (_, i) => H0 + i);
export const xDe = (h) => ((h - H0) / (H1 - H0)) * 100;
export const hh = (h) => String(h).padStart(2, '0') + ':00';

// Máximo "redondo" para o eixo (1, 2, 3, 4, 5, 6, 8 ou 10 vezes uma potência de 10), para a metade também ser redonda.
export function topoRedondo(v) {
  if (!v || v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return [1, 2, 3, 4, 5, 6, 8, 10].find((x) => f <= x) * p;
}

// Caminho SVG de uma série por hora; valores nulos interrompem a linha.
export function caminho(serie, topo) {
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

/** Gráfico de linhas ao longo do dia, com marcador da hora escolhida. Clicar muda a hora. */
export function LinhasDoDia({ series, topo, hora, aoEscolherHora, altura, rotulo, marcas = [], horasEixo = [6, 10, 14, 18, 22] }) {
  const escolher = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left) / (r.width || 1);
    aoEscolherHora(Math.max(H0, Math.min(H1, Math.round(H0 + f * (H1 - H0)))));
  };
  const ticks = [topo, topo / 2, 0];
  return (
    <div className="plot" style={{ height: altura }}>
      {ticks.map((t, i) => (
        <div key={t} className={'grade' + (i === 2 ? ' base' : '')} style={{ top: (1 - t / topo) * 100 + '%' }} aria-hidden="true">
          <span>{String(t).replace('.', ',')}</span>
        </div>
      ))}
      <svg role="img" aria-label={rotulo} viewBox="0 0 100 100" preserveAspectRatio="none">
        {series
          .slice()
          .reverse()
          .map((s) => (
            <path key={s.nome} d={caminho(s.valores, topo)} style={{ stroke: s.cor, strokeWidth: s.destaque ? 2.5 : 2, opacity: s.destaque === false ? 0.6 : 1 }} />
          ))}
      </svg>
      {marcas.map((m) => (
        <span key={m.texto} className="marca" style={{ left: xDe(m.hora) + '%', top: (1 - m.valor / topo) * 100 + '%', transform: m.lado === 'esq' ? 'translate(-100%, -130%)' : 'translate(0, -130%)', padding: m.lado === 'esq' ? '0 6px 0 0' : '0 0 0 6px' }}>
          {m.texto}
        </span>
      ))}
      <div className="agora-linha" style={{ left: xDe(hora) + '%' }} aria-hidden="true" />
      {series
        .slice()
        .reverse()
        .map((s) =>
          s.valores[hora] == null ? null : (
            <span key={s.nome} className="ponto" style={{ left: xDe(hora) + '%', top: (1 - s.valores[hora] / topo) * 100 + '%', background: s.cor }} aria-hidden="true" />
          ),
        )}
      <div className="eixo-x" aria-hidden="true">
        {horasEixo.map((h, i) => (
          <span key={h} style={i === 0 ? { left: 0 } : i === horasEixo.length - 1 ? { right: 0 } : { left: xDe(h) + '%', transform: 'translateX(-50%)' }}>
            {hh(h)}
          </span>
        ))}
      </div>
      <button type="button" className="plot-clique" aria-label={'Escolher a hora no gráfico: ' + rotulo} onClick={escolher} />
    </div>
  );
}

/** Mini-curva do dia para os indicadores. */
export function MiniCurva({ serie, hora }) {
  const vals = HORAS.map((h) => serie[h]).filter((v) => v != null);
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const y = (v) => 88 - ((v - mn) / (mx - mn || 1)) * 76;
  let d = '';
  let aberto = false;
  HORAS.forEach((h) => {
    const v = serie[h];
    if (v == null) {
      aberto = false;
      return;
    }
    d += (aberto ? ' L' : ' M') + xDe(h).toFixed(2) + ' ' + y(v).toFixed(2);
    aberto = true;
  });
  return (
    <div className="mini" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d={d.trim()} />
      </svg>
      {serie[hora] != null && <span className="mini-ponto" style={{ left: xDe(hora) + '%', top: y(serie[hora]) + '%' }} />}
    </div>
  );
}
