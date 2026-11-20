"""Testes da API. Correr na pasta api:  python -m pytest -q"""
from fastapi.testclient import TestClient

from app.main import app

c = TestClient(app)
PAINEL = {"X-API-Key": "cma-painel-demo"}
RIA = {"X-API-Key": "ria-express-demo"}

# armazém e as 10 entregas da Ria Express (lon,lat)
PONTOS = (
    "-8.637544,40.644947;-8.656268,40.640765;-8.651460,40.639076;-8.653057,40.641638;-8.653333,40.636928;-8.656356,40.631238;"
    "-8.643408,40.639541;-8.647287,40.636493;-8.640286,40.642639;-8.656107,40.643939;-8.640175,40.630597"
)


def setup_function():
    c.put("/v1/cenarios/atual", json={"cenario": "normal", "incidente": False}, headers=PAINEL)


def test_zonas_e_perfil_real():
    zonas = c.get("/v1/zonas").json()
    assert len(zonas) == 8 and zonas[0]["id"] == "25-abril"
    p = c.get("/v1/zonas/25-abril/perfil", params={"cenario": "normal"}).json()
    assert len(p["peoes_hora"]) == 24 and p["fonte"].startswith("real")
    # Av. 25 de Abril às 13h: a passadeira 0023 sozinha tem 476 peões/h
    assert p["peoes_hora"][13] >= 476
    assert p["velocidade_kmh"][13] is not None


def test_chuva_tem_menos_peoes_e_mais_veiculos():
    n = c.get("/v1/zonas/25-abril/perfil", params={"cenario": "normal"}).json()
    ch = c.get("/v1/zonas/25-abril/perfil", params={"cenario": "chuva"}).json()
    assert ch["peoes_hora"][13] < n["peoes_hora"][13]
    assert ch["veiculos_hora"][13] > n["veiculos_hora"][13]
    assert ch["velocidade_kmh"][13] < n["velocidade_kmh"][13]
    assert ch["fonte"].startswith("simulado")


def test_passadeira_0023_e_ngsi():
    m = c.get("/v1/passadeiras/0023/metricas", params={"hora": 13, "cenario": "normal"}).json()
    assert (m["peoes_hora"], m["veiculos_hora"], m["limite_kmh"]) == (476, 719, 30)
    e = c.get("/v1/passadeiras/0023/metricas", params={"hora": 13, "cenario": "normal", "formato": "ngsi"}).json()
    assert e["type"] == "SmartCrosswalk" and e["pedestriansPerHour"]["value"] == 476
    assert c.get("/v1/passadeiras/9999/metricas").status_code == 404


def test_estacionamento_soma_264_lugares():
    e = c.get("/v1/estacionamento").json()
    assert e["lugares"] == 264 and e["sem_informacao"] == 10
    assert all(e["livres"][h] + e["ocupados"][h] + e["sem_informacao"] == 264 for h in range(24))


def test_estacionamento_tem_nomes():
    postes = {p["id"]: p for p in c.get("/v1/estacionamento").json()["postes"]}
    p = postes["0003"]
    assert p["nome"] == "Cais do Paraíso" and round(p["lon"], 3) == -8.658 and p["x"] > 0
    assert len(p["livres"]) == 24 and all(0 <= n <= p["lugares"] for n in p["livres"])
    # a soma dos postes ativos é o total de lugares livres da cidade
    e = c.get("/v1/estacionamento").json()
    assert abs(sum(q["livres"][13] for q in e["postes"] if q["estado"] == "ativo") - e["livres"][13]) <= 5


def test_locais_turisticos():
    locais = {l["id"]: l for l in c.get("/v1/turismo/locais").json()}
    assert list(locais) == ["rossio", "moliceiros", "forum", "lourenco-peixinho", "ria", "estacao"]
    assert locais["rossio"]["zonas"] == ["0001", "0005"] and locais["rossio"]["nome"] == "Rossio"
    assert locais["estacao"]["x"] > locais["rossio"]["x"]  # a estação fica a nascente do Rossio


def test_afluencia_turistica_segue_o_cenario():
    normal = c.get("/v1/turismo/afluencia", params={"cenario": "normal"}).json()
    chuva = c.get("/v1/turismo/afluencia", params={"cenario": "chuva"}).json()
    assert normal["fonte"].startswith("real") and chuva["fonte"].startswith("simulado")
    assert normal["zonas"][0]["presencas_hora"][10] == 905.5
    assert chuva["zonas"][0]["presencas_hora"][10] < normal["zonas"][0]["presencas_hora"][10]
    # sem parâmetro, vale o cenário em vigor
    c.put("/v1/cenarios/atual", json={"cenario": "chuva"}, headers=PAINEL)
    assert c.get("/v1/turismo/afluencia").json()["cenario"] == "chuva"


