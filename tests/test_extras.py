"""Pruebas de las estadísticas agregadas en pipeline/extras.py con casos armados a mano."""

from __future__ import annotations

from typing import Any

from pipeline import extras
from sources.lnb import BOCA_TEAM_ID

BOCA = str(BOCA_TEAM_ID)
BOX = {"fg2m": 20, "fg2a": 40, "fg3m": 10, "fg3a": 30, "ftm": 15, "fta": 20, "orb": 10, "drb": 25,
       "ast": 18, "stl": 6, "blk": 3, "tov": 12, "pf": 20}  # fmt: skip


def test_zonas_agrupadas() -> None:
    assert extras.zone_of({"zone": "Z1-IZ", "shot_value": "2"}) == "aro"
    assert extras.zone_of({"zone": "Z14-DE", "shot_value": "3"}) == "esquina3"
    assert extras.zone_of({"zone": "Z12", "shot_value": "2"}) == "media"  # doble con el pie en la línea
    assert extras.zone_of({"zone": "", "shot_value": "2"}) is None


def test_partido_trae_totales_de_los_dos_y_parciales() -> None:
    rival = {**BOX, "fg3m": 5, "orb": 8, "drb": 20, "tov": 15}
    team_rows = [
        {"source_game_id": "g1", "team_id": BOCA, **{k: str(v) for k, v in BOX.items()}},
        {"source_game_id": "g1", "team_id": "9", **{k: str(v) for k, v in rival.items()}},
    ]
    games: list[dict[str, Any]] = [
        {"source_game_id": "g1", "home": False, "points_for": 85, "points_against": 80, "net_rating": 5.0}
    ]
    periods = [
        {"source_game_id": "g1", "period": str(q), "home_points": str(h), "away_points": str(a)}
        for q, h, a in ((1, 20, 25), (2, 22, 20), (3, 18, 18), (4, 20, 22), (5, 0, 0))
    ]
    extras.game_extras(games, team_rows, periods)
    g = games[0]
    assert g["team_fgm"] == 30 and g["team_efg_num"] == 35  # 30 + 0,5 × 10
    assert g["rival_trb"] == 28 and g["reb_margin"] == 7 and g["tov_margin"] == 3
    # Boca es visitante: la diferencia del cuarto se da vuelta. El suplementario no cuenta.
    assert (g["q1_diff"], g["q2_diff"], g["q4_diff"]) == (5, -2, 2)
    assert (g["h1_diff"], g["h2_diff"]) == (3, 2)
    assert g["won"] == 1 and g["net_points"] == 5


def test_splits_de_jugador() -> None:
    games: list[dict[str, Any]] = [
        {"source_game_id": "a", "home": True, "won": 1},
        {"source_game_id": "b", "home": False, "won": 0},
    ]
    line = {"team_id": BOCA, "source_player_id": "7", "orb": "1", "drb": "4", "ast": "3", "efficiency": "10"}
    rows = [
        {**line, "source_game_id": "a", "seconds": "1200", "pts": "20", "plus_minus": "8"},
        {**line, "source_game_id": "b", "seconds": "600", "pts": "10", "plus_minus": "-4"},
    ]
    players: list[dict[str, Any]] = [{"source_player_id": "7"}]
    extras.player_splits(players, rows, games)
    p = players[0]
    assert (p["ppg_home"], p["ppg_away"], p["ppg_wins"], p["ppg_losses"]) == (20, 10, 20, 10)
    assert p["max_pts"] == 20 and p["mpg_last5"] == 15 and p["pm_per_game"] == 2
