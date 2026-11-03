"""Pruebas del adaptador de la LNB y de la reconstrucción del play-by-play (5.8).

Usan una página sintética armada a mano con la misma estructura que la real (Fase 0), así que
corren sin red y sin guardar datos de terceros en el repositorio. Si la caché local tiene
páginas reales de partidos (`data/raw/cache/lnb/`), una prueba extra las reconstruye todas.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from pipeline.pbp import FOUL_STATS, elapsed_at, reconstruct, validate
from sources import lnb

CACHE = Path(__file__).resolve().parent.parent / "data" / "raw" / "cache" / "lnb"

# --- Página sintética --------------------------------------------------------------------------
# Partido mínimo: cada equipo con 5 jugadores que juegan los 40 minutos. Local 5 - Visitante 2.
#   Q1 09:30  L1 triple asistido por L2           -> 3-0
#   Q1 08:00  V1 falla un libre, V2 rebote of. y V2 dobla en el mismo segundo -> 3-2
#   Q4 00:10  L3 doble                             -> 5-2


def _player_row(pid: str, dorsal: str, name: str, mins: str, pts: int, fg2: str, fg3: str, ft: str,
                drb: int, orb: int, ast: int, pm: int) -> str:  # fmt: skip
    cells = [
        f'<img src="/fotos/{pid}?key=">', dorsal, name, mins, str(pts),
        f'<span class="d-none">0</span> {fg2}', "0", f'<span class="d-none">0</span> {fg3}', "0",
        f'<span class="d-none">0</span> {ft}', "0", str(drb), str(orb), str(drb + orb), str(ast),
        "0", "0", "0", "0", "0", "0", str(pts), str(pm),
    ]  # fmt: skip
    return "<tr>" + "".join(f"<td>{c}</td>" for c in cells) + "</tr>"


def _table(club: int, team: int, name: str, rows: list[str], totals: list[str]) -> str:
    return (
        f'<div class="nombre-equipo p-3"><img src="/escudos/{club}/{team}?key="><strong>{name}</strong></div>'
        '<div class="entrenador p-3"><strong>Entrenador:</strong><br><span>DT, X</span></div>'
        '<table class="table tabla-estadisticas"><thead><tr><th>x</th></tr></thead><tbody>'
        + "".join(rows)
        + "</tbody><tfoot><tr>"
        + "".join(f"<th>{c}</th>" for c in ["Totales", *totals])
        + "</tr></tfoot></table>"
    )


def _event(seq: int, side: str, kind: str, pid: str | None, clock: str, score: str | None = None) -> str:
    player = f'<img class="imgJugador" src="/fotos/{pid}?key=">' if pid else ""
    extra = f'<span> | </span><strong class="informacionAdicional">{score}</strong>' if score else ""
    return (
        f'<li class="accion {side} {kind} accion-{seq}"><div class="informacion">'
        f'<strong class="titulo">{kind}</strong><br><span class="informacion">X</span><br>'
        f'<span class="informacion"><span>#1 - </span> {clock} {extra}</span></div>{player}</li>'
    )


def synthetic_page() -> str:
    local = [
        _player_row("101", "1 *", "UNO, L.", "40:00", 3, "0/0", "1/1", "0/0", 0, 0, 0, 3),
        _player_row("102", "2 *", "DOS, L.", "40:00", 0, "0/0", "0/0", "0/0", 0, 0, 1, 3),
        _player_row("103", "3 *", "TRES, L.", "40:00", 2, "1/1", "0/0", "0/0", 0, 0, 0, 3),
        _player_row("104", "4 *", "CUATRO, L.", "40:00", 0, "0/0", "0/0", "0/0", 0, 0, 0, 3),
        _player_row("105", "5 *", "CINCO, L.", "40:00", 0, "0/0", "0/0", "0/0", 0, 0, 0, 3),
    ]
    away = [
        _player_row("201", "1 *", "UNO, V.", "40:00", 0, "0/0", "0/0", "0/1", 0, 0, 0, -3),
        _player_row("202", "2 *", "DOS, V.", "40:00", 2, "1/1", "0/0", "0/0", 0, 1, 0, -3),
        _player_row("203", "3 *", "TRES, V.", "40:00", 0, "0/0", "0/0", "0/0", 0, 0, 0, -3),
        _player_row("204", "4 *", "CUATRO, V.", "40:00", 0, "0/0", "0/0", "0/0", 0, 0, 0, -3),
        _player_row("205", "5 *", "CINCO, V.", "40:00", 0, "0/0", "0/0", "0/0", 0, 0, 0, -3),
    ]
    totals_local = (
        ["200:00", "5", "1/1", "100", "1/1", "100", "0/0", "0", "0", "0", "0", "1"] + ["0"] * 6 + ["5", "0"]
    )
    totals_away = (
        ["200:00", "2", "1/1", "100", "0/0", "0", "0/1", "0", "0", "1", "1", "0"] + ["0"] * 6 + ["2", "0"]
    )
    # Los 5 de cada equipo entran al empezar cada cuarto, como en la fuente.
    events, seq = [], 1
    for quarter in range(1, 5):
        for side, ids in (("local", "10"), ("visitante", "20")):
            for n in range(1, 6):
                events.append(
                    _event(seq, side, "CAMBIO-JUGADOR-ENTRA", f"{ids}{n}", f"Cuarto {quarter} - 00:10:00")
                )
                seq += 1
        if quarter == 1:
            events += [
                _event(seq, "local", "CANASTA-3P", "101", "Cuarto 1 - 00:09:30", "3 - 0"),
                _event(seq + 1, "local", "ASISTENCIA", "102", "Cuarto 1 - 00:09:30"),
                _event(seq + 2, "visitante", "TIRO1-FALLADO", "201", "Cuarto 1 - 00:08:00"),
                _event(seq + 3, "visitante", "REBOTE-OFENSIVO", "202", "Cuarto 1 - 00:08:00"),
                _event(seq + 4, "visitante", "CANASTA-2P", "202", "Cuarto 1 - 00:08:00", "3 - 2"),
            ]
            seq += 5
        if quarter == 4:
            events.append(_event(seq, "local", "CANASTA-2P", "103", "Cuarto 4 - 00:00:10", "5 - 2"))
            seq += 1
        events.append(f'<li class="accion  FINAL-PERIODO accion-{seq}"><strong>FINAL-PERIODO</strong></li>')
        seq += 1
    periods = [
        {"periodo": 1, "tanteo_periodo_local": 3, "tanteo_periodo_visitante": 2},
        {"periodo": 2, "tanteo_periodo_local": 0, "tanteo_periodo_visitante": 0},
        {"periodo": 3, "tanteo_periodo_local": 0, "tanteo_periodo_visitante": 0},
        {"periodo": 4, "tanteo_periodo_local": 2, "tanteo_periodo_visitante": 0},
    ]
    shots = [
        {"equipo_id": 1, "componente_id": "101", "numero_periodo": 1, "accion_tipo": "CANASTA-3P",
         "posicion_x": "80.5%", "posicion_y": "10%", "zona": "Z12-IZ", "metido": 1},
        {"equipo_id": 2, "componente_id": "202", "numero_periodo": 1, "accion_tipo": "CANASTA-2P",
         "posicion_x": "5%", "posicion_y": "50%", "zona": "Z1", "metido": 1},
        {"equipo_id": 1, "componente_id": "103", "numero_periodo": 4, "accion_tipo": "CANASTA-2P",
         "posicion_x": "6%", "posicion_y": "49%", "zona": "Z1", "metido": 1},
    ]  # fmt: skip
    # Orden inverso, como la página real (de la jugada más nueva a la más vieja).
    return (
        "<html><body>"
        + _table(19, 1, "LOCAL", local, totals_local)
        + _table(80, 2, "VISITA", away, totals_away)
        + f"<script>periodos = {json.dumps(periods)}; tiros = {json.dumps(shots)};</script>"
        + '<ul class="listadoAccionesPartido">'
        + "".join(reversed(events))
        + "</ul></body></html>"
    )


# --- Fixture -----------------------------------------------------------------------------------


def test_parse_fixture_y_partidos_de_boca() -> None:
    payload = {
        "partidos": [
            {"idPartido": "v2abcdefghijk", "fecha": "28/10/2026 20:35", "equipoLocal": "BOCA",
             "equipoVisitante": "REGATAS (C)", "localRuta": "boca", "visitanteRuta": "regatas-c",
             "idEquipoLocal": lnb.BOCA_TEAM_ID, "idEquipoVisitante": 114561, "resultadoLocal": 95,
             "resultadoVisitante": 83},
            {"idPartido": "v2zzzzzzzzzzz", "fecha": "05/11/2026 21:00", "equipoLocal": "QUIMSA",
             "equipoVisitante": "PLATENSE", "localRuta": "quimsa", "visitanteRuta": "platense",
             "idEquipoLocal": 112657, "idEquipoVisitante": 112549, "resultadoLocal": None,
             "resultadoVisitante": None},
        ]
    }  # fmt: skip
    games = lnb.parse_fixture(payload)
    assert [g.is_boca for g in games] == [True, False]
    assert [g.is_played for g in games] == [True, False]
    assert games[0].played_at.utcoffset() is not None and games[0].played_at.hour == 20
    assert games[0].url.endswith("/laliga/partido/v2abcdefghijk/boca-vs-regatas-c")


@pytest.mark.parametrize(
    "payload", [None, [], {"partidos": "x"}, {"partidos": [{"idPartido": "v2abcdefghijk"}]}]
)
def test_fixture_mal_formado_es_parse_error(payload: object) -> None:
    with pytest.raises(lnb.ParseError):
        lnb.parse_fixture(payload)


def test_fixture_rechaza_rutas_raras() -> None:
    item = {
        "idPartido": "v2abcdefghijk",
        "fecha": "28/10/2026 20:35",
        "equipoLocal": "A",
        "equipoVisitante": "B",
        "localRuta": "../../etc",
        "visitanteRuta": "b",
        "idEquipoLocal": 1,
        "idEquipoVisitante": 2,
    }
    with pytest.raises(lnb.ParseError):
        lnb.parse_fixture({"partidos": [item]})


def test_month_windows_cubre_el_rango_sin_huecos() -> None:
    windows = lnb.month_windows(date(2026, 9, 15), date(2026, 11, 3))
    assert windows == [
        (date(2026, 9, 15), date(2026, 9, 30)),
        (date(2026, 10, 1), date(2026, 10, 31)),
        (date(2026, 11, 1), date(2026, 11, 3)),
    ]


# --- Página de partido -------------------------------------------------------------------------


def test_parse_match_sintetico() -> None:
    match = lnb.parse_match(synthetic_page())
    assert (match.home.name, match.home.club_id, match.home.team_id, match.home.coach) == (
        "LOCAL",
        19,
        1,
        "DT, X",
    )
    assert match.home.totals.pts == 5 and match.away.totals.pts == 2
    first = match.home.players[0]
    assert (first.source_player_id, first.shirt_number, first.started, first.seconds) == (
        "101",
        1,
        True,
        2400,
    )
    assert (first.fg3m, first.fg3a, first.pts) == (1, 1, 3)
    assert [s.made for s in match.shots] == [True, True, True] and match.shots[0].x_pct == 80.5
    # Las jugadas quedan en orden cronológico aunque la página las liste al revés.
    seqs = [e.seq for e in match.events]
    assert seqs == sorted(seqs)
    assert match.events[0].clock_s == 600 and match.events[0].period == 1


def test_puntos_que_no_cierran_con_los_tiros_son_parse_error() -> None:
    page = synthetic_page().replace(
        "<td>UNO, L.</td><td>40:00</td><td>3</td>", "<td>UNO, L.</td><td>40:00</td><td>4</td>"
    )
    with pytest.raises(lnb.ParseError):
        lnb.parse_match(page)


def test_pagina_sin_tablas_es_parse_error() -> None:
    with pytest.raises(lnb.ParseError):
        lnb.parse_match("<html><body>mantenimiento</body></html>")


# --- Reconstrucción del play-by-play ---------------------------------------------------------


def test_elapsed_at_con_suplementario() -> None:
    assert elapsed_at(1, 600) == 0
    assert elapsed_at(4, 0) == 2400
    assert elapsed_at(5, 0) == 2700  # el suplementario dura 5 minutos


def test_reconstruccion_cierra_con_el_box_score() -> None:
    match = lnb.parse_match(synthetic_page())
    rec = reconstruct(match.events)
    assert rec.score == {"local": 5, "visitante": 2}
    assert rec.seconds["101"] == 2400 and rec.seconds["205"] == 2400
    assert rec.plus_minus["101"] == 3 and rec.plus_minus["201"] == -3
    # Libre fallado, rebote ofensivo y doble en el mismo segundo: cuentan por separado y en orden.
    assert rec.counters["201"]["fta"] == 1 and rec.counters["201"]["ftm"] == 0
    assert rec.counters["202"]["orb"] == 1 and rec.counters["202"]["pts"] == 2
    check = validate(match)
    assert check.critical == [] and check.fouls == []


def test_falta_un_doble_en_las_jugadas_va_a_cuarentena() -> None:
    page = synthetic_page().replace("CANASTA-2P accion-", "TIRO2-FALLADO accion-", 1)
    check = validate(lnb.parse_match(page))
    assert not check.pbp_ok
    assert any("marcador" in p for p in check.critical)


def test_solo_faltas_distintas_no_invalida_las_jugadas() -> None:
    assert {"pf", "pf_drawn"} == FOUL_STATS
    match = lnb.parse_match(synthetic_page())
    match.home.players[0].pf = 1  # la fuente cuenta una falta que no está en las jugadas
    check = validate(match)
    assert check.pbp_ok and not check.fouls_ok


def test_reloj_que_retrocede_es_error_critico() -> None:
    match = lnb.parse_match(synthetic_page())
    events = list(match.events)
    events.insert(len(events) - 2, events[-3].model_copy(update={"seq": 9999, "clock_s": 599, "period": 1}))
    assert reconstruct(events).errors


# --- Partidos reales en caché (opcional) -------------------------------------------------------


def _cached_match_pages() -> list[Path]:
    if not CACHE.exists():
        return []
    pages = []
    for meta in CACHE.glob("*.meta.json"):
        if "/laliga/partido/" in json.loads(meta.read_text(encoding="utf-8"))["url"]:
            pages.append(meta.with_name(meta.name.replace(".meta.json", ".body")))
    return pages


@pytest.mark.skipif(not _cached_match_pages(), reason="sin páginas reales en data/raw/cache/lnb")
@pytest.mark.parametrize("page", _cached_match_pages(), ids=lambda p: p.stem[:8])
def test_partidos_reales_reconstruidos(page: Path) -> None:
    check = validate(lnb.parse_match(page.read_text(encoding="utf-8")))
    assert check.critical == []
