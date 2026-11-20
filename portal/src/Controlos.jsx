import React from 'react';
import { hh, relogio } from './formato.js';
import { useSuave } from './suave.jsx';

export const H0 = 6;
export const H1 = 22;
// Velocidades a que o dia pode correr; 1 é meia hora do dia a cada 550 ms.
export const VELOCIDADES = [0.25, 0.5, 1, 2, 3];
const vezes = (v) => v.toLocaleString('pt-PT') + '×';

/**
 * Hora do dia (em passos de `passo` horas), velocidade a que o dia corre e condições da cidade.
 * As condições são publicadas na API com a chave da plataforma.
 * Com o dia a correr `sozinho`, o cursor desliza entre dois passos; à mão, anda passo a passo.
 * `segundosDoDia` é quanto leva o dia inteiro à velocidade escolhida.
 */
export default function Controlos({ tempo, passo, aTocar, sozinho, velocidade, segundosDoDia, cen, aoMudarHora, aoTocar, aoMudarVelocidade, aoPublicar }) {
  const chuva = cen.cenario === 'chuva';
  const aDeslizar = useSuave(tempo);
  const segundos = Math.round(segundosDoDia);
  return (
    <div className="controlos">
      <div className="hora">
        <button type="button" className="tocar" aria-label={aTocar ? 'Pausar o dia' : 'Percorrer o dia'} onClick={aoTocar}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24">
            {aTocar ? <path d="M6 4.5h4.5v15H6zM13.5 4.5H18v15h-4.5z" /> : <path d="M7 4.5v15l13-7.5z" />}
          </svg>
        </button>
        <label htmlFor="hora" className="so-leitor">Hora do dia</label>
        <span>{hh(H0)}</span>
        <input
          id="hora"
          type="range"
          min={H0}
          max={H1}
          step={sozinho ? 0.01 : passo}
          value={sozinho ? aDeslizar : tempo}
          aria-valuetext={relogio(tempo)}
          onChange={(e) => aoMudarHora(Math.round(Number(e.target.value) / passo) * passo)}
        />
        <span>{hh(H1)}</span>
      </div>
      <div className="velocidade">
        <label htmlFor="velocidade">Velocidade</label>
        <input
          id="velocidade"
          type="range"
          min="0"
          max={VELOCIDADES.length - 1}
          step="1"
          value={VELOCIDADES.indexOf(velocidade)}
          aria-valuetext={vezes(velocidade) + ', o dia inteiro em ' + segundos + ' segundos'}
          onChange={(e) => aoMudarVelocidade(VELOCIDADES[Number(e.target.value)])}
        />
        <output htmlFor="velocidade">
          <b>{vezes(velocidade)}</b> o dia em {segundos} s
        </output>
      </div>
      <div className="condicoes" role="group" aria-label="Condições da cidade, publicadas na API">
        <div className="segmentos">
          <button type="button" aria-pressed={!chuva} className={!chuva ? 'on' : ''} onClick={() => aoPublicar('normal', cen.incidente)}>Dia normal</button>
          <button type="button" aria-pressed={chuva} className={chuva ? 'on desvio' : ''} onClick={() => aoPublicar('chuva', cen.incidente)}>Dia de chuva</button>
        </div>
        <button type="button" aria-pressed={cen.incidente} title="Incidente simulado na Av. de Santa Joana" className={'alternar' + (cen.incidente ? ' on desvio' : '')} onClick={() => aoPublicar(cen.cenario, !cen.incidente)}>
          Incidente
        </button>
      </div>
    </div>
  );
}
