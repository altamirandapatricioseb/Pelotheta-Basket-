"""Pruebas de las fórmulas (5.6 y 6): ejemplos calculados a mano y propiedades con hypothesis.

Ejemplo de control: Boca 95 - 83 Regatas (LNB, 28-oct-2026), totales del box score oficial.
  Boca:    2P 19/34, 3P 15/34, TL 12/16, ORB 13, DRB 23, TOV 17
  Regatas: 2P 21/45, 3P 10/24, TL 11/15, ORB 12, DRB 17, TOV 13
"""

from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from pipeline import metrics as m

BOCA = {"fga": 68, "fta": 16, "orb": 13, "tov": 17, "fg": 34, "fg3": 15, "pts": 95}
REGATAS = {"fga": 69, "fta": 15, "orb": 12, "tov": 13, "fg": 31, "fg3": 10, "pts": 83}


def test_posesiones_y_ratings_del_ejemplo() -> None:
    # Jugadas: Boca 68 + 0,44 × 16 − 13 + 17 = 79,04; Regatas 69 + 6,6 − 12 + 13 = 76,6.
    poss = m.possessions(
        (BOCA["fga"], BOCA["fta"], BOCA["orb"], BOCA["tov"]),
        (REGATAS["fga"], REGATAS["fta"], REGATAS["orb"], REGATAS["tov"]),
    )
    assert poss == pytest.approx(77.82)
    ortg, drtg = m.rating(95, poss), m.rating(83, poss)
    assert ortg == pytest.approx(122.08, abs=0.01)
    assert drtg == pytest.approx(106.66, abs=0.01)
    assert m.pace(poss, 40) == pytest.approx(77.82)


def test_tiro_del_ejemplo() -> None:
    assert m.efg(BOCA["fg"], BOCA["fg3"], BOCA["fga"]) == pytest.approx((34 + 7.5) / 68)
    assert m.ts(BOCA["pts"], BOCA["fga"], BOCA["fta"]) == pytest.approx(95 / 150.08)
    assert m.points_per_shot(34, 15, 68) == pytest.approx((2 * 19 + 3 * 15) / 68)
    assert m.three_rate(34, 68) == 0.5
    assert m.ft_rate(16, 68) == pytest.approx(16 / 68)
    assert m.tov_pct(17, 68, 16) == pytest.approx(100 * 17 / (68 + 7.04 + 17))


def test_divisiones_por_cero_quedan_nd() -> None:
    assert m.efg(0, 0, 0) is None
    assert m.ts(0, 0, 0) is None
    assert m.tov_pct(0, 0, 0) is None
    assert m.ast_to(3, 0) is None
    assert m.per_minutes(10, 0) is None
    assert m.ast_pct(2, 0, 0, 0, 30) is None
    assert m.share_pct(5, 0, 40, 30) is None


def test_game_score_y_dobles() -> None:
    # 20 puntos (8/15 de campo, 4/5 libres), 3 ORB, 7 DRB, 2 robos, 5 asist., 1 tapa, 2 faltas, 3 pérdidas.
    gs = m.game_score(20, 8, 15, 4, 5, 3, 7, 2, 5, 1, 2, 3)
    assert gs == pytest.approx(20 + 3.2 - 10.5 - 0.4 + 2.1 + 2.1 + 2 + 3.5 + 0.7 - 0.8 - 3)
    assert m.double_count(20, 10, 5, 2, 1) == 2
    assert m.double_count(12, 11, 10, 0, 0) == 3


def test_tasas_individuales() -> None:
    usg = m.usg_pct(12, 4, 2, 30, 40, 68, 16, 17)
    assert usg == pytest.approx(100 * (12 + 1.76 + 2) * 40 / (30 * (68 + 7.04 + 17)))
    assert m.ast_pct(6, 5, 30, 40, 34) == pytest.approx(100 * 6 / (30 / 40 * 34 - 5))
    assert m.share_pct(4, 20, 40, 13 + 17) == pytest.approx(100 * 4 * 40 / (20 * 30))


