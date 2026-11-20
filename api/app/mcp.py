"""Servidor MCP: a API como ferramentas para assistentes de IA.

O Model Context Protocol (https://modelcontextprotocol.io) é a forma de um assistente
descobrir e chamar ferramentas. Aqui cada ferramenta é um pedido GET à própria API, feito
dentro do processo: a mesma validação, a mesma resposta e o mesmo registo de quem pede por
HTTP. Nada é calculado de novo nesta camada.

Transporte: Streamable HTTP em ``POST /mcp``, com respostas em JSON e sem sessão.
"""
from __future__ import annotations

import asyncio
import json
import re
import unicodedata
from urllib.parse import urlencode

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from . import dados as D

router = APIRouter()

VERSOES = ("2025-06-18", "2025-03-26", "2024-11-05")  # versões do protocolo que o servidor fala; a primeira é a preferida
CHAVE = "assistente-demo"  # chave com que os pedidos do assistente ficam no registo, se ele não trouxer a sua
GEOMETRIA = ("d", "x", "y", "no")  # campos para desenhar o mapa: um assistente não os usa

INSTRUCOES = (
    "Aveiro em Movimento: mobilidade de peões e veículos em Aveiro, a partir dos sensores do Aveiro Tech City Living Lab. "
    "Os dados são agregados por hora e foram medidos de 3 a 10 de novembro de 2026: descrevem essa semana, não o momento presente. "
    "Cada resultado traz os campos `fonte` e `simulado`: diz sempre se um valor foi medido ou é simulado (a chuva e o incidente são simulações sobre o perfil real). "
    "Usa só os valores devolvidos pelas ferramentas; se nenhuma responde à pergunta, diz que a API não tem esse dado. "
    "O campo `resposta` é uma frase pronta e `acao` é a ação sugerida: são sugestões a partir de uma semana de dados, não decisões. "
    "Responde em português europeu."
)

# Lugares que se podem dar pelo nome: (nome, lon, lat, palavras que o identificam).
# A posição da Fábrica é aproximada, a mesma da página "Onde estaciono em Aveiro?".
LUGARES = [
    ("Fábrica Centro Ciência Viva, local do hackathon (posição aproximada)", "-8.6574", "40.6381", ("fabrica", "ciencia viva", "hackathon")),
    ("Rossio", "-8.6565", "40.6412", ("rossio",)),
    ("Fórum Aveiro", "-8.6531", "40.6416", ("forum",)),
    ("Estação de comboios", "-8.6398", "40.6433", ("estacao", "comboio")),
    ("Universidade de Aveiro", "-8.6564", "40.6312", ("universidade",)),
    ("Saída de Moliceiros", str(D.LOCAL["moliceiros"]["lon"]), str(D.LOCAL["moliceiros"]["lat"]), ("moliceiro",)),
]
COORDENADAS = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$")


def _simples(texto: str) -> str:
    """Minúsculas e sem acentos, para comparar nomes."""
    return "".join(ch for ch in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(ch) != "Mn")


def _lugar(texto) -> tuple[str, str | None]:
    """Um lugar em `lon,lat` ou pelo nome. Devolve o `lon,lat` e, se veio pelo nome, o nome entendido."""
    m = COORDENADAS.match(str(texto))
    if m:
        lon, lat = m.groups()
        if abs(float(lon)) > abs(float(lat)):  # veio em lat,lon: em Aveiro a latitude (40,6) é maior do que a longitude (-8,6)
            lon, lat = lat, lon
        return lon + "," + lat, None
    pedido = _simples(str(texto))
    for nome, lon, lat, palavras in LUGARES:
        if any(p in pedido for p in palavras):
            return lon + "," + lat, nome
    raise ValueError(
        'Não conheço o lugar "%s". Lugares conhecidos: %s. Também serve a posição em lon,lat (WGS84), por exemplo -8.6565,40.6412.'
        % (texto, "; ".join(l[0] for l in LUGARES))
    )


# ---------------------------------------------------------------- ferramentas

