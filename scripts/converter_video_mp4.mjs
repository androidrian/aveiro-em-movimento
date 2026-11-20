// Converte o vídeo .webm em .mp4 (H.264) sem ffmpeg: o Edge reproduz o vídeo e volta a gravá-lo em MP4.
// Demora o tempo do vídeo. Uso:
//   node scripts/converter_video_mp4.mjs <vídeo.webm> <pasta do playwright-core>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';

const [video, pastaPlaywright] = process.argv.slice(2);
if (!video || !pastaPlaywright) {
  console.error('Uso: node scripts/converter_video_mp4.mjs <vídeo.webm> <pasta do playwright-core>');
  process.exit(2);
}
const { chromium } = createRequire(import.meta.url)(pastaPlaywright);
const destino = video.replace(/\.webm$/i, '') + '.mp4';

// o Chromium livre não traz o codificador H.264; o Edge instalado no Windows traz
const browser = await chromium.launch({ channel: 'msedge', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ acceptDownloads: true });
// o vídeo tem de vir da mesma origem que a página para poder ser regravado: serve-se por um servidor local, só para isto
const servidor = http.createServer((pedido, resposta) => {
  if (pedido.url === '/video.webm') {
    resposta.writeHead(200, { 'Content-Type': 'video/webm', 'Content-Length': fs.statSync(video).size });
    fs.createReadStream(video).pipe(resposta);
  } else {
    resposta.writeHead(200, { 'Content-Type': 'text/html' });
    resposta.end('<!doctype html><video src="/video.webm" preload="auto"></video>');
  }
});
await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
await page.goto('http://127.0.0.1:' + servidor.address().port + '/');
const tipo = await page.evaluate(() => ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || null);
if (!tipo) {
  await browser.close();
  console.error('Este browser não grava em MP4.');
  process.exit(1);
}
const descarga = page.waitForEvent('download', { timeout: 0 });
await page.evaluate(async (tipo) => {
  const v = document.querySelector('video');
  v.muted = true;
  v.pause();
  v.currentTime = 0;
  if (v.readyState < 2) await new Promise((ok) => v.addEventListener('canplay', ok, { once: true }));
  const gravador = new MediaRecorder(v.captureStream(), { mimeType: tipo, videoBitsPerSecond: 8_000_000 });
  const partes = [];
  gravador.ondataavailable = (e) => e.data.size && partes.push(e.data);
  const fim = new Promise((ok) => { gravador.onstop = ok; });
  v.addEventListener('ended', () => gravador.stop(), { once: true });
  gravador.start(1000);
  await v.play();
  await fim;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(partes, { type: 'video/mp4' }));
  a.download = 'video.mp4';
  document.body.append(a);
  a.click();
}, tipo);
await (await descarga).saveAs(destino);
await browser.close();
servidor.close();
console.log('MP4:', destino, '(' + tipo + ')');