def test_metricas_da_cidade():
    m = c.get("/v1/metricas", params={"cenario": "normal"}).json()
    assert m["fonte"].startswith("real") and m["horas"] == list(range(24))
    mob, seg, est, tur = m["mobilidade"], m["seguranca"], m["estacionamento"], m["turismo"]
    # os mesmos números do resto da API, às 13h de um dia normal
    assert (mob["ruas_lentas"][13], seg["travessias_hora"][13], est["livres"][13], tur["presencas_hora"][13]) == (14, 2540, 148, 6258)
    # o total turístico é a soma do que "quando-visitar" diz de cada local
    assert c.get("/v1/respostas/quando-visitar", params={"local": "rossio", "hora": 13, "cenario": "normal"}).json()["agora"] == tur["locais"][0]["presencas_hora"][13]
    assert mob["ruas_medidas"] == 102 and all(mob["ruas_fluidas"][h] + mob["ruas_moderadas"][h] + mob["ruas_lentas"][h] <= 102 for h in range(24))
    assert 0 < mob["fluidez_media"][13] <= 1.2 and seg["espera_media_s"][13] > 0 and 0 <= seg["acima_limite"][13] <= 1
    assert [l["id"] for l in tur["locais"]] == ["rossio", "moliceiros", "forum", "lourenco-peixinho", "ria", "estacao"]
    assert sum(l["presencas_hora"][13] for l in tur["locais"]) == tur["presencas_hora"][13]
    assert all(len(serie) == 24 for serie in (mob["veiculos_hora"], seg["espera_media_s"], est["ocupacao"], tur["presencas_hora"]))


def test_metricas_com_chuva_e_ao_sabado():
    normal = c.get("/v1/metricas", params={"cenario": "normal"}).json()
    chuva = c.get("/v1/metricas", params={"cenario": "chuva"}).json()
    assert chuva["fonte"].startswith("simulado")
    assert chuva["mobilidade"]["ruas_lentas"][13] == 36 > normal["mobilidade"]["ruas_lentas"][13]
    assert chuva["seguranca"]["travessias_hora"][13] < normal["seguranca"]["travessias_hora"][13]
    # o estacionamento é medido: o modelo de chuva não o altera
    assert chuva["estacionamento"]["livres"] == normal["estacionamento"]["livres"]
    sabado = c.get("/v1/metricas", params={"cenario": "normal", "dia": "sabado"}).json()
    assert sabado["turismo"]["dia"] == "sabado" and sabado["turismo"]["presencas_hora"] != normal["turismo"]["presencas_hora"]


def test_relacoes_e_segmentos():
    r = c.get("/v1/zonas/universidade/relacoes", params={"cenario": "normal"}).json()
    assert [g["grupo"] for g in r["estacionamento_vs_peoes"]["grupos"]] == ["Pouco ocupado", "Meio ocupado", "Muito ocupado"]
    assert len(r["transito_vs_velocidade"]["grupos"]) == 3
    s = c.get("/v1/segmentos", params={"hora": 13, "cenario": "chuva"}).json()
    assert s["ruas_medidas"] == 102 and "d" not in s["segmentos"][0]


def test_tempos_de_percurso_iguais_ao_modelo_de_referencia():
    r = c.get("/v1/rede/tempos-percurso", params={"pontos": PONTOS, "hora": 8, "cenario": "normal"}, headers=RIA).json()
    assert r["minutos"][0][1:] == [7.81, 5.94, 4.79, 6.48, 11.12, 4.17, 8.09, 2.06, 5.92, 9.08]
    ch = c.get("/v1/rede/tempos-percurso", params={"pontos": PONTOS, "hora": 8, "cenario": "chuva"}, headers=RIA).json()
    assert ch["minutos"][0][1:] == [9.29, 7.05, 5.61, 7.73, 13.19, 4.73, 9.43, 2.35, 7.06, 10.32]
    assert ch["fator_tempo_vs_normal"] > 1.1 and ch["modo"] == "simulacao"


def test_percurso_rua_a_rua():
    de, para = PONTOS.split(";")[0], PONTOS.split(";")[9]
    p = c.get("/v1/rede/percurso", params={"de": de, "para": para, "hora": 8, "cenario": "normal"}).json()
    assert [r["rua"] for r in p["ruas"]][:3] == ["Via sem nome", "Avenida Vasco Branco", "Avenida Doutor Lourenço Peixinho"]
    assert abs(p["segundos"] / 60 - 5.92) < 0.01
    assert all(r["d"].startswith("M") for r in p["ruas"])


def test_cenario_em_vigor_muda_as_respostas_sem_parametro():
    assert c.put("/v1/cenarios/atual", json={"cenario": "chuva"}, headers=RIA).status_code == 403
    assert c.put("/v1/cenarios/atual", json={"cenario": "chuva"}).status_code == 403
    antes = c.get("/v1/rede/tempos-percurso", params={"pontos": PONTOS, "hora": 8}).json()
    assert antes["cenario"] == "normal" and antes["modo"] == "tempo-real"
    r = c.put("/v1/cenarios/atual", json={"cenario": "chuva", "incidente": True}, headers=PAINEL)
    assert r.status_code == 200 and r.json()["cenario"] == "chuva"
    depois = c.get("/v1/rede/tempos-percurso", params={"pontos": PONTOS, "hora": 8}).json()
    assert depois["cenario"] == "chuva" and depois["incidente"] is True
    assert sum(depois["minutos"][0]) > sum(antes["minutos"][0])
    assert c.get("/v1/cenarios/atual").json()["incidente_info"]["rua"] == "Avenida de Santa Joana"


