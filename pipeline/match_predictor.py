"""Predictor de partidos de básquet: puntos de cada equipo por regresión lineal y margen normal.

Por qué no Poisson como en fútbol: en básquet se anotan 70 a 100 puntos por partido y no hay
empates; los puntos de un equipo se parecen a una normal (se prueba en el panel Probabilidad) y
el margen también. Modelo:

    puntos(T contra R) = β₀ + β₁·ataque(T) + β₂·defensa(R) + β₃·ritmo + β₄·tiro + β₅·pérdidas
                         + β₆·rebote + β₇·libres + β₈·Elo + β₉·forma + β₁₀·descanso + β₁₁·local

por mínimos cuadrados (cada partido da dos filas). Margen = puntos(L) − puntos(V) y
P(gana el local) = Φ(margen / σ), con σ el desvío del error del margen en los partidos de ajuste.

Cada variable se calcula solo con los partidos anteriores (sin mirar el futuro), pesados por
antigüedad: 0,5^(días / vida media). Ataque y defensa salen de los resultados (sirven para cualquier
liga con resultados); ritmo y cuatro factores salen del box score de la LNB (en otra liga quedan en
el promedio). Qué variables entran lo decide el backtest: se prueban combinaciones y queda la de
menor Brier. Una simulación de Monte Carlo repite el partido 10.000 veces y da lo mismo que Φ.

No se muestran cuotas: probabilidades en porcentaje (anti-referencia del producto: apuestas).
"""

from __future__ import annotations

import itertools
import math
import random
import unicodedata
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from pipeline import metrics as m
from pipeline import stats

SHRINK_GAMES = 3.0
SIMULATIONS = 10_000
SEED = 2026
MAX_SEASONS = 3  # la temporada actual y las dos anteriores (con API-Basketball)
HALF_LIFE_DAYS = 180.0
MIN_PRIOR = 16  # partidos de liga previos para preparar las variables de un partido
MIN_TRAIN_GAMES = 20  # partidos preparados antes de evaluar en el backtest
REFIT_EVERY = 10
FORM_GAMES = 5
REST_CAP = 7
LEAGUE_CODE = "lnb"
LEAGUE_COUNTRY = "Argentina"
LEAGUE_NAME = "Liga Nacional"
LOWER_DIVISION = "Rival de la Liga Argentina (2.ª categoría)"
LOWER_DIVISION_GAP = 0.06  # supuesto: anota y recibe un 6 % peor que el equipo más flojo de la LNB

VARIABLES: dict[str, tuple[str, str]] = {
    "ataque": (
        "Ataque propio",
        "Puntos que hace el equipo por partido contra el promedio de su liga (en ln).",
    ),
    "defensa": (
        "Defensa del rival",
        "Puntos que recibe el rival por partido contra el promedio de su liga (en ln).",
    ),
    "ritmo": (
        "Ritmo",
        "Posesiones por partido de los dos equipos contra el promedio: más posesiones, más puntos.",
    ),
    "tiro": (
        "Tiro (eFG%)",
        "Acierto propio más el que permite el rival, contra el promedio (puntos porcentuales).",
    ),
    "perdidas": (
        "Pérdidas",
        "Pérdidas por posesión propias más las que fuerza el rival, contra el promedio.",
    ),
    "rebote": ("Rebote ofensivo", "Rebote ofensivo propio más el que concede el rival, contra el promedio."),
    "libres": ("Libres", "Libres convertidos por tiro de campo, propios más los que concede el rival."),
    "elo": ("Elo", "Diferencia de Elo antes del partido, dividida por 400."),
    "forma": ("Forma", "Victorias en los últimos 5 menos las del rival (en proporción)."),
    "descanso": ("Descanso", "Días de descanso (hasta 7) menos los del rival."),
    "local": ("Localía", "1 si juega en su cancha; 0 de visitante o en cancha neutral."),
}
NAMES_ALL = list(VARIABLES)
CANDIDATES: dict[str, list[str]] = {
    "puntos": ["ataque", "defensa", "local"],
    "puntos + ritmo": ["ataque", "defensa", "ritmo", "local"],
    "cuatro factores": ["ataque", "defensa", "ritmo", "tiro", "perdidas", "rebote", "libres", "local"],
    "Elo y forma": ["ataque", "defensa", "ritmo", "elo", "forma", "local"],
    "todas": NAMES_ALL,
}
# Rasgos del perfil de un equipo que usa `side` (la web hace la misma cuenta con estos campos).
PROFILE_KEYS = (
    "att",
    "dfn",
    "pace",
    "efg",
    "efg_allowed",
    "tov",
    "tov_forced",
    "orb",
    "orb_allowed",
    "ftr",
    "ftr_allowed",
    "elo",
    "form",
)


