"""Corrida del pipeline: `uv run python -m pipeline.run [--desde AAAA-MM-DD] [--force] [--liga]`.

Pasos (sección 8): fixture de la LNB → página de cada partido jugado → validación (modelos y
play-by-play contra box score) → archivos procesados en `data/processed/` → `data/last_run.json`
→ tablas de temporada (`pipeline.season`).

La carga en Supabase se suma cuando el dueño configure las claves (pendiente por decisión suya
del 3-nov-2026). Mientras tanto la salida queda en CSV locales, que no se versionan: son datos
derivados de un tercero (regla 4).

Si un partido no pasa la validación del play-by-play, su box score se publica igual (pasó sus
propios controles) pero sus jugadas van a cuarentena con el motivo, y sus tácticas quedan `n/d`.
Si lo único que no cierra son las faltas, las jugadas se usan y solo las tácticas de faltas y
bonus quedan `n/d` (ver `FOUL_STATS` en pipeline/pbp.py).
"""

from __future__ import annotations

import argparse
import csv
import json
import time
import uuid
from datetime import UTC, date, datetime
from pathlib import Path

from pipeline import season
from pipeline.pbp import validate
from sources import lnb, wikipedia
from sources.http_client import PoliteClient

ROOT = Path(__file__).resolve().parent.parent
PROCESSED_DIR = ROOT / "data" / "processed"
QUARANTINE_DIR = ROOT / "data" / "quarantine"
LAST_RUN_PATH = ROOT / "data" / "last_run.json"
SEASON_START = date(2026, 9, 1)  # temporada 2026-27 de la LNB; el fixture devuelve vacío antes del inicio

STAT_FIELDS = [
    "seconds", "pts", "fg2m", "fg2a", "fg3m", "fg3a", "ftm", "fta", "orb", "drb", "ast", "stl", "tov",
    "blk", "blk_against", "pf", "pf_drawn", "efficiency", "plus_minus",
]  # fmt: skip


def _write_csv(name: str, rows: list[dict[str, object]]) -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    path = PROCESSED_DIR / f"{name}.csv"
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def collect(game: lnb.FixtureGame, match: lnb.MatchData, tables: dict[str, list[dict[str, object]]], *,
            pbp_ok: bool, fouls_ok: bool) -> None:  # fmt: skip
    """Pasa un partido validado a filas planas, una lista por tabla de `core`."""
    gid = game.source_game_id
    tables["game"].append(
        {
            "source_game_id": gid,
            "played_at": game.played_at.isoformat(),
            "home_team_id": match.home.team_id,
            "away_team_id": match.away.team_id,
            "home_name": match.home.name,
            "away_name": match.away.name,
            "home_points": match.home.totals.pts,
            "away_points": match.away.totals.pts,
            "overtime_periods": max(0, len(match.periods) - 4),
            "home_coach": match.home.coach,
            "away_coach": match.away.coach,
            "pbp_validated": pbp_ok,
            "pbp_fouls_validated": fouls_ok,
        }
    )
    for period in match.periods:
        tables["game_period_score"].append({"source_game_id": gid, **period.model_dump()})
    for team in (match.home, match.away):
        totals = team.totals.model_dump(include=set(STAT_FIELDS) - {"seconds", "plus_minus"})
        tables["team_game_stats"].append({"source_game_id": gid, "team_id": team.team_id, **totals})
        for line in team.players:
            tables["player_game_stats"].append(
                {
                    "source_game_id": gid,
                    "team_id": team.team_id,
                    "source_player_id": line.source_player_id,
                    "name": line.name,
                    "shirt_number": line.shirt_number,
                    "started": line.started,
                    **line.model_dump(include=set(STAT_FIELDS)),
                }
            )
    for shot in match.shots:
        tables["shot"].append({"source_game_id": gid, **shot.model_dump()})
    if pbp_ok:  # el play-by-play que no cierra con el box score no alimenta ninguna táctica
        for event in match.events:
            tables["play_by_play_event"].append({"source_game_id": gid, **event.model_dump()})


