"""Estadísticas desde el play-by-play (5.8 y 6): On/Off, NR por jugador, quintetos y tácticas.

Solo se usan los partidos cuyo play-by-play cerró con el box score (pipeline/pbp.py). Las
posesiones de cada tramo se estiman con la misma fórmula de la sección 6 (FGA + 0,44 × FTA −
ORB + TOV, promediada entre los dos equipos) aplicada solo a las jugadas de ese tramo: es una
**estimación** y se marca como tal. Nada de esto se publica como jugada cruda, solo agregados.

Qué NO se infiere (nivel C, 5.8): tipos de jugada, esquemas defensivos, tiros contestados.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field

from pipeline.metrics import FTA_WEIGHT
from pipeline.pbp import POINTS, elapsed_at, period_length

FGA_EVENTS = {"CANASTA-2P", "CANASTA-3P", "TIRO2-FALLADO", "TIRO3-FALLADO"}
FTA_EVENTS = {"CANASTA-1P", "TIRO1-FALLADO"}
RUN_THRESHOLD = 8  # corrida «grande»: 8-0 o más (configurable, 5.8)
CLUTCH_SECONDS, CLUTCH_MARGIN = 300, 5  # últimos 5 minutos con 5 puntos o menos de diferencia
EDGE_SECONDS = 180  # arranque y cierre de cada cuarto: primeros y últimos 3 minutos


@dataclass
class Event:
    seq: int
    period: int | None
    clock_s: int | None
    side: str | None  # «local» o «visitante»
    event_type: str
    player: str | None


@dataclass
class Split:
    """Lo que pasó mientras un grupo (jugador o quinteto) estaba en cancha, desde un lado."""

    seconds: int = 0
    pts_for: int = 0
    pts_against: int = 0
    plays_for: float = 0.0  # FGA + 0,44 FTA − ORB + TOV del equipo del grupo
    plays_against: float = 0.0

    @property
    def possessions(self) -> float:
        return 0.5 * (self.plays_for + self.plays_against)

    def add(self, other: Split) -> None:
        self.seconds += other.seconds
        self.pts_for += other.pts_for
        self.pts_against += other.pts_against
        self.plays_for += other.plays_for
        self.plays_against += other.plays_against


def play_value(event_type: str) -> float:
    """Aporte de una jugada a las posesiones estimadas de su equipo."""
    if event_type in FGA_EVENTS:
        return 1.0
    if event_type in FTA_EVENTS:
        return FTA_WEIGHT
    if event_type == "REBOTE-OFENSIVO":
        return -1.0
    if event_type == "PERDIDA":
        return 1.0
    return 0.0


@dataclass
class GameTactics:
    """Resultado de recorrer un partido desde el punto de vista de `side`."""

    on: dict[str, Split] = field(default_factory=lambda: defaultdict(Split))
    lineups: dict[frozenset[str], Split] = field(default_factory=lambda: defaultdict(Split))
    team: Split = field(default_factory=Split)
    counters: Counter[str] = field(default_factory=Counter)
    scoring: list[tuple[str, int]] = field(default_factory=list)  # (lado, puntos) en orden


def analyze(events: Iterable[Event], side: str) -> GameTactics:
    """Recorre las jugadas en orden y reparte cada cosa entre los que estaban en cancha.

    Las reglas de la fuente son las de pipeline/pbp.py: los cinco «entran» al empezar cada
    período y FINAL-PERIODO vacía la cancha.
    """
    other = "visitante" if side == "local" else "local"
    result = GameTactics()
    on_court: dict[str, set[str]] = {"local": set(), "visitante": set()}
    score = {"local": 0, "visitante": 0}
    period, last_t = 1, 0
    run_side, run_pts = None, 0
    leader: str | None = None
    second_chance = {"local": False, "visitante": False}
    last_basket = {"local": 0, "visitante": 0}  # puntos de la última canasta de campo, para la asistencia

    def lineup() -> frozenset[str] | None:
        five = on_court[side]
        return frozenset(five) if len(five) == 5 else None

    def advance(to: int) -> None:
        nonlocal last_t
        delta = to - last_t
        if delta <= 0:
            return
        for player in on_court[side]:
            result.on[player].seconds += delta
        if (five := lineup()) is not None:
            result.lineups[five].seconds += delta
        diff = score[side] - score[other]
        result.counters["sec_leading" if diff > 0 else "sec_trailing" if diff < 0 else "sec_tied"] += delta
        last_t = to

    for e in events:
        if e.event_type == "FINAL-PERIODO":
            advance(elapsed_at(period, 0))
            on_court = {"local": set(), "visitante": set()}
            continue
        if e.period is None or e.clock_s is None or e.side is None:
            continue
        period = e.period
        now = elapsed_at(period, e.clock_s)
        advance(now)
        if e.event_type == "CAMBIO-JUGADOR-ENTRA" and e.player:
            on_court[e.side].add(e.player)
            continue
        if e.event_type == "CAMBIO-JUGADOR-SALE" and e.player:
            on_court[e.side].discard(e.player)
            continue
        if e.event_type == "TIEMPO-MUERTO-SOLICITADO":
            result.counters["timeouts" if e.side == side else "timeouts_rival"] += 1
            continue

        # Posesiones estimadas del tramo (jugadores y quinteto en cancha de nuestro lado).
        value = play_value(e.event_type)
        mine = e.side == side
        if value:
            key = "plays_for" if mine else "plays_against"
            for player in on_court[side]:
                setattr(result.on[player], key, getattr(result.on[player], key) + value)
            if (five := lineup()) is not None:
                setattr(result.lineups[five], key, getattr(result.lineups[five], key) + value)
            setattr(result.team, key, getattr(result.team, key) + value)

        if e.event_type == "REBOTE-OFENSIVO":
            second_chance[e.side] = True
        if e.event_type == "ASISTENCIA":
            # La fuente anota la asistencia justo después de la canasta del mismo equipo.
            result.counters["pts_assisted" if mine else "pts_assisted_rival"] += last_basket[e.side]
            last_basket[e.side] = 0

        points = POINTS.get(e.event_type, 0)
        if points:
            before_diff = score[side] - score[other]
            score[e.side] += points
            key = "pts_for" if mine else "pts_against"
            for player in on_court[side]:
                setattr(result.on[player], key, getattr(result.on[player], key) + points)
            if (five := lineup()) is not None:
                setattr(result.lineups[five], key, getattr(result.lineups[five], key) + points)
            setattr(result.team, key, getattr(result.team, key) + points)
            c = result.counters
            result.scoring.append((e.side, points))
            last_basket[e.side] = points if points > 1 else 0
            if points == 3:
                c["pts_3" if mine else "pts_3_rival"] += points
            if e.event_type == "CANASTA-1P":
                c["pts_ft" if mine else "pts_ft_rival"] += points
            if second_chance[e.side]:
                c["pts_second_chance" if mine else "pts_second_chance_rival"] += points
            # Corridas: puntos seguidos de un mismo equipo.
            run_pts = run_pts + points if run_side == e.side else points
            run_side = e.side
            best = "max_run" if mine else "max_run_rival"
            c[best] = max(c[best], run_pts)
            # Ventaja y cambios de liderazgo.
            diff = score[side] - score[other]
            c["max_lead"] = max(c["max_lead"], diff)
            c["max_deficit"] = max(c["max_deficit"], -diff)
            now_leader = side if diff > 0 else other if diff < 0 else None
            if leader is not None and now_leader is not None and now_leader != leader:
                c["lead_changes"] += 1
            if now_leader is not None:
                leader = now_leader
            # Arranque y cierre de cuarto; clutch (últimos 5 minutos de la parte final, parejo).
            remaining = e.clock_s
            elapsed_in_period = period_length(period) - remaining
            sign = 1 if mine else -1
            if elapsed_in_period <= EDGE_SECONDS:
                c["quarter_start_diff"] += sign * points
            if remaining <= EDGE_SECONDS:
                c["quarter_end_diff"] += sign * points
            if period >= 4 and remaining <= CLUTCH_SECONDS and abs(before_diff) <= CLUTCH_MARGIN:
                c["clutch_pts_for" if mine else "clutch_pts_against"] += points
        # Fin de la «segunda oportunidad»: canasta, pérdida o rebote defensivo del rival.
        if e.event_type in ("CANASTA-2P", "CANASTA-3P", "PERDIDA"):
            second_chance[e.side] = False
        if e.event_type == "REBOTE-DEFENSIVO":
            second_chance["visitante" if e.side == "local" else "local"] = False

    c = result.counters
    c["big_runs"], c["big_runs_rival"] = count_big_runs(result.scoring, side)
    return result


def count_big_runs(
    scoring: list[tuple[str, int]], side: str, threshold: int = RUN_THRESHOLD
) -> tuple[int, int]:
    """Cantidad de corridas de `threshold`-0 o más a favor y en contra (puntos seguidos de un equipo)."""
    mine = theirs = 0
    current_side, current = None, 0
    for s, pts in [*scoring, ("__fin__", 0)]:
        if s == current_side:
            current += pts
            continue
        if current_side is not None and current >= threshold:
            if current_side == side:
                mine += 1
            else:
                theirs += 1
        current_side, current = s, pts
    return mine, theirs


def rating(points: int, possessions: float) -> float | None:
    return 100 * points / possessions if possessions > 0 else None


def on_off(on: Split, team: Split) -> dict[str, float | None]:
    """ORtg, DRtg y NR con el jugador en cancha y fuera de ella; On/Off = NR_on − NR_off."""
    off = Split(
        seconds=0,
        pts_for=team.pts_for - on.pts_for,
        pts_against=team.pts_against - on.pts_against,
        plays_for=team.plays_for - on.plays_for,
        plays_against=team.plays_against - on.plays_against,
    )
    ortg_on, drtg_on = rating(on.pts_for, on.possessions), rating(on.pts_against, on.possessions)
    ortg_off, drtg_off = rating(off.pts_for, off.possessions), rating(off.pts_against, off.possessions)
    nr_on = ortg_on - drtg_on if ortg_on is not None and drtg_on is not None else None
    nr_off = ortg_off - drtg_off if ortg_off is not None and drtg_off is not None else None
    return {
        "possessions_on": on.possessions,
        "ortg_on": ortg_on,
        "drtg_on": drtg_on,
        "net_rating_on": nr_on,
        "net_rating_off": nr_off,
        "on_off": nr_on - nr_off if nr_on is not None and nr_off is not None else None,
    }