def norm(name: str) -> str:
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return " ".join(plain.replace("(", " ").replace(")", " ").split())


def season_of(day: str) -> int:
    """Temporada de básquet por su año de inicio: de agosto a julio (2026-27 → 2026)."""
    d = date.fromisoformat(day[:10])
    return d.year if d.month >= 8 else d.year - 1


@dataclass(frozen=True)
class Result:
    date: str
    home: str
    away: str
    home_points: int
    away_points: int
    league: str = LEAGUE_CODE
    neutral: bool = False

    @property
    def keys(self) -> tuple[str, str]:
        return f"{self.league}:{norm(self.home)}", f"{self.league}:{norm(self.away)}"


@dataclass
class Box:
    """Totales de un equipo en un partido con box score (FGA, FTA, etc. propios y del rival)."""

    date: str
    team: str
    poss: float
    minutes: float
    efg: float
    efg_allowed: float
    tov: float
    tov_forced: float
    orb: float
    orb_allowed: float
    ftr: float
    ftr_allowed: float


def box_rows(game_rows: Sequence[Mapping[str, Any]], team_rows: Sequence[Mapping[str, Any]]) -> list[Box]:
    """Una fila por equipo y partido con los cuatro factores propios y del rival (box score de la LNB)."""
    by_game: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for r in team_rows:
        by_game[str(r["source_game_id"])].append(r)
    info = {str(g["source_game_id"]): g for g in game_rows}
    out = []
    for gid, sides in by_game.items():
        g = info.get(gid)
        if g is None or len(sides) != 2:
            continue
        names = {str(g["home_team_id"]): str(g["home_name"]), str(g["away_team_id"]): str(g["away_name"])}
        minutes = 40 + 5 * float(g.get("overtime_periods") or 0)
        for own, opp in ((sides[0], sides[1]), (sides[1], sides[0])):

            def tot(r: Mapping[str, Any]) -> dict[str, float]:
                f = {
                    k: float(r.get(k) or 0)
                    for k in ("fg2m", "fg2a", "fg3m", "fg3a", "ftm", "fta", "orb", "drb", "tov")
                }
                f["fga"], f["fgm"] = f["fg2a"] + f["fg3a"], f["fg2m"] + f["fg3m"]
                return f

            a, b = tot(own), tot(opp)
            poss = m.possessions(
                (a["fga"], a["fta"], a["orb"], a["tov"]), (b["fga"], b["fta"], b["orb"], b["tov"])
            )
            if poss <= 0 or a["fga"] <= 0 or b["fga"] <= 0:
                continue
            out.append(
                Box(
                    date=str(g["played_at"])[:10],
                    team=f"{LEAGUE_CODE}:{norm(names.get(str(own['team_id']), ''))}",
                    poss=poss,
                    minutes=minutes,
                    efg=(a["fgm"] + 0.5 * a["fg3m"]) / a["fga"],
                    efg_allowed=(b["fgm"] + 0.5 * b["fg3m"]) / b["fga"],
                    tov=a["tov"] / poss,
                    tov_forced=b["tov"] / poss,
                    orb=a["orb"] / max(1.0, a["orb"] + b["drb"]),
                    orb_allowed=b["orb"] / max(1.0, b["orb"] + a["drb"]),
                    ftr=a["ftm"] / a["fga"],
                    ftr_allowed=b["ftm"] / b["fga"],
                )
            )
    return out


