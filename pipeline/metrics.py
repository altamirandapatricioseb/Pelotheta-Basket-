"""Fórmulas de las estadísticas calculables y de las métricas propias (secciones 5.6, 5.7 y 6).

Funciones puras, sin red ni base de datos, para poder probarlas con ejemplos a mano y con
propiedades (hypothesis). Siglas como en Basketball-Reference: FG/FGA tiros de campo
convertidos/intentados, 3P/3PA triples, FT/FTA libres, ORB/DRB/TRB rebotes, TOV pérdidas,
MP minutos del jugador. `MinEq/5` son los minutos de juego del equipo (40 más suplementarios).

Toda división por cero devuelve None: la estadística queda `n/d`, nunca se inventa un valor.
Elo, pitagórico, rachas, Herfindahl, Jaccard y desvío vienen del proyecto de fútbol, sin empates.
"""

from __future__ import annotations

import itertools
import math
import statistics
from collections.abc import Iterable, Sequence
from datetime import date
from typing import NamedTuple

# Parámetros de arranque (configurables; se muestran en la web).
ELO_START = 1500.0
ELO_K = 20.0
ELO_HOME_ADVANTAGE = 100.0
PYTHAGOREAN_START = 14.0  # supuesto de partida de la sección 6; se calibra con la tabla real
FTA_WEIGHT = 0.44  # peso de los libres en las posesiones (fórmula de Dean Oliver)


def ratio(num: float, den: float) -> float | None:
    return num / den if den else None


# --- Tiro y volumen (jugador o equipo) --------------------------------------------------------


def efg(fg: float, fg3: float, fga: float) -> float | None:
    """eFG% = (FG + 0,5 × 3P) / FGA: el triple vale 1,5 dobles."""
    return ratio(fg + 0.5 * fg3, fga)


def ts(pts: float, fga: float, fta: float) -> float | None:
    """TS% = PTS / (2 × (FGA + 0,44 × FTA)): eficiencia contando también los libres."""
    return ratio(pts, 2 * (fga + FTA_WEIGHT * fta))


def points_per_shot(fg: float, fg3: float, fga: float) -> float | None:
    """Puntos por tiro de campo = (2 × (FG − 3P) + 3 × 3P) / FGA."""
    return ratio(2 * (fg - fg3) + 3 * fg3, fga)


def three_rate(fg3a: float, fga: float) -> float | None:
    """3PAr = 3PA / FGA: qué parte de los tiros son triples."""
    return ratio(fg3a, fga)


def ft_rate(fta: float, fga: float) -> float | None:
    """FTr = FTA / FGA: cuánto llega a la línea por cada tiro de campo."""
    return ratio(fta, fga)


def ft_per_fga(ft: float, fga: float) -> float | None:
    """FT/FGA: libres convertidos por tiro de campo (cuarto factor)."""
    return ratio(ft, fga)


def ast_to(ast: float, tov: float) -> float | None:
    return ratio(ast, tov)


def tov_pct(tov: float, fga: float, fta: float) -> float | None:
    """TOV% = 100 × TOV / (FGA + 0,44 × FTA + TOV): pérdidas cada 100 jugadas que usa."""
    return None if (d := fga + FTA_WEIGHT * fta + tov) == 0 else 100 * tov / d


def game_score(
    pts: float,
    fg: float,
    fga: float,
    ft: float,
    fta: float,
    orb: float,
    drb: float,
    stl: float,
    ast: float,
    blk: float,
    pf: float,
    tov: float,
) -> float:
    """Game Score de John Hollinger (coeficientes publicados por Basketball-Reference)."""
    return (
        pts
        + 0.4 * fg
        - 0.7 * fga
        - 0.4 * (fta - ft)
        + 0.7 * orb
        + 0.3 * drb
        + stl
        + 0.7 * ast
        + 0.7 * blk
        - 0.4 * pf
        - tov
    )


def pie_numerator(
    pts: float,
    fg: float,
    ft: float,
    fga: float,
    fta: float,
    drb: float,
    orb: float,
    ast: float,
    stl: float,
    blk: float,
    pf: float,
    tov: float,
) -> float:
    """Numerador del PIE; el PIE es esto del jugador sobre lo mismo de ambos equipos."""
    return pts + fg + ft - fga - fta + drb + 0.5 * orb + ast + stl + 0.5 * blk - pf - tov


def double_count(pts: float, trb: float, ast: float, stl: float, blk: float) -> int:
    """Cuántas de PTS, TRB, AST, STL y BLK llegan a 10 (2 = doble-doble, 3 = triple-doble)."""
    return sum(v >= 10 for v in (pts, trb, ast, stl, blk))


def per_minutes(value: float, minutes: float, base: float = 36) -> float | None:
    """Estadística × base / MP (por 36, por 40 o por 48 minutos)."""
    return None if minutes <= 0 else value * base / minutes


# --- Posesiones y ratings de equipo (sección 6) -------------------------------------------------


