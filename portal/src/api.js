// Cliente da API Aveiro em Movimento usado pelo portal.
// Cada consumidor do palco fala com a API com a chave da sua entidade, para o registo os distinguir.
// VITE_API_URL permite apontar para outra máquina; por omissão usa a mesma origem (/v1).
export const BASE = import.meta.env.VITE_API_URL || '';

export const CHAVES = {
  camara: 'cma-painel-demo',
  ria: 'ria-express-demo',
  comercio: 'comercio-demo',
  cidadaos: 'cidadaos-demo',
};

const memoria = new Map();

/** Milissegundos que a API demorou a responder (cabeçalho Server-Timing); sem ele, o tempo medido no browser. */
function tempoDaApi(r, t0) {
  const m = /dur=([\d.]+)/.exec(r.headers.get('Server-Timing') || '');
  return m ? Number(m[1]) : performance.now() - t0;
}

export function criarCliente(chave) {
  const cabecalhos = { 'Content-Type': 'application/json', ...(chave ? { 'X-API-Key': chave } : {}) };
  const pedir = async (caminho, opcoes = {}) => {
    const t0 = performance.now();
    const r = await fetch(BASE + caminho, { ...opcoes, headers: cabecalhos });
    if (!r.ok) throw new Error('A API respondeu ' + r.status + ' a ' + caminho.split('?')[0]);
    return { corpo: await r.json(), ms: tempoDaApi(r, t0), estado: r.status };
  };
  /** GET com memória. `versao` distingue as respostas que dependem do cenário em vigor. Devolve { corpo, ms, estado }. */
  const medir = (caminho, versao = '') => {
    const k = chave + '|' + caminho + '|' + versao;
    if (!memoria.has(k)) {
      const p = pedir(caminho);
      memoria.set(k, p);
      p.catch(() => memoria.delete(k));
    }
    return memoria.get(k);
  };
  return {
    chave,
    medir,
    get: (caminho, versao = '') => medir(caminho, versao).then((r) => r.corpo),
    put: (caminho, corpo) => pedir(caminho, { method: 'PUT', body: JSON.stringify(corpo) }).then((r) => r.corpo),
  };
}

/** Pedido livre para a consola: nunca usa a memória e devolve o texto tal como chegou. */
export async function pedirCru(caminho, chave) {
  const t0 = performance.now();
  const r = await fetch(BASE + caminho, { headers: chave ? { 'X-API-Key': chave } : {} });
  const texto = await r.text();
  return { estado: r.status, ms: tempoDaApi(r, t0), bytes: texto.length, texto };
}

/**
 * Eventos em tempo real: mudanças de cenário e pedidos de todas as entidades. Volta a ligar-se sozinho.
 * Só o separador que está à vista mantém a ligação: o browser aceita seis ligações por servidor e,
 * com seis separadores a ouvir eventos, o sétimo ficava à espera sem carregar.
 * Ao voltar a ligar, a API envia o cenário em vigor.
 */
export function ouvirEventos(aoReceber, aoLigar) {
  let es = null;
  const ligar = () => {
    if (es || document.visibilityState !== 'visible') return;
    es = new EventSource(BASE + '/v1/eventos');
    es.onopen = () => aoLigar(true);
    es.onerror = () => aoLigar(false);
    ['cenario.atual', 'cenario.alterado', 'pedido'].forEach((tipo) => es.addEventListener(tipo, (e) => aoReceber(tipo, JSON.parse(e.data))));
  };
  const desligar = () => {
    if (es) es.close();
    es = null;
  };
  const aoMudarDeVista = () => {
    if (document.visibilityState === 'visible') return ligar();
    desligar();
    aoLigar(false);
  };
  document.addEventListener('visibilitychange', aoMudarDeVista);
  ligar();
  return () => {
    document.removeEventListener('visibilitychange', aoMudarDeVista);
    desligar();
  };
}
