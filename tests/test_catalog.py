"""Pruebas del catálogo de estadísticas (sección 5): forma y reglas del prompt."""

from __future__ import annotations

import csv
import re
from pathlib import Path

CATALOG = Path(__file__).resolve().parent.parent / "data" / "stat_catalog.csv"
COLUMNS = ["id", "nombre_es", "descripcion_es", "grupo", "categoria", "unidad", "fuente", "nivel", "formula",
           "higher_is_better", "available"]  # fmt: skip
# Rangos de emojis y pictogramas (regla 10: sin emojis en ningún texto del proyecto).
EMOJI = re.compile("[\U0001f300-\U0001faff☀-➿⬀-⯿]")


def rows() -> list[dict[str, str]]:
    with CATALOG.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        assert reader.fieldnames == COLUMNS
        return list(reader)


def test_ids_unicos_y_niveles_validos() -> None:
    catalog = rows()
    ids = [r["id"] for r in catalog]
    assert len(ids) == len(set(ids))
    assert all(re.fullmatch(r"[a-z0-9_]+", i) for i in ids)
    assert {r["nivel"] for r in catalog} <= {"A", "B", "C"}
    assert {r["higher_is_better"] for r in catalog} | {r["available"] for r in catalog} <= {"true", "false"}


def test_descripciones_propias_y_cortas() -> None:
    for r in rows():
        assert 0 < len(r["descripcion_es"]) <= 160, r["id"]
        assert not EMOJI.search(r["nombre_es"] + r["descripcion_es"] + r["formula"]), r["id"]


def test_nivel_c_nunca_se_muestra_como_dato() -> None:
    for r in rows():
        if r["nivel"] == "C":
            assert r["available"] == "false" and r["fuente"] == "n/d", r["id"]
        if r["nivel"] == "B" and r["available"] == "true":
            assert r["formula"], f"{r['id']}: una estadística calculada documenta su fórmula"
