"""Libro de Excel (sección 10): hojas, interactividad, gráficos nativos y textos seguros."""

from __future__ import annotations

import io
import re
import zipfile

import openpyxl

from pipeline import excel


def _stat(
    sid: str, group: str = "anotacion", hib: bool = True, level: str = "A", per36: bool = True
) -> excel.Stat:
    return excel.Stat(
        sid, sid.title(), sid[:4], f"Descripción de {sid}", "", group, "", level, hib, False, per36, "suma"
    )


def _data() -> excel.Data:
    stats = [_stat(s) for s in ("pts", "trb", "ast", "usg_pct", "ts")]
    stats += [_stat("game_score_avg", "valoracion", per36=False), _stat("on_off", "impacto", per36=False)]
    stats.append(_stat("tov", "creacion", hib=False, level="B"))
    players = [
        excel.Player(
            i,
            name,
            excel.ZONE_OF[role],
            role,
            10,
            minutes,
            {
                "pts": i * 50,
                "trb": i * 20,
                "ast": 60 - i * 5,
                "usg_pct": 15 + i,
                "ts": 0.5 + i / 100,
                "game_score_avg": 5 + i,
                "on_off": i - 3,
                "tov": 30 - i,
            },
            starter_minutes=minutes / 2,
        )
        for i, (name, role, minutes) in enumerate(
            [
                ('=HYPERLINK("x")', "Base", 300),
                ("Vildoza", "Base", 320),
                ("Caffaro", "Pívot", 280),
                ("Sánchez", "Alero", 250),
                ("Lugo", "Escolta", 120),
            ],
            start=1,
        )
    ]
    team = [
        {
            "match_id": i,
            "match_date": f"2026-1{i // 5}-1{i % 9}",
            "opponent": f"Rival {i}",
            "home": i % 2 == 0,
            "pf": 80 + i,
            "pa": 82 - i % 3,
            "stats": {
                "ortg": 110.0,
                "drtg": 105.0,
                "net_rating": 5.0 + i,
                "pace": 72,
                "efg": 0.52,
                "tov_pct": 14.0,
                "orb_pct_team": 0.3,
                "ft_per_fga": 0.22,
                "efg_against": 0.5,
            },
        }
        for i in range(8)
    ]
    series: dict[tuple[str, int, str], list[tuple[int, str, float, float, float]]] = {
        ("jugador", 2, "pts"): [
            (m["match_id"], m["match_date"], 10.0 + m["match_id"], 10.0 + m["match_id"], 1.0) for m in team
        ],
        ("equipo", 0, "net_rating"): [(m["match_id"], m["match_date"], 5.0, 5.0, 1.0) for m in team],
    }
    return excel.Data(
        updated="2026-11-03 10:00",
        stats=stats,
        sets=[("anotacion", "Anotación", ["pts", "trb", "ast", "usg_pct"])],
        players=players,
        team=team,
        periods={m["match_id"]: {q: (20, 19) for q in (1, 2, 3, 4)} for m in team},
        league={
            "Boca Juniors": {"efg": 0.55, "tov_pct": 14.5, "wins": 3, "pyth_wins": 3.9},
            "Quimsa": {"efg": 0.5, "tov_pct": 13.0, "wins": 5, "pyth_wins": 4.5},
        },
        league_games=[
            {
                "game_date": "2026-10-11",
                "home": "Boca Juniors",
                "away": "Quimsa",
                "home_points": 80,
                "away_points": 70,
            },
            {
                "game_date": "2026-10-12",
                "home": "Quimsa",
                "away": "Boca Juniors",
                "home_points": 90,
                "away_points": 70,
            },
        ],
        situations=[
            {
                "card_id": "s001",
                "category": "Marcador",
                "title": "Ventaja al descanso",
                "param_value": "+1 a +5",
                "n": 4,
                "w": 3,
                "l": 1,
                "win_pct": 75,
                "delta": 25,
                "pf_avg": 82,
                "pa_avg": 78,
                "margin": 4,
            }
        ],
        series_stats=[
            excel.SeriesStat("equipo", "net_rating", "NR", "", "", "metrica", 1, True),
            excel.SeriesStat("jugador", "pts", "Puntos", "", "", "suma", 1, True),
        ],
        series=series,
    )


def _book() -> tuple[bytes, openpyxl.Workbook]:
    content = excel.build(_data())
    return content, openpyxl.load_workbook(io.BytesIO(content))