def weight(day: str, ref: date) -> float:
    return float(0.5 ** ((ref - date.fromisoformat(day[:10])).days / HALF_LIFE_DAYS))


@dataclass
class State:
    """Perfiles de todos los equipos con los partidos hasta una fecha (sin incluirla)."""

    profiles: dict[str, dict[str, float]] = field(default_factory=dict)
    league_mu: dict[str, float] = field(default_factory=dict)  # puntos por equipo y partido de cada liga
    box_mu: dict[str, float] = field(default_factory=dict)
    last_game: dict[str, str] = field(default_factory=dict)


def build_state(results: Sequence[Result], boxes: Sequence[Box], as_of: str) -> State:
    ref = date.fromisoformat(as_of[:10])
    prior = [r for r in results if r.date < as_of]
    st = State()
    acc: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    lg: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    for r in prior:
        w = weight(r.date, ref)
        h, a = r.keys
        lg[r.league][0] += w * (r.home_points + r.away_points)
        lg[r.league][1] += 2 * w
        for k, pf, pa in ((h, r.home_points, r.away_points), (a, r.away_points, r.home_points)):
            acc[k]["w"] += w
            acc[k]["pf"] += w * pf
            acc[k]["pa"] += w * pa
        st.last_game[h] = st.last_game[a] = r.date
    st.league_mu = {k: s / n for k, (s, n) in lg.items() if n > 0}
    bacc: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    fields = ("efg", "efg_allowed", "tov", "tov_forced", "orb", "orb_allowed", "ftr", "ftr_allowed")
    btot: dict[str, float] = defaultdict(float)
    for b in boxes:
        if b.date >= as_of:
            continue
        w = weight(b.date, ref)
        pace = b.poss * 40 / b.minutes
        bacc[b.team]["w"] += w
        bacc[b.team]["pace"] += w * pace
        btot["w"] += w
        btot["pace"] += w * pace
        for f in fields:
            v = getattr(b, f)
            bacc[b.team][f] += w * v
            btot[f] += w * v
    st.box_mu = {k: v / btot["w"] for k, v in btot.items() if k != "w"} if btot["w"] else {}
    elo = elo_ratings(prior)
    forms = recent_form(prior)
    for k, v in acc.items():
        mu = st.league_mu.get(k.split(":", 1)[0], 80.0)
        prof = {
            "att": math.log((v["pf"] + SHRINK_GAMES * mu) / (v["w"] + SHRINK_GAMES) / mu),
            "dfn": math.log((v["pa"] + SHRINK_GAMES * mu) / (v["w"] + SHRINK_GAMES) / mu),
            "elo": elo.get(k, m.ELO_START),
            "form": forms.get(k, 0.5),
        }
        bv = bacc.get(k)
        for f in ("pace", *fields):
            # Encogido hacia el promedio de la liga; sin box score (otra liga), queda en 0.
            # (Σw·x + K·μ) / (Σw + K) − μ = (Σw·x − Σw·μ) / (Σw + K): el desvío encogido.
            prof[f] = (bv[f] - bv["w"] * st.box_mu[f]) / (bv["w"] + SHRINK_GAMES) if bv and st.box_mu else 0.0
        st.profiles[k] = prof
    return st


def elo_ratings(results: Sequence[Result]) -> dict[str, float]:
    games = [m.Game(r.date, *r.keys, r.home_points, r.away_points) for r in results]
    return m.elo_run(games)[1] if games else {}


def recent_form(prior: Sequence[Result]) -> dict[str, float]:
    """Proporción de victorias de cada equipo en sus últimos `FORM_GAMES` partidos (una pasada)."""
    wins: dict[str, list[float]] = defaultdict(list)
    for r in sorted(prior, key=lambda x: x.date, reverse=True):
        h, a = r.keys
        for k, won in ((h, r.home_points > r.away_points), (a, r.away_points > r.home_points)):
            if len(wins[k]) < FORM_GAMES:
                wins[k].append(float(won))
    return {k: stats.mean(v) for k, v in wins.items()}


