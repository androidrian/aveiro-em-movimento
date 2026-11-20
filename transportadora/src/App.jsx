import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, ouvirCenario, textoDoPedido } from './api.js';
import { PONTOS, PRAZOS, SERVICO } from './dados.js';
import { criarT, horaDe, percorrer, planear } from './planeador.js';

const TEAL = '#00707A';
const INK = '#202124';
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const NIVEL = ['Fluido', 'Moderado', 'Lento'];
const NOMES_CEN = { normal: 'dia normal', chuva: 'dia de chuva' };
const NORMAL = { vivo: false, cenario: 'normal', incidente: false, versao: '' };
// A mensagem "A validar o caminho" fica pelo menos este tempo, para se conseguir ler (a API responde em milésimos).
const MS_VALIDACAO = 900;

const hm = (m) => { const t = Math.round(m); return Math.floor(t / 60) + 'h' + String(t % 60).padStart(2, '0'); };
const hc = (m) => { const t = Math.round(m); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
const num = (x, d) => x.toFixed(d).replace('.', ',');
const fmt = (x) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const pd = (k) => new Date(k + 'T12:00:00Z');
const maisDias = (k, n) => { const d = pd(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const rotuloDia = (k) => { const d = pd(k); return DIAS[d.getUTCDay()] + ', ' + d.getUTCDate() + '/' + (d.getUTCMonth() + 1); };
const hojeLocal = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const HOJE = hojeLocal();
const chaveDe = (c) => [c.vivo, c.cenario, c.incidente, c.versao].join('|');
const esperar = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const semMovimento = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Entregas agendadas por dia (fictício): hoje são as 10; noutros dias úteis, cerca de 7; ao fim de semana, nenhuma.
function agenda(k) {
  const todas = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  if (k === HOJE) return todas;
  const d = pd(k);
  if (d.getUTCDay() === 0 || d.getUTCDay() === 6) return [];
  return todas.filter((i) => (d.getUTCDate() * 3 + i * 7) % 10 < 7);
}

/** Tempos de percurso entre todos os pontos, da hora de `desde` em diante, nas condições `cond`. */
async function temposDe(cond, desde) {
  const h0 = horaDe(desde);
  const horas = [];
  for (let h = h0; h <= Math.min(23, h0 + 5); h++) horas.push(h);
  const r = await Promise.all(horas.map((h) => api.tempos(h, cond, cond.versao)));
  return { T: criarT(Object.fromEntries(horas.map((h, i) => [h, r[i].minutos]))), pontos: r[0].pontos, hora0: h0 };
}
/** O caminho rua a rua de cada troço. Cada um fica a saber de onde vem e para onde vai. */
const geometria = (trocos, cond) => Promise.all(trocos.map((t) => api.percurso(t.de, t.para, t.hora, cond, cond.versao).then((g) => ({ ...g, de: t.de, para: t.para }))));

const Icone = ({ d, tamanho = 20, cor = '#5F6368', grosso = 2, children }) => (
  <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} aria-hidden="true" fill="none" stroke={cor} strokeWidth={grosso} strokeLinecap="round" strokeLinejoin="round">
    {d && <path d={d} />}
    {children}
  </svg>
);
const CASA = 'M3 11l9-7 9 7v9H3z M9 20v-6h6v6';
const AVISO = 'M12 4l9 16H3z M12 10v4 M12 17.5v.5';
const VISTO = 'M5 12.5l4.5 4.5L19 7.5';
const Carrinha = (p) => (
  <Icone d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" {...p}>
    <circle cx="7.5" cy="17.5" r="1.6" />
    <circle cx="17.5" cy="17.5" r="1.6" />
  </Icone>
);

function SeletorHora({ rotulo, valor, opcoes, aberto, aoAbrir, aoMudar, antes, depois }) {
  return (
    <div className="campo" style={{ flex: '0 0 140px' }}>
      <div className="campo-rotulo">{rotulo}</div>
      <div className="campo-caixa">
        <div className="campo-linha">
          <button type="button" className="campo-valor" aria-label={rotulo} aria-expanded={aberto} onClick={aoAbrir}>
            <Icone d="M12 7v5l3 2"><circle cx="12" cy="12" r="9" /></Icone>
            <span>{hc(valor)}</span>
          </button>
          <button type="button" className="seta" aria-label={antes} onClick={() => aoMudar(valor - 30)}><Icone d="M14 7l-5 5 5 5" tamanho={18} cor={INK} /></button>
          <button type="button" className="seta" aria-label={depois} onClick={() => aoMudar(valor + 30)}><Icone d="M10 7l5 5-5 5" tamanho={18} cor={INK} /></button>
        </div>
        {aberto && (
          <div role="listbox" className="lista-horas">
            {opcoes.map((m) => (
              <button key={m} type="button" role="option" aria-selected={m === valor} className={m === valor ? 'on' : ''} onClick={() => aoMudar(m)}>{hc(m)}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Quando a ordem das linhas muda, cada uma desliza do sítio onde estava para o sítio novo. */
function useDeslizar(ref, ordem) {
  const antes = useRef({ ordem: '', topos: new Map() });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const linhas = [...ref.current.querySelectorAll('[data-k]')];
    const topos = new Map(linhas.map((l) => [l.dataset.k, l.offsetTop]));
    if (antes.current.ordem !== ordem && !semMovimento()) {
      linhas.forEach((l) => {
        const de = antes.current.topos.get(l.dataset.k);
        if (de == null || Math.abs(de - l.offsetTop) < 1) return;
        l.animate([{ transform: 'translateY(' + (de - l.offsetTop) + 'px)' }, { transform: 'none' }], { duration: 700, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
      });
    }
    antes.current = { ordem, topos };
  });
}

export default function App() {
  const [mapa, setMapa] = useState(null);
  const [vivo, setVivo] = useState(null); // cenário em vigor na API da cidade
  const [modo, setModo] = useState('live');
  const [cen, setCen] = useState('normal');
  const [simInc, setSimInc] = useState(false);
  const [data, setData] = useState(HOJE);
  const [partida, setPartida] = useState(480);
  const [termino, setTermino] = useState(630);
  const [aberto, setAberto] = useState(null);
  const [cal, setCal] = useState({ y: pd(HOJE).getUTCFullYear(), m: pd(HOJE).getUTCMonth() });
  const [selK, setSelK] = useState(null);
  // A rota: as entregas feitas, as que faltam (P), onde está a carrinha (`origem`) e a que minuto sai de lá (`agora`).
  const [rota, setRota] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [erro, setErro] = useState(null);
  const rotaRef = useRef(null);
  const vez = useRef(0); // só a validação mais recente pode mexer na rota
  const aValidar = useRef(''); // condições que já estão a ser validadas
  const linhasRef = useRef(null);
  const aplicar = (r) => { rotaRef.current = r; setRota(r); };

  useEffect(() => {
    api.mapa().then(setMapa).catch((e) => setErro(e.message));
    return ouvirCenario((c) => setVivo({ cenario: c.cenario, incidente: c.incidente, desde: c.desde }));
  }, []);

  const emDireto = modo === 'live';
  const cond = useMemo(
    () => (emDireto ? (vivo ? { vivo: true, cenario: vivo.cenario, incidente: vivo.incidente, versao: vivo.desde } : null) : { vivo: false, cenario: cen, incidente: simInc, versao: '' }),
    [emDireto, vivo, cen, simInc],
  );
  const agendadas = useMemo(() => agenda(data), [data]);
  const condChave = cond ? chaveDe(cond) : '';
  const chaveRota = [data, partida, modo].join('|');

  // Rota nova, a partir do armazém: a melhor ordem para as condições em vigor.
  async function novaRota(c) {
    const n = ++vez.current;
    if (!agendadas.length) {
      aplicar(null);
      setAviso(null);
      return;
    }
    setAviso({ fase: 'a-validar', titulo: 'A calcular a rota…', texto: 'A pedir à API os tempos de percurso entre o armazém e os ' + agendadas.length + ' pontos de entrega.' });
    const eNormal = c.cenario === 'normal' && !c.incidente;
    const { T, pontos, hora0 } = await temposDe(c, partida);
    const P = planear(T, partida, agendadas, PRAZOS, SERVICO[c.cenario]);
    const base = eNormal ? P.total : planear((await temposDe(NORMAL, partida)).T, partida, agendadas, PRAZOS, SERVICO.normal).total;
    const trocos = await geometria(P.trocos, c);
    if (n !== vez.current) return;
    const anterior = rotaRef.current;
    aplicar({ chave: chaveRota, feitas: [], trocosFeitos: [], origem: 0, agora: partida, P: { ...P, trocos }, T, cond: c, condChave: chaveDe(c), base, pontos, hora0, versao: (anterior ? anterior.versao : 0) + 1, mudaram: [] });
    setSelK(null);
    setAviso({ fase: 'info', titulo: 'Rota calculada', texto: 'Marque cada entrega quando estiver feita. O caminho para as seguintes é validado com a API a cada passo.' });
  }

  // Valida o caminho das entregas que faltam, a partir de onde a carrinha está, com as condições em vigor na API.
  // Se o trânsito mudou e outra ordem é melhor, a ordem muda.
  async function validar() {
    const n = ++vez.current;
    const inicio = Date.now();
    const r = rotaRef.current;
    setAviso({ fase: 'a-validar', titulo: 'A validar o caminho…', texto: 'A confirmar com a API os tempos de percurso para as entregas que faltam.' });
    let c = cond;
    if (emDireto) {
      const a = await api.cenario();
      if (n !== vez.current) return;
      if (a.desde !== c.versao) {
        // a página ainda não tinha recebido o aviso desta mudança (por exemplo, o separador esteve escondido)
        c = { vivo: true, cenario: a.cenario, incidente: a.incidente, versao: a.desde };
        aValidar.current = chaveDe(c);
        setVivo({ cenario: a.cenario, incidente: a.incidente, desde: a.desde });
      }
    }
    const condMudou = chaveDe(c) !== r.condChave;
    const { T } = await temposDe(c, r.agora);
    const servico = SERVICO[c.cenario];
    const faltam = r.P.ordem;
    const mesma = percorrer(T, partida, faltam, PRAZOS, servico, r.origem, r.agora);
    let novo = mesma;
    if (condMudou && faltam.length > 1) {
      const melhor = planear(T, partida, faltam, PRAZOS, servico, r.origem, r.agora);
      // a meio da rota só se troca a ordem se valer a pena: menos entregas fora do prazo ou pelo menos meio minuto
      const valeAPena = !r.feitas.length || melhor.nAtrasos < mesma.nAtrasos || melhor.fim < mesma.fim - 0.5;
      if (melhor.ordem.join() !== faltam.join() && valeAPena) novo = melhor;
    }
    const trocos = await geometria(novo.trocos, c);
    await esperar(MS_VALIDACAO - (Date.now() - inicio));
    if (n !== vez.current) return;

    const mudouOrdem = novo !== mesma;
    const numero = (i) => r.feitas.length + i + 1;
    let novoAviso;
    if (!condMudou) {
      novoAviso = faltam.length
        ? { fase: 'ok', titulo: 'Caminho validado', texto: 'Trânsito sem alterações. Segue para a entrega ' + numero(0) + ', ' + PONTOS[faltam[0]].nome + ': chegada às ' + hc(novo.paragens[0].chegada) + '.' }
        : { fase: 'ok', titulo: 'Entregas concluídas', texto: 'Caminho de regresso validado: chegada ao armazém às ' + hc(novo.fim) + '.' };
    } else {
      // em que troço, mantendo a ordem, o tempo piorou mais (o último troço é o regresso ao armazém)
      const duracoes = (p) => p.paragens.map((s, i) => s.chegada - (i ? p.paragens[i - 1].saida : r.agora)).concat(p.fim - (p.paragens.length ? p.paragens[p.paragens.length - 1].saida : r.agora));
      const antes = duracoes(r.P);
      const depois = duracoes(mesma);
      let pior = -1;
      let mais = 0.5;
      depois.forEach((d, i) => {
        if (d - antes[i] >= mais) {
          mais = d - antes[i];
          pior = i;
        }
      });
      const comIncidente = c.incidente && !r.cond.incidente;
      const comChuva = c.cenario === 'chuva' && r.cond.cenario !== 'chuva';
      const porque = comIncidente ? 'o incidente na ' + mapa.incidente.rua : comChuva ? 'a chuva' : 'as novas condições';
      // a primeira posição que muda: que entrega passa a ser feita nesse lugar e para onde vai a que lá estava
      const a = novo.ordem.findIndex((k, i) => faltam[i] !== k);
      const novaOrdem = !mudouOrdem ? ''
        : ' Nova ordem: a entrega ' + numero(a) + ' passa a ser ' + PONTOS[novo.ordem[a]].nome + ' e ' + PONTOS[faltam[a]].nome + ' fica para ' + numero(novo.ordem.indexOf(faltam[a])) + '.ª.';
      const poupa = Math.round(mesma.fim - novo.fim);
      const razao = !mudouOrdem ? ''
        : mesma.nAtrasos > novo.nAtrasos
          ? ' Mantendo a ordem anterior, ' + mesma.nAtrasos + (mesma.nAtrasos === 1 ? ' entrega falhava' : ' entregas falhavam') + ' o prazo; assim ' + (novo.nAtrasos ? (novo.nAtrasos === 1 ? 'falha só 1' : 'falham ' + novo.nAtrasos) : 'cumprem-se todos') + '.'
          : poupa >= 1 ? ' Poupa ' + poupa + ' min face à ordem anterior.' : '';
      const mantem = ' A ordem das entregas mantém-se, porque continua a ser a melhor. Regresso ao armazém às ' + hc(novo.fim) + '.';
      if (pior >= 0 && comChuva && !comIncidente) {
        // a chuva atrasa a cidade toda: não há um troço a apontar
        novoAviso = { fase: 'transito', titulo: 'Chuva: trânsito mais lento', texto: 'Mantendo a ordem, o caminho que falta demorava mais ' + Math.max(1, Math.round(mesma.fim - r.P.fim)) + ' min.' + (mudouOrdem ? novaOrdem + razao : mantem) };
      } else if (pior >= 0) {
        const onde = pior < faltam.length ? PONTOS[faltam[pior]].nome : 'o armazém';
        novoAviso = {
          fase: 'transito',
          titulo: pior < faltam.length ? 'Trânsito detetado antes da entrega ' + numero(pior) : 'Trânsito detetado no regresso',
          texto: 'Com ' + porque + ', o caminho para ' + onde + ' demora mais ' + Math.max(1, Math.round(mais)) + ' min.' + (mudouOrdem ? novaOrdem + razao : mantem),
        };
      } else if (mudouOrdem) {
        novoAviso = { fase: 'transito', titulo: 'Ordem das entregas recalculada', texto: 'Com ' + porque + ', outra ordem é melhor.' + novaOrdem + razao };
      } else if (novo.fim <= r.P.fim - 1) {
        novoAviso = { fase: 'ok', titulo: 'Trânsito a melhorar', texto: 'Com as novas condições, o regresso ao armazém passa para as ' + hc(novo.fim) + ', ' + Math.round(r.P.fim - novo.fim) + ' min mais cedo.' };
      } else {
        novoAviso = { fase: 'ok', titulo: 'Caminho validado', texto: 'As condições mudaram, sem efeito no caminho das entregas que faltam.' };
      }
    }
    aValidar.current = '';
    aplicar({ ...r, P: { ...novo, trocos }, T, cond: c, condChave: chaveDe(c), versao: condMudou || mudouOrdem ? r.versao + 1 : r.versao, mudaram: mudouOrdem ? novo.ordem.filter((k, i) => faltam[i] !== k) : [] });
    setAviso(novoAviso);
  }

  // Mudou o dia, a partida ou o modo: rota nova. Mudaram só as condições: valida-se o que falta.
  useEffect(() => {
    if (!cond) return;
    const r = rotaRef.current;
    const trabalho = !r || r.chave !== chaveRota ? novaRota(cond) : r.condChave !== condChave && aValidar.current !== condChave ? validar() : null;
    if (trabalho) trabalho.catch((e) => setErro(e.message));
  }, [condChave, chaveRota]); // eslint-disable-line react-hooks/exhaustive-deps

  // Marcar uma entrega como feita marca também as anteriores; desmarcar desfaz essa e as seguintes.
  const marcar = (k) => {
    const r = rotaRef.current;
    if (!r) return;
    const j = r.feitas.findIndex((s) => s.k === k);
    const i = r.P.ordem.indexOf(k);
    let feitas;
    let trocosFeitos;
    let P;
    if (j >= 0) {
      feitas = r.feitas.slice(0, j);
      trocosFeitos = r.trocosFeitos.slice(0, j);
      P = { ...r.P, ordem: r.feitas.slice(j).map((s) => s.k).concat(r.P.ordem), paragens: r.feitas.slice(j).concat(r.P.paragens), trocos: r.trocosFeitos.slice(j).concat(r.P.trocos) };
    } else if (i >= 0) {
      feitas = r.feitas.concat(r.P.paragens.slice(0, i + 1));
      trocosFeitos = r.trocosFeitos.concat(r.P.trocos.slice(0, i + 1));
      P = { ...r.P, ordem: r.P.ordem.slice(i + 1), paragens: r.P.paragens.slice(i + 1), trocos: r.P.trocos.slice(i + 1) };
    } else return;
    const ultima = feitas[feitas.length - 1];
    // a lista mostra já a marca; a validação do caminho chega a seguir
    aplicar({ ...r, feitas, trocosFeitos, P, origem: ultima ? ultima.k : 0, agora: ultima ? ultima.saida : partida, mudaram: [] });
    setSelK(null);
    validar().catch((e) => setErro(e.message));
  };

  const nF = rota ? rota.feitas.length : 0;
  useDeslizar(linhasRef, rota ? rota.feitas.map((s) => s.k).concat(rota.P.ordem).join() : '');

  if (erro) return <div className="aviso-pagina">Não foi possível falar com a API da cidade ({erro}). Confirma que está a correr em http://localhost:8000 e recarrega a página.</div>;
  if (!mapa || !cond) return <div className="aviso-pagina">A ligar à API Aveiro em Movimento…</div>;

  const P = rota ? rota.P : null;
  const feitas = rota ? rota.feitas : [];
  const todas = P ? feitas.concat(P.paragens) : [];
  const rc = rota ? rota.cond : cond; // condições com que a rota mostrada foi calculada
  const eNormal = rc.cenario === 'normal' && !rc.incidente;
  const VB = mapa.viewBox;
  const px = (x) => (((x - VB[0]) / VB[2]) * 100).toFixed(2) + '%';
  const py = (y) => (((y - VB[1]) / VB[3]) * 100).toFixed(2) + '%';
  const pontos = rota ? rota.pontos : null;

  const fechar = () => setAberto(null);
  const mudarPartida = (m) => { m = Math.max(360, Math.min(1290, m)); setTermino((e) => Math.max(m + 30, Math.min(1410, e + m - partida))); setPartida(m); fechar(); };
  const mudarTermino = (m) => { setTermino(Math.max(partida + 30, Math.min(1410, m))); fechar(); };
  const mudarData = (k) => { const d = pd(k); setData(k); setSelK(null); setCal({ y: d.getUTCFullYear(), m: d.getUTCMonth() }); if (k !== HOJE) setModo('sim'); fechar(); };
  const opcoes = (de, ate) => { const o = []; for (let m = de; m <= ate; m += 30) o.push(m); return o; };

  const nS = P ? P.paragens.length : 0; // entregas por fazer
  // troço em destaque: por omissão, o próximo (de onde a carrinha está até à entrega seguinte)
  const selIdx = !P ? 0 : selK === 'R' ? nS : Math.max(0, P.ordem.indexOf(selK));
  const estadoDe = (s) => (s.saida > termino + 0.01 ? 'out' : s.atraso ? 'late' : 'ok');

  const linhas = todas.map((s, i) => {
    const feita = i < nF;
    const st = estadoDe(s);
    const prazo = PRAZOS[s.k];
    return {
      k: s.k, feita, st, n: i + 1, nome: PONTOS[s.k].nome, chegada: hc(s.chegada),
      selecionada: !feita && i - nF === selIdx,
      mudou: rota.mudaram.includes(s.k),
      sub: feita
        ? (s.atraso ? 'Entregue com ' + s.atraso + ' min de atraso' : prazo ? 'Entregue dentro do prazo' : 'Entregue')
        : prazo ? 'Prazo: até ' + hc(partida + prazo) + ' (+' + prazo + ' min)' : 'Sem prazo de entrega',
      // só leva etiqueta o que tem prazo ou está em risco
      chip: feita ? '' : st === 'out' ? 'Depois do término' : st === 'late' ? 'Atraso ' + s.atraso + ' min' : prazo ? 'Dentro do prazo' : '',
    };
  });
  const metrosNivel = [0, 0, 0];
  let km = 0;
  let incP = 0;
  if (P) {
    rota.trocosFeitos.forEach((g) => { km += g.metros / 1000; });
    P.trocos.forEach((g) => { km += g.metros / 1000; g.ruas.forEach((r) => { metrosNivel[r.nivel] += r.metros; if (r.na_rua_do_incidente) incP += r.metros; }); });
  }
  const totM = metrosNivel[0] + metrosNivel[1] + metrosNivel[2] || 1;
  const partes = metrosNivel.map((m) => Math.round((m / totM) * 100));
  const troco = P ? P.trocos[selIdx] : null;
  const de = !P ? '' : selIdx === 0 ? PONTOS[rota.origem].nome : PONTOS[P.paragens[selIdx - 1].k].nome;
  const para = !P ? '' : selIdx < nS ? PONTOS[P.paragens[selIdx].k].nome : PONTOS[0].nome;
  const comPrazo = todas.filter((s) => PRAZOS[s.k]);
  const cumpridas = comPrazo.filter((s) => estadoDe(s) === 'ok').length;
  const total = P ? P.fim - partida : 0;
  const emEntregas = P ? feitas.reduce((t, s) => t + s.saida - s.chegada, 0) + nS * P.servico : 0;
  const delta = P ? Math.round(total) - Math.round(rota.base) : 0;
  const regressoTarde = P && P.fim > termino + 0.01;
  const fimDeSemana = agendadas.length === 0;
  const inc = mapa.incidente;

  const textoVivo =
    'Em vigor na API: ' + NOMES_CEN[cond.cenario] + (vivo && vivo.desde ? ', desde as ' + vivo.desde.slice(11, 16) : '') + '.' +
    (cond.incidente
      ? ' Incidente na ' + inc.rua + ': trânsito a ' + Math.round(inc.fator_velocidade * 100) + '% da velocidade habitual.' +
        (!P ? '' : incP < 1 ? ' O caminho que falta não passa por esta avenida.' : ' O caminho que falta ainda faz ' + fmt(incP) + ' m por esta avenida, porque as alternativas demoram mais.')
      : ' Sem incidentes.') +
    ' Se a plataforma mudar as condições, o caminho é validado de novo.';
  const textoSim =
    (cen === 'chuva' ? 'Chuva simulada sobre o perfil real: trânsito mais lento, sobretudo nas horas de ponta, e 7 min por entrega.' : 'Perfil real dos dias úteis, medido pelos sensores de 3 a 10 de novembro. 6 min por entrega.') +
    (simInc ? ' Incidente simulado na ' + inc.rua + '.' : '') +
    ' Mudar o cenário a meio da rota valida de novo o caminho que falta.';

  const primeiro = new Date(Date.UTC(cal.y, cal.m, 1)).getUTCDay();
  const celulas = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(Date.UTC(cal.y, cal.m, 1 - primeiro + i, 12));
    const k = d.toISOString().slice(0, 10);
    return { k, dia: d.getUTCDate(), noMes: d.getUTCMonth() === cal.m, on: k === data, hoje: k === HOJE };
  });
  const moverMes = (n) => { const d = new Date(Date.UTC(cal.y, cal.m + n, 1)); setCal({ y: d.getUTCFullYear(), m: d.getUTCMonth() }); };

  const linhaEntrega = (r) => (
    <div key={r.k} data-k={r.k} className={'entrega' + (r.selecionada ? ' sel' : '') + (r.feita ? ' feita' : '') + (r.mudou ? ' mudou-' + (rota.versao % 2) : '')}>
      <button type="button" role="checkbox" aria-checked={r.feita} aria-label={(r.feita ? 'Desfazer a entrega: ' : 'Marcar como entregue: ') + r.nome} className="caixa" onClick={() => marcar(r.k)}>
        <span className={r.feita ? 'on' : ''}><Icone d={VISTO} tamanho={14} cor="#FFFFFF" grosso={3.4} /></span>
      </button>
      <button type="button" aria-pressed={r.selecionada} disabled={r.feita} className="entrega-corpo" onClick={() => setSelK(r.k)}>
        <span className="fio" />
        <span className="chegada">{r.chegada}</span>
        <span className={'numero ' + (r.feita ? 'feita' : r.st)}>{r.n}</span>
        <span className="textos">
          <span className="nome">{r.nome}</span>
          <span className="sub">{r.sub}</span>
        </span>
        {r.chip && <span className={'chip ' + r.st}>{r.chip}</span>}
      </button>
    </div>
  );

  return (
    <div className="app">
      <div className="ecra">
        <header>
          <div className="marca">
            <span className="logo"><Carrinha cor="#FFFFFF" /></span>
            <div>
              <div className="marca-nome">Ria Express · Planeador de rotas</div>
              <div className="marca-sub">Transportadora fictícia · trânsito pela <a href="../">API Aveiro em Movimento</a></div>
            </div>
          </div>
          <span className={'em-vigor' + (vivo && (vivo.cenario !== 'normal' || vivo.incidente) ? ' alerta' : '')}>
            API · em vigor: {vivo ? NOMES_CEN[vivo.cenario] + (vivo.incidente ? ' + incidente' : '') : '…'}
          </span>
          <code>{textoDoPedido(rota ? horaDe(rota.agora) : horaDe(partida), cond)}</code>
        </header>

        <main>
          <section className="controlos">
            <SeletorHora rotulo="Partida às" valor={partida} opcoes={opcoes(360, 1290)} aberto={aberto === 't1'} aoAbrir={() => setAberto(aberto === 't1' ? null : 't1')} aoMudar={mudarPartida} antes="Partir 30 minutos mais cedo" depois="Partir 30 minutos mais tarde" />

            <div className="campo" style={{ flex: '0 0 250px' }}>
              <div className="campo-rotulo">Dia a planear</div>
              <div className="campo-caixa">
                <div className="campo-linha">
                  <button type="button" className="campo-valor" aria-label="Dia a planear" aria-expanded={aberto === 'cal'} onClick={() => { const d = pd(data); setCal({ y: d.getUTCFullYear(), m: d.getUTCMonth() }); setAberto(aberto === 'cal' ? null : 'cal'); }}>
                    <Icone d="M4 10h16M8 3v4M16 3v4"><rect x="4" y="5" width="16" height="15" rx="2" /></Icone>
                    <span>{(data === HOJE ? 'hoje · ' : '') + rotuloDia(data)}</span>
                  </button>
                  <button type="button" className="seta" aria-label="Dia anterior" onClick={() => mudarData(maisDias(data, -1))}><Icone d="M14 7l-5 5 5 5" tamanho={18} cor={INK} /></button>
                  <button type="button" className="seta" aria-label="Dia seguinte" onClick={() => mudarData(maisDias(data, 1))}><Icone d="M10 7l5 5-5 5" tamanho={18} cor={INK} /></button>
                </div>
                {aberto === 'cal' && (
                  <div role="dialog" aria-label="Escolher o dia" className="calendario">
                    <div className="cal-topo">
                      <button type="button" aria-label="Mês anterior" onClick={() => moverMes(-1)}><Icone d="M14 7l-5 5 5 5" cor={INK} /></button>
                      <div>{MESES[cal.m] + ' de ' + cal.y}</div>
                      <button type="button" aria-label="Mês seguinte" onClick={() => moverMes(1)}><Icone d="M10 7l5 5-5 5" cor={INK} /></button>
                    </div>
                    <div className="cal-grelha">
                      {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d) => <div key={d} className="cal-dia">{d}</div>)}
                      {celulas.map((c) => (
                        <button key={c.k} type="button" aria-label={rotuloDia(c.k)} aria-pressed={c.on} className={(c.on ? 'on ' : '') + (c.hoje ? 'hoje ' : '') + (c.noMes ? '' : 'fora')} onClick={() => mudarData(c.k)}>{c.dia}</button>
                      ))}
                    </div>
                    <div className="cal-nota">Hoje: {rotuloDia(HOJE)} · sem entregas ao fim de semana</div>
                  </div>
                )}
              </div>
            </div>

            <SeletorHora rotulo="Término até" valor={termino} opcoes={opcoes(partida + 30, 1410)} aberto={aberto === 't2'} aoAbrir={() => setAberto(aberto === 't2' ? null : 't2')} aoMudar={mudarTermino} antes="Terminar 30 minutos mais cedo" depois="Terminar 30 minutos mais tarde" />

            <div className="divisor" />

            <div className="campo" style={{ flex: '0 0 226px' }}>
              <div className="campo-rotulo">Cálculo da rota</div>
              <div role="radiogroup" aria-label="Modo de cálculo" className="modos">
                <button type="button" role="radio" aria-checked={!emDireto} className={!emDireto ? 'on' : ''} title="Perfil típico dos sensores e um cenário à escolha. Para qualquer dia." onClick={() => { setModo('sim'); setSelK(null); fechar(); }}>Simulação</button>
                <button type="button" role="radio" aria-checked={emDireto} className={emDireto ? 'on' : ''} title="Segue o cenário em vigor na API da cidade. Só para hoje." onClick={() => { mudarData(HOJE); setModo('live'); }}>Tempo real</button>
              </div>
            </div>

            {!emDireto && (
              <div className="campo">
                <div className="campo-rotulo">Cenário simulado</div>
                <div className="pilulas">
                  {['normal', 'chuva'].map((c) => (
                    <button key={c} type="button" aria-pressed={cen === c} className={cen === c ? 'on' : ''} onClick={() => setCen(c)}>{c === 'normal' ? 'Dia normal' : 'Dia de chuva'}</button>
                  ))}
                  <button type="button" aria-pressed={simInc} className={simInc ? 'on' : ''} title={'Incidente simulado na ' + inc.rua} onClick={() => setSimInc(!simInc)}>Incidente</button>
                </div>
              </div>
            )}
          </section>

          <div className="corpo">
            <section className="lista">
              <div className="lista-topo">
                <div>
                  <h2>Ordem das entregas</h2>
                  <p>{fimDeSemana ? 'Nada agendado neste dia' : !P ? 'A calcular…' : nS ? nF + ' de ' + todas.length + ' entregues · marque cada entrega quando estiver feita' : 'As ' + todas.length + ' entregas estão feitas'}</p>
                </div>
                {nF > 0 && <button type="button" className="todos" onClick={() => novaRota(cond).catch((e) => setErro(e.message))}>Recomeçar</button>}
              </div>
              <div className="linhas" ref={linhasRef}>
                {P && (
                  <div className="extremo">
                    <span className="fio meio" />
                    <span className="chegada">{hc(partida)}</span>
                    <span className="casa"><Icone d={CASA} tamanho={16} cor="#FFFFFF" /></span>
                    <span className="textos"><span className="nome">{PONTOS[0].nome}</span><span className="sub">Partida</span></span>
                  </div>
                )}
                {linhas.map(linhaEntrega)}
                {P && (
                  <div className={'entrega' + (selIdx === nS ? ' sel' : '')}>
                    <span className="caixa" />
                    <button type="button" aria-pressed={selIdx === nS} className="entrega-corpo" onClick={() => setSelK('R')}>
                      <span className="fio cima" />
                      <span className="chegada">{hc(P.fim)}</span>
                      <span className="casa"><Icone d={CASA} tamanho={16} cor="#FFFFFF" /></span>
                      <span className="textos"><span className="nome">Regresso ao armazém</span><span className="sub">Fim da rota</span></span>
                      <span className={'chip ' + (regressoTarde ? 'late' : 'ok')}>{regressoTarde ? 'Depois do término' : 'Antes do término'}</span>
                    </button>
                  </div>
                )}
                {fimDeSemana && <div className="vazio">Sem entregas agendadas para {rotuloDia(data)}. A Ria Express não distribui ao fim de semana.</div>}
              </div>
            </section>

            <aside className="painel">
              {aviso && (
                <div className={'validacao ' + aviso.fase} role="status" aria-live="polite">
                  <span className="validacao-icone">
                    {aviso.fase === 'a-validar' ? <i className="roda" /> : <Icone d={aviso.fase === 'transito' ? AVISO : aviso.fase === 'ok' ? VISTO : undefined} tamanho={18} cor="#FFFFFF" grosso={2.6}>{aviso.fase === 'info' && <path d="M12 11v6M12 7v.5" />}</Icone>}
                  </span>
                  <div>
                    <strong>{aviso.titulo}</strong>
                    <p>{aviso.texto}</p>
                  </div>
                </div>
              )}

              <div className="numeros">
                <div><b>{P ? hm(total) : '—'}</b><span>{!P ? 'tempo total da rota' : eNormal && !delta ? 'tempo total, igual ao de um dia normal' : 'tempo total, ' + (delta >= 0 ? '+' : '−') + Math.abs(delta) + ' min face ao dia normal'}</span></div>
                <div><b>{P ? num(km, 1) + ' km' : '—'}</b><span>{P ? Math.round(total - emEntregas) + ' min a conduzir e ' + Math.round(emEntregas) + ' min em entregas' : 'percorridos'}</span></div>
                <div><b style={{ color: P && cumpridas < comPrazo.length ? '#A50E0E' : P ? '#0D652D' : INK }}>{P ? cumpridas + ' de ' + comPrazo.length : '—'}</b><span>entregas com prazo cumpridas</span></div>
                <div><b style={{ color: regressoTarde ? '#A50E0E' : INK }}>{P ? hc(P.fim) : '—'}</b><span>{!P ? 'regresso ao armazém' : 'regresso ao armazém, ' + (regressoTarde ? 'depois' : 'antes') + ' do término (' + hc(termino) + ')'}</span></div>
              </div>

              <p className={'nota' + (emDireto && (cond.incidente || cond.cenario === 'chuva') ? ' alerta' : '')} aria-live="polite">{emDireto ? textoVivo : textoSim}</p>

              {troco && (
                <div className="troco-resumo">
                  <h3>{selIdx === 0 ? 'Próximo troço' : 'Troço ' + (nF + selIdx + 1)}: {de} → {para}</h3>
                  <p>{num(troco.metros / 1000, 1)} km, {Math.max(1, Math.round(troco.segundos / 60))} min a conduzir, condições das {troco.hora}h</p>
                  <ul>
                    {troco.ruas.map((r, i) => (
                      <li key={i}>
                        <span>{r.rua}</span>
                        <span className={'fluidez n' + r.nivel}>{NIVEL[r.nivel]} · {Math.round(r.fluidez * 100)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>

            <section className="mapa-cartao">
              <div className="mapa" style={{ '--rw': VB[2], '--rh': VB[3] }}>
                <svg viewBox={VB.join(' ')} role="img" aria-label="Mapa do centro de Aveiro com a rota calculada">
                  <path d={mapa.d} stroke="#D5D9DE" strokeWidth="1.5" />
                  {rc.incidente && <path d={inc.d} stroke="#C5221F" strokeWidth="11" opacity="0.25" />}
                  {/* o caminho já feito fica a cinzento, por baixo do que falta fazer */}
                  {P && <path className="percorrido" d={rota.trocosFeitos.map((g) => g.ruas.map((r) => r.d).join(' ')).join(' ')} />}
                  {troco && <path d={troco.ruas.map((r) => r.d).join(' ')} stroke="#FBBC04" strokeWidth="15" opacity="0.7" />}
                  {/* quando a rota muda, o caminho novo desenha-se troço a troço, pela ordem das entregas */}
                  {P && (
                    <g key={rota.versao} className="rota-nova">
                      {P.trocos.map((g, i) => <path key={g.de + '-' + g.para} className="contorno" style={{ '--i': i }} d={g.ruas.map((r) => r.d).join(' ')} />)}
                      {P.trocos.map((g, i) => (
                        <g key={g.de + '-' + g.para} style={{ '--i': i }}>
                          {g.ruas.map((r, j) => <path key={j} className={'cor n' + r.nivel} pathLength="1" d={r.d} />)}
                        </g>
                      ))}
                    </g>
                  )}
                </svg>
                {pontos && rota && <div className="aqui" style={{ left: px(pontos[rota.origem].x), top: py(pontos[rota.origem].y) }} aria-hidden="true" />}
                {pontos && todas.map((s, i) => (
                  <div key={s.k} role="img" aria-label={PONTOS[s.k].nome + ', paragem ' + (i + 1) + (i < nF ? ', entregue' : ', chegada às ' + hc(s.chegada))} className={'marcador ' + (i < nF ? 'feita' : estadoDe(s)) + (i >= nF && i - nF === selIdx ? ' sel' : '')} style={{ left: px(pontos[s.k].x), top: py(pontos[s.k].y) }}>
                    <span key={i}>{i + 1}</span>
                  </div>
                ))}
                {pontos && <div role="img" aria-label={PONTOS[0].nome} className="armazem" style={{ left: px(pontos[0].x), top: py(pontos[0].y) }}><Icone d={CASA} tamanho={17} cor="#FFFFFF" /></div>}
                {rc.incidente && <div role="img" aria-label={'Incidente na ' + inc.rua} className="incidente" style={{ left: px(inc.x), top: py(inc.y) }}><Icone d={AVISO} tamanho={16} cor="#FFFFFF" grosso={2.4} /></div>}
                {P && <div className="mapa-etiqueta dir">Por fazer: {partes[0]}% fluido · {partes[1]}% moderado · {partes[2]}% lento</div>}
                <div className="legenda">
                  <span><i style={{ background: '#1A73E8' }} />Fluido</span>
                  <span><i style={{ background: '#E37400' }} />Moderado</span>
                  <span><i style={{ background: '#C5221F' }} />Lento</span>
                  <span><i style={{ background: '#FBBC04' }} />Troço em destaque</span>
                  <span><i style={{ background: '#9AA0A6' }} />Já percorrido</span>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      {P && troco && (
        <section className="ruas">
          <div className="ruas-topo">
            <h2>Ruas do troço {nF + selIdx + 1}: {de} → {para}</h2>
            <p>{num(troco.metros / 1000, 1)} km · {Math.max(1, Math.round(troco.segundos / 60))} min a conduzir · condições das {troco.hora}h</p>
          </div>
          <div className="tabela-caixa">
            <table>
              <thead>
                <tr><th>Rua</th><th>Extensão</th><th>Fluxo de trânsito</th><th>Fluidez</th><th>Velocidade</th><th>Limite</th><th>Peões na passadeira</th><th>Fonte do dado</th></tr>
              </thead>
              <tbody>
                {troco.ruas.map((r, i) => (
                  <tr key={i}>
                    <td className="rua">{r.rua} {r.incidente && <span className="selo-inc">Incidente</span>}</td>
                    <td>{fmt(r.metros)} m</td>
                    <td>{r.veiculos_hora != null ? fmt(r.veiculos_hora) + ' veíc./h' : '—'}</td>
                    <td><span className={'fluidez n' + r.nivel}>{NIVEL[r.nivel]} · {Math.round(r.fluidez * 100)}%</span></td>
                    <td>≈ {r.velocidade_kmh} km/h</td>
                    <td>{r.limite_kmh} km/h</td>
                    <td>{r.peoes_hora != null ? fmt(r.peoes_hora) + ' peões/h' : '—'}</td>
                    <td className="fonte">{r.fonte}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {aberto && <button type="button" aria-label="Fechar" className="veu" onClick={fechar} />}
    </div>
  );
}
