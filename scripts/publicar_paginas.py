"""Gera as páginas de exemplo que funcionam sem a API, para um alojamento de ficheiros estáticos (GitHub Pages).

Cada página publicada é a página de exemplo, mais os dados da semana medida de que ela precisa e
`exemplos/sem-api.js`, que responde aos pedidos dentro da própria página. Tudo num ficheiro por página.

Uso, na pasta do projeto:
    python scripts/publicar_paginas.py api exemplos docs [endereço do repositório]

Depois de gerar, conferir contra a API:  node scripts/conferir_paginas.mjs docs exemplos http://localhost:8000
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

if len(sys.argv) < 4:
    sys.exit(__doc__)
API, EXEMPLOS, SAIDA = (Path(a).resolve() for a in sys.argv[1:4])
REPOSITORIO = sys.argv[4] if len(sys.argv) > 4 else ""
sys.path.insert(0, str(API))

from app import dados as D  # noqa: E402
from app import indicadores as I  # noqa: E402
from app import rede  # noqa: E402

FIM_DE_SEMANA = ("sabado", "domingo")

# Os dados que as respostas usam, tal como a API os devolve.
TUDO = {
    "mapa": {"viewBox": D.MAPA_BASE["viewBox"], "d": D.MAPA_BASE["d"], "projecao": {**rede.PROJ, "formula": "x = ax + bx*lon ; y = ay + by*lat"}},
    "locais": I.locais_turisticos(),
    "estacionamento": {dia: I.estacionamento(dia) for dia in D.DIAS_SEMANA},
    "turismo": {dia: {l: I.afluencia_local(l, dia, "normal") for l in D.LOCAL} for dia in ("dias_uteis", *FIM_DE_SEMANA)},
    "dias_semana": D.DIAS_SEMANA,
    "periodo": {dia: D.periodo_do_dia(dia) for dia in FIM_DE_SEMANA},
    "fonte_dias_uteis": I.fonte("normal"),
}
# O que cada página precisa.
PAGINAS = {
    "estacionar": ("mapa", "estacionamento", "dias_semana"),
    "visitar": ("mapa", "locais", "turismo", "periodo", "fonte_dias_uteis"),
}

ENTRADA = """<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aveiro em Movimento · exemplos</title>
<meta name="description" content="Duas aplicações de exemplo construídas sobre a API Aveiro em Movimento: onde estacionar e por que ordem visitar a cidade.">
<style>
  :root { --fundo: #f2f4f6; --papel: #fff; --tinta: #101b2d; --tinta-2: #4b586d; --linha: #d3dae2; --sinal: #0a4fa3; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--fundo); color: var(--tinta); font: 17px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
  main { max-width: 760px; margin: 0 auto; padding: 48px 20px 56px; }
  h1 { margin: 0; font-size: clamp(32px, 7vw, 46px); font-weight: 800; line-height: 1.08; letter-spacing: -0.02em; }
  p { margin: 14px 0 0; color: var(--tinta-2); }
  a { color: var(--sinal); text-underline-offset: 3px; }
  :focus-visible { outline: 2px solid var(--sinal); outline-offset: 3px; }
  ul { display: grid; gap: 14px; margin: 30px 0 0; padding: 0; list-style: none; }
  /* cada aplicação é um sinal de direção: azul, porque assenta em dados medidos */
  .sinal { display: block; padding: 20px 22px 18px; border-radius: 12px; background: var(--sinal); color: #fff; text-decoration: none; box-shadow: inset 0 0 0 2px var(--sinal), inset 0 0 0 5px #fff; }
  .sinal:hover { background: #083f85; }
  .sinal strong { display: block; font-size: clamp(22px, 5vw, 28px); font-weight: 800; line-height: 1.15; }
  .sinal span { display: block; margin-top: 6px; font-size: 16px; }
  .nota { margin-top: 30px; padding-top: 18px; border-top: 1px solid var(--linha); font-size: 15px; }
</style>
</head>
<body>
<main>
  <h1>Aveiro em Movimento</h1>
  <p>Uma API sobre os sensores de Aveiro, para qualquer entidade construir serviços com os dados da cidade. Estas duas páginas são exemplos do que se faz com ela.</p>
  <ul>
    <li><a class="sinal" href="estacionar/"><strong>Onde estaciono em Aveiro?</strong><span>O parque com lugares livres mais perto do destino, à hora de chegada.</span></a></li>
    <li><a class="sinal" href="visitar/"><strong>Visitar Aveiro com menos gente</strong><span>A ordem de visita que apanha cada local turístico longe do seu pico.</span></a></li>
  </ul>
  <p class="nota">Aqui as páginas funcionam sem a API: os dados vêm embutidos em cada uma e são os da semana de 3 a 10 de novembro de 2026, medidos pelos sensores do Aveiro Tech City Living Lab. Mostram como foi essa semana, não o que se passa neste momento.__REPOSITORIO__</p>
</main>
</body>
</html>
"""


def publicar(nome: str, chaves: tuple) -> Path:
    pagina = (EXEMPLOS / nome / "index.html").read_text(encoding="utf-8")
    semapi = (EXEMPLOS / "sem-api.js").read_text(encoding="utf-8")
    dados = json.dumps({k: TUDO[k] for k in chaves}, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    corte = pagina.rindex("<script>")  # o programa da página é o último
    aviso = "<!-- Gerado por scripts/publicar_paginas.py a partir de exemplos/%s/index.html: alterar lá e voltar a gerar. -->\n" % nome
    saida = (
        pagina[:corte].replace("<!doctype html>\n", "<!doctype html>\n" + aviso, 1)
        + '<script id="dados" type="application/json">' + dados + "</script>\n"
        + "<script>\n" + semapi + "</script>\n"
        + pagina[corte:]
    )
    destino = SAIDA / nome / "index.html"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(saida, encoding="utf-8", newline="\n")
    return destino


SAIDA.mkdir(parents=True, exist_ok=True)
for nome, chaves in PAGINAS.items():
    f = publicar(nome, chaves)
    print("%s  %d KB" % (f, round(f.stat().st_size / 1024)))
ligacao = ' O código da API e destas páginas está em <a href="%s">%s</a>.' % (REPOSITORIO, REPOSITORIO.split("//")[-1]) if REPOSITORIO else ""
(SAIDA / "index.html").write_text(ENTRADA.replace("__REPOSITORIO__", ligacao), encoding="utf-8", newline="\n")
(SAIDA / ".nojekyll").write_text("", encoding="utf-8")  # as pastas são servidas tal como estão
print(SAIDA / "index.html")
