"""Testes da camada de respostas. Correr na pasta api:  python -m pytest -q"""
import json

from fastapi.testclient import TestClient

from app.main import app

c = TestClient(app)
PAINEL = {"X-API-Key": "cma-painel-demo"}
ROSSIO = "-8.6565,40.6412"
ESTACAO = "-8.6398,40.6433"
ENVELOPE = {"id", "pergunta", "para", "hora", "cenario", "incidente", "fonte", "resposta", "acao", "itens", "evidencia"}


def setup_function():
    c.put("/v1/cenarios/atual", json={"cenario": "normal", "incidente": False}, headers=PAINEL)


def pedir(caminho, **params):
    r = c.get("/v1/respostas/" + caminho, params=params)
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert ENVELOPE <= set(corpo), "falta no envelope: %s" % (ENVELOPE - set(corpo))
    assert corpo["acao"]["titulo"] and corpo["resposta"]
    texto = json.dumps(corpo, ensure_ascii=False)
    assert "None" not in texto and "NaN" not in texto and "null h" not in texto
    return corpo


def test_catalogo_lista_as_respostas():
    cat = c.get("/v1/respostas").json()
    assert [r["id"] for r in cat] == ["onde-intervir", "melhor-hora", "onde-estacionar", "quando-visitar", "roteiro-visita"]
    # cada exemplo do catálogo é um pedido que funciona
    assert all(c.get(r["exemplo"]).status_code == 200 for r in cat)


def test_roteiro_visita_foge_aos_picos():
    r = pedir("roteiro-visita", locais="rossio,moliceiros,forum,ria", dia="sabado", inicio=10, cenario="normal")
    assert [i["hora"] for i in r["itens"]] == [10, 11, 12, 13] and (r["inicio"], r["fim"], r["inicio_escolhido"]) == (10, 14, False)
    assert sorted(i["id"] for i in r["itens"]) == ["forum", "moliceiros", "ria", "rossio"]
    # a ordem sugerida fica a 5 pontos, no máximo, da que apanha menos gente, e é melhor do que a pior
    assert r["ocupacao_melhor"] <= r["ocupacao_media"] <= r["ocupacao_melhor"] + 0.05
    assert r["ocupacao_media"] < r["ocupacao_pior"] and r["ocupacao_pedida"] <= r["ocupacao_pior"]
    # os números de cada paragem são os da afluência desse local a essa hora
    for i in r["itens"]:
        serie = c.get("/v1/respostas/quando-visitar", params={"local": i["id"], "dia": "sabado", "hora": i["hora"], "cenario": "normal"}).json()["serie"]
        assert i["presencas"] == serie[i["hora"]] and i["pico"] == max(serie[9:18]) and 0 <= i["do_pico"] <= 1
    # a pé conta-se desde o local anterior
    assert r["itens"][0]["a_pe_min"] == 0 and all(i["a_pe_min"] >= 1 for i in r["itens"][1:])
    assert r["a_pe_min"] == sum(i["a_pe_min"] for i in r["itens"])
    # a grelha para desenhar: presenças por local, das 9h às 17h
    assert r["grelha"]["horas"] == list(range(9, 18)) and [len(l["presencas"]) for l in r["grelha"]["locais"]] == [9] * 4
    assert "sábado, 7 de novembro" in r["fonte"] and r["simulado"] is False
    assert r["acao"]["titulo"].startswith("Começar pel") and r["acao"]["titulo"].endswith("às 10h")
    assert pedir("roteiro-visita", locais="rossio,forum", cenario="chuva")["simulado"] is True


def test_roteiro_visita_escolhe_a_hora_de_comecar():
    r = pedir("roteiro-visita", locais="rossio,forum", dia="dias_uteis", cenario="normal")
    assert r["inicio_escolhido"] is True and 9 <= r["inicio"] <= 16 and r["fim"] == r["inicio"] + 2
    # nenhuma hora de começar dá menos gente do que a melhor que a API encontrou
    for h in range(9, 17):
        assert r["ocupacao_melhor"] <= pedir("roteiro-visita", locais="rossio,forum", dia="dias_uteis", inicio=h, cenario="normal")["ocupacao_melhor"]
    assert r["ocupacao_media"] <= r["ocupacao_melhor"] + 0.05


