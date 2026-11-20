"""Motor de indicadores: transforma os agregados em métricas por zona, passadeira e rua.

Regra de leitura das fontes:
- "real": média medida pelos sensores nos dias úteis da semana analisada.
- "simulado": perfil real multiplicado pelo modelo do dia de chuva.
"""
from __future__ import annotations

from functools import lru_cache

from . import dados as D
from . import rede

HORAS = range(24)
NIVEIS_TRANSITO = ["pouco", "intermédio", "intenso"]
NIVEIS_FLUIDEZ = ["fluido", "moderado", "lento"]


# ---------------------------------------------------------------- cenário

def fator_peoes(h: int, cenario: str) -> float:
    if cenario != "chuva":
        return 1.0
    return D.CHUVA["ped_midday"] if 10 <= h <= 17 else D.CHUVA["ped"]


def fator_veiculos(h: int, cenario: str) -> float:
    return D.CHUVA["veh"] if cenario == "chuva" and 7 <= h <= 20 else 1.0


def fator_acima_limite(cenario: str) -> float:
    return D.CHUVA["over"] if cenario == "chuva" else 1.0


def fluidez_rua(rua: dict, h: int, cenario: str):
    return (rua["fluidez_chuva"] if cenario == "chuva" else rua["fluidez"])[h]


def fonte(cenario: str) -> str:
    return "simulado (perfil real + modelo de chuva)" if cenario == "chuva" else "real (" + D.PERIODO + ")"


def nivel_fluidez(r: float) -> int:
    return 0 if r >= 0.85 else (1 if r >= 0.68 else 2)


def _r(x, casas=1):
    return None if x is None else round(x, casas)


# ---------------------------------------------------------------- estacionamento

@lru_cache(maxsize=None)
def estacionamento(dia: str | None = None) -> dict:
    """Ocupação por hora: a média dos dias úteis ou, com `dia`, a desse dia da semana.

    Dados reais; o modelo de chuva não os altera. Cada dia da semana foi medido uma vez.
    """
    ocupacao = {e["id"]: D.ESTACIONAMENTO_DIAS["postes"][e["id"]][dia] if dia else e["ocupacao"] for e in D.ESTACIONAMENTO}
    ativos = [e for e in D.ESTACIONAMENTO if not D.sem_dados_recentes(e["ultimo_dado"])]
    parados = [e for e in D.ESTACIONAMENTO if D.sem_dados_recentes(e["ultimo_dado"])]
    total = sum(e["lugares"] for e in D.ESTACIONAMENTO)
    sem_info = sum(e["lugares"] for e in parados)
    ocupados = [round(sum(e["lugares"] * ocupacao[e["id"]][h] for e in ativos)) for h in HORAS]
    return {
        "dia": dia or "dias_uteis",
        "lugares": total,
        "sem_informacao": sem_info,
        "ocupados": ocupados,
        "livres": [total - sem_info - o for o in ocupados],
        "fonte": "real (" + (D.periodo_do_dia(dia) if dia else D.PERIODO) + ")",
        "nota": "Sem informação: lugares de postes sem dados desde antes de 10 de novembro.",
        "postes": [_poste(e, ocupacao[e["id"]]) for e in D.ESTACIONAMENTO],
    }


def _poste(e: dict, ocupacao: list) -> dict:
    ref = D.REFERENCIAS["postes"][e["id"]]
    x, y = rede.para_mapa(ref["lon"], ref["lat"])
    return {
        "id": e["id"],
        "nome": ref["nome"],
        "lugares": e["lugares"],
        "livres": [e["lugares"] - round(e["lugares"] * ocupacao[h]) for h in HORAS],
        "ocupacao": ocupacao,
        "ocupacao_maxima": e["ocupacao_maxima"],
        "ultimo_dado": e["ultimo_dado"],
        "estado": "sem dados recentes" if D.sem_dados_recentes(e["ultimo_dado"]) else "ativo",
        "lon": ref["lon"],
        "lat": ref["lat"],
        "x": round(x, 1),
        "y": round(y, 1),
    }


