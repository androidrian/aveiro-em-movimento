# Aveiro em Movimento

Protótipo para o desafio #1 do Aveiro Tech City Hackathon 2026, "Smart Aveiro: From Data to Action".

A ideia: **a API é o produto**. Transforma os dados dos sensores do Aveiro Tech City Living Lab em respostas concretas, e cada entidade (município, logística, comércio, cidadãos e visitantes) usa-as para decidir o que fazer.

Quatro peças que correm na tua máquina:

| Pasta | O que é | Endereço |
|---|---|---|
| `api/` | API (FastAPI): indicadores, tempos de percurso, respostas, condições em vigor | http://localhost:8000/docs |
| `portal/` | Página inicial da API e palco da demonstração (React) | http://localhost:8000/ |
| `painel/` | Painel de métricas do município (React) | http://localhost:8000/painel/ |
| `transportadora/` | Planeador de rotas da Ria Express, transportadora fictícia (React) | http://localhost:8000/transportadora/ |

## Correr (só precisa de Python 3.10+)

As três interfaces já vão compiladas (pasta `dist` de cada uma) e são servidas pela própria API.

**Windows:** duplo clique em `iniciar.bat`. Fica uma janela preta aberta com a API a correr; o browser abre sozinho quando ela responde. Fechar essa janela pára a API.

**Linux/macOS:** `./iniciar.sh`

Na primeira vez, o script cria um ambiente Python fora da pasta do projeto (em `%LOCALAPPDATA%\aveiro-em-movimento\venv`), para o OneDrive não o sincronizar, e instala o FastAPI e o Uvicorn.

Ou à mão, num terminal:

```
cd api
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000
```

Se o browser mostrar "localhost recusou estabelecer ligação", a API não está a correr: é preciso a janela do `iniciar.bat` (ou o comando acima) aberta.

Depois de atualizar o código da API, fecha a janela dela e volta a abrir o `iniciar.bat`.

## O portal: o palco da demonstração

Num só ecrã:

- **O mapa da cidade a uma hora do dia**, com os quatro verticais juntos: fluidez das ruas, passadeiras, lugares de estacionamento livres e presenças nos locais turísticos.
- **Quatro consumidores**, cada um com a sua pergunta, a ação que recebe (o sinal) e o pedido que fez à API com a sua chave.
- **Os pedidos a chegar em direto**, contados por entidade.

Os sinais dizem a origem do dado pela cor: **azul** quando a ação assenta em dados medidos, **amarelo** (como a sinalização temporária) quando assenta em simulação.

Logo abaixo, **As métricas do serviço**: um dashboard com os quatro verticais para a cidade inteira (números da hora escolhida, o dia inteiro em gráfico e a discriminação por rua, passadeira, parque e local). Com o dia de chuva em vigor, o dia normal fica como linha de referência. Tudo vem de um só pedido a `/v1/metricas`.

Mais abaixo: uma consola para experimentar a API, como começar a usá-la em três passos e o que é medido e o que é simulado.

O dia percorre-se de 30 em 30 minutos. A API tem agregados por hora: nas meias horas, o mapa e os quatro números do topo mostram o ponto médio entre as duas horas medidas, e as respostas são as da hora em curso. Entre dois passos nada salta: o relógio passa pelos minutos, os números rolam até ao valor novo, as ruas mudam de cor aos poucos e as que mudam de nível largam uma onda da cor nova. O cursor "Velocidade" faz o dia correr entre 0,25× e 3× (a 1×, o dia inteiro leva 18 segundos).

O botão das quatro cores, no canto superior direito, troca o tema da página para as **cores de Aveiro** (a Ria, o sal, o azul dos azulejos e a faixa pintada de um moliceiro) e de volta. A escolha fica lembrada no browser. O amarelo continua a ser só da simulação.

Clicar num cartão destaca no mapa o que lhe diz respeito. Clicar na linha do pedido abre a resposta completa na consola.

## Roteiro da demo (3 minutos)

O guião plano a plano, com o que dizer, está em `../docs/roteiro-video-3min.md`. Em resumo:

