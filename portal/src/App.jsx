import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CHAVES, criarCliente, ouvirEventos } from './api.js';
import Adotar from './Adotar.jsx';
import Cartao from './Cartao.jsx';
import Consola from './Consola.jsx';
import Controlos, { H0, H1 } from './Controlos.jsx';
import Mapa from './Mapa.jsx';
import Metricas from './Metricas.jsx';
import Registo from './Registo.jsx';
import { CONSUMIDORES } from './consumidores.js';
import { GUIAO, reproduzir } from './demo.js';
import { relogio } from './formato.js';
import { Numero, Tendencia, definirDuracao, useSuave } from './suave.jsx';

// A plataforma (o município) desenha o mapa e publica as condições da cidade.
const plataforma = criarCliente(CHAVES.camara);
const CLIENTES = Object.fromEntries(CONSUMIDORES.map((c) => [c.id, criarCliente(c.chave)]));
// As respostas só dependem do cenário e do incidente em vigor: é isso que distingue o que fica em memória.
const versaoDe = (cen) => cen.cenario + (cen.incidente ? '+incidente' : '');
// Os mesmos limiares da API para o nível de fluidez (0 fluido, 1 moderado, 2 lento).
const nivelDe = (fluidez) => (fluidez >= 0.85 ? 0 : fluidez >= 0.68 ? 1 : 2);
const PASSO = 0.5; // o dia percorre-se de 30 em 30 minutos
const MS_PASSO = 550; // duração de um passo à velocidade normal (1×)
const seguinteA = (h) => Math.min(23, h + 1);
const avancar = (t) => (t >= H1 ? H0 : t + PASSO); // um passo do dia; depois das 22:00 volta às 06:00
// O tema da página fica lembrado no browser; sem armazenamento, vale o tema por omissão.
const CHAVE_TEMA = 'aveiro-em-movimento.tema';
const lerTema = () => {
  try {
    return localStorage.getItem(CHAVE_TEMA) === 'aveiro' ? 'aveiro' : 'sinaletica';
  } catch {
    return 'sinaletica';
  }
};
const guardarTema = (tema) => {
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // modo privado ou armazenamento bloqueado: a escolha vale só para esta visita
  }
};

// O relógio passa pelos minutos entre dois passos do dia, em vez de saltar meia hora.
function Relogio({ tempo }) {
  return <span className="relogio">{relogio(useSuave(tempo))}</span>;
}

// Um dos quatro números do topo do mapa: rola até ao valor novo e diz se subiu ou desceu.
function Vertical({ nome, valor }) {
  return (
    <div>
      <dt>{nome}</dt>
      <dd>
        <Numero valor={valor} />
        <Tendencia valor={valor} />
      </dd>
    </div>
  );
}