# ---------------------------------------------------------------- turismo

@lru_cache(maxsize=None)
def locais_turisticos() -> list[dict]:
    """Locais turísticos: as zonas do ATCLL com o mesmo nome contam como um só local."""
    out = []
    for l in D.REFERENCIAS["locais"]:
        x, y = rede.para_mapa(l["lon"], l["lat"])
        out.append({**l, "x": round(x, 1), "y": round(y, 1)})
    return out


@lru_cache(maxsize=None)
def afluencia_local(local_id: str, dia: str, cenario: str) -> list[float]:
    """Presenças por hora num local (soma das suas zonas). Com chuva, aplica o fator de peões do modelo."""
    zonas = [D.ZONA_TURISTICA[z] for z in D.LOCAL[local_id]["zonas"]]
    return [round(sum(z[dia][h] for z in zonas) * fator_peoes(h, cenario)) for h in HORAS]


# ---------------------------------------------------------------- zonas

def _segmentos_da_zona(zona: dict) -> list[dict]:
    """Uma entrada por segmento de rua ligado a passadeiras da zona (sem repetir)."""
    vistos, out = set(), []
    for pid in zona["passadeiras"]:
        p = D.PASSADEIRA[pid]
        if p["segmento"] not in vistos:
            vistos.add(p["segmento"])
            out.append(p)
    return out


@lru_cache(maxsize=None)
def perfil_zona(zona_id: str, cenario: str) -> dict:
    zona = D.ZONA[zona_id]
    pas = [D.PASSADEIRA[i] for i in zona["passadeiras"]]
    segs = _segmentos_da_zona(zona)
    ruas = [D.RUA[i] for i in zona["ruas"]]
    radares = [r for r in ruas if r["sensor"] == "Radar"]

    peoes, veiculos, acima, espera, velocidade, fluidez = [], [], [], [], [], []
    for h in HORAS:
        fp, fv, fo = fator_peoes(h, cenario), fator_veiculos(h, cenario), fator_acima_limite(cenario)
        peoes.append(round(sum(p["peoes"][h] for p in pas) * fp))
        v = sum(s["veiculos"][h] for s in segs)
        veiculos.append(round(v / len(segs) * fv))  # média por segmento medido junto às passadeiras
        com_ac = [s for s in segs if s["acima_limite"][h] is not None]
        v_ac = sum(s["veiculos"][h] for s in com_ac)
        acima.append(_r(sum(s["acima_limite"][h] * s["veiculos"][h] for s in com_ac) / v_ac * fo, 3) if v_ac else None)
        # espera: média ponderada pelos peões, só onde há espera medida nessa hora
        com = [(p["espera"][h], p["peoes"][h] + 0.01) for p in pas if p["espera"][h] is not None]
        espera.append(_r(sum(e * w for e, w in com) / sum(w for _, w in com)) if com else None)
        # fluidez: todas as ruas medidas da zona; velocidade em km/h: só radares
        fl = [(fluidez_rua(r, h, cenario), r["veiculos"][h] + 1) for r in ruas if fluidez_rua(r, h, cenario) is not None]
        fluidez.append(_r(sum(f * w for f, w in fl) / sum(w for _, w in fl), 3) if fl else None)
        vk = [(r["velocidade_livre"] * fluidez_rua(r, h, cenario), r["veiculos"][h] + 1) for r in radares if fluidez_rua(r, h, cenario) is not None]
        velocidade.append(_r(sum(x * w for x, w in vk) / sum(w for _, w in vk)) if vk else None)

    # nível de trânsito: face ao máximo da própria zona num dia normal
    base = perfil_zona(zona_id, "normal")["veiculos_hora"] if cenario != "normal" else veiculos
    topo = max(base) or 1
    nivel = [0 if v / topo < 0.34 else (1 if v / topo < 0.67 else 2) for v in veiculos]

    tot = sum(p["travessias_semana"] for p in pas) or 1
    trav_med = sum(p["travessia_mediana"] * p["travessias_semana"] for p in pas) / tot
    trav_p90 = sum(p["travessia_p90"] * p["travessias_semana"] for p in pas) / tot
    parados = [p["id"] for p in pas if D.sem_dados_recentes(p["ultimo_dado"])]

    return {
        "zona": {"id": zona["id"], "nome": zona["nome"], "passadeiras": zona["passadeiras"], "ruas_medidas": len(ruas), "radares": len(radares)},
        "cenario": cenario,
        "fonte": fonte(cenario),
        "horas": list(HORAS),
        "peoes_hora": peoes,
        "veiculos_hora": veiculos,
        "acima_limite": acima,
        "espera_s": espera,
        "travessia_mediana_s": round(trav_med, 1),
        "travessia_p90_s": round(trav_p90, 1),
        "fluidez": fluidez,
        "velocidade_kmh": velocidade,
        "nivel_transito": nivel,
        "niveis_transito": NIVEIS_TRANSITO,
        "passadeiras_sem_dados_recentes": parados,
        "notas": {
            "espera_s": "Espera média medida por hora; o modelo de chuva não a altera. Nulo quando não houve esperas medidas nessa hora.",
            "travessia": "Mediana e P90 da semana inteira: não há série por hora.",
            "velocidade_kmh": "Só radares (velocidade livre x fluidez). Nulo se a zona não tem radar.",
            "fluidez": "Velocidade face à velocidade livre da própria rua (1 = sem abrandamento).",
            "veiculos_hora": "Média por segmento de rua medido junto às passadeiras da zona.",
        },
    }