def team_plays(fga: float, fta: float, orb: float, tov: float) -> float:
    """Jugadas que terminan posesión de un equipo: FGA + 0,44 × FTA − ORB + TOV."""
    return fga + FTA_WEIGHT * fta - orb + tov


def possessions(own: tuple[float, float, float, float], rival: tuple[float, float, float, float]) -> float:
    """Pos ≈ 0,5 × (jugadas propias + jugadas del rival), con (FGA, FTA, ORB, TOV) de cada uno.

    Se promedian los dos lados porque las posesiones de un partido son casi iguales para ambos.
    """
    return 0.5 * (team_plays(*own) + team_plays(*rival))


def rating(points: float, poss: float) -> float | None:
    """ORtg o DRtg: puntos cada 100 posesiones."""
    return ratio(100 * points, poss)


def pace(poss: float, team_minutes: float) -> float | None:
    """Posesiones cada 40 minutos; `team_minutes` = MinEq/5 (40 más suplementarios)."""
    return ratio(40 * poss, team_minutes)


# --- Tasas individuales (necesitan totales de equipo y rival en los mismos partidos) -----------


def usg_pct(
    fga: float,
    fta: float,
    tov: float,
    mp: float,
    team_min: float,
    team_fga: float,
    team_fta: float,
    team_tov: float,
) -> float | None:
    """USG% = 100 × ((FGA + 0,44 FTA + TOV) × MinEq/5) / (MP × (FGA_eq + 0,44 FTA_eq + TOV_eq))."""
    d = mp * (team_fga + FTA_WEIGHT * team_fta + team_tov)
    return None if d == 0 else 100 * (fga + FTA_WEIGHT * fta + tov) * team_min / d


def ast_pct(ast: float, fg: float, mp: float, team_min: float, team_fg: float) -> float | None:
    """AST% = 100 × AST / ((MP / (MinEq/5)) × FG_eq − FG): canastas de compañeros que asistió."""
    if team_min == 0:
        return None
    d = mp / team_min * team_fg - fg
    return None if d <= 0 else 100 * ast / d


def share_pct(value: float, mp: float, team_min: float, pool: float) -> float | None:
    """Molde de ORB%, DRB%, TRB%, STL% y BLK%: 100 × (valor × MinEq/5) / (MP × pozo disponible).

    ORB%: pozo = ORB_eq + DRB_rival · DRB%: DRB_eq + ORB_rival · TRB%: TRB_eq + TRB_rival ·
    STL%: Pos_rival · BLK%: tiros de 2 intentados del rival.
    """
    d = mp * pool
    return None if d == 0 else 100 * value * team_min / d


# --- Liga: Elo, pitagórico, calendario --------------------------------------------------------


class Game(NamedTuple):
    date: str
    home: str
    away: str
    home_points: int
    away_points: int


class TableRow(NamedTuple):
    played: int
    wins: int
    points_for: int
    points_against: int


def elo_expected(own: float, rival: float, home_advantage: float = 0.0) -> float:
    """Probabilidad de ganar: E = 1 / (1 + 10^((R_rival − R_propio − V) / 400))."""
    return 1 / (1 + 10 ** ((rival - own - home_advantage) / 400))


def elo_update(
    home: float, away: float, home_won: bool, k: float = ELO_K, home_advantage: float = ELO_HOME_ADVANTAGE
) -> tuple[float, float]:
    """Elo después del partido: R_nuevo = R + K × (S − E), con S = 1 si gana y 0 si pierde."""
    change = k * (float(home_won) - elo_expected(home, away, home_advantage))
    return home + change, away - change


def elo_run(
    games: Sequence[Game], k: float = ELO_K, home_advantage: float = ELO_HOME_ADVANTAGE
) -> tuple[list[tuple[float, float]], dict[str, float]]:
    """Elo de local y visitante ANTES de cada partido (sin datos del futuro) y el Elo final.

    Los partidos se procesan en orden de fecha; la lista devuelta sigue ese mismo orden.
    """
    ratings: dict[str, float] = {}
    before: list[tuple[float, float]] = []
    for g in sorted(games, key=lambda x: x.date):
        home, away = ratings.get(g.home, ELO_START), ratings.get(g.away, ELO_START)
        before.append((home, away))
        ratings[g.home], ratings[g.away] = elo_update(
            home, away, g.home_points > g.away_points, k, home_advantage
        )
    return before, ratings


def brier(probability: float, won: bool) -> float:
    """Brier score de un pronóstico de victoria: (p − resultado)², de 0 (perfecto) a 1."""
    return (probability - float(won)) ** 2


def pythagorean_share(points_for: float, points_against: float, x: float) -> float:
    """Parte de victorias esperada: PF^x / (PF^x + PA^x)."""
    if points_for == 0 and points_against == 0:
        return 0.5
    # Se divide antes de elevar: con x = 14 y miles de puntos, PF^x desborda un float.
    return 1 / (1 + (points_against / points_for) ** x) if points_for else 0.0


