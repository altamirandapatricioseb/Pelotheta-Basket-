"""Tests del catálogo de gráficos (`data/chart_catalog.csv`) y del mapa de origen (9.9).

Prueba obligatoria de 9.9: todo destino de «Ver origen de los datos» existe (sin enlaces rotos)
y un gráfico sin destino no muestra el botón.
"""

from __future__ import annotations

import csv
from pathlib import Path

import pytest
from pydantic import ValidationError

from pipeline import charts

ROOT = Path(__file__).resolve().parent.parent
CHARTS = charts.load_charts()
SOURCES = charts.load_sources()
with (ROOT / "data" / "stat_sets.csv").open(encoding="utf-8", newline="") as fh:
    SETS = {s["set_id"]: s for s in csv.DictReader(fh)}
with (ROOT / "data" / "stat_catalog.csv").open(encoding="utf-8", newline="") as fh:
    STATS = {s["id"]: s for s in csv.DictReader(fh)}


def test_al_menos_cincuenta_graficos_con_datos_e_ids_unicos() -> None:
    ids = [c.id for c in CHARTS]
    assert len(ids) == len(set(ids))
    assert len(CHARTS) >= 50
    assert sum(c.available for c in CHARTS) >= 50
    # Numerados como 9.2.1: del 1 al 76 sin huecos.
    assert ids == [f"g{n:02d}" for n in range(1, len(ids) + 1)]


def test_origen_apunta_a_un_conjunto_real_de_la_misma_entidad() -> None:
    for c in CHARTS:
        entity, set_id = c.origen_ref.split(":")
        assert set_id in SETS, c.id
        assert SETS[set_id]["entity"] == ("equipo" if entity == "equipo" else "jugador"), c.id


def test_todo_destino_de_origen_existe() -> None:
    chart_ids = {c.id for c in CHARTS}
    for s in SOURCES:
        assert s.chart_id in chart_ids, s.chart_id
        assert s.destino_ref in charts.TARGET_PAGES[s.destino_tipo], s
        params = dict(p.split("=") for p in s.parametros.split("&") if p)
        if s.destino_tipo == "desglosada":
            # Página dinámica /estadistica/[stat] y estadística del catálogo con datos.
            assert (ROOT / "web" / "app" / "estadistica" / "[stat]" / "page.tsx").exists(), s
            assert params.get("stat") in STATS and STATS[params["stat"]]["available"] == "true", s
            assert s.href().startswith(f"/estadistica/{params['stat']}?entidad=")
            continue
        assert (ROOT / "web" / "app" / s.destino_ref / "page.tsx").exists(), s
        if "conjunto" in params:
            stat_set = SETS.get(params["conjunto"])
            assert stat_set is not None, s
            assert stat_set["entity"] == ("equipo" if s.destino_ref == "equipo" else "jugador"), s


def test_etiqueta_nombra_el_origen() -> None:
    for s in SOURCES:
        prefix = "Desglosada: " if s.destino_tipo == "desglosada" else "Origen: "
        assert s.etiqueta_es.startswith(prefix), s.chart_id
        assert s.href().startswith("/")


def test_sin_datos_siempre_con_motivo() -> None:
    row = {
        "id": "g99",
        "categoria": "A",
        "titulo_es": "Prueba",
        "tipo": "linea",
        "datos_requeridos": "nada",
        "origen_ref": "equipo:partidos",
        "powerbi": "sí",
        "excel": "sí",
        "available": "false",
        "motivo": "",
    }
    with pytest.raises(ValidationError):
        charts.Chart.model_validate(row)
    assert not charts.Chart.model_validate({**row, "motivo": "No hay datos"}).available