_NOMES = ", ".join(l[0].split(",")[0] for l in LUGARES)
LUGAR = "Nome de um lugar conhecido (%s) ou posição em lon,lat (WGS84)." % _NOMES
HORA = {"type": "integer", "minimum": 0, "maximum": 23, "description": "Hora do dia, de 0 a 23."}
CENARIO = {"type": "string", "enum": list(D.CENARIOS), "description": "Simular um dia normal ou um dia de chuva. Omitir para usar as condições em vigor na cidade."}
INCIDENTE = {"type": "boolean", "description": "Simular o incidente de trânsito na Avenida de Santa Joana. Omitir para usar as condições em vigor."}


def _ferramenta(nome: str, titulo: str, descricao: str, caminho: str, propriedades: dict, obrigatorios: tuple = (), lugares: tuple = ()) -> dict:
    return {
        "name": nome,
        "title": titulo,
        "description": descricao,
        "inputSchema": {"type": "object", "properties": propriedades, "required": list(obrigatorios), "additionalProperties": False},
        "annotations": {"readOnlyHint": True, "openWorldHint": False},
        # só para este servidor: o pedido à API e os argumentos que são lugares
        "caminho": caminho,
        "lugares": lugares,
    }


FERRAMENTAS = [
    _ferramenta(
        "onde_estacionar",
        "Onde estacionar",
        "Onde estacionar perto de um destino em Aveiro: os parques monitorizados com lugares livres mais perto, quantos lugares livres têm a essa hora e os minutos a pé até ao destino. "
        "Os lugares livres são medidos pelos sensores de estacionamento. Com `dia`, valem os desse dia da semana (cada dia da semana foi medido uma vez); sem ele, a média dos dias úteis. "
        "Com `origem`, soma o tempo de carro até ao parque.",
        "/v1/respostas/onde-estacionar",
        {
            "destino": {"type": "string", "description": "Para onde se vai. " + LUGAR},
            "hora": {**HORA, "description": "Hora de chegada, de 0 a 23."},
            "dia": {"type": "string", "enum": list(D.DIAS_SEMANA), "description": "Dia da semana em que se chega."},
            "origem": {"type": "string", "description": "De onde se parte de carro, dentro de Aveiro. " + LUGAR},
            "cenario": CENARIO,
        },
        ("destino", "hora"),
        ("destino", "origem"),
    ),
    _ferramenta(
        "onde_intervir",
        "Onde intervir primeiro",
        "Para o município: as passadeiras a analisar primeiro a uma dada hora, ordenadas pela exposição (peões x veículos x fração de veículos acima do limite de velocidade), "
        "e quantas ruas da cidade estão lentas. Ordena prioridades de análise; não mede sinistralidade.",
        "/v1/respostas/onde-intervir",
        {"hora": HORA, "cenario": CENARIO, "limite": {"type": "integer", "minimum": 1, "maximum": 24, "description": "Quantas passadeiras devolver (3 por omissão)."}},
        ("hora",),
    ),
    _ferramenta(
        "melhor_hora",
        "Melhor hora numa zona",
        "Para comércio e logística, numa zona da cidade: a hora de mais movimento a pé (`para`=montra) ou a hora mais desimpedida para cargas e descargas, entre as 8h e as 18h (`para`=cargas).",
        "/v1/respostas/melhor-hora",
        {
            "zona": {"type": "string", "enum": [z["id"] for z in D.ZONAS], "description": "Zona da cidade: " + "; ".join("%s = %s" % (z["id"], z["nome"]) for z in D.ZONAS) + "."},
            "para": {"type": "string", "enum": ["montra", "cargas"], "description": "montra: quando passa mais gente à porta. cargas: quando descarregar."},
            "hora": {**HORA, "description": "Hora com que se compara, de 0 a 23 (13 por omissão)."},
            "cenario": CENARIO,
        },
        ("zona", "para"),
    ),
    _ferramenta(
        "quando_visitar",
        "Quando visitar um local",
        "Para visitantes: a afluência de um local turístico a uma dada hora, a hora mais calma e a hora de pico, entre as 9h e as 17h. Conta presenças de peões; a mesma pessoa pode ser contada mais do que uma vez.",
        "/v1/respostas/quando-visitar",
        {
            "local": {"type": "string", "enum": list(D.LOCAL), "description": "Local turístico: " + "; ".join("%s = %s" % (i, l["nome"]) for i, l in D.LOCAL.items()) + "."},
            "dia": {"type": "string", "enum": ["dias_uteis", "sabado", "domingo"], "description": "Dias úteis (por omissão), sábado ou domingo."},
            "hora": {**HORA, "description": "Hora com que se compara, de 0 a 23 (13 por omissão)."},
            "cenario": CENARIO,
        },
        ("local",),
    ),
    _ferramenta(
        "planear_visita",
        "Planear uma visita a vários locais",
        "Para visitantes: a ordem por que visitar vários locais turísticos para apanhar cada um mais longe do seu pico, com uma hora em cada, entre as 9h e as 18h. "
        "Diz as presenças e a percentagem do pico em cada paragem e os minutos a pé entre elas. Sem `inicio`, escolhe também a melhor hora para começar.",
        "/v1/respostas/roteiro-visita",
        {
            "locais": {"type": "string", "description": "De 2 a 6 locais, pelos identificadores, separados por vírgulas: " + "; ".join("%s = %s" % (i, l["nome"]) for i, l in D.LOCAL.items()) + "."},
            "dia": {"type": "string", "enum": ["dias_uteis", "sabado", "domingo"], "description": "Dias úteis (por omissão), sábado ou domingo."},
            "inicio": {"type": "integer", "minimum": 9, "maximum": 16, "description": "Hora de começar, de 9 a 16."},
            "cenario": CENARIO,
        },
        ("locais",),
    ),
    _ferramenta(
        "tempo_de_percurso",
        "Tempo de percurso de carro",
        "O caminho mais rápido de carro entre dois pontos de Aveiro a uma dada hora, rua a rua, com os segundos e os metros. Com chuva ou com o incidente, o tempo é simulado.",
        "/v1/rede/percurso",
        {
            "de": {"type": "string", "description": "Ponto de partida. " + LUGAR},
            "para": {"type": "string", "description": "Ponto de chegada. " + LUGAR},
            "hora": HORA,
            "cenario": CENARIO,
            "incidente": INCIDENTE,
        },
        ("de", "para", "hora"),
        ("de", "para"),
    ),
    _ferramenta(
        "condicoes_da_cidade",
        "Condições em vigor na cidade",
        "As condições em vigor na cidade: dia normal ou de chuva, e se há um incidente no trânsito. É com elas que as outras ferramentas respondem quando não se indica `cenario`.",
        "/v1/cenarios/atual",
        {},
    ),
]
FERRAMENTA = {f["name"]: f for f in FERRAMENTAS}
PUBLICO = ("name", "title", "description", "inputSchema", "annotations")  # o que o assistente vê de cada ferramenta


