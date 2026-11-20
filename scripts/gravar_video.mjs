// Grava o vídeo de demonstração: cerca de 1 min 30 s, sem narração, num só plano contínuo.
// Abre cada interface num browser sem janela, mexe nela e grava o ecrã.
//
// Uso, com a API a correr em http://localhost:8000:
//   node scripts/gravar_video.mjs <pasta de saída> <pasta do playwright-core> [caminho do chrome.exe]
//
// Ensaiar só alguns capítulos (1 a 5):  CAPITULOS=2,3 node scripts/gravar_video.mjs ...
// O que aparece por cima das páginas (cartões de capítulo, legendas, cursor) existe só na gravação.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const [saida, pastaPlaywright, executavel] = process.argv.slice(2);
if (!saida || !pastaPlaywright) {
  console.error('Uso: node scripts/gravar_video.mjs <pasta de saída> <pasta do playwright-core> [caminho do chrome.exe]');
  process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(pastaPlaywright);
const API = process.env.API || 'http://localhost:8000';
const SO = (process.env.CAPITULOS || '').split(',').filter(Boolean).map(Number);
const NOME = 'aveiro-em-movimento-demo.webm';
const VISTA = { width: 1440, height: 810 };
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

// ---------------------------------------------------------------- o que se põe por cima de cada página
// Corre no início de cada página: a cortina com o cartão do capítulo, a legenda e o cursor.
// O cartão a mostrar vem em window.name, que passa de uma página para a seguinte.
function palco() {
  const estado = (() => { try { return JSON.parse(window.name) || {}; } catch (e) { return {}; } })();
  const el = (tag, classe) => { const n = document.createElement(tag); n.className = classe; return n; };
  const estilo = document.createElement('style');
  estilo.textContent = `
    .v-cortina, .v-legenda, .v-cursor, .v-toque { position: fixed; pointer-events: none; font-family: 'Segoe UI', system-ui, sans-serif; }
    .v-cortina { inset: 0; z-index: 2147483600; display: grid; place-items: center; background: #101b2d; color: #fff; transition: opacity 0.45s ease; }
    .v-cortina.aberta { opacity: 0; }
    .v-cartao { width: min(1000px, 80vw); transition: opacity 0.3s ease; }
    .v-cartao.a-trocar { opacity: 0; }
    .v-n { display: inline-block; margin-bottom: 22px; padding: 5px 14px; border-radius: 8px; background: #0a4fa3; box-shadow: inset 0 0 0 2px #0a4fa3, inset 0 0 0 3.5px #fff; font-size: 20px; font-weight: 700; }
    .v-n:empty { display: none; }
    .v-t { display: block; font-size: 68px; font-weight: 800; line-height: 1.08; letter-spacing: -0.02em; }
    .v-s { display: block; margin-top: 20px; max-width: 820px; font-size: 27px; line-height: 1.35; color: #b9c6d8; }
    /* a legenda fica em cima, sobre o cabeçalho da página: em baixo taparia os botões em que se clica */
    .v-legenda { left: 50%; top: 10px; z-index: 2147483500; width: max-content; max-width: 1240px; padding: 11px 24px; border-radius: 12px; background: rgba(16, 27, 45, 0.96); color: #fff; font-size: 22px; font-weight: 600; line-height: 1.3; text-align: center; box-shadow: 0 10px 30px rgba(16, 27, 45, 0.35); opacity: 0; transform: translate(-50%, -12px); transition: opacity 0.35s ease, transform 0.35s ease; }
    .v-legenda.on { opacity: 1; transform: translate(-50%, 0); }
    .v-cursor { left: 0; top: 0; z-index: 2147483550; width: 26px; height: 26px; margin: -3px 0 0 -3px; opacity: 0; }
    .v-cursor.on { opacity: 1; }
    .v-toque { z-index: 2147483540; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; border: 3px solid #0a4fa3; background: rgba(10, 79, 163, 0.18); animation: v-toque 0.5s ease-out forwards; }
    @keyframes v-toque { from { transform: scale(0.3); opacity: 1; } to { transform: scale(1.25); opacity: 0; } }
  `;
  const cortina = el('div', 'v-cortina');
  const cartao = el('div', 'v-cartao');
  const n = el('span', 'v-n');
  const t = el('strong', 'v-t');
  const s = el('span', 'v-s');
  cartao.append(n, t, s);
  cortina.append(cartao);
  const legenda = el('div', 'v-legenda');
  const cursor = el('div', 'v-cursor');
  cursor.innerHTML = '<svg viewBox="0 0 26 26" width="26" height="26"><path d="M4 3l16 9.2-7 1.7-3.4 6.5z" fill="#101b2d" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  const escrever = (c) => { n.textContent = c.n || ''; t.textContent = c.titulo || ''; s.textContent = c.sub || ''; };
  escrever(estado);
  // no início da página pode ainda não haver <html>: monta-se assim que existir
  const montar = () => {
    if (!document.documentElement) return false;
    document.documentElement.append(estilo, cortina, legenda, cursor);
    return true;
  };
  if (!montar()) new MutationObserver((_, o) => { if (montar()) o.disconnect(); }).observe(document, { childList: true });

  let relogio = 0;
  window.__video = {
    abrir: () => cortina.classList.add('aberta'),
    // fecha a cortina com um cartão novo; se já estava fechada, troca só o cartão
    fechar: (c) => {
      if (cortina.classList.contains('aberta')) {
        escrever(c);
        cortina.classList.remove('aberta');
      } else {
        cartao.classList.add('a-trocar');
        setTimeout(() => { escrever(c); cartao.classList.remove('a-trocar'); }, 320);
      }
    },
    legenda: (texto, ms) => {
      clearTimeout(relogio);
      legenda.textContent = texto;
      legenda.classList.add('on');
      relogio = setTimeout(() => legenda.classList.remove('on'), ms);
    },
  };
  document.addEventListener('mousemove', (e) => { cursor.classList.add('on'); cursor.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, true);
  document.addEventListener('mousedown', (e) => {
    const toque = el('div', 'v-toque');
    toque.style.left = e.clientX + 'px';
    toque.style.top = e.clientY + 'px';
    document.documentElement.append(toque);
    setTimeout(() => toque.remove(), 600);
  }, true);
}

// ---------------------------------------------------------------- gestos
let rato = { x: VISTA.width / 2, y: VISTA.height / 2 };

/** Leva o cursor até ao elemento, com abrandamento à chegada. */
async function apontar(page, alvo) {
  const loc = typeof alvo === 'string' ? page.locator(alvo).first() : alvo;
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  const fim = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const passos = 26;
  for (let i = 1; i <= passos; i++) {
    const k = 1 - Math.pow(1 - i / passos, 3);
    await page.mouse.move(rato.x + (fim.x - rato.x) * k, rato.y + (fim.y - rato.y) * k);
    await pausa(13);
  }
  rato = fim;
  return loc;
}

async function clicar(page, alvo, depois = 700) {
  await apontar(page, alvo);
  await pausa(200);
  await page.mouse.down();
  await pausa(70);
  await page.mouse.up();
  await pausa(depois);
}

const legenda = (page, texto, ms = 3600) => page.evaluate(([t, d]) => window.__video.legenda(t, d), [texto, ms]);
const botao = (page, nome) => page.getByRole('button', { name: nome, exact: true });

async function condicoes(cenario, incidente) {
  const r = await fetch(API + '/v1/cenarios/atual', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-API-Key': 'cma-painel-demo' }, body: JSON.stringify({ cenario, incidente }) });
  if (!r.ok) throw new Error('Não consegui mudar as condições da cidade: ' + r.status);
}

/** Fecha a cortina com o cartão do capítulo, carrega a página por baixo, prepara-a e volta a abrir. */
async function capitulo(page, cartao, url, pronto, preparar) {
  const t0 = Date.now();
  if (page.url() !== 'about:blank') {
    await page.evaluate((c) => window.__video.fechar(c), cartao);
    await pausa(500);
  }
  await page.evaluate((c) => { window.name = JSON.stringify(c); }, cartao);
  await page.goto(API + url);
  await page.locator(pronto).first().waitFor();
  if (preparar) await preparar();
  await pausa(Math.max(0, 2300 - (Date.now() - t0)));
  await page.evaluate(() => window.__video.abrir());
  await pausa(600);
}

// ---------------------------------------------------------------- os cinco capítulos
const CAPITULOS = [
  async function estacionar(page) {
    await capitulo(page, { n: '1 de 5', titulo: 'Onde estaciono em Aveiro?', sub: 'Uma página só, para o telemóvel. A resposta é um pedido à API.' }, '/estacionar/', '.sinal');
    await legenda(page, 'O parque com lugares livres mais perto do destino, à hora de chegada');
    await pausa(2000);
    await clicar(page, botao(page, 'Rossio'), 1200);
    await clicar(page, page.locator('#dias button', { hasText: 'Sáb' }), 1300);
    await legenda(page, 'Muda-se o destino, o dia ou a hora, e a API responde de novo');
    await apontar(page, '#hora');
    await pausa(250);
    await page.locator('#hora').selectOption('18');
    await pausa(1700);
    await clicar(page, '#alcance', 1500);
  },

  async function portal(page) {
    await capitulo(page, { n: '2 de 5', titulo: 'O portal da cidade', sub: 'O dia hora a hora, e quatro entidades a receber cada uma a sua resposta.' }, '/', '.cartao .sinal', async () => {
      await page.locator('.cartao .sinal').nth(3).waitFor();
      // o mapa, os controlos e os quatro cartões têm de caber na imagem sem deslizar: reduz-se a página o que for preciso
      await page.evaluate(async (altura) => {
        let z = 1;
        for (let i = 0; i < 5; i++) {
          const fundo = Math.max(...[...document.querySelectorAll('.cartao, .cidade')].map((c) => c.getBoundingClientRect().bottom));
          z = Math.min(1, (z * altura) / fundo);
          document.body.style.zoom = z;
          await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
        }
      }, VISTA.height - 10);
      // o dia começa às 6h
      await page.locator('#hora').press('Home');
      await pausa(700);
    });
    await legenda(page, 'Município, logística, comércio e cidadãos: a mesma API, uma resposta para cada um');
    await pausa(1800);
    await clicar(page, '.tocar', 300);
    await legenda(page, 'O dia a correr: trânsito, travessias, lugares livres e turismo mudam hora a hora', 4600);
    // para-se à uma da tarde, a hora de mais movimento; o cursor já está em cima do botão
    await page.waitForFunction(() => /12:(4[5-9]|5\d)|13:/.test(document.querySelector('.cidade-topo h2').textContent));
    await page.mouse.down();
    await page.mouse.up();
    await pausa(1100);
    await clicar(page, botao(page, 'Dia de chuva'), 300);
    await legenda(page, 'Começa a chover: os sinais passam a amarelo, porque assentam em simulação');
    await pausa(2500);
    await clicar(page, botao(page, 'Incidente'), 300);
    await legenda(page, 'Um incidente na avenida: quem depende do trânsito recebe logo a resposta nova');
    await pausa(2900);
  },

  async function planeador(page) {
    await condicoes('normal', false);
    await capitulo(page, { n: '3 de 5', titulo: 'A rota de uma transportadora', sub: 'As entregas do dia, com os tempos de percurso que a API calcula.' }, '/transportadora/', '.entrega', async () => {
      // simulação de um dia normal, com saída às 10:30
      await page.getByRole('radio', { name: 'Simulação' }).click();
      await page.getByRole('button', { name: 'Partida às' }).click();
      await page.getByRole('option', { name: '10:30' }).click();
      await page.locator('.entrega .caixa[aria-checked="false"]').first().waitFor();
      await pausa(900);
    });
    const porFazer = page.locator('.entrega .caixa[aria-checked="false"]');
    await legenda(page, 'A cada entrega feita, o caminho que falta é validado na API', 4000);
    await pausa(1100);
    await clicar(page, porFazer.first(), 350);
    await page.locator('.validacao.ok').waitFor();
    await pausa(1100);
    await clicar(page, porFazer.first(), 350);
    await page.locator('.validacao.ok').waitFor();
    await pausa(1300);
    await clicar(page, page.locator('.pilulas button', { hasText: 'Incidente' }), 300);
    await legenda(page, 'Incidente na avenida: a ordem das entregas e a rota refazem-se', 3800);
    await pausa(3900);
  },

  async function visitar(page) {
    await capitulo(page, { n: '4 de 5', titulo: 'Visitar Aveiro com menos gente', sub: 'Um roteiro que apanha cada local turístico longe do seu pico.' }, '/visitar/', '.sinal');
    await legenda(page, 'Escolhem-se os locais: a API devolve a ordem e as horas de visita', 3800);
    await pausa(1900);
    await clicar(page, botao(page, 'Fórum'), 1800);
    await clicar(page, botao(page, 'Sábado'), 1500);
    await legenda(page, 'A grelha mostra quando enche cada local; o contorno é a hora da visita', 3800);
    await pausa(1500);
    await clicar(page, botao(page, '11h'), 2300);
  },

  async function chat(page) {
    await condicoes('normal', false);
    await capitulo(page, { n: '5 de 5', titulo: 'Perguntar à cidade', sub: 'Um assistente ligado à API pelo protocolo MCP.' }, '/', '.pa-botao', async () => {
      await page.locator('.cartao .sinal').first().waitFor();
      await page.locator('.pa-botao').click();
      // o chat em destaque: ao centro, maior, com o portal escurecido por trás
      await page.addStyleTag({
        content: `
          .pa-painel { right: 50% !important; bottom: 50% !important; width: 450px !important; height: 580px !important; transform: translate(50%, 54%) scale(1.15) !important; transform-origin: 50% 50% !important; animation: none !important; }
          .pa-botao { display: none !important; }
          .v-fundo { position: fixed; inset: 0; z-index: 999; background: rgba(16, 27, 45, 0.62); }
        `,
      });
      await page.evaluate(() => {
        const fundo = document.createElement('div');
        fundo.className = 'v-fundo';
        document.body.append(fundo);
      });
      await page.getByText('Ligado por MCP').waitFor();
    });
    await pausa(900);
    await apontar(page, '.pa-form input');
    await page.mouse.down();
    await page.mouse.up();
    await pausa(350);
    await page.keyboard.type('Onde estaciono no sábado às 10h perto do Rossio?', { delay: 42 });
    await pausa(400);
    await page.keyboard.press('Enter');
    await page.locator('.pa-sinal').first().waitFor();
    await legenda(page, 'A pergunta vira um pedido à API. A resposta diz se o valor foi medido ou é simulado', 3600);
    await pausa(3400);
    await clicar(page, page.locator('.pa-opcoes button', { hasText: 'E às 18h?' }), 0);
    await page.locator('.pa-sinal').nth(1).waitFor();
    await pausa(2900);
  },
];

// ---------------------------------------------------------------- gravação
fs.mkdirSync(saida, { recursive: true });
await condicoes('normal', false);
const browser = await chromium.launch(executavel ? { executablePath: executavel } : { channel: 'msedge' });
const contexto = await browser.newContext({
  viewport: VISTA, // o vídeo sai com o tamanho da janela: 1440 x 810 (16:9), com a interface maior do que a 1920
  locale: 'pt-PT',
  colorScheme: 'dark', // a página em branco do arranque fica escura, como a cortina
  recordVideo: { dir: saida, size: VISTA },
});
await contexto.addInitScript(palco);
const page = await contexto.newPage();
const inicio = Date.now();
const segundos = () => ((Date.now() - inicio) / 1000).toFixed(1) + ' s';
try {
  await page.emulateMedia({ colorScheme: 'light' });
  const escolhidos = CAPITULOS.filter((_, i) => !SO.length || SO.includes(i + 1));
  if (!SO.length) {
    // abertura: o cartão do projeto, com a primeira página a carregar por baixo
    await page.evaluate((c) => { window.name = JSON.stringify(c); }, { titulo: 'Aveiro em Movimento', sub: 'Uma API sobre os sensores da cidade. Estas são cinco aplicações construídas com ela.' });
    await page.goto(API + '/estacionar/');
    await pausa(3000);
  }
  for (const c of escolhidos) {
    await c(page);
    console.log(c.name.padEnd(12), 'até aos', segundos());
  }
  await page.evaluate((c) => window.__video.fechar(c), { titulo: 'Uma API, cinco aplicações', sub: 'Estacionamento, portal da cidade, logística, turismo e assistente. Tudo o que se viu são pedidos à mesma API.' });
  await pausa(SO.length ? 1200 : 4200);
} finally {
  await condicoes('normal', false).catch(() => {});
  const video = page.video();
  await contexto.close();
  await browser.close();
  const destino = path.join(saida, SO.length ? 'ensaio-' + SO.join('-') + '.webm' : NOME);
  fs.rmSync(destino, { force: true });
  fs.renameSync(await video.path(), destino);
  console.log('Vídeo:', destino, '·', segundos());
}