def test_roteiro_visita_prefere_andar_menos_quando_quase_nao_custa():
    r = pedir("roteiro-visita", locais="rossio,forum,ria", dia="dias_uteis", cenario="normal")
    # a ordem com menos gente (Fórum, Ria, Rossio) obrigava a 33 min a pé; esta fica a 4 pontos dela e anda 19
    assert [i["id"] for i in r["itens"]] == ["ria", "forum", "rossio"] and r["a_pe_min"] == 19
    assert r["ocupacao_melhor"] < r["ocupacao_media"] <= r["ocupacao_melhor"] + 0.05


def test_roteiro_visita_recusa_o_que_nao_cabe():
    def estado(**params):
        return c.get("/v1/respostas/roteiro-visita", params=params).status_code

    seis = "rossio,moliceiros,forum,lourenco-peixinho,ria,estacao"
    assert estado(locais="rossio,marte") == 404
    assert estado(locais="rossio") == 422 and estado(locais="rossio,rossio") == 422
    # seis locais, uma hora em cada, até às 18h: tem de se começar até às 12h
    assert estado(locais=seis, inicio=13) == 422 and estado(locais=seis, inicio=12) == 200
    assert estado(locais="rossio,forum", inicio=8) == 422


def test_onde_intervir_13h():
    r = pedir("onde-intervir", hora=13, cenario="normal")
    primeiro = r["itens"][0]
    assert primeiro["id"] == "0023" and primeiro["peoes_hora"] == 476 and primeiro["exposicao"] == 58212
    assert r["fonte"].startswith("real") and "Avenida 25 de Abril" in r["acao"]["titulo"]
    assert r["ruas_lentas"] == 14 and len(r["itens"]) == 3


def test_onde_intervir_ignora_sensores_sem_dados_recentes():
    r = pedir("onde-intervir", hora=13, cenario="normal", limite=10)
    assert "0019" not in [i["id"] for i in r["itens"]]


def test_onde_intervir_chuva_e_simulado():
    normal = pedir("onde-intervir", hora=13, cenario="normal")
    chuva = pedir("onde-intervir", hora=13, cenario="chuva")
    assert chuva["fonte"].startswith("simulado")
    assert chuva["itens"][0]["exposicao"] < normal["itens"][0]["exposicao"]
    assert chuva["ruas_lentas"] > normal["ruas_lentas"]


def test_onde_intervir_de_madrugada():
    r = pedir("onde-intervir", hora=3, cenario="normal")
    assert r["acao"]["titulo"] == "Sem prioridade a esta hora"


def test_melhor_hora_montra():
    r = pedir("melhor-hora", zona="25-abril", para="montra", hora=13, cenario="normal")
    assert r["pico_hora"] == 13 and r["pico_valor"] == 766 and r["agora"] == 766
    assert r["janela"][0] <= 13 <= r["janela"][1] and len(r["serie"]) == 24
    chuva = pedir("melhor-hora", zona="25-abril", para="montra", hora=13, cenario="chuva")
    assert chuva["pico_valor"] < 766 and chuva["fonte"].startswith("simulado")


def test_a_acao_acompanha_a_hora():
    montra = lambda h: pedir("melhor-hora", zona="25-abril", para="montra", hora=h, cenario="normal")["acao"]["titulo"]
    assert montra(9) == "Preparar o pico das 13h"
    assert montra(13) == "Reforçar a equipa agora"
    assert montra(18) == "Hora calma: repor e arrumar"
    visitar = lambda h: pedir("quando-visitar", local="rossio", hora=h, cenario="normal")["acao"]["titulo"]
    assert visitar(10) == "Evitar o Rossio agora: ir às 17h"
    assert visitar(13) == "Boa altura para visitar o Rossio"
    # com chuva há menos velocidade: a prioridade mantém-se, o motivo muda
    assert pedir("onde-intervir", hora=13, cenario="chuva")["acao"]["titulo"] == "Vigiar a passadeira na Avenida 25 de Abril"


def test_melhor_hora_cargas():
    r = pedir("melhor-hora", zona="25-abril", para="cargas", hora=13, cenario="normal")
    assert 8 <= r["hora_recomendada"] <= 18
    # a hora recomendada tem menos peões do que o pico
    assert r["serie_peoes"][r["hora_recomendada"]] < 766


