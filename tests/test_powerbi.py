"""Modelo de Power BI (sección 11): CSV en estrella, textos seguros y cálculos de apoyo."""

from __future__ import annotations

import csv
import io

import pytest

from pipeline import powerbi
from tests.test_excel import _data


def _read(table: powerbi.Table) -> list[dict[str, str]]:
    raw = powerbi.to_csv(table)
    assert raw.startswith(b"\xef\xbb\xbf")  # BOM: Power BI y Excel leen bien las tildes
    return list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))


def test_every_table_has_rows_matching_its_header() -> None:
    tables = powerbi.build_tables(_data(), {})
    for name, (head, rows) in tables.items():
        assert all(len(r) == len(head) for r in rows), name
    assert {"dim_player", "dim_stat", "fact_player_stat", "fact_situational", "dim_chart"} <= tables.keys()


def test_text_that_looks_like_a_formula_is_neutralized() -> None:
    rows = _read(powerbi.build_tables(_data(), {})["dim_player"])
    assert rows[0]["nombre"].startswith("'=")


def test_fact_player_stat_is_long_with_per36_and_percentile() -> None:
    rows = _read(powerbi.build_tables(_data(), {})["fact_player_stat"])
    pts = [r for r in rows if r["stat_id"] == "pts"]
    assert len(pts) == 5
    vildoza = next(r for r in pts if r["player_id"] == "2")
    assert float(vildoza["valor_36"]) == pytest.approx(100 * 36 / 320)
    assert all(
        r["percentil"] for r in pts if r["player_id"] != "5"
    )  # 120 minutos: fuera del grupo, igual se ubica
    # Las que no se pasan a 36 no llevan valor_36.
    assert not any(r["valor_36"] for r in rows if r["stat_id"] == "on_off")


def test_rolling_5_is_chronological() -> None:
    out = powerbi.build_tables(_data(), {})["fact_stat_match_value"][1]
    pts = [r for r in out if r[3] == "pts"]
    assert [r[4] for r in pts] == [10.0 + i for i in range(8)]
    assert pts[-1][-1] == pytest.approx(sum(10.0 + i for i in range(3, 8)) / 5)