def calibrate_pythagorean(table: Iterable[TableRow]) -> float:
    """Exponente x que minimiza Σ (victorias reales − pitagóricas)² en la tabla de la liga.

    Búsqueda en grilla de 5 a 25 con paso 0,1: mínimos cuadrados de un solo parámetro, que se
    explica en una línea. Con pocos partidos jugados el resultado es ruidoso: se muestra el valor.
    """
    rows = [r for r in table if r.played > 0]
    if not rows:
        return PYTHAGOREAN_START
    best_x, best_error = PYTHAGOREAN_START, math.inf
    for step in range(50, 251):
        x = step / 10
        error = sum(
            (r.wins - r.played * pythagorean_share(r.points_for, r.points_against, x)) ** 2 for r in rows
        )
        if error < best_error - 1e-12:
            best_x, best_error = x, error
    return best_x


def srs(games: Sequence[Game], iterations: int = 200, tolerance: float = 1e-6) -> dict[str, float]:
    """SRS = MOV + SOS, con SOS = promedio del SRS de los rivales. Se itera hasta que converge.

    Por qué se resta la media en cada vuelta: el sistema tiene infinitas soluciones que difieren
    en una constante; fijar promedio 0 deja una sola (la convención de Basketball-Reference).
    """
    margins: dict[str, list[float]] = {}
    rivals: dict[str, list[str]] = {}
    for g in games:
        diff = g.home_points - g.away_points
        margins.setdefault(g.home, []).append(diff)
        margins.setdefault(g.away, []).append(-diff)
        rivals.setdefault(g.home, []).append(g.away)
        rivals.setdefault(g.away, []).append(g.home)
    mov = {t: statistics.fmean(m) for t, m in margins.items()}
    rating_by_team = dict(mov)
    for _ in range(iterations):
        new = {t: mov[t] + statistics.fmean(rating_by_team[r] for r in rivals[t]) for t in mov}
        # Promedio con la vuelta anterior: sin él, en ligas donde los equipos se cruzan en dos
        # bandos (A solo con B) la iteración rebota entre dos estados y no converge.
        new = {t: (v + rating_by_team[t]) / 2 for t, v in new.items()}
        mean = statistics.fmean(new.values())
        new = {t: v - mean for t, v in new.items()}
        done = max(abs(new[t] - rating_by_team[t]) for t in mov) < tolerance
        rating_by_team = new
        if done:
            break
    return rating_by_team


def games_behind(wins: int, losses: int, leader_wins: int, leader_losses: int) -> float:
    """GB = ((W_líder − W) + (L − L_líder)) / 2."""
    return ((leader_wins - wins) + (losses - leader_losses)) / 2


def rest_days(dates: Sequence[str]) -> list[int | None]:
    """Días desde el partido anterior, en orden de fecha; el primero no tiene anterior."""
    ordered = sorted(date.fromisoformat(d) for d in dates)
    return [None, *[(b - a).days for a, b in itertools.pairwise(ordered)]]


# --- Rachas, concentración y estabilidad (5.7) ------------------------------------------------


def longest_streak(flags: Sequence[bool]) -> int:
    """Mayor cantidad de True seguidos (victorias, partidos con 10 o más puntos, etc.)."""
    best = current = 0
    for f in flags:
        current = current + 1 if f else 0
        best = max(best, current)
    return best


def herfindahl(points: Sequence[float]) -> float | None:
    """Concentración del ataque: Σ (puntos del jugador / puntos del equipo)². 1 = un solo anotador."""
    total = sum(points)
    return sum((p / total) ** 2 for p in points) if total > 0 else None


def jaccard(a: set[str], b: set[str]) -> float:
    """Titulares en común sobre titulares distintos en total."""
    union = a | b
    return len(a & b) / len(union) if union else 1.0


def stdev(values: Sequence[float]) -> float | None:
    """Desvío estándar muestral; con menos de dos valores no hay desvío."""
    return statistics.stdev(values) if len(values) >= 2 else None


# --- NR, EWA y ELA (sección 6) -----------------------------------------------------------------


def ewa(minutes: float, ortg_on: float, ortg_rep: float, league_rating: float, x: float) -> float:
    """Expected Wins Added = (Min / 40) × [P(ORtg_on) − P(ORtg_rep)], con P(a) = a^x / (a^x + L^x)."""
    p_on = pythagorean_share(ortg_on, league_rating, x)
    return minutes / 40 * (p_on - pythagorean_share(ortg_rep, league_rating, x))


def ela(minutes: float, drtg_on: float, drtg_rep: float, league_rating: float, x: float) -> float:
    """Expected Losses Added = (Min / 40) × [Q(DRtg_on) − Q(DRtg_rep)]. Negativo = evita derrotas."""
    q_on = pythagorean_share(drtg_on, league_rating, x)
    return minutes / 40 * (q_on - pythagorean_share(drtg_rep, league_rating, x))
