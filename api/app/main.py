"""Aveiro em Movimento · API.

Indicadores de mobilidade de peões e veículos, por hora e por local, para o painel
do município e para outras entidades (transportadoras, comércio, cidadãos).

Correr:  uvicorn app.main:app --reload --port 8000      (dentro da pasta api)
Docs:    http://localhost:8000/docs
"""
from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import dados as D
from . import indicadores as I
from . import mcp
from . import rede
from . import respostas
from .estado import ANONIMO, CHAVES, ESTADO

DESCRICAO = """
Os mesmos indicadores do painel do município, para outras entidades usarem nos seus serviços.

* **Dados**: agregados por hora e por local, medidos pelos sensores do ATCLL nos dias úteis de 3 a 10 de novembro de 2026. Sem imagens nem identificadores pessoais.
* **Cenários**: `normal` é o perfil real; `chuva` é uma simulação sobre o perfil real. O `incidente` é simulado.
* **Chave**: cabeçalho `X-API-Key` (ou `?chave=`). Sem chave, a leitura é pública. Mudar o cenário exige a chave da plataforma.
* **Tempo real**: `GET /v1/eventos` (Server-Sent Events) e webhooks avisam quando o cenário muda.
* **Assistentes de IA**: `POST /mcp` (Model Context Protocol) expõe as respostas como ferramentas.
"""

app = FastAPI(title="Aveiro em Movimento · API", version="1.0.0", description=DESCRICAO)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"], expose_headers=["Server-Timing"])
app.include_router(mcp.router)

Cenario = Literal["normal", "chuva"]
DiaDaSemana = Literal["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"]
SEM_REGISTO = ("/v1/eventos", "/v1/registo")


@app.middleware("http")
async def chave_e_registo(request: Request, call_next):
    caminho = request.url.path
    if not caminho.startswith("/v1"):
        return await call_next(request)
    chave = request.headers.get("x-api-key") or request.query_params.get("chave")
    if chave and chave not in CHAVES:
        return JSONResponse({"detail": "Chave de API desconhecida."}, status_code=401)
    request.state.quem = CHAVES.get(chave, ANONIMO)
    t0 = time.perf_counter()
    resposta = await call_next(request)
    if request.method != "OPTIONS" and not caminho.startswith(SEM_REGISTO):
        ms = (time.perf_counter() - t0) * 1000
        # tempo que a API demorou a responder, para quem consome o poder mostrar
        resposta.headers["Server-Timing"] = "api;dur=%.1f" % ms
        q = "&".join(p for p in request.url.query.split("&") if p and not p.startswith("chave="))
        ESTADO.registar(request.state.quem["entidade"], request.method, caminho + ("?" + q if q else ""), resposta.status_code, ms)
    return resposta


def _cenario(cenario: Optional[str], incidente: Optional[bool]) -> tuple[str, bool]:
    """Sem `cenario`, vale o cenário em vigor (tempo real). Com `cenario`, é uma simulação."""
    if cenario is None:
        atual = ESTADO.cenario
        return atual["cenario"], atual["incidente"] if incidente is None else incidente
    return cenario, bool(incidente)


def _zona(zona_id: str) -> dict:
    if zona_id not in D.ZONA:
        raise HTTPException(404, "Zona desconhecida. Ver GET /v1/zonas.")
    return D.ZONA[zona_id]


def _pontos(texto: str) -> list[dict]:
    try:
        out = []
        for par in texto.split(";"):
            lon, lat = (float(v) for v in par.split(","))
            out.append(rede.ponto(lon, lat))
        return out
    except ValueError:
        raise HTTPException(422, "Formato dos pontos: lon,lat;lon,lat (WGS84).")


# ---------------------------------------------------------------- cenário e eventos

class NovoCenario(BaseModel):
    cenario: Cenario
    incidente: bool = False


@app.get("/v1/cenarios/atual", tags=["Cenário"], summary="Cenário em vigor")
def cenario_atual():
    return {**ESTADO.cenario, "incidente_info": rede.incidente_info() if ESTADO.cenario["incidente"] else None, "disponiveis": list(D.CENARIOS)}


