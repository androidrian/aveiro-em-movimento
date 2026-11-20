"""Camada de respostas: dos indicadores à ação.

Cada função responde a uma pergunta concreta de uma entidade (município, comércio,
logística, cidadãos, visitantes) com uma frase, uma ação curta e a evidência que a sustenta.
Tudo é calculado sobre os mesmos agregados dos restantes endpoints; nada aqui é medido de novo.

Uma resposta é uma sugestão a partir dos dados de uma semana, não uma decisão.
"""
from __future__ import annotations

import itertools
import math

from . import dados as D
from . import indicadores as I
from . import rede

CATALOGO = [
    {
        "id": "onde-intervir",
        "pergunta": "Onde intervir primeiro?",
        "para": ["município"],
        "endpoint": "/v1/respostas/onde-intervir",
        "exemplo": "/v1/respostas/onde-intervir?hora=13",
        "combina": ["segurança rodoviária", "mobilidade"],
    },
    {
        "id": "melhor-hora",
        "pergunta": "A que horas passa mais gente à porta, e quando descarregar?",
        "para": ["comércio", "logística"],
        "endpoint": "/v1/respostas/melhor-hora",
        "exemplo": "/v1/respostas/melhor-hora?zona=25-abril&para=montra",
        "combina": ["segurança rodoviária", "mobilidade"],
    },
    {
        "id": "onde-estacionar",
        "pergunta": "Onde há lugar perto do meu destino?",
        "para": ["cidadãos"],
        "endpoint": "/v1/respostas/onde-estacionar",
        "exemplo": "/v1/respostas/onde-estacionar?destino=-8.6565,40.6412&origem=-8.6398,40.6433&hora=13",
        "combina": ["smart parking", "mobilidade"],
    },
    {
        "id": "quando-visitar",
        "pergunta": "Quando visitar com menos gente?",
        "para": ["visitantes", "turismo"],
        "endpoint": "/v1/respostas/quando-visitar",
        "exemplo": "/v1/respostas/quando-visitar?local=rossio&hora=13",
        "combina": ["turismo"],
    },
    {
        "id": "roteiro-visita",
        "pergunta": "Por que ordem visitar para apanhar menos gente?",
        "para": ["visitantes", "turismo"],
        "endpoint": "/v1/respostas/roteiro-visita",
        "exemplo": "/v1/respostas/roteiro-visita?locais=rossio,moliceiros,forum,ria&dia=sabado&inicio=10",
        "combina": ["turismo"],
    },
]
_ENTRADA = {r["id"]: r for r in CATALOGO}

# Horas consideradas em cada pergunta.
HORAS_DIA = range(7, 22)  # movimento na rua
HORAS_CARGAS = range(8, 19)  # horário de comércio
HORAS_VISITA = range(9, 18)  # horas em que todas as zonas turísticas têm contagens
POUCO_MOVIMENTO = 30  # peões por hora: abaixo disto não se destaca uma passadeira
LUGARES_MINIMOS = 2  # um parque só é sugerido com pelo menos estes lugares livres
METROS_POR_MINUTO_A_PE = 75
DESVIO_A_PE = 1.3  # a pé anda-se pelas ruas, não em linha reta
FOLGA_ROTEIRO = 0.05  # um roteiro pode ficar até 5 pontos acima da menor ocupação média possível, se obrigar a andar menos
MASCULINOS = ("Cais", "Largo", "Parque", "Rossio", "Fórum", "Campus", "Bairro", "Beco")


def catalogo() -> list[dict]:
    return CATALOGO


def _envelope(rid: str, hora: int, cenario: str, incidente: bool, simulado: bool, fonte: str, resposta: str, titulo: str, detalhe: str, itens: list, evidencia: list, **extras) -> dict:
    e = _ENTRADA[rid]
    return {
        "id": rid,
        "pergunta": e["pergunta"],
        "para": e["para"],
        "hora": hora,
        "cenario": cenario,
        "incidente": incidente,
        "simulado": simulado,
        "fonte": fonte,
        "resposta": resposta,
        "acao": {"titulo": titulo, "detalhe": detalhe},
        "itens": itens,
        "evidencia": evidencia,
        **extras,
    }


def _ev(indicador: str, valor, unidade: str, origem: str) -> dict:
    return {"indicador": indicador, "valor": valor, "unidade": unidade, "origem": origem}