def side(t: Mapping[str, float], r: Mapping[str, float], home: bool, rest: float = 0.0) -> dict[str, float]:
    """Variables del equipo T contra el rival R (mismo cálculo que web/lib/models/predictor.ts)."""
    return {
        "ataque": t["att"],
        "defensa": r["dfn"],
        "ritmo": (t["pace"] + r["pace"]) / 2,
        "tiro": 100 * (t["efg"] + r["efg_allowed"]),
        "perdidas": 100 * (t["tov"] + r["tov_forced"]),
        "rebote": 100 * (t["orb"] + r["orb_allowed"]),
        "libres": 100 * (t["ftr"] + r["ftr_allowed"]),
        "elo": (t["elo"] - r["elo"]) / 400,
        "forma": t["form"] - r["form"],
        "descanso": rest,
        "local": 1.0 if home else 0.0,
    }


NEUTRAL = dict.fromkeys(PROFILE_KEYS, 0.0) | {"elo": m.ELO_START, "form": 0.5}


def _rest(st: State, key: str, day: str) -> float:
    last = st.last_game.get(key)
    return (
        min(REST_CAP, (date.fromisoformat(day[:10]) - date.fromisoformat(last[:10])).days)
        if last
        else REST_CAP
    )


@dataclass(frozen=True)
class Prepared:
    game: Result
    home: dict[str, float]
    away: dict[str, float]


def prepare(results: Sequence[Result], boxes: Sequence[Box]) -> list[Prepared]:
    """Variables de cada partido de la LNB con solo lo anterior."""
    out = []
    ordered = sorted(results, key=lambda r: r.date)
    for idx, g in enumerate(ordered):
        if g.league != LEAGUE_CODE or sum(1 for r in ordered[:idx] if r.league == LEAGUE_CODE) < MIN_PRIOR:
            continue
        st = build_state(ordered, boxes, g.date)
        h, a = g.keys
        ph, pa = st.profiles.get(h, NEUTRAL), st.profiles.get(a, NEUTRAL)
        rh, ra = _rest(st, h, g.date), _rest(st, a, g.date)
        out.append(Prepared(g, side(ph, pa, not g.neutral, rh - ra), side(pa, ph, False, ra - rh)))
    return out


def _fit(rows: Sequence[Prepared], names: Sequence[str]) -> tuple[stats.OLS, float]:
    x = [[s[n] for n in names] for p in rows for s in (p.home, p.away)]
    y = [float(v) for p in rows for v in (p.game.home_points, p.game.away_points)]
    model = stats.ols(list(names), x, y)
    margins = [
        (p.game.home_points - p.game.away_points) - (model.fitted[2 * i] - model.fitted[2 * i + 1])
        for i, p in enumerate(rows)
    ]
    sd = math.sqrt(stats.variance(margins)) if len(margins) > 2 else 12.0
    return model, sd


def predict_points(model: stats.OLS, names: Sequence[str], s: Mapping[str, float]) -> float:
    return model.predict([s[n] for n in names])[0]


def evaluate(prepared: Sequence[Prepared], names: Sequence[str], season: int) -> dict[str, Any]:
    """Backtest de una combinación de variables sobre la temporada `season`, sin mirar el futuro."""
    brier = log_loss = brier_base = log_base = abs_margin = 0.0
    bins: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    rows: list[tuple[Prepared, float, float, float]] = []
    model: stats.OLS | None = None
    sd = 12.0
    n = 0
    for idx, pr in enumerate(prepared):
        if season_of(pr.game.date) != season:
            continue
        train = [x for x in prepared[:idx] if x.game.date < pr.game.date]
        if len(train) < MIN_TRAIN_GAMES:
            continue
        if model is None or n % REFIT_EVERY == 0:
            try:
                model, sd = _fit(train, names)
            except ValueError:
                continue
        ph, pa = predict_points(model, names, pr.home), predict_points(model, names, pr.away)
        p = stats.norm_cdf(ph - pa, 0, sd)
        won = pr.game.home_points > pr.game.away_points
        base = sum(x.game.home_points > x.game.away_points for x in train) / len(train)
        brier += (p - won) ** 2
        brier_base += (base - won) ** 2
        log_loss -= math.log(max(p if won else 1 - p, 1e-12))
        log_base -= math.log(max(base if won else 1 - base, 1e-12))
        abs_margin += abs((pr.game.home_points - pr.game.away_points) - (ph - pa))
        b = min(9, int(p * 10))
        bins[b][0] += 1
        bins[b][1] += int(won)
        rows.append((pr, ph, pa, sd))
        n += 1
    return {
        "evaluated": n,
        "brier": brier / n if n else None,
        "brier_base": brier_base / n if n else None,
        "log_loss": log_loss / n if n else None,
        "log_loss_base": log_base / n if n else None,
        "mae_margin": abs_margin / n if n else None,
        "accuracy": sum((r[1] > r[2]) == (r[0].game.home_points > r[0].game.away_points) for r in rows) / n
        if n
        else None,
        "calibration": [
            {"bin": b / 10, "predicted": k, "observed": hits / k if k else None}
            for b, (k, hits) in sorted(bins.items())
        ],
        "rows": rows,
    }


