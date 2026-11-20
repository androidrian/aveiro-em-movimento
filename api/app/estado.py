"""Estado partilhado da API: cenário em vigor, eventos (SSE), webhooks e registo de pedidos."""
from __future__ import annotations

import asyncio
import json
import threading
import urllib.request
from collections import deque
from datetime import datetime, timezone

# Chaves de demonstração: uma por entidade. Numa versão real ficariam fora do código.
CHAVES = {
    "cma-painel-demo": {"entidade": "Câmara Municipal · Painel", "perfil": "plataforma"},
    "ria-express-demo": {"entidade": "Ria Express Entregas", "perfil": "transportadora"},
    "comercio-demo": {"entidade": "Associação Comercial de Aveiro", "perfil": "comércio"},
    "cidadaos-demo": {"entidade": "App Passadeiras Amigas", "perfil": "cidadãos"},
    "assistente-demo": {"entidade": "Assistente de IA (MCP)", "perfil": "assistente"},
}
ANONIMO = {"entidade": "Leitura pública (sem chave)", "perfil": "público"}


def agora() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


class Estado:
    def __init__(self) -> None:
        self.cenario = {"cenario": "normal", "incidente": False, "desde": agora(), "alterado_por": "arranque da API"}
        self.registo: deque = deque(maxlen=60)
        self.webhooks: list[dict] = []
        self._assinantes: set[asyncio.Queue] = set()
        self._seq = 0

    # ---- eventos em tempo real (Server-Sent Events)
    def assinar(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._assinantes.add(q)
        return q

    def cancelar(self, q: asyncio.Queue) -> None:
        self._assinantes.discard(q)

    def publicar(self, evento: str, dados: dict) -> None:
        for q in list(self._assinantes):
            try:
                q.put_nowait((evento, dados))
            except asyncio.QueueFull:
                pass

    # ---- cenário
    def mudar_cenario(self, cenario: str, incidente: bool, por: str) -> dict:
        self.cenario = {"cenario": cenario, "incidente": incidente, "desde": agora(), "alterado_por": por}
        corpo = {
            "evento": "cenario.alterado",
            **self.cenario,
            "afeta": ["/v1/rede/tempos-percurso", "/v1/rede/percurso", "/v1/segmentos", "/v1/passadeiras", "/v1/zonas"],
        }
        self.publicar("cenario.alterado", corpo)
        for w in self.webhooks:
            threading.Thread(target=_enviar_webhook, args=(w, corpo), daemon=True).start()
        return self.cenario

    # ---- registo de pedidos
    def registar(self, entidade: str, metodo: str, caminho: str, estado: int, ms: float) -> None:
        self._seq += 1
        linha = {"n": self._seq, "quando": agora(), "entidade": entidade, "pedido": metodo + " " + caminho, "estado": estado, "ms": round(ms, 1)}
        self.registo.appendleft(linha)
        self.publicar("pedido", linha)


def _enviar_webhook(w: dict, corpo: dict) -> None:
    try:
        req = urllib.request.Request(w["url"], data=json.dumps(corpo).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=3) as r:
            w["ultimo_envio"] = {"quando": agora(), "estado": r.status}
    except Exception as exc:  # o destinatário pode estar em baixo: fica registado, não interrompe a API
        w["ultimo_envio"] = {"quando": agora(), "erro": str(exc)[:120]}


ESTADO = Estado()
