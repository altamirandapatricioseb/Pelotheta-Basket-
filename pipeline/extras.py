"""Estadísticas que faltaban del inventario (5.1 a 5.7), calculadas con datos ya cargados.

Lo llama `pipeline.season` al final y agrega columnas a sus tablas (player_season, boca_game,
boca_season y league_table). Todo sale de contadores crudos; lo que no se puede calcular queda None.
"""

from __future__ import annotations

import itertools
import statistics
from collections import defaultdict
from datetime import date
from typing import Any

from pipeline import metrics as m
from sources.lnb import BOCA_TEAM_ID

BOCA = str(BOCA_TEAM_ID)
LEADER_MIN_GAMES = 3  # para el ranking de la liga (5.3): con menos partidos no entra
AGE_BANDS = [
    ("min_share_age_21", 0, 21),
    ("min_share_age_22_26", 22, 26),
    ("min_share_age_27_31", 27, 31),
    ("min_share_age_32", 32, 99),
]


def _date(game: dict[str, str]) -> date:
    return date.fromisoformat(game["played_at"][:10])


def player_extras(
    players: list[dict[str, Any]], player_rows: list[dict[str, str]], game_rows: list[dict[str, str]]
) -> None:
    """Totales de tiro, faltas recibidas, suplencias, por 100 posesiones, carga de minutos y rachas."""
    dates = {g["source_game_id"]: _date(g) for g in game_rows}
    lines: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in player_rows:
        if row["team_id"] == BOCA and int(row["seconds"]) > 0:
            lines[row["source_player_id"]].append(row)
    last_game = max(
        (dates[gid] for gid in {r["source_game_id"] for r in player_rows if r["team_id"] == BOCA}),
        default=None,
    )
    for p in players:
        own = sorted(lines.get(p["source_player_id"], []), key=lambda r: dates[r["source_game_id"]])
        total = {
            k: sum(int(r[k]) for r in own) for k in ("fg2m", "fg2a", "fg3m", "fg3a", "ftm", "fta", "pf_drawn")
        }
        p.update(total)
        p["fgm"], p["fga"] = total["fg2m"] + total["fg3m"], total["fg2a"] + total["fg3a"]
        p["bench_games"] = p["games"] - p["starts"]
        p["fpg"] = m.ratio(p["pf"], p["games"])
        poss = p.get("possessions_on")
        p["pts_per100"] = m.ratio(100 * p["pts"], poss) if poss else None
        p["trb_per100"] = m.ratio(100 * p["trb"], poss) if poss else None
        p["ast_per100"] = m.ratio(100 * p["ast"], poss) if poss else None
        # Carga de minutos en ventanas móviles hasta el último partido de Boca (5.6).
        played = [(dates[r["source_game_id"]].isoformat(), int(r["seconds"]) / 60) for r in own]
        for days in (7, 14, 28):
            p[f"minutes_last_{days}d"] = (
                round(m_minutes_window(played, days, last_game), 1) if last_game else None
            )
        # Rachas (5.7): doble-doble y 40 % o más en triples (con al menos 3 intentos).
        dd = [
            m.double_count(
                int(r["pts"]), int(r["orb"]) + int(r["drb"]), int(r["ast"]), int(r["stl"]), int(r["blk"])
            )
            >= 2
            for r in own
        ]
        hot3 = [int(r["fg3a"]) >= 3 and int(r["fg3m"]) / int(r["fg3a"]) >= 0.4 for r in own]
        p["streak_double_double"] = m.longest_streak(dd)
        p["streak_three_40"] = m.longest_streak(hot3)


def m_minutes_window(played: list[tuple[str, float]], days: int, as_of: date) -> float:
    """Minutos jugados en los últimos `days` días hasta `as_of` incluido."""
    return sum(mins for d, mins in played if 0 <= (as_of - date.fromisoformat(d)).days < days)