def simulate(
    pts_home: float, pts_away: float, sd_margin: float, sd_points: float, n: int = SIMULATIONS
) -> dict[str, Any]:
    """Monte Carlo: n partidos con margen normal. Frecuencias y medias muestrales."""
    rng = random.Random(SEED)  # noqa: S311 (simulación reproducible, no criptografía)
    wins = 0
    total = 0.0
    margins: list[float] = []
    for _ in range(n):
        margin = rng.gauss(pts_home - pts_away, sd_margin)
        wins += margin > 0
        margins.append(margin)
        total += rng.gauss(pts_home + pts_away, sd_points * math.sqrt(2))
    return {
        "n": n,
        "p_home": wins / n,
        "p_away": 1 - wins / n,
        "mean_margin": stats.mean(margins),
        "mean_total": total / n,
    }


def prediction(
    home: str, away: str, ph: float, pa: float, sd: float, sd_points: float, sim: bool
) -> dict[str, Any]:
    p = stats.norm_cdf(ph - pa, 0, sd)
    return {
        "home_team": home,
        "away_team": away,
        "pts_home": round(ph, 2),
        "pts_away": round(pa, 2),
        "p_home": p,
        "p_away": 1 - p,
        "margin_sd": sd,
        "detail": {"sim": simulate(ph, pa, sd, sd_points) if sim else None},
    }


# --- Pruebas e intervalos para el panel «Probabilidad» ---------------------------------------


