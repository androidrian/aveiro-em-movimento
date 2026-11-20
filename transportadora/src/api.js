// Cliente da API Aveiro em Movimento, com a chave da Ria Express.
// A transportadora só usa três coisas: o mapa base, os tempos de percurso e os avisos de mudança de cenário.
import { PONTOS } from './dados.js';

const BASE = import.meta.env.VITE_API_URL || '';
export const CHAVE = 'ria-express-demo';
const LISTA = PONTOS.map((p) => p.lon + ',' + p.lat).join(';');

async function pedir(caminho) {
  const r = await fetch(BASE + caminho, { headers: { 'X-API-Key': CHAVE } });
  if (!r.ok) throw new Error('A API respondeu ' + r.status + ' a ' + caminho.split('?')[0]);
  return r.json();
}

// cond = { vivo: true } usa o cenário em vigor na API (tempo real);
// cond = { cenario: 'normal' | 'chuva', incidente } pede uma simulação.
const sufixo = (cond) => (cond.vivo ? '' : '&cenario=' + cond.cenario + '&incidente=' + Boolean(cond.incidente));

const memoria = new Map();
function comMemoria(chave, fazer) {
  if (!memoria.has(chave)) {
    const p = fazer();
    memoria.set(chave, p);
    p.catch(() => memoria.delete(chave));
  }
  return memoria.get(chave);
}

export const api = {
  mapa: () => pedir('/v1/rede/mapa'),
  cenario: () => pedir('/v1/cenarios/atual'),
  /** Minutos entre todos os pontos da transportadora, a uma hora. `versao` invalida a memória quando o cenário em vigor muda. */
  tempos: (hora, cond, versao = '') => comMemoria('t|' + hora + '|' + sufixo(cond) + '|' + versao, () => pedir('/v1/rede/tempos-percurso?pontos=' + encodeURIComponent(LISTA) + '&hora=' + hora + sufixo(cond))),
  /** Caminho rua a rua entre dois pontos (índices de PONTOS). */
  percurso: (de, para, hora, cond, versao = '') =>
    comMemoria('p|' + de + '|' + para + '|' + hora + '|' + sufixo(cond) + '|' + versao, () =>
      pedir('/v1/rede/percurso?de=' + PONTOS[de].lon + ',' + PONTOS[de].lat + '&para=' + PONTOS[para].lon + ',' + PONTOS[para].lat + '&hora=' + hora + sufixo(cond)),
    ),
};

export function textoDoPedido(hora, cond) {
  return 'GET /v1/rede/tempos-percurso?pontos=…&hora=' + hora + (cond.vivo ? '   (cenário em vigor)' : '&cenario=' + cond.cenario + (cond.incidente ? '&incidente=true' : ''));
}

// Só o separador que está à vista mantém a ligação (o browser aceita seis por servidor);
// ao voltar a ligar, a API envia o cenário em vigor.
export function ouvirCenario(aoMudar) {
  let es = null;
  const ligar = () => {
    if (es || document.visibilityState !== 'visible') return;
    es = new EventSource(BASE + '/v1/eventos?chave=' + CHAVE);
    ['cenario.atual', 'cenario.alterado'].forEach((tipo) => es.addEventListener(tipo, (e) => aoMudar(JSON.parse(e.data), tipo)));
  };
  const desligar = () => {
    if (es) es.close();
    es = null;
  };
  const aoMudarDeVista = () => (document.visibilityState === 'visible' ? ligar() : desligar());
  document.addEventListener('visibilitychange', aoMudarDeVista);
  ligar();
  return () => {
    document.removeEventListener('visibilitychange', aoMudarDeVista);
    desligar();
  };
}
