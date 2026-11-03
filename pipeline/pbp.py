"""Reconstrucción del partido desde el play-by-play y validación contra el box score (5.8).

Por qué existe: las estadísticas tácticas (posesiones, quintetos, On/Off, corridas) salen del
play-by-play. Antes de usarlo hay que probar que está completo: si al sumar las jugadas no se
obtienen el marcador, los totales de cada jugador, sus minutos y su +/− del box score, el
play-by-play de ese partido no es confiable y sus tácticas quedan `n/d` (cuarentena).

Reglas de la fuente (Fase 0):
- Al empezar cada período, los cinco de cada equipo «entran» (CAMBIO-JUGADOR-ENTRA con el reloj
  en 10:00), y al terminar no hay eventos de salida: el período se cierra con FINAL-PERIODO.
- El reloj es cuenta regresiva: segundos que quedan en el período.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field

from sources.lnb import OVERTIME_S, QUARTER_S, MatchData, PbpEvent

POINTS = {"CANASTA-1P": 1, "CANASTA-2P": 2, "CANASTA-3P": 3}

# Evento del play-by-play -> contadores del box score que alimenta.
COUNTERS = {
    "CANASTA-1P": ("ftm", "fta"),
    "TIRO1-FALLADO": ("fta",),
    "CANASTA-2P": ("fg2m", "fg2a"),
    "TIRO2-FALLADO": ("fg2a",),
    "CANASTA-3P": ("fg3m", "fg3a"),
    "TIRO3-FALLADO": ("fg3a",),
    "REBOTE-OFENSIVO": ("orb",),
    "REBOTE-DEFENSIVO": ("drb",),
    "ASISTENCIA": ("ast",),
    "RECUPERACION": ("stl",),
    "PERDIDA": ("tov",),
    "TAPON-COMETIDO": ("blk",),
    "TAPON-RECIBIDO": ("blk_against",),
    "FALTA-COMETIDA": ("pf",),
    "FALTA-RECIBIDA": ("pf_drawn",),
}
CHECKED = ("pts", *sorted({c for cs in COUNTERS.values() for c in cs}))


def period_length(period: int) -> int:
    return QUARTER_S if period <= 4 else OVERTIME_S


def elapsed_at(period: int, clock_s: int) -> int:
    """Segundos jugados desde el inicio del partido hasta ese momento del período."""
    before = sum(period_length(p) for p in range(1, period))
    return before + period_length(period) - clock_s


@dataclass
class Reconstruction:
    score: dict[str, int] = field(default_factory=lambda: {"local": 0, "visitante": 0})
    counters: dict[str, Counter[str]] = field(default_factory=lambda: defaultdict(Counter))
    seconds: Counter[str] = field(default_factory=Counter)
    plus_minus: Counter[str] = field(default_factory=Counter)
    errors: list[str] = field(default_factory=list)


def reconstruct(events: list[PbpEvent]) -> Reconstruction:
    rec = Reconstruction()
    on_court: dict[str, set[str]] = {"local": set(), "visitante": set()}
    period, last_t = 1, 0

    def advance(to: int) -> None:
        # Reparte el tiempo transcurrido entre los que estaban en cancha.
        nonlocal last_t
        if to < last_t:
            rec.errors.append(f"el reloj retrocede (t={to} < {last_t})")
            return
        for players in on_court.values():
            for player in players:
                rec.seconds[player] += to - last_t
        last_t = to

    for event in events:
        if event.event_type == "FINAL-PERIODO":
            advance(elapsed_at(period, 0))
            on_court = {"local": set(), "visitante": set()}
            continue
        if event.period is None or event.clock_s is None or event.side is None:
            continue  # inicio de partido o de período: no mueven el reloj ni tienen equipo
        period = event.period
        advance(elapsed_at(period, event.clock_s))
        player = event.source_player_id
        if event.event_type == "CAMBIO-JUGADOR-ENTRA" and player:
            on_court[event.side].add(player)
        elif event.event_type == "CAMBIO-JUGADOR-SALE" and player:
            on_court[event.side].discard(player)

        points = POINTS.get(event.event_type, 0)
        if points:
            rec.score[event.side] += points
            other = "visitante" if event.side == "local" else "local"
            for teammate in on_court[event.side]:
                rec.plus_minus[teammate] += points
            for rival in on_court[other]:
                rec.plus_minus[rival] -= points
            if player:
                rec.counters[player]["pts"] += points
            # Cada canasta trae el marcador corrido: tiene que coincidir con el reconstruido.
            shown = (event.score_home, event.score_away)
            if None not in shown and shown != (rec.score["local"], rec.score["visitante"]):
                rec.errors.append(f"marcador distinto en la jugada {event.seq}: {shown}")
        if player:
            for counter in COUNTERS.get(event.event_type, ()):
                rec.counters[player][counter] += 1
    return rec


# Contadores cuya diferencia NO invalida el play-by-play entero. La fuente omite algunas jugadas
# (huecos en la numeración `accion-N`) y en los 6 partidos auditados el 3-nov-2026 lo único que
# no cerró fueron faltas personales (1 o 2 menos en las jugadas). Las posesiones, quintetos,
# minutos y +/− no dependen de las faltas, así que esa diferencia solo deja `n/d` las tácticas
# de faltas y bonus del partido. Para volver a la regla estricta de 5.8, vaciar este conjunto.
FOUL_STATS = frozenset({"pf", "pf_drawn"})


@dataclass
class Validation:
    critical: list[str]  # si hay alguna, el play-by-play del partido no se usa (cuarentena)
    fouls: list[str]  # si hay alguna, solo las tácticas de faltas y bonus quedan `n/d`

    @property
    def pbp_ok(self) -> bool:
        return not self.critical

    @property
    def fouls_ok(self) -> bool:
        return not self.critical and not self.fouls


def validate(match: MatchData, *, seconds_tolerance: int = 5) -> Validation:
    """Compara el play-by-play reconstruido con el box score (marcador, contadores, minutos, +/−)."""
    rec = reconstruct(match.events)
    result = Validation(critical=list(rec.errors), fouls=[])
    final = (rec.score["local"], rec.score["visitante"])
    if final != (match.home.totals.pts, match.away.totals.pts):
        result.critical.append(f"marcador reconstruido {final} distinto del resultado")
    for team in (match.home, match.away):
        for line in team.players:
            pid = line.source_player_id
            got = rec.counters.get(pid, Counter())
            for stat in CHECKED:
                if got[stat] != getattr(line, stat):
                    bucket = result.fouls if stat in FOUL_STATS else result.critical
                    bucket.append(
                        f"{line.name}: {stat} {got[stat]} (jugadas) y {getattr(line, stat)} (box score)"
                    )
            if abs(rec.seconds[pid] - line.seconds) > seconds_tolerance:
                result.critical.append(
                    f"{line.name}: {rec.seconds[pid]} s (jugadas) y {line.seconds} s (box score)"
                )
            if rec.plus_minus[pid] != line.plus_minus:
                result.critical.append(
                    f"{line.name}: +/- {rec.plus_minus[pid]} (jugadas) y {line.plus_minus} (box score)"
                )
    return result