@app.put("/v1/cenarios/atual", tags=["Cenário"], summary="Mudar o cenário em vigor (só a plataforma)")
def mudar_cenario(novo: NovoCenario, request: Request):
    quem = request.state.quem
    if quem["perfil"] != "plataforma":
        raise HTTPException(403, "Só a chave da plataforma pode mudar o cenário.")
    return ESTADO.mudar_cenario(novo.cenario, novo.incidente, quem["entidade"])


@app.get("/v1/eventos", tags=["Cenário"], summary="Eventos em tempo real (Server-Sent Events)")
async def eventos(request: Request):
    fila = ESTADO.assinar()

    async def gerar():
        try:
            yield "event: cenario.atual\ndata: %s\n\n" % json.dumps(ESTADO.cenario, ensure_ascii=False)
            while True:
                if await request.is_disconnected():
                    break
                try:
                    evento, corpo = await asyncio.wait_for(fila.get(), timeout=10)
                    yield "event: %s\ndata: %s\n\n" % (evento, json.dumps(corpo, ensure_ascii=False))
                except asyncio.TimeoutError:
                    yield ": ligado\n\n"
        finally:
            ESTADO.cancelar(fila)

    return StreamingResponse(gerar(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class NovoWebhook(BaseModel):
    url: str
    eventos: list[str] = ["cenario.alterado"]


@app.post("/v1/webhooks", tags=["Cenário"], summary="Subscrever avisos de mudança de cenário", status_code=201)
def criar_webhook(w: NovoWebhook, request: Request):
    if not w.url.startswith(("http://", "https://")):
        raise HTTPException(422, "O url tem de começar por http:// ou https://")
    reg = {"id": len(ESTADO.webhooks) + 1, "url": w.url, "eventos": w.eventos, "entidade": request.state.quem["entidade"], "ultimo_envio": None}
    ESTADO.webhooks.append(reg)
    return reg


@app.get("/v1/webhooks", tags=["Cenário"], summary="Webhooks registados")
def listar_webhooks():
    return ESTADO.webhooks


@app.get("/v1/registo", tags=["Cenário"], summary="Últimos pedidos feitos à API")
def registo(limite: int = Query(20, ge=1, le=60)):
    return list(ESTADO.registo)[:limite]


# ---------------------------------------------------------------- a cidade inteira

@app.get("/v1/metricas", tags=["Métricas"], summary="As métricas dos quatro verticais para a cidade inteira, hora a hora")
def metricas(cenario: Optional[Cenario] = None, dia: Literal["dias_uteis", "sabado", "domingo"] = Query("dias_uteis", description="Dia usado nas presenças turísticas.")):
    return I.metricas_cidade(_cenario(cenario, None)[0], dia)


# ---------------------------------------------------------------- zonas

@app.get("/v1/zonas", tags=["Zonas"], summary="Zonas com passadeiras inteligentes")
def zonas():
    return [
        {"id": z["id"], "nome": z["nome"], "passadeiras": z["passadeiras"], "ruas_medidas": len(z["ruas"]), "localizacao": {"lon": z["lon"], "lat": z["lat"], "x": z["x"], "y": z["y"]}}
        for z in D.ZONAS
    ]


@app.get("/v1/zonas/{zona_id}/perfil", tags=["Zonas"], summary="Perfil de 24 horas de uma zona")
def perfil_zona(zona_id: str, cenario: Optional[Cenario] = None):
    _zona(zona_id)
    return I.perfil_zona(zona_id, _cenario(cenario, None)[0])


@app.get("/v1/zonas/{zona_id}/relacoes", tags=["Zonas"], summary="Associações: estacionamento x peões e trânsito x velocidade")
def relacoes_zona(zona_id: str, cenario: Optional[Cenario] = None):
    _zona(zona_id)
    return I.relacoes_zona(zona_id, _cenario(cenario, None)[0])


# ---------------------------------------------------------------- passadeiras

@app.get("/v1/passadeiras", tags=["Passadeiras"], summary="Todas as passadeiras numa hora")
def passadeiras(
    hora: int = Query(13, ge=0, le=23),
    cenario: Optional[Cenario] = None,
    zona: Optional[str] = None,
    ordenar: Literal["id", "peoes", "espera", "exposicao"] = "id",
):
    cen = _cenario(cenario, None)[0]
    lista = [I.metricas_passadeira(p, hora, cen) for p in D.PASSADEIRAS if zona is None or p["zona"] == zona]
    chave = {"peoes": "peoes_hora", "espera": "espera_p90_s", "exposicao": "exposicao"}.get(ordenar)
    if chave:
        lista.sort(key=lambda m: -(m[chave] or 0))
    return lista


@app.get("/v1/passadeiras/{pid}/metricas", tags=["Passadeiras"], summary="Peões, espera, travessia e exposição de uma passadeira")
def metricas_passadeira(pid: str, hora: int = Query(13, ge=0, le=23), cenario: Optional[Cenario] = None, formato: Literal["json", "ngsi"] = "json"):
    if pid not in D.PASSADEIRA:
        raise HTTPException(404, "Passadeira desconhecida.")
    m = I.metricas_passadeira(D.PASSADEIRA[pid], hora, _cenario(cenario, None)[0])
    return I.ngsi_passadeira(m) if formato == "ngsi" else m


# ---------------------------------------------------------------- ruas, estacionamento, turismo

@app.get("/v1/segmentos", tags=["Ruas"], summary="Volume, velocidade e fluidez por rua e hora")
def segmentos(hora: int = Query(13, ge=0, le=23), cenario: Optional[Cenario] = None, geometria: bool = False):
    cen = _cenario(cenario, None)[0]
    lista = [I.metricas_rua(r, hora, cen, geometria) for r in D.RUAS]
    lentas = sum(1 for m in lista if m["nivel"] == "lento")
    return {"hora": hora, "cenario": cen, "fonte": I.fonte(cen), "ruas_medidas": len(lista), "ruas_lentas": lentas, "segmentos": lista}


@app.get("/v1/estacionamento", tags=["Estacionamento"], summary="Lugares livres, ocupados e sem informação, por hora")
def estacionamento(dia: Optional[DiaDaSemana] = Query(None, description="Dia da semana. Sem ele, a média dos dias úteis. Cada dia da semana foi medido uma vez.")):
    return I.estacionamento(dia)


@app.get("/v1/turismo/afluencia", tags=["Turismo"], summary="Presenças por zona turística e hora")
def afluencia(dia: Literal["dias_uteis", "sabado", "domingo"] = "dias_uteis", cenario: Optional[Cenario] = None):
    cen = _cenario(cenario, None)[0]
    return {
        "dia": dia,
        "cenario": cen,
        "fonte": I.fonte(cen),
        "nota": "Conta presenças de peões; a mesma pessoa pode ser contada mais do que uma vez. Com chuva, aplica o fator de peões do modelo.",
        "zonas": [{"id": z["id"], "presencas_hora": [v if cen == "normal" else round(v * I.fator_peoes(h, cen), 1) for h, v in enumerate(z[dia])]} for z in D.TURISMO],
    }


@app.get("/v1/turismo/locais", tags=["Turismo"], summary="Locais turísticos, com nome e posição")
def locais():
    return I.locais_turisticos()


# ---------------------------------------------------------------- rede e tempos de percurso

@app.get("/v1/rede/mapa", tags=["Rede"], summary="Mapa base da rede de ruas (para desenhar)")
def mapa():
    return {"viewBox": D.MAPA_BASE["viewBox"], "d": D.MAPA_BASE["d"], "projecao": {**rede.PROJ, "formula": "x = ax + bx*lon ; y = ay + by*lat"}, "incidente": rede.incidente_info()}


@app.get("/v1/rede/tempos-percurso", tags=["Rede"], summary="Minutos entre pontos, por hora e cenário")
def tempos_percurso(
    pontos: str = Query(..., description="lon,lat;lon,lat;... (WGS84)", examples=["-8.6369,40.6449;-8.6557,40.6407"]),
    hora: int = Query(8, ge=0, le=23),
    cenario: Optional[Cenario] = Query(None, description="Omitir para usar o cenário em vigor (tempo real)."),
    incidente: Optional[bool] = None,
):
    pts = _pontos(pontos)
    if len(pts) > 25:
        raise HTTPException(422, "Máximo de 25 pontos por pedido.")
    cen, inc = _cenario(cenario, incidente)
    nos = [p["no"] for p in pts]
    m = rede.matriz(cen, inc, hora, nos)
    base = m if (cen == "normal" and not inc) else rede.matriz("normal", False, hora, nos)
    soma, soma_b = sum(map(sum, m)), sum(map(sum, base))
    return {
        "hora": hora,
        "cenario": cen,
        "incidente": inc,
        "modo": "tempo-real" if cenario is None else "simulacao",
        "fonte": I.fonte(cen) + (" + incidente simulado" if inc else ""),
        "fator_tempo_vs_normal": round(soma / soma_b, 3) if soma_b else 1.0,
        "pontos": pts,
        "minutos": m,
    }


@app.get("/v1/rede/percurso", tags=["Rede"], summary="Caminho mais rápido entre dois pontos, rua a rua")
def percurso(
    de: str = Query(..., description="lon,lat"),
    para: str = Query(..., description="lon,lat"),
    hora: int = Query(8, ge=0, le=23),
    cenario: Optional[Cenario] = None,
    incidente: Optional[bool] = None,
):
    a, b = _pontos(de)[0], _pontos(para)[0]
    cen, inc = _cenario(cenario, incidente)
    out = rede.percurso(cen, inc, hora, a["no"], b["no"])
    return {"cenario": cen, "incidente": inc, "de": a, "para": b, **out}


# ---------------------------------------------------------------- respostas (dos indicadores à ação)

@app.get("/v1/respostas", tags=["Respostas"], summary="Catálogo das respostas prontas a usar")
def catalogo_respostas():
    return respostas.catalogo()


@app.get("/v1/respostas/onde-intervir", tags=["Respostas"], summary="Município: passadeiras a analisar primeiro")
def onde_intervir(hora: int = Query(13, ge=0, le=23), cenario: Optional[Cenario] = None, incidente: Optional[bool] = None, limite: int = Query(3, ge=1, le=24)):
    cen, inc = _cenario(cenario, incidente)
    return respostas.onde_intervir(hora, cen, inc, limite)


@app.get("/v1/respostas/melhor-hora", tags=["Respostas"], summary="Comércio e logística: hora de mais movimento a pé, ou a mais desimpedida para cargas")
def melhor_hora(zona: str = "25-abril", para: Literal["montra", "cargas"] = "montra", hora: int = Query(13, ge=0, le=23), cenario: Optional[Cenario] = None):
    _zona(zona)
    return respostas.melhor_hora(zona, para, hora, _cenario(cenario, None)[0])


@app.get("/v1/respostas/onde-estacionar", tags=["Respostas"], summary="Cidadãos: parque com lugares livres mais perto do destino")
def onde_estacionar(
    destino: str = Query(..., description="lon,lat do destino (WGS84)", examples=["-8.6565,40.6412"]),
    origem: Optional[str] = Query(None, description="lon,lat de onde se parte de carro. Com origem, conta também o tempo de carro."),
    hora: int = Query(13, ge=0, le=23),
    cenario: Optional[Cenario] = None,
    incidente: Optional[bool] = None,
    limite: int = Query(3, ge=1, le=10),
    dia: Optional[DiaDaSemana] = Query(None, description="Dia da semana em que se chega. Sem ele, a média dos dias úteis."),
):
    cen, inc = _cenario(cenario, incidente)
    return respostas.onde_estacionar(_pontos(destino)[0], _pontos(origem)[0] if origem else None, hora, cen, inc, limite, dia)


@app.get("/v1/respostas/quando-visitar", tags=["Respostas"], summary="Visitantes: afluência agora, hora mais calma e hora de pico de um local")
def quando_visitar(local: str = "rossio", dia: Literal["dias_uteis", "sabado", "domingo"] = "dias_uteis", hora: int = Query(13, ge=0, le=23), cenario: Optional[Cenario] = None):
    if local not in D.LOCAL:
        raise HTTPException(404, "Local desconhecido. Ver GET /v1/turismo/locais.")
    return respostas.quando_visitar(local, dia, hora, _cenario(cenario, None)[0])


@app.get("/v1/respostas/roteiro-visita", tags=["Respostas"], summary="Visitantes: por que ordem visitar vários locais para apanhar menos gente")
def roteiro_visita(
    locais: str = Query("rossio,moliceiros,forum,ria", description="De 2 a 6 locais, separados por vírgulas. Ver GET /v1/turismo/locais."),
    dia: Literal["dias_uteis", "sabado", "domingo"] = "dias_uteis",
    inicio: Optional[int] = Query(None, ge=9, le=16, description="Hora de começar. Sem ela, a API escolhe a melhor. Conta-se uma hora por local, até às 18h."),
    cenario: Optional[Cenario] = None,
):
    ids = [l.strip() for l in locais.split(",") if l.strip()]
    if any(l not in D.LOCAL for l in ids):
        raise HTTPException(404, "Local desconhecido. Ver GET /v1/turismo/locais.")
    if not 2 <= len(ids) <= len(D.LOCAL) or len(set(ids)) != len(ids):
        raise HTTPException(422, "Indica de 2 a %d locais diferentes." % len(D.LOCAL))
    fim = respostas.HORAS_VISITA.stop
    if inicio is not None and inicio + len(ids) > fim:
        raise HTTPException(422, "Com %d locais, uma hora em cada, a visita tem de começar até às %dh: as contagens vão até às %dh." % (len(ids), fim - len(ids), fim))
    return respostas.roteiro_visita(ids, dia, inicio, _cenario(cenario, None)[0])


# ---------------------------------------------------------------- interfaces (versão compilada)

RAIZ = Path(__file__).resolve().parent.parent.parent
INTERFACES = {"painel": "Painel de métricas (município)", "transportadora": "Planeador de rotas da Ria Express (demo)"}
for _nome in INTERFACES:
    _dist = RAIZ / _nome / "dist"
    if _dist.is_dir():
        app.mount("/" + _nome, StaticFiles(directory=_dist, html=True), name=_nome)

# Exemplo de quem consome a API: uma página só, sem compilação. Pode ser publicada noutro sítio (ver exemplos/estacionar).
EXEMPLO = RAIZ / "exemplos" / "estacionar"
if EXEMPLO.is_dir():
    app.mount("/estacionar", StaticFiles(directory=EXEMPLO, html=True), name="estacionar")

# Segundo exemplo: o roteiro de visita, também numa página só (ver exemplos/visitar).
ROTEIRO = RAIZ / "exemplos" / "visitar"
if ROTEIRO.is_dir():
    app.mount("/visitar", StaticFiles(directory=ROTEIRO, html=True), name="visitar")

# Chat de demonstração que fala com o servidor MCP: um ficheiro só, que qualquer página pode incluir (ver exemplos/assistente).
ASSISTENTE = RAIZ / "exemplos" / "assistente"
if ASSISTENTE.is_dir():
    app.mount("/assistente", StaticFiles(directory=ASSISTENTE), name="assistente")

# O portal é a página inicial. Só os ficheiros dele ficam em /assets: um caminho desconhecido em /v1 continua a dar 404 em JSON.
PORTAL = RAIZ / "portal" / "dist"
if (PORTAL / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=PORTAL / "assets"), name="portal")


@app.get("/", include_in_schema=False)
def inicio():
    if (PORTAL / "index.html").is_file():
        return FileResponse(PORTAL / "index.html", headers={"Cache-Control": "no-cache"})
    links = "".join(
        '<li><a href="/%s/">%s</a>%s</li>' % (n, t, "" if (RAIZ / n / "dist").is_dir() else " (por compilar: npm run build na pasta %s)" % n)
        for n, t in INTERFACES.items()
    )
    return HTMLResponse(
        "<!doctype html><html lang='pt'><meta charset='utf-8'><title>Aveiro em Movimento</title>"
        "<body style='font-family:system-ui;max-width:640px;margin:48px auto;line-height:1.6'>"
        "<h1>Aveiro em Movimento</h1><ul>%s<li><a href='/docs'>Documentação da API</a></li></ul></body></html>" % links
    )
