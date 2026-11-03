"""Índice de rendimiento, Mejoría α y β, Potencial α y β (sección 6.1). Funciones puras.

Son métricas **estimadas** y propuestas de este sistema. Todos los parámetros son supuestos de
arranque configurables; acá viven como constantes con el mismo valor que el prompt.

Estado de los datos al 3-nov-2026 (ver docs/metricas_propias.md):
- Índice de rendimiento: calculable (referencia = plantel; la LNB no publica posiciones, así que
  se usan los pesos «sin posición»).
- Mejoría α y Potencial α: necesitan la posición para elegir el set de estadísticas -> n/d.
- Potencial β: necesita la edad (fecha de nacimiento) -> n/d.
- Mejoría β: necesita dos bloques de al menos 6 apariciones (12 en total) -> n/d hasta entonces.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

# Pesos del índice por posición (6.1.1). A anotación, C creación, B rebote, D defensa,
# E eficiencia e impacto, P participación.
WEIGHTS: dict[str, dict[str, float]] = {
    "base_escolta": {"A": 0.25, "C": 0.30, "B": 0.05, "D": 0.15, "E": 0.20, "P": 0.05},
    "alero": {"A": 0.25, "C": 0.15, "B": 0.15, "D": 0.20, "E": 0.20, "P": 0.05},
    "interno": {"A": 0.20, "C": 0.10, "B": 0.25, "D": 0.25, "E": 0.15, "P": 0.05},
    "sin_posicion": {"A": 0.25, "C": 0.20, "B": 0.15, "D": 0.20, "E": 0.15, "P": 0.05},
}
MIN_COVERAGE = 0.6
K_ALPHA = 120  # confiabilidad por minutos de la Mejoría α
K_LEVEL = 400  # reducción por muestra chica del nivel actual (Potenciales)
PEAK_AGE, GROWTH_PER_YEAR, TREND_WEIGHT = 26.0, 2.0, 0.5
BLOCK_MIN_APPEARANCES = 6  # Mejoría β: mínimo por bloque


def percent_rank(values: Sequence[float], value: float, higher_is_better: bool = True) -> float | None:
    """Percentil 0 a 100 como `percent_rank` de SQL: (posición − 1) / (n − 1), invertido si conviene."""
    if len(values) < 2:
        return None
    below = sum(v < value for v in values)
    pct = min(100.0, 100 * below / (len(values) - 1))
    return pct if higher_is_better else 100 - pct


def performance_index(
    components: Mapping[str, float | None], weights: Mapping[str, float]
) -> tuple[float | None, float]:
    """R = Σ peso × componente, sacando los componentes n/d y reescalando los pesos (6.1.1).

    Devuelve (R, cobertura). Con cobertura menor a 0,6 el índice queda n/d.
    """
    available = {k: v for k, v in components.items() if v is not None and k in weights}
    coverage = sum(weights[k] for k in available)
    if coverage < MIN_COVERAGE:
        return None, coverage
    return sum(weights[k] * v for k, v in available.items()) / coverage, coverage


def clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def standardized_change(recent: float, base: float, sigma: float, higher_is_better: bool) -> float | None:
    """z_s = signo × (tasa_R − tasa_B) / σ_s, recortado a ±3 (6.1.2)."""
    if not sigma:
        return None
    sign = 1 if higher_is_better else -1
    return clip(sign * (recent - base) / sigma, -3, 3)


def mejoria_alpha(
    z_values: Sequence[tuple[float, float]], minutes_recent: float, minutes_base: float
) -> float | None:
    """Mejoría α = 50 + 16,7 × w × Z, con Z el promedio ponderado de los z_s (peso, z) y
    w = min(Min_R, Min_B) / (min + K). Recortada a 0–100; con menos de 3 estadísticas, n/d."""
    if len(z_values) < 3:
        return None
    total_weight = sum(w for w, _ in z_values)
    z = sum(w * value for w, value in z_values) / total_weight
    shortest = min(minutes_recent, minutes_base)
    reliability = shortest / (shortest + K_ALPHA) if shortest + K_ALPHA else 0.0
    return clip(50 + 16.7 * reliability * z, 0, 100)


def mejoria_beta(recent_index: float | None, previous_index: float | None) -> float | None:
    """Mejoría β = R_reciente − R_anterior, en puntos del índice (6.1.3)."""
    if recent_index is None or previous_index is None:
        return None
    return recent_index - previous_index


def shrink(level: float, minutes: float, k: float = K_LEVEL) -> float:
    """Nivel con reducción por muestra chica: 50 + (nivel − 50) × Min / (Min + K)."""
    return 50 + (level - 50) * minutes / (minutes + k)


def potencial_alpha(
    raw_level: float, minutes: float, age: float | None, mejoria_a: float | None
) -> tuple[float, float, float] | None:
    """Potencial α = min(100, N + G × años × (1 + λ × M)), con su rango de ± 8 (6.1.4).

    Sin edad no hay potencial (n/d). Si la Mejoría α es n/d, M = 0.
    """
    if age is None:
        return None
    level = shrink(raw_level, minutes)
    years = max(0.0, PEAK_AGE - age)
    trend = 0.0 if mejoria_a is None else (mejoria_a - 50) / 50
    value = min(100.0, level + GROWTH_PER_YEAR * years * (1 + TREND_WEIGHT * trend))
    return value, max(0.0, value - 8), min(100.0, value + 8)


def age_factor(age: float) -> float:
    """F_edad por bandas (6.1.5)."""
    for limit, factor in ((20, 1.00), (23, 0.90), (26, 0.75), (29, 0.55), (32, 0.35)):
        if age < limit:
            return factor
    return 0.15


def potencial_beta(index: float, minutes: float, age: float | None, mejoria_b: float | None) -> float | None:
    """Potencial β = min(100, 0,60 R* + 0,25 T + 0,15 × 100 × F_edad) (6.1.5). Sin edad, n/d."""
    if age is None:
        return None
    level = shrink(index, minutes)
    trend = level if mejoria_b is None else clip(level + mejoria_b, 0, 100)
    return min(100.0, 0.60 * level + 0.25 * trend + 0.15 * 100 * age_factor(age))