def league_ranks(players: list[dict[str, Any]], league_rows: list[dict[str, Any]]) -> None:
    """Puesto de cada jugador de Boca entre todos los de la liga (líderes, 5.3)."""
    pool = [r for r in league_rows if r["games"] >= LEADER_MIN_GAMES]
    for stat, rank_id in (
        ("ppg", "rank_ppg"),
        ("rpg", "rank_rpg"),
        ("apg", "rank_apg"),
        ("per", "rank_per"),
        ("spg", "rank_spg"),
        ("bpg", "rank_bpg"),
    ):
        values = sorted((r[stat] for r in pool if r.get(stat) is not None), reverse=True)
        for p in players:
            v = p.get(stat)
            p[rank_id] = (
                (sum(x > v for x in values) + 1) if v is not None and p["games"] >= LEADER_MIN_GAMES else None
            )
    for p in players:
        p["league_players_ranked"] = len(pool)


def _totals(prefix: str, t: dict[str, float]) -> dict[str, float]:
    """Totales de tiro y de rebote de un equipo en un partido, con el prefijo team_ o rival_."""
    fgm, fga = t["fg2m"] + t["fg3m"], t["fg2a"] + t["fg3a"]
    return {
        f"{prefix}_fgm": fgm,
        f"{prefix}_fga": fga,
        f"{prefix}_fg2m": t["fg2m"],
        f"{prefix}_fg2a": t["fg2a"],
        f"{prefix}_fg3m": t["fg3m"],
        f"{prefix}_fg3a": t["fg3a"],
        f"{prefix}_ftm": t["ftm"],
        f"{prefix}_fta": t["fta"],
        f"{prefix}_trb": t["orb"] + t["drb"],
        # Numeradores y denominadores: con ellos un rival, un mes o la temporada se calculan
        # sumando partidos (suma sobre suma), no promediando porcentajes.
        f"{prefix}_efg_num": fgm + 0.5 * t["fg3m"],
        f"{prefix}_ts_den": 2 * (fga + m.FTA_WEIGHT * t["fta"]),
        f"{prefix}_tov_den": fga + m.FTA_WEIGHT * t["fta"] + t["tov"],
    }


