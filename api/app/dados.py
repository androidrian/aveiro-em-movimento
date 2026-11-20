"""Carrega os agregados (uma semana de dados do ATCLL, 3 a 10 de novembro de 2026).

Os ficheiros em ``api/dados`` são agregados por hora e por local, já calculados.
Não há aqui dados em bruto nem identificadores pessoais.
"""
from __future__ import annotations

import json
from pathlib import Path

PASTA = Path(__file__).resolve().parent.parent / "dados"


def _ler(nome: str):
    return json.loads((PASTA / nome).read_text(encoding="utf-8"))


REDE = _ler("rede.json")
MAPA_BASE = _ler("mapa_base.json")
RUAS = _ler("ruas.json")
PASSADEIRAS = _ler("passadeiras.json")
ZONAS = _ler("zonas.json")
ESTACIONAMENTO = _ler("estacionamento.json")
TURISMO = _ler("turismo.json")
# Nomes e posições tirados das entidades de referência do dataset (scripts/extrair_referencias.py).
REFERENCIAS = _ler("referencias.json")

RUA = {r["id"]: r for r in RUAS}
PASSADEIRA = {p["id"]: p for p in PASSADEIRAS}
ZONA = {z["id"]: z for z in ZONAS}
ZONA_TURISTICA = {z["id"]: z for z in TURISMO}
LOCAL = {l["id"]: l for l in REFERENCIAS["locais"]}

# Modelo do cenário "dia de chuva" (simulado sobre o perfil real dos dias úteis).
CHUVA = REDE["RAIN"]

# Último dia com dados na semana analisada. Um sensor cujo último dado é
# anterior a este dia é tratado como "sem dados recentes".
ULTIMO_DIA = "2026-11-10"

PERIODO = "dias úteis de 3 a 10 de novembro de 2026"
CENARIOS = ("normal", "chuva")


# Ocupação do estacionamento por dia da semana (scripts/estacionamento_por_dia.py).
# A semana medida tem um dia de cada: a terça-feira junta a tarde de dia 3 com a manhã de dia 10.
ESTACIONAMENTO_DIAS = _ler("estacionamento_dias.json")
DIAS_SEMANA = {"segunda": "segunda-feira", "terca": "terça-feira", "quarta": "quarta-feira", "quinta": "quinta-feira", "sexta": "sexta-feira", "sabado": "sábado", "domingo": "domingo"}


def periodo_do_dia(dia: str) -> str:
    """O dia da semana e a data em que foi medido: "sábado, 7 de novembro de 2026"."""
    datas = " e ".join(str(int(d[8:])) for d in ESTACIONAMENTO_DIAS["datas"][dia])
    return "%s, %s de novembro de 2026" % (DIAS_SEMANA[dia], datas)


def sem_dados_recentes(ultimo_dado: str) -> bool:
    return ultimo_dado[:10] < ULTIMO_DIA
