"""Estadísticas de temporada (etapa 4): `uv run python -m pipeline.season`.

Lee los CSV que deja `pipeline.run` en data/processed/ y escribe, en la misma carpeta:
- league_table.csv: tabla de la liga con pitagórico calibrado, SRS, SOS, GB y Elo.
- boca_game.csv: cada partido de Boca con posesiones, ratings, cuatro factores y Elo previo.
- boca_season.csv: la temporada de Boca en una fila.
- player_season.csv: cada jugador de Boca con totales y estadísticas calculadas (5.6).

Todo sale de contadores crudos con las fórmulas de pipeline/metrics.py (regla 8). Lo que no se
puede calcular queda vacío (n/d), nunca estimado sin marcarlo.
"""

from __future__ import annotations

import csv
import json
import statistics
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

from pipeline import extras
from pipeline import metrics as m
from pipeline import own_metrics as own
from sources.lnb import BOCA_TEAM_ID
from sources.wikipedia import ZONE

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "data" / "processed"


def read(name: str, folder: Path = PROCESSED) -> list[dict[str, str]]:
    path = folder / f"{name}.csv"
    if not path.exists() or path.stat().st_size == 0:
        return []
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def write(name: str, rows: list[dict[str, Any]], folder: Path = PROCESSED) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / f"{name}.csv").open("w", encoding="utf-8", newline="") as fh:
        if rows:
            writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)


def r4(value: float | None) -> float | None:
    return None if value is None else round(value, 4)


# --- Liga ------------------------------------------------------------------------------------


def league(results: list[dict[str, str]]) -> tuple[list[dict[str, Any]], float, list[m.Game]]:
    games = [
        m.Game(
            r["played_at"], r["home_team_id"], r["away_team_id"], int(r["home_points"]), int(r["away_points"])
        )
        for r in results
    ]
    names = {r["home_team_id"]: r["home_name"] for r in results} | {
        r["away_team_id"]: r["away_name"] for r in results
    }
    acc: dict[str, dict[str, int]] = defaultdict(lambda: {"w": 0, "l": 0, "pf": 0, "pa": 0})
    for g in games:
        home_won = g.home_points > g.away_points
        for team, pf, pa, won in (
            (g.home, g.home_points, g.away_points, home_won),
            (g.away, g.away_points, g.home_points, not home_won),
        ):
            acc[team]["w" if won else "l"] += 1
            acc[team]["pf"] += pf
            acc[team]["pa"] += pa
    x = m.calibrate_pythagorean(m.TableRow(a["w"] + a["l"], a["w"], a["pf"], a["pa"]) for a in acc.values())
    srs = m.srs(games) if games else {}
    _, elo = m.elo_run(games)
    rows: list[dict[str, Any]] = []
    leader = max(acc.values(), key=lambda a: (a["w"] - a["l"], a["w"]), default={"w": 0, "l": 0})
    for team, a in acc.items():
        played = a["w"] + a["l"]
        mov = (a["pf"] - a["pa"]) / played
        pyth_w = played * m.pythagorean_share(a["pf"], a["pa"], x)
        rows.append(
            {
                "team_id": team,
                "team": names[team],
                "is_boca": team == str(BOCA_TEAM_ID),
                "played": played,
                "wins": a["w"],
                "losses": a["l"],
                "win_pct": r4(a["w"] / played),
                "points_for_pg": r4(a["pf"] / played),
                "points_against_pg": r4(a["pa"] / played),
                "mov": r4(mov),
                "pyth_wins": r4(pyth_w),
                "pyth_losses": r4(played - pyth_w),
                "srs": r4(srs.get(team)),
                "sos": r4(srs[team] - mov) if team in srs else None,
                "gb": m.games_behind(a["w"], a["l"], leader["w"], leader["l"]),
                "elo": round(elo.get(team, m.ELO_START), 1),
            }
        )
    rows.sort(key=lambda r: (-r["win_pct"], -r["mov"]))
    for position, row in enumerate(rows, start=1):
        row["position"] = position
    return rows, x, games


# --- Boca, partido a partido -------------------------------------------------------------------


Pair = tuple[dict[str, float], dict[str, float]]


