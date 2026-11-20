"""Paso de modelos del pipeline: Valor, Alternativas (K-means) y Predictor de partidos.

Corre después de `pipeline.load`, con los CSV de `data/processed/` de la misma corrida:
1. Arma a todos los jugadores de la liga desde el box score de cada partido (la LNB publica los dos
   equipos): partidos, minutos, totales y edad (ficha oficial). Valores de mercado, si hay, del CSV
   manual `data/manual/market_values.csv`.
2. Suma resultados de temporadas pasadas y de otras ligas de la zona (API-Basketball, si hay clave).
3. Calcula en Python (`pipeline.stats`, sin dependencias nuevas) y reemplaza los resultados del
   equipo con `ingest.load_models` en una sola transacción. La base traduce los ids de la LNB.

Cada tabla lleva `team_slug` (el de web/config/teams.ts): otro equipo se suma en `TEAMS`.
Uso: `uv run --env-file .env python -m pipeline.analytics [--dry-run]`.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import os
import re
import sys
import unicodedata
from collections.abc import Sequence
from datetime import date
from pathlib import Path
from typing import Any

from pipeline import load, market_value, match_predictor, similarity
from pipeline.match_predictor import Result, norm
from pipeline.season import PROCESSED, read
from sources import api_basketball
from sources.http_client import FetchError, PoliteClient, RetryableFetchError
from sources.lnb import BOCA_TEAM_ID

ROOT = Path(__file__).resolve().parent.parent
VALUES_CSV = ROOT / "data" / "manual" / "market_values.csv"
# Equipos con datos: slug del selector → nombre e id de equipo en la LNB.
TEAMS: dict[str, dict[str, str]] = {"boca-juniors": {"name": "Boca Juniors", "team_id": str(BOCA_TEAM_ID)}}
STAT_KEYS = (
    "pts",
    "fg2m",
    "fg2a",
    "fg3m",
    "fg3a",
    "ftm",
    "fta",
    "orb",
    "drb",
    "ast",
    "stl",
    "tov",
    "blk",
    "pf",
    "pf_drawn",
    "efficiency",
    "plus_minus",
)


def pretty_person(name: str) -> str:
    """«STENTA, NICOLAS» → «Nicolas Stenta»; «WHITFIELD, R.» → «R. Whitfield»."""
    last, _, first = html.unescape(name).partition(",")  # la ficha de la LNB trae entidades («Mat&#xcd;as»)
    full = f"{first.strip()} {last.strip()}".strip() if first else last.strip()
    return " ".join(w.capitalize() if len(w) > 2 or not w.endswith(".") else w.upper() for w in full.split())


def pretty_team(name: str) -> str:
    """«GIMNASIA (CR)» → «Gimnasia (CR)»: palabras con mayúscula inicial, siglas entre paréntesis."""
    out = re.sub(r"\b(\w)(\w*)", lambda m: m.group(1).upper() + m.group(2).lower(), name)
    return re.sub(r"\(([^)]*)\)", lambda m: f"({m.group(1).upper()})", out)


def _age(birth: str | None, today: date) -> int | None:
    try:
        born = date.fromisoformat(str(birth)[:10])
    except ValueError:
        return None
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def league_players(folder: Path, today: date) -> list[dict[str, Any]]:
    """Todos los jugadores de la liga con sus totales de temporada (box score de cada partido)."""
    games = {g["source_game_id"]: g for g in read("game", folder)}
    team_name: dict[str, str] = {}
    for g in games.values():
        team_name[str(g["home_team_id"])] = pretty_team(str(g["home_name"]))
        team_name[str(g["away_team_id"])] = pretty_team(str(g["away_name"]))
    bios = {b["source_player_id"]: b for b in read("player_bio", folder)}
    positions = {p["source_player_id"]: p.get("position") for p in read("player_season", folder)}
    acc: dict[str, dict[str, Any]] = {}
    for ln in sorted(
        read("player_game_stats", folder),
        key=lambda r: str(games.get(r["source_game_id"], {}).get("played_at", "")),
    ):
        pid = str(ln["source_player_id"])
        p = acc.setdefault(
            pid,
            {
                "source_player_id": pid,
                "box_name": ln["name"],
                "games": 0,
                "starts": 0,
                "seconds": 0.0,
                "stats": dict.fromkeys(STAT_KEYS, 0.0),
            },
        )
        p["team_id"] = str(ln["team_id"])  # el último equipo, si cambió en la temporada
        seconds = float(ln["seconds"] or 0)
        if seconds <= 0:
            continue
        p["games"] += 1
        p["starts"] += str(ln["started"]) == "True"
        p["seconds"] += seconds
        for k in STAT_KEYS:
            p["stats"][k] += float(ln[k] or 0)
    out = []
    for pid, p in acc.items():
        bio = bios.get(pid) or {}
        out.append(
            {
                **p,
                "name": pretty_person(str(bio.get("full_name") or p["box_name"])),
                "team": team_name.get(p["team_id"], p["team_id"]),
                "minutes": round(p["seconds"] / 60, 1),
                "age": _age(bio.get("birth_date"), today),
                "position": positions.get(pid) or None,
            }
        )
    return out


def manual_values(players: Sequence[dict[str, Any]], warnings: list[str]) -> dict[str, float]:
    """Valores de `data/manual/market_values.csv` (jugador, valor_usd, fecha, fuente, url) por id LNB.

    El jugador se busca por nombre (como lo muestra la web o como figura en el box score). Una fila
    con error se avisa y se saltea: no corta la carga.
    """
    if not VALUES_CSV.exists():
        return {}
    keys = {}
    for p in players:
        for n in (p["name"], p["box_name"]):
            keys.setdefault(norm(n), p["source_player_id"])
    out: dict[str, float] = {}
    with VALUES_CSV.open(encoding="utf-8-sig", newline="") as fh:
        for line, row in enumerate(csv.DictReader(fh), start=2):
            pid = keys.get(norm(row.get("jugador") or ""))
            try:
                value = float(row.get("valor_usd") or "")
            except ValueError:
                value = 0.0
            if pid is None or not 0 < value <= 50_000_000:
                warnings.append(f"market_values.csv línea {line}: jugador o valor inválido")
                continue
            out[pid] = value
    return out


def lnb_results(folder: Path) -> list[Result]:
    return [
        Result(
            str(r["played_at"])[:10],
            pretty_team(str(r["home_name"])),
            pretty_team(str(r["away_name"])),
            int(r["home_points"]),
            int(r["away_points"]),
        )
        for r in read("league_result", folder)
        if r.get("home_points") not in (None, "")
    ]


_STOP = {"club", "de", "del", "la", "el", "y", "atletico", "deportivo", "cd", "ca"}


def _tokens(name: str) -> set[str]:
    plain = (
        unicodedata.normalize("NFKD", re.sub(r"\(.*?\)", "", name)).encode("ascii", "ignore").decode().lower()
    )
    return {t for t in re.split(r"[^a-z0-9]+", plain) if t and t not in _STOP}


def align_names(past: Sequence[Result], current: Sequence[Result]) -> list[Result]:
    """Pone a los clubes de la LNB de temporadas pasadas (API-Basketball) con el nombre de la LNB.

    shortcut: coincide si todas las palabras del nombre de la LNB (sin la sigla entre paréntesis) están
    en el de la API y el candidato es único; si no, queda con su nombre. Sumar alias si hace falta.
    """
    names = {n for r in current for n in (r.home, r.away)}

    def fix(name: str) -> str:
        hits = [n for n in names if _tokens(n) and _tokens(n) <= _tokens(name)]
        return hits[0] if len(hits) == 1 else name

    return [
        Result(r.date, fix(r.home), fix(r.away), r.home_points, r.away_points, r.league, r.neutral)
        if r.league == match_predictor.LEAGUE_CODE
        else r
        for r in past
    ]


def compute(
    players: Sequence[dict[str, Any]],
    results: Sequence[Result],
    boxes: Sequence[match_predictor.Box],
    team_slug: str,
    values: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Lote de `ingest.load_models` para un equipo."""
    team = TEAMS[team_slug]
    values = values or {}
    rows = [{**p, "value": values.get(p["source_player_id"])} for p in players]
    own = [p for p in rows if p["team_id"] == team["team_id"]]
    others = [p for p in rows if p["team_id"] != team["team_id"]]
    mv = market_value.fit(rows, team_slug, team["team_id"])
    alt = similarity.fit(own, others, team_slug)
    # En los resultados el club figura con el nombre de la LNB («Boca»), que sale del box score.
    lnb_name = next((p["team"] for p in own), team["name"])
    mp = match_predictor.run(results, boxes, lnb_name, team_slug, api_basketball.ZONE)
    return {
        "team_slug": team_slug,
        "runs": [mv["run"], alt["run"], mp["run"]],
        "market_predictions": mv["predictions"],
        "market_coefs": mv["coefs"],
        "styles": alt["styles"],
        "alternatives": alt["alternatives"],
        "match_predictions": mp["predictions"],
        "strengths": mp["strengths"],
        "tests": mp["tests"],
    }


