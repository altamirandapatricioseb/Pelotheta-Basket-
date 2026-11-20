"""Valor: regresión lineal por mínimos cuadrados con todos los jugadores de la liga.

Qué compara (lo que «el modelo cree que vale» contra lo que «realmente vale»):
- Con valores de mercado cargados (`data/manual/market_values.csv`, al menos `needed` jugadores de
  la liga): ln(valor) = β₀ + β·producción + β·edad. Igual que Pelotheta fútbol.
- Sin valores (hoy: la LNB no publica sueldos ni pases y no hay un Transfermarkt abierto de
  básquet, ver docs/source_audit.md), el «precio» observable es el que paga el entrenador:
  **minutos por partido**. minutos = β₀ + β·producción cada 36 + β·edad. El residuo dice quién
  juega más o menos de lo que su producción justifica: un suplente que produce como titular es el
  jugador «barato» que busca Moneyball.

El error se mide fuera de muestra (el equipo elegido fuera del ajuste y validación cruzada en
toda la liga). Sin datos suficientes no se entrena (estado «sin_datos»): no se inventa nada.
"""

from __future__ import annotations

import math
import statistics
from collections.abc import Mapping, Sequence
from typing import Any

from pipeline import stats

EXTRA_ROWS = 10  # filas de más sobre la cantidad de coeficientes para que la inferencia tenga sentido
GAP_PCT = 20.0  # |real − predicho| / predicho por encima de esto se marca como diferencia
FOLDS = 5
N_COMPARABLES = 6
MIN_GAMES = 3
MIN_MINUTES = 40
MIN_FEATURE_COVERAGE = 0.7  # una variable con menos cobertura (la edad, si faltan fichas) no entra
BASE = 36.0

# (id, etiqueta, qué significa en criollo). Las de producción son cada 36 minutos.
FEATURES: tuple[tuple[str, str, str], ...] = (
    ("pts", "Puntos", "Puntos cada 36 minutos."),
    ("trb", "Rebotes", "Rebotes (ofensivos y defensivos) cada 36 minutos."),
    ("ast", "Asistencias", "Asistencias cada 36 minutos."),
    ("stl", "Robos", "Robos cada 36 minutos."),
    ("blk", "Tapones", "Tapones cada 36 minutos."),
    ("tov", "Pérdidas", "Pérdidas cada 36 minutos: cuestan minutos."),
    ("pf", "Faltas", "Faltas personales cada 36 minutos: con 5 se va del partido."),
    ("ts", "Tiro verdadero", "Puntos por intento de tiro (los libres cuentan 0,44): la eficiencia."),
    ("edad", "Edad", "Años del jugador."),
    ("edad2", "Edad²", "La edad al cuadrado: permite que el rol suba hasta un pico y después baje."),
)

TARGETS = {
    "minutos": {
        "label": "Minutos por partido",
        "unit": "min",
        "scale": "lineal",
        "real": "Minutos que le da el entrenador",
        "model": "Minutos que su producción justifica",
    },
    "valor": {
        "label": "Valor de mercado",
        "unit": "USD",
        "scale": "log",
        "real": "Valor de mercado cargado",
        "model": "Valor que el modelo espera",
    },
}

Row = Mapping[str, Any]


def features_of(p: Row) -> dict[str, float | None]:
    st = p.get("stats") or {}
    minutes = float(p.get("minutes") or 0)
    age = p.get("age")
    out: dict[str, float | None] = {}
    for key in ("pts", "ast", "stl", "blk", "tov", "pf"):
        out[key] = float(st.get(key, 0)) * BASE / minutes if minutes else None
    out["trb"] = (float(st.get("orb", 0)) + float(st.get("drb", 0))) * BASE / minutes if minutes else None
    shots = 2 * (float(st.get("fg2a", 0)) + float(st.get("fg3a", 0)) + 0.44 * float(st.get("fta", 0)))
    out["ts"] = float(st.get("pts", 0)) / shots if shots > 0 else None
    out["edad"] = float(age) if age is not None else None
    out["edad2"] = float(age) ** 2 if age is not None else None
    return out


def _mpg(p: Row) -> float:
    return float(p.get("minutes") or 0) / max(1, int(p.get("games") or 0))


def _sin_datos(team_slug: str, n: int, params: dict[str, Any], message: str) -> dict[str, Any]:
    return {
        "run": {
            "model": "valor_mercado",
            "team_slug": team_slug,
            "status": "sin_datos",
            "n": n,
            "metrics": {},
            "params": params,
            "message": message,
        },
        "predictions": [],
        "coefs": [],
    }


