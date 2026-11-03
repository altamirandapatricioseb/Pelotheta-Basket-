"""Pruebas de las tablas de temporada (pipeline/season.py) con dos partidos armados a mano."""

from __future__ import annotations

import pytest

from pipeline import metrics as m
from pipeline import season
from sources.lnb import BOCA_TEAM_ID

BOCA, RIVAL = str(BOCA_TEAM_ID), "2"


def _team(
    gid: str,
    team: str,
    pts: int,
    fg2: tuple[int, int],
    fg3: tuple[int, int],
    ft: tuple[int, int],
    orb: int,
    drb: int,
    tov: int,
) -> dict[str, str]:
    row = {
        "source_game_id": gid,
        "team_id": team,
        "pts": pts,
        "fg2m": fg2[0],
        "fg2a": fg2[1],
        "fg3m": fg3[0],
        "fg3a": fg3[1],
        "ftm": ft[0],
        "fta": ft[1],
        "orb": orb,
        "drb": drb,
        "ast": 15,
        "stl": 5,
        "tov": tov,
        "blk": 2,
        "blk_against": 1,
        "pf": 18,
        "pf_drawn": 18,
        "efficiency": 80,
    }
    return {k: str(v) for k, v in row.items()}


GAMES = [
    {
        "source_game_id": "g1",
        "played_at": "2026-10-01T21:00:00-03:00",
        "home_team_id": BOCA,
        "away_team_id": RIVAL,
        "home_name": "BOCA",
        "away_name": "RIVAL",
        "overtime_periods": "0",
    },
    {
        "source_game_id": "g2",
        "played_at": "2026-10-05T21:00:00-03:00",
        "home_team_id": RIVAL,
        "away_team_id": BOCA,
        "home_name": "RIVAL",
        "away_name": "BOCA",
        "overtime_periods": "1",
    },
]
TEAMS = [
    _team("g1", BOCA, 80, (25, 50), (8, 25), (6, 8), 10, 30, 12),
    _team("g1", RIVAL, 70, (20, 45), (8, 30), (6, 10), 9, 28, 14),
    _team("g2", RIVAL, 90, (30, 55), (8, 22), (6, 6), 11, 27, 10),
    _team("g2", BOCA, 85, (28, 52), (7, 24), (8, 10), 12, 26, 13),
]
RESULTS = [
    {**g, "home_points": h, "away_points": a} for g, (h, a) in zip(GAMES, ((80, 70), (90, 85)), strict=True)
]


def test_tabla_de_la_liga() -> None:
    table, x, games = season.league([{k: str(v) for k, v in r.items()} for r in RESULTS])
    boca = next(r for r in table if r["is_boca"])
    assert (boca["played"], boca["wins"], boca["losses"]) == (2, 1, 1)
    assert boca["mov"] == pytest.approx(2.5)
    assert boca["srs"] == pytest.approx(boca["mov"] + boca["sos"])  # SRS = MOV + SOS
    assert len(games) == 2 and 5 <= x <= 25


def test_temporada_de_boca_suma_posesiones() -> None:
    table, x, league_games = season.league([{k: str(v) for k, v in r.items()} for r in RESULTS])
    games = season.boca_games(GAMES, TEAMS, league_games)
    assert [g["won"] for g in games] == [True, False]
    poss = [g["possessions"] for g in games]
    summary = season.boca_season(games, table, x)
    assert summary["ortg"] == pytest.approx(100 * (80 + 85) / sum(poss), abs=1e-3)
    assert summary["net_rating"] == pytest.approx(100 * (165 - 160) / sum(poss), abs=1e-3)
    # El segundo partido tuvo suplementario: el ritmo se mide cada 40 minutos sobre 45 jugados.
    assert games[1]["pace"] == pytest.approx(m.pace(games[1]["possessions"], 45), abs=1e-3)
    assert games[0]["elo_win_prob"] == pytest.approx(
        m.elo_expected(1500, 1500, m.ELO_HOME_ADVANTAGE), abs=1e-4
    )


def test_jugador_usa_solo_sus_partidos() -> None:
    line = {
        "source_game_id": "g1",
        "team_id": BOCA,
        "source_player_id": "7",
        "name": "SIETE, J.",
        "started": "True",
        "seconds": str(20 * 60),
        "pts": "20",
        "fg2m": "7",
        "fg2a": "12",
        "fg3m": "2",
        "fg3a": "5",
        "ftm": "0",
        "fta": "0",
        "orb": "2",
        "drb": "8",
        "ast": "4",
        "stl": "1",
        "tov": "2",
        "blk": "0",
        "pf": "3",
        "efficiency": "25",
        "plus_minus": "6",
    }
    bench = {**line, "source_game_id": "g2", "seconds": "0", "started": "False"}  # no entró en el segundo
    [row] = season.player_season([line, bench], TEAMS, GAMES)
    assert (row["games"], row["minutes"], row["pts"]) == (1, 20.0, 20)
    # USG% con los totales de Boca solo del partido g1 (FGA 75, FTA 8, TOV 12) y MinEq/5 = 40.
    expected = m.usg_pct(17, 0, 2, 20, 40, 75, 8, 12)
    assert row["usg_pct"] == pytest.approx(expected, abs=1e-3)
    assert row["double_doubles"] == 1
    assert row["pts_per36"] == pytest.approx(36.0)