def _pairs(team_rows: list[dict[str, str]]) -> dict[tuple[str, str], Pair]:
    """Por (partido, equipo): (totales del equipo, totales del rival), con FG y FGA desde 2P y 3P."""
    by_game: dict[str, dict[str, dict[str, float]]] = defaultdict(dict)
    for row in team_rows:
        t = {
            k: float(v)
            for k, v in row.items()
            if k not in ("source_game_id", "team_id") and v not in ("", None)
        }
        t["fg"], t["fga"] = t["fg2m"] + t["fg3m"], t["fg2a"] + t["fg3a"]
        by_game[row["source_game_id"]][row["team_id"]] = t
    out = {}
    for gid, teams in by_game.items():
        if len(teams) == 2:
            (a, ta), (b, tb) = teams.items()
            out[(gid, a)], out[(gid, b)] = (ta, tb), (tb, ta)
    return out


def _sides(team_rows: list[dict[str, str]]) -> dict[str, Pair]:
    """Por partido de Boca: (totales de Boca, totales del rival)."""
    return {gid: pair for (gid, tid), pair in _pairs(team_rows).items() if tid == str(BOCA_TEAM_ID)}


def _plays(t: dict[str, float]) -> tuple[float, float, float, float]:
    return t["fga"], t["fta"], t["orb"], t["tov"]


def boca_games(
    game_rows: list[dict[str, str]], team_rows: list[dict[str, str]], league_games: list[m.Game]
) -> list[dict[str, Any]]:
    sides = _sides(team_rows)
    # Elo previo a cada partido de Boca: se busca por fecha y equipos en la corrida de toda la liga.
    ordered = sorted(league_games, key=lambda g: g.date)
    before, _ = m.elo_run(ordered)
    elo_before = {(g.date, g.home, g.away): b for g, b in zip(ordered, before, strict=True)}
    rows = []
    # Descanso de Boca: solo sus partidos (game_rows trae toda la liga desde que se baja con --liga).
    boca_id = str(BOCA_TEAM_ID)
    dates = sorted(g["played_at"] for g in game_rows if boca_id in (g["home_team_id"], g["away_team_id"]))
    rest = dict(zip(dates, m.rest_days([d[:10] for d in dates]), strict=True))
    for g in sorted(game_rows, key=lambda r: r["played_at"]):
        if g["source_game_id"] not in sides:
            continue
        boca, rival = sides[g["source_game_id"]]
        home = g["home_team_id"] == str(BOCA_TEAM_ID)
        team_minutes = 40 + 5 * int(g["overtime_periods"])
        poss = m.possessions(_plays(boca), _plays(rival))
        elo = elo_before.get((g["played_at"], g["home_team_id"], g["away_team_id"]))
        win_prob = None
        if elo is not None:
            home_prob = m.elo_expected(elo[0], elo[1], m.ELO_HOME_ADVANTAGE)
            win_prob = home_prob if home else 1 - home_prob
        won = boca["pts"] > rival["pts"]
        rows.append(
            {
                "source_game_id": g["source_game_id"],
                "played_at": g["played_at"],
                "home": home,
                "opponent": g["away_name"] if home else g["home_name"],
                "points_for": int(boca["pts"]),
                "points_against": int(rival["pts"]),
                "won": won,
                "rest_days": rest[g["played_at"]],
                "possessions": r4(poss),
                "pace": r4(m.pace(poss, team_minutes)),
                "ortg": r4(m.rating(boca["pts"], poss)),
                "drtg": r4(m.rating(rival["pts"], poss)),
                "net_rating": r4(100 * (boca["pts"] - rival["pts"]) / poss) if poss else None,
                "efg": r4(m.efg(boca["fg"], boca["fg3m"], boca["fga"])),
                "efg_against": r4(m.efg(rival["fg"], rival["fg3m"], rival["fga"])),
                "tov_pct": r4(m.tov_pct(boca["tov"], boca["fga"], boca["fta"])),
                "tov_pct_against": r4(m.tov_pct(rival["tov"], rival["fga"], rival["fta"])),
                "orb_pct_team": r4(m.ratio(boca["orb"], boca["orb"] + rival["drb"])),
                "orb_pct_against": r4(m.ratio(rival["orb"], rival["orb"] + boca["drb"])),
                "ft_per_fga": r4(m.ft_per_fga(boca["ftm"], boca["fga"])),
                "ft_per_fga_against": r4(m.ft_per_fga(rival["ftm"], rival["fga"])),
                "three_rate": r4(m.three_rate(boca["fg3a"], boca["fga"])),
                "ts": r4(m.ts(boca["pts"], boca["fga"], boca["fta"])),
                "elo_win_prob": r4(win_prob),
                "brier": r4(m.brier(win_prob, won)) if win_prob is not None else None,
            }
        )
    return rows