def _query(f: dict, argumentos: dict) -> tuple[str, dict]:
    """Os argumentos da ferramenta como parâmetros do pedido, e os lugares entendidos pelo nome."""
    propriedades = f["inputSchema"]["properties"]
    a_mais = [k for k in argumentos if k not in propriedades]
    if a_mais:
        raise ValueError("Argumento desconhecido: %s. Esta ferramenta aceita: %s." % (", ".join(a_mais), ", ".join(propriedades) or "nenhum"))
    em_falta = [k for k in f["inputSchema"]["required"] if argumentos.get(k) is None]
    if em_falta:
        raise ValueError("Falta o argumento obrigatório: %s." % ", ".join(em_falta))
    params, entendido = {}, {}
    for k in propriedades:
        v = argumentos.get(k)
        if v is None:
            continue
        if k in f["lugares"]:
            v, nome = _lugar(v)
            if nome:
                entendido[k] = nome
        params[k] = str(v).lower() if isinstance(v, bool) else v
    return urlencode(params, safe=","), entendido


def _aparar(v):
    """Tira a geometria de desenho de uma resposta da API."""
    if isinstance(v, dict):
        return {k: _aparar(x) for k, x in v.items() if k not in GEOMETRIA}
    if isinstance(v, list):
        return [_aparar(x) for x in v]
    return v


def _motivo(corpo) -> str:
    """A razão de uma recusa da API, numa frase."""
    detalhe = corpo.get("detail") if isinstance(corpo, dict) else corpo
    if isinstance(detalhe, list):  # erros de validação: um por parâmetro
        return "; ".join("%s: %s" % (e["loc"][-1], e["msg"]) for e in detalhe)
    return str(detalhe)


