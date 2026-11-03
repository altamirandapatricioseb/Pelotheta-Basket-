"""Armado del lote y carga en Supabase por la Data API (HTTPS).

Uso local: `uv run --env-file .env python -m pipeline.load` (después de `pipeline.run`).

Por qué por HTTPS y no con una conexión directa a Postgres: la conexión directa de Supabase es
solo IPv6 y GitHub Actions usa IPv4. La función `ingest.load_batch` (SQL escrito a mano en
supabase/migrations) recibe el lote completo y lo carga en una sola transacción.

La clave secreta viaja solo en el header `apikey`: nunca en la URL ni en los mensajes de error.
Mismo patrón que el proyecto de fútbol.
"""

from __future__ import annotations

import contextlib
import csv
import json
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from pipeline.season import PROCESSED, read
from sources.lnb import BOCA_TEAM_ID, SOURCE

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SUPABASE_URL_RE = re.compile(r"^https://[a-z0-9]{1,40}\.supabase\.co/?$")
TIMEOUT_SECONDS = 120.0
COMPETITION = {"code": "lnb", "name_es": "Liga Nacional de Básquet", "season": "2026-27"}
# Estadísticas que dependen de un modelo o de un supuesto: la web las marca como estimadas.
ESTIMATED = frozenset({
    "elo", "elo_win_prob", "brier", "brier_mean", "pyth_wins", "possessions_on", "ortg_on", "drtg_on",
    "net_rating_on", "net_rating_off", "on_off", "ewa", "ela", "rendimiento_indice", "possessions_pbp",
})  # fmt: skip


class LoadError(RuntimeError):
    """Falla de carga, con un mensaje que nunca incluye la clave."""


def _number(value: str | None) -> float | None:
    """Los CSV traen texto: '' es n/d; True/False no son valores de estadística."""
    if value in (None, "", "True", "False"):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def _rows(name: str, folder: Path) -> list[dict[str, str | None]]:
    """Filas de un CSV procesado con '' convertido a None: Postgres no castea '' a número."""
    return [{k: (v if v != "" else None) for k, v in row.items()} for row in read(name, folder)]


def _values(row: dict[str, Any], stat_ids: set[str]) -> dict[str, float | None]:
    return {k: _number(v) for k, v in row.items() if k in stat_ids}


def build_batch(folder: Path = PROCESSED, *, run_id: str, trigger: str, started_at: str) -> dict[str, Any]:
    """Lote con la forma que espera `ingest.load_batch` (ver su comentario en la migración)."""
    catalog = _csv(DATA / "stat_catalog.csv")
    stat_ids = {c["id"] for c in catalog}
    set_rows = _csv(DATA / "stat_sets.csv")
    games = read("game", folder)
    results = read("league_result", folder)
    lines = read("player_game_stats", folder)

    teams: dict[str, dict[str, Any]] = {}
    for r in results:
        for side in ("home", "away"):
            tid = r[f"{side}_team_id"]
            teams[tid] = {"source_id": tid, "name": r[f"{side}_name"], "is_boca": tid == str(BOCA_TEAM_ID)}
    overtime = {g["source_game_id"]: int(g["overtime_periods"]) for g in games}
    # Las jugadas dicen «local» o «visitante»: se traducen al id del equipo de ese partido.
    sides = {g["source_game_id"]: {"local": g["home_team_id"], "visitante": g["away_team_id"]} for g in games}

    stat_values: list[dict[str, Any]] = []
    for p in read("player_season", folder):
        for stat, value in _values(p, stat_ids).items():
            stat_values.append(
                {
                    "entity": "jugador",
                    "source_id": p["source_player_id"],
                    "stat_id": stat,
                    "value": value,
                    "is_estimated": stat in ESTIMATED,
                }
            )
    team_values: dict[tuple[str, str], float | None] = {}
    for t in read("league_table", folder):
        for stat, value in _values(t, stat_ids).items():
            team_values[(t["team_id"], stat)] = value
    for season_row in read("boca_season", folder):
        for stat, value in _values(season_row, stat_ids).items():
            team_values[(str(BOCA_TEAM_ID), stat)] = value
    stat_values += [
        {
            "entity": "equipo",
            "source_id": tid,
            "stat_id": stat,
            "value": value,
            "is_estimated": stat in ESTIMATED,
        }
        for (tid, stat), value in team_values.items()
    ]

    return {
        "source": SOURCE,
        "run_id": run_id,
        "trigger": trigger,
        "started_at": started_at,
        "competition": COMPETITION,
        "teams": list(teams.values()),
        "players": list(
            {
                ln["source_player_id"]: {"source_id": ln["source_player_id"], "name": ln["name"]}
                for ln in lines
            }.values()
        ),
        "games": [
            {
                "source_id": r["source_game_id"],
                "played_at": r["played_at"],
                "home": r["home_team_id"],
                "away": r["away_team_id"],
                "home_points": int(r["home_points"]),
                "away_points": int(r["away_points"]),
                "overtime_periods": overtime.get(r["source_game_id"], 0),
            }
            for r in results
        ],
        "detail_games": [g["source_game_id"] for g in games],
        "periods": _rows("game_period_score", folder),
        "player_lines": _rows("player_game_stats", folder),
        "team_lines": _rows("team_game_stats", folder),
        "events": [
            {**e, "team_id": sides.get(e["source_game_id"] or "", {}).get(e["side"] or "")}
            for e in _rows("play_by_play_event", folder)
            if e["period"]  # inicio y fin de período no tienen reloj
        ],
        "shots": _rows("shot", folder),
        "catalog": catalog,
        "sets": [{k: s[k] for k in ("set_id", "entity", "scope", "name_es", "sort_order")} for s in set_rows],
        "set_items": [
            {"set_id": s["set_id"], "stat_id": stat, "sort_order": i}
            for s in set_rows
            for i, stat in enumerate(s["stats"].split(), start=1)
        ],
        "stat_values": stat_values,
        "game_derived": [
            {"source_game_id": g["source_game_id"], "stats": _values(g, stat_ids)}
            for g in read("boca_game", folder)
        ],
        "lineups": [
            {
                "lineup_key": q["lineup_key"],
                "players": q["players"],
                "small_sample": q["small_sample"] == "True",
                "stats": _values(q, stat_ids),
            }
            for q in read("boca_lineup", folder)
        ],
        "log": {"status": "ok", "message": None},
    }


