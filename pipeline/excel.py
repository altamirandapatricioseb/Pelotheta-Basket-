"""Libros de Excel de Pelotheta Θ básquet (sección 10): un libro de la Liga Nacional.

Se arman con `xlsxwriter` a partir de las vistas `api` de Supabase (lo mismo que ve la web) y se
suben al bucket público `exports`, sobrescribiendo la versión anterior. Igual que en Pelotheta
fútbol, el libro trae:

- `Índice` con enlaces a todas las hojas, `Metadatos`, `Tabla maestra` y `Catálogo`;
- `Comparador` y `Dispersión` interactivas (listas desplegables + `INDEX`/`MATCH` que alimentan
  gráficos nativos), `Comparación` (medias del plantel, de cada zona y de cada posición por categoría);
- una hoja por gráfico de la tabla 9.4 con su tabla de datos, su gráfico nativo y el enlace
  «Ver datos de origen» (9.9); los que Excel no puede dibujar lo dicen en su hoja;
- `Equipo` (partido a partido), `Situaciones` y `Desglosada` (9.8: entidad, estadística y ventana
  en listas, con fórmulas sobre la serie por partido de `api.stat_match_series`).

La temporada tiene una sola competición cargada (Liga Nacional): el libro de la competición y el
global son el mismo. Los textos se escriben siempre como texto (`write_string`): una celda que
empiece con `=`, `+`, `-` o `@` nunca se ejecuta como fórmula (14.3).
"""

from __future__ import annotations

import argparse
import io
import math
import os
import statistics
import sys
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any

import httpx
import xlsxwriter
from xlsxwriter.utility import xl_col_to_name, xl_rowcol_to_cell
from xlsxwriter.workbook import Workbook
from xlsxwriter.worksheet import Worksheet

TIMEOUT = 60
PAGE = 1000
BUCKET = "exports"
FILE_NAME = "pelotheta-basquet.xlsx"
SYSTEM = "Pelotheta Θ"
FONT = "Montserrat"
SCOPE = "Liga Nacional 2026-27"
# Paleta de la web (web/app/globals.css, la misma de fútbol): verde principal, violeta secundario,
# rojo solo para lo negativo, azul y amarillo.
GREEN, GREEN_DARK, VIOLET, RED, BLUE, YELLOW = (
    "#64CC4F",
    "#328336",
    "#734F9A",
    "#A30310",
    "#2A78D6",
    "#EDA100",
)
ZEBRA = "#F1F8EC"
# Zonas de 9.7 y la zona de cada posición clásica.
ZONES = ("Exterior", "Ala", "Interior")
ZONE_PLURAL = {"Exterior": "exteriores", "Ala": "aleros", "Interior": "interiores"}
ZONE_OF = {
    "Base": "Exterior",
    "Escolta": "Exterior",
    "Alero": "Ala",
    "Ala-pívot": "Interior",
    "Pívot": "Interior",
}
POSITIONS = ("Base", "Escolta", "Alero", "Ala-pívot", "Pívot")
MIN_MINUTES = 400  # mínimo para entrar en medias, percentiles y correlaciones (muestra pequeña de 9.1)
# Datos de perfil: describen al jugador, no cómo juega (afuera de medias y comparaciones).
PROFILE = {"age", "height_cm", "weight_kg", "is_foreign"}


# --------------------------------------------------------------------------------------------
# Datos


@dataclass
class Stat:
    id: str
    name: str
    short: str
    description: str
    formula: str
    group: str
    unit: str
    level: str
    higher_is_better: bool
    estimated: bool
    per36: bool
    rule: str


@dataclass
class Player:
    id: int
    name: str
    line: str | None  # zona: Exterior, Ala o Interior
    role: str | None  # posición: Base, Escolta, Alero, Ala-pívot o Pívot
    matches: int
    minutes: float
    stats: dict[str, float]
    starter_minutes: float = 0.0


@dataclass
class SeriesStat:
    """Una estadística con lo que hace falta para mostrarla partido a partido."""

    entity: str  # "jugador" o "equipo"
    id: str
    name: str
    unit: str
    description: str
    rule: str
    factor: float
    higher_is_better: bool


@dataclass
class Data:
    """Todo lo que lee el libro."""

    updated: str
    stats: list[Stat]
    sets: list[tuple[str, str, list[str]]]
    players: list[Player]
    # Partidos de Boca: match_id, match_date, opponent, home, pf, pa y stats (por partido).
    team: list[dict[str, Any]]
    # Puntos por cuarto de cada partido de Boca: {match_id: {cuarto: (a favor, en contra)}}.
    periods: dict[int, dict[int, tuple[int, int]]] = field(default_factory=dict)
    # Estadísticas de temporada de cada equipo de la liga: {equipo: {stat: valor}}.
    league: dict[str, dict[str, float]] = field(default_factory=dict)
    boca_name: str = "Boca Juniors"
    league_games: list[dict[str, Any]] = field(default_factory=list)
    # Minutos de cada jugador en cada partido: {player_id: {match_id: minutos}}.
    minutes: dict[int, dict[int, float]] = field(default_factory=dict)
    situations: list[dict[str, Any]] = field(default_factory=list)
    series_stats: list[SeriesStat] = field(default_factory=list)
    # Serie por partido (api.stat_match_series): {(entidad, id, stat): [(partido, fecha, valor, num, den)]}.
    series: dict[tuple[str, int, str], list[tuple[int, str, float, float, float]]] = field(
        default_factory=dict
    )