def boca_season(games: list[dict[str, Any]], table: list[dict[str, Any]], x: float) -> dict[str, Any]:
    row = next((r for r in table if r["is_boca"]), {})
    briers = [g["brier"] for g in games if g["brier"] is not None]
    # Ratings de temporada como Σ puntos / Σ posesiones: promediar los de cada partido pesaría
    # igual un partido de 69 posesiones que uno de 78.
    poss = sum(g["possessions"] for g in games)
    ortg = m.rating(sum(g["points_for"] for g in games), poss)
    drtg = m.rating(sum(g["points_against"] for g in games), poss)
    return {
        **{
            k: row.get(k)
            for k in (
                "position",
                "played",
                "wins",
                "losses",
                "win_pct",
                "mov",
                "pyth_wins",
                "pyth_losses",
                "srs",
                "sos",
                "gb",
                "elo",
            )
        },
        "pythagorean_exponent": x,
        "ortg": r4(ortg),
        "drtg": r4(drtg),
        "net_rating": r4(ortg - drtg) if ortg is not None and drtg is not None else None,
        "pace": r4(statistics.fmean(g["pace"] for g in games)) if games else None,
        "longest_win_streak": m.longest_streak([g["won"] for g in games]),
        "net_rating_stdev": r4(m.stdev([g["net_rating"] for g in games])),
        "brier_mean": r4(statistics.fmean(briers)) if briers else None,
        "home_win_pct": r4(m.ratio(sum(g["won"] for g in games if g["home"]), sum(g["home"] for g in games))),
        "away_win_pct": r4(
            m.ratio(sum(g["won"] for g in games if not g["home"]), sum(not g["home"] for g in games))
        ),
    }


# --- Jugadores de Boca -------------------------------------------------------------------------

COUNTS = (
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
    "efficiency",
    "plus_minus",
)