def run(*, start: date, end: date, force: bool, whole_league: bool) -> dict[str, object]:
    started = time.monotonic()
    summary: dict[str, object] = {
        "run_id": str(uuid.uuid4()),
        "started_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "source": lnb.SOURCE,
        "window": [start.isoformat(), end.isoformat()],
        "scope": "liga" if whole_league else "boca",
    }
    tables: dict[str, list[dict[str, object]]] = {
        name: [] for name in ("game", "game_period_score", "team_game_stats", "player_game_stats", "shot",
                              "play_by_play_event")
    }  # fmt: skip
    published, quarantined, failed, hashes = [], [], [], []
    with PoliteClient(source=lnb.SOURCE) as client:
        played = [g for g in lnb.fetch_fixture(client, start, end) if g.is_played]
        # Resultados de toda la liga: alimentan tabla, pitagórico, Elo y SRS sin pedir más páginas.
        tables["league_result"] = [
            {
                "source_game_id": g.source_game_id,
                "played_at": g.played_at.isoformat(),
                "home_team_id": g.home_team_id,
                "away_team_id": g.away_team_id,
                "home_name": g.home_name,
                "away_name": g.away_name,
                "home_points": g.home_points,
                "away_points": g.away_points,
            }
            for g in played
        ]
        games = [g for g in played if whole_league or g.is_boca]
        for game in games:
            label = f"{game.played_at.date()} {game.home_route}-vs-{game.away_route}"
            try:
                result = client.get(game.url, use_cache=not force)
                match = lnb.parse_match(result.text())
                hashes.append(result.sha256)
            except lnb.ParseError as exc:
                # La página entera no se pudo leer: nada de este partido se carga.
                failed.append({"game": label, "reason": str(exc)})
                continue
            check = validate(match)
            if check.critical or check.fouls:
                # Queda el detalle para auditar; con solo faltas el play-by-play igual se usa.
                QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)
                path = QUARANTINE_DIR / f"{game.played_at.date()}_{game.home_route}-vs-{game.away_route}.json"
                path.write_text(
                    json.dumps({"game": label, "sha256": result.sha256, "critical": check.critical,
                                "fouls": check.fouls}, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )  # fmt: skip
            if check.pbp_ok:
                published.append({"game": label, "fouls_validated": check.fouls_ok})
            else:
                quarantined.append({"game": label, "problems": len(check.critical)})
            collect(game, match, tables, pbp_ok=check.pbp_ok, fouls_ok=check.fouls_ok)

    # Plantel con posición, edad, altura y peso (Wikipedia, API oficial). Si falla, se sigue sin él.
    try:
        with PoliteClient(source=wikipedia.SOURCE) as wiki:
            roster, roster_sha = wikipedia.fetch_roster(wiki)
        tables["roster"] = [r.model_dump(mode="json") for r in roster]
        hashes.append(roster_sha)
    except Exception as exc:
        failed.append({"game": "wikipedia: plantel", "reason": f"{type(exc).__name__}: {exc}"[:300]})
        tables["roster"] = []

    for name, rows in tables.items():
        _write_csv(name, rows)
    summary.update(
        {
            "finished_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "duration_s": round(time.monotonic() - started),
            "games_loaded": len(tables["game"]),
            "pbp_validated": published,
            "pbp_quarantined": quarantined,
            "failed": failed,
            "rows": {name: len(rows) for name, rows in tables.items()},
            "input_hashes": hashes,
            "status": "error" if failed and not tables["game"] else ("parcial" if failed else "ok"),
        }
    )
    LAST_RUN_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Pipeline de Pelotheta Θ (básquet)")
    parser.add_argument("--desde", type=date.fromisoformat, default=SEASON_START)
    parser.add_argument("--hasta", type=date.fromisoformat, default=date.today())
    parser.add_argument(
        "--force", action="store_true", help="vuelve a pedir las páginas aunque estén en caché"
    )
    parser.add_argument(
        "--liga", action="store_true", help="todos los partidos de la liga, no solo los de Boca"
    )
    args = parser.parse_args()
    summary = run(start=args.desde, end=args.hasta, force=args.force, whole_league=args.liga)
    season.main()  # tablas de temporada (etapa 4) sobre lo que se acaba de procesar
    print(json.dumps({k: summary[k] for k in ("status", "games_loaded", "pbp_quarantined", "failed", "rows")},
                     ensure_ascii=False, indent=2))  # fmt: skip


if __name__ == "__main__":
    main()