def check_batch(batch: dict[str, Any]) -> None:
    """Controles antes de mandar (14.4): nada se carga a medias ni con referencias rotas."""
    stat_ids = {c["id"] for c in batch["catalog"]}
    missing = {i["stat_id"] for i in batch["set_items"]} - stat_ids
    if missing:
        raise LoadError(f"Conjuntos con estadísticas que no están en el catálogo: {sorted(missing)}")
    game_ids = {g["source_id"] for g in batch["games"]}
    if not set(batch["detail_games"]) <= game_ids:
        raise LoadError("Hay partidos con box score que no están en los resultados de la liga")
    if not batch["player_lines"]:
        raise LoadError("El lote no trae box scores: no se carga nada")


def _check_target(url: str, key: str) -> None:
    if not SUPABASE_URL_RE.match(url):
        raise LoadError("SUPABASE_URL no tiene la forma https://<ref>.supabase.co")
    if not key.startswith("sb_secret_"):
        raise LoadError("La carga necesita la clave secreta (sb_secret_...), no la publicable")


def rpc(
    function: str, payload: dict[str, Any], url: str, key: str, client: httpx.Client | None = None
) -> Any:
    _check_target(url, key)
    own_client = client is None
    http = client or httpx.Client(timeout=TIMEOUT_SECONDS)
    try:
        response = http.post(
            f"{url.rstrip('/')}/rest/v1/rpc/{function}",
            content=json.dumps(payload, ensure_ascii=False),
            headers={"apikey": key, "Content-Profile": "ingest", "Content-Type": "application/json"},
        )
    except httpx.HTTPError as exc:
        raise LoadError(f"No se pudo conectar con Supabase ({type(exc).__name__})") from None
    finally:
        if own_client:
            http.close()
    if response.status_code >= 400:
        # El cuerpo de error de PostgREST trae el mensaje de SQL: útil y sin secretos.
        raise LoadError(f"Supabase respondió {response.status_code}: {response.text[:300]}")
    return response.json() if response.content else None


def load(*, run_id: str, trigger: str, started_at: str, client: httpx.Client | None = None) -> Any:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    batch = build_batch(run_id=run_id, trigger=trigger, started_at=started_at)
    check_batch(batch)
    try:
        return rpc("load_batch", {"p_batch": batch}, url, key, client)
    except LoadError as exc:
        # Se intenta dejar el fallo registrado para la Interfaz 6; si tampoco se puede, se propaga igual.
        with contextlib.suppress(LoadError):
            rpc(
                "log_failure",
                {"p_run_id": run_id, "p_source": SOURCE, "p_trigger": trigger, "p_message": str(exc)},
                url,
                key,
                client,
            )
        raise


def revalidate_site(client: httpx.Client | None = None) -> str:
    """Pide a la web que descarte su caché de datos (8.9). Sin SITE_URL o sin secreto, no hace nada.

    Un fallo acá no invalida la carga (los datos ya están en la base): la web los muestra igual
    cuando vence su caché de 6 horas.
    """
    site = os.environ.get("SITE_URL", "").strip().rstrip("/")
    secret = os.environ.get("REVALIDATE_SECRET", "").strip()
    if not site.startswith("https://") or not secret:
        return "omitida (faltan SITE_URL o REVALIDATE_SECRET)"
    own_client = client is None
    http = client or httpx.Client(timeout=30.0)
    try:
        response = http.post(f"{site}/api/revalidar", headers={"x-revalidate-secret": secret})
    except httpx.HTTPError as exc:
        return f"falló ({type(exc).__name__})"
    finally:
        if own_client:
            http.close()
    return "ok" if response.status_code == 200 else f"falló (HTTP {response.status_code})"


def main() -> None:
    last_run = json.loads((DATA / "last_run.json").read_text(encoding="utf-8"))
    trigger = "schedule" if os.environ.get("GITHUB_EVENT_NAME") == "schedule" else "manual"
    started = last_run.get("started_at") or datetime.now(UTC).isoformat(timespec="seconds")
    result = load(run_id=last_run["run_id"], trigger=trigger, started_at=started)
    print(json.dumps({**result, "revalidacion_web": revalidate_site()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