def game_extras(
    games: list[dict[str, Any]], team_rows: list[dict[str, str]], periods: list[dict[str, str]] | None = None
) -> None:
    """Partido a partido: totales de los dos equipos, márgenes, cuartos, FTr, DRB%, sorpresa y forma."""
    by_game: dict[str, dict[str, dict[str, float]]] = defaultdict(dict)
    for row in team_rows:
        by_game[row["source_game_id"]][row["team_id"]] = {
            k: float(v) for k, v in row.items() if k not in ("source_game_id", "team_id") and v
        }
    nr_history: list[float] = []
    for g in games:
        teams = by_game.get(g["source_game_id"], {})
        own = teams.get(BOCA)
        rival = next((t for tid, t in teams.items() if tid != BOCA), None)
        if own and rival:
            fga = own["fg2a"] + own["fg3a"]
            g.update(
                {
                    "team_fga": fga,
                    "team_fg3a": own["fg3a"],
                    "team_fta": own["fta"],
                    "team_orb": own["orb"],
                    "team_drb": own["drb"],
                    "team_ast": own["ast"],
                    "team_stl": own["stl"],
                    "team_blk": own["blk"],
                    "team_tov": own["tov"],
                    "team_pf": own["pf"],
                    "team_ftr": m.ft_rate(own["fta"], fga),
                    "team_drb_pct": m.ratio(own["drb"], own["drb"] + rival["orb"]),
                    # Posesiones extra (5.7): (ORB + robos − pérdidas) propios menos los del rival.
                    "extra_possessions": (own["orb"] + own["stl"] - own["tov"])
                    - (rival["orb"] + rival["stl"] - rival["tov"]),
                    **_totals("team", own),
                    **_totals("rival", rival),
                    "rival_orb": rival["orb"],
                    "rival_drb": rival["drb"],
                    "rival_ast": rival["ast"],
                    "rival_stl": rival["stl"],
                    "rival_blk": rival["blk"],
                    "rival_tov": rival["tov"],
                    "rival_pf": rival["pf"],
                    "orb_chances": own["orb"] + rival["drb"],
                    "drb_chances": own["drb"] + rival["orb"],
                    "team_fg_pct": m.ratio(own["fg2m"] + own["fg3m"], fga),
                    "team_fg3_pct": m.ratio(own["fg3m"], own["fg3a"]),
                    "team_ft_pct": m.ratio(own["ftm"], own["fta"]),
                    "rival_fg3_pct": m.ratio(rival["fg3m"], rival["fg3a"]),
                    "reb_margin": own["orb"] + own["drb"] - rival["orb"] - rival["drb"],
                    "tov_margin": rival["tov"] - own["tov"],
                    "ast_margin": own["ast"] - rival["ast"],
                    "team_ast_fgm": m.ratio(own["ast"], own["fg2m"] + own["fg3m"]),
                }
            )
        if g.get("points_for") is not None and g.get("points_against") is not None:
            g["net_points"] = g["points_for"] - g["points_against"]
            g["won"] = int(g["points_for"] > g["points_against"])
        if g.get("elo_win_prob") is not None:
            g["surprise"] = float(g["won"]) - g["elo_win_prob"]  # > 0 ganó más de lo esperado
        recent = nr_history[-5:]
        g["net_rating_vs_last5"] = (
            g["net_rating"] - statistics.fmean(recent) if recent and g.get("net_rating") is not None else None
        )
        if g.get("net_rating") is not None:
            nr_history.append(g["net_rating"])
    # Parciales (5.2): diferencia de Boca en cada cuarto y en cada mitad del partido.
    home_of = {g["source_game_id"]: g["home"] for g in games}
    for p in periods or []:
        gid, q = p["source_game_id"], int(p["period"])
        game = next((g for g in games if g["source_game_id"] == gid), None)
        if game is None or q > 4:
            continue
        d = int(p["home_points"]) - int(p["away_points"])
        d = d if home_of[gid] else -d
        game[f"q{q}_diff"] = d
        half = "h1_diff" if q <= 2 else "h2_diff"
        game[half] = game.get(half, 0) + d


