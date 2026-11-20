import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, ouvirEventos } from './api.js';
import { H0, H1, HORAS, LinhasDoDia, MiniCurva, hh, topoRedondo } from './graficos.jsx';

const AZUL = '#3987e5';
const VERDE = '#199e70';
const MAGENTA = '#d55181';
const CINZA = '#9c9b92';

const PERSONAS = [
  { id: 'todos', nome: 'Todos' },
  { id: 'municipio', nome: 'Município' },
  { id: 'comerciantes', nome: 'Comerciantes' },
  { id: 'cidadaos', nome: 'Cidadãos' },
  { id: 'logistica', nome: 'Logística' },
];
const NIVEIS = ['pouco', 'intermédio', 'intenso'];
// Em desenvolvimento a API está noutra porta; na versão compilada é a mesma origem.
const DOCS = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')) + '/docs';
const fmt = (v, casas = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-PT', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
const sinal = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
const maxEntre = (serie) => Math.max(...HORAS.map((h) => serie[h] ?? 0));
const horaDoMax = (serie, de = H0, ate = H1) => {
  let m = de;
  for (let h = de; h <= ate; h++) if ((serie[h] ?? -1) > (serie[m] ?? -1)) m = h;
  return m;
};

function Cartao({ publico, persona, className = '', children, ...resto }) {
  const estado = persona === 'todos' ? '' : publico.includes(persona) ? ' rel' : ' dim';
  return (
    <article className={'cartao ' + className + estado} {...resto}>
      {children}
    </article>
  );
}

export default function App() {
  const [zonas, setZonas] = useState([]);
  const [est, setEst] = useState(null);
  const [cen, setCen] = useState({ cenario: 'normal', incidente: false });
  const [zona, setZona] = useState('25-abril');
  const [comparar, setComparar] = useState('universidade');
  const [hora, setHora] = useState(13);
  const [persona, setPersona] = useState('todos');
  const [aTocar, setATocar] = useState(false);
  const [perfis, setPerfis] = useState({});
  const [relacoes, setRelacoes] = useState({});
  const [registo, setRegisto] = useState([]);
  const [erro, setErro] = useState(null);
  const pedidos = useRef(new Set());

  // dados iniciais + eventos em tempo real
  useEffect(() => {
    Promise.all([api.zonas(), api.estacionamento(), api.cenario(), api.registo()])
      .then(([z, e, c, r]) => {
        setZonas(z);
        setEst(e);
        setCen({ cenario: c.cenario, incidente: c.incidente });
        setRegisto(r);
      })
      .catch((e) => setErro(e.message));
    return ouvirEventos((tipo, d) => {
      if (tipo === 'pedido') setRegisto((r) => [d, ...r].slice(0, 30));
      else setCen({ cenario: d.cenario, incidente: d.incidente });
    });
  }, []);

  // perfis das duas zonas e associações da zona escolhida, para o cenário em vigor
  useEffect(() => {
    [zona, comparar].forEach((z) => {
      const k = z + '|' + cen.cenario;
      if (pedidos.current.has('p' + k)) return;
      pedidos.current.add('p' + k);
      api.perfil(z, cen.cenario).then((p) => setPerfis((o) => ({ ...o, [k]: p }))).catch((e) => setErro(e.message));
    });
    const k = zona + '|' + cen.cenario;
    if (!pedidos.current.has('r' + k)) {
      pedidos.current.add('r' + k);
      api.relacoes(zona, cen.cenario).then((r) => setRelacoes((o) => ({ ...o, [k]: r }))).catch((e) => setErro(e.message));
    }
  }, [zona, comparar, cen.cenario]);

  // animação do dia
  useEffect(() => {
    if (!aTocar) return undefined;
    const t = setInterval(() => setHora((h) => (h >= H1 ? H0 : h + 1)), 900);
    return () => clearInterval(t);
  }, [aTocar]);

  const publicar = (cenario, incidente) => {
    setCen({ cenario, incidente });
    api.mudarCenario(cenario, incidente).catch((e) => setErro(e.message));
  };

  const P = perfis[zona + '|' + cen.cenario];
  const Q = perfis[comparar + '|' + cen.cenario];
  const R = relacoes[zona + '|' + cen.cenario];
  const chuva = cen.cenario === 'chuva';

  const v = useMemo(() => {
    if (!P || !Q || !R || !est) return null;
    const nomeZ = P.zona.nome;
    const nomeC = Q.zona.nome;
    const peoes = P.peoes_hora[hora];
    const dia = HORAS.map((h) => P.peoes_hora[h]);
    const media = Math.round(dia.reduce((a, b) => a + b, 0) / dia.length);
    const espera = P.espera_s[hora];
    const esperas = HORAS.map((h) => P.espera_s[h]).filter((x) => x != null);
    const temKmh = P.velocidade_kmh.some((x) => x != null);
    const vel = temKmh ? P.velocidade_kmh[hora] : P.fluidez[hora] == null ? null : Math.round(P.fluidez[hora] * 100);
    const serieVel = temKmh ? P.velocidade_kmh : P.fluidez.map((f) => (f == null ? null : f * 100));
    const nivel = P.nivel_transito[hora];
    const livres = est.livres[hora];
    const ocupados = est.ocupados[hora];
    const picoZ = horaDoMax(P.peoes_hora);
    const picoC = horaDoMax(Q.peoes_hora);
    let fluida = 9;
    for (let h = 9; h <= 19; h++) if ((P.fluidez[h] ?? 0) > (P.fluidez[fluida] ?? 0)) fluida = h;
    let calma = 8;
    for (let h = 8; h <= 19; h++) if (P.veiculos_hora[h] < P.veiculos_hora[calma]) calma = h;
    const acima = P.acima_limite[hora];

    const frases = {
      todos: `Trânsito ${NIVEIS[nivel]} em ${nomeZ}: ${fmt(peoes)} travessias a pé por hora, ${fmt(espera, 1)} s de espera média e ${fmt(livres)} lugares livres na cidade.`,
      municipio: `${nomeZ}: ${fmt(peoes)} peões e ${fmt(P.veiculos_hora[hora])} veículos por hora${acima == null ? '' : `, com ${fmt(acima * 100)}% dos veículos acima do limite`}. O pico pedonal é às ${picoZ}h; em ${nomeC} é às ${picoC}h.`,
      comerciantes: `Passam ${fmt(peoes)} pessoas a pé por hora em ${nomeZ}. O pico do dia é às ${picoZ}h, com ${fmt(P.peoes_hora[picoZ])} por hora.`,
      cidadaos: `Há ${fmt(livres)} lugares livres na cidade e a espera média para atravessar em ${nomeZ} é de ${fmt(espera, 1)} s. Entre as 8h e as 19h, a hora com menos carros é às ${calma}h.`,
      logistica: `Circula-se a ${temKmh ? fmt(vel) + ' km/h' : fmt(vel) + '% da velocidade livre'} em ${nomeZ} (trânsito ${NIVEIS[nivel]}). Entre as 9h e as 19h, a hora mais fluida é às ${fluida}h.`,
    };

    const topoDia = topoRedondo(Math.max(maxEntre(P.peoes_hora), maxEntre(Q.peoes_hora)));
    const ladoZ = picoZ <= picoC ? 'esq' : 'dir';
    const marcas =
      zona === comparar
        ? [{ hora: picoZ, valor: P.peoes_hora[picoZ], lado: 'dir', texto: `Pico ${picoZ}h` }]
        : [
            { hora: picoZ, valor: P.peoes_hora[picoZ], lado: xLado(picoZ, ladoZ), texto: `${curto(nomeZ)} · pico ${picoZ}h` },
            { hora: picoC, valor: Q.peoes_hora[picoC], lado: xLado(picoC, ladoZ === 'esq' ? 'dir' : 'esq'), texto: `${curto(nomeC)} · pico ${picoC}h` },
          ];
    const difPicos = Math.abs(picoZ - picoC);
    const semDados = P.passadeiras_sem_dados_recentes.length;
    const fraseDia =
      (zona === comparar ? `${nomeZ} tem o pico pedonal às ${picoZ}h, com ${fmt(P.peoes_hora[picoZ])} peões por hora.` : difPicos === 0 ? `As duas zonas têm o pico pedonal às ${picoZ}h.` : `${nomeZ} tem o pico às ${picoZ}h e ${nomeC} às ${picoC}h: ${difPicos} h de intervalo.`) +
      (semDados ? ` ${semDados} das ${P.zona.passadeiras.length} passadeiras de ${nomeZ} não enviam dados desde 4 de novembro.` : '');

    const gEst = R.estacionamento_vs_peoes.grupos;
    const topoEst = Math.max(...gEst.map((g) => g.peoes_hora ?? 0), 1);
    const grupoAgora = gEst.findIndex((g) => g.horas.includes(hora));
    const maisPeoes = gEst.reduce((a, g) => ((g.peoes_hora ?? 0) > (a.peoes_hora ?? 0) ? g : a), gEst[0]);
    const fraseEst = maisPeoes.grupo === 'Muito ocupado' ? 'Nesta zona, as horas com o estacionamento mais ocupado são também as de mais movimento a pé.' : `Nesta zona, o maior movimento a pé surge com o estacionamento "${maisPeoes.grupo.toLowerCase()}", não com o mais cheio.`;

    const gTr = R.transito_vs_velocidade.grupos;
    const topoTr = Math.max(...gTr.map((g) => g.valor ?? 0), 1);
    const [vPouco, vIntenso] = [gTr[0].valor, gTr[2].valor];
    const queda = vPouco && vIntenso != null ? Math.round((1 - vIntenso / vPouco) * 100) : null;
    const fraseTr =
      queda == null
        ? 'Sem horas suficientes em todos os níveis de trânsito.'
        : queda >= 3
          ? `Com trânsito intenso circula-se ${queda}% mais devagar do que com pouco trânsito.`
          : queda <= -3
            ? 'Nesta zona, as horas de trânsito intenso não são as mais lentas: circula-se pior nas horas de pouco trânsito.'
            : 'Nesta zona, a velocidade quase não muda com o nível de trânsito.';

    const topoEsp = topoRedondo(Math.max(...esperas, P.travessia_mediana_s));
    const fraseEsp = `A travessia demora ${fmt(P.travessia_mediana_s, 1)} s (mediana da semana). A espera média vai de ${fmt(Math.min(...esperas), 1)} s a ${fmt(Math.max(...esperas), 1)} s ao longo do dia.`;

    return {
      nomeZ, nomeC, peoes, media, espera, vel, serieVel, nivel, livres, ocupados, temKmh, frases, topoDia, marcas, fraseDia,
      gEst, topoEst, grupoAgora, fraseEst, gTr, topoTr, fraseTr, topoEsp, fraseEsp,
    };
  }, [P, Q, R, est, hora, zona, comparar]);

  if (erro) {
    return (
      <div className="pagina">
        <div className="aviso">
          Não foi possível falar com a API ({erro}). Confirma que está a correr em http://localhost:8000 e recarrega a página.
        </div>
      </div>
    );
  }
  if (!v) return <div className="pagina"><div className="aviso">A carregar os indicadores…</div></div>;

  const origem = chuva ? 'simulação de chuva' : 'dados reais';
  const outros = registo.filter((l) => !l.entidade.startsWith('Câmara')).slice(0, 5);
  const totalMonit = est.lugares;

  return (
    <div className="pagina">
      <div className="coluna">
        <header className="topo">
          <div className="titulo">
            <h1>Aveiro · Movimento, utilização e tempo</h1>
            <span className="selo">{chuva ? 'Simulação: dia de chuva' : 'Dados reais · dias úteis, 3–10 nov 2026'}</span>
            <a className="selo" href="../">Portal da API</a>
          </div>
          <div className="grupo-botoes" role="group" aria-label="Leitura para">
            <span className="rotulo">Leitura para</span>
            {PERSONAS.map((p) => (
              <button key={p.id} type="button" className={'botao' + (persona === p.id ? ' ativo' : '')} aria-pressed={persona === p.id} onClick={() => setPersona(p.id)}>
                {p.nome}
              </button>
            ))}
          </div>
        </header>

        <section className="barra" aria-label="Controlos">
          <div className="hora">
            <button type="button" className="tocar" aria-label={aTocar ? 'Pausar a animação do dia' : 'Reproduzir o dia'} onClick={() => setATocar((t) => !t)}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24">
                {aTocar ? <path d="M6 4.5h4.5v15H6zM13.5 4.5H18v15h-4.5z" /> : <path d="M7 4.5v15l13-7.5z" />}
              </svg>
            </button>
            <span className="relogio">{hh(hora)}</span>
          </div>
          <div className="deslizar">
            <span>06:00</span>
            <label htmlFor="hora" className="so-leitor">Hora do dia</label>
            <input id="hora" type="range" min={H0} max={H1} step="1" value={hora} onChange={(e) => setHora(Number(e.target.value))} />
            <span>22:00</span>
          </div>
          <div className="campo">
            <label htmlFor="zona"><i style={{ background: AZUL }} aria-hidden="true" />Zona</label>
            <select id="zona" value={zona} onChange={(e) => setZona(e.target.value)}>
              {zonas.map((z) => <option key={z.id} value={z.id}>{z.nome}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="comparar"><i style={{ background: VERDE }} aria-hidden="true" />Comparar com</label>
            <select id="comparar" value={comparar} onChange={(e) => setComparar(e.target.value)}>
              {zonas.map((z) => <option key={z.id} value={z.id}>{z.nome}</option>)}
            </select>
          </div>
          <div className="campo cenario">
            <span className="rotulo">Cenário em vigor · publicado na API</span>
            <div className="grupo-botoes" role="group" aria-label="Cenário em vigor">
              <button type="button" className={'botao' + (!chuva ? ' ativo' : '')} aria-pressed={!chuva} onClick={() => publicar('normal', cen.incidente)}>Dia normal</button>
              <button type="button" className={'botao' + (chuva ? ' ativo' : '')} aria-pressed={chuva} onClick={() => publicar('chuva', cen.incidente)}>Dia de chuva</button>
              <button type="button" className={'botao' + (cen.incidente ? ' alerta' : '')} aria-pressed={cen.incidente} onClick={() => publicar(cen.cenario, !cen.incidente)}>
                Incidente · Av. de Santa Joana
              </button>
            </div>
          </div>
        </section>

        <section className="leitura" aria-live="polite">
          <span className="etiqueta">Agora · {hh(hora)} · {v.nomeZ}</span>
          <p>{v.frases[persona]}</p>
        </section>

        <section className="indicadores" aria-label="Indicadores">
          <Cartao className="kpi" publico={['cidadaos', 'logistica']} persona={persona}>
            <span className="kpi-nome">Lugares livres na cidade</span>
            <div className="kpi-linha">
              <div><b>{fmt(v.livres)}</b><span>de {fmt(totalMonit)}</span></div>
              <MiniCurva serie={est.livres} hora={hora} />
            </div>
            <span className="kpi-sub">{fmt(v.ocupados)} ocupados · {fmt(est.sem_informacao)} sem informação</span>
          </Cartao>
          <Cartao className="kpi" publico={['comerciantes', 'municipio']} persona={persona}>
            <span className="kpi-nome">Travessias a pé</span>
            <div className="kpi-linha">
              <div><b>{fmt(v.peoes)}</b><span>/ hora</span></div>
              <MiniCurva serie={P.peoes_hora} hora={hora} />
            </div>
            <span className="kpi-sub">{sinal(v.peoes - v.media)} face à média do dia ({fmt(v.media)})</span>
          </Cartao>
          <Cartao className="kpi" publico={['cidadaos', 'municipio']} persona={persona}>
            <span className="kpi-nome">Espera para atravessar</span>
            <div className="kpi-linha">
              <div><b>{fmt(v.espera, 1)}</b><span>s</span></div>
              <MiniCurva serie={P.espera_s} hora={hora} />
            </div>
            <span className="kpi-sub">média nesta hora · travessia de {fmt(P.travessia_mediana_s, 1)} s</span>
          </Cartao>
          <Cartao className="kpi" publico={['logistica', 'municipio']} persona={persona}>
            <span className="kpi-nome">{v.temKmh ? 'Velocidade média' : 'Fluidez do trânsito'}</span>
            <div className="kpi-linha">
              <div><b>{fmt(v.vel)}</b><span>{v.temKmh ? 'km/h' : '%'}</span></div>
              <MiniCurva serie={v.serieVel} hora={hora} />
            </div>
            <span className="kpi-sub">Trânsito {NIVEIS[v.nivel]} nesta hora{v.temKmh ? '' : ' · zona sem radar'}</span>
          </Cartao>
        </section>

        <section className="fila">
          <Cartao className="largo" publico={['municipio', 'comerciantes']} persona={persona}>
            <div className="cab">
              <div>
                <h2>Quando é que cada zona tem mais movimento?</h2>
                <span className="sub">Travessias a pé por hora · clica no gráfico para mudar a hora</span>
              </div>
              <div className="legenda">
                <b>{hh(hora)}</b>
                <span><i style={{ background: AZUL }} aria-hidden="true" />{v.nomeZ} <b>{fmt(P.peoes_hora[hora])}</b></span>
                {zona !== comparar && <span><i style={{ background: VERDE }} aria-hidden="true" />{v.nomeC} <b>{fmt(Q.peoes_hora[hora])}</b></span>}
              </div>
            </div>
            <LinhasDoDia
              altura={150}
              topo={v.topoDia}
              hora={hora}
              aoEscolherHora={setHora}
              rotulo="Travessias a pé por hora ao longo do dia, nas duas zonas"
              marcas={v.marcas}
              series={zona === comparar ? [{ nome: v.nomeZ, cor: AZUL, valores: P.peoes_hora, destaque: true }] : [{ nome: v.nomeZ, cor: AZUL, valores: P.peoes_hora, destaque: true }, { nome: v.nomeC, cor: VERDE, valores: Q.peoes_hora, destaque: false }]}
            />
            <div className="rodape">
              <p className="forte">{v.fraseDia}</p>
              <span className="publico">Município · comerciantes · {origem}</span>
            </div>
          </Cartao>

          <Cartao className="estreito" publico={['cidadaos', 'logistica']} persona={persona}>
            <div>
              <h2>Há lugares livres agora?</h2>
              <span className="sub">Estado dos {fmt(totalMonit)} lugares monitorizados na cidade</span>
            </div>
            <div className="heroi"><b>{fmt(v.livres)}</b><span>lugares livres</span></div>
            <div className="barra-partes" role="img" aria-label={`${v.livres} lugares livres, ${v.ocupados} ocupados e ${est.sem_informacao} sem informação, em ${totalMonit}`}>
              <div className="livres" style={{ width: (v.livres / totalMonit) * 100 + '%' }} title="Livres" />
              <div className="ocupados" style={{ width: (v.ocupados / totalMonit) * 100 + '%' }} title="Ocupados" />
              <div className="sem-info" style={{ width: (est.sem_informacao / totalMonit) * 100 + '%' }} title="Sem informação" />
            </div>
            <div className="legenda partes">
              <span><i className="q livres" aria-hidden="true" />Livres <b>{fmt(v.livres)}</b></span>
              <span><i className="q ocupados" aria-hidden="true" />Ocupados <b>{fmt(v.ocupados)}</b></span>
              <span><i className="q sem-info" aria-hidden="true" />Sem informação <b>{fmt(est.sem_informacao)}</b></span>
            </div>
            <p>Sobre os {fmt(est.sem_informacao)} lugares sem informação (poste sem dados desde 4 de novembro) não é possível concluir disponibilidade.</p>
            <span className="publico fundo">Cidadãos · logística · dados reais</span>
          </Cartao>
        </section>

        <section className="fila">
          <Cartao className="terco" publico={['comerciantes', 'municipio']} persona={persona}>
            <div>
              <h2>Estacionamento cheio, mais movimento a pé?</h2>
              <span className="sub">Travessias por hora em {v.nomeZ}, por ocupação do estacionamento</span>
            </div>
            <div className="colunas">
              {v.gEst.map((g, i) => (
                <div key={g.grupo} className={'col' + (i === v.grupoAgora ? ' agora' : '')}>
                  {i === v.grupoAgora && <span className="tag">agora</span>}
                  <span className="valor">{fmt(g.peoes_hora)}</span>
                  <div className="barra-v" style={{ height: Math.max(2, ((g.peoes_hora ?? 0) / v.topoEst) * 70) }} title={`${g.grupo}: ${fmt(g.peoes_hora)} travessias por hora`} />
                </div>
              ))}
            </div>
            <div className="colunas-nomes">
              {v.gEst.map((g, i) => (
                <span key={g.grupo} className={i === v.grupoAgora ? 'agora' : ''}>{g.grupo}<small>{fmt(g.ocupacao_de * 100)}–{fmt(g.ocupacao_ate * 100)}%</small></span>
              ))}
            </div>
            <p>{v.fraseEst} É uma associação por hora, sem identificar pessoas.</p>
            <span className="publico fundo">Comerciantes · município · {origem}</span>
          </Cartao>

          <Cartao className="terco" publico={['logistica', 'municipio']} persona={persona}>
            <div>
              <h2>Como muda a velocidade com o trânsito?</h2>
              <span className="sub">{v.temKmh ? 'Velocidade média, em km/h' : 'Fluidez, em % da velocidade livre'}, por nível de trânsito</span>
            </div>
            <div className="linhas-h">
              {v.gTr.map((g, i) => (
                <div key={g.nivel} className={'lin' + (i === v.nivel ? ' agora' : '')}>
                  <span className="nome">{g.nivel[0].toUpperCase() + g.nivel.slice(1)}</span>
                  <div className="pista">
                    <div className="barra-h" style={{ width: ((g.valor ?? 0) / v.topoTr) * 66 + '%' }} title={`Trânsito ${g.nivel}: ${fmt(g.valor, v.temKmh ? 1 : 0)} ${v.temKmh ? 'km/h' : '%'}`} />
                    <span className="valor">{fmt(g.valor, v.temKmh ? 1 : 0)}</span>
                    {i === v.nivel && <span className="tag">agora</span>}
                  </div>
                </div>
              ))}
            </div>
            <p>{v.fraseTr}</p>
            <span className="publico fundo">Logística · município · {origem}{v.temKmh ? ' · só radares' : ''}</span>
          </Cartao>

          <Cartao className="terco" publico={['cidadaos', 'municipio']} persona={persona}>
            <div>
              <h2>Quanto tempo é espera e quanto é travessia?</h2>
              <span className="sub">Segundos por atravessamento ao longo do dia, em {v.nomeZ}</span>
            </div>
            <div className="legenda">
              <b>{hh(hora)}</b>
              <span><i style={{ background: MAGENTA }} aria-hidden="true" />Espera <b>{fmt(v.espera, 1)} s</b></span>
              <span><i style={{ background: CINZA }} aria-hidden="true" />Travessia <b>{fmt(P.travessia_mediana_s, 1)} s</b></span>
            </div>
            <LinhasDoDia
              altura={96}
              topo={v.topoEsp}
              hora={hora}
              aoEscolherHora={setHora}
              rotulo="Tempo de espera e tempo de travessia, em segundos, ao longo do dia"
              horasEixo={[6, 14, 22]}
              series={[{ nome: 'Espera', cor: MAGENTA, valores: P.espera_s }, { nome: 'Travessia', cor: CINZA, valores: P.espera_s.map(() => P.travessia_mediana_s) }]}
            />
            <p>{v.fraseEsp}</p>
            <span className="publico fundo">Cidadãos · município · dados reais</span>
          </Cartao>
        </section>

        <section className="cartao api" aria-label="Atividade da API">
          <div className="cab">
            <div>
              <h2>Quem está a usar estes dados pela API</h2>
              <span className="sub">Últimos pedidos de outras entidades · os mesmos indicadores deste painel</span>
            </div>
            <a href={DOCS} target="_blank" rel="noreferrer">Documentação da API</a>
          </div>
          {outros.length === 0 ? (
            <p>Ainda sem pedidos de outras entidades. Abre o planeador da Ria Express para ver os pedidos a chegar.</p>
          ) : (
            <ul className="pedidos">
              {outros.map((l) => (
                <li key={l.n}>
                  <span className="quando">{l.quando.slice(11, 19)}</span>
                  <b>{l.entidade}</b>
                  <code>{l.pedido}</code>
                  <span className="ok">{l.estado} · {fmt(l.ms)} ms</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer>
          Dias úteis de 3 a 10 de novembro de 2026, sensores do ATCLL, agregados por hora e por local. O dia de chuva e o incidente são simulados sobre o perfil real. Associação não implica causalidade.
        </footer>
      </div>
    </div>
  );
}

// Perto das margens, o rótulo do pico vira para dentro do gráfico.
function xLado(h, preferido) {
  if (h <= H0 + 3) return 'dir';
  if (h >= H1 - 3) return 'esq';
  return preferido;
}

// Nome curto da zona para rótulos dentro do gráfico.
function curto(nome) {
  return nome.split(' · ')[0];
}