def test_srs_de_dos_equipos() -> None:
    # A le gana dos veces por 10 a B: MOV A = 10, pero su rival es malo (SOS −5): SRS A = 5.
    games = [m.Game("2026-10-01", "A", "B", 80, 70), m.Game("2026-10-08", "B", "A", 70, 80)]
    result = m.srs(games)
    assert result["A"] == pytest.approx(5)
    assert result["B"] == pytest.approx(-5)


def test_elo_sin_datos_del_futuro() -> None:
    games = [m.Game("2026-10-08", "B", "A", 70, 80), m.Game("2026-10-01", "A", "B", 80, 70)]
    before, final = m.elo_run(games)
    assert before[0] == (m.ELO_START, m.ELO_START)  # el primer partido por fecha arranca de cero
    assert final["A"] > m.ELO_START > final["B"]
    assert final["A"] + final["B"] == pytest.approx(2 * m.ELO_START)


def test_calibracion_pitagorica_recupera_el_exponente() -> None:
    # Tabla generada con x = 12 (victorias redondeadas): la calibración vuelve cerca de 12.
    table = []
    for pf, pa in ((90, 80), (85, 82), (80, 84), (78, 88), (88, 86), (82, 79)):
        wins = round(30 * m.pythagorean_share(pf * 30, pa * 30, 12))
        table.append(m.TableRow(30, wins, pf * 30, pa * 30))
    assert abs(m.calibrate_pythagorean(table) - 12) <= 1.5
    assert m.calibrate_pythagorean([]) == m.PYTHAGOREAN_START


def test_calendario_y_rachas() -> None:
    assert m.games_behind(8, 4, 10, 2) == 2
    assert m.rest_days(["2026-10-10", "2026-10-07", "2026-10-12"]) == [None, 3, 2]
    assert m.longest_streak([True, True, False, True, True, True]) == 3
    assert m.herfindahl([50, 50]) == 0.5
    assert m.herfindahl([0, 0]) is None
    assert m.jaccard({"a", "b", "c", "d", "e"}, {"a", "b", "c", "d", "f"}) == pytest.approx(4 / 6)
    assert m.stdev([10]) is None


def test_ewa_y_ela() -> None:
    # Con el jugador en cancha el equipo anota 115 cada 100 y su reemplazo 105; liga en 110, x = 14.
    value = m.ewa(400, 115, 105, 110, 14)
    expected = 400 / 40 * (m.pythagorean_share(115, 110, 14) - m.pythagorean_share(105, 110, 14))
    assert value == pytest.approx(expected) and value > 0
    assert m.ela(400, 100, 110, 110, 14) < 0  # recibe menos que su reemplazo: evita derrotas


# --- Propiedades ------------------------------------------------------------------------------

counts = st.integers(min_value=0, max_value=200)


@given(fg3=counts, fg2=counts, extra_misses=counts)
def test_efg_entre_0_y_1_5(fg3: int, fg2: int, extra_misses: int) -> None:
    value = m.efg(fg2 + fg3, fg3, fg2 + fg3 + extra_misses)
    assert value is None or 0 <= value <= 1.5


@given(
    pf=st.integers(min_value=0, max_value=20000),
    pa=st.integers(min_value=0, max_value=20000),
    x=st.floats(min_value=1, max_value=25),
)
def test_pitagorico_simetrico_y_sin_desbordes(pf: int, pa: int, x: float) -> None:
    a, b = m.pythagorean_share(pf, pa, x), m.pythagorean_share(pa, pf, x)
    assert 0 <= a <= 1
    assert a + b == pytest.approx(1)


@given(
    home=st.floats(min_value=800, max_value=2200),
    away=st.floats(min_value=800, max_value=2200),
    won=st.booleans(),
)
def test_elo_suma_cero(home: float, away: float, won: bool) -> None:
    new_home, new_away = m.elo_update(home, away, won)
    assert new_home + new_away == pytest.approx(home + away)
    assert (new_home > home) == won


@given(st.lists(st.tuples(st.sampled_from("ABCDE"), st.sampled_from("ABCDE"), counts, counts), max_size=30))
def test_srs_promedia_cero(rows: list[tuple[str, str, int, int]]) -> None:
    games = [m.Game("2026-10-01", h, a, hp, ap) for h, a, hp, ap in rows if h != a]
    if games:
        assert sum(m.srs(games).values()) == pytest.approx(0, abs=1e-6)
