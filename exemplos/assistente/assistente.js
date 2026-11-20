/* Perguntar a Aveiro: um chat de demonstração que fala com a API pelo servidor MCP.
 *
 * Um ficheiro só, sem bibliotecas. Para o pôr numa página:
 *   <script src="http://localhost:8000/assistente/assistente.js" defer></script>
 *
 * O que é verdadeiro: a ligação MCP (initialize, tools/list, tools/call) e todos os números,
 * que são os da API. O que é simulado: o assistente. A pergunta é interpretada com regras simples,
 * sem modelo de linguagem, que escolhem a ferramenta e os argumentos.
 * Um assistente a sério (Claude, Copilot…) liga-se ao mesmo endereço e faz essa parte sozinho.
 */
(function () {
  'use strict';
  if (window.__perguntarAAveiro) return;
  window.__perguntarAAveiro = true;

  const API = new URL(document.currentScript.src).origin;
  const PAUSA = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420; // tempo para se ler cada passo
  const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const simples = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const fmt = (n) => Number(n).toLocaleString('pt-PT');

  // ------------------------------------------------------------ cliente MCP (JSON-RPC sobre HTTP)
  let pedidos = 0;
  async function mcp(metodo, params, notificacao) {
    const corpo = { jsonrpc: '2.0', method: metodo };
    if (!notificacao) corpo.id = ++pedidos;
    if (params) corpo.params = params;
    const r = await fetch(API + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(corpo) });
    if (notificacao) return null;
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j.result;
  }

  let ligacao = null;
  /** Apresenta-se ao servidor e descobre as ferramentas, uma vez. */
  function ligar() {
    if (!ligacao) {
      ligacao = (async () => {
        const inicio = await mcp('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'perguntar-a-aveiro', version: '1.0.0' } });
        await mcp('notifications/initialized', null, true);
        const lista = await mcp('tools/list');
        return { servidor: inicio.serverInfo, ferramentas: lista.tools.map((f) => f.name) };
      })();
      ligacao.catch(() => { ligacao = null; });
    }
    return ligacao;
  }

  // ------------------------------------------------------------ regras: da pergunta à ferramenta
  const LUGARES = [
    ['Fábrica Ciência Viva', /fabrica|ciencia viva|hackathon/],
    ['Rossio', /rossio/],
    ['Fórum Aveiro', /forum/],
    ['Estação de comboios', /estacao|comboio/],
    ['Universidade de Aveiro', /universidade/],
    ['Saída de Moliceiros', /moliceiro/],
  ];
  const ZONAS = [
    ['25-abril', 'Av. 25 de Abril', /25 de abril/],
    ['universidade', 'Universidade · Santiago', /universidade|santiago/],
    ['artur-ravara', 'Av. Artur Ravara', /ravara|araujo/],
    ['mario-sacramento', 'Rua Mário Sacramento', /sacramento/],
    ['fonte-nova', 'Cais da Fonte Nova', /fonte nova/],
    ['almeida-eca', 'Rua Artur de Almeida Eça', /almeida eca/],
    ['alavario', 'Rua do Alavário', /alavario|liberdade/],
    ['pega', 'Rua da Pega', /\bpega\b/],
  ];
  const LOCAIS = [
    ['rossio', 'Rossio', /rossio/],
    ['moliceiros', 'Saída de Moliceiros', /moliceiro/],
    ['forum', 'Fórum', /forum/],
    ['lourenco-peixinho', 'Av. Lourenço Peixinho', /peixinho/],
    ['ria', 'Ria de Aveiro', /\bria\b/],
    ['estacao', 'Estação de Comboios', /estacao|comboio/],
  ];
  const SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  const SUGESTOES = [
    'Onde estaciono sexta às 8h perto da Fábrica Ciência Viva?',
    'Que passadeira analisar primeiro às 13h?',
    'Quando visitar o Rossio com menos gente ao sábado?',
    'A que horas descarregar na Av. 25 de Abril?',
    'Quanto demoro da Estação ao Rossio às 18h com chuva?',
    'Como está a cidade agora?',
  ];
  const SEGUIMENTOS = {
    onde_estacionar: ['E ao sábado?', 'E às 18h?'],
    onde_intervir: ['E às 18h?', 'E com chuva?'],
    melhor_hora: ['E para descarregar?', 'E para a montra?', 'E com chuva?'],
    quando_visitar: ['E ao domingo?', 'E o Fórum?'],
    tempo_de_percurso: ['E num dia normal?', 'E às 8h?'],
    condicoes_da_cidade: [],
  };

  function intencao(t) {
    if (/estacion|parque|lugar(es)? livre|deix(o|ar) o carro|parar o carro/.test(t)) return 'onde_estacionar';
    if (/demoro|demora|quanto tempo|tempo de carro|percurso|caminho|como chego|\bir d[aeo]/.test(t)) return 'tempo_de_percurso';
    if (/passadeira|intervir|perig|seguranca|atropel/.test(t)) return 'onde_intervir';
    if (/visit|turist|menos gente|mais calm|passear/.test(t)) return 'quando_visitar';
    if (/descarreg|carga|montra|cliente|loja|movimento|passa mais gente/.test(t)) return 'melhor_hora';
    if (/como esta|condicoes|esta a chover|chove agora|o que se passa|estado da cidade/.test(t)) return 'condicoes_da_cidade';
    return null;
  }

  /** O que a pergunta diz: hora, dia, lugares, zona, local, cenário. Só fica o que lá está. */
  function extrair(texto) {
    const t = simples(texto);
    const e = {};
    const m = t.match(/\b(?:as|pelas)\s+(\d{1,2})(?!\d)|\b(\d{1,2})\s*(?:h(?![a-z])|horas\b|:\d\d)/);
    if (m && Number(m[1] || m[2]) <= 23) e.hora = Number(m[1] || m[2]);
    else if (/meio.dia/.test(t)) e.hora = 12;
    const hoje = new Date().getDay();
    if (/\bhoje\b/.test(t)) e.dia = SEMANA[hoje];
    else if (/\bamanha\b/.test(t)) e.dia = SEMANA[(hoje + 1) % 7];
    else {
      const d = SEMANA.find((x) => t.includes(x));
      if (d) e.dia = d;
    }
    if (/dia normal|sem chuva/.test(t)) e.cenario = 'normal';
    else if (/chuva|chove|chover/.test(t)) e.cenario = 'chuva';
    if (/incidente|acidente/.test(t)) e.incidente = true;
    if (/descarreg|carga/.test(t)) e.para = 'cargas';
    else if (/montra|cliente|passa mais gente/.test(t)) e.para = 'montra';
    const lugares = LUGARES.map(([nome, re]) => [nome, t.search(re)]).filter((x) => x[1] >= 0).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    if (lugares.length) e.lugares = lugares;
    const zona = ZONAS.find((z) => z[2].test(t));
    if (zona) e.zona = zona[0];
    const local = LOCAIS.find((l) => l[2].test(t));
    if (local) e.local = local[0];
    return e;
  }

  /** Os argumentos da ferramenta, com o que a pergunta diz por cima do que vinha da pergunta anterior. */
  function montar(f, e, antes) {
    const a = antes || {};
    const hora = e.hora != null ? e.hora : a.hora != null ? a.hora : new Date().getHours();
    const cenario = e.cenario || a.cenario;
    const args = {};
    let falta = null;
    if (f === 'onde_estacionar') {
      args.destino = (e.lugares && e.lugares[0]) || a.destino;
      args.hora = hora;
      args.dia = e.dia || a.dia;
      if (!args.destino) falta = { texto: 'Para onde vais?', opcoes: LUGARES.map((l) => l[0]) };
    } else if (f === 'onde_intervir') {
      args.hora = hora;
    } else if (f === 'melhor_hora') {
      args.zona = e.zona || a.zona;
      args.para = e.para || a.para || 'montra';
      // a hora das cargas não depende da hora a que se pergunta
      if (args.para === 'montra' || e.hora != null) args.hora = hora;
      if (!args.zona) falta = { texto: 'Em que zona?', opcoes: ZONAS.map((z) => z[1]) };
    } else if (f === 'quando_visitar') {
      const dia = e.dia || null;
      args.local = e.local || a.local;
      args.dia = dia ? (dia === 'sabado' || dia === 'domingo' ? dia : 'dias_uteis') : a.dia;
      args.hora = hora;
      if (!args.local) falta = { texto: 'Que local queres visitar?', opcoes: LOCAIS.map((l) => l[1]) };
    } else if (f === 'tempo_de_percurso') {
      const l = e.lugares || [];
      args.de = l.length > 1 ? l[0] : a.de;
      args.para = l.length > 1 ? l[1] : l[0] || a.para;
      args.hora = hora;
      if (!args.de || !args.para) falta = { texto: 'De onde para onde? Por exemplo: da Estação ao Rossio.', opcoes: [] };
    }
    if (f !== 'condicoes_da_cidade' && cenario) args.cenario = cenario;
    if (f === 'tempo_de_percurso' && (e.incidente || a.incidente)) args.incidente = true;
    Object.keys(args).forEach((k) => args[k] == null && delete args[k]);
    return { args, falta };
  }

  // ------------------------------------------------------------ da resposta da API ao que se mostra
  function apresentar(f, args, r) {
    if (f === 'tempo_de_percurso') {
      const metros = {};
      r.ruas.forEach((x) => { if (x.rua !== 'Via sem nome') metros[x.rua] = (metros[x.rua] || 0) + x.metros; });
      const principais = Object.keys(metros).sort((x, y) => metros[y] - metros[x]).slice(0, 3);
      const comSensor = r.ruas.filter((x) => x.fonte.startsWith('Sensor')).length;
      const simulado = r.cenario === 'chuva' || r.incidente;
      return {
        titulo: Math.round(r.segundos / 60) + ' min de carro às ' + r.hora + 'h',
        texto: args.de + ' → ' + args.para + ': ' + fmt(Math.round(r.metros / 100) / 10) + ' km, por ' + principais.join(', ') + '.',
        simulado,
        fonte: simulado
          ? 'tempos com ' + [r.cenario === 'chuva' && 'chuva', r.incidente && 'incidente'].filter(Boolean).join(' e ') + ', sobre as velocidades medidas'
          : 'velocidades dos dias úteis de 3 a 10 de novembro de 2026; ' + comSensor + ' dos ' + r.ruas.length + ' troços têm sensor, os outros são estimativa',
      };
    }
    if (f === 'condicoes_da_cidade') {
      const inc = r.incidente_info;
      return {
        titulo: (r.cenario === 'chuva' ? 'Dia de chuva' : 'Dia normal') + (r.incidente ? ', com um incidente' : ''),
        texto: inc ? 'Incidente na ' + inc.rua + ': trânsito a ' + Math.round(inc.fator_velocidade * 100) + '% da velocidade habitual.' : 'Sem incidentes no trânsito.',
        simulado: r.cenario === 'chuva' || r.incidente,
        fonte: r.cenario === 'chuva' || r.incidente ? 'condições definidas no portal, por ' + r.alterado_por : 'o perfil dos dias úteis de 3 a 10 de novembro de 2026',
      };
    }
    const v = { titulo: r.acao.titulo, texto: r.resposta, simulado: r.simulado, fonte: r.fonte.replace(/^(real|simulado) \((.*?)\)/, '$2') };
    if (f === 'onde_estacionar' && r.itens.length > 1) {
      v.lista = { titulo: 'Se estiver cheio', itens: r.itens.slice(1).map((i) => i.nome + ': ' + fmt(i.livres) + ' lugares livres de ' + fmt(i.lugares) + ', a ' + i.a_pe_min + ' min a pé') };
    }
    if (f === 'onde_intervir' && r.itens.length > 1) {
      v.lista = { titulo: 'A seguir', itens: r.itens.slice(1).map((i) => 'Passadeira ' + i.id + ', ' + i.rua + ': ' + fmt(i.peoes_hora) + ' peões e ' + fmt(i.veiculos_hora) + ' veículos por hora') };
    }
    return v;
  }

  // ------------------------------------------------------------ interface
  const CSS = `
.pa-botao, .pa-painel, .pa-painel * { box-sizing: border-box; }
.pa-botao { position: fixed; right: 20px; bottom: 20px; z-index: 1000; display: flex; align-items: center; gap: 8px; height: 46px; padding: 0 18px 0 14px; border: 0; border-radius: 23px; background: var(--tinta, #101b2d); color: #fff; font: 600 15px/1 Overpass, system-ui, sans-serif; cursor: pointer; box-shadow: 0 6px 18px rgba(16, 27, 45, 0.28); }
.pa-botao:hover { background: var(--sinal-escuro, #083f85); }
.pa-botao svg { width: 20px; height: 20px; }
.pa-painel { position: fixed; right: 20px; bottom: 78px; z-index: 1000; display: flex; flex-direction: column; width: min(420px, calc(100vw - 24px)); height: min(640px, calc(100dvh - 98px)); border: 1px solid var(--linha-forte, #a3aebd); border-radius: 14px; background: var(--papel, #fff); color: var(--tinta, #101b2d); font: 400 14.5px/1.4 Overpass, system-ui, sans-serif; box-shadow: 0 18px 48px rgba(16, 27, 45, 0.3); overflow: hidden; transform-origin: 100% 100%; animation: pa-abrir 0.18s ease-out; }
.pa-painel[hidden] { display: none; }
@keyframes pa-abrir { from { opacity: 0; transform: scale(0.96) translateY(8px); } }
.pa-topo { flex: none; display: flex; align-items: center; gap: 10px; padding: 12px 12px 11px 16px; background: var(--tinta, #101b2d); color: #fff; }
.pa-topo div { flex: 1 1 auto; min-width: 0; }
.pa-topo strong { display: block; font-size: 16px; font-weight: 800; line-height: 1.2; }
.pa-topo span { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: rgba(255, 255, 255, 0.78); }
.pa-topo i { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #8793a5; }
.pa-topo i.pa-on { background: #37d394; }
.pa-fechar { flex: none; width: 34px; height: 34px; border: 0; border-radius: 8px; background: none; color: #fff; font-size: 22px; line-height: 1; cursor: pointer; }
.pa-fechar:hover { background: rgba(255, 255, 255, 0.14); }
.pa-conversa { flex: 1 1 auto; display: flex; flex-direction: column; gap: 12px; padding: 14px 14px 6px; overflow-y: auto; overscroll-behavior: contain; }
.pa-eu { align-self: flex-end; max-width: 86%; margin: 0; padding: 8px 12px; border-radius: 14px 14px 3px 14px; background: var(--sinal-suave, #e6eef8); }
.pa-ela { display: flex; flex-direction: column; gap: 7px; max-width: 96%; }
.pa-ela p { margin: 0; }
.pa-passo { color: var(--tinta-2, #4b586d); font-size: 13px; }
.pa-rasto { display: grid; gap: 2px; padding: 6px 9px; border-radius: 7px; background: var(--pavimento, #f2f4f6); font: 11.5px/1.45 var(--mono, ui-monospace, Consolas, monospace); color: var(--tinta-2, #4b586d); overflow-wrap: anywhere; }
.pa-como summary { width: fit-content; font-size: 12px; color: var(--tinta-2, #4b586d); cursor: pointer; }
.pa-como summary:hover { color: var(--sinal, #0a4fa3); }
.pa-como[open] summary { margin-bottom: 5px; }
.pa-rasto b { font-weight: 600; color: var(--tinta, #101b2d); }
.pa-rasto em { font-style: normal; color: var(--livre, #0b8457); }
.pa-sinal { padding: 10px 13px 9px; border-radius: 8px; background: var(--sinal, #0a4fa3); color: #fff; box-shadow: inset 0 0 0 2px var(--sinal, #0a4fa3), inset 0 0 0 3.5px #fff; font-size: 17px; font-weight: 800; line-height: 1.2; animation: pa-virar 0.4s cubic-bezier(0.2, 0.7, 0.2, 1) both; transform-origin: 50% 0; }
.pa-sinal.pa-sim { background: var(--desvio, #ffcf00); color: var(--tinta, #101b2d); box-shadow: inset 0 0 0 2px var(--desvio, #ffcf00), inset 0 0 0 3.5px var(--tinta, #101b2d); }
@keyframes pa-virar { from { opacity: 0; transform: perspective(600px) rotateX(-50deg); } }
.pa-lista { margin: 0; padding: 0; list-style: none; font-size: 13.5px; }
.pa-lista li { padding: 3px 0; border-top: 1px solid var(--linha-suave, #e6eaef); }
.pa-lista li:first-child { border: 0; padding-top: 0; font-weight: 600; color: var(--tinta-2, #4b586d); }
.pa-fonte { padding-left: 9px; border-left: 4px solid var(--sinal, #0a4fa3); font-size: 12.5px; color: var(--tinta-2, #4b586d); }
.pa-fonte.pa-sim { border-left-color: var(--desvio, #ffcf00); }
.pa-fonte b { color: var(--tinta, #101b2d); }
.pa-erro { padding-left: 9px; border-left: 4px solid var(--lento, #b81f2d); }
.pa-opcoes { display: flex; flex-wrap: wrap; gap: 6px; }
.pa-opcoes button { padding: 5px 11px; border: 1px solid var(--linha-forte, #a3aebd); border-radius: 99px; background: var(--papel, #fff); color: var(--tinta, #101b2d); font: inherit; font-size: 13px; line-height: 1.3; text-align: left; cursor: pointer; }
.pa-opcoes button:hover { border-color: var(--sinal, #0a4fa3); color: var(--sinal, #0a4fa3); }
.pa-form { flex: none; display: flex; gap: 8px; padding: 10px 12px 8px; border-top: 1px solid var(--linha, #d3dae2); }
.pa-form input { flex: 1 1 auto; min-width: 0; height: 40px; padding: 0 12px; border: 1px solid var(--linha-forte, #a3aebd); border-radius: 9px; background: var(--papel, #fff); color: var(--tinta, #101b2d); font: inherit; }
.pa-form button { flex: none; height: 40px; padding: 0 15px; border: 0; border-radius: 9px; background: var(--sinal, #0a4fa3); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
.pa-form button:disabled { opacity: 0.5; cursor: default; }
.pa-nota { flex: none; margin: 0 12px 10px; padding-left: 8px; border-left: 4px solid var(--desvio, #ffcf00); font-size: 11.5px; line-height: 1.35; color: var(--tinta-2, #4b586d); }
.pa-botao:focus-visible, .pa-painel :focus-visible { outline: 2px solid var(--sinal, #0a4fa3); outline-offset: 2px; }
.pa-topo :focus-visible { outline-color: #fff; }
@media (max-width: 520px) { .pa-painel { left: 8px; right: 8px; bottom: 74px; width: auto; } .pa-botao { right: 12px; bottom: 14px; } }
@media (prefers-reduced-motion: reduce) { .pa-painel, .pa-sinal { animation: none; } }
`;

  function el(tag, classe, texto) {
    const n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto != null) n.textContent = texto;
    return n;
  }

  const estilo = el('style', null, CSS);
  const botao = el('button', 'pa-botao');
  botao.type = 'button';
  botao.setAttribute('aria-expanded', 'false');
  botao.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9.5L5 20v-4H4z"/></svg>';
  botao.append('Perguntar a Aveiro');

  const painel = el('section', 'pa-painel');
  painel.hidden = true;
  painel.setAttribute('role', 'dialog');
  painel.setAttribute('aria-label', 'Perguntar a Aveiro');
  const topo = el('header', 'pa-topo');
  const titulo = el('div');
  const estado = el('span');
  const luz = el('i');
  const estadoTexto = document.createTextNode('A ligar ao servidor MCP…');
  estado.append(luz, estadoTexto);
  titulo.append(el('strong', null, 'Perguntar a Aveiro'), estado);
  const fechar = el('button', 'pa-fechar', '×');
  fechar.type = 'button';
  fechar.setAttribute('aria-label', 'Fechar');
  topo.append(titulo, fechar);
  const conversa = el('div', 'pa-conversa');
  conversa.setAttribute('aria-live', 'polite');
  const form = el('form', 'pa-form');
  const caixa = el('input');
  caixa.type = 'text';
  caixa.placeholder = 'Escreve uma pergunta';
  caixa.setAttribute('aria-label', 'Pergunta');
  caixa.autocomplete = 'off';
  const enviar = el('button', null, 'Enviar');
  enviar.type = 'submit';
  form.append(caixa, enviar);
  const nota = el('p', 'pa-nota', 'Demonstração: as perguntas são interpretadas com regras simples, sem modelo de linguagem. Os números são os da API, pedidos por MCP.');
  painel.append(topo, conversa, form, nota);
  document.head.append(estilo);
  document.body.append(painel, botao);

  const aoFundo = () => { conversa.scrollTop = conversa.scrollHeight; };

  function opcoes(lista) {
    const caixaDeOpcoes = el('div', 'pa-opcoes');
    lista.forEach((texto) => {
      const b = el('button', null, texto);
      b.type = 'button';
      b.addEventListener('click', () => perguntar(texto));
      caixaDeOpcoes.append(b);
    });
    return caixaDeOpcoes;
  }

  function dela() {
    const m = el('div', 'pa-ela');
    conversa.append(m);
    return m;
  }

  let contexto = null; // a última ferramenta e os seus argumentos, para as perguntas de seguimento
  let ocupado = false;

  async function perguntar(texto) {
    texto = texto.trim();
    if (!texto || ocupado) return;
    ocupado = true;
    enviar.disabled = true;
    caixa.value = '';
    conversa.querySelectorAll('.pa-opcoes').forEach((o) => o.remove());
    conversa.append(el('p', 'pa-eu', texto));
    const m = dela();
    aoFundo();
    try {
      await responder(texto, m);
    } catch (erro) {
      m.append(el('p', 'pa-erro', 'Não consegui falar com a API: ' + erro.message));
    }
    ocupado = false;
    enviar.disabled = false;
    aoFundo();
  }

  async function responder(texto, m) {
    const t = simples(texto);
    const e = extrair(texto);
    let f = intencao(t);
    let antes = null;
    // um seguimento da pergunta anterior ("e ao sábado?"), ou a resposta ao que ficou por dizer ("Rossio")
    const seguimento = contexto && (/^e\s/.test(t) || (!f && Object.keys(e).length) || (f === contexto.ferramenta && contexto.incompleto));
    if (seguimento) {
      f = f || contexto.ferramenta;
      if (f === contexto.ferramenta) antes = contexto.args;
    }
    if (!f) {
      m.append(el('p', null, 'A isso ainda não sei responder. Pergunta-me por estacionamento, passadeiras, movimento nas ruas, visitas ou tempos de percurso.'), opcoes(SUGESTOES));
      return;
    }
    const { args, falta } = montar(f, e, antes);
    contexto = { ferramenta: f, args, incompleto: Boolean(falta) };
    if (falta) {
      m.append(el('p', null, falta.texto));
      if (falta.opcoes.length) m.append(opcoes(falta.opcoes));
      return;
    }

    const passo = el('p', 'pa-passo', 'A perguntar à API…');
    m.append(passo);
    aoFundo();
    await ligar();
    const t0 = performance.now();
    const [resultado] = await Promise.all([mcp('tools/call', { name: f, arguments: args }), esperar(2 * PAUSA)]);
    const ms = Math.max(1, Math.round(performance.now() - t0 - 2 * PAUSA));
    const corpo = resultado.content[0].text;
    passo.remove();
    if (resultado.isError) {
      m.append(el('p', 'pa-erro', 'A API recusou o pedido: ' + corpo));
      return;
    }
    const r = JSON.parse(corpo);
    // a chamada MCP e o pedido que ela fez à API ficam recolhidos, para quem os quiser ver
    const rasto = el('div', 'pa-rasto');
    const chamada = el('span');
    chamada.append('MCP tools/call ', el('b', null, f), ' ' + JSON.stringify(args));
    const pedido = el('span');
    pedido.append('→ ' + r.pedido + ' ', el('em', null, '200'), ' em ' + ms + ' ms');
    rasto.append(chamada, pedido);
    const comoFoi = el('details', 'pa-como');
    comoFoi.append(el('summary', null, 'Ver o pedido à API'), rasto);

    const v = apresentar(f, args, r);
    m.append(el('p', 'pa-sinal' + (v.simulado ? ' pa-sim' : ''), v.titulo), el('p', null, v.texto));
    if (v.lista) {
      const ul = el('ul', 'pa-lista');
      ul.append(el('li', null, v.lista.titulo));
      v.lista.itens.forEach((i) => ul.append(el('li', null, i)));
      m.append(ul);
    }
    const fonte = el('p', 'pa-fonte' + (v.simulado ? ' pa-sim' : ''));
    fonte.append(el('b', null, v.simulado ? 'Simulado: ' : 'Medido: '), v.fonte);
    m.append(fonte, comoFoi);
    // só as perguntas de seguimento que mudam alguma coisa
    const seguintes = SEGUIMENTOS[f].filter((s) => {
      const novo = montar(f, extrair(s), args).args;
      return JSON.stringify(novo) !== JSON.stringify(args);
    });
    if (seguintes.length) m.append(opcoes(seguintes));
  }

  let aberto = false;
  let apresentado = false;
  function abrir(sim) {
    aberto = sim;
    painel.hidden = !sim;
    botao.setAttribute('aria-expanded', String(sim));
    if (!sim) return botao.focus();
    caixa.focus();
    ligar().then(
      (l) => { luz.className = 'pa-on'; estadoTexto.textContent = 'Ligado por MCP: ' + l.ferramentas.length + ' ferramentas'; },
      () => { luz.className = ''; estadoTexto.textContent = 'Sem ligação à API'; },
    );
    if (!apresentado) {
      apresentado = true;
      dela().append(el('p', null, 'Pergunta-me por estacionamento, passadeiras, movimento nas ruas, visitas ou tempos de percurso em Aveiro. Respondo com os dados da API.'), opcoes(SUGESTOES));
    }
  }

  botao.addEventListener('click', () => abrir(!aberto));
  fechar.addEventListener('click', () => abrir(false));
  form.addEventListener('submit', (ev) => { ev.preventDefault(); perguntar(caixa.value); });
  painel.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') abrir(false); });
})();
