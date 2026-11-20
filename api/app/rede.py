"""Rede de ruas e tempos de percurso.

O grafo vem da rede de referência do ATCLL. Cada aresta tem um segmento de rua,
e cada segmento tem (ou herda) um perfil de fluidez por hora medido pelos sensores.
O tempo de uma aresta = comprimento / (velocidade livre x fluidez) + atraso nos cruzamentos.
"""
from __future__ import annotations

import heapq
from functools import lru_cache

from . import dados as D

R = D.REDE
N = len(R["NX"])
M = len(R["EA"])
SEG = R["SEG"]  # 7 campos por segmento: nome, limite, fonte, perfil, contagem, peões, incidente
N_SEG = len(SEG) // 7
PROJ = R["proj"]

FONTES = [
    "Sensor nesta rua",
    "Sensor próximo, na mesma rua",
    "Estimativa: sensor a menos de 250 m",
    "Sem sensor: média da cidade",
]

# listas de adjacência e constantes por aresta
_grau = [0] * N
for _e in range(M):
    _grau[R["EA"][_e]] += 1
    _grau[R["EB"][_e]] += 1
ADJ: list[list[tuple[int, int]]] = [[] for _ in range(N)]
CRUZ = [0.0] * M  # nº de extremos que são cruzamentos (grau >= 3)
VLIVRE = [0.0] * M  # km/h sem trânsito
for _e in range(M):
    _a, _b = R["EA"][_e], R["EB"][_e]
    ADJ[_a].append((_b, _e))
    ADJ[_b].append((_a, _e))
    CRUZ[_e] = (1 if _grau[_a] >= 3 else 0) + (1 if _grau[_b] >= 3 else 0)
    VLIVRE[_e] = min(SEG[R["ES"][_e] * 7 + 1], 90) * 0.72


# ---------------------------------------------------------------- coordenadas

def para_mapa(lon: float, lat: float) -> tuple[float, float]:
    return PROJ["ax"] + PROJ["bx"] * lon, PROJ["ay"] + PROJ["by"] * lat


def para_wgs84(x: float, y: float) -> tuple[float, float]:
    return (x - PROJ["ax"]) / PROJ["bx"], (y - PROJ["ay"]) / PROJ["by"]


@lru_cache(maxsize=4096)
def no_mais_proximo(x: float, y: float) -> int:
    nx, ny = R["NX"], R["NY"]
    return min(range(N), key=lambda i: (nx[i] - x) ** 2 + (ny[i] - y) ** 2)


def ponto(lon: float, lat: float) -> dict:
    x, y = para_mapa(lon, lat)
    n = no_mais_proximo(round(x, 1), round(y, 1))
    return {"lon": lon, "lat": lat, "no": n, "x": R["NX"][n], "y": R["NY"][n]}


# ---------------------------------------------------------------- tempos

@lru_cache(maxsize=None)
def fluidez_segmentos(cenario: str, incidente: bool, h: int) -> tuple[float, ...]:
    chuva = cenario == "chuva"
    out = []
    for s in range(N_SEG):
        p = SEG[s * 7 + 3]
        if p >= 0:
            r = (R["RC"] if chuva else R["RN"])[p][h]
        else:
            r = R["CITY"][h] * (R["RAIN"]["speed"] if chuva else 1)
        if incidente and SEG[s * 7 + 6]:
            r *= R["INC"]["fator"]
        out.append(r)
    return tuple(out)


@lru_cache(maxsize=None)
def tempos_arestas(cenario: str, incidente: bool, h: int) -> tuple[float, ...]:
    """Segundos por aresta."""
    fl = fluidez_segmentos(cenario, incidente, h)
    es, el = R["ES"], R["EL"]
    return tuple(el[e] / (VLIVRE[e] * fl[es[e]] / 3.6) + 1.5 * CRUZ[e] / fl[es[e]] for e in range(M))


@lru_cache(maxsize=2048)
def caminhos(cenario: str, incidente: bool, h: int, origem: int):
    """Dijkstra a partir de um nó: (distâncias em segundos, aresta anterior, nó anterior)."""
    et = tempos_arestas(cenario, incidente, h)
    dist = [float("inf")] * N
    pe = [-1] * N
    pn = [-1] * N
    dist[origem] = 0.0
    fila = [(0.0, origem)]
    while fila:
        d, u = heapq.heappop(fila)
        if d > dist[u]:
            continue
        for w, e in ADJ[u]:
            nd = d + et[e]
            if nd < dist[w]:
                dist[w] = nd
                pe[w] = e
                pn[w] = u
                heapq.heappush(fila, (nd, w))
    return dist, pe, pn


