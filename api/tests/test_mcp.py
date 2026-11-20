"""Testes do servidor MCP (assistentes de IA). Correr na pasta api:  python -m pytest -q"""
import json

from fastapi.testclient import TestClient

from app.main import app

c = TestClient(app)
PAINEL = {"X-API-Key": "cma-painel-demo"}
FERRAMENTAS = {"onde_estacionar", "onde_intervir", "melhor_hora", "quando_visitar", "planear_visita", "tempo_de_percurso", "condicoes_da_cidade"}


def setup_function():
    c.put("/v1/cenarios/atual", json={"cenario": "normal", "incidente": False}, headers=PAINEL)


def rpc(metodo, params=None, id=1):
    corpo = {"jsonrpc": "2.0", "method": metodo}
    if id is not None:
        corpo["id"] = id
    if params is not None:
        corpo["params"] = params
    return c.post("/mcp", json=corpo, headers={"Accept": "application/json, text/event-stream"})


def chamar(nome, **argumentos):
    """Chama uma ferramenta e devolve (isError, conteúdo já lido como JSON ou como texto)."""
    r = rpc("tools/call", {"name": nome, "arguments": argumentos}).json()["result"]
    texto = r["content"][0]["text"]
    return r["isError"], (texto if r["isError"] else json.loads(texto))


def test_mcp_apresenta_se():
    r = rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "teste", "version": "0"}})
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/json")
    res = r.json()
    assert res["jsonrpc"] == "2.0" and res["id"] == 1
    assert res["result"]["protocolVersion"] == "2025-06-18"
    assert res["result"]["serverInfo"]["name"] == "aveiro-em-movimento" and "tools" in res["result"]["capabilities"]
    # o servidor diz ao assistente como falar dos dados: medido ou simulado, e de que semana
    assert "simulad" in res["result"]["instructions"] and "novembro de 2026" in res["result"]["instructions"]
    # uma versão do protocolo que o servidor não conhece recebe a mais recente que ele conhece
    assert rpc("initialize", {"protocolVersion": "2099-01-01", "capabilities": {}}).json()["result"]["protocolVersion"] == "2025-06-18"
    # as notificações não têm resposta
    aviso = rpc("notifications/initialized", id=None)
    assert aviso.status_code == 202 and aviso.content == b""
    assert rpc("ping").json()["result"] == {}
    # sem canal de eventos: só POST
    assert c.get("/mcp").status_code == 405


def test_mcp_lista_as_ferramentas():
    ferramentas = rpc("tools/list").json()["result"]["tools"]
    assert {f["name"] for f in ferramentas} == FERRAMENTAS
    for f in ferramentas:
        assert f["description"] and f["inputSchema"]["type"] == "object"
    porNome = {f["name"]: f for f in ferramentas}
    assert porNome["onde_estacionar"]["inputSchema"]["required"] == ["destino", "hora"]
    assert porNome["melhor_hora"]["inputSchema"]["properties"]["zona"]["enum"][0] == "25-abril"
    assert "rossio" in porNome["quando_visitar"]["inputSchema"]["properties"]["local"]["enum"]


def test_mcp_onde_estacionar_e_a_resposta_da_api():
    erro, r = chamar("onde_estacionar", destino="Fábrica Ciência Viva", hora=8, dia="sexta", cenario="normal")
    assert not erro
    api = c.get("/v1/respostas/onde-estacionar?destino=-8.6574,40.6381&hora=8&dia=sexta&cenario=normal").json()
    assert r["resposta"] == api["resposta"] and r["acao"] == api["acao"] and r["fonte"] == api["fonte"]
    assert r["simulado"] is False
    # diz que pedido foi feito e que lugar entendeu pelo nome
    assert r["pedido"] == "GET /v1/respostas/onde-estacionar?destino=-8.6574,40.6381&hora=8&dia=sexta&cenario=normal"
    assert "Fábrica" in r["entendido"]["destino"]
    # sem a geometria de desenho, que um assistente não usa
    assert r["itens"] and all("x" not in i and "lon" in i for i in r["itens"])
    # as coordenadas também servem
    erro, r2 = chamar("onde_estacionar", destino="-8.6574,40.6381", hora=8, dia="sexta", cenario="normal")
    assert not erro and r2["resposta"] == r["resposta"] and "entendido" not in r2