def season_extras(
    season: dict[str, Any],
    games: list[dict[str, Any]],
    periods: list[dict[str, str]],
    game_rows: list[dict[str, str]],
    table: list[dict[str, Any]],
    players: list[dict[str, Any]],
    player_rows: list[dict[str, str]],
    league_games: list[Any],
) -> None:
    """Temporada de Boca: cuartos, forma, nivel de rival, cobertura, estabilidad y edades."""
    home_of = {g["source_game_id"]: g["home_team_id"] == BOCA for g in game_rows}
    # Rendimiento por cuarto (5.2): diferencia de puntos promedio en cada cuarto.
    diffs: dict[int, list[int]] = defaultdict(list)
    for p in periods:
        gid = p["source_game_id"]
        if gid in {g["source_game_id"] for g in games} and int(p["period"]) <= 4:
            d = int(p["home_points"]) - int(p["away_points"])
            diffs[int(p["period"])].append(d if home_of[gid] else -d)
    for q in range(1, 5):
        season[f"q{q}_diff"] = round(statistics.fmean(diffs[q]), 2) if diffs[q] else None
    # Forma reciente (5.3): últimos 5.
    last5 = games[-5:]
    season["last5_wins"] = sum(g["won"] for g in last5)
    season["last5_net_rating"] = round(statistics.fmean(g["net_rating"] for g in last5), 2) if last5 else None
    # Rendimiento por nivel de rival (5.7): tercio alto, medio y bajo de la tabla.
    position = {r["team"]: r["position"] for r in table}
    n = len(table)
    thirds: dict[str, list[float]] = defaultdict(list)
    for g in games:
        pos = position.get(g["opponent"])
        if pos is not None and g.get("net_rating") is not None:
            third = "top" if pos <= n / 3 else "mid" if pos <= 2 * n / 3 else "bottom"
            thirds[third].append(g["net_rating"])
    for third in ("top", "mid", "bottom"):
        season[f"net_rating_vs_{third}"] = (
            round(statistics.fmean(thirds[third]), 2) if thirds[third] else None
        )
    # Cobertura de datos (5.7): partidos de Boca con box score y con play-by-play validado.
    boca_games = [g for g in game_rows if BOCA in (g["home_team_id"], g["away_team_id"])]
    played_boca = sum(
        1 for x in league_games if BOCA in (x.home, x.away)
    )  # partidos jugados según el fixture
    season["coverage_box_score"] = m.ratio(len(boca_games), played_boca or len(boca_games))
    season["coverage_pbp"] = m.ratio(
        sum(g.get("pbp_validated") == "True" for g in boca_games), len(boca_games)
    )
    # Estabilidad del quinteto titular (5.7): Jaccard entre partidos consecutivos.
    dates = {g["source_game_id"]: g["played_at"] for g in game_rows}
    starters: dict[str, set[str]] = defaultdict(set)
    for r in player_rows:
        if r["team_id"] == BOCA and r["started"] == "True":
            starters[r["source_game_id"]].add(r["source_player_id"])
    ordered = [starters[gid] for gid in sorted(starters, key=lambda g: dates.get(g, ""))]
    pairs = [m.jaccard(a, b) for a, b in itertools.pairwise(ordered)]
    season["starters_jaccard"] = round(statistics.fmean(pairs), 3) if pairs else None
    # Minutos por tramo de edad (5.7).
    total = sum(p["minutes"] for p in players if p.get("age") is not None)
    for key, low, high in AGE_BANDS:
        mins = sum(p["minutes"] for p in players if p.get("age") is not None and low <= int(p["age"]) <= high)
        season[key] = m.ratio(mins, total) if total else None


def home_advantage(table: list[dict[str, Any]], league_games: list[Any]) -> None:
    """Ventaja de localía de cada equipo de la liga (5.7): % de victorias de local menos de visitante."""
    acc: dict[str, dict[str, list[int]]] = defaultdict(lambda: {"home": [], "away": []})
    for g in league_games:
        home_won = g.home_points > g.away_points
        acc[g.home]["home"].append(int(home_won))
        acc[g.away]["away"].append(int(not home_won))
    for row in table:
        a = acc.get(row["team_id"], {"home": [], "away": []})
        home = statistics.fmean(a["home"]) if a["home"] else None
        away = statistics.fmean(a["away"]) if a["away"] else None
        row["home_win_pct"], row["away_win_pct"] = home, away
        row["home_advantage"] = round(home - away, 4) if home is not None and away is not None else None


# Zonas de tiro de la LNB (Z1 a Z14) agrupadas en cinco. La fuente no publica qué es cada código:
# el agrupamiento sale de las coordenadas y del acierto de cada zona en toda la liga (Z1 cerca del
# aro con 60 %, Z10 y Z14 en las esquinas, Z11 a Z13 arriba del arco). FRANJA son triples sobre la
# línea lateral y van con los frontales.
ZONES = {
    "Z1": "aro",
    "Z2": "pintura",
    "Z3": "pintura",
    "Z4": "pintura",
    "Z5": "media",
    "Z6": "media",
    "Z7": "media",
    "Z8": "media",
    "Z9": "media",
    "Z10": "esquina3",
    "Z14": "esquina3",
    "Z11": "frontal3",
    "Z12": "frontal3",
    "Z13": "frontal3",
    "FRANJA": "frontal3",
}
ZONE_NAMES = ("aro", "pintura", "media", "esquina3", "frontal3")


