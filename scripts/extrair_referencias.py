"""Extrai do dataset do ATCLL os nomes e as posições que faltam aos agregados.

Escreve ``api/dados/referencias.json`` com:
- postes de estacionamento: centro dos lugares de cada poste e a rua mais próxima;
- locais turísticos: zonas com o mesmo nome juntas, centro e permanência mediana.

Uso (na pasta aveiro-em-movimento):
    python -I scripts/extrair_referencias.py <pasta datasets> api/dados/referencias.json

Só lê; não altera os agregados existentes. Não guarda dados por pessoa nem por veículo.
"""
import csv
import json
import math
import statistics
import sys
from collections import defaultdict
from pathlib import Path

PASTA = Path(sys.argv[1])
SAIDA = Path(sys.argv[2])
csv.field_size_limit(10_000_000)

# O poste 0022 fica entre duas ruas com o mesmo traçado no dataset; usa-se o nome por que o sítio é conhecido.
NOMES_POSTES = {"0022": "Cais da Fonte Nova"}
IDS_LOCAIS = {
    "Rossio": "rossio",
    "Saída de Moliceiros": "moliceiros",
    "Fórum": "forum",
    "Av. Lourenço Peixinho": "lourenco-peixinho",
    "Ria de Aveiro": "ria",
    "Estação de Comboios": "estacao",
}

KX = 111320 * math.cos(math.radians(40.64))  # metros por grau de longitude, à latitude de Aveiro
KY = 110540


def num(v):
    if isinstance(v, dict):
        for k in ("$numberDouble", "$numberInt", "$numberLong"):
            if k in v:
                return float(v[k])
    return float(v)


def curto(urn):
    return urn.rsplit(":", 1)[-1]


def dist_ao_troco(p, a, b):
    px, py, ax, ay, bx, by = p[0] * KX, p[1] * KY, a[0] * KX, a[1] * KY, b[0] * KX, b[1] * KY
    dx, dy = bx - ax, by - ay
    comp = dx * dx + dy * dy
    t = 0 if comp == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / comp))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def ler(nome):
    with open(PASTA / nome, encoding="utf-8", newline="") as f:
        yield from csv.DictReader(f)


# ---- ruas de referência
ruas = []
for r in ler("reference-entities/RoadSegment.csv"):
    nome = r["name"]
    if not nome or nome.startswith("["):
        continue
    ruas.append((nome, json.loads(r["location"])["coordinates"]))


def rua_mais_proxima(p):
    return min(((dist_ao_troco(p, a, b), nome) for nome, coords in ruas for a, b in zip(coords, coords[1:])))[1]


# ---- estacionamento: centro dos lugares de cada poste
lugares = defaultdict(dict)
for r in ler("smartparking.csv"):
    d = json.loads(r["documentJson"])
    poste, lugar = curto(d.get("refDevice", "?")), curto(d["entityId"])
    if lugar not in lugares[poste] and d.get("location"):
        c = d["location"]["coordinates"]
        lugares[poste][lugar] = (num(c[0]), num(c[1]))

postes = {}
for poste, pts in sorted(lugares.items()):
    lon = statistics.mean(p[0] for p in pts.values())
    lat = statistics.mean(p[1] for p in pts.values())
    postes[poste] = {"nome": NOMES_POSTES.get(poste) or rua_mais_proxima((lon, lat)), "lon": round(lon, 6), "lat": round(lat, 6), "lugares": len(pts)}

# ---- turismo: zonas com o mesmo nome formam um local
zonas = {}
for r in ler("reference-entities/TouristZone.csv"):
    anel = json.loads(r["location"])["coordinates"][0]
    zonas[curto(r["entityId"])] = {"nome": r["name"], "lon": statistics.mean(p[0] for p in anel), "lat": statistics.mean(p[1] for p in anel)}

permanencia = defaultdict(list)
for r in ler("touriststats_visits.csv"):
    d = json.loads(r["documentJson"])
    if d.get("dwellTime") is not None:
        permanencia[curto(d.get("refZone", "?"))].append(num(d["dwellTime"]))

locais = []
for nome, lid in IDS_LOCAIS.items():
    ids = sorted(z for z, v in zonas.items() if v["nome"] == nome)
    tempos = [t for z in ids for t in permanencia[z]]
    locais.append(
        {
            "id": lid,
            "nome": nome,
            "zonas": ids,
            "lon": round(statistics.mean(zonas[z]["lon"] for z in ids), 6),
            "lat": round(statistics.mean(zonas[z]["lat"] for z in ids), 6),
            "visitas_semana": len(tempos),
            "permanencia_mediana_s": round(statistics.median(tempos), 1) if tempos else None,
        }
    )

sem_local = sorted(z for z, v in zonas.items() if v["nome"] not in IDS_LOCAIS)
if sem_local:
    sys.exit("Zonas turísticas sem local atribuído: " + ", ".join(sem_local))

SAIDA.write_text(json.dumps({"postes": postes, "locais": locais}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(len(postes), "postes;", len(locais), "locais")