def test_melhor_hora_parametros_invalidos():
    assert c.get("/v1/respostas/melhor-hora", params={"zona": "nao-existe"}).status_code == 404
    assert c.get("/v1/respostas/melhor-hora", params={"zona": "25-abril", "para": "xpto"}).status_code == 422


def test_onde_estacionar_perto_do_rossio():
    r = pedir("onde-estacionar", destino=ROSSIO, hora=13, cenario="normal", limite=10)
    ids = [i["id"] for i in r["itens"]]
    assert ids[0] in ("0003", "0004") and "0030" not in ids
    assert all(i["livres"] >= 2 and i["nome"] for i in r["itens"])
    assert r["itens"][0]["a_pe_min"] <= 3 and r["itens"][0]["de_carro_min"] is None
    assert r["itens"][0]["nome"] in r["acao"]["titulo"]


def test_onde_estacionar_com_origem_muda_com_chuva():
    normal = pedir("onde-estacionar", destino=ROSSIO, origem=ESTACAO, hora=13, cenario="normal")
    chuva = pedir("onde-estacionar", destino=ROSSIO, origem=ESTACAO, hora=13, cenario="chuva")
    incidente = pedir("onde-estacionar", destino=ROSSIO, origem=ESTACAO, hora=13, cenario="normal", incidente=True)
    assert normal["itens"][0]["de_carro_min"] > 0
    assert chuva["itens"][0]["de_carro_min"] > normal["itens"][0]["de_carro_min"]
    assert incidente["itens"][0]["de_carro_min"] > normal["itens"][0]["de_carro_min"]
    # os lugares livres são medidos: o modelo de chuva não os altera
    assert chuva["itens"][0]["livres"] == normal["itens"][0]["livres"]


def test_onde_estacionar_destino_invalido():
    assert c.get("/v1/respostas/onde-estacionar", params={"destino": "rossio"}).status_code == 422
    assert c.get("/v1/respostas/onde-estacionar").status_code == 422


def test_quando_visitar_rossio():
    r = pedir("quando-visitar", local="rossio", dia="dias_uteis", hora=13, cenario="normal")
    assert r["hora_pico"] == 10 and r["hora_calma"] == 17 and r["nivel"] == "moderado" and r["agora"] == 602
    assert len(r["serie"]) == 24
    assert c.get("/v1/respostas/quando-visitar", params={"local": "nao-existe"}).status_code == 404


def test_quando_visitar_fora_do_horario_com_contagens():
    r = pedir("quando-visitar", local="moliceiros", dia="dias_uteis", hora=21, cenario="normal")
    assert r["nivel"] == "calmo"


def test_todas_as_horas_e_cenarios_respondem():
    # da madrugada (sem peões, fluidez nula) à noite, em todos os cenários: frase e ação sempre preenchidas
    for hora in range(24):
        for cenario in ("normal", "chuva"):
            pedir("onde-intervir", hora=hora, cenario=cenario, incidente=True)
            pedir("onde-estacionar", destino=ROSSIO, origem=ESTACAO, hora=hora, cenario=cenario, incidente=True)
            for zona in ("25-abril", "pega", "universidade"):
                pedir("melhor-hora", zona=zona, para="montra", hora=hora, cenario=cenario)
                pedir("melhor-hora", zona=zona, para="cargas", hora=hora, cenario=cenario)
            for local in ("rossio", "moliceiros", "forum", "lourenco-peixinho", "ria", "estacao"):
                for dia in ("dias_uteis", "sabado", "domingo"):
                    pedir("quando-visitar", local=local, dia=dia, hora=hora, cenario=cenario)


def test_respostas_seguem_o_cenario_em_vigor():
    c.put("/v1/cenarios/atual", json={"cenario": "chuva", "incidente": True}, headers=PAINEL)
    r = pedir("onde-intervir", hora=13)
    assert r["cenario"] == "chuva" and r["incidente"] is True and r["fonte"].startswith("simulado")
    assert pedir("onde-intervir", hora=13, cenario="normal")["cenario"] == "normal"
