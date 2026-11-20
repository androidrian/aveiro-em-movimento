import React, { useEffect, useState } from 'react';
import { BASE, CHAVES } from './api.js';

const CAMINHO = [
  { nome: 'Medir', texto: '2 612 695 registos numa semana, vindos das câmaras, radares e veículos conectados do Aveiro Tech City Living Lab.' },
  { nome: 'Agregar', texto: 'Por hora e por local, sem imagens nem identificadores pessoais: 24 passadeiras, 102 ruas, 264 lugares de estacionamento e 6 locais turísticos.' },
  { nome: 'Responder', texto: 'Indicadores, tempos de percurso e respostas prontas a usar. Cada resposta traz os dados que a sustentam e diz se são reais ou simulados.' },
  { nome: 'Agir', texto: 'Cada entidade decide com a sua resposta e é avisada no momento em que as condições da cidade mudam.' },
];

const ORIGENS = [
  ['Medido pelos sensores', 'Peões, veículos, velocidade acima do limite e tempos de espera nas passadeiras; fluidez das ruas; ocupação do estacionamento; presenças nos locais turísticos. Dias úteis de 3 a 10 de novembro de 2026.'],
  ['Calculado sobre o que foi medido', 'Tempos de percurso na rede de ruas, exposição das passadeiras e todas as respostas. Os dados são por hora: entre duas horas, o mapa mostra valores intermédios.'],
  ['Simulado', 'O dia de chuva (fatores aplicados ao perfil real) e o incidente na Av. de Santa Joana. Aparecem sempre em sinal amarelo.'],
  ['Fictício', 'A Ria Express, as suas entregas e os seus prazos. Servem para mostrar um consumidor a funcionar.'],
];

const EXEMPLO_PEDIDO = 'curl -H "X-API-Key: ' + CHAVES.cidadaos + '" \\\n  "' + window.location.origin + '/v1/respostas/onde-estacionar?destino=-8.6565,40.6412&hora=13"';
const EXEMPLO_RESPOSTA = `{
  "pergunta": "Onde há lugar perto do meu destino?",
  "resposta": "Às 13h há 24 lugares livres na Rua do Alavário, a 2 min a pé do destino.",
  "acao": { "titulo": "Estacionar na Rua do Alavário" },
  "fonte": "real (lugares livres, dias úteis de 3 a 10 de novembro de 2026)",
  "evidencia": [ ... ]
}`;
const EXEMPLO_EVENTOS = `const cidade = new EventSource("/v1/eventos");
cidade.addEventListener("cenario.alterado", () => {
  // as condições mudaram: voltar a perguntar
  recalcular();
});`;

/** Como uma entidade começa a usar a API, e de onde vem cada número. */
export default function Adotar() {
  const [operacoes, setOperacoes] = useState(null);
  useEffect(() => {
    fetch(BASE + '/openapi.json')
      .then((r) => r.json())
      .then((o) => setOperacoes(Object.values(o.paths).reduce((n, p) => n + Object.keys(p).length, 0)))
      .catch(() => {});
  }, []);

  return (
    <>
      <section className="caminho-dados" aria-labelledby="t-caminho">
        <div className="secao-topo">
          <h2 id="t-caminho">Do dado à ação, em quatro passos</h2>
          <p>O que acontece entre um sensor num poste e uma decisão na cidade.</p>
        </div>
        <ol>
          {CAMINHO.map((p) => (
            <li key={p.nome}>
              <h3>{p.nome}</h3>
              <p>{p.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="adotar" aria-labelledby="t-adotar">
        <div className="secao-topo">
          <h2 id="t-adotar">Começar a usar em três passos</h2>
          <p>
            Uma API REST com JSON{operacoes ? ', ' + operacoes + ' operações' : ''} e documentação OpenAPI. As passadeiras também saem em NGSI-v2, o formato das plataformas FIWARE como a do ATCLL: outra cidade com os mesmos dados pode ligar a mesma API.
          </p>
        </div>
        <ol className="passos">
          <li>
            <h3>Pedir uma chave</h3>
            <p>A leitura é pública. A chave identifica a entidade no registo e é o que permite, mais tarde, definir limites de utilização por entidade.</p>
            <table>
              <thead>
                <tr><th>Entidade de demonstração</th><th>Chave</th></tr>
              </thead>
              <tbody>
                <tr><td>Câmara Municipal</td><td><code>{CHAVES.camara}</code></td></tr>
                <tr><td>Ria Express</td><td><code>{CHAVES.ria}</code></td></tr>
                <tr><td>Comércio</td><td><code>{CHAVES.comercio}</code></td></tr>
                <tr><td>Cidadãos e visitantes</td><td><code>{CHAVES.cidadaos}</code></td></tr>
              </tbody>
            </table>
          </li>
          <li>
            <h3>Fazer uma pergunta</h3>
            <p>Um pedido devolve a frase, a ação e a evidência. Não é preciso conhecer os sensores nem tratar os dados.</p>
            <pre>{EXEMPLO_PEDIDO}</pre>
            <pre>{EXEMPLO_RESPOSTA}</pre>
            <p>
              Este pedido chega para uma aplicação: <a href="./estacionar/" target="_blank" rel="noreferrer">Onde estaciono em Aveiro?</a> é uma página só, sem bibliotecas, pronta a usar no telemóvel. Com outro pedido faz-se <a href="./visitar/" target="_blank" rel="noreferrer">Visitar Aveiro com menos gente</a>, o roteiro que foge aos picos de cada local turístico.
            </p>
          </li>
          <li>
            <h3>Ouvir as mudanças</h3>
            <p>Quando as condições da cidade mudam, a API avisa por eventos (Server-Sent Events) ou por webhook. Foi assim que os quatro sinais lá em cima mudaram ao mesmo tempo.</p>
            <pre>{EXEMPLO_EVENTOS}</pre>
            <p>
              <a href="./docs" target="_blank" rel="noreferrer">Abrir a documentação OpenAPI</a>
            </p>
          </li>
        </ol>
      </section>

      <section className="origens" aria-labelledby="t-origens">
        <div className="secao-topo">
          <h2 id="t-origens">O que é medido e o que é simulado</h2>
          <p>Uma semana de dados chega para um perfil típico, não para uma previsão. Cada resposta diz de onde vem.</p>
        </div>
        <dl>
          {ORIGENS.map(([nome, texto]) => (
            <div key={nome} className={nome === 'Simulado' ? 'simulado' : ''}>
              <dt>{nome}</dt>
              <dd>{texto}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