def test_mcp_fica_no_registo_como_assistente():
    chamar("quando_visitar", local="rossio", hora=10)
    linha = c.get("/v1/registo").json()[0]
    assert linha["entidade"] == "Assistente de IA (MCP)" and linha["pedido"].startswith("GET /v1/respostas/quando-visitar?local=rossio")


def test_mcp_segue_o_cenario_em_vigor():
    erro, r = chamar("condicoes_da_cidade")
    assert not erro and r["cenario"] == "normal" and r["incidente"] is False
    c.put("/v1/cenarios/atual", json={"cenario": "chuva", "incidente": True}, headers=PAINEL)
    erro, r = chamar("condicoes_da_cidade")
    assert r["cenario"] == "chuva" and r["incidente_info"]["rua"] == "Avenida de Santa Joana" and "x" not in r["incidente_info"]
    # sem `cenario`, as respostas valem para o que está em vigor e dizem que são simuladas
    erro, r = chamar("onde_intervir", hora=13)
    assert not erro and r["cenario"] == "chuva" and r["simulado"] is True


def test_mcp_tempo_de_percurso_pelo_nome_dos_lugares():
    erro, r = chamar("tempo_de_percurso", de="Estação", para="Rossio", hora=8, cenario="normal")
    assert not erro and 2 * 60 < r["segundos"] < 20 * 60
    assert r["ruas"] and all("d" not in rua for rua in r["ruas"])
    erro, chuva = chamar("tempo_de_percurso", de="Estação", para="Rossio", hora=8, cenario="chuva")
    assert chuva["segundos"] > r["segundos"]
    # a posição em lat,lon (a ordem habitual noutros serviços) é entendida
    erro, trocado = chamar("tempo_de_percurso", de="40.6433,-8.6398", para="Rossio", hora=8, cenario="normal")
    assert not erro and trocado["segundos"] == r["segundos"]


def test_mcp_planear_visita():
    erro, r = chamar("planear_visita", locais="rossio,forum,ria", dia="sabado")
    assert not erro and len(r["itens"]) == 3 and r["inicio_escolhido"] is True
    assert r["pedido"] == "GET /v1/respostas/roteiro-visita?locais=rossio,forum,ria&dia=sabado"
    assert all("x" not in i for i in r["itens"])


def test_chat_de_demonstracao_e_um_ficheiro_so():
    r = c.get("/assistente/assistente.js")
    assert r.status_code == 200 and "javascript" in r.headers["content-type"]
    # fala com o servidor MCP de verdade e diz que o assistente em si é simulado
    assert "/mcp" in r.text and "tools/call" in r.text
    assert "sem modelo de linguagem" in r.text
    # sem bibliotecas nem outros ficheiros
    assert "import " not in r.text and "require(" not in r.text


def test_mcp_erros_que_o_assistente_pode_corrigir():
    # argumentos que a API recusa voltam como erro da ferramenta, com a mensagem da API
    erro, texto = chamar("onde_intervir", hora=99)
    assert erro and "hora" in texto
    erro, texto = chamar("onde_estacionar", destino="Marte", hora=8)
    assert erro and "Rossio" in texto and "lon,lat" in texto
    erro, texto = chamar("onde_estacionar", hora=8)
    assert erro and "destino" in texto
    # ferramenta ou método que não existe é erro do protocolo
    assert rpc("tools/call", {"name": "nao_existe", "arguments": {}}).json()["error"]["code"] == -32602
    assert rpc("resources/list").json()["error"]["code"] == -32601
    assert c.post("/mcp", content=b"isto nao e json", headers={"Content-Type": "application/json"}).json()["error"]["code"] == -32700
