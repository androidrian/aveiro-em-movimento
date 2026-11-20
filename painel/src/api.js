// Cliente da API Aveiro em Movimento usado pelo painel do município.
// VITE_API_URL permite apontar para outra máquina; por omissão usa a mesma origem (/v1).
const BASE = import.meta.env.VITE_API_URL || '';
export const CHAVE = 'cma-painel-demo';

async function pedir(caminho, opcoes = {}) {
  const r = await fetch(BASE + caminho, { ...opcoes, headers: { 'X-API-Key': CHAVE, 'Content-Type': 'application/json', ...(opcoes.headers || {}) } });
  if (!r.ok) throw new Error('A API respondeu ' + r.status + ' a ' + caminho);
  return r.json();
}

export const api = {
  zonas: () => pedir('/v1/zonas'),
  estacionamento: () => pedir('/v1/estacionamento'),
  cenario: () => pedir('/v1/cenarios/atual'),
  mudarCenario: (cenario, incidente) => pedir('/v1/cenarios/atual', { method: 'PUT', body: JSON.stringify({ cenario, incidente }) }),
  perfil: (zona, cenario) => pedir('/v1/zonas/' + zona + '/perfil?cenario=' + cenario),
  relacoes: (zona, cenario) => pedir('/v1/zonas/' + zona + '/relacoes?cenario=' + cenario),
  registo: () => pedir('/v1/registo?limite=30'),
};

// Eventos em tempo real: mudanças de cenário e pedidos feitos por outras entidades.
// Só o separador que está à vista mantém a ligação (o browser aceita seis por servidor);
// ao voltar a ligar, a API envia o cenário em vigor.
export function ouvirEventos(aoReceber) {
  let es = null;
  const ligar = () => {
    if (es || document.visibilityState !== 'visible') return;
    es = new EventSource(BASE + '/v1/eventos?chave=' + CHAVE);
    ['cenario.atual', 'cenario.alterado', 'pedido'].forEach((tipo) => es.addEventListener(tipo, (e) => aoReceber(tipo, JSON.parse(e.data))));
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