def player_season(
    player_rows: list[dict[str, str]],
    team_rows: list[dict[str, str]],
    game_rows: list[dict[str, str]],
    team_id: str | None = str(BOCA_TEAM_ID),
) -> list[dict[str, Any]]:
    """Totales y tasas de cada jugador de un equipo (Boca por defecto; None = toda la liga).

    Las tasas usan los totales del equipo y del rival solo de los partidos que jugó (por eso se
    acumulan partido a partido).
    """
    pairs = _pairs(team_rows)
    team_minutes = {g["source_game_id"]: 40 + 5 * int(g["overtime_periods"]) for g in game_rows}
    acc: dict[str, dict[str, Any]] = {}
    for row in player_rows:
        gid = row["source_game_id"]
        key = (gid, row["team_id"])
        if (
            (team_id is not None and row["team_id"] != team_id)
            or key not in pairs
            or int(row["seconds"]) == 0
        ):
            continue
        boca, rival = pairs[key]  # «boca» = el equipo del jugador (el nombre viene de la versión solo-Boca)
        mp = int(row["seconds"]) / 60
        p = acc.setdefault(
            row["source_player_id"],
            {
                "team_id": row["team_id"],
                "name": row["name"],
                "games": 0,
                "starts": 0,
                "mp": 0.0,
                "dd": 0,
                "td": 0,
                "gmsc": [],
                "pts_list": [],
                "pie_own": 0.0,
                "pie_all": 0.0,
                "team_min": 0.0,
                **dict.fromkeys(COUNTS, 0),
                **dict.fromkeys(
                    (
                        "t_fga",
                        "t_fta",
                        "t_tov",
                        "t_fg",
                        "orb_pool",
                        "drb_pool",
                        "trb_pool",
                        "r_poss",
                        "r_fg2a",
                    ),
                    0.0,
                ),
            },
        )
        c = {k: int(row[k]) for k in COUNTS}
        fg, fga = c["fg2m"] + c["fg3m"], c["fg2a"] + c["fg3a"]
        p["games"] += 1
        p["starts"] += row["started"] == "True"
        p["mp"] += mp
        for k in COUNTS:
            p[k] += c[k]
        doubles = m.double_count(c["pts"], c["orb"] + c["drb"], c["ast"], c["stl"], c["blk"])
        p["dd"] += doubles >= 2
        p["td"] += doubles >= 3
        p["gmsc"].append(
            m.game_score(
                c["pts"],
                fg,
                fga,
                c["ftm"],
                c["fta"],
                c["orb"],
                c["drb"],
                c["stl"],
                c["ast"],
                c["blk"],
                c["pf"],
                c["tov"],
            )
        )
        p["pts_list"].append(c["pts"])
        p["pie_own"] += m.pie_numerator(
            c["pts"],
            fg,
            c["ftm"],
            fga,
            c["fta"],
            c["drb"],
            c["orb"],
            c["ast"],
            c["stl"],
            c["blk"],
            c["pf"],
            c["tov"],
        )
        for t in (boca, rival):
            p["pie_all"] += m.pie_numerator(
                t["pts"],
                t["fg"],
                t["ftm"],
                t["fga"],
                t["fta"],
                t["drb"],
                t["orb"],
                t["ast"],
                t["stl"],
                t["blk"],
                t["pf"],
                t["tov"],
            )
        # Totales de equipo ponderados por partido jugado: las fórmulas de Basketball-Reference
        # usan los del equipo en el mismo período, con MinEq/5 como minutos de juego.
        p["team_min"] += team_minutes[gid]
        p["t_fga"] += boca["fga"]
        p["t_fta"] += boca["fta"]
        p["t_tov"] += boca["tov"]
        p["t_fg"] += boca["fg"]
        p["orb_pool"] += boca["orb"] + rival["drb"]
        p["drb_pool"] += boca["drb"] + rival["orb"]
        p["trb_pool"] += boca["orb"] + boca["drb"] + rival["orb"] + rival["drb"]
        p["r_poss"] += m.possessions(_plays(rival), _plays(boca))
        p["r_fg2a"] += rival["fg2a"]

    rows = []
    for pid, p in acc.items():
        fg, fga, trb = p["fg2m"] + p["fg3m"], p["fg2a"] + p["fg3a"], p["orb"] + p["drb"]
        # Las tasas se escalan con los minutos del jugador sobre los del equipo en SUS partidos.
        team_min, mp = p["team_min"], p["mp"]
        rows.append(
            {
                "source_player_id": pid,
                "team_id": p["team_id"],
                "name": p["name"],
                "games": p["games"],
                "starts": p["starts"],
                "minutes": round(mp, 1),
                **{k: p[k] for k in COUNTS},
                "trb": trb,
                "fg_pct": r4(m.ratio(fg, fga)),
                "fg3_pct": r4(m.ratio(p["fg3m"], p["fg3a"])),
                "ft_pct": r4(m.ratio(p["ftm"], p["fta"])),
                "efg": r4(m.efg(fg, p["fg3m"], fga)),
                "ts": r4(m.ts(p["pts"], fga, p["fta"])),
                "points_per_shot": r4(m.points_per_shot(fg, p["fg3m"], fga)),
                "three_rate": r4(m.three_rate(p["fg3a"], fga)),
                "ft_rate": r4(m.ft_rate(p["fta"], fga)),
                "ast_to": r4(m.ast_to(p["ast"], p["tov"])),
                "tov_pct": r4(m.tov_pct(p["tov"], fga, p["fta"])),
                "usg_pct": r4(
                    m.usg_pct(fga, p["fta"], p["tov"], mp, team_min, p["t_fga"], p["t_fta"], p["t_tov"])
                ),
                "ast_pct": r4(m.ast_pct(p["ast"], fg, mp, team_min, p["t_fg"])),
                "orb_pct": r4(m.share_pct(p["orb"], mp, team_min, p["orb_pool"])),
                "drb_pct": r4(m.share_pct(p["drb"], mp, team_min, p["drb_pool"])),
                "trb_pct": r4(m.share_pct(trb, mp, team_min, p["trb_pool"])),
                "stl_pct": r4(m.share_pct(p["stl"], mp, team_min, p["r_poss"])),
                "blk_pct": r4(m.share_pct(p["blk"], mp, team_min, p["r_fg2a"])),
                "game_score_avg": r4(statistics.fmean(p["gmsc"])),
                "game_score_stdev": r4(m.stdev(p["gmsc"])),
                "pie": r4(m.ratio(p["pie_own"], p["pie_all"])),
                "double_doubles": p["dd"],
                "triple_doubles": p["td"],
                "pts_per36": r4(m.per_minutes(p["pts"], mp)),
                "pts_per40": r4(m.per_minutes(p["pts"], mp, 40)),
                "stl_per36": r4(m.per_minutes(p["stl"], mp)),
                "blk_per36": r4(m.per_minutes(p["blk"], mp)),
                "tov_per36": r4(m.per_minutes(p["tov"], mp)),
                "fg2_pct": r4(m.ratio(p["fg2m"], p["fg2a"])),
                # Promedios por partido jugado (lo primero que se mira de un jugador).
                "mpg": r4(m.ratio(mp, p["games"])),
                "ppg": r4(m.ratio(p["pts"], p["games"])),
                "rpg": r4(m.ratio(trb, p["games"])),
                "apg": r4(m.ratio(p["ast"], p["games"])),
                "spg": r4(m.ratio(p["stl"], p["games"])),
                "bpg": r4(m.ratio(p["blk"], p["games"])),
                "tpg": r4(m.ratio(p["tov"], p["games"])),
                "trb_per36": r4(m.per_minutes(trb, mp)),
                "ast_per36": r4(m.per_minutes(p["ast"], mp)),
                "streak_10_pts": m.longest_streak([v >= 10 for v in p["pts_list"]]),
            }
        )
    team_pts: dict[str, int] = defaultdict(int)
    for r in rows:
        team_pts[r["team_id"]] += r["pts"]
    for r in rows:
        r["team_points_share"] = r4(m.ratio(r["pts"], team_pts[r["team_id"]]))
    return sorted(rows, key=lambda r: -r["minutes"])


