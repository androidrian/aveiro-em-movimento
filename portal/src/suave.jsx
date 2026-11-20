// Valores que vão até ao número novo em vez de saltar, para o dia se ver a andar.
import React, { useEffect, useRef, useState } from 'react';
import { fmt } from './formato.js';

// Um pouco menos do que um passo do dia (550 ms à velocidade normal): o valor chega mesmo antes
// do passo seguinte e, com o dia a correr, os números nunca param.
export const DURACAO = 520;
// Quem controla a velocidade do dia diz quanto dura cada animação daí em diante.
let duracao = DURACAO;
export const definirDuracao = (ms) => {
  duracao = ms;
};
const semMovimento = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Devolve o número a mostrar em cada momento, a caminho de `alvo` a velocidade constante. */
export function useSuave(alvo) {
  const [visivel, setVisivel] = useState(alvo);
  const atual = useRef(alvo);
  useEffect(() => {
    const ms = duracao;
    const de = atual.current;
    if (alvo == null || de == null || de === alvo || semMovimento()) {
      atual.current = alvo;
      setVisivel(alvo);
      return undefined;
    }
    let quadro;
    const inicio = performance.now();
    const andar = (agora) => {
      const p = Math.max(0, Math.min(1, (agora - inicio) / ms));
      atual.current = de + (alvo - de) * p;
      setVisivel(atual.current);
      if (p < 1) quadro = requestAnimationFrame(andar);
    };
    quadro = requestAnimationFrame(andar);
    return () => cancelAnimationFrame(quadro);
  }, [alvo]);
  return visivel;
}

/** Um número que rola até ao valor novo. `formato` recebe o valor do momento (pode ter casas decimais). */
export function Numero({ valor, formato = fmt }) {
  const v = useSuave(valor);
  return v == null ? '—' : formato(v);
}

/** Seta que diz se o valor acabou de subir ou de descer; desaparece quando ele pára. */
export function Tendencia({ valor }) {
  const anterior = useRef(valor);
  const [estado, setEstado] = useState({ sobe: true, visivel: false });
  useEffect(() => {
    const diferenca = valor - anterior.current;
    anterior.current = valor;
    if (!diferenca) return undefined;
    setEstado({ sobe: diferenca > 0, visivel: true });
    const t = setTimeout(() => setEstado((e) => ({ ...e, visivel: false })), 1300);
    return () => clearTimeout(t);
  }, [valor]);
  return (
    <svg className={'tendencia' + (estado.visivel ? ' visivel' : '') + (estado.sobe ? '' : ' desce')} viewBox="0 0 10 10" aria-hidden="true">
      <path d="M5 1.5 9.2 8.5H0.8z" />
    </svg>
  );
}
