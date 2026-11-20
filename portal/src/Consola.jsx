import React, { useEffect, useState } from 'react';
import { CHAVES, pedirCru } from './api.js';
import { fmt } from './formato.js';

export const ENDPOINTS = [
  { grupo: 'Respostas', caminho: '/v1/respostas', descricao: 'Catálogo das respostas' },
  { grupo: 'Respostas', caminho: '/v1/respostas/onde-intervir?hora=13', descricao: 'Município: onde intervir primeiro' },
  { grupo: 'Respostas', caminho: '/v1/respostas/melhor-hora?zona=25-abril&para=montra&hora=13', descricao: 'Comércio: quando passa mais gente' },
  { grupo: 'Respostas', caminho: '/v1/respostas/melhor-hora?zona=25-abril&para=cargas', descricao: 'Logística: quando descarregar' },
  { grupo: 'Respostas', caminho: '/v1/respostas/onde-estacionar?destino=-8.6565,40.6412&origem=-8.6398,40.6433&hora=13', descricao: 'Cidadãos: onde estacionar' },
  { grupo: 'Respostas', caminho: '/v1/respostas/quando-visitar?local=rossio&dia=sabado&hora=15', descricao: 'Visitantes: quando visitar' },
  { grupo: 'Indicadores', caminho: '/v1/metricas', descricao: 'As métricas da cidade, hora a hora' },
  { grupo: 'Indicadores', caminho: '/v1/zonas/25-abril/perfil', descricao: 'As 24 horas de uma zona' },
  { grupo: 'Indicadores', caminho: '/v1/passadeiras/0023/metricas?hora=13', descricao: 'Uma passadeira' },
  { grupo: 'Indicadores', caminho: '/v1/passadeiras/0023/metricas?hora=13&formato=ngsi', descricao: 'A mesma, em NGSI-v2 (FIWARE)' },
  { grupo: 'Indicadores', caminho: '/v1/segmentos?hora=18', descricao: 'Fluidez das 102 ruas medidas' },
  { grupo: 'Indicadores', caminho: '/v1/estacionamento', descricao: 'Lugares livres por parque e hora' },
  { grupo: 'Indicadores', caminho: '/v1/turismo/afluencia?dia=sabado', descricao: 'Presenças nas zonas turísticas' },
  { grupo: 'Rede', caminho: '/v1/rede/tempos-percurso?pontos=-8.6398,40.6433;-8.6565,40.6412;-8.6473,40.6365&hora=8', descricao: 'Minutos entre pontos' },
  { grupo: 'Rede', caminho: '/v1/rede/percurso?de=-8.6398,40.6433&para=-8.6565,40.6412&hora=18', descricao: 'Caminho mais rápido, rua a rua' },
  { grupo: 'Tempo real', caminho: '/v1/cenarios/atual', descricao: 'Condições em vigor na cidade' },
  { grupo: 'Tempo real', caminho: '/v1/registo?limite=5', descricao: 'Últimos pedidos feitos à API' },
];
const GRUPOS = ['Respostas', 'Indicadores', 'Rede', 'Tempo real'];
const NOMES_CHAVES = [
  ['', 'sem chave (leitura pública)'],
  [CHAVES.camara, 'Câmara Municipal'],
  [CHAVES.ria, 'Ria Express'],
  [CHAVES.comercio, 'Comércio'],
  [CHAVES.cidadaos, 'Cidadãos e visitantes'],
];

/** JSON legível: listas de números numa só linha e textos muito longos encurtados. */
function formatar(texto) {
  let obj;
  try {
    obj = JSON.parse(texto);
  } catch {
    return texto;
  }
  return JSON.stringify(obj, (_, v) => (typeof v === 'string' && v.length > 140 ? v.slice(0, 140) + '… (encurtado)' : v), 2).replace(/\[\s+((?:(?:-?[\d.eE+-]+|null),\s+)*(?:-?[\d.eE+-]+|null))\s+\]/g, (m) => m.replace(/\s+/g, ' '));
}