def league_per(
    league_rows: list[dict[str, Any]], team_rows: list[dict[str, str]], game_rows: list[dict[str, str]]
) -> dict[str, float]:
    """PER de todos los jugadores de la liga (5.6): uPER con los totales de la LNB, ajuste por el
    ritmo de su equipo (aPER = ritmo liga / ritmo equipo × uPER) y escala para que la liga promedie 15."""
    pairs = _pairs(team_rows)
    team_minutes = {g["source_game_id"]: 40 + 5 * int(g["overtime_periods"]) for g in game_rows}
    team_tot: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    paces: dict[str, list[float]] = defaultdict(list)
    for (gid, tid), (mine, rival) in pairs.items():
        for k in ("pts", "fg", "fga", "ftm", "fta", "orb", "drb", "ast", "tov", "pf"):
            team_tot[tid][k] += mine[k]
        pace = m.pace(m.possessions(_plays(mine), _plays(rival)), team_minutes.get(gid, 40))
        if pace is not None:
            paces[tid].append(pace)
    if not team_tot:
        return {}
    lg = m.PerLeague(
        pts=sum(t["pts"] for t in team_tot.values()),
        fg=sum(t["fg"] for t in team_tot.values()),
        fga=sum(t["fga"] for t in team_tot.values()),
        ft=sum(t["ftm"] for t in team_tot.values()),
        fta=sum(t["fta"] for t in team_tot.values()),
        orb=sum(t["orb"] for t in team_tot.values()),
        trb=sum(t["orb"] + t["drb"] for t in team_tot.values()),
        ast=sum(t["ast"] for t in team_tot.values()),
        tov=sum(t["tov"] for t in team_tot.values()),
        pf=sum(t["pf"] for t in team_tot.values()),
        pace=statistics.fmean(v for vals in paces.values() for v in vals),
    )
    adjusted, minutes = {}, {}
    for r in league_rows:
        tid = r["team_id"]
        p = {k: r[k] for k in ("ast", "tov", "fta", "trb", "orb", "stl", "blk", "pf")}
        p |= {"mp": r["minutes"], "fg3": r["fg3m"], "fg": r["fg2m"] + r["fg3m"], "ft": r["ftm"]}
        p["fga"] = r["fg2a"] + r["fg3a"]
        u = m.unadjusted_per(p, team_tot[tid]["ast"], team_tot[tid]["fg"], lg)
        if u is not None and paces.get(tid):
            adjusted[r["source_player_id"]] = lg.pace / statistics.fmean(paces[tid]) * u
            minutes[r["source_player_id"]] = r["minutes"]
    return m.per_scale(adjusted, minutes)