def normal_gof(values: Sequence[float], width: float = 8.0) -> dict[str, Any]:
    """Bondad de ajuste χ² de una normal (μ y σ muestrales: 2 parámetros estimados) a los puntos.

    Clases de `width` puntos; las de las puntas se juntan hasta que la esperada sea al menos 5.
    """
    n = len(values)
    mu, sd = stats.mean(values), math.sqrt(stats.variance(values))
    lo = math.floor(min(values) / width) * width
    edges = [lo + i * width for i in range(int((max(values) - lo) // width) + 2)]
    obs = [float(sum(a <= v < b for v in values)) for a, b in itertools.pairwise(edges)]
    cdf = [stats.norm_cdf(e, mu, sd) for e in edges]
    exp = [n * (b - a) for a, b in itertools.pairwise(cdf)]
    exp[0] += n * cdf[0]
    exp[-1] += n * (1 - cdf[-1])
    labels = [f"{int(a)}–{int(b) - 1}" for a, b in itertools.pairwise(edges)]
    while len(exp) > 3 and exp[0] < 5:
        exp[1] += exp.pop(0)
        obs[1] += obs.pop(0)
        labels[1] = f"≤ {labels[1].split('–')[1]}"
        labels.pop(0)
    while len(exp) > 3 and exp[-1] < 5:
        exp[-2] += exp.pop()
        obs[-2] += obs.pop()
        labels[-2] = f"≥ {labels[-2].split('–')[0]}"
        labels.pop()
    stat, df, p = stats.chi2_gof(obs, exp, estimated=2)
    return {
        "mean": mu,
        "sd": sd,
        "n": n,
        "statistic": stat,
        "df": df,
        "p_value": p,
        "labels": labels,
        "observed": obs,
        "expected": [round(e, 3) for e in exp],
    }


def _decision(p: float, null_es: str) -> str:
    return (
        f"Con p = {p:.3f} < 0,05 se rechaza que {null_es}."
        if p < 0.05
        else f"Con p = {p:.3f} ≥ 0,05 no hay evidencia para rechazar que {null_es}."
    )


def stat_tests(results: Sequence[Result], team: str) -> list[dict[str, Any]]:
    key = f"{LEAGUE_CODE}:{norm(team)}"
    own = [r for r in results if key in r.keys]
    tests: list[dict[str, Any]] = []
    if len(own) >= 6:
        pf = [float(r.home_points if r.keys[0] == key else r.away_points) for r in own]
        pa = [float(r.away_points if r.keys[0] == key else r.home_points) for r in own]
        for test_id, pts, label in (
            ("gof_puntos_favor", pf, "a favor"),
            ("gof_puntos_contra", pa, "en contra"),
        ):
            gof = normal_gof(pts)
            if gof["df"] >= 1 and len(gof["observed"]) >= 4:
                tests.append(
                    {
                        "test_id": test_id,
                        "title_es": f"¿Los puntos {label} siguen una normal?",
                        "statistic": gof["statistic"],
                        "df": gof["df"],
                        "p_value": gof["p_value"],
                        "decision_es": _decision(
                            gof["p_value"], f"los puntos {label} por partido sean normales"
                        ),
                        "detail": gof,
                    }
                )
        mean_pf, low, high = stats.mean_ci(pf)
        tests.append(
            {
                "test_id": "ic_puntos_favor",
                "title_es": "Intervalo de confianza del 95 % para los puntos a favor por partido",
                "statistic": mean_pf,
                "df": len(pf) - 1,
                "p_value": None,
                "decision_es": f"La media verdadera está entre {low:.1f} y {high:.1f} con 95 % de confianza.",
                "detail": {
                    "mean": mean_pf,
                    "low": low,
                    "high": high,
                    "n": len(pf),
                    "sd": math.sqrt(stats.variance(pf)),
                },
            }
        )
        home = [pf[i] - pa[i] for i, r in enumerate(own) if r.keys[0] == key]
        away = [pf[i] - pa[i] for i, r in enumerate(own) if r.keys[1] == key]
        if len(home) >= 2 and len(away) >= 2:
            # Welch: compara las medias del margen de local y de visitante sin suponer varianzas iguales.
            vh, va = stats.variance(home) / len(home), stats.variance(away) / len(away)
            t = (stats.mean(home) - stats.mean(away)) / math.sqrt(vh + va) if vh + va > 0 else 0.0
            df = (
                (vh + va) ** 2 / ((vh**2) / (len(home) - 1) + (va**2) / (len(away) - 1)) if vh and va else 1.0
            )
            p = stats.t_two_sided_p(t, df)
            tests.append(
                {
                    "test_id": "t_margen_localia",
                    "title_es": "¿El margen de local es distinto del de visitante? (t de Welch)",
                    "statistic": t,
                    "df": round(df),
                    "p_value": p,
                    "decision_es": _decision(p, "el margen medio de local y de visitante sean iguales"),
                    "detail": {
                        "mean_home": stats.mean(home),
                        "mean_away": stats.mean(away),
                        "n_home": len(home),
                        "n_away": len(away),
                    },
                }
            )
        table = [[0.0, 0.0], [0.0, 0.0]]
        for i, r in enumerate(own):
            table[0 if r.keys[0] == key else 1][0 if pf[i] > pa[i] else 1] += 1
        if all(sum(row) > 0 for row in table) and all(sum(c) > 0 for c in zip(*table, strict=True)):
            stat, df_i, p, expected = stats.chi2_independence(table)
            played = sum(map(sum, table))
            tests.append(
                {
                    "test_id": "indep_localia_resultado",
                    "title_es": "¿El resultado es independiente de jugar de local?",
                    "statistic": stat,
                    "df": df_i,
                    "p_value": p,
                    "decision_es": _decision(p, "localía y resultado sean independientes"),
                    "detail": {
                        "rows": ["Local", "Visitante"],
                        "cols": ["Gana", "Pierde"],
                        "observed": table,
                        "expected": [[round(e, 2) for e in row] for row in expected],
                        "p_win": sum(row[0] for row in table) / played,
                        "p_win_given_home": table[0][0] / sum(table[0]),
                        "p_win_given_away": table[1][0] / sum(table[1]),
                        "small_expected": any(e < 5 for row in expected for e in row),
                    },
                }
            )
    league_pts = [
        float(v) for r in results if r.league == LEAGUE_CODE for v in (r.home_points, r.away_points)
    ]
    if len(league_pts) >= 30:
        gof = normal_gof(league_pts)
        tests.append(
            {
                "test_id": "gof_puntos_liga",
                "title_es": "Puntos por equipo y partido en toda la liga contra una normal",
                "statistic": gof["statistic"],
                "df": gof["df"],
                "p_value": gof["p_value"],
                "decision_es": _decision(gof["p_value"], "los puntos de la liga sean normales"),
                "detail": gof,
            }
        )
    return tests


def run(
    results: Sequence[Result],
    boxes: Sequence[Box],
    team: str,
    team_slug: str,
    zone: Mapping[str, Mapping[str, str]] | None = None,
) -> dict[str, Any]:
    """Run del predictor: el modelo (β y σ), el perfil de cada club, el backtest y las pruebas.

    La web calcula cualquier cruce con esos β: un club, la media de una liga, de un país o de toda
    la zona. `zone`: liga → {country, league} de las ligas de otros países con resultados.
    """
    season = max(season_of(r.date) for r in results) if results else date.today().year
    current = [r for r in results if r.league == LEAGUE_CODE and season_of(r.date) == season]
    tests = stat_tests(current, team)
    prepared = prepare(results, boxes)
    tried = {label: evaluate(prepared, names, season) for label, names in CANDIDATES.items()}
    scored = {k: v for k, v in tried.items() if v["brier"] is not None}
    params = {
        "simulations": SIMULATIONS,
        "min_prior": MIN_PRIOR,
        "min_train": MIN_TRAIN_GAMES,
        "team_name": team,
        "max_seasons": MAX_SEASONS,
        "half_life_days": HALF_LIFE_DAYS,
        "seasons": sorted({f"{s}-{str(s + 1)[2:]}" for s in {season_of(r.date) for r in results}}),
        "variables": [{"id": k, "label": v[0], "help": v[1]} for k, v in VARIABLES.items()],
        "league_country": LEAGUE_COUNTRY,
        "league_name": LEAGUE_NAME,
        "lower_division_gap": LOWER_DIVISION_GAP,
        "profile_keys": list(PROFILE_KEYS),
    }
    if not scored:
        return {
            "run": {
                "model": "predictor_partido",
                "team_slug": team_slug,
                "status": "sin_datos",
                "n": len(results),
                "metrics": {},
                "params": params,
                "message": (
                    f"Hay {len(current)} partidos de liga esta temporada "
                    f"y hacen falta {MIN_PRIOR + MIN_TRAIN_GAMES + 1}."
                ),
            },
            "predictions": [],
            "strengths": [],
            "tests": tests,
        }
    best = min(scored, key=lambda label: scored[label]["brier"])
    names = CANDIDATES[best]
    model, sd_margin = _fit(prepared, names)
    sd_points = math.sqrt(model.s2)
    last = max(r.date for r in results)
    st = build_state(results, boxes, last + "~")  # "~" > cualquier hora: incluye el último día
    key = f"{LEAGUE_CODE}:{norm(team)}"
    names_by_key: dict[str, str] = {}
    games_by_key: dict[str, list[float]] = defaultdict(lambda: [0, 0, 0])
    for r in results:
        for k, name, pf, pa in (
            (r.keys[0], r.home, r.home_points, r.away_points),
            (r.keys[1], r.away, r.away_points, r.home_points),
        ):
            names_by_key[k] = name
            if season_of(r.date) == season:
                games_by_key[k][0] += 1
                games_by_key[k][1] += pf
                games_by_key[k][2] += pa

    def club(
        k: str,
        competition: str,
        country: str | None,
        league: str | None,
        estimated: bool,
        profile: Mapping[str, float] | None = None,
        name: str | None = None,
    ) -> dict[str, Any]:
        prof = dict(profile or st.profiles.get(k, NEUTRAL))
        g = games_by_key.get(k, [0, 0, 0])
        return {
            "team_name": name or names_by_key.get(k, k),
            "competition": competition,
            "country": country,
            "league": league,
            "estimated": estimated,
            "games": int(g[0]),
            "points_for": int(g[1]),
            "points_against": int(g[2]),
            "profile": {p: round(prof[p], 5) for p in PROFILE_KEYS},
            "elo": prof["elo"],
            "form": prof["form"],
        }

    in_league = [
        k for k in st.profiles if k.startswith(f"{LEAGUE_CODE}:") and games_by_key.get(k, [0])[0] > 0
    ]
    strengths = [club(k, "liga", LEAGUE_COUNTRY, LEAGUE_NAME, False) for k in in_league]
    if in_league:
        weakest = min((st.profiles[k] for k in in_league), key=lambda p: p["att"] - p["dfn"])
        lower = dict(weakest) | {
            "att": weakest["att"] + math.log(1 - LOWER_DIVISION_GAP),
            "dfn": weakest["dfn"] - math.log(1 - LOWER_DIVISION_GAP),
            "elo": weakest["elo"] - 100,
        }
        strengths.append(
            club("ascenso", "ascenso", LEAGUE_COUNTRY, "Liga Argentina", True, lower, LOWER_DIVISION)
        )
    for k in st.profiles:
        league = k.split(":", 1)[0]
        if league != LEAGUE_CODE and league in (zone or {}) and games_by_key.get(k, [0])[0] > 0:
            z = (zone or {})[league]
            strengths.append(club(k, "zona", z.get("country"), z.get("league"), False))

    chosen = tried[best]
    backtest = [
        {
            **prediction(pr.game.home, pr.game.away, ph, pa, sd, sd_points, sim=False),
            "kind": "backtest",
            "match_date": pr.game.date[:10],
            "actual_home": pr.game.home_points,
            "actual_away": pr.game.away_points,
            "competition": "liga",
            "neutral": pr.game.neutral,
        }
        for pr, ph, pa, sd in chosen["rows"]
        if key in pr.game.keys
    ]
    coefs = [
        {
            "id": c.name,
            "label": VARIABLES[c.name][0] if c.name in VARIABLES else "Intercepto",
            "coef": c.value,
            "std_err": c.std_err,
            "t": c.t,
            "p_value": c.p,
            "low": c.low,
            "high": c.high,
        }
        for c in model.coefs
    ]
    return {
        "run": {
            "model": "predictor_partido",
            "team_slug": team_slug,
            "status": "ok" if key in st.profiles else "sin_datos",
            "n": len(results),
            "metrics": {
                **{k: v for k, v in chosen.items() if k != "rows"},
                "chosen": best,
                # Lo que necesita la web para calcular cualquier cruce: puntos = β₀ + Σ β·variable.
                "model": {
                    "names": names,
                    "beta": [c.value for c in model.coefs],
                    "sd_margin": sd_margin,
                    "sd_points": sd_points,
                },
                "r2": model.r2,
                "adj_r2": model.adj_r2,
                "rows": model.n,
                "league_mu": st.league_mu.get(LEAGUE_CODE),
                "box_mu": st.box_mu,
                "variables": [
                    {
                        "label": label,
                        "names": CANDIDATES[label],
                        "brier": r["brier"],
                        "log_loss": r["log_loss"],
                        "mae_margin": r["mae_margin"],
                        "accuracy": r["accuracy"],
                    }
                    for label, r in tried.items()
                ],
                "coefs": coefs,
                "neutral_profile": NEUTRAL,
            },
            "params": params,
            "message": None if key in st.profiles else f"{team} no aparece en los resultados de la liga.",
        },
        "predictions": backtest,
        "strengths": strengths,
        "tests": tests,
    }