def test_has_the_required_sheets_with_index_first() -> None:
    _, wb = _book()
    names = wb.sheetnames
    assert names[0] == "Índice"
    for sheet in (
        "Metadatos",
        "Tabla maestra",
        "Catálogo",
        "Comparador",
        "Dispersión",
        "Comparación",
        "Equipo",
        "Situaciones",
        "Desglosada",
    ):
        assert sheet in names, sheet
    assert {n for n in names if n.startswith("G")} == {
        "G03 Ranking",
        "G04 Distribución",
        "G05 Evolución",
        "G06 Puntos",
        "G07 Cuatro factores",
        "G08 Cuartos",
        "G09 Pitagóricas",
        "G10 Tabla",
        "G11 Mapa de tiros",
        "G12 Minutos",
        "G13 Métricas propias",
        "G14 Correlación",
    }


def test_index_links_every_visible_sheet() -> None:
    _, wb = _book()
    links = {
        c.hyperlink.location.split("!")[0].strip("'")
        for row in wb["Índice"].iter_rows()
        for c in row
        if c.hyperlink
    }
    assert {"Metadatos", "Tabla maestra", "Comparador", "G07 Cuatro factores", "Desglosada"} <= links


def test_charts_are_native() -> None:
    content, _ = _book()
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        charts = [n for n in z.namelist() if re.match(r"xl/charts/chart\d+\.xml", n)]
        kinds = "".join(z.read(n).decode() for n in charts)
    assert len(charts) >= 12
    assert "<c:radarChart>" in kinds and "<c:scatterChart>" in kinds and "<c:barChart>" in kinds


def test_comparador_and_dispersion_are_interactive() -> None:
    _, wb = _book()
    comp = wb["Comparador"]
    assert comp.data_validations.dataValidation, "faltan las listas desplegables"
    formulas = [
        c.value
        for row in comp.iter_rows()
        for c in row
        if isinstance(c.value, str) and c.value.startswith("=")
    ]
    assert any("INDEX(" in f and "MATCH(" in f for f in formulas)
    disp = wb["Dispersión"]
    assert disp.data_validations.dataValidation
    assert any(isinstance(c.value, str) and "MATCH(" in c.value for row in disp.iter_rows() for c in row)


def test_comparison_uses_squad_zone_and_position_averages() -> None:
    _, wb = _book()
    names = {c.value for row in wb["Datos comparador"].iter_rows(max_col=1) for c in row}
    assert {
        "Media del plantel",
        "Media de exteriores",
        "Media de interiores",
        "Media de la posición Base",
    } <= names


def test_desglosada_has_three_lists_and_live_formulas() -> None:
    _, wb = _book()
    ws = wb["Desglosada"]
    assert len(ws.data_validations.dataValidation) == 3
    assert {"ENT_NOM", "VEN_NOM", "EST_EQUIPO", "EST_JUGADOR", "SERIE_CLAVE"} <= set(wb.defined_names)
    assert wb["Serie por partido"].sheet_state == "hidden"
    formulas = [c.value for row in ws.iter_rows() for c in row if isinstance(c.value, str)]
    assert any("COUNTIF(SERIE_CLAVE" in f for f in formulas)
    assert ws["B5"].value == "Boca Juniors" and ws["B6"].value == "NR"
    windows = [c.value for row in wb["Listas desglosada"].iter_rows(min_col=21, max_col=21) for c in row]
    assert "En victorias" in windows and "En empates" not in windows


def test_series_rows_number_matches_from_the_most_recent() -> None:
    data = _data()
    rows = excel.series_rows(data, [2, 3])
    pts = [r for r in rows if r[0].startswith("2|pts|")]
    latest = max(data.team, key=lambda m: m["match_date"])["match_id"]
    assert pts[0] == ("2|pts|1", latest, 10.0 + latest, 10.0 + latest, 1.0)
    assert len(pts) == 8 and not [r for r in rows if r[0].startswith("3|")]


def test_text_that_looks_like_a_formula_is_written_as_text() -> None:
    _, wb = _book()
    cells = [
        c
        for row in wb["Tabla maestra"].iter_rows()
        for c in row
        if isinstance(c.value, str) and "HYPERLINK" in c.value
    ]
    assert cells and all(c.data_type == "s" and c.value.startswith("'=") for c in cells)


def test_percentile_per36_and_media() -> None:
    assert excel.percentile([1, 2, 3, 4], 4, True) == 87.5
    assert excel.percentile([1, 2, 3, 4], 1, False) == 87.5
    p = excel.Player(1, "A", "Exterior", "Base", 10, 360, {"pts": 50})
    s = _stat("pts")
    assert excel.per36(p, s) == 5
    assert excel.media([p, excel.Player(2, "B", None, None, 1, 72, {"pts": 4})], s) == 3.5


def test_as_percent_and_standings() -> None:
    assert excel.as_percent(0.5) == 50
    assert excel.as_percent(14.5) == 14.5
    data = _data()
    assert excel.standings(data.league_games, "Boca Juniors", ["2026-10-11", "2026-10-12", "2026-10-01"]) == [
        1,
        2,
        None,
    ]