function colorir(json) {
  const seguro = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return seguro.replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|\b(true|false|null)\b/g, (m, texto, doisPontos, numero, literal) => {
    if (texto) return doisPontos ? '<span class="j-chave">' + texto + '</span>' + doisPontos : '<span class="j-texto">' + texto + '</span>';
    if (numero) return '<span class="j-num">' + numero + '</span>';
    return '<span class="j-lit">' + literal + '</span>';
  });
}

/** Experimentar a API sem sair da página: escolher um pedido, enviá-lo e ler a resposta. */
export default function Consola({ pedido }) {
  const [caminho, setCaminho] = useState(ENDPOINTS[1].caminho);
  const [chave, setChave] = useState(CHAVES.camara);
  const [res, setRes] = useState(null);
  const [aEnviar, setAEnviar] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const enviar = (c = caminho, k = chave) => {
    setAEnviar(true);
    pedirCru(c, k)
      .then((r) => setRes({ ...r, caminho: c }))
      .catch((e) => setRes({ erro: e.message, caminho: c }))
      .finally(() => setAEnviar(false));
  };

  // primeira resposta à vista, e os pedidos que chegam dos cartões do palco
  useEffect(() => {
    if (!pedido) {
      enviar();
      return;
    }
    setCaminho(pedido.caminho);
    setChave(pedido.chave);
    enviar(pedido.caminho, pedido.chave);
  }, [pedido]); // eslint-disable-line react-hooks/exhaustive-deps

  const escolher = (c) => {
    setCaminho(c);
    enviar(c, chave);
  };
  const curl = 'curl ' + (chave ? '-H "X-API-Key: ' + chave + '" ' : '') + '"' + window.location.origin + caminho + '"';
  const copiar = () => {
    navigator.clipboard.writeText(curl).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    });
  };

  return (
    <section className="consola" id="experimentar" aria-labelledby="t-consola">
      <div className="secao-topo">
        <h2 id="t-consola">Experimentar a API</h2>
        <p>Os mesmos pedidos que os quatro consumidores fazem lá em cima. Escolhe um, muda os parâmetros e envia.</p>
      </div>
      <div className="consola-corpo">
        <nav className="consola-lista" aria-label="Pedidos de exemplo">
          {GRUPOS.map((g) => (
            <div key={g}>
              <h3>{g}</h3>
              {ENDPOINTS.filter((e) => e.grupo === g).map((e) => (
                <button key={e.caminho} type="button" className={e.caminho === caminho ? 'on' : ''} onClick={() => escolher(e.caminho)}>
                  <span>{e.descricao}</span>
                  <code>{e.caminho.split('?')[0]}</code>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="consola-painel">
          <form
            className="consola-barra"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <span className="metodo">GET</span>
            <label htmlFor="caminho" className="so-leitor">Caminho do pedido</label>
            <input id="caminho" value={caminho} spellCheck="false" onChange={(e) => setCaminho(e.target.value)} />
            <label htmlFor="chave" className="so-leitor">Chave da entidade</label>
            <select id="chave" value={chave} onChange={(e) => setChave(e.target.value)}>
              {NOMES_CHAVES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
            <button type="submit" className="enviar">{aEnviar ? 'A enviar…' : 'Enviar pedido'}</button>
          </form>
          <div className="consola-estado" aria-live="polite">
            {res && res.erro && <span className="mau">Sem resposta: {res.erro}</span>}
            {res && !res.erro && (
              <>
                <span className={res.estado < 400 ? 'bom' : 'mau'}>{res.estado}</span>
                <span>{fmt(Math.max(1, res.ms))} ms</span>
                <span>{fmt(res.bytes / 1024, 1)} kB</span>
              </>
            )}
          </div>
          <pre className="consola-resposta" tabIndex="0" dangerouslySetInnerHTML={{ __html: res && !res.erro ? colorir(formatar(res.texto)) : '' }} />
          <div className="consola-curl">
            <code>{curl}</code>
            <button type="button" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar comando'}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