export default function App() {
  const [base, setBase] = useState(null);
  const [cen, setCen] = useState(null);
  // A API tem agregados por hora. O palco anda de meia em meia hora: `hora` é o que se pede à API;
  // nas meias horas, o mapa mostra o ponto médio entre essa hora e a seguinte.
  const [tempo, setTempo] = useState(13);
  const hora = Math.floor(tempo);
  const [foco, setFoco] = useState('todos');
  const [aTocar, setATocar] = useState(false);
  const [velocidade, setVelocidade] = useState(1);
  const [medido, setMedido] = useState(null);
  const [cartoes, setCartoes] = useState({});
  const [contagens, setContagens] = useState({});
  const [ligado, setLigado] = useState(false);
  const [erro, setErro] = useState(null);
  const [legenda, setLegenda] = useState(null);
  const [emDemo, setEmDemo] = useState(false);
  const [pedidoConsola, setPedidoConsola] = useState(null);
  const [tema, setTema] = useState(lerTema);
  const ordemCamadas = useRef(0);
  const ordemCartoes = useRef({});
  const pararDemo = useRef(null);

  const aplicarCenario = useCallback((c) => {
    setCen((a) => (a && a.cenario === c.cenario && a.incidente === c.incidente ? a : { cenario: c.cenario, incidente: c.incidente }));
  }, []);

  // o que não muda com a hora + eventos em tempo real
  useEffect(() => {
    Promise.all([
      plataforma.get('/v1/rede/mapa'),
      plataforma.get('/v1/zonas'),
      plataforma.get('/v1/turismo/locais'),
      plataforma.get('/v1/estacionamento'),
      plataforma.get('/v1/segmentos?hora=13&cenario=normal&geometria=true'),
      plataforma.get('/v1/cenarios/atual'),
    ])
      .then(([mapa, zonas, locais, est, seg, atual]) => {
        setBase({ mapa, zonas, locais, est, ruas: seg.segmentos.map((s) => ({ id: s.id, d: s.d })) });
        aplicarCenario(atual);
      })
      .catch((e) => setErro(e.message));

    // os pedidos chegam em rajada: juntam-se e contam-se de 300 em 300 ms
    const chegados = [];
    const cancelar = ouvirEventos((tipo, d) => (tipo === 'pedido' ? chegados.push(d) : aplicarCenario(d)), setLigado);
    const t = setInterval(() => {
      if (!chegados.length) return;
      const lote = chegados.splice(0);
      setContagens((c) => {
        const n = { ...c };
        lote.forEach((l) => {
          n[l.entidade] = { n: (n[l.entidade] ? n[l.entidade].n : 0) + 1, ultimo: l };
        });
        return n;
      });
    }, 300);
    return () => {
      cancelar();
      clearInterval(t);
    };
  }, [aplicarCenario]);

  // camadas do mapa para a hora e as condições em vigor
  useEffect(() => {
    if (!cen || !base) return;
    const v = versaoDe(cen);
    const n = ++ordemCamadas.current;
    const depois = seguinteA(hora);
    Promise.all([
      plataforma.get('/v1/segmentos?hora=' + hora, v),
      plataforma.get('/v1/passadeiras?hora=' + hora, v),
      plataforma.get('/v1/segmentos?hora=' + depois, v),
      plataforma.get('/v1/passadeiras?hora=' + depois, v),
      plataforma.get('/v1/metricas?dia=dias_uteis', v),
    ])
      .then(([seg, pas, segDepois, pasDepois, m]) => {
        if (n !== ordemCamadas.current) return; // chegou uma resposta de uma hora que já não é a escolhida
        setMedido({ hora, seg, pas, segDepois, pasDepois, m });
      })
      .catch((e) => setErro(e.message));
  }, [hora, cen, base]);

  // o que o mapa mostra: os valores da hora, ou o ponto médio com a hora seguinte nas meias horas
  const camadas = useMemo(() => {
    if (!medido) return null;
    const h = medido.hora;
    const f = h === hora ? tempo - hora : 0; // enquanto a hora nova não chega, fica a que está carregada
    const entre = (a, b) => (a == null || b == null ? (a ?? b) : a + (b - a) * f);
    const serie = (s) => Math.round(entre(s[h], s[seguinteA(h)]));
    const { m } = medido;
    const fluidezDepois = Object.fromEntries(medido.segDepois.segmentos.map((s) => [s.id, s.fluidez]));
    const niveis = Object.fromEntries(
      medido.seg.segmentos.map((s) => {
        const fl = entre(s.fluidez, fluidezDepois[s.id]);
        return [s.id, fl == null ? null : nivelDe(fl)];
      }),
    );
    return {
      niveis,
      passadeiras: f ? medido.pas.map((p, i) => ({ ...p, peoes_hora: Math.round(entre(p.peoes_hora, medido.pasDepois[i].peoes_hora)) })) : medido.pas,
      // os quatro números do topo do mapa são os do dashboard das métricas
      resumo: {
        lentas: f ? Object.values(niveis).filter((n) => n === 2).length : m.mobilidade.ruas_lentas[h],
        travessias: serie(m.seguranca.travessias_hora),
        livres: serie(m.estacionamento.livres),
        presencas: serie(m.turismo.presencas_hora),
      },
      presencas: Object.fromEntries(m.turismo.locais.map((l) => [l.id, serie(l.presencas_hora)])),
      fracao: f,
    };
  }, [medido, tempo, hora]);

  // cada consumidor pergunta à API com a sua chave
  useEffect(() => {
    if (!cen) return;
    const versao = versaoDe(cen);
    CONSUMIDORES.forEach((c) => {
      const n = (ordemCartoes.current[c.id] = (ordemCartoes.current[c.id] || 0) + 1);
      const atual = () => n === ordemCartoes.current[c.id];
      c.carregar(CLIENTES[c.id], { hora, tempo, cen, versao })
        .then((dados) => atual() && setCartoes((o) => ({ ...o, [c.id]: { dados, versao } })))
        .catch((e) => atual() && setCartoes((o) => ({ ...o, [c.id]: { ...o[c.id], erro: e.message } })));
    });
  }, [hora, tempo, cen]);

  // percorrer o dia: meia hora a cada 550 ms, mais depressa ou mais devagar conforme a velocidade escolhida
  useEffect(() => {
    if (!aTocar) return undefined;
    const t = setInterval(() => setTempo(avancar), MS_PASSO / velocidade);
    return () => clearInterval(t);
  }, [aTocar, velocidade]);
  // ao arrancar, o primeiro passo é dado logo: a velocidades baixas, esperar um passo inteiro parecia avaria
  const alternarDia = () => {
    if (!aTocar) setTempo(avancar);
    setATocar(!aTocar);
  };

  // As animações duram quase um passo, para o dia correr sem paragens a qualquer velocidade.
  // Com o dia parado ou na demonstração automática (que tem o seu próprio ritmo), valem os tempos normais.
  const msAnimacao = (aTocar && !emDemo ? MS_PASSO / velocidade : MS_PASSO) - 30;
  useLayoutEffect(() => {
    definirDuracao(msAnimacao);
    document.documentElement.style.setProperty('--passo', msAnimacao + 'ms');
  }, [msAnimacao]);

  const publicar = useCallback(
    (cenario, incidente) => {
      plataforma.put('/v1/cenarios/atual', { cenario, incidente }).then(aplicarCenario).catch((e) => setErro(e.message));
    },
    [aplicarCenario],
  );

  const terminarDemo = useCallback(() => {
    if (pararDemo.current) pararDemo.current();
    pararDemo.current = null;
    setEmDemo(false);
    setLegenda(null);
  }, []);
  const iniciarDemo = () => {
    terminarDemo();
    setATocar(false);
    setEmDemo(true);
    window.scrollTo({ top: 0 });
    pararDemo.current = reproduzir(GUIAO, { hora: setTempo, foco: setFoco, publicar, legenda: setLegenda, fim: terminarDemo });
  };
  useEffect(() => terminarDemo, [terminarDemo]);
  // qualquer gesto de quem está a ver interrompe a demonstração automática
  const manual = (fazer) => (...args) => {
    if (pararDemo.current) terminarDemo();
    fazer(...args);
  };

  // o tema vale para a página inteira, incluindo o fundo e os avisos de carregamento
  useLayoutEffect(() => {
    document.documentElement.dataset.tema = tema;
  }, [tema]);
  const trocarTema = () => {
    const novo = tema === 'aveiro' ? 'sinaletica' : 'aveiro';
    setTema(novo);
    guardarTema(novo);
  };
  const nomeDoTema = tema === 'aveiro' ? 'Voltar às cores originais' : 'Mudar para as cores de Aveiro';

  const verResposta = (caminho, chave) => {
    setPedidoConsola({ caminho, chave, n: Date.now() });
    document.getElementById('experimentar').scrollIntoView({ behavior: 'smooth' });
  };

  if (erro && !base) {
    return (
      <div className="aviso-pagina">
        Não foi possível falar com a API ({erro}). Confirma que está a correr (iniciar.bat) e recarrega a página.
      </div>
    );
  }
  if (!base || !cen || !camadas) return <div className="aviso-pagina">A ligar à API Aveiro em Movimento…</div>;

  const simulado = cen.cenario === 'chuva' || cen.incidente;
  const condicoes = [cen.cenario === 'chuva' ? 'dia de chuva' : null, cen.incidente ? 'incidente na Av. de Santa Joana' : null].filter(Boolean).join(' e ');
  const resumo = camadas.resumo;
  const destaques = Object.fromEntries(CONSUMIDORES.map((c) => [c.id, cartoes[c.id] && cartoes[c.id].dados ? cartoes[c.id].dados.mapa : null]));

  return (
    <div className="pagina">
      <header className="topo">
        <a className="marca" href="./" aria-label="Aveiro em Movimento, início">
          <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
            <rect className="marca-fundo" width="32" height="32" rx="7" />
            <path className="marca-risca" d="M5 23l3-14h3.2l-3 14zM12.4 23l3-14h3.2l-3 14zM19.8 23l3-14H26l-3 14z" />
          </svg>
          <span>
            <strong>Aveiro em Movimento</strong>
            <small>API de mobilidade da cidade</small>
          </span>
        </a>
        <h1>Os sensores medem. A API responde. Cada entidade age.</h1>
        <nav>
          <a href="#metricas">Métricas</a>
          <a href="#experimentar">Experimentar</a>
          <a href="./docs" target="_blank" rel="noreferrer">Documentação</a>
          <button type="button" className={'demo' + (emDemo ? ' on' : '')} onClick={emDemo ? terminarDemo : iniciarDemo}>
            {emDemo ? 'Parar a demonstração' : 'Reproduzir demonstração'}
          </button>
          <button type="button" className="tema" aria-label={nomeDoTema} title={nomeDoTema} onClick={trocarTema}>
            <span className="tema-cores" aria-hidden="true"><i /><i /><i /><i /></span>
          </button>
        </nav>
      </header>

      {erro && <p className="aviso-linha" role="alert">Um pedido à API falhou: {erro}</p>}

      <main>
        <section className="palco" aria-label="A cidade agora e quem usa a API">
          <div className="cidade">
            <div className="cidade-topo">
              <h2>
                Aveiro às <Relogio tempo={tempo} />
              </h2>
              <dl className="verticais">
                <Vertical nome="ruas lentas" valor={resumo.lentas} />
                <Vertical nome="travessias a pé por hora" valor={resumo.travessias} />
                <Vertical nome="lugares livres" valor={resumo.livres} />
                <Vertical nome="presenças turísticas por hora" valor={resumo.presencas} />
              </dl>
              {simulado ? (
                <p><span className="etiqueta-desvio">Simulação</span> {condicoes}, sobre o perfil medido pelos sensores</p>
              ) : (
                <p>Dia útil típico, medido pelos sensores do ATCLL de 3 a 10 de novembro de 2026</p>
              )}
            </div>
            <div className="mapa" style={{ aspectRatio: base.mapa.viewBox[2] + ' / ' + base.mapa.viewBox[3] }}>
              <Mapa
                mapa={base.mapa}
                ruas={base.ruas}
                niveis={camadas.niveis}
                passadeiras={camadas.passadeiras}
                postes={base.est.postes}
                locais={base.locais}
                presencas={camadas.presencas}
                zonas={base.zonas}
                destaques={destaques}
                foco={foco}
                hora={hora}
                fracao={camadas.fracao}
                incidente={cen.incidente}
              />
              {legenda && <p className="legenda-demo" aria-live="polite">{legenda}</p>}
            </div>
            <ul className="legenda" aria-label="Legenda do mapa">
              <li><i className="traco n0" />fluido</li>
              <li><i className="traco n1" />moderado</li>
              <li><i className="traco n2" />lento</li>
              <li><i className="ponto" />passadeira</li>
              <li><i className="p">P</i>lugares livres</li>
              <li><i className="anel" />local turístico</li>
            </ul>
            <Controlos
              tempo={tempo}
              passo={PASSO}
              aTocar={aTocar}
              sozinho={aTocar || emDemo}
              velocidade={velocidade}
              segundosDoDia={(((H1 - H0) / PASSO) * MS_PASSO) / velocidade / 1000}
              cen={cen}
              aoMudarHora={manual(setTempo)}
              aoTocar={manual(alternarDia)}
              aoMudarVelocidade={setVelocidade}
              aoPublicar={manual(publicar)}
            />
          </div>

          <div className="consumidores">
            {CONSUMIDORES.map((c, i) => (
              <Cartao
                key={c.id}
                consumidor={c}
                estado={cartoes[c.id]}
                ativo={foco === c.id}
                apagado={foco !== 'todos' && foco !== c.id}
                atraso={i * 90}
                aoFocar={manual(() => setFoco((f) => (f === c.id ? 'todos' : c.id)))}
                aoVerResposta={manual(verResposta)}
              />
            ))}
          </div>

          <Registo contagens={contagens} ligado={ligado} />
        </section>

        <Metricas cliente={plataforma} hora={hora} tempo={tempo} cen={cen} versao={versaoDe(cen)} aoMudarHora={manual(setTempo)} aoVerResposta={manual((caminho) => verResposta(caminho, CHAVES.camara))} />

        <Consola pedido={pedidoConsola} />
        <Adotar />
      </main>

      <footer>
        Protótipo para o desafio 1 do Aveiro Tech City Hackathon 2026, "Smart Aveiro: From Data to Action". Dados do Aveiro Tech City Living Lab (Instituto de Telecomunicações), agregados por hora e por local. As respostas são sugestões a partir de uma semana de dados; associação não implica causalidade.
      </footer>
    </div>
  );
}