def _media(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


@lru_cache(maxsize=None)
def relacoes_zona(zona_id: str, cenario: str) -> dict:
    """Duas associações por hora (não são causalidade): estacionamento x peões e trânsito x velocidade."""
    p = perfil_zona(zona_id, cenario)
    est = estacionamento()
    monit = est["lugares"] - est["sem_informacao"]
    dia = range(7, 22)  # horas de atividade
    occ = {h: est["ocupados"][h] / monit for h in dia}
    # três grupos com o mesmo número de horas, da menos para a mais ocupada
    ordem = sorted(dia, key=lambda h: occ[h])
    k = len(ordem) // 3
    grupos = [sorted(ordem[:k]), sorted(ordem[k : 2 * k]), sorted(ordem[2 * k :])]
    nomes = ["Pouco ocupado", "Meio ocupado", "Muito ocupado"]
    est_peoes = [
        {
            "grupo": nomes[i],
            "ocupacao_de": round(min(occ[h] for h in g), 2),
            "ocupacao_ate": round(max(occ[h] for h in g), 2),
            "horas": g,
            "peoes_hora": _r(_media([p["peoes_hora"][h] for h in g]), 0),
        }
        for i, g in enumerate(grupos)
    ]
    usa_kmh = any(v is not None for v in p["velocidade_kmh"])
    serie = p["velocidade_kmh"] if usa_kmh else [None if f is None else f * 100 for f in p["fluidez"]]
    transito = [
        {
            "nivel": NIVEIS_TRANSITO[i],
            "horas": [h for h in HORAS if p["nivel_transito"][h] == i],
            "valor": _r(_media([serie[h] for h in HORAS if p["nivel_transito"][h] == i]), 0 if not usa_kmh else 1),
        }
        for i in range(3)
    ]
    return {
        "zona": p["zona"],
        "cenario": cenario,
        "estacionamento_vs_peoes": {
            "grupos": est_peoes,
            "nota": "Horas das 7h às 21h em três grupos iguais, pela ocupação do estacionamento monitorizado na cidade. Associação, não causalidade.",
        },
        "transito_vs_velocidade": {
            "unidade": "km/h" if usa_kmh else "% da velocidade livre",
            "grupos": transito,
            "nota": "As 24 horas agrupadas pelo nível de trânsito da zona.",
        },
    }


# ---------------------------------------------------------------- passadeiras

def metricas_passadeira(p: dict, h: int, cenario: str) -> dict:
    ped = p["peoes"][h] * fator_peoes(h, cenario)
    veh = p["veiculos"][h] * fator_veiculos(h, cenario)
    over = (p["acima_limite"][h] or 0) * fator_acima_limite(cenario)
    return {
        "id": p["id"],
        "rua": p["rua"],
        "zona": p["zona"],
        "hora": h,
        "cenario": cenario,
        "fonte": fonte(cenario),
        "limite_kmh": p["limite"],
        "peoes_hora": round(ped),
        "veiculos_hora": round(veh),
        "acima_do_limite": round(over, 3),
        "exposicao": round(ped * veh * over),
        "espera_s": p["espera"][h],
        "espera_p90_s": p["espera_p90"],
        "esperas_medidas": p["espera_medida"],
        "travessia_mediana_s": p["travessia_mediana"],
        "travessia_p90_s": p["travessia_p90"],
        "velocidade_p85_kmh": p["velocidade_p85"],
        "sensor": p["sensor"],
        "ultimo_dado": p["ultimo_dado"],
        "estado_sensor": "sem dados recentes" if D.sem_dados_recentes(p["ultimo_dado"]) else "ativo",
        "localizacao": {"lon": p["lon"], "lat": p["lat"], "x": p["x"], "y": p["y"], "posicao": p["posicao"]},
    }


def ngsi_passadeira(m: dict) -> dict:
    """A mesma métrica no formato de entidade NGSI-v2 (FIWARE)."""
    def n(v):
        return {"type": "Number", "value": v}

    return {
        "id": "SmartCrosswalk:" + m["id"],
        "type": "SmartCrosswalk",
        "address": {"type": "Text", "value": m["rua"]},
        "location": {"type": "geo:json", "value": {"type": "Point", "coordinates": [m["localizacao"]["lon"], m["localizacao"]["lat"]]}},
        "hour": n(m["hora"]),
        "scenario": {"type": "Text", "value": m["cenario"]},
        "pedestriansPerHour": n(m["peoes_hora"]),
        "vehiclesPerHour": n(m["veiculos_hora"]),
        "overSpeedLimitRatio": n(m["acima_do_limite"]),
        "exposure": n(m["exposicao"]),
        "waitTime": n(m["espera_s"]),
        "waitTimeP90": n(m["espera_p90_s"]),
        "crossingTimeMedian": n(m["travessia_mediana_s"]),
        "dateObserved": {"type": "DateTime", "value": m["ultimo_dado"].replace(" ", "T") + ":00Z"},
    }


# ---------------------------------------------------------------- ruas

def metricas_rua(r: dict, h: int, cenario: str, geometria: bool = False) -> dict:
    fl = fluidez_rua(r, h, cenario)
    out = {
        "id": r["id"],
        "rua": r["nome"],
        "sensor": r["sensor"],
        "limite_kmh": r["limite"],
        "veiculos_hora": round(r["veiculos"][h] * fator_veiculos(h, cenario)),
        "fluidez": fl,
        "nivel": None if fl is None else NIVEIS_FLUIDEZ[nivel_fluidez(fl)],
        # a velocidade absoluta só é fiável nos radares
        "velocidade_kmh": _r(r["velocidade_livre"] * fl) if fl is not None and r["sensor"] == "Radar" else None,
        "localizacao": {"lon": r["lon"], "lat": r["lat"], "x": r["x"], "y": r["y"]},
    }
    if geometria:
        out["d"] = r["d"]
    return out


# ---------------------------------------------------------------- a cidade inteira

@lru_cache(maxsize=None)
def metricas_cidade(cenario: str, dia: str) -> dict:
    """As métricas dos quatro verticais para a cidade inteira, hora a hora.

    São as mesmas contas dos endpoints de detalhe, somadas: quem só quer o retrato do dia pede isto.
    """
    lentas, moderadas, fluidas, veiculos, fluidez = [], [], [], [], []
    travessias, espera, acima = [], [], []
    for h in HORAS:
        niveis = [nivel_fluidez(fl) for r in D.RUAS if (fl := fluidez_rua(r, h, cenario)) is not None]
        fluidas.append(niveis.count(0))
        moderadas.append(niveis.count(1))
        lentas.append(niveis.count(2))
        veiculos.append(round(sum(r["veiculos"][h] for r in D.RUAS) * fator_veiculos(h, cenario)))
        fl = [(fluidez_rua(r, h, cenario), r["veiculos"][h] + 1) for r in D.RUAS if fluidez_rua(r, h, cenario) is not None]
        fluidez.append(_r(sum(f * w for f, w in fl) / sum(w for _, w in fl), 3) if fl else None)

        travessias.append(sum(round(p["peoes"][h] * fator_peoes(h, cenario)) for p in D.PASSADEIRAS))
        com = [(p["espera"][h], p["peoes"][h] + 0.01) for p in D.PASSADEIRAS if p["espera"][h] is not None]
        espera.append(_r(sum(e * w for e, w in com) / sum(w for _, w in com)) if com else None)
        ac = [(p["acima_limite"][h], p["veiculos"][h]) for p in D.PASSADEIRAS if p["acima_limite"][h] is not None]
        v_ac = sum(w for _, w in ac)
        acima.append(_r(sum(a * w for a, w in ac) / v_ac * fator_acima_limite(cenario), 3) if v_ac else None)

    est = estacionamento()
    monitorizados = est["lugares"] - est["sem_informacao"]
    locais = [{"id": l["id"], "nome": l["nome"], "presencas_hora": afluencia_local(l["id"], dia, cenario)} for l in D.REFERENCIAS["locais"]]
    return {
        "cenario": cenario,
        "fonte": fonte(cenario),
        "horas": list(HORAS),
        "mobilidade": {
            "ruas_medidas": len(D.RUAS),
            "veiculos_hora": veiculos,
            "fluidez_media": fluidez,
            "ruas_fluidas": fluidas,
            "ruas_moderadas": moderadas,
            "ruas_lentas": lentas,
            "detalhe": "/v1/segmentos?hora=",
            "nota": "Veículos contados nas ruas medidas. Fluidez: velocidade face à velocidade livre de cada rua, ponderada pelos veículos.",
        },
        "seguranca": {
            "passadeiras": len(D.PASSADEIRAS),
            "sem_dados_recentes": sum(1 for p in D.PASSADEIRAS if D.sem_dados_recentes(p["ultimo_dado"])),
            "travessias_hora": travessias,
            "espera_media_s": espera,
            "acima_limite": acima,
            "detalhe": "/v1/passadeiras?hora=",
            "nota": "Espera média ponderada pelos peões; o modelo de chuva não a altera. Acima do limite: fração dos veículos junto às passadeiras.",
        },
        "estacionamento": {
            "lugares": est["lugares"],
            "sem_informacao": est["sem_informacao"],
            "livres": est["livres"],
            "ocupados": est["ocupados"],
            "ocupacao": [round(o / monitorizados, 3) for o in est["ocupados"]],
            "fonte": est["fonte"],
            "detalhe": "/v1/estacionamento",
            "nota": "Dados medidos nos dias úteis; o modelo de chuva não os altera.",
        },
        "turismo": {
            "dia": dia,
            "presencas_hora": [sum(l["presencas_hora"][h] for l in locais) for h in HORAS],
            "locais": locais,
            "detalhe": "/v1/turismo/afluencia?dia=" + dia,
            "nota": "Conta presenças de peões nas zonas de cada local; a mesma pessoa pode ser contada mais do que uma vez.",
        },
    }