def test_raiz_serve_o_portal_ou_a_lista():
    r = c.get("/")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"] and "Aveiro em Movimento" in r.text
    assert c.get("/docs").status_code == 200
    # um caminho desconhecido da API continua a responder em JSON, não com a página
    nao = c.get("/v1/nao-existe")
    assert nao.status_code == 404 and nao.json()["detail"] == "Not Found"


def test_exemplo_de_estacionamento_e_uma_pagina_so():
    r = c.get("/estacionar/")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]
    # a página fala com a API e não precisa de mais nenhum ficheiro: nem bibliotecas, nem compilação
    assert "/v1/respostas/onde-estacionar" in r.text
    assert "<script src" not in r.text and 'rel="stylesheet"' not in r.text
    # o destino por omissão (o local do hackathon) tem resposta à hora do check-in
    resposta = c.get("/v1/respostas/onde-estacionar?destino=-8.6574,40.6381&hora=8&cenario=normal").json()
    assert resposta["itens"] and resposta["itens"][0]["a_pe_min"] <= 10 and not resposta["simulado"]


def test_exemplo_de_roteiro_e_uma_pagina_so():
    r = c.get("/visitar/")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]
    assert "/v1/respostas/roteiro-visita" in r.text
    assert "<script src" not in r.text and 'rel="stylesheet"' not in r.text


def test_estacionamento_por_dia_da_semana():
    base = c.get("/v1/estacionamento").json()
    sabado = c.get("/v1/estacionamento?dia=sabado").json()
    assert base["dia"] == "dias_uteis" and sabado["dia"] == "sabado"
    # cada dia da semana foi medido uma vez: a fonte diz em que data
    assert "7 de novembro" in sabado["fonte"]
    assert [p["id"] for p in sabado["postes"]] == [p["id"] for p in base["postes"]]
    assert [p["livres"] for p in sabado["postes"]] != [p["livres"] for p in base["postes"]]
    assert all(len(p["livres"]) == 24 and all(0 <= v <= p["lugares"] for v in p["livres"]) for p in sabado["postes"])
    assert len(sabado["livres"]) == 24
    assert c.get("/v1/estacionamento?dia=feriado").status_code == 422


def test_onde_estacionar_num_dia_da_semana():
    r = c.get("/v1/respostas/onde-estacionar?destino=-8.6574,40.6381&hora=8&cenario=normal&dia=domingo").json()
    assert r["itens"] and "domingo" in r["resposta"] and "8 de novembro" in r["fonte"]
    # os lugares livres da resposta são os desse dia
    livres = {p["id"]: p["livres"][8] for p in c.get("/v1/estacionamento?dia=domingo").json()["postes"]}
    assert all(i["livres"] == livres[i["id"]] for i in r["itens"])
    # sem dia, a resposta continua a ser a dos dias úteis
    sem_dia = c.get("/v1/respostas/onde-estacionar?destino=-8.6574,40.6381&hora=8&cenario=normal").json()
    assert "dias úteis" in sem_dia["fonte"] and sem_dia["resposta"].startswith("Às 8h há")


def test_quando_visitar_ao_sabado_diz_que_dia_foi_medido():
    sabado = c.get("/v1/respostas/quando-visitar?local=rossio&dia=sabado&hora=11&cenario=normal").json()
    assert "sábado, 7 de novembro" in sabado["fonte"] and "dias úteis" not in sabado["fonte"]
    assert "dias úteis" in c.get("/v1/respostas/quando-visitar?local=rossio&hora=11&cenario=normal").json()["fonte"]
    assert c.get("/v1/respostas/quando-visitar?local=rossio&dia=sabado&hora=11&cenario=chuva").json()["fonte"].startswith("simulado")


def test_resposta_diz_quanto_tempo_a_api_demorou():
    r = c.get("/v1/zonas")
    nome, _, dur = r.headers["server-timing"].partition(";dur=")
    assert nome == "api" and 0 <= float(dur) < 1000


def test_chaves_e_registo():
    assert c.get("/v1/zonas", headers={"X-API-Key": "nao-existe"}).status_code == 401
    c.get("/v1/passadeiras", params={"hora": 9}, headers=RIA)
    linha = c.get("/v1/registo").json()[0]
    assert linha["entidade"] == "Ria Express Entregas" and linha["pedido"].startswith("GET /v1/passadeiras") and linha["estado"] == 200
    assert c.post("/v1/webhooks", json={"url": "ftp://x"}).status_code == 422
    assert c.post("/v1/webhooks", json={"url": "http://localhost:9/aviso"}, headers=RIA).json()["entidade"] == "Ria Express Entregas"