def matriz(cenario: str, incidente: bool, h: int, nos: list[int]) -> list[list[float]]:
    """Minutos entre todos os pares de pontos."""
    out = []
    for a in nos:
        dist = caminhos(cenario, incidente, h, a)[0]
        out.append([round(dist[b] / 60, 2) for b in nos])
    return out


def percurso(cenario: str, incidente: bool, h: int, a: int, b: int) -> dict:
    """Caminho mais rápido de a para b, agrupado por rua, com as condições de cada troço."""
    dist, pe, pn = caminhos(cenario, incidente, h, a)
    et = tempos_arestas(cenario, incidente, h)
    fl = fluidez_segmentos(cenario, incidente, h)
    chuva = cenario == "chuva"
    arestas, u = [], b
    while u != a and pe[u] >= 0:
        arestas.append(pe[u])
        u = pn[u]
    arestas.reverse()

    nx, ny, names = R["NX"], R["NY"], R["NAMES"]
    cur = a
    pts = [(nx[a], ny[a])]
    grupos: list[dict] = []
    for e in arestas:
        cur = R["EB"][e] if R["EA"][e] == cur else R["EA"][e]
        pts.append((nx[cur], ny[cur]))
        sg = R["ES"][e]
        nm, comp = SEG[sg * 7], R["EL"][e]
        g = grupos[-1] if grupos else None
        if g is None or g["nm"] != nm:
            g = {"nm": nm, "n": 0, "m": 0.0, "s": 0.0, "rw": 0.0, "sg": [], "lim": SEG[sg * 7 + 1]}
            grupos.append(g)
        g["n"] += 1
        g["m"] += comp
        g["s"] += et[e]
        g["rw"] += comp * fl[sg]
        if sg not in g["sg"]:
            g["sg"].append(sg)

    # troços muito curtos juntam-se ao anterior, para a lista ficar legível
    juntos: list[dict] = []
    for g in grupos:
        p = juntos[-1] if juntos else None
        if p is not None and (g["m"] < 25 or p["nm"] == g["nm"]):
            p["n"] += g["n"]
            p["m"] += g["m"]
            p["s"] += g["s"]
            p["rw"] += g["rw"]
            for x in g["sg"]:
                if x not in p["sg"]:
                    p["sg"].append(x)
        else:
            juntos.append(g)

    q, tm, ts, ruas = 0, 0.0, 0.0, []
    for g in juntos:
        r = g["rw"] / g["m"] if g["m"] else 1.0
        i0, i1 = q, q + g["n"]
        q = i1
        d = "M%s,%s" % pts[i0] + "".join(" L%s,%s" % pts[k] for k in range(i0 + 1, i1 + 1))
        veh, ped, src, inc = -1, -1, 3, False
        for x in g["sg"]:
            v, p = SEG[x * 7 + 4], SEG[x * 7 + 5]
            if v >= 0:
                veh = max(veh, R["CNT"][v][h])
            if p >= 0:
                ped = max(ped, R["PED"][p][h])
            src = min(src, SEG[x * 7 + 2])
            if incidente and SEG[x * 7 + 6]:
                inc = True
        if chuva and veh >= 0:
            veh = round(veh * R["RAIN"]["veh"])
        if chuva and ped >= 0:
            ped = round(ped * (R["RAIN"]["ped_midday"] if 10 <= h <= 17 else R["RAIN"]["ped"]))
        tm += g["m"]
        ts += g["s"]
        na_avenida = names[g["nm"]] == R["INC"]["nome"]
        ruas.append(
            {
                "rua": names[g["nm"]],
                "metros": round(g["m"], 1),
                "segundos": round(g["s"], 1),
                "fluidez": round(r, 3),
                "nivel": 0 if r >= 0.85 else (1 if r >= 0.68 else 2),
                "velocidade_kmh": round(min(g["lim"], 90) * 0.72 * r),
                "limite_kmh": g["lim"],
                "veiculos_hora": None if veh < 0 else veh,
                "peoes_hora": None if ped < 0 else ped,
                "fonte": FONTES[src],
                "incidente": inc and na_avenida,
                "na_rua_do_incidente": na_avenida,
                "d": d,
            }
        )
    return {"hora": h, "metros": round(tm, 1), "segundos": round(ts, 1), "ruas": ruas}


def incidente_info() -> dict:
    i = R["INC"]
    lon, lat = para_wgs84(i["x"], i["y"])
    return {"rua": i["nome"], "fator_velocidade": i["fator"], "x": i["x"], "y": i["y"], "lon": round(lon, 6), "lat": round(lat, 6), "d": i["d"]}
