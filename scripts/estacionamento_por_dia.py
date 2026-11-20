"""Ocupação do estacionamento por dia da semana e por hora, a partir dos eventos dos sensores.

O dataset tem uma semana (terça 3 de novembro, 14:09, a terça 10, 14:09): cada dia da semana
e hora foi medido uma vez. Cada evento diz que um lugar passou a "occupied" ou a "free"; a ocupação
de um poste numa hora é a fração do tempo em que os seus lugares estiveram ocupados.

Uso: python -I scripts/estacionamento_por_dia.py <datasets/smartparking.csv> <api/dados/estacionamento.json> <saída.json>

O segundo ficheiro (os agregados que a API já usa) serve só para conferir: o script diz a diferença
entre a média dos dias úteis que calcula e a que lá está.
"""
import csv
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone

DIAS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"]
HORA = 3600


def numero(v):
    return float(next(iter(v.values()))) if isinstance(v, dict) else float(v)


def ler(caminho):
    """Eventos por lugar, [(segundo, ocupado)], e o poste de cada lugar."""
    csv.field_size_limit(10_000_000)
    eventos, poste_de = defaultdict(list), {}
    with open(caminho, encoding="utf-8", newline="") as f:
        for linha in csv.DictReader(f):
            d = json.loads(linha["documentJson"])
            lugar = d["entityId"].rsplit(":", 1)[1]
            poste_de[lugar] = d["refDevice"].rsplit(":", 1)[1]
            eventos[lugar].append((numero(d["eventTimestamp"]["$date"]) / 1000, d["status"] == "occupied", numero(d.get("duration", 0))))
    return eventos, poste_de


def intervalos_ocupados(ev, inicio, fim):
    """Períodos em que o lugar esteve ocupado, dentro da semana medida."""
    ev.sort()
    out = []
    t0, ocupado0, duracao0 = ev[0]
    if not ocupado0 and duracao0 > 0:  # o primeiro evento é uma saída: o carro já lá estava
        out.append((max(inicio, t0 - duracao0), t0))
    for (t, ocupado, _), seguinte in zip(ev, ev[1:] + [(fim, False, 0)]):
        if ocupado and seguinte[0] > t:
            out.append((t, seguinte[0]))
    return out


def agregar(eventos, poste_de):
    inicio = min(e[0] for ev in eventos.values() for e in ev)
    fim = max(e[0] for ev in eventos.values() for e in ev)
    lugares = defaultdict(int)
    ocupado = defaultdict(float)  # (poste, dia, hora) -> segundos-lugar ocupados
    medido = defaultdict(float)  # (dia, hora) -> segundos medidos
    datas = defaultdict(set)

    def por_hora(a, b):
        """Parte o período [a, b] pelas horas do relógio (UTC = hora de Portugal em novembro)."""
        while a < b:
            proxima = min(b, (a // HORA + 1) * HORA)
            quando = datetime.fromtimestamp(a, timezone.utc)
            yield quando, proxima - a
            a = proxima

    for quando, s in por_hora(inicio, fim):
        medido[(DIAS[quando.weekday()], quando.hour)] += s
        datas[DIAS[quando.weekday()]].add(quando.strftime("%Y-%m-%d"))
    for lugar, ev in eventos.items():
        lugares[poste_de[lugar]] += 1
        for a, b in intervalos_ocupados(ev, inicio, fim):
            for quando, s in por_hora(a, b):
                ocupado[(poste_de[lugar], DIAS[quando.weekday()], quando.hour)] += s
    postes = {p: {d: [round(ocupado[(p, d, h)] / (medido[(d, h)] * n), 2) for h in range(24)] for d in DIAS} for p, n in sorted(lugares.items())}
    return postes, {d: sorted(datas[d]) for d in DIAS}


def conferir(postes, caminho_atual):
    """Diferença entre a média dos dias úteis calculada aqui e a que a API já usa."""
    pior = 0.0
    for e in json.load(open(caminho_atual, encoding="utf-8")):
        dias = postes[e["id"]]
        uteis = [sum(dias[d][h] for d in DIAS[:5]) / 5 for h in range(24)]
        dif_uteis = max(abs(a - b) for a, b in zip(uteis, e["ocupacao"]))
        dif_sabado = max(abs(a - b) for a, b in zip(dias["sabado"], e["ocupacao_sabado"]))
        pior = max(pior, dif_uteis, dif_sabado)
        print("poste %s: dias úteis ±%.2f, sábado ±%.2f" % (e["id"], dif_uteis, dif_sabado))
    return pior


if __name__ == "__main__":
    origem, atual, destino = sys.argv[1:4]
    postes, datas = agregar(*ler(origem))
    print("maior diferença face aos agregados atuais: %.2f" % conferir(postes, atual))
    with open(destino, "w", encoding="utf-8") as f:
        json.dump({"datas": datas, "postes": postes}, f, ensure_ascii=False, separators=(",", ":"))
    print("escrito", destino)