def fit(league: Sequence[Row], team_slug: str, team_id: str) -> dict[str, Any]:
    """Run del modelo: {'run', 'predictions', 'coefs'} listo para la base.

    `league`: todos los jugadores de la liga (source_player_id, name, team, team_id, age, games,
    minutes, stats y, si hay, value). Los del equipo elegido son los de `team_id`.
    """
    played = [
        p for p in league if int(p.get("games") or 0) >= MIN_GAMES and (p.get("minutes") or 0) >= MIN_MINUTES
    ]
    valued = [p for p in played if p.get("value")]
    feats = {id(p): features_of(p) for p in played}
    coverage = {
        f: sum(feats[id(p)][f] is not None for p in played) / max(1, len(played)) for f, _, _ in FEATURES
    }
    names = [f for f, _, _ in FEATURES if coverage[f] >= MIN_FEATURE_COVERAGE]
    needed = len(names) + 1 + EXTRA_ROWS
    target = "valor" if len(valued) >= needed else "minutos"
    meta = TARGETS[target]
    pool = valued if target == "valor" else played
    params: dict[str, Any] = {
        "target": target,
        **meta,
        "features": [{"id": f, "label": label, "help": text} for f, label, text in FEATURES if f in names],
        "dropped": [f for f, _, _ in FEATURES if f not in names],
        "gap_pct": GAP_PCT,
        "needed_rows": needed,
        "valued_rows": len(valued),
        "min_games": MIN_GAMES,
        "min_minutes": MIN_MINUTES,
        "source": "Liga Nacional de Básquet (box score de toda la liga)",
    }
    data = [(p, feats[id(p)]) for p in pool if all(feats[id(p)][n] is not None for n in names)]
    if len(data) < needed:
        return _sin_datos(
            team_slug, len(data), params, f"Hay {len(data)} jugadores con datos y {needed} hacen falta."
        )

    def y_of(p: Row) -> float:
        return math.log(float(p["value"])) if target == "valor" else _mpg(p)

    def back(v: float) -> float:
        return math.exp(v) if target == "valor" else max(0.0, v)

    x = [[float(f[n] or 0) for n in names] for _, f in data]
    y = [y_of(p) for p, _ in data]
    try:
        model = stats.ols(names, x, y)
    except ValueError as exc:
        return _sin_datos(team_slug, len(data), params, f"No se pudo ajustar: {exc}.")

    # Error honesto: el equipo elegido fuera del ajuste, y validación cruzada en toda la liga.
    inside = [i for i, (p, _) in enumerate(data) if str(p.get("team_id")) == team_id]
    outside = [i for i in range(len(data)) if i not in set(inside)]
    oos: dict[int, float] = {}
    if inside and len(outside) >= needed:
        m_out = stats.ols(names, [x[i] for i in outside], [y[i] for i in outside])
        oos = {i: m_out.predict(x[i])[0] for i in inside}
    cv: list[tuple[float, float]] = []  # (real, predicho) en la escala original
    for k in range(FOLDS):
        train = [i for i in range(len(data)) if i % FOLDS != k]
        m_k = stats.ols(names, [x[i] for i in train], [y[i] for i in train])
        cv += [(back(y[i]), back(m_k.predict(x[i])[0])) for i in range(len(data)) if i % FOLDS == k]

    def abs_err(pairs: Sequence[tuple[float, float]]) -> list[float]:
        return [abs(r - p) for r, p in pairs]

    def pct_err(pairs: Sequence[tuple[float, float]]) -> list[float]:
        return [abs(r - p) / r * 100 for r, p in pairs if r > 0]

    means = {n: stats.mean([row[j] for row in x]) for j, n in enumerate(names)}
    coefs = {c.name: c.value for c in model.coefs}
    average = back(coefs["intercepto"] + sum(coefs[n] * means[n] for n in names))
    # Para los comparables: producción en escala z (la edad no: compara cómo juega, no cuántos años tiene).
    prod = [n for n in names if n not in ("edad", "edad2")]
    cols = [[row[names.index(n)] for row in x] for n in prod]
    zs = [list(r) for r in zip(*stats.zscores(cols), strict=True)]

    predictions: list[dict[str, Any]] = []
    oos_pairs: list[tuple[float, float]] = []
    for i in inside:
        p, f = data[i]
        y_hat, low, high = model.predict(x[i])
        actual, predicted = back(y[i]), back(y_hat)
        if i in oos:
            oos_pairs.append((actual, back(oos[i])))
        if target == "valor":
            effects = {n: math.exp(coefs[n] * (float(f[n] or 0) - means[n])) - 1 for n in names}
        else:
            effects = {n: coefs[n] * (float(f[n] or 0) - means[n]) for n in names}
        if "edad" in effects and "edad2" in effects:
            effects["edad"] += effects.pop("edad2")
        near = sorted(
            (j for j in range(len(data)) if j not in set(inside)), key=lambda j: stats.dist(zs[i], zs[j])
        )[:N_COMPARABLES]
        predictions.append(
            {
                "source_player_id": p["source_player_id"],
                "actual_eur": round(actual, 2),
                "predicted_eur": round(predicted, 2),
                "low_eur": round(back(low), 2),
                "high_eur": round(back(high), 2),
                "residual_pct": round((actual - predicted) / predicted * 100, 1) if predicted > 0 else None,
                "features": {n: round(float(f[n] or 0), 4) for n in names},
                "detail": {
                    # Aporte de cada variable frente al jugador promedio de la liga.
                    "average_eur": round(average, 2),
                    "market_eur": round(predicted, 2),
                    "oos_eur": round(back(oos[i]), 2) if i in oos else None,
                    "effects": {k: round(v, 4) for k, v in effects.items()},
                    "age": p.get("age"),
                    "games": p.get("games"),
                    "minutes": p.get("minutes"),
                    "starts": p.get("starts"),
                    "history": list(p.get("history") or []),
                    "performance": {
                        "mpg": round(_mpg(p), 1),
                        "efficiency_pg": round(
                            float((p.get("stats") or {}).get("efficiency", 0))
                            / max(1, int(p.get("games") or 0)),
                            1,
                        ),
                        "plus_minus_pg": round(
                            float((p.get("stats") or {}).get("plus_minus", 0))
                            / max(1, int(p.get("games") or 0)),
                            1,
                        ),
                    },
                    "comparables": [
                        {
                            "name": data[j][0].get("name"),
                            "team": data[j][0].get("team"),
                            "age": data[j][0].get("age"),
                            "value_eur": round(back(y[j]), 2),
                            "predicted_eur": round(back(model.fitted[j]), 2),
                        }
                        for j in near
                    ],
                },
            }
        )

    # La nube de la liga (real contra predicho) para el gráfico de dispersión del detalle.
    cloud = [
        {"name": p.get("name"), "team": p.get("team"), "actual": round(back(y[i]), 2),
         "predicted": round(back(model.fitted[i]), 2), "own": i in set(inside)}
        for i, (p, _) in enumerate(data)
    ]  # fmt: skip
    residuals_scaled = [r for r in model.residuals]
    return {
        "run": {
            "model": "valor_mercado",
            "team_slug": team_slug,
            "status": "ok" if predictions else "sin_datos",
            "n": model.n,
            "metrics": {
                "r2": model.r2,
                "adj_r2": model.adj_r2,
                "rmse": model.rmse,
                "mae_in": stats.mean([abs(e) for e in residuals_scaled]) if target == "minutos" else None,
                "median_ape_in": statistics.median(
                    pct_err([(back(a), back(b)) for a, b in zip(y, model.fitted, strict=True)])
                ),
                "mae_oos": stats.mean(abs_err(oos_pairs)) if oos_pairs else None,
                "median_ape_oos": statistics.median(pct_err(oos_pairs)) if oos_pairs else None,
                "mae_cv": stats.mean(abs_err(cv)),
                "median_ape_cv": statistics.median(pct_err(cv)),
                "n_oos": len(oos_pairs),
                "average_eur": average,
                "means": means,
                "residual_sd": math.sqrt(model.s2),
                "cloud": cloud,
                "residual_hist": _histogram(residuals_scaled),
            },
            "params": params,
            "message": None if predictions else "Ningún jugador del equipo tiene minutos y datos completos.",
        },
        "predictions": predictions,
        "coefs": [
            {
                "feature": c.name,
                "coef": c.value,
                "std_err": c.std_err,
                "t_stat": c.t,
                "p_value": c.p,
                "ci_low": c.low,
                "ci_high": c.high,
            }
            for c in model.coefs
        ],
    }


def _histogram(values: Sequence[float], bins: int = 12) -> list[dict[str, float]]:
    """Frecuencias de los residuos para ver si se parecen a una normal (supuesto de la inferencia)."""
    lo, hi = min(values), max(values)
    width = (hi - lo) / bins or 1.0
    counts = [0] * bins
    for v in values:
        counts[min(bins - 1, int((v - lo) / width))] += 1
    sd = math.sqrt(stats.variance(values)) if len(values) > 1 else 1.0
    n = len(values)
    return [
        {
            "from": round(lo + b * width, 3),
            "to": round(lo + (b + 1) * width, 3),
            "count": counts[b],
            "normal": round(
                n * (stats.norm_cdf(lo + (b + 1) * width, 0, sd) - stats.norm_cdf(lo + b * width, 0, sd)), 2
            ),
        }
        for b in range(bins)
    ]