def _em(nome: str) -> str:
    return ("no " if nome.startswith(MASCULINOS) else "na ") + nome


def _o(nome: str) -> str:
    return ("o " if nome.startswith(MASCULINOS) else "a ") + nome


def _pelo(nome: str) -> str:
    return ("pelo " if nome.startswith(MASCULINOS) else "pela ") + nome


def _enumerar(partes: list[str]) -> str:
    """"a, b e c"."""
    return partes[0] if len(partes) == 1 else ", ".join(partes[:-1]) + " e " + partes[-1]


def _nivel(racio: float) -> str:
    return "calmo" if racio <= 0.33 else ("moderado" if racio <= 0.66 else "cheio")


def _pct(x: float) -> int:
    return round(x * 100)


def _metros(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    kx = 111320 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot((lon1 - lon2) * kx, (lat1 - lat2) * 110540)


def _extremo(serie: list, horas: range, maior: bool = True) -> int:
    """Hora do maior (ou menor) valor; em caso de empate, a mais cedo."""
    return (max if maior else min)(horas, key=lambda h: (serie[h] or 0, -h if maior else h))


# ---------------------------------------------------------------- município

def onde_intervir(hora: int, cenario: str, incidente: bool, limite: int = 3) -> dict:
    """Passadeiras com dados recentes, ordenadas pela exposição (peões x veículos x % acima do limite)."""
    ativas = [p for p in D.PASSADEIRAS if not D.sem_dados_recentes(p["ultimo_dado"])]
    ms = sorted((I.metricas_passadeira(p, hora, cenario) for p in ativas), key=lambda m: -m["exposicao"])
    itens = []
    for m in ms[:limite]:
        if m["acima_do_limite"] >= 0.10:
            motivo = "velocidade"
        elif (m["espera_p90_s"] or 0) >= 20:
            motivo = "espera"
        else:
            motivo = "volume"
        itens.append(
            {
                "id": m["id"],
                "rua": m["rua"],
                "peoes_hora": m["peoes_hora"],
                "veiculos_hora": m["veiculos_hora"],
                "acima_do_limite": m["acima_do_limite"],
                "limite_kmh": m["limite_kmh"],
                "velocidade_p85_kmh": m["velocidade_p85_kmh"],
                "espera_p90_s": m["espera_p90_s"],
                "exposicao": m["exposicao"],
                "motivo": motivo,
                **{k: m["localizacao"][k] for k in ("lon", "lat", "x", "y")},
            }
        )
    lentas = sum(1 for r in D.RUAS if (fl := I.fluidez_rua(r, hora, cenario)) is not None and I.nivel_fluidez(fl) == 2)
    espera = max(ativas, key=lambda p: p["espera_p90"])
    t = itens[0]
    evidencia = [
        _ev("Peões por hora", t["peoes_hora"], "peões/h", "/v1/passadeiras/%s/metricas?hora=%d" % (t["id"], hora)),
        _ev("Veículos por hora", t["veiculos_hora"], "veículos/h", "/v1/passadeiras/%s/metricas?hora=%d" % (t["id"], hora)),
        _ev("Veículos acima do limite", _pct(t["acima_do_limite"]), "%", "/v1/passadeiras/%s/metricas?hora=%d" % (t["id"], hora)),
        _ev("Ruas lentas na cidade", lentas, "ruas", "/v1/segmentos?hora=%d" % hora),
        _ev("Maior espera de peões (P90 da semana): %s" % espera["rua"], espera["espera_p90"], "s", "/v1/passadeiras/%s/metricas" % espera["id"]),
    ]
    if t["peoes_hora"] < POUCO_MOVIMENTO:
        titulo, detalhe = "Sem prioridade a esta hora", "Pouco movimento a pé: nenhuma passadeira se destaca"
        resposta = "Às %dh há pouco movimento a pé: nenhuma passadeira se destaca. Há %d ruas lentas na cidade." % (hora, lentas)
    else:
        titulo = {"velocidade": "Acalmar o trânsito ", "espera": "Dar mais tempo aos peões ", "volume": "Vigiar a passadeira "}[t["motivo"]] + _em(t["rua"])
        detalhe = "Passadeira %s: %d peões e %d veículos por hora, %d%% acima dos %d km/h" % (t["id"], t["peoes_hora"], t["veiculos_hora"], _pct(t["acima_do_limite"]), t["limite_kmh"])
        resposta = "Às %dh, a passadeira %s (%s) junta %d peões e %d veículos por hora, com %d%% dos veículos acima dos %d km/h. É a de maior exposição entre as %d passadeiras com dados recentes. Há %d ruas lentas na cidade." % (
            hora, t["id"], t["rua"], t["peoes_hora"], t["veiculos_hora"], _pct(t["acima_do_limite"]), t["limite_kmh"], len(ativas), lentas,
        )
    extras = {"ruas_lentas": lentas, "passadeiras_avaliadas": len(ativas), "nota": "Exposição = peões x veículos x fração de veículos acima do limite. Ordena prioridades de análise; não mede sinistralidade."}
    if incidente:
        inc = rede.incidente_info()
        resposta += " Incidente em vigor na %s: trânsito a %d%% da velocidade habitual." % (inc["rua"], _pct(inc["fator_velocidade"]))
        extras["incidente_info"] = {k: inc[k] for k in ("rua", "fator_velocidade", "lon", "lat", "x", "y")}
    return _envelope("onde-intervir", hora, cenario, incidente, cenario == "chuva", I.fonte(cenario), resposta, titulo, detalhe, itens, evidencia, **extras)


# ---------------------------------------------------------------- comércio e logística

def melhor_hora(zona_id: str, para: str, hora: int, cenario: str) -> dict:
    p = I.perfil_zona(zona_id, cenario)
    nome = p["zona"]["nome"]
    peoes, veiculos = p["peoes_hora"], p["veiculos_hora"]
    origem = "/v1/zonas/%s/perfil" % zona_id
    if para == "cargas":
        topo_p = max(peoes[h] for h in HORAS_CARGAS) or 1
        topo_v = max(veiculos[h] for h in HORAS_CARGAS) or 1
        h = min(HORAS_CARGAS, key=lambda x: (peoes[x] / topo_p + veiculos[x] / topo_v, x))
        fl = p["fluidez"][h]
        return _envelope(
            "melhor-hora", hora, cenario, False, cenario == "chuva", I.fonte(cenario),
            "Em %s, a hora mais desimpedida entre as 8h e as 18h é às %dh: %d peões e %d veículos por hora." % (nome, h, peoes[h], veiculos[h]),
            "Cargas e descargas às %dh" % h,
            "%s: %d peões e %d veículos por hora" % (nome, peoes[h], veiculos[h]),
            [{"hora": x, "peoes_hora": peoes[x], "veiculos_hora": veiculos[x]} for x in HORAS_CARGAS],
            [_ev("Peões às %dh" % h, peoes[h], "peões/h", origem), _ev("Veículos às %dh" % h, veiculos[h], "veículos/h", origem)]
            + ([_ev("Fluidez do trânsito às %dh" % h, _pct(fl), "% da velocidade livre", origem)] if fl is not None else []),
            objetivo="cargas", zona={"id": zona_id, "nome": nome}, hora_recomendada=h, serie_peoes=peoes, serie_veiculos=veiculos,
        )

    pico = _extremo(peoes, HORAS_DIA)
    a = b = pico
    while a - 1 in HORAS_DIA and peoes[a - 1] >= 0.8 * peoes[pico]:
        a -= 1
    while b + 1 in HORAS_DIA and peoes[b + 1] >= 0.8 * peoes[pico]:
        b += 1
    pico_normal = I.perfil_zona(zona_id, "normal")["peoes_hora"][pico]
    media = round(sum(peoes[h] for h in HORAS_DIA) / len(HORAS_DIA))
    quando = "às %dh" % pico if a == b else "das %dh às %dh" % (a, b + 1)
    resposta = "Em %s, o maior movimento a pé é %s, com %d pessoas por hora no pico. " % (nome, quando, peoes[pico])
    resposta += "Agora é essa hora." if hora == pico else "Às %dh passam %d (%d%% do pico)." % (hora, peoes[hora], _pct(peoes[hora] / peoes[pico]) if peoes[pico] else 0)
    if cenario == "chuva" and pico_normal:
        resposta += " Com chuva espera-se %d%% menos movimento do que num dia normal." % _pct(1 - peoes[pico] / pico_normal)
    # a ação depende de onde a hora pedida fica face ao pico
    parte = _pct(peoes[hora] / peoes[pico]) if peoes[pico] else 0
    if a <= hora <= b:
        titulo, detalhe = "Reforçar a equipa agora", "%s: %d pessoas por hora a passar, o pico do dia" % (nome, peoes[hora])
    elif hora < a:
        titulo, detalhe = "Preparar o pico das %dh" % pico, "%s: agora passam %d por hora; às %dh serão %d" % (nome, peoes[hora], pico, peoes[pico])
    elif parte >= 60:
        titulo, detalhe = "Manter a equipa: ainda há movimento", "%s: agora passam %d por hora (%d%% do pico das %dh)" % (nome, peoes[hora], parte, pico)
    else:
        titulo, detalhe = "Hora calma: repor e arrumar", "%s: agora passam %d por hora (%d%% do pico das %dh)" % (nome, peoes[hora], parte, pico)
    return _envelope(
        "melhor-hora", hora, cenario, False, cenario == "chuva", I.fonte(cenario),
        resposta,
        titulo,
        detalhe,
        [{"hora": h, "peoes_hora": peoes[h]} for h in sorted(HORAS_DIA, key=lambda h: -peoes[h])[:3]],
        [_ev("Pico de travessias a pé", peoes[pico], "peões/h", origem), _ev("Travessias a pé às %dh" % hora, peoes[hora], "peões/h", origem), _ev("Média entre as 7h e as 21h", media, "peões/h", origem)],
        objetivo="montra", zona={"id": zona_id, "nome": nome}, pico_hora=pico, pico_valor=peoes[pico], pico_normal=pico_normal, janela=[a, b], agora=peoes[hora], serie=peoes,
    )


# ---------------------------------------------------------------- cidadãos

def onde_estacionar(destino: dict, origem: dict | None, hora: int, cenario: str, incidente: bool, limite: int = 3, dia: str | None = None) -> dict:
    """`destino` e `origem` são pontos de `rede.ponto` (lon, lat e nó da rede).

    Sem `dia`, os lugares livres são a média dos dias úteis; com `dia`, os desse dia da semana.
    """
    de_carro = rede.caminhos(cenario, incidente, hora, origem["no"])[0] if origem else None
    est = I.estacionamento(dia)
    quando = "Às %dh" % hora + (" de " + D.DIAS_SEMANA[dia] if dia else "")
    origem_dos_lugares = "/v1/estacionamento" + ("?dia=" + dia if dia else "")
    itens = []
    for p in est["postes"]:
        if p["estado"] != "ativo" or p["livres"][hora] < LUGARES_MINIMOS:
            continue
        a_pe = max(1, round(_metros(destino["lon"], destino["lat"], p["lon"], p["lat"]) * DESVIO_A_PE / METROS_POR_MINUTO_A_PE))
        carro = round(de_carro[rede.ponto(p["lon"], p["lat"])["no"]] / 60, 1) if de_carro else None
        itens.append({"id": p["id"], "nome": p["nome"], "livres": p["livres"][hora], "lugares": p["lugares"], "a_pe_min": a_pe, "de_carro_min": carro, **{k: p[k] for k in ("lon", "lat", "x", "y")}})
    itens.sort(key=lambda i: ((i["de_carro_min"] or 0) + i["a_pe_min"], -i["livres"]))
    itens = itens[:limite]
    simulado = bool(origem) and (cenario == "chuva" or incidente)
    fonte = "real (lugares livres, %s)" % (D.periodo_do_dia(dia) if dia else D.PERIODO) + ("; tempo de carro simulado" if simulado else "")
    extras = {"dia": est["dia"], "destino": {"lon": destino["lon"], "lat": destino["lat"]}}
    if not itens:
        return _envelope("onde-estacionar", hora, cenario, incidente, simulado, fonte, quando + " não há parques monitorizados com lugares livres.", "Sem lugares livres monitorizados", "Nenhum parque com %d ou mais lugares livres" % LUGARES_MINIMOS, [], [], **extras)
    t = itens[0]
    detalhe = "%d lugares livres de %d, a %d min a pé" % (t["livres"], t["lugares"], t["a_pe_min"]) + (" e a %s min de carro" % str(t["de_carro_min"]).replace(".", ",") if origem else "")
    resposta = "%s há %d lugares livres %s, a %d min a pé do destino." % (quando, t["livres"], _em(t["nome"]), t["a_pe_min"])
    if origem:
        resposta += " De carro são %s min até lá%s." % (str(t["de_carro_min"]).replace(".", ","), " (com chuva)" if cenario == "chuva" else "")
    evidencia = [_ev("Lugares livres: " + t["nome"], t["livres"], "lugares", origem_dos_lugares)]
    if origem:
        evidencia.append(_ev("Tempo de carro", t["de_carro_min"], "min", "/v1/rede/percurso?de=%s,%s&para=%s,%s&hora=%d" % (origem["lon"], origem["lat"], t["lon"], t["lat"], hora)))
    evidencia.append(_ev("Lugares livres na cidade", est["livres"][hora], "lugares", origem_dos_lugares))
    return _envelope("onde-estacionar", hora, cenario, incidente, simulado, fonte, resposta, "Estacionar " + _em(t["nome"]), detalhe, itens, evidencia, **extras)


# ---------------------------------------------------------------- visitantes

def quando_visitar(local_id: str, dia: str, hora: int, cenario: str) -> dict:
    local = D.LOCAL[local_id]
    serie = I.afluencia_local(local_id, dia, cenario)
    pico, calma = _extremo(serie, HORAS_VISITA), _extremo(serie, HORAS_VISITA, maior=False)
    topo = serie[pico] or 1
    agora = serie[hora]
    nivel = _nivel(agora / topo)
    nome = _o(local["nome"])
    if hora in HORAS_VISITA and agora <= serie[calma] * 1.15:
        titulo = "Boa altura para visitar " + nome
    elif hora in HORAS_VISITA and nivel == "cheio":
        titulo = "Evitar %s agora: ir às %dh" % (nome, calma)
    else:
        titulo = "Visitar %s às %dh" % (nome, calma)
    detalhe = "Agora está %s: %d presenças por hora (pico às %dh)" % (nivel, agora, pico)
    resposta = "%s está %s às %dh (%d presenças por hora). Entre as 9h e as 17h, a hora mais calma é às %dh (%d) e o pico é às %dh (%d)." % (
        nome[0].upper() + nome[1:], nivel, hora, agora, calma, serie[calma], pico, serie[pico],
    )
    origem = "/v1/turismo/afluencia?dia=" + dia
    evidencia = [
        _ev("Presenças agora", agora, "presenças/h", origem),
        _ev("Presenças na hora mais calma (%dh)" % calma, serie[calma], "presenças/h", origem),
        _ev("Presenças no pico (%dh)" % pico, serie[pico], "presenças/h", origem),
        _ev("Permanência mediana", local["permanencia_mediana_s"], "s", "/v1/turismo/locais"),
    ]
    lugar = next(l for l in I.locais_turisticos() if l["id"] == local_id)
    # o sábado e o domingo foram medidos uma vez cada: a fonte diz em que data
    fonte = I.fonte(cenario) if cenario == "chuva" or dia == "dias_uteis" else "real (%s)" % D.periodo_do_dia(dia)
    return _envelope(
        "quando-visitar", hora, cenario, False, cenario == "chuva", fonte, resposta, titulo, detalhe, [], evidencia,
        local={k: lugar[k] for k in ("id", "nome", "lon", "lat", "x", "y")}, dia=dia, nivel=nivel, agora=agora, hora_calma=calma, hora_pico=pico, serie=serie,
        nota="Conta presenças de peões nas zonas do local; a mesma pessoa pode ser contada mais do que uma vez. Consideram-se as horas das 9h às 17h, em que todas as zonas têm contagens.",
    )


def roteiro_visita(locais: list[str], dia: str, inicio: int | None, cenario: str) -> dict:
    """A ordem de visita que apanha cada local mais longe do seu pico.

    Uma hora por local, dentro das horas em que todos têm contagens. O custo de uma ordem é a soma,
    local a local, das presenças à hora da visita a dividir pelo pico desse local. Entre as ordens
    que ficam a menos de FOLGA_ROTEIRO da melhor, ganha a que tem menos minutos a pé.
    Sem `inicio`, escolhe-se também a hora de começar.
    """
    n = len(locais)
    lugar = {l["id"]: l for l in I.locais_turisticos()}
    serie = {l: I.afluencia_local(l, dia, cenario) for l in locais}
    pico_hora = {l: _extremo(serie[l], HORAS_VISITA) for l in locais}
    pico = {l: serie[l][pico_hora[l]] or 1 for l in locais}

    def a_pe(a: str, b: str) -> int:
        return max(1, round(_metros(lugar[a]["lon"], lugar[a]["lat"], lugar[b]["lon"], lugar[b]["lat"]) * DESVIO_A_PE / METROS_POR_MINUTO_A_PE))

    def custo(ordem, h0: int) -> float:
        return sum(serie[l][h0 + i] / pico[l] for i, l in enumerate(ordem))

    def caminhada(ordem) -> int:
        return sum(a_pe(a, b) for a, b in zip(ordem, ordem[1:]))

    inicios = [inicio] if inicio is not None else range(HORAS_VISITA.start, HORAS_VISITA.stop - n + 1)
    ordens = list(itertools.permutations(locais))
    hipoteses = [(custo(o, h), h, o) for h in inicios for o in ordens]
    menor = min(c for c, _, _ in hipoteses)
    # entre as ordens quase tão boas como a melhor, fica a que obriga a andar menos
    _, h0, ordem = min((p for p in hipoteses if p[0] <= menor + FOLGA_ROTEIRO * n), key=lambda p: (caminhada(p[2]), round(p[0], 4), p[1]))
    media, melhor, pior, pedida = (round(c / n, 3) for c in (custo(ordem, h0), menor, max(custo(o, h0) for o in ordens), custo(locais, h0)))

    itens = []
    for i, l in enumerate(ordem):
        v = serie[l][h0 + i]
        itens.append(
            {
                "id": l,
                "nome": lugar[l]["nome"],
                "hora": h0 + i,
                "presencas": v,
                "pico": pico[l],
                "pico_hora": pico_hora[l],
                "do_pico": round(v / pico[l], 2),
                "nivel": _nivel(v / pico[l]),
                "a_pe_min": a_pe(ordem[i - 1], l) if i else 0,
                **{k: lugar[l][k] for k in ("lon", "lat", "x", "y")},
            }
        )
    quando = {"dias_uteis": "Num dia útil", "sabado": "Ao sábado", "domingo": "Ao domingo"}[dia]
    paragens = ["%s às %dh" % (i["nome"], i["hora"]) for i in itens]
    resposta = "%s, %s às %dh: %s. " % (quando, "o melhor é começar" if inicio is None else "a começar", h0, _enumerar(paragens))
    if media < pior:
        resposta += "Nesta ordem, cada local é visitado em média a %d%% do seu pico; na pior ordem seria a %d%%." % (_pct(media), _pct(pior))
    else:
        resposta += "A estas horas a ordem não faz diferença: cada local é visitado em média a %d%% do seu pico." % _pct(media)
    if cenario == "chuva":
        resposta += " Com chuva espera-se menos gente na rua."
    origem = "/v1/turismo/afluencia?dia=" + dia
    evidencia = [_ev("Presenças %s às %dh" % (_em(i["nome"]), i["hora"]), i["presencas"], "presenças/h", origem) for i in itens] + [
        _ev("Ocupação média face ao pico de cada local, nesta ordem", _pct(media), "%", origem),
        _ev("Ocupação média face ao pico de cada local, na pior ordem", _pct(pior), "%", origem),
        _ev("A pé entre locais", caminhada(ordem), "min", "/v1/turismo/locais"),
    ]
    fonte = I.fonte(cenario) if cenario == "chuva" or dia == "dias_uteis" else "real (%s)" % D.periodo_do_dia(dia)
    return _envelope(
        "roteiro-visita", h0, cenario, False, cenario == "chuva", fonte, resposta,
        "Começar %s às %dh" % (_pelo(itens[0]["nome"]), h0),
        "Depois " + _enumerar(paragens[1:]),
        itens, evidencia,
        dia=dia, inicio=h0, fim=h0 + n, inicio_escolhido=inicio is None, ocupacao_media=media, ocupacao_melhor=melhor, ocupacao_pior=pior, ocupacao_pedida=pedida, a_pe_min=caminhada(ordem),
        grelha={"horas": list(HORAS_VISITA), "locais": [{"id": l, "nome": lugar[l]["nome"], "pico_hora": pico_hora[l], "presencas": [serie[l][h] for h in HORAS_VISITA]} for l in ordem]},
        nota="Uma hora por local. Entre as ordens que ficam a menos de 5 pontos percentuais da menor ocupação possível, fica a que tem menos minutos a pé. "
        "Conta presenças de peões nas zonas de cada local; a mesma pessoa pode ser contada mais do que uma vez. "
        "Os minutos a pé são a distância em linha reta com 30% de desvio, a 4,5 km/h.",
    )
