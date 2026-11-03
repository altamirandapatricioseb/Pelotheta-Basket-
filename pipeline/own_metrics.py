"""Métricas propias y tácticas desde el play-by-play (secciones 5.8, 6 y 6.1).

Lo llama `pipeline.season` al final y agrega columnas a sus tablas:
- player_season: On/Off, NR con y sin el jugador, EWA, ELA, índice de rendimiento y cobertura,
  Mejoría α y β y Potencial α y β (n/d con su motivo en docs/metricas_propias.md).
- boca_game: tácticas por partido (corridas, ventajas, origen de los puntos, clutch, bonus...).
- boca_season: las mismas tácticas sumadas en la temporada.
- boca_lineup.csv (nuevo): quintetos de Boca con minutos, posesiones estimadas y NR.

Reemplazo de EWA y ELA (sección 6): el promedio ponderado por minutos de los suplentes de Boca
(jugadores que empezaron menos de la mitad de sus partidos). La LNB no publica posiciones, así
que no se puede usar «los suplentes de su posición»: queda documentado como supuesto.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from typing import Any

from pipeline import metrics as m
from pipeline import projection as proj
from pipeline.tactics import Event, GameTactics, Split, analyze, on_off, rating
from sources.lnb import BOCA_TEAM_ID

MIN_MINUTES_PERCENTILE = 40  # jugadores con menos minutos no entran en la referencia de percentiles
SMALL_SAMPLE_MINUTES = 400  # aviso de muestra pequeña (6)
MIN_LINEUP_POSSESSIONS = 30  # quintetos con menos posesiones se marcan «muestra pequeña» (5.8)

# Sets de la Mejoría α y del nivel del Potencial α por zona (6.1.2): (estadística, mayor es mejor, peso).
ALPHA_SETS: dict[str, list[tuple[str, bool, int]]] = {
    "base_escolta": [("ts", True, 1), ("ast_pct", True, 1), ("tov_pct", False, 1), ("pts_per36", True, 1),
                     ("game_score_per36", True, 2)],
    "alero": [("ts", True, 1), ("three_rate", True, 1), ("stl_pct", True, 1), ("trb_pct", True, 1),
              ("game_score_per36", True, 2)],
    "interno": [("ts", True, 1), ("trb_pct", True, 1), ("blk_pct", True, 1), ("ft_rate", True, 1),
                ("game_score_per36", True, 2)],
}  # fmt: skip

# Componentes del índice de rendimiento (6.1.1): (estadística, mayor es mejor).
COMPONENTS: dict[str, list[tuple[str, bool]]] = {
    "A": [("pts_per36", True), ("ts", True), ("efg", True), ("points_per_shot", True)],
    "C": [("ast_pct", True), ("ast_per36", True), ("ast_to", True), ("tov_pct", False)],
    "B": [("orb_pct", True), ("drb_pct", True), ("trb_pct", True)],
    "D": [("stl_pct", True), ("blk_pct", True), ("pf_per36", False)],
    "E": [("game_score_per36", True), ("pie", True), ("on_off", True)],
    "P": [("team_minutes_share", True)],
}


def _events(rows: list[dict[str, str]]) -> dict[str, list[Event]]:
    by_game: dict[str, list[Event]] = defaultdict(list)
    for r in rows:
        by_game[r["source_game_id"]].append(
            Event(
                seq=int(r["seq"]),
                period=int(r["period"]) if r["period"] else None,
                clock_s=int(r["clock_s"]) if r["clock_s"] else None,
                side=r["side"] or None,
                event_type=r["event_type"],
                player=r["source_player_id"] or None,
            )
        )
    return {g: sorted(evs, key=lambda e: e.seq) for g, evs in by_game.items()}


def game_tactics(game_rows: list[dict[str, str]], pbp_rows: list[dict[str, str]]) -> dict[str, GameTactics]:
    """Tácticas de Boca en cada partido con play-by-play validado."""
    events = _events(pbp_rows)
    out = {}
    for g in game_rows:
        gid = g["source_game_id"]
        if gid in events and g.get("pbp_validated") == "True":
            side = "local" if g["home_team_id"] == str(BOCA_TEAM_ID) else "visitante"
            out[gid] = analyze(events[gid], side)
    return out


def tactic_values(t: GameTactics) -> dict[str, float | None]:
    """Las tácticas de un partido (o de la temporada sumada) como estadísticas del catálogo."""
    c, team = t.counters, t.team
    pts = team.pts_for or 0
    return {
        "possessions_pbp": round(team.possessions, 2),
        "max_run": c["max_run"],
        "max_run_rival": c["max_run_rival"],
        "big_runs": c["big_runs"],
        "big_runs_rival": c["big_runs_rival"],
        "lead_changes": c["lead_changes"],
        "max_lead": c["max_lead"],
        "max_deficit": c["max_deficit"],
        "minutes_leading": round(c["sec_leading"] / 60, 1),
        "minutes_trailing": round(c["sec_trailing"] / 60, 1),
        "minutes_tied": round(c["sec_tied"] / 60, 1),
        "pts_assisted_share": m.ratio(c["pts_assisted"], pts),
        "pts_3_share": m.ratio(c["pts_3"], pts),
        "pts_ft_share": m.ratio(c["pts_ft"], pts),
        "pts_second_chance": c["pts_second_chance"],
        "pts_second_chance_rival": c["pts_second_chance_rival"],
        "quarter_start_diff": c["quarter_start_diff"],
        "quarter_end_diff": c["quarter_end_diff"],
        "clutch_net": c["clutch_pts_for"] - c["clutch_pts_against"],
        "timeouts": c["timeouts"],
    }


def season_tactics(per_game: dict[str, GameTactics]) -> dict[str, float | None]:
    """Suma de la temporada: conteos sumados, máximos como máximo y proporciones recalculadas."""
    total = GameTactics()
    for t in per_game.values():
        total.team.add(t.team)
        for key, value in t.counters.items():
            if key.startswith(("max_",)):
                total.counters[key] = max(total.counters[key], value)
            else:
                total.counters[key] += value
    values = tactic_values(total)
    values.pop("possessions_pbp")
    return values


def lineups(per_game: dict[str, GameTactics], names: dict[str, str]) -> list[dict[str, Any]]:
    """Quintetos de Boca en la temporada, ordenados por minutos."""
    acc: dict[frozenset[str], Split] = defaultdict(Split)
    for t in per_game.values():
        for five, split in t.lineups.items():
            acc[five].add(split)
    rows = []
    for five, s in acc.items():
        ortg, drtg = rating(s.pts_for, s.possessions), rating(s.pts_against, s.possessions)
        rows.append(
            {
                "lineup_key": "-".join(sorted(five)),
                "players": " · ".join(sorted(names.get(p, p) for p in five)),
                "minutes": round(s.seconds / 60, 1),
                "possessions": round(s.possessions, 1),
                "points_for": s.pts_for,
                "points_against": s.pts_against,
                "ortg": None if ortg is None else round(ortg, 2),
                "drtg": None if drtg is None else round(drtg, 2),
                "net_rating": None if ortg is None or drtg is None else round(ortg - drtg, 2),
                "small_sample": s.possessions < MIN_LINEUP_POSSESSIONS,
            }
        )
    return sorted(rows, key=lambda r: -r["minutes"])


def player_metrics(
    players: list[dict[str, Any]],
    per_game: dict[str, GameTactics],
    x: float,
    reference: list[dict[str, Any]] | None = None,
) -> None:
    """Agrega a cada fila de player_season sus métricas propias (modifica la lista)."""
    on: dict[str, Split] = defaultdict(Split)
    team = Split()
    for t in per_game.values():
        team.add(t.team)
        for player, split in t.on.items():
            on[player].add(split)
    league = rating(
        team.pts_for + team.pts_against, 2 * team.possessions
    )  # L: puntos cada 100 en sus partidos

    for p in players:
        own_split = on.get(p["source_player_id"])
        empty = dict.fromkeys(
            ("possessions_on", "ortg_on", "drtg_on", "net_rating_on", "net_rating_off", "on_off")
        )
        p.update(on_off(own_split, team) if own_split else empty)
        p["small_sample"] = p["minutes"] < SMALL_SAMPLE_MINUTES

    # Reemplazo: suplentes de Boca ponderados por minutos (ver docstring del módulo).
    bench = [p for p in players if p["ortg_on"] is not None and p["starts"] * 2 < p["games"]]
    weight = sum(p["minutes"] for p in bench)
    ortg_rep = sum(p["ortg_on"] * p["minutes"] for p in bench) / weight if weight else None
    drtg_rep = sum(p["drtg_on"] * p["minutes"] for p in bench) / weight if weight else None
    for p in players:
        p["ewa"] = p["ela"] = None
        if league is None:
            continue
        if p["ortg_on"] is not None and ortg_rep is not None:
            p["ewa"] = m.ewa(p["minutes"], p["ortg_on"], ortg_rep, league, x)
        if p["drtg_on"] is not None and drtg_rep is not None:
            p["ela"] = m.ela(p["minutes"], p["drtg_on"], drtg_rep, league, x)

    # Índice de rendimiento (6.1.1). Referencia: la liga (hay box scores de todos los equipos) con
    # el mínimo de minutos; las estadísticas que solo existen para Boca (On/Off, % de minutos) se
    # comparan contra el plantel. Pesos según la posición de Wikipedia, o «sin posición».
    # shortcut: 40 minutos por partido sin contar suplementarios; sumar 5 por suplementario si aparecen.
    team_minutes = 40.0 * len(per_game)
    for p in players:
        p["team_minutes_share"] = m.ratio(p["minutes"], team_minutes)
    for row in [*players, *(reference or [])]:
        add_per36(row)
    pool_rows = [q for q in (reference or players) if q["minutes"] >= MIN_MINUTES_PERCENTILE]
    squad_rows = [q for q in players if q["minutes"] >= MIN_MINUTES_PERCENTILE]

    def percentile(p: dict[str, Any], stat: str, higher: bool) -> float | None:
        pool = [q[stat] for q in pool_rows if q.get(stat) is not None]
        if len(pool) < 2:
            pool = [q[stat] for q in squad_rows if q.get(stat) is not None]
        return (
            proj.percent_rank(pool, p[stat], higher) if p.get(stat) is not None and len(pool) >= 2 else None
        )

    for p in players:
        comps: dict[str, float | None] = {}
        for comp, stats in COMPONENTS.items():
            pcts = [v for stat, higher in stats if (v := percentile(p, stat, higher)) is not None]
            comps[comp] = statistics.fmean(pcts) if pcts else None
        zone = p.get("zone") or "sin_posicion"
        index, coverage = proj.performance_index(comps, proj.WEIGHTS[zone])
        p["rendimiento_indice"] = None if p["minutes"] < MIN_MINUTES_PERCENTILE else index
        p["rendimiento_cobertura"] = round(coverage, 2)

        # Mejoría α (8 + 12 partidos) y β (dos bloques de 6) todavía no tienen partidos suficientes.
        p["mejoria_alpha"] = p["mejoria_beta"] = None
        # Potencial α: nivel = promedio de percentiles del set de su posición (6.1.2, el Game Score
        # cuenta doble), con la Mejoría α en n/d -> M = 0 (se avisa en el catálogo).
        age = p.get("age")
        stats_set = ALPHA_SETS.get(zone)
        level_pcts = []
        if stats_set:
            for stat, higher, weight in stats_set:
                v = percentile(p, stat, higher)
                if v is not None:
                    level_pcts += [v] * weight
        result = (
            proj.potencial_alpha(statistics.fmean(level_pcts), p["minutes"], age, None)
            if level_pcts and age is not None and len(level_pcts) >= 3
            else None
        )
        p["potencial_alpha"], p["potencial_alpha_low"], p["potencial_alpha_high"] = result or (
            None,
            None,
            None,
        )
        published = p["rendimiento_indice"]  # el mismo índice que se muestra (n/d con menos de 40 minutos)
        p["potencial_beta"] = (
            proj.potencial_beta(published, p["minutes"], age, None)
            if published is not None and age is not None
            else None
        )


def add_per36(row: dict[str, Any]) -> None:
    """Valores por 36 que usa el índice, para cualquier jugador de la liga."""
    row["ast_per36"] = m.per_minutes(row["ast"], row["minutes"])
    row["pf_per36"] = m.per_minutes(row["pf"], row["minutes"])
    row["game_score_per36"] = m.per_minutes((row["game_score_avg"] or 0) * row["games"], row["minutes"])