async def _pedir(app, caminho: str, query: str, chave: str) -> tuple[int, object]:
    """Um GET à própria API sem passar pela rede: mesma validação, mesmo registo de pedidos."""
    fim = asyncio.Event()
    estado, partes, lido = {}, [], []

    async def receber():
        if not lido:
            lido.append(True)
            return {"type": "http.request", "body": b"", "more_body": False}
        await fim.wait()  # só "desliga" depois de a resposta estar completa
        return {"type": "http.disconnect"}

    async def enviar(m):
        if m["type"] == "http.response.start":
            estado["codigo"] = m["status"]
        elif m["type"] == "http.response.body":
            partes.append(m.get("body", b""))

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": caminho,
        "raw_path": caminho.encode(),
        "root_path": "",
        "query_string": query.encode(),
        "headers": [(b"host", b"localhost"), (b"x-api-key", chave.encode())],
        "client": ("127.0.0.1", 0),
        "server": ("localhost", 8000),
    }
    try:
        await app(scope, receber, enviar)
    finally:
        fim.set()
    return estado["codigo"], json.loads(b"".join(partes))


def _conteudo(texto: str, erro: bool) -> dict:
    return {"content": [{"type": "text", "text": texto}], "isError": erro}


async def _chamar(f: dict, argumentos: dict, request: Request) -> dict:
    try:
        query, entendido = _query(f, argumentos)
    except ValueError as exc:
        return _conteudo(str(exc), True)
    codigo, corpo = await _pedir(request.app, f["caminho"], query, request.headers.get("x-api-key") or CHAVE)
    if codigo != 200:
        return _conteudo(_motivo(corpo), True)
    resultado = {"pedido": "GET " + f["caminho"] + ("?" + query if query else ""), **_aparar(corpo)}
    if entendido:
        resultado["entendido"] = entendido
    return _conteudo(json.dumps(resultado, ensure_ascii=False), False)


# ---------------------------------------------------------------- protocolo (JSON-RPC 2.0)

def _resultado(id, resultado: dict) -> dict:
    return {"jsonrpc": "2.0", "id": id, "result": resultado}


def _erro(id, codigo: int, mensagem: str) -> dict:
    return {"jsonrpc": "2.0", "id": id, "error": {"code": codigo, "message": mensagem}}


async def _tratar(m, request: Request) -> dict | None:
    """Responde a uma mensagem. As notificações (sem `id`) não têm resposta."""
    if not isinstance(m, dict) or m.get("jsonrpc") != "2.0":
        return _erro(None, -32600, "Mensagem JSON-RPC inválida.")
    if "id" not in m or not isinstance(m.get("method"), str):
        return None
    id, metodo = m["id"], m["method"]
    params = m.get("params") if isinstance(m.get("params"), dict) else {}
    if metodo == "initialize":
        pedida = params.get("protocolVersion")
        return _resultado(id, {
            "protocolVersion": pedida if pedida in VERSOES else VERSOES[0],
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "aveiro-em-movimento", "title": "Aveiro em Movimento", "version": "1.0.0"},
            "instructions": INSTRUCOES,
        })
    if metodo == "ping":
        return _resultado(id, {})
    if metodo == "tools/list":
        return _resultado(id, {"tools": [{k: f[k] for k in PUBLICO} for f in FERRAMENTAS]})
    if metodo == "tools/call":
        f = FERRAMENTA.get(params.get("name"))
        if f is None:
            return _erro(id, -32602, "Ferramenta desconhecida: %s." % params.get("name"))
        argumentos = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
        return _resultado(id, await _chamar(f, argumentos, request))
    return _erro(id, -32601, "Método desconhecido: %s." % metodo)


@router.post("/mcp", tags=["Assistentes de IA"], summary="Model Context Protocol: a API como ferramentas para assistentes de IA")
async def mcp(request: Request):
    try:
        corpo = json.loads(await request.body())
    except ValueError:
        return JSONResponse(_erro(None, -32700, "O corpo do pedido não é JSON."), status_code=400)
    if isinstance(corpo, list):  # várias mensagens num só pedido
        respostas = [r for r in [await _tratar(m, request) for m in corpo] if r is not None]
        return JSONResponse(respostas) if respostas else Response(status_code=202)
    resposta = await _tratar(corpo, request)
    return JSONResponse(resposta) if resposta is not None else Response(status_code=202)