def _get(
    client: httpx.Client, url: str, key: str, view: str, select: str, **filters: str
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for offset in range(0, 1_000_000, PAGE):
        params = {"select": select, "limit": str(PAGE), "offset": str(offset), **filters}
        response = client.get(
            f"{url.rstrip('/')}/rest/v1/{view}",
            params=params,
            headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept-Profile": "api"},
        )
        response.raise_for_status()
        page = response.json()
        rows.extend(page)
        if len(page) < PAGE:
            return rows
    return rows


def _num(v: Any) -> float | None:
    return float(v) if isinstance(v, int | float) and not isinstance(v, bool) else None


def fetch(url: str, key: str) -> Data:
    """Lee las vistas `api` que usa el libro."""
    with httpx.Client(timeout=TIMEOUT) as c:
        catalog = _get(c, url, key, "stat_catalog", "*", available="eq.true")
        set_rows = _get(
            c,
            url,
            key,
            "stat_set_column",
            "set_id,set_name,set_order,stat_id,sort_order",
            entity="eq.jugador",
            order="set_order,sort_order",
        )
        summary = _get(c, url, key, "player_summary", "player_id,full_name,known_as,matches,minutes")
        bios = {b["player_id"]: b for b in _get(c, url, key, "player_bio", "player_id,position_raw")}
        values = _get(c, url, key, "player_stat", "player_id,stat_id,value", order="player_id,stat_id")
        games = _get(
            c,
            url,
            key,
            "boca_game",
            "game_id,game_date,is_home,opponent,points_for,points_against,stats",
            order="game_date",
        )
        periods = _get(c, url, key, "game_period", "game_id,period,points_for,points_against")
        team_stats = _get(c, url, key, "team_stat", "team,is_boca,stat_id,value")
        league_games = _get(
            c,
            url,
            key,
            "league_game",
            "game_id,game_date,home,away,home_points,away_points",
            order="game_date",
        )
        lines = _get(c, url, key, "game_line", "game_id,player_id,started,minutes", is_boca="eq.true")
        status = _get(c, url, key, "system_status", "key,value,updated_at")
        situations = _get(
            c,
            url,
            key,
            "situational_result",
            "card_id,param_value,param_order,n,w,l,win_pct,delta,pf_avg,pa_avg,margin",
        )
        cards = {
            r["card_id"]: r
            for r in _get(c, url, key, "situational_catalog", "card_id,category,title_es,sort_order")
        }
        series = _get(
            c,
            url,
            key,
            "stat_match_series",
            "stat_id,entity,entity_id,match_id,match_date,value,num,den",
            order="entity,entity_id,stat_id,match_date",
        )
    player_catalog = [r for r in catalog if r["entity"] == "jugador"]
    stats = [
        Stat(
            id=r["stat_id"],
            name=r["name_es"],
            short=r.get("short_name") or r["name_es"],
            description=r.get("description_es") or "",
            formula=r.get("formula") or "",
            group=r.get("stat_group") or "",
            unit=r.get("unit") or "",
            level=r.get("level") or "",
            higher_is_better=bool(r["higher_is_better"]),
            estimated=bool(r.get("estimated")),
            per36=bool(r.get("per_unit")),
            rule=r.get("rule") or "metrica",
        )
        for r in player_catalog
        if r["stat_id"] not in PROFILE
    ]
    own: dict[int, dict[str, float]] = {}
    for v in values:
        if (n := _num(v["value"])) is not None:
            own.setdefault(v["player_id"], {})[v["stat_id"]] = n
    minutes: dict[int, dict[int, float]] = {}
    starter: dict[int, float] = {}
    for line in lines:
        m = _num(line["minutes"]) or 0.0
        if m <= 0:
            continue
        minutes.setdefault(line["player_id"], {})[line["game_id"]] = m
        if line["started"]:
            starter[line["player_id"]] = starter.get(line["player_id"], 0.0) + m
    players = []
    for r in summary:
        role = (bios.get(r["player_id"]) or {}).get("position_raw")
        players.append(
            Player(
                id=r["player_id"],
                name=r.get("known_as") or r["full_name"],
                line=ZONE_OF.get(role or ""),
                role=role,
                matches=r["matches"] or 0,
                minutes=float(r["minutes"] or 0),
                stats=own.get(r["player_id"], {}),
                starter_minutes=starter.get(r["player_id"], 0.0),
            )
        )
    players.sort(key=lambda p: -p.minutes)
    sets: dict[str, tuple[str, str, list[str]]] = {}
    for s in set_rows:
        sets.setdefault(s["set_id"], (s["set_id"], s["set_name"], []))[2].append(s["stat_id"])
    team = [
        {
            "match_id": g["game_id"],
            "match_date": str(g["game_date"])[:10],
            "opponent": g["opponent"] or "",
            "home": bool(g["is_home"]),
            "pf": g["points_for"] or 0,
            "pa": g["points_against"] or 0,
            "stats": {k: n for k, v in (g["stats"] or {}).items() if (n := _num(v)) is not None},
        }
        for g in games
    ]
    by_period: dict[int, dict[int, tuple[int, int]]] = {}
    for p in periods:
        by_period.setdefault(p["game_id"], {})[p["period"]] = (p["points_for"] or 0, p["points_against"] or 0)
    league: dict[str, dict[str, float]] = {}
    boca_name = "Boca Juniors"
    for t in team_stats:
        if (n := _num(t["value"])) is not None:
            league.setdefault(t["team"], {})[t["stat_id"]] = n
        if t["is_boca"]:
            boca_name = t["team"]
    updated = next((s["updated_at"] for s in status if s["key"] == "ultima_actualizacion"), None) or next(
        (s["updated_at"] for s in status), ""
    )
    situ = []
    for r in situations:
        card = cards.get(r["card_id"])
        if card:
            situ.append(
                {**r, "category": card["category"], "title": card["title_es"], "order": card["sort_order"]}
            )
    situ.sort(key=lambda r: (r["order"], r["param_order"] or 0))
    by_series: dict[tuple[str, int, str], list[tuple[int, str, float, float, float]]] = {}
    for s in series:
        value = _num(s["value"])
        if value is None:
            continue
        num = _num(s["num"])
        den = _num(s["den"])
        # Fuera de los cocientes el numerador es el valor y el denominador 1: una ventana es suma / suma.
        if den is None:
            num, den = value, 1.0
        by_series.setdefault((s["entity"], s["entity_id"], s["stat_id"]), []).append(
            (s["match_id"], str(s["match_date"])[:10], value, num if num is not None else value, den)
        )
    return Data(
        updated=str(updated)[:16].replace("T", " "),
        stats=stats,
        sets=list(sets.values()),
        players=players,
        team=team,
        periods=by_period,
        league=league,
        boca_name=boca_name,
        league_games=league_games,
        minutes=minutes,
        situations=situ,
        series_stats=[
            SeriesStat(
                entity=r["entity"],
                id=r["stat_id"],
                name=r["name_es"],
                unit=r.get("unit") or "",
                description=r.get("description_es") or "",
                rule=r.get("rule") or "metrica",
                factor=float(r.get("factor") or 1) if r.get("rule") == "cociente" else 1.0,
                higher_is_better=bool(r["higher_is_better"]),
            )
            for r in catalog
            if r["stat_id"] not in PROFILE
        ],
        series=by_series,
    )


# --------------------------------------------------------------------------------------------
# Cálculos (puros, con tests)


def per36(player: Player, stat: Stat) -> float | None:
    """Valor cada 36 minutos cuando la estadística lo admite; si no, el valor tal cual."""
    value = player.stats.get(stat.id)
    if value is None:
        return None
    if not stat.per36:
        return value
    return value * 36 / player.minutes if player.minutes > 0 else None


def percentile(values: Sequence[float], value: float, higher_is_better: bool) -> float:
    """Porcentaje del grupo que queda peor que el valor (100 = el mejor)."""
    if not values:
        return 0.0
    worse = sum(1 for v in values if (v < value if higher_is_better else v > value))
    equal = sum(1 for v in values if v == value)
    return round((worse + equal / 2) / len(values) * 100, 1)


def media(players: Sequence[Player], stat: Stat) -> float | None:
    vals = [v for p in players if (v := per36(p, stat)) is not None]
    return sum(vals) / len(vals) if vals else None


def pearson(x: Sequence[float], y: Sequence[float]) -> float | None:
    if len(x) < 3:
        return None
    mx, my = statistics.fmean(x), statistics.fmean(y)
    sx = math.sqrt(sum((a - mx) ** 2 for a in x))
    sy = math.sqrt(sum((b - my) ** 2 for b in y))
    if sx == 0 or sy == 0:
        return None
    return sum((a - mx) * (b - my) for a, b in zip(x, y, strict=True)) / (sx * sy)


def as_percent(value: float | None) -> float | None:
    """Algunos porcentajes vienen como fracción (0,55) y otros de 0 a 100: todo a 0 a 100."""
    if value is None:
        return None
    return value * 100 if abs(value) <= 1 else value


def standings(games: Sequence[dict[str, Any]], team: str, dates: Sequence[str]) -> list[int | None]:
    """Puesto de `team` en la tabla después de cada fecha: por % de victorias y, a igualdad, por
    diferencia de puntos (la LNB desempata por resultados entre sí; es una aproximación)."""
    out: list[int | None] = []
    for day in dates:
        record: dict[str, list[float]] = {}
        for g in games:
            if str(g["game_date"])[:10] > day or g["home_points"] is None or g["away_points"] is None:
                continue
            for side, other, pf, pa in (
                (g["home"], g["away"], g["home_points"], g["away_points"]),
                (g["away"], g["home"], g["away_points"], g["home_points"]),
            ):
                r = record.setdefault(side, [0, 0, 0])
                r[0] += 1 if pf > pa else 0
                r[1] += 1
                r[2] += pf - pa
                record.setdefault(other, [0, 0, 0])
        if team not in record or record[team][1] == 0:
            out.append(None)
            continue
        ranked = sorted(
            record, key=lambda t: (-(record[t][0] / record[t][1]) if record[t][1] else 0, -record[t][2])
        )
        out.append(ranked.index(team) + 1)
    return out


def series_rows(data: Data, player_ids: Sequence[int]) -> list[tuple[str, int, float, float, float]]:
    """Filas de la serie por partido: clave «entidad|stat|n» (n = 1 es el partido más reciente con
    dato), partido, valor, numerador y denominador. La entidad es «e» (Boca) o el id del jugador."""
    rows = []
    entities = [("e", "equipo", 0)] + [(str(p), "jugador", p) for p in player_ids]
    for code, kind, ent_id in entities:
        for stat in data.series_stats:
            if stat.entity != kind:
                continue
            points = sorted(data.series.get((kind, ent_id, stat.id), []), key=lambda x: x[1], reverse=True)
            for n, (match_id, _day, value, num, den) in enumerate(points, start=1):
                rows.append((f"{code}|{stat.id}|{n}", match_id, value, num, den))
    return rows


def safe_text(value: str) -> str:
    """Texto que empieza como fórmula: se le antepone un apóstrofo (14.3)."""
    return f"'{value}" if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value


def sheet_name(name: str) -> str:
    return "".join(ch for ch in name if ch not in "[]:*?/\\")[:31]


# --------------------------------------------------------------------------------------------
# Libro


class Book:
    """Un libro con los formatos de la casa y el registro de hojas para el índice."""

    def __init__(self, title: str, scope: str, updated: str) -> None:
        self.buffer = io.BytesIO()
        self.wb: Workbook = xlsxwriter.Workbook(self.buffer, {"in_memory": True, "nan_inf_to_errors": True})
        self.wb.set_calc_mode("auto")
        self.wb.set_properties({"title": f"{SYSTEM} · {title}", "author": SYSTEM, "company": SYSTEM})
        self.title, self.scope, self.updated = title, scope, updated
        self.sheets: list[tuple[str, str]] = []
        base = {"font_name": FONT, "font_size": 10}
        f = self.wb.add_format
        self.text = f(base)
        self.title_fmt = f({**base, "bold": True, "font_size": 16, "font_color": GREEN_DARK})
        self.sub = f({**base, "italic": True, "font_color": "#555B55"})
        self.head = f(
            {
                **base,
                "bold": True,
                "bg_color": GREEN_DARK,
                "font_color": "#FFFFFF",
                "text_wrap": True,
                "valign": "vcenter",
                "border": 1,
                "border_color": "#E6E8E6",
            }
        )
        self.cell = f({**base, "num_format": "#,##0.00"})
        self.zebra = f({**base, "num_format": "#,##0.00", "bg_color": ZEBRA})
        self.int = f({**base, "num_format": "#,##0"})
        self.pct = f({**base, "num_format": '0.0" %"'})
        self.nd = f({**base, "font_color": "#9AA09A", "align": "right"})
        self.link = f({**base, "font_color": GREEN_DARK, "underline": 1})
        self.bold = f({**base, "bold": True})
        self.input = f({**base, "bold": True, "bg_color": "#FFF7D6", "border": 1, "border_color": YELLOW})
        self.note = f({**base, "font_color": "#555B55", "text_wrap": True, "valign": "top"})

    def sheet(self, name: str, description: str) -> Worksheet:
        ws = self.wb.add_worksheet(sheet_name(name))
        ws.set_column(0, 0, 28, self.text)
        self.sheets.append((ws.get_name(), description))
        return ws

    def header(self, ws: Worksheet, title: str, source: str) -> int:
        """Título, fuente, fecha y enlace al índice arriba de cada hoja. Devuelve la primera fila libre."""
        ws.write_string(0, 0, f"{SYSTEM} · {title}", self.title_fmt)
        ws.write_string(1, 0, f"{self.scope} · actualizado {self.updated} · fuente: {source}", self.sub)
        ws.write_url(2, 0, "internal:'Índice'!A1", self.link, string="Volver al índice")
        ws.set_row(0, 24)
        return 4

    def write(self, ws: Worksheet, row: int, col: int, value: Any, fmt: Any = None) -> None:
        if value is None or (isinstance(value, float) and math.isnan(value)):
            ws.write_string(row, col, "n/d", self.nd)
        elif isinstance(value, bool):
            ws.write_string(row, col, "sí" if value else "no", fmt or self.text)
        elif isinstance(value, int | float):
            ws.write_number(row, col, value, fmt or self.cell)
        else:
            ws.write_string(row, col, safe_text(str(value)), fmt or self.text)

    def table(
        self,
        ws: Worksheet,
        row: int,
        head: Sequence[str],
        rows: Sequence[Sequence[Any]],
        widths: Sequence[float] | None = None,
        formats: Sequence[Any] | None = None,
        freeze: bool = True,
    ) -> tuple[int, int]:
        """Tabla con encabezado verde, zebra, autofiltro y paneles congelados.

        Devuelve la primera y la última fila de datos.
        """
        for c, h in enumerate(head):
            ws.write_string(row, c, h, self.head)
        ws.set_row(row, 30)
        for r, values in enumerate(rows, start=row + 1):
            for c, v in enumerate(values):
                fmt = formats[c] if formats and c < len(formats) and formats[c] is not None else None
                if fmt is None and isinstance(v, int | float) and not isinstance(v, bool):
                    fmt = self.zebra if (r - row) % 2 == 0 else self.cell
                self.write(ws, r, c, v, fmt)
        last = row + max(1, len(rows))
        ws.autofilter(row, 0, last, len(head) - 1)
        if freeze:
            ws.freeze_panes(row + 1, 1)
        for c, w in enumerate(widths or []):
            ws.set_column(c, c, w)
        return row + 1, last

    def finish(self) -> bytes:
        idx = self.wb.get_worksheet_by_name("Índice")
        if idx is not None:
            for r, (name, description) in enumerate(self.sheets, start=4):
                if name == "Índice":
                    continue
                idx.write_url(r, 0, f"internal:'{name}'!A1", self.link, string=name)
                idx.write_string(r, 1, description, self.note)
        self.wb.close()
        return self.buffer.getvalue()


def chart_sheet(
    book: Book, name: str, title: str, source_sheet: str | None, note: str
) -> tuple[Worksheet, int]:
    ws = book.sheet(name, title)
    row = book.header(ws, title, "vistas api de Supabase")
    if source_sheet:
        ws.write_url(2, 2, f"internal:'{source_sheet}'!A1", book.link, string="Ver datos de origen")
    ws.write_string(3, 0, note, book.note)
    return ws, row + 1


def style_chart(chart: Any, title: str, x: str | None = None, y: str | None = None) -> None:
    chart.set_title({"name": title, "name_font": {"name": FONT, "size": 12, "bold": True}})
    chart.set_legend({"position": "bottom", "font": {"name": FONT, "size": 9}})
    chart.set_chartarea({"border": {"none": True}})
    chart.set_size({"width": 760, "height": 400})
    if x is not None:
        chart.set_x_axis(
            {"name": x, "num_font": {"name": FONT, "size": 9}, "name_font": {"name": FONT, "size": 9}}
        )
    if y is not None:
        chart.set_y_axis(
            {
                "name": y,
                "num_font": {"name": FONT, "size": 9},
                "name_font": {"name": FONT, "size": 9},
                "major_gridlines": {"visible": True, "line": {"color": "#E6E8E6"}},
            }
        )


def build(data: Data) -> bytes:
    """Arma el libro de la temporada."""
    scope = SCOPE
    book = Book(scope, scope, data.updated)
    players = data.players
    # A principio de temporada nadie llega a 400 minutos: el mínimo baja al 40 % del que más jugó.
    threshold = int(min(MIN_MINUTES, 0.4 * max((p.minutes for p in players), default=0)))
    eligible = [p for p in players if p.minutes >= threshold]
    stats = data.stats
    by_id = {s.id: s for s in stats}
    team = data.team

    # Índice y metadatos.
    idx = book.sheet("Índice", "Todas las hojas del libro")
    book.header(idx, "Índice", "este libro")
    idx.set_column(1, 1, 90)
    meta = book.sheet("Metadatos", "Fuente, fecha de actualización, filtros y notas")
    r = book.header(meta, "Metadatos", "vistas api de Supabase (las mismas de la web)")
    rows = [
        ("Sistema", SYSTEM),
        ("Alcance", f"{scope} (la única competición cargada: este libro es también el global)"),
        ("Fuente", "Liga Nacional de Básquet (box scores y play-by-play) y Wikipedia (plantel)"),
        ("Actualizado", data.updated),
        ("Generado", datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")),
        ("Jugadores", len(players)),
        ("Partidos de Boca", len(team)),
        ("Mínimo para medias y percentiles", f"{threshold} minutos"),
        ("Valores", "Cada 36 minutos cuando la estadística lo admite; porcentajes y promedios, tal cual."),
        ("n/d", "Sin dato en la fuente: se ve en gris y no cuenta en medias ni percentiles."),
        ("Estimadas", "Llevan «(est.)» en el encabezado de la tabla maestra."),
        (
            "Tipografía",
            "Montserrat. Si no está instalada, Excel la reemplaza por otra; los datos no cambian.",
        ),
        (
            "Fórmulas",
            "Comparador, Dispersión y Desglosada se recalculan al abrir el libro y al cambiar las listas.",
        ),
    ]
    book.table(meta, r, ["Dato", "Valor"], rows, widths=[34, 90], freeze=False)

    # Tabla maestra.
    master = book.sheet(
        "Tabla maestra", "Jugadores en filas y estadísticas en columnas (cada 36 cuando corresponde)"
    )
    r = book.header(master, "Tabla maestra", "player_stat y player_summary")
    head = [
        "Jugador",
        "Zona",
        "Posición",
        "Partidos",
        "Minutos",
        *[s.name + (" (est.)" if s.estimated else "") for s in stats],
    ]
    body = [[p.name, p.line, p.role, p.matches, p.minutes, *[per36(p, s) for s in stats]] for p in players]
    first, last = book.table(master, r, head, body, widths=[26, 12, 12, 9, 9])
    master.set_column(5, 4 + len(stats), 12)
    for c, s in enumerate(stats, start=5):
        # Formato condicional por percentil: verde lo mejor, rojo lo peor (según el sentido).
        good, bad = (GREEN, "#F4B6B0") if s.higher_is_better else ("#F4B6B0", GREEN)
        master.conditional_format(
            first,
            c,
            last,
            c,
            {"type": "3_color_scale", "min_color": bad, "mid_color": "#FFFFFF", "max_color": good},
        )

    # Catálogo.
    cat = book.sheet("Catálogo", "Cada estadística con su descripción y su fórmula")
    r = book.header(cat, "Catálogo", "stat_catalog")
    book.table(
        cat,
        r,
        [
            "Estadística",
            "Id",
            "Grupo",
            "Descripción",
            "Fórmula",
            "Unidad",
            "Nivel",
            "Más es mejor",
            "Estimada",
        ],
        [
            [
                s.name,
                s.id,
                s.group,
                s.description,
                s.formula,
                s.unit,
                s.level,
                s.higher_is_better,
                s.estimated,
            ]
            for s in stats
        ],
        widths=[28, 22, 20, 70, 40, 12, 7, 12, 10],
    )

    # Referencias de 9.7: el plantel, cada zona y cada posición (con el mínimo de minutos).
    refs: list[tuple[str, list[Player]]] = [("Media del plantel", eligible)]
    refs += [(f"Media de {ZONE_PLURAL[z]}", [p for p in eligible if p.line == z]) for z in ZONES]
    refs += [(f"Media de la posición {q}", [p for p in eligible if p.role == q]) for q in POSITIONS]
    refs = [(name, members) for name, members in refs if members]

    # Datos ocultos para las hojas interactivas: percentiles y valores por nombre (jugadores y medias).
    pct = book.sheet("Datos comparador", "Percentiles y valores que usan Comparador y Dispersión (oculta)")
    names = [p.name for p in players] + [name for name, _ in refs]
    pct.write_string(0, 0, "Nombre", book.head)
    for c, s in enumerate(stats, start=1):
        pct.write_string(0, c, s.id, book.head)
        pct.write_string(0, c + len(stats), s.name, book.head)
    groups = {s.id: [v for p in eligible if (v := per36(p, s)) is not None] for s in stats}
    for i, p in enumerate(players, start=1):
        pct.write_string(i, 0, safe_text(p.name))
        for c, s in enumerate(stats, start=1):
            v = per36(p, s)
            if v is not None:
                pct.write_number(i, c, percentile(groups[s.id], v, s.higher_is_better))
                pct.write_number(i, c + len(stats), v)
    for j, (name, members) in enumerate(refs, start=len(players) + 1):
        pct.write_string(j, 0, name)
        for c, s in enumerate(stats, start=1):
            v = media(members, s)
            if v is not None:
                pct.write_number(j, c, percentile(groups[s.id], v, s.higher_is_better))
                pct.write_number(j, c + len(stats), v)
    pct.hide()
    n_names = len(names)
    names_range = f"='Datos comparador'!$A$2:$A${n_names + 1}"
    last_col = xl_col_to_name(len(stats))
    pct_block = f"'Datos comparador'!$B$2:${last_col}${n_names + 1}"
    id_row = f"'Datos comparador'!$B$1:${last_col}$1"
    val_first = xl_col_to_name(len(stats) + 1)
    val_last = xl_col_to_name(2 * len(stats))
    val_block = f"'Datos comparador'!${val_first}$2:${val_last}${n_names + 1}"
    name_row = f"'Datos comparador'!${val_first}$1:${val_last}$1"

    # Conjuntos: fila por conjunto con hasta 8 estadísticas (ids y nombres).
    sets_ws = book.sheet("Conjuntos", "Conjuntos de estadísticas del Comparador (oculta)")
    usable_sets = []
    for _set_id, set_name, ids in data.sets:
        ids8 = [i for i in ids if i in by_id][:8]
        if len(ids8) >= 3:
            usable_sets.append((set_name, ids8))
    for i, (set_name, ids8) in enumerate(usable_sets):
        sets_ws.write_string(i, 0, set_name)
        for c, sid in enumerate(ids8, start=1):
            sets_ws.write_string(i, c, sid)
            sets_ws.write_string(i, c + 8, by_id[sid].short)
    sets_ws.hide()

    # Comparador: 2 a 4 nombres y un conjunto; radar de percentiles y barras de valores.
    comp = book.sheet(
        "Comparador", "Elegí de 2 a 4 jugadores o medias y un conjunto: el radar y las barras cambian"
    )
    r = book.header(
        comp, "Comparador", f"player_stat (percentiles entre jugadores con {threshold} minutos o más)"
    )
    comp.write_string(
        r, 0, "Elegí en las celdas amarillas (listas desplegables). Vacía = no se dibuja.", book.note
    )
    picks = [players[i].name if i < len(players) else "" for i in range(2)] + [
        "Media del plantel",
        "",
    ]
    for i in range(4):
        comp.write_string(r + 1 + i, 0, f"Jugador o media {i + 1}", book.bold)
        comp.write_string(r + 1 + i, 1, picks[i], book.input)
        comp.data_validation(
            r + 1 + i, 1, r + 1 + i, 1, {"validate": "list", "source": names_range, "ignore_blank": True}
        )
    set_row = r + 6
    comp.write_string(set_row, 0, "Conjunto", book.bold)
    comp.write_string(set_row, 1, usable_sets[0][0] if usable_sets else "", book.input)
    comp.data_validation(
        set_row,
        1,
        set_row,
        1,
        {"validate": "list", "source": f"=Conjuntos!$A$1:$A${max(1, len(usable_sets))}"},
    )
    comp.set_column(1, 1, 34)
    grid = set_row + 2
    comp.write_string(grid, 0, "Estadística", book.head)
    comp.write_string(grid, 1, "Id", book.head)
    set_cell = xl_rowcol_to_cell(set_row, 1, row_abs=True, col_abs=True)

    def pick_cell(i: int) -> str:
        return str(xl_rowcol_to_cell(r + 1 + i, 1, row_abs=True, col_abs=True))

    for i in range(4):
        comp.write_formula(
            grid,
            2 + i,
            f'=IF({pick_cell(i)}="","—",{pick_cell(i)})',
            book.head,
        )
        comp.write_formula(grid, 6 + i, f"={xl_rowcol_to_cell(grid, 2 + i, row_abs=True)}", book.head)
    comp.write_string(grid - 1, 2, "Percentil (0 a 100)", book.bold)
    comp.write_string(grid - 1, 6, "Valor (cada 36 cuando corresponde)", book.bold)
    sets_rows = f"Conjuntos!$A$1:$A${max(1, len(usable_sets))}"
    set_ids = f"Conjuntos!$B$1:$I${max(1, len(usable_sets))}"
    set_names = f"Conjuntos!$J$1:$Q${max(1, len(usable_sets))}"
    for k in range(8):
        row = grid + 1 + k
        comp.write_formula(
            row,
            1,
            f'=IFERROR(INDEX({set_ids},MATCH({set_cell},{sets_rows},0),{k + 1}),"")',
        )
        comp.write_formula(
            row,
            0,
            f'=IFERROR(INDEX({set_names},MATCH({set_cell},{sets_rows},0),{k + 1}),"")',
        )
        sid = xl_rowcol_to_cell(row, 1, col_abs=True)
        for i in range(4):
            who = xl_rowcol_to_cell(r + 1 + i, 1, row_abs=True, col_abs=True)
            comp.write_formula(
                row,
                2 + i,
                f'=IF(OR({who}="",{sid}=""),NA(),IFERROR(INDEX({pct_block},MATCH({who},{names_range[1:]},0),MATCH({sid},{id_row},0)),NA()))',
            )
            comp.write_formula(
                row,
                6 + i,
                f'=IF(OR({who}="",{sid}=""),NA(),IFERROR(INDEX({val_block},MATCH({who},{names_range[1:]},0),MATCH({sid},{id_row},0)),NA()))',
                book.cell,
            )
    colors = [GREEN_DARK, VIOLET, BLUE, YELLOW]
    radar = book.wb.add_chart({"type": "radar", "subtype": "filled"})
    bars = book.wb.add_chart({"type": "bar"})
    for i in range(4):
        cats = ["Comparador", grid + 1, 0, grid + 8, 0]
        radar.add_series(
            {
                "name": ["Comparador", grid, 2 + i],
                "categories": cats,
                "values": ["Comparador", grid + 1, 2 + i, grid + 8, 2 + i],
                "line": {"color": colors[i], "width": 2},
                "fill": {"color": colors[i], "transparency": 80},
            }
        )
        bars.add_series(
            {
                "name": ["Comparador", grid, 6 + i],
                "categories": cats,
                "values": ["Comparador", grid + 1, 6 + i, grid + 8, 6 + i],
                "fill": {"color": colors[i]},
                "gap": 60,
            }
        )
    style_chart(radar, "Percentiles del conjunto elegido")
    radar.set_y_axis({"min": 0, "max": 100, "major_unit": 25})
    style_chart(bars, "Valores del conjunto elegido")
    comp.insert_chart(grid + 11, 0, radar)
    comp.insert_chart(grid + 11, 6, bars)
    comp.write_string(
        grid + 10,
        0,
        "Verde: el primero; violeta: el segundo; azul y amarillo: el tercero y el cuarto.",
        book.note,
    )

    # Dispersión: eje X y eje Y a elección.
    disp = book.sheet("Dispersión", "Elegí la estadística del eje X y la del eje Y: la dispersión cambia")
    r = book.header(disp, "Dispersión", "player_stat")
    stat_names = f"'Datos comparador'!${val_first}$1:${val_last}$1"
    disp.write_string(r, 0, "Eje X", book.bold)
    disp.write_string(r, 1, by_id["usg_pct"].name if "usg_pct" in by_id else stats[0].name, book.input)
    disp.write_string(r + 1, 0, "Eje Y", book.bold)
    disp.write_string(r + 1, 1, by_id["ts"].name if "ts" in by_id else stats[1].name, book.input)
    for k in (0, 1):
        disp.data_validation(r + k, 1, r + k, 1, {"validate": "list", "source": f"={stat_names}"})
    disp.set_column(1, 1, 34)
    t = r + 3
    for c, h in enumerate(["Jugador", "Zona", "Minutos", "X", "Y"]):
        disp.write_string(t, c, h, book.head)
    xc = xl_rowcol_to_cell(r, 1, row_abs=True, col_abs=True)
    yc = xl_rowcol_to_cell(r + 1, 1, row_abs=True, col_abs=True)
    for i, p in enumerate(eligible, start=t + 1):
        disp.write_string(i, 0, safe_text(p.name))
        disp.write_string(i, 1, p.line or "n/d")
        disp.write_number(i, 2, p.minutes, book.int)
        who = xl_rowcol_to_cell(i, 0, col_abs=True)
        for col, axis in ((3, xc), (4, yc)):
            disp.write_formula(
                i,
                col,
                f"=IFERROR(INDEX({val_block},MATCH({who},{names_range[1:]},0),MATCH({axis},{name_row},0)),NA())",
                book.cell,
            )
    scatter = book.wb.add_chart({"type": "scatter"})
    if eligible:
        scatter.add_series(
            {
                "name": f"Jugadores ({threshold} minutos o más)",
                "categories": ["Dispersión", t + 1, 3, t + len(eligible), 3],
                "values": ["Dispersión", t + 1, 4, t + len(eligible), 4],
                "marker": {
                    "type": "circle",
                    "size": 7,
                    "fill": {"color": GREEN_DARK},
                    "border": {"color": "#FFFFFF"},
                },
            }
        )
    style_chart(scatter, "Dispersión", "Eje X (elegido arriba)", "Eje Y (elegido arriba)")
    if eligible:
        disp.insert_chart(r, 7, scatter)

    # Comparación: medias por categoría (plantel, zonas y posiciones).
    cmpw = book.sheet(
        "Comparación", "Medias del plantel, de cada zona y de cada posición, por categoría (9.7)"
    )
    r = book.header(cmpw, "Comparación", "player_stat")
    groups_order: dict[str, list[Stat]] = {}
    for s in stats:
        groups_order.setdefault(s.group or "Otras", []).append(s)
    for group, list_ in groups_order.items():
        cmpw.write_string(r, 0, group, book.bold)
        _, end = book.table(
            cmpw,
            r + 1,
            ["Estadística", *[name for name, _ in refs]],
            [[s.name, *[media(m, s) for _, m in refs]] for s in list_],
            widths=[30, 18, 16, 16, 16, 16],
            freeze=False,
        )
        cmpw.autofilter(0, 0, 0, 0)
        r = end + 2

    # Equipo: partido a partido (datos de origen de los gráficos del equipo).
    team_ws = book.sheet("Equipo", "Boca partido a partido (datos de origen de los gráficos del equipo)")
    r = book.header(team_ws, "Equipo partido a partido", "boca_game")
    keys = [
        ("ortg", "ORtg"),
        ("drtg", "DRtg"),
        ("net_rating", "NR"),
        ("pace", "Ritmo"),
        ("efg", "eFG%"),
        ("tov_pct", "TOV%"),
        ("orb_pct_team", "ORB%"),
        ("ft_per_fga", "FT/FGA"),
    ]
    team_rows = []
    wins = 0
    for m in team:
        won = m["pf"] > m["pa"]
        wins += 1 if won else 0
        st = m["stats"]
        team_rows.append(
            [
                m["match_date"],
                m["opponent"],
                "Local" if m["home"] else "Visitante",
                m["pf"],
                m["pa"],
                "G" if won else "P",
                m["pf"] - m["pa"],
                wins,
                *[as_percent(st.get(k)) if "%" in n or k == "ft_per_fga" else st.get(k) for k, n in keys],
            ]
        )
    nr_col = 8 + 2  # NR
    roll_col = 8 + len(keys)
    t_first, t_last = book.table(
        team_ws,
        r,
        [
            "Fecha",
            "Rival",
            "Localía",
            "PF",
            "PC",
            "Resultado",
            "Diferencia",
            "Victorias acumuladas",
            *[n for _, n in keys],
        ],
        team_rows,
        widths=[11, 24, 10, 6, 6, 9, 9, 10, 8, 8, 8, 8, 8, 8, 8, 8],
    )
    if team:
        # Media móvil de 5 del NR, calculada en el pipeline (columna nueva al lado de la tabla).
        team_ws.write_string(r, roll_col, "NR (media móvil de 5)", book.head)
        for i in range(len(team_rows)):
            window = [
                v for v in (x[nr_col] for x in team_rows[max(0, i - 4) : i + 1]) if isinstance(v, int | float)
            ]
            book.write(team_ws, t_first + i, roll_col, sum(window) / len(window) if window else None)

    def add_note_sheet(name: str, title: str, note: str) -> None:
        chart_sheet(book, name, title, None, note)

    # 3. Ranking: un gráfico por conjunto (los 10 primeros en la primera estadística del conjunto).
    rank_ws, r = chart_sheet(
        book,
        "G03 Ranking",
        "Ranking por conjunto (los 10 primeros)",
        "Tabla maestra",
        "Barras nativas: los 10 primeros de la primera estadística de cada conjunto"
        " (cada 36 cuando corresponde, con el mínimo de minutos).",
    )
    row_at = r
    for set_name, ids8 in usable_sets[:6]:
        s = by_id[ids8[0]]
        ranked = sorted(
            ((p.name, v) for p in eligible if (v := per36(p, s)) is not None),
            key=lambda x: -x[1] if s.higher_is_better else x[1],
        )[:10]
        if not ranked:
            continue
        rank_ws.write_string(row_at, 0, f"{set_name}: {s.name}", book.bold)
        f0, l0 = book.table(rank_ws, row_at + 1, ["Jugador", s.name], ranked, widths=[26, 14], freeze=False)
        ch = book.wb.add_chart({"type": "bar"})
        ch.add_series(
            {
                "name": s.name,
                "categories": [rank_ws.get_name(), f0, 0, l0, 0],
                "values": [rank_ws.get_name(), f0, 1, l0, 1],
                "fill": {"color": GREEN_DARK},
                "gap": 50,
            }
        )
        style_chart(ch, f"{set_name}: {s.name}")
        ch.set_y_axis({"reverse": True})
        ch.set_size({"width": 620, "height": 300})
        rank_ws.insert_chart(row_at, 3, ch)
        row_at += 17
    rank_ws.autofilter(0, 0, 0, 0)

    # 4. Distribución: columnas por intervalos del Game Score medio y tabla de cuartiles.
    rating = by_id.get("game_score_avg") or by_id.get("efficiency")
    dist_ws, r = chart_sheet(
        book,
        "G04 Distribución",
        f"Distribución de {rating.name if rating else 'la valoración'}",
        "Tabla maestra",
        "Columnas por intervalos y tabla de cuartiles (Excel no tiene caja y bigotes nativo).",
    )
    vals = sorted(v for p in eligible if rating and (v := per36(p, rating)) is not None)
    if rating and len(vals) >= 4:
        k = 6
        lo, hi = vals[0], vals[-1]
        width = (hi - lo) / k or 1
        bins = [
            [
                f"{lo + i * width:.1f} a {lo + (i + 1) * width:.1f}",
                sum(
                    1 for v in vals if lo + i * width <= v < lo + (i + 1) * width or (i == k - 1 and v == hi)
                ),
            ]
            for i in range(k)
        ]
        f0, l0 = book.table(dist_ws, r, ["Intervalo", "Jugadores"], bins, widths=[18, 10], freeze=False)
        ch = book.wb.add_chart({"type": "column"})
        ch.add_series(
            {
                "name": "Jugadores",
                "categories": [dist_ws.get_name(), f0, 0, l0, 0],
                "values": [dist_ws.get_name(), f0, 1, l0, 1],
                "fill": {"color": GREEN_DARK},
                "gap": 30,
            }
        )
        style_chart(ch, f"{rating.name}: cantidad de jugadores por intervalo", rating.name, "Jugadores")
        dist_ws.insert_chart(r, 3, ch)
        q = statistics.quantiles(vals, n=4)
        book.table(
            dist_ws,
            l0 + 3,
            ["Cuartil", rating.name],
            [["Mínimo", vals[0]], ["Q1", q[0]], ["Mediana", q[1]], ["Q3", q[2]], ["Máximo", vals[-1]]],
            freeze=False,
        )
    else:
        dist_ws.write_string(r, 0, "Todavía no hay al menos 4 jugadores con el mínimo de minutos.", book.note)

    def team_chart(
        name: str, title: str, note: str, series: list[tuple[int, str, str, str]], kind: str, y: str
    ) -> None:
        ws, rr = chart_sheet(book, name, title, "Equipo", note)
        ch = book.wb.add_chart({"type": kind})
        for col, label, color, sub in series:
            spec: dict[str, Any] = {
                "name": label,
                "categories": ["Equipo", t_first, 0, t_last, 0],
                "values": ["Equipo", t_first, col, t_last, col],
            }
            if kind == "line":
                spec["line"] = {
                    "color": color,
                    "width": 2.25,
                    **({"dash_type": "dash"} if sub == "dash" else {}),
                }
            else:
                spec["fill"] = {"color": color}
            ch.add_series(spec)
        style_chart(ch, title, "Partido", y)
        ws.insert_chart(rr, 0, ch)

    if team:
        # 5. Evolución por partido: NR y su media móvil de 5.
        team_chart(
            "G05 Evolución",
            "NR por partido y media móvil de 5",
            "Líneas nativas.",
            [(nr_col, "NR", GREEN_DARK, ""), (roll_col, "Media móvil de 5", VIOLET, "dash")],
            "line",
            "NR",
        )
        # 6. Puntos a favor y en contra, y ORtg y DRtg.
        pts_ws, rr = chart_sheet(
            book,
            "G06 Puntos",
            "Puntos a favor y en contra; ORtg y DRtg",
            "Equipo",
            "Líneas nativas: lo en contra en rojo (lo negativo).",
        )
        for k, (col_a, col_b, la, lb, y_name) in enumerate(
            [
                (3, 4, "Puntos a favor", "Puntos en contra", "Puntos"),
                (8, 9, "ORtg", "DRtg", "Cada 100 posesiones"),
            ]
        ):
            ch = book.wb.add_chart({"type": "line"})
            for col, label, color in ((col_a, la, GREEN_DARK), (col_b, lb, RED)):
                ch.add_series(
                    {
                        "name": label,
                        "categories": ["Equipo", t_first, 0, t_last, 0],
                        "values": ["Equipo", t_first, col, t_last, col],
                        "line": {"color": color, "width": 2.25},
                    }
                )
            style_chart(ch, f"{la} y {lb.lower() if k == 0 else lb}", "Partido", y_name)
            pts_ws.insert_chart(rr + k * 22, 0, ch)

        # 7. Cuatro factores: Boca, sus rivales y el promedio de la liga.
        ff_ws, rr = chart_sheet(
            book,
            "G07 Cuatro factores",
            "Cuatro factores: Boca, sus rivales y el promedio de la liga",
            "Equipo",
            "Barras agrupadas nativas. eFG%, ORB% y FT/FGA: más es mejor; TOV%: menos es mejor."
            " Rivales: promedio de lo que le hicieron a Boca.",
        )
        factors = [
            ("eFG%", "efg", "efg_against"),
            ("TOV%", "tov_pct", "tov_pct_against"),
            ("ORB%", "orb_pct_team", "orb_pct_against"),
            ("FT/FGA", "ft_per_fga", "ft_per_fga_against"),
        ]

        def mean_of(key: str) -> float | None:
            vs = [v for m in team if (v := m["stats"].get(key)) is not None]
            return as_percent(sum(vs) / len(vs)) if vs else None

        others = [t for name, t in data.league.items() if name != data.boca_name]
        ff_rows = []
        for label, own_key, against in factors:
            league_vals = [v for t in others if (v := t.get(own_key)) is not None]
            ff_rows.append(
                [
                    label,
                    as_percent(data.league.get(data.boca_name, {}).get(own_key)) or mean_of(own_key),
                    mean_of(against),
                    as_percent(sum(league_vals) / len(league_vals)) if league_vals else None,
                ]
            )
        f0, l0 = book.table(
            ff_ws,
            rr,
            ["Factor", "Boca", "Rivales", "Promedio de la liga"],
            ff_rows,
            widths=[12, 10, 10, 18],
            freeze=False,
        )
        ch = book.wb.add_chart({"type": "column"})
        for c, (label, color) in enumerate(
            (("Boca", GREEN_DARK), ("Rivales", RED), ("Promedio de la liga", BLUE)), start=1
        ):
            ch.add_series(
                {
                    "name": label,
                    "categories": [ff_ws.get_name(), f0, 0, l0, 0],
                    "values": [ff_ws.get_name(), f0, c, l0, c],
                    "fill": {"color": color},
                }
            )
        style_chart(ch, "Cuatro factores", None, "%")
        ff_ws.insert_chart(rr, 5, ch)

        # 8. Rendimiento por cuarto: puntos de Boca en cada cuarto, apilados por partido.
        q_ws, rr = chart_sheet(
            book,
            "G08 Cuartos",
            "Puntos de Boca por cuarto en cada partido",
            "Equipo",
            "Columnas apiladas nativas (un color por cuarto); al lado, la diferencia de cada cuarto.",
        )
        q_rows = []
        for m in team:
            per = data.periods.get(m["match_id"], {})
            q_rows.append(
                [
                    f"{m['match_date'][5:]} {m['opponent']}",
                    *[per.get(k, (None, None))[0] for k in (1, 2, 3, 4)],
                    *[(per[k][0] - per[k][1]) if k in per else None for k in (1, 2, 3, 4)],
                ]
            )
        f0, l0 = book.table(
            q_ws,
            rr,
            ["Partido", "1.º", "2.º", "3.º", "4.º", "Dif. 1.º", "Dif. 2.º", "Dif. 3.º", "Dif. 4.º"],
            q_rows,
            widths=[28],
            freeze=False,
        )
        ch = book.wb.add_chart({"type": "column", "subtype": "stacked"})
        for c, color in enumerate((GREEN_DARK, VIOLET, BLUE, YELLOW), start=1):
            ch.add_series(
                {
                    "name": [q_ws.get_name(), rr, c],
                    "categories": [q_ws.get_name(), f0, 0, l0, 0],
                    "values": [q_ws.get_name(), f0, c, l0, c],
                    "fill": {"color": color},
                }
            )
        style_chart(ch, "Puntos por cuarto", "Partido", "Puntos")
        q_ws.insert_chart(rr, 10, ch)

    # 9. Victorias reales frente a pitagóricas (equipos de la liga).
    py_ws, rr = chart_sheet(
        book,
        "G09 Pitagóricas",
        "Victorias reales frente a pitagóricas (equipos de la liga)",
        "Tabla maestra",
        "Dispersión nativa con una serie diagonal de referencia (victorias = pitagóricas)."
        " Arriba de la diagonal, el equipo ganó más de lo que dicen sus puntos.",
    )
    py_rows = sorted(
        (
            (name, t["pyth_wins"], t["wins"])
            for name, t in data.league.items()
            if "pyth_wins" in t and "wins" in t
        ),
        key=lambda x: -x[2],
    )
    if py_rows:
        f0, l0 = book.table(
            py_ws, rr, ["Equipo", "Pitagóricas", "Reales"], py_rows, widths=[26, 12, 10], freeze=False
        )
        top = max(max(x[1], x[2]) for x in py_rows)
        py_ws.write_row(l0 + 2, 0, ["Diagonal", "Pitagóricas", "Reales"], book.head)
        py_ws.write_row(l0 + 3, 0, ["", 0, 0])
        py_ws.write_row(l0 + 4, 0, ["", top, top])
        sc = book.wb.add_chart({"type": "scatter"})
        sc.add_series(
            {
                "name": "Equipos",
                "categories": [py_ws.get_name(), f0, 1, l0, 1],
                "values": [py_ws.get_name(), f0, 2, l0, 2],
                "marker": {"type": "circle", "size": 7, "fill": {"color": GREEN_DARK}},
            }
        )
        sc.add_series(
            {
                "name": "Reales = pitagóricas",
                "categories": [py_ws.get_name(), l0 + 3, 1, l0 + 4, 1],
                "values": [py_ws.get_name(), l0 + 3, 2, l0 + 4, 2],
                "line": {"color": VIOLET, "dash_type": "dash"},
                "marker": {"type": "none"},
            }
        )
        style_chart(sc, "Victorias reales frente a pitagóricas", "Pitagóricas", "Reales")
        py_ws.insert_chart(rr, 4, sc)

    # 10. Evolución de la tabla: puesto de Boca después de cada partido (eje invertido).
    tab_ws, rr = chart_sheet(
        book,
        "G10 Tabla",
        "Puesto de Boca en la tabla después de cada partido",
        "Equipo",
        "Líneas nativas con el eje invertido (1 arriba). Calculada con los resultados de toda la liga:"
        " por % de victorias y diferencia de puntos (la LNB desempata por resultados entre sí).",
    )
    if team:
        places = standings(data.league_games, data.boca_name, [m["match_date"] for m in team])
        f0, l0 = book.table(
            tab_ws,
            rr,
            ["Fecha", "Rival", "Puesto"],
            [[m["match_date"], m["opponent"], p] for m, p in zip(team, places, strict=True)],
            widths=[11, 24, 8],
            freeze=False,
        )
        ch = book.wb.add_chart({"type": "line"})
        ch.add_series(
            {
                "name": "Puesto",
                "categories": [tab_ws.get_name(), f0, 0, l0, 0],
                "values": [tab_ws.get_name(), f0, 2, l0, 2],
                "line": {"color": GREEN_DARK, "width": 2.25},
                "marker": {"type": "circle", "size": 6, "fill": {"color": GREEN_DARK}},
            }
        )
        style_chart(ch, "Puesto en la tabla", "Partido", "Puesto")
        ch.set_y_axis({"reverse": True, "min": 1, "major_unit": 1})
        tab_ws.insert_chart(rr, 4, ch)

    # 11. Mapa de tiros: no se puede reproducir en Excel; la hoja lo dice.
    add_note_sheet(
        "G11 Mapa de tiros",
        "Mapa de tiros",
        "No se exporta como gráfico nativo: Excel no admite una imagen de cancha de fondo, y las"
        " coordenadas crudas no se republican. El reparto por zona está en la Tabla maestra (grupo zonas).",
    )

    # 12. Minutos (apiladas: como titular y desde el banco) y la línea de minutos por partido.
    min_ws, rr = chart_sheet(
        book,
        "G12 Minutos",
        "Minutos por jugador: como titular y desde el banco",
        "Tabla maestra",
        "Columnas apiladas nativas y una línea de minutos por partido en el segundo eje.",
    )
    mrows = [
        [
            p.name,
            p.starter_minutes,
            max(0.0, round(p.minutes - p.starter_minutes, 1)),
            p.minutes / p.matches if p.matches else None,
        ]
        for p in players[:20]
    ]
    f0, l0 = book.table(
        min_ws,
        rr,
        ["Jugador", "Como titular", "Desde el banco", "Minutos por partido"],
        mrows,
        widths=[26, 12, 12, 12],
        freeze=False,
    )
    ch = book.wb.add_chart({"type": "column", "subtype": "stacked"})
    for c, (label, color) in enumerate((("Como titular", GREEN_DARK), ("Desde el banco", VIOLET)), start=1):
        ch.add_series(
            {
                "name": label,
                "categories": [min_ws.get_name(), f0, 0, l0, 0],
                "values": [min_ws.get_name(), f0, c, l0, c],
                "fill": {"color": color},
            }
        )
    line_ch = book.wb.add_chart({"type": "line"})
    line_ch.add_series(
        {
            "name": "Minutos por partido",
            "categories": [min_ws.get_name(), f0, 0, l0, 0],
            "values": [min_ws.get_name(), f0, 3, l0, 3],
            "line": {"color": YELLOW, "width": 2.25},
            "y2_axis": True,
        }
    )
    ch.combine(line_ch)
    style_chart(ch, "Minutos por jugador", None, "Minutos")
    min_ws.insert_chart(rr, 5, ch)

    # 13. Métricas propias (On/Off por jugador, positivos y negativos en dos series).
    onoff = by_id.get("on_off")
    met_ws, rr = chart_sheet(
        book,
        "G13 Métricas propias",
        "On/Off por jugador (positivos y negativos)",
        "Tabla maestra",
        "Barras con dos series para colorear por signo: verde positivo, rojo negativo."
        " On/Off = NR con el jugador en cancha menos NR sin él.",
    )
    nrows = sorted(
        ((p.name, v) for p in eligible if onoff and (v := per36(p, onoff)) is not None), key=lambda x: -x[1]
    )
    f0, l0 = book.table(
        met_ws,
        rr,
        ["Jugador", "On/Off positivo", "On/Off negativo"],
        [[n, v if v >= 0 else None, v if v < 0 else None] for n, v in nrows],
        widths=[26, 14, 14],
        freeze=False,
    )
    ch = book.wb.add_chart({"type": "bar", "subtype": "stacked"})
    for c, (label, color) in enumerate((("Positivo", GREEN_DARK), ("Negativo", RED)), start=1):
        ch.add_series(
            {
                "name": label,
                "categories": [met_ws.get_name(), f0, 0, l0, 0],
                "values": [met_ws.get_name(), f0, c, l0, c],
                "fill": {"color": color},
            }
        )
    style_chart(ch, "On/Off por jugador")
    ch.set_y_axis({"reverse": True})
    met_ws.insert_chart(rr, 4, ch)

    # 14. Correlación entre estadísticas clave (tabla con escala de color).
    corr_ws, rr = chart_sheet(
        book,
        "G14 Correlación",
        "Correlación entre estadísticas clave",
        "Tabla maestra",
        "Tabla con formato condicional de escala de color (Excel no tiene mapa de calor nativo)."
        " Pearson entre jugadores con el mínimo de minutos; las de nivel A del catálogo.",
    )
    key_stats = [s for s in stats if s.level == "A" and sum(per36(p, s) is not None for p in eligible) >= 3][
        :12
    ]
    matrix = []
    for a in key_stats:
        row_vals: list[Any] = [a.name]
        for b in key_stats:
            pairs = [
                (x, y) for p in eligible if (x := per36(p, a)) is not None and (y := per36(p, b)) is not None
            ]
            row_vals.append(pearson([x for x, _ in pairs], [y for _, y in pairs]) if pairs else None)
        matrix.append(row_vals)
    f0, l0 = book.table(corr_ws, rr, ["", *[s.short for s in key_stats]], matrix, widths=[26], freeze=False)
    corr_ws.conditional_format(
        f0,
        1,
        l0,
        len(key_stats),
        {
            "type": "3_color_scale",
            "min_color": "#F4B6B0",
            "mid_color": "#FFFFFF",
            "max_color": GREEN,
            "min_type": "num",
            "min_value": -1,
            "mid_type": "num",
            "mid_value": 0,
            "max_type": "num",
            "max_value": 1,
        },
    )

    # Desglosada (9.8), con la serie por partido de Boca y de cada jugador.
    breakdown_sheets(book, data, players)

    # Situaciones (9.6): una fila por fila de tarjeta.
    if data.situations:
        si = book.sheet(
            "Situaciones", "Una fila por fila de tarjeta: n, % de victorias y diferencia contra la base"
        )
        r = book.header(si, "Situaciones", "situational_result")
        book.table(
            si,
            r,
            [
                "Categoría",
                "Tarjeta",
                "Fila",
                "Partidos",
                "G",
                "P",
                "% victorias",
                "Dif. vs base (pp)",
                "PF",
                "PC",
                "Diferencia",
            ],
            [
                [
                    s["category"],
                    s["title"],
                    s["param_value"],
                    s["n"],
                    s["w"],
                    s["l"],
                    s["win_pct"],
                    s["delta"],
                    s["pf_avg"],
                    s["pa_avg"],
                    s["margin"],
                ]
                for s in data.situations
            ],
            widths=[18, 50, 26, 9, 5, 5, 10, 12, 7, 7, 9],
        )

    # Índice primero.
    book.wb.worksheets_objs.sort(key=lambda w: 0 if w.get_name() == "Índice" else 1)
    idx.activate()
    return book.finish()


# --------------------------------------------------------------------------------------------
# Desglosada (9.8): entidad, estadística y ventana en listas, con fórmulas vivas


TEAM_NAME = "Boca Juniors"
EXCEL_EPOCH = date(1899, 12, 30)
# Columnas auxiliares (ocultas) de la lista de partidos de la hoja Desglosada.
AUX = 23


def breakdown_windows(competitions: Sequence[str]) -> list[tuple[str, str, Any]]:
    """Ventanas de 9.8 como (nombre, tipo, parámetro). Por rival y por tiempo quedan en la web."""
    return [
        ("Último partido", "n", 1),
        ("Últimos 3 partidos", "n", 3),
        ("Últimos 5 partidos", "n", 5),
        ("Últimos 10 partidos", "n", 10),
        *[(f"Últimos {d} días", "dias", d) for d in (7, 14, 30, 60, 90)],
        ("Mes en curso", "mes", ""),
        ("Mes anterior", "mes_ant", ""),
        ("Temporada", "todo", ""),
        ("Local", "local", ""),
        ("Visitante", "visitante", ""),
        ("En victorias", "resultado", "G"),
        ("En derrotas", "resultado", "P"),
        *[(name, "comp", name) for name in competitions],
    ]


def breakdown_sheets(book: Book, data: Data, players: Sequence[Player]) -> None:
    """`Desglosada`: se elige entidad, estadística y ventana en listas, y fórmulas sobre la serie por
    partido (hoja oculta) dan n, valor, total, mejor, peor y la diferencia contra la temporada, más la
    lista de partidos y un gráfico nativo que marca los de la ventana. Las mismas reglas que la web."""
    rows = series_rows(data, [p.id for p in players])
    if not rows:
        return
    wb = book.wb

    def name_range(name: str, sheet: str, c: int, first: int, last: int) -> None:
        letter = xl_col_to_name(c)
        wb.define_name(name, f"='{sheet}'!${letter}${first + 1}:${letter}${last + 1}")

    # Serie por partido (oculta).
    serie = book.sheet(
        "Serie por partido", "Valor de cada estadística en cada partido (oculta, para Desglosada)"
    )
    for c, h in enumerate(["Clave", "Partido", "Valor", "Numerador", "Denominador"]):
        serie.write_string(0, c, h)
    for i, (clave, match_id, value, num, den) in enumerate(rows, start=1):
        serie.write_string(i, 0, clave)
        serie.write_row(i, 1, [match_id, value, num, den])
    serie.hide()
    for c, name in enumerate(["SERIE_CLAVE", "SERIE_PARTIDO", "SERIE_VALOR", "SERIE_NUM", "SERIE_DEN"]):
        name_range(name, "Serie por partido", c, 1, len(rows))

    # Listas (oculta): partidos, entidades, estadísticas y ventanas.
    lists = book.sheet(
        "Listas desglosada", "Partidos, entidades, estadísticas y ventanas (oculta, para Desglosada)"
    )
    lists.hide()
    matches = sorted(data.team, key=lambda m: m["match_date"])
    for i, m in enumerate(matches, start=1):
        gf, ga = m["pf"], m["pa"]
        lists.write_number(i, 0, m["match_id"])
        lists.write_number(i, 1, (date.fromisoformat(str(m["match_date"])[:10]) - EXCEL_EPOCH).days)
        lists.write_string(i, 2, safe_text(m["opponent"] or ""))
        lists.write_string(i, 3, "Local" if m["home"] else "Visitante")
        lists.write_string(i, 4, "G" if gf > ga else "P")
        lists.write_string(i, 5, "Liga Nacional")
        lists.write_string(i, 6, f"{gf}-{ga}")
    for c, name in enumerate(("ID", "FECHA", "RIVAL", "LOCALIA", "RES", "COMP", "MARCADOR")):
        name_range(f"PARTIDO_{name}", "Listas desglosada", c, 1, len(matches))
    present = {tuple(clave.split("|")[:2]) for clave, *_ in rows}
    with_rows = {code for code, _ in present}
    stats_with_rows = {(code == "e", stat_id) for code, stat_id in present}
    entities = [(TEAM_NAME, "e")] + [(p.name, str(p.id)) for p in players if str(p.id) in with_rows]
    for i, (name, code) in enumerate(entities, start=1):
        lists.write_string(i, 8, safe_text(name))
        lists.write_string(i, 9, code)
    name_range("ENT_NOM", "Listas desglosada", 8, 1, len(entities))
    name_range("ENT_COD", "Listas desglosada", 9, 1, len(entities))
    blocks: dict[str, list[SeriesStat]] = {"e": [], "j": []}
    for st in data.series_stats:
        if (st.entity == "equipo", st.id) in stats_with_rows:
            blocks["e" if st.entity == "equipo" else "j"].append(st)
    i = 1
    for kind, label in (("e", "EST_EQUIPO"), ("j", "EST_JUGADOR")):
        first, seen = i, set()
        for st in blocks[kind]:
            # Un nombre repetido dentro de la misma entidad lleva el id para que la lista no sea ambigua.
            name = st.name if st.name not in seen else f"{st.name} ({st.id})"
            seen.add(name)
            lists.write_string(i, 11, f"{kind}|{name}")
            lists.write_string(i, 12, st.id)
            lists.write_string(i, 13, safe_text(name))
            lists.write_string(i, 14, st.unit)
            lists.write_number(i, 15, st.factor if st.rule == "cociente" else 1)
            lists.write_number(i, 16, 1 if st.higher_is_better else 0)
            lists.write_number(i, 17, 1 if st.rule == "suma" else 0)
            lists.write_string(i, 18, safe_text(st.description))
            i += 1
        if i > first:
            name_range(label, "Listas desglosada", 13, first, i - 1)
    for c, name in zip(
        range(11, 19),
        [
            "EST_CLAVE",
            "EST_ID",
            "EST_NOMBRE",
            "EST_UNIDAD",
            "EST_FACTOR",
            "EST_MAYOR",
            "EST_TOTAL",
            "EST_DESC",
        ],
        strict=True,
    ):
        name_range(name, "Listas desglosada", c, 1, i - 1)
    # Una sola competición: su ventana sería la temporada.
    windows = breakdown_windows([])
    for k, (name, kind, param) in enumerate(windows, start=1):
        lists.write_string(k, 20, safe_text(name))
        lists.write_string(k, 21, kind)
        if param != "":
            book.write(lists, k, 22, param)
    for c, name in zip(range(20, 23), ["VEN_NOM", "VEN_TIPO", "VEN_PARAM"], strict=True):
        name_range(name, "Listas desglosada", c, 1, len(windows))

    # Desglosada.
    ws = book.sheet(
        "Desglosada", "Elegí entidad, estadística y ventana: resumen, partidos y gráfico con fórmulas vivas"
    )
    r = book.header(ws, "Estadística desglosada (9.8)", "stat_match_series y boca_game")
    ws.set_column(0, 0, 30)
    ws.set_column(1, 1, 34)
    ws.set_column(2, 8, 13)
    ws.set_column(AUX, AUX + 10, None, None, {"hidden": True})
    f = wb.add_format
    base = {"font_name": FONT, "font_size": 10}
    date_fmt = f({**base, "num_format": "dd/mm/yyyy"})
    flag_fmt = f({**base, "num_format": '"sí";"sí";"no"', "align": "center"})
    aux_fmt = f({**base, "font_color": "#9AA09A"})
    # Arranca en Boca con el NR (o la primera que haya); si el equipo no tiene serie, en el primer jugador.
    team_first = bool(blocks["e"])
    default = next((st for st in blocks["e"] if st.id == "net_rating"), (blocks["e"] or blocks["j"])[0])
    inputs = [
        ("Entidad (elegí en la lista)", TEAM_NAME if team_first else entities[1][0]),
        ("Estadística (cambia con la entidad)", default.name),
        ("Ventana", "Últimos 5 partidos"),
    ]
    for k, (label, text) in enumerate(inputs):
        ws.write_string(r + k, 0, label, book.bold)
        ws.write_string(r + k, 1, safe_text(text), book.input)

    def abs_cell(row: int, c: int) -> str:
        return str(xl_rowcol_to_cell(row, c, row_abs=True, col_abs=True))

    ent, est, ven = (abs_cell(r + k, 1) for k in range(3))
    aux = [
        ("Código de la entidad", f'=IFERROR(INDEX(ENT_COD,MATCH({ent},ENT_NOM,0)),"")'),
        ("Fila de la estadística", f'=IFERROR(MATCH(IF(E{r + 1}="e","e","j")&"|"&{est},EST_CLAVE,0),"")'),
        ("Id de la estadística", f'=IF(E{r + 2}="","",INDEX(EST_ID,E{r + 2}))'),
        ("Factor (cocientes)", f'=IF(E{r + 2}="",1,INDEX(EST_FACTOR,E{r + 2}))'),
        ("Más es mejor", f'=IF(E{r + 2}="",TRUE,INDEX(EST_MAYOR,E{r + 2})=1)'),
        ("Tiene total", f'=IF(E{r + 2}="",FALSE,INDEX(EST_TOTAL,E{r + 2})=1)'),
        ("Partidos con dato", f'=IF(E{r + 3}="",0,COUNTIF(SERIE_CLAVE,E{r + 1}&"|"&E{r + 3}&"|*"))'),
        ("Tipo de ventana", f'=IFERROR(INDEX(VEN_TIPO,MATCH({ven},VEN_NOM,0)),"todo")'),
        ("Parámetro de la ventana", f'=IFERROR(INDEX(VEN_PARAM,MATCH({ven},VEN_NOM,0)),"")'),
        ("Último partido cargado", None),
    ]
    ws.write_string(r - 1, 3, "Cálculos auxiliares", book.note)
    for k, (label, formula) in enumerate(aux):
        ws.write_string(r + k, 3, label, aux_fmt)
        if formula:
            ws.write_formula(r + k, 4, formula, aux_fmt)
    code_c, row_c, id_c, factor_c, better_c, total_c, count_c, kind_c, param_c, last_c = (
        abs_cell(r + k, 4) for k in range(len(aux))
    )
    ws.data_validation(r, 1, r, 1, {"validate": "list", "source": "=ENT_NOM"})
    ws.data_validation(
        r + 1, 1, r + 1, 1, {"validate": "list", "source": f'=IF({code_c}="e",EST_EQUIPO,EST_JUGADOR)'}
    )
    ws.data_validation(r + 2, 1, r + 2, 1, {"validate": "list", "source": "=VEN_NOM"})
    ws.write_string(r + 3, 0, "Descripción")
    ws.write_formula(r + 3, 1, f'=IF({row_c}="","",INDEX(EST_DESC,{row_c}))', book.note)
    ws.write_string(r + 4, 0, "Unidad")
    ws.write_formula(r + 4, 1, f'=IF({row_c}="","",INDEX(EST_UNIDAD,{row_c}))')

    # Lista de partidos (de más viejo a más nuevo) con sus columnas auxiliares.
    size = max(int(k.rsplit("|", 1)[1]) for k, *_ in rows)
    s = r + 12
    head_row = s + 11
    first, last = head_row + 1, head_row + size
    for c, h in enumerate(
        [
            "#",
            "Fecha",
            "Rival",
            "Localía",
            "Resultado",
            "Competición",
            "Valor",
            "Dif. vs temporada",
            "En la ventana",
        ]
    ):
        ws.write_string(head_row, c, h, book.head)
    ws.write_string(head_row - 1, 0, "Partidos con dato (de más viejo a más nuevo)", book.bold)

    def rng(c: int) -> str:
        letter = xl_col_to_name(c)
        return f"${letter}${first + 1}:${letter}${last + 1}"

    season_c = abs_cell(s + 6, 1)
    rn_col, pos_col, match_col, num_col, den_col = (xl_col_to_name(AUX + k) for k in range(5))
    for k in range(size):
        row = first + k
        x = row + 1
        # Celdas auxiliares de esta fila: n del partido, fila en la serie y fila en la lista de partidos.
        nrow, srow, mrow = f"{rn_col}{x}", f"{pos_col}{x}", f"{match_col}{x}"
        cond = (
            f'IF({kind_c}="n",{nrow}<={param_c},'
            f'IF({kind_c}="dias",B{x}>{last_c}-{param_c},'
            f'IF({kind_c}="mes",AND(YEAR(B{x})=YEAR({last_c}),MONTH(B{x})=MONTH({last_c})),'
            f'IF({kind_c}="mes_ant",AND(B{x}>=DATE(YEAR({last_c}),MONTH({last_c})-1,1),'
            f"B{x}<DATE(YEAR({last_c}),MONTH({last_c}),1)),"
            f'IF({kind_c}="local",D{x}="Local",'
            f'IF({kind_c}="visitante",D{x}="Visitante",'
            f'IF({kind_c}="resultado",INDEX(PARTIDO_RES,{mrow})={param_c},'
            f'IF({kind_c}="comp",F{x}={param_c},TRUE))))))))'
        )
        formulas = {
            0: (f"={k + 1}", book.int),
            1: (f'=IF({mrow}="","",INDEX(PARTIDO_FECHA,{mrow}))', date_fmt),
            2: (f'=IF({mrow}="","",INDEX(PARTIDO_RIVAL,{mrow}))', book.text),
            3: (f'=IF({mrow}="","",INDEX(PARTIDO_LOCALIA,{mrow}))', book.text),
            4: (
                f'=IF({mrow}="","",INDEX(PARTIDO_RES,{mrow})&" "&INDEX(PARTIDO_MARCADOR,{mrow}))',
                book.text,
            ),
            5: (f'=IF({mrow}="","",INDEX(PARTIDO_COMP,{mrow}))', book.text),
            6: (f'=IF({srow}="","",INDEX(SERIE_VALOR,{srow}))', book.cell),
            7: (f'=IF(OR(G{x}="",NOT(ISNUMBER({season_c}))),"",G{x}-{season_c})', book.cell),
            8: (f'=IF({srow}="","",IF({cond},1,0))', flag_fmt),
            AUX: (f'=IF(A{x}>{count_c},"",{count_c}-A{x}+1)', None),
            AUX + 1: (
                f'=IF({nrow}="","",MATCH({code_c}&"|"&{id_c}&"|"&{nrow},SERIE_CLAVE,0))',
                None,
            ),
            AUX + 2: (f'=IF({srow}="","",MATCH(INDEX(SERIE_PARTIDO,{srow}),PARTIDO_ID,0))', None),
            AUX + 3: (f'=IF({srow}="","",INDEX(SERIE_NUM,{srow}))', None),
            AUX + 4: (f'=IF({srow}="","",INDEX(SERIE_DEN,{srow}))', None),
            AUX + 5: (f'=IF(I{x}=1,G{x},"")', None),
            AUX + 6: (f"=IF(I{x}=1,{num_col}{x},0)", None),
            AUX + 7: (f"=IF(I{x}=1,{den_col}{x},0)", None),
            AUX + 8: (f'=IF({srow}="",NA(),G{x})', None),
            AUX + 9: (f'=IF({srow}="",NA(),{season_c})', None),
            AUX + 10: (f"=IF(I{x}=1,G{x},NA())", None),
        }
        for c, (formula, fmt) in formulas.items():
            ws.write_formula(row, c, formula, fmt)
    ws.write_formula(r + 9, 4, f"=MAX({rng(1)})", date_fmt)
    green = f({"font_color": GREEN_DARK, "bold": True})
    red = f({"font_color": RED, "bold": True})
    h1 = f"H{first + 1}"
    ws.conditional_format(
        f"H{first + 1}:H{last + 1}",
        {"type": "formula", "criteria": f"=AND(ISNUMBER({h1}),{h1}<>0,({h1}>0)={better_c})", "format": green},
    )
    ws.conditional_format(
        f"H{first + 1}:H{last + 1}",
        {"type": "formula", "criteria": f"=AND(ISNUMBER({h1}),{h1}<>0,({h1}>0)<>{better_c})", "format": red},
    )
    ws.conditional_format(
        f"A{first + 1}:I{last + 1}",
        {"type": "formula", "criteria": f"=$I{first + 1}=1", "format": f({"bg_color": ZEBRA})},
    )
    ws.freeze_panes(r + 3, 0)

    # Resumen de la ventana.
    ws.write_string(s, 0, "Resumen de la ventana", book.title_fmt)
    n_c, value_c = abs_cell(s + 1, 1), abs_cell(s + 2, 1)
    summary = [
        ("Partidos en la ventana", f"=SUM({rng(8)})", book.int),
        (
            "Valor (promedio; en los cocientes, suma sobre suma)",
            f'=IF({n_c}=0,"sin partidos en este período",IF(SUM({rng(AUX + 7)})=0,"n/d",'
            f"SUM({rng(AUX + 6)})/SUM({rng(AUX + 7)})*{factor_c}))",
            book.cell,
        ),
        ("Total", f'=IF(AND({total_c},{n_c}>0),SUM({rng(AUX + 5)}),"—")', book.cell),
        (
            "Mejor partido",
            f'=IF({n_c}=0,"—",IF({better_c},MAX({rng(AUX + 5)}),MIN({rng(AUX + 5)})))',
            book.cell,
        ),
        (
            "Peor partido",
            f'=IF({n_c}=0,"—",IF({better_c},MIN({rng(AUX + 5)}),MAX({rng(AUX + 5)})))',
            book.cell,
        ),
        (
            "Temporada",
            f'=IF(SUM({rng(AUX + 4)})=0,"n/d",SUM({rng(AUX + 3)})/SUM({rng(AUX + 4)})*{factor_c})',
            book.cell,
        ),
        (
            "Diferencia contra la temporada",
            f'=IF(AND(ISNUMBER({value_c}),ISNUMBER({season_c})),{value_c}-{season_c},"—")',
            book.cell,
        ),
        (
            "Aviso",
            f'=IF({id_c}="","Elegí una estadística de la lista (cambia con la entidad).",'
            f'IF({count_c}=0,"Sin partidos con dato para esta estadística.",'
            f'IF({n_c}=0,"Sin partidos en este período.",'
            f'IF({n_c}<3,"Muestra pequeña: menos de 3 partidos.",""))))',
            book.note,
        ),
        ("Último partido cargado", f'=IF({last_c}=0,"",{last_c})', date_fmt),
    ]
    for k, (label, formula, fmt) in enumerate(summary, start=1):
        ws.write_string(s + k, 0, label, book.bold if k <= 7 else book.text)
        ws.write_formula(s + k, 1, formula, fmt)
    diff_c = f"B{s + 8}"
    ws.conditional_format(
        diff_c,
        {
            "type": "formula",
            "criteria": f"=AND(ISNUMBER({diff_c}),{diff_c}<>0,({diff_c}>0)={better_c})",
            "format": green,
        },
    )
    ws.conditional_format(
        diff_c,
        {
            "type": "formula",
            "criteria": f"=AND(ISNUMBER({diff_c}),{diff_c}<>0,({diff_c}>0)<>{better_c})",
            "format": red,
        },
    )
    ws.write_string(
        s + 10,
        0,
        "Las ventanas de días y de meses se cuentan hacia atrás desde el último partido cargado, "
        "no desde hoy.",
        book.note,
    )

    # Gráfico nativo: todos los partidos, los de la ventana en verde y la línea de la temporada.
    cats = ["Desglosada", first, 2, last, 2]
    bars = wb.add_chart({"type": "column"})
    bars.add_series(
        {
            "name": "Partido",
            "categories": cats,
            "values": ["Desglosada", first, AUX + 8, last, AUX + 8],
            "fill": {"color": "#C9E8BE"},
            "overlap": 100,
            "gap": 60,
        }
    )
    bars.add_series(
        {
            "name": "En la ventana",
            "categories": cats,
            "values": ["Desglosada", first, AUX + 10, last, AUX + 10],
            "fill": {"color": GREEN_DARK},
        }
    )
    season_line = wb.add_chart({"type": "line"})
    season_line.add_series(
        {
            "name": "Temporada",
            "categories": cats,
            "values": ["Desglosada", first, AUX + 9, last, AUX + 9],
            "line": {"color": VIOLET, "width": 2, "dash_type": "dash"},
        }
    )
    bars.combine(season_line)
    style_chart(bars, "Partido a partido", "Rival", "Valor")
    bars.set_title({"name": f"=Desglosada!{est}", "name_font": {"name": FONT, "size": 12, "bold": True}})
    ws.insert_chart(r, 10, bars)


# --------------------------------------------------------------------------------------------
# Subida


def upload(name: str, content: bytes, url: str, key: str, client: httpx.Client) -> None:
    response = client.post(
        f"{url.rstrip('/')}/storage/v1/object/{BUCKET}/{name}",
        content=content,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "x-upsert": "true",
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Storage respondió {response.status_code}: {response.text[:200]}")


def main(argv: list[str] | None = None) -> int:
    """Uso local: `uv run --env-file .env python -m pipeline.excel [--out carpeta]`."""
    parser = argparse.ArgumentParser(description="Libro de Excel de Pelotheta Θ básquet")
    parser.add_argument("--out", help="carpeta local donde guardar el libro en vez de subirlo")
    args = parser.parse_args(argv)
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    if not (url and key):
        print("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY.", file=sys.stderr)
        return 2
    content = build(fetch(url, key))
    if args.out:
        os.makedirs(args.out, exist_ok=True)
        with open(os.path.join(args.out, FILE_NAME), "wb") as handle:
            handle.write(content)
    else:
        with httpx.Client(timeout=TIMEOUT) as client:
            upload(FILE_NAME, content, url, key, client)
    print(f"{FILE_NAME}: {len(content) // 1024} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