1. Abre o **portal** (http://localhost:8000/). Carrega em **Reproduzir demonstração**: em 70 segundos percorre o dia, passa pelos quatro consumidores, muda para dia de chuva e lança um incidente, com legendas. Qualquer clique interrompe.
2. Ou faz à mão: percorre o dia com o botão de reprodução, clica nos cartões, carrega em **Dia de chuva** e em **Incidente**. Os quatro sinais mudam ao mesmo tempo e passam a amarelo.
3. No cartão da Ria Express, **Abrir o planeador**: é a aplicação da transportadora, com os mesmos números (às 08:00, 1h42 num dia normal; 2h00 com chuva; 2h06 com chuva e incidente).
4. No cartão da Câmara, **Abrir o painel**: é o painel do município. No fundo, "Quem está a usar estes dados pela API" mostra os pedidos das outras entidades.
5. De volta ao portal, desce até **Experimentar a API**, escolhe uma resposta e envia.

O planeador e o painel acompanham as condições publicadas no portal, mesmo abertos noutro separador.

### No planeador da Ria Express

As entregas começam por marcar. A caixa de cada uma serve para dizer que a entrega está feita (marcar a terceira marca também as duas anteriores; desmarcar desfaz essa e as seguintes).

A cada entrega marcada, o planeador valida o caminho das que faltam com a API (`/v1/cenarios/atual` e `/v1/rede/tempos-percurso`) e diz o resultado: caminho validado, trânsito detetado ou ordem recalculada. Se as condições mudarem a meio da rota, valida de novo sem esperar pela marca seguinte. A ordem só muda quando o trânsito mudou e outra ordem evita um atraso ou poupa pelo menos meio minuto; nesse caso as linhas da lista deslizam para a ordem nova e a rota desenha-se de novo no mapa.

Dois casos que mostram a ordem a mudar, no modo **Simulação**:

- Partida às 08:00, marcar a primeira entrega, carregar em **Dia de chuva**: a Loja Fórum Aveiro passa de 2.ª para 8.ª, para não falhar um prazo.
- Partida às 10:30, marcar a segunda entrega, carregar em **Incidente**: a Clínica passa para antes da Farmácia.

No modo **Tempo real** acontece o mesmo quando o portal ou o painel publicam a chuva ou o incidente. Com as condições que a API simula hoje (a chuva e um incidente na Av. de Santa Joana), a ordem só muda nas primeiras entregas; noutros momentos o planeador avisa do trânsito, atualiza as horas e o caminho, e mantém a ordem.

O primeiro ecrã (controlos, lista, mensagem, números e mapa) ocupa a janela inteira, sem deslizar, a partir de 1180 px de largura; a tabela das ruas do troço fica por baixo.

## Exemplo pronto a usar: "Onde estaciono em Aveiro?"

http://localhost:8000/estacionar/ é uma aplicação feita só com a API, para mostrar quanto custa construir sobre ela: `exemplos/estacionar/index.html` é um ficheiro só (HTML, CSS e JavaScript), sem bibliotecas, sem compilação e sem servidor próprio.

Escolhe-se o destino (o local do hackathon, o Rossio, o Fórum, a Estação, a Universidade ou um toque no mapa), o dia da semana (sem data; por omissão, o de hoje) e a hora de chegada. A página responde com o parque com lugares livres mais perto, as alternativas, o dia inteiro desse parque e um botão que abre o caminho no Google Maps.

Usa três pedidos, com a chave `cidadaos-demo`:

| Pedido | Para quê |
|---|---|
| `GET /v1/respostas/onde-estacionar?destino=lon,lat&dia=sexta&hora=H&cenario=normal&limite=3` | A recomendação: frase, parque e alternativas |
| `GET /v1/estacionamento?dia=sexta` | Os lugares livres de cada parque nas 24 horas desse dia (o gráfico e os números do mapa) |
| `GET /v1/rede/mapa` | O desenho das ruas e a projeção, para escolher o destino com um toque |

O parâmetro `dia` (`segunda`, `terca`, `quarta`, `quinta`, `sexta`, `sabado`, `domingo`) existe nos dois pedidos de estacionamento; sem ele, a API devolve a média dos dias úteis, como antes. A semana medida (3 a 10 de novembro) tem um dia de cada, por isso cada dia da semana assenta num único dia medido, e a `fonte` da resposta diz qual. Não é o estado em tempo real; a página di-lo.

A ocupação por dia da semana vem de `scripts/estacionamento_por_dia.py`, que reconstrói o estado de cada lugar a partir dos eventos dos sensores (`python -I scripts/estacionamento_por_dia.py ../datasets/smartparking.csv api/dados/estacionamento.json api/dados/estacionamento_dias.json`). A média dos dias úteis calculada assim fica 2 a 3 pontos percentuais acima da que a API já usava (calculada antes, por outro método), com a mesma forma ao longo do dia.

Para a publicar: alojar o ficheiro em qualquer servidor de páginas estáticas e indicar onde está a API com `index.html?api=https://endereço-da-api` (a API aceita pedidos de qualquer origem). Aberto diretamente do disco, o ficheiro fala com `http://localhost:8000`.

As coordenadas da Fábrica Centro Ciência Viva na lista de destinos são aproximadas (-8.6574, 40.6381); convém confirmá-las antes de publicar.

## Segundo exemplo: "Visitar Aveiro com menos gente"

http://localhost:8000/visitar/ é outra aplicação de um ficheiro só (`exemplos/visitar/index.html`), para quem visita a cidade. Escolhem-se os locais turísticos (de 2 a 6), o dia (dia útil, sábado ou domingo; por omissão, o de hoje) e a hora de começar, ou deixa-se a API escolher a melhor. A página mostra:

- a ordem de visita, hora a hora, com as presenças e a percentagem do pico de cada local e os minutos a pé entre paragens;
- uma grelha local × hora (das 9h às 17h) com a hora de cada visita marcada, para se ver onde estão os picos e como o roteiro lhes foge;
- o mapa com as paragens numeradas e uma ligação que abre o roteiro a pé no Google Maps.

Usa três pedidos, com a chave `cidadaos-demo`:

| Pedido | Para quê |
|---|---|
| `GET /v1/respostas/roteiro-visita?locais=rossio,forum,ria&dia=sabado&inicio=10&cenario=normal` | O roteiro: ordem, horas, números de cada paragem e a grelha |
| `GET /v1/turismo/locais` | Os locais que se podem escolher |
| `GET /v1/rede/mapa` | O desenho das ruas |

Como a API escolhe a ordem (`respostas.roteiro_visita`):

- Conta uma hora por local, entre as 9h e as 18h, as horas em que todos os locais têm contagens.
- Experimenta todas as ordens. A ocupação de uma ordem é a média, local a local, das presenças à hora da visita a dividir pelo pico desse local.
- Entre as ordens que ficam a menos de 5 pontos percentuais da menor ocupação possível, fica a que obriga a andar menos. Sem `inicio`, escolhe também a hora de começar.
- A resposta traz `ocupacao_media` (a da ordem sugerida), `ocupacao_melhor`, `ocupacao_pedida` (a da ordem em que os locais foram indicados) e `ocupacao_pior`.

Limites: a uma hora por local é uma simplificação nossa; os dados não dizem quanto tempo dura uma visita (a permanência mediana medida é de segundos, porque os sensores contam passagens). Os minutos a pé são a distância em linha reta com 30% de desvio. O sábado e o domingo são um dia medido cada.

## As duas páginas publicadas, sem API

As duas páginas de exemplo estão publicadas no GitHub Pages, a funcionar sem a API por trás:

- https://androidrian.github.io/aveiro-em-movimento/estacionar/
- https://androidrian.github.io/aveiro-em-movimento/visitar/

O GitHub Pages só aloja ficheiros, por isso cada página publicada leva consigo os dados da semana medida de que precisa (lugares livres por parque, dia da semana e hora; presenças por local e hora; o desenho das ruas) e responde aos seus próprios pedidos com `exemplos/sem-api.js`, que aplica as mesmas regras de `api/app/respostas.py`. A página diz que está nesta versão, em "Como foi feito". Com a API à mão, as mesmas páginas continuam a pedir-lhe a resposta pronta.

A pasta `docs/` é gerada; alterar em `exemplos/` e voltar a gerar:

```
python scripts/publicar_paginas.py api exemplos docs https://github.com/androidrian/aveiro-em-movimento
node scripts/conferir_paginas.mjs docs exemplos http://localhost:8000
```

O segundo comando, com a API a correr, compara as respostas calculadas na página com as da API, pedido a pedido: todos os destinos da página e doze pontos ao acaso em todos os dias e horas, e todos os conjuntos de locais em todos os dias e horas de começar (5 502 pedidos, todos iguais).

## O que é real e o que é simulado

| Dado | Origem |
|---|---|
| Peões, veículos, % acima do limite e espera por hora, nas 24 passadeiras | Real: média dos dias úteis de 3 a 10 de novembro de 2026 |
| Tempo de travessia (mediana e P90) | Real, da semana inteira (não há série por hora) |
| Estacionamento: 264 lugares em 10 postes, ocupação por hora | Real. Os 10 lugares "sem informação" são do poste 30, sem dados desde 4 de novembro |
| Nome e posição de cada parque | Real: centro dos lugares de cada poste e rua mais próxima, do dataset |
| Presenças por hora em 6 locais turísticos (11 zonas) | Real. Depois das 18h, as zonas do Rossio e dos Moliceiros quase não têm contagens |
| Fluidez das 102 ruas medidas | Real (velocidade face à velocidade livre da própria rua) |
| Velocidade em km/h | Real, só nos radares. Nas câmaras a unidade da velocidade não está confirmada, por isso só se usa a fluidez |
| Tempos de percurso num dia normal | Calculados sobre a rede de ruas com a fluidez real por hora |
| Respostas (onde intervir, melhor hora, onde estacionar, quando visitar) | Calculadas sobre os indicadores acima; cada uma traz a evidência e a fonte |
| Dia de chuva | Simulado: fatores aplicados ao perfil real (trânsito mais lento, mais carros, menos peões) |
| Incidente na Av. de Santa Joana | Simulado: trânsito a 15% da velocidade habitual |
| Ria Express, entregas, prazos e tempos de serviço | Fictícios (ficam em `transportadora/src/dados.js`) |

As "zonas" do painel são grupos de passadeiras vizinhas (a menos de 150 m), com o nome das ruas principais. Os "locais" turísticos são as zonas turísticas do ATCLL com o mesmo nome, somadas.

## API

Chave no cabeçalho `X-API-Key` (ou `?chave=`). Sem chave, a leitura é pública.

| Chave de demonstração | Entidade | Pode mudar o cenário |
|---|---|---|
| `cma-painel-demo` | Câmara Municipal · Painel | sim |
| `ria-express-demo` | Ria Express Entregas | não |
| `comercio-demo` | Associação Comercial de Aveiro | não |
| `cidadaos-demo` | App Passadeiras Amigas | não |
| `assistente-demo` | Assistente de IA (MCP) | não |

### Respostas: dos indicadores à ação

Cada resposta devolve a pergunta, uma frase pronta a mostrar, a ação (`acao.titulo` e `acao.detalhe`), os itens, a evidência com o endpoint de onde vem cada número, a `fonte` e o campo `simulado`.

| Método | Endpoint | Para quem | O que responde |
|---|---|---|---|
| GET | `/v1/respostas` | todos | Catálogo das respostas, com um exemplo de pedido |
| GET | `/v1/respostas/onde-intervir?hora=&limite=` | município | Passadeiras ordenadas por exposição (peões x veículos x % acima do limite), o motivo e as ruas lentas dessa hora |
| GET | `/v1/respostas/melhor-hora?zona=&para=montra\|cargas&hora=` | comércio, logística | Hora de mais movimento a pé, ou a mais desimpedida para cargas e descargas |
| GET | `/v1/respostas/onde-estacionar?destino=lon,lat&origem=lon,lat&hora=` | cidadãos | Parques com lugares livres, por minutos de carro (com `origem`) mais minutos a pé |
| GET | `/v1/respostas/quando-visitar?local=&dia=&hora=` | visitantes | Afluência agora, hora mais calma e hora de pico de um local |
| GET | `/v1/respostas/roteiro-visita?locais=a,b,c&dia=&inicio=` | visitantes | Ordem de visita de vários locais que apanha cada um mais longe do seu pico |

### Indicadores, rede e tempo real

| Método | Endpoint | Para quê |
|---|---|---|
| GET | `/v1/metricas?dia=&cenario=` | As métricas dos quatro verticais para a cidade inteira, hora a hora |
| GET | `/v1/zonas` | Zonas com passadeiras inteligentes |
| GET | `/v1/zonas/{id}/perfil?cenario=` | 24 horas de uma zona: peões, veículos, espera, velocidade, fluidez |
| GET | `/v1/zonas/{id}/relacoes?cenario=` | Estacionamento x peões e trânsito x velocidade |
| GET | `/v1/passadeiras?hora=&ordenar=` | Todas as passadeiras numa hora |
| GET | `/v1/passadeiras/{id}/metricas?hora=&formato=ngsi` | Uma passadeira; `formato=ngsi` devolve a entidade NGSI-v2 |
| GET | `/v1/segmentos?hora=` | Volume, velocidade e fluidez das 102 ruas medidas |
| GET | `/v1/estacionamento` | Lugares livres, ocupados e sem informação, por hora; cada parque com nome e posição |
| GET | `/v1/turismo/locais` | Os 6 locais turísticos, com nome e posição |
| GET | `/v1/turismo/afluencia?dia=&cenario=` | Presenças por zona turística |
| GET | `/v1/rede/mapa` | Mapa base para desenhar |
| GET | `/v1/rede/tempos-percurso?pontos=lon,lat;...&hora=` | Minutos entre pontos |
| GET | `/v1/rede/percurso?de=lon,lat&para=lon,lat&hora=` | Caminho mais rápido, rua a rua |
| GET / PUT | `/v1/cenarios/atual` | Ver ou mudar o cenário em vigor (`normal` ou `chuva`, com ou sem `incidente`) |
| GET | `/v1/eventos` | Avisos em tempo real (Server-Sent Events) |
| POST | `/v1/webhooks` | Subscrever avisos de mudança de cenário |
| GET | `/v1/registo` | Últimos pedidos feitos à API |

Nos endpoints com `cenario`: se o parâmetro for omitido, vale o cenário em vigor (tempo real); se for indicado, é uma simulação.

Cada resposta leva o cabeçalho `Server-Timing` com os milissegundos que a API demorou.

Exemplos:

```
curl "http://localhost:8000/v1/respostas/onde-intervir?hora=13"
curl -H "X-API-Key: cidadaos-demo" "http://localhost:8000/v1/respostas/onde-estacionar?destino=-8.6565,40.6412&hora=13"
curl "http://localhost:8000/v1/passadeiras/0023/metricas?hora=13&cenario=normal"
curl -X PUT http://localhost:8000/v1/cenarios/atual -H "X-API-Key: cma-painel-demo" -H "Content-Type: application/json" -d "{\"cenario\":\"chuva\",\"incidente\":false}"
```

### Assistentes de IA (MCP)

A API também se apresenta a assistentes de IA, pelo [Model Context Protocol](https://modelcontextprotocol.io), em `POST /mcp`. Um assistente ligado a este endereço descobre as ferramentas sozinho e responde a perguntas como "onde estaciono às 8h de sexta perto da Fábrica Ciência Viva?" com os números da API.

| Ferramenta | Pedido que faz à API |
|---|---|
| `onde_estacionar` | `GET /v1/respostas/onde-estacionar` |
| `onde_intervir` | `GET /v1/respostas/onde-intervir` |
| `melhor_hora` | `GET /v1/respostas/melhor-hora` |
| `quando_visitar` | `GET /v1/respostas/quando-visitar` |
| `planear_visita` | `GET /v1/respostas/roteiro-visita` |
| `tempo_de_percurso` | `GET /v1/rede/percurso` |
| `condicoes_da_cidade` | `GET /v1/cenarios/atual` |

- Cada ferramenta é um pedido à própria API, feito dentro do processo: a mesma validação, a mesma resposta e o mesmo registo. Nada é calculado de novo (`api/app/mcp.py`, sem dependências novas).
- Os lugares podem ir pelo nome (Fábrica Centro Ciência Viva, Rossio, Fórum Aveiro, Estação de comboios, Universidade de Aveiro, Saída de Moliceiros) ou em `lon,lat`.
- O resultado é o JSON da API sem a geometria de desenho, com o campo `pedido` a dizer que pedido foi feito. Traz a `fonte` e o campo `simulado`, e o servidor pede ao assistente que diga sempre se um valor foi medido ou é simulado.
- No registo, os pedidos aparecem como "Assistente de IA (MCP)" (chave `assistente-demo`).
- Só leitura: um assistente não muda o cenário da cidade.

Ligar o Claude Code, com a API a correr:

```
claude mcp add --transport http aveiro http://localhost:8000/mcp
```

Ligar o Claude Desktop (precisa de Node), em `claude_desktop_config.json`:

```
{ "mcpServers": { "aveiro": { "command": "npx", "args": ["-y", "mcp-remote", "http://localhost:8000/mcp"] } } }
```

#### Chat de demonstração: "Perguntar a Aveiro"

O portal tem um botão "Perguntar a Aveiro" no canto inferior direito. É um ficheiro só, sem bibliotecas (`exemplos/assistente/assistente.js`), que qualquer página pode incluir com uma linha:

```
<script src="http://localhost:8000/assistente/assistente.js" defer></script>
```

- **O que é verdadeiro**: a ligação MCP (`initialize`, `tools/list`, `tools/call`) e todos os números. Cada resposta diz se o valor foi medido (azul) ou é simulado (amarelo). A chamada MCP, o pedido que ela fez à API e os milissegundos ficam recolhidos em "Ver o pedido à API".
- **O que é simulado**: o assistente. Não há modelo de linguagem: regras simples escolhem a ferramenta e os argumentos a partir da pergunta, e o próprio chat diz isso em rodapé. Um assistente a sério liga-se ao mesmo endereço e faz essa parte sozinho.
- Entende perguntas de seguimento ("E ao sábado?", "E com chuva?", "E às 18h?") e pergunta o que faltar ("Para onde vais?").
- Sem `cenario` na pergunta, responde com as condições em vigor: com a chuva ligada no portal, as respostas passam a amarelo.
- Os pedidos do chat aparecem no registo do portal, na coluna "Assistente de IA".

O servidor foi confirmado com o cliente do SDK oficial de MCP para Python (apresentação, lista de ferramentas, chamadas e erros). Fala o transporte Streamable HTTP com respostas em JSON, sem sessão, nas versões do protocolo 2024-11-05, 2025-03-26 e 2025-06-18.

## Desenvolvimento

### Alterar as interfaces

Precisa de Node 18+. Depois de alterar uma interface:

```
construir.bat             (compila as três)
construir.bat portal      (compila só essa)
```

O script copia as pastas para `%LOCALAPPDATA%\aveiro-em-movimento\build`, instala as dependências lá (para o `node_modules` não ir para o OneDrive) e devolve a pasta `dist` ao projeto. É preciso reiniciar a API se a pasta `dist` ainda não existia.

Para desenvolver com recarga automática, com o projeto fora do OneDrive:

```
cd api            && python -m uvicorn app.main:app --reload --port 8000 --timeout-graceful-shutdown 1
cd portal         && npm install && npm run dev      (http://localhost:5175)
cd painel         && npm install && npm run dev      (http://localhost:5173)
cd transportadora && npm install && npm run dev      (http://localhost:5174)
```

O Vite encaminha os pedidos a `/v1` para a API na porta 8000. O `--timeout-graceful-shutdown 1` evita que a recarga da API fique à espera das páginas que têm os eventos abertos.

O portal usa o planeador e os dados da transportadora (`transportadora/src/planeador.js` e `dados.js`), para os números do cartão da Ria Express serem os da aplicação dela.

### Vídeo de demonstração

`scripts/gravar_video.mjs` grava um vídeo de cerca de 1 min 30 s, sem narração, num só plano: abre cada interface num browser sem janela, mexe nela e grava o ecrã. Os capítulos são o estacionamento, o portal (o dia a correr, chuva, incidente), o planeador de entregas (entregas feitas e rota refeita), o roteiro de visita e o chat em destaque. Os cartões de capítulo, as legendas e o cursor existem só na gravação.

Com a API a correr e o `playwright-core` instalado algures (não é dependência do projeto):

```
node scripts/gravar_video.mjs <pasta de saída> <pasta do playwright-core> [caminho do chrome.exe]
node scripts/converter_video_mp4.mjs <pasta de saída>/aveiro-em-movimento-demo.webm <pasta do playwright-core>
```

O primeiro comando produz um `.webm` de 1440 x 810; sem o caminho do `chrome.exe`, usa o Edge. O segundo converte-o em `.mp4` (H.264) sem ffmpeg: o Edge reproduz o vídeo e volta a gravá-lo, por isso demora o tempo do vídeo. Para ensaiar só alguns capítulos: `CAPITULOS=2,3 node scripts/gravar_video.mjs ...`. A gravação muda as condições da cidade na API e repõe o dia normal no fim.

### Testes da API

```
cd api
pip install -r requirements-dev.txt
python -m pytest -q
```

### Voltar a extrair os nomes do dataset

Os nomes e as posições dos parques e dos locais turísticos vêm das entidades de referência do dataset do desafio. Com o dataset numa pasta `datasets`:

```
python -I scripts/extrair_referencias.py ../datasets api/dados/referencias.json
```

## Estrutura

```
api/
  app/main.py          rotas, chaves e registo de pedidos
  app/respostas.py     camada de respostas: dos indicadores à ação
  app/mcp.py           servidor MCP: as respostas como ferramentas para assistentes de IA
  app/indicadores.py   motor de indicadores (zonas, passadeiras, ruas, estacionamento, turismo)
  app/rede.py          rede de ruas, tempos de percurso e caminhos
  app/estado.py        cenário em vigor, eventos, webhooks
  app/dados.py         carrega os agregados
  dados/*.json         agregados por hora e por local (sem dados pessoais)
  tests/               test_api.py, test_respostas.py, test_mcp.py
portal/src/            App.jsx, Mapa.jsx, Cartao.jsx, consumidores.js, Consola.jsx, Adotar.jsx, demo.js, api.js, styles.css
painel/src/            App.jsx, graficos.jsx, api.js, styles.css
transportadora/src/    App.jsx, planeador.js (ordem das entregas), dados.js, api.js, styles.css
exemplos/              estacionar/ e visitar/ (uma página cada), assistente/ (o chat), sem-api.js
docs/                  as duas páginas tal como estão publicadas no GitHub Pages (gerada)
scripts/               extrair_referencias.py, estacionamento_por_dia.py, publicar_paginas.py, conferir_paginas.mjs, gravar_video.mjs, converter_video_mp4.mjs
construir.bat          compila as interfaces fora do OneDrive
```

## Limites conhecidos

- Uma semana de dados: o "dia normal" é a média dos dias úteis dessa semana. As respostas são sugestões a partir desse perfil, não previsões.
- As passadeiras 0019 a 0022 (Av. 25 de Abril) não enviam dados desde 4 de novembro; o perfil delas vem de menos dias e a resposta "onde intervir" não as considera.
- A espera por hora é a média das esperas medidas; o tempo de espera falta em parte das travessias.
- A exposição de uma passadeira ordena prioridades de análise; não mede sinistralidade.
- As presenças turísticas contam passagens nas zonas; a mesma pessoa pode ser contada mais do que uma vez.
- O estado da API (cenário, webhooks, registo) fica em memória e perde-se ao reiniciar.
- As chaves estão no código porque é uma demonstração.