def run(folder: Path = PROCESSED, dry_run: bool = False) -> dict[str, Any]:
    warnings: list[str] = []
    today = date.today()
    players = league_players(folder, today)
    current = lnb_results(folder)
    boxes = match_predictor.box_rows(read("game", folder), read("team_game_stats", folder))
    try:
        with PoliteClient(source=api_basketball.SOURCE) as client:
            past = api_basketball.fetch(client, match_predictor.MAX_SEASONS - 1, warnings)
    except (FetchError, RetryableFetchError, OSError, ValueError) as exc:
        warnings.append(f"API-Basketball no disponible: {exc}"[:200])
        past = []
    results = [*current, *align_names(past, current)]
    values = manual_values(players, warnings)
    summary: dict[str, Any] = {
        "jugadores_liga": len(players),
        "partidos_lnb": len(current),
        "partidos_otras_fuentes": len(past),
        "valores_cargados": len(values),
    }
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    for team_slug in TEAMS:
        payload = compute(players, results, boxes, team_slug, values)
        summary[team_slug] = {r["model"]: f"{r['status']} (n = {r['n']})" for r in payload["runs"]}
        if not dry_run:
            summary[f"{team_slug}_filas"] = load.rpc("load_models", {"p_payload": payload}, url, key)
    if not dry_run:
        summary["revalidacion_web"] = load.revalidate_site()  # la web deja de mostrar los modelos viejos
    if warnings:
        summary["avisos"] = warnings
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Modelos: Valor, Alternativas y Predictor")
    parser.add_argument("--dry-run", action="store_true", help="calcula sin cargar nada")
    args = parser.parse_args(argv)
    try:
        print(json.dumps(run(dry_run=args.dry_run), ensure_ascii=False, default=str))
    except load.LoadError as exc:
        print(f"Modelos: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
