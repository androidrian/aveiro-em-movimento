#!/usr/bin/env bash
# Arranca a API (que também serve o painel e o planeador).
# O ambiente Python fica fora da pasta do projeto, em ~/.cache/aveiro-em-movimento/venv.
set -e
RAIZ="$(cd "$(dirname "$0")" && pwd)"
VENV="${XDG_CACHE_HOME:-$HOME/.cache}/aveiro-em-movimento/venv"
[ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
"$VENV/bin/python" -m pip install -q --disable-pip-version-check -r "$RAIZ/api/requirements.txt"
echo "Abrir http://localhost:8000/   (Ctrl+C para parar)"
cd "$RAIZ/api"
exec "$VENV/bin/python" -m uvicorn app.main:app --port 8000
