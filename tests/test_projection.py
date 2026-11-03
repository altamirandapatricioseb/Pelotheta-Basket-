"""Pruebas de la sección 6.1: cada ejemplo numérico del prompt reproducido y propiedades."""

from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from pipeline import projection as p


def test_ejemplo_indice_de_un_base() -> None:
    # A = 70, C = 80, B = 30, D = 50, E = 75, P = 60 -> R = 68,5
    comps = {"A": 70, "C": 80, "B": 30, "D": 50, "E": 75, "P": 60}
    value, coverage = p.performance_index(comps, p.WEIGHTS["base_escolta"])
    assert value == pytest.approx(68.5)
    assert coverage == pytest.approx(1)


def test_indice_reescala_y_queda_nd_con_poca_cobertura() -> None:
    weights = p.WEIGHTS["sin_posicion"]
    value, coverage = p.performance_index({"A": 80, "C": 60, "B": None, "D": 40, "E": None, "P": 50}, weights)
    assert coverage == pytest.approx(0.70)
    assert value == pytest.approx((0.25 * 80 + 0.20 * 60 + 0.20 * 40 + 0.05 * 50) / 0.70)
    assert p.performance_index({"A": 80, "P": 50}, weights) == (None, pytest.approx(0.30))


def test_ejemplo_mejoria_alpha() -> None:
    # TS% 0,60 en R y 0,54 en B con σ = 0,04 -> z = 1,5
    assert p.standardized_change(0.60, 0.54, 0.04, True) == pytest.approx(1.5)
    # Z = 0,5 con 240 minutos en R y 600 en B -> w ≈ 0,667 y Mejoría α ≈ 55,6
    value = p.mejoria_alpha([(1, 0.5), (1, 0.5), (2, 0.5)], 240, 600)
    assert value == pytest.approx(55.6, abs=0.05)


def test_ejemplo_mejoria_beta() -> None:
    assert p.mejoria_beta(68.5, 61.0) == pytest.approx(7.5)
    assert p.mejoria_beta(None, 61.0) is None


def test_ejemplo_potencial_alpha() -> None:
    # Base de 22 años, N = 55, Mejoría α 40 -> margen 7,2 y Potencial α ≈ 62 (54 a 70).
    # Con muchos minutos la reducción por muestra chica casi no mueve el nivel.
    result = p.potencial_alpha(55, 10**9, 22, 40)
    assert result is not None
    value, low, high = result
    assert value == pytest.approx(62.2, abs=0.01)
    assert (low, high) == (pytest.approx(54.2, abs=0.01), pytest.approx(70.2, abs=0.01))
    assert p.potencial_alpha(55, 1000, None, 40) is None  # sin edad, n/d


def test_ejemplos_potencial_beta() -> None:
    # A: 20 años, R = 58, Mejoría β +12 -> 65,8. B: 29 años, R = 80, Mejoría β +3 -> 74,0.
    assert p.potencial_beta(58, 10**9, 20, 12) == pytest.approx(65.8, abs=0.01)
    assert p.potencial_beta(80, 10**9, 29, 3) == pytest.approx(74.0, abs=0.01)
    assert p.potencial_beta(80, 1000, None, 3) is None


def test_percent_rank_e_invertido() -> None:
    values = [1.0, 2.0, 3.0, 4.0, 5.0]
    assert p.percent_rank(values, 5.0) == 100
    assert p.percent_rank(values, 1.0) == 0
    assert p.percent_rank(values, 1.0, higher_is_better=False) == 100
    assert p.percent_rank([3.0], 3.0) is None


@given(
    z=st.lists(st.tuples(st.sampled_from([1.0, 2.0]), st.floats(-3, 3)), min_size=3, max_size=8),
    mr=st.floats(0, 3000),
    mb=st.floats(0, 3000),
)
def test_mejoria_alpha_acotada(z: list[tuple[float, float]], mr: float, mb: float) -> None:
    value = p.mejoria_alpha(z, mr, mb)
    assert value is not None and 0 <= value <= 100


def test_mejoria_alpha_vale_50_sin_cambio() -> None:
    assert p.mejoria_alpha([(1, 0.0)] * 4, 500, 500) == 50


@given(age=st.floats(26, 45), level=st.floats(0, 100), minutes=st.floats(0, 5000))
def test_potencial_alpha_sin_margen_despues_del_pico(age: float, level: float, minutes: float) -> None:
    result = p.potencial_alpha(level, minutes, age, 70)
    assert result is not None
    assert result[0] == pytest.approx(p.shrink(level, minutes))


@given(index=st.floats(0, 100), minutes=st.floats(0, 5000), age=st.floats(16, 45), trend=st.floats(-50, 50))
def test_potencial_beta_nunca_pasa_100(index: float, minutes: float, age: float, trend: float) -> None:
    value = p.potencial_beta(index, minutes, age, trend)
    assert value is not None and 0 <= value <= 100