def zone_of(shot: dict[str, str]) -> str | None:
    """Zona agrupada de un tiro; un doble anotado en una zona de triple va a media distancia."""
    zone = ZONES.get((shot.get("zone") or "").split("-")[0])
    if zone in ("esquina3", "frontal3") and shot["shot_value"] == "2":
        return "media"
    return zone


def _zone_stats(shots: list[dict[str, str]]) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    total = len(shots)
    for zone in ZONE_NAMES:
        own = [s for s in shots if zone_of(s) == zone]
        out[f"{zone}_fga_share"] = m.ratio(len(own), total) if total else None
        out[f"{zone}_fg_pct"] = m.ratio(sum(s["made"] == "True" for s in own), len(own)) if own else None
    return out


def shot_zones(
    players: list[dict[str, Any]], games: list[dict[str, Any]], shots: list[dict[str, str]]
) -> None:
    """Reparto y acierto de tiro por zona (5.1): jugadores de Boca en la temporada y Boca por partido."""
    boca = [s for s in shots if s["team_id"] == BOCA]
    by_player: dict[str, list[dict[str, str]]] = defaultdict(list)
    by_game: dict[str, list[dict[str, str]]] = defaultdict(list)
    for s in boca:
        by_game[s["source_game_id"]].append(s)
        if s["source_player_id"]:
            by_player[s["source_player_id"]].append(s)
    for p in players:
        p.update(_zone_stats(by_player.get(p["source_player_id"], [])))
    for g in games:
        g.update({f"team_{k}": v for k, v in _zone_stats(by_game.get(g["source_game_id"], [])).items()})


def player_splits(
    players: list[dict[str, Any]], player_rows: list[dict[str, str]], games: list[dict[str, Any]]
) -> None:
    """Local y visitante, ganados y perdidos, forma de los últimos 5 y mejores partidos (5.3 y 5.7)."""
    info = {g["source_game_id"]: g for g in games}
    order = {g["source_game_id"]: i for i, g in enumerate(games)}
    lines: dict[str, list[dict[str, str]]] = defaultdict(list)
    for r in player_rows:
        if r["team_id"] == BOCA and int(r["seconds"]) > 0 and r["source_game_id"] in info:
            lines[r["source_player_id"]].append(r)

    def avg(rows: list[dict[str, str]], key: str) -> float | None:
        if not rows:
            return None
        if key == "trb":
            return statistics.fmean(int(r["orb"]) + int(r["drb"]) for r in rows)
        if key == "min":
            return statistics.fmean(int(r["seconds"]) / 60 for r in rows)
        return statistics.fmean(int(r[key]) for r in rows)

    for p in players:
        own = sorted(lines.get(p["source_player_id"], []), key=lambda r: order[r["source_game_id"]])
        home = [r for r in own if info[r["source_game_id"]]["home"]]
        away = [r for r in own if not info[r["source_game_id"]]["home"]]
        wins = [r for r in own if info[r["source_game_id"]]["won"]]
        losses = [r for r in own if not info[r["source_game_id"]]["won"]]
        last5 = own[-5:]
        p.update(
            {
                "ppg_home": avg(home, "pts"),
                "ppg_away": avg(away, "pts"),
                "ppg_wins": avg(wins, "pts"),
                "ppg_losses": avg(losses, "pts"),
                "pm_wins": avg(wins, "plus_minus"),
                "pm_losses": avg(losses, "plus_minus"),
                "ppg_last5": avg(last5, "pts"),
                "rpg_last5": avg(last5, "trb"),
                "apg_last5": avg(last5, "ast"),
                "mpg_last5": avg(last5, "min"),
                "max_pts": max((int(r["pts"]) for r in own), default=None),
                "max_trb": max((int(r["orb"]) + int(r["drb"]) for r in own), default=None),
                "max_ast": max((int(r["ast"]) for r in own), default=None),
                "max_efficiency": max((int(r["efficiency"]) for r in own), default=None),
                "pm_per_game": avg(own, "plus_minus"),
            }
        )