def add_roster(
    players: list[dict[str, Any]],
    roster: list[dict[str, str]],
    player_rows: list[dict[str, str]],
    bios: list[dict[str, str]],
    game_rows: list[dict[str, str]],
) -> None:
    """Posición, altura, peso y nacionalidad de Wikipedia (por dorsal); edad desde la ficha de la LNB."""
    shirts = {
        row["source_player_id"]: row["shirt_number"]
        for row in player_rows
        if row["team_id"] == str(BOCA_TEAM_ID) and row["shirt_number"]
    }
    by_shirt = {r["shirt_number"]: r for r in roster}
    births = {b["source_player_id"]: b["birth_date"] for b in bios if b.get("birth_date")}
    boca_dates = [
        date.fromisoformat(g["played_at"][:10])
        for g in game_rows
        if str(BOCA_TEAM_ID) in (g["home_team_id"], g["away_team_id"])
    ]
    last_game = max(boca_dates, default=None)
    for p in players:
        bio = by_shirt.get(shirts.get(p["source_player_id"], ""))
        p["position"] = bio["position"] if bio else None
        p["zone"] = ZONE.get(bio["position"]) if bio else None
        p["height_cm"] = int(bio["height_cm"]) if bio and bio["height_cm"] else None
        p["weight_kg"] = int(bio["weight_kg"]) if bio and bio["weight_kg"] else None
        p["nationality"] = bio["nationality"] if bio and bio.get("nationality") else None
        p["is_foreign"] = None if p["nationality"] is None else int(p["nationality"] != "ARG")
        # Edad con decimales a la fecha del último partido (6.1) si la LNB da la fecha de nacimiento;
        # si no, la edad en años de Wikipedia.
        born = births.get(p["source_player_id"])
        if born and last_game:
            p["age"] = round((last_game - date.fromisoformat(born)).days / 365.25, 2)
        else:
            p["age"] = int(bio["age"]) if bio and bio["age"] else None
        p["birth_date"] = born  # solo para la carga: core.player.birth_date no es pública


def main() -> None:
    table, x, league_games = league(read("league_result"))
    game_rows = read("game")
    games = boca_games(game_rows, read("team_game_stats"), league_games)
    player_rows, team_rows = read("player_game_stats"), read("team_game_stats")
    players = player_season(player_rows, team_rows, game_rows)
    league_rows = player_season(player_rows, team_rows, game_rows, team_id=None)
    per = league_per(league_rows, team_rows, game_rows)
    for row in [*players, *league_rows]:
        row["per"] = r4(per.get(row["source_player_id"]))
    add_roster(players, read("roster"), player_rows, read("player_bio"), game_rows)
    season = boca_season(games, table, x)
    season["scorer_herfindahl"] = r4(m.herfindahl([p["pts"] for p in players]))
    # Aporte de la banca y profundidad de la rotación (5.7).
    boca_lines = [ln for ln in player_rows if ln["team_id"] == str(BOCA_TEAM_ID) and int(ln["seconds"]) > 0]
    bench_pts = sum(int(ln["pts"]) for ln in boca_lines if ln["started"] != "True")
    season["bench_pts_share"] = r4(m.ratio(bench_pts, sum(int(ln["pts"]) for ln in boca_lines)))
    season["bench_ppg"] = r4(m.ratio(bench_pts, len(games)))
    season["rotation_depth"] = sum(1 for p in players if (p["mpg"] or 0) >= 10)

    # Métricas propias y tácticas desde el play-by-play validado (5.8, 6 y 6.1).
    per_game = own.game_tactics(game_rows, read("play_by_play_event"))
    own.player_metrics(players, per_game, x, reference=league_rows)
    for p in players:
        for key, value in list(p.items()):
            if isinstance(value, float):
                p[key] = r4(value)
    for g in games:
        if g["source_game_id"] in per_game:
            g.update(own.tactic_values(per_game[g["source_game_id"]]))
    season.update({k: r4(v) if isinstance(v, float) else v for k, v in own.season_tactics(per_game).items()})
    write("boca_lineup", own.lineups(per_game, {p["source_player_id"]: p["name"] for p in players}))

    # Estadísticas del inventario que faltaban (pipeline/extras.py).
    extras.player_extras(players, player_rows, game_rows)
    extras.league_ranks(players, league_rows)
    extras.game_extras(games, team_rows, read("game_period_score"))
    extras.player_splits(players, player_rows, games)
    extras.shot_zones(players, games, read("shot"))
    extras.season_extras(
        season, games, read("game_period_score"), game_rows, table, players, player_rows, league_games
    )
    extras.home_advantage(table, league_games)
    for row in [*players, *games, season, *table]:
        for key, value in list(row.items()):
            if isinstance(value, float):
                row[key] = r4(value)

    write("league_table", table)
    write("boca_game", games)
    write("boca_season", [season])
    write("player_season", players)
    print(json.dumps(season, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
