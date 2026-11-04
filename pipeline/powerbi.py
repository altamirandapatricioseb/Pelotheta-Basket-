"""Modelo de Power BI en esquema estrella (sección 11): CSV en `data/powerbi/`.

Igual que en Pelotheta fútbol: lee los mismos datos que el libro de Excel (`excel.fetch`, vistas
`api`) y escribe dimensiones y hechos en formato largo, así la tabla maestra y los gráficos cambian
de estadística con un segmentador sin armar una medida por columna. Con `--upload` también los sube
al bucket público `exports/powerbi/`. UTF-8 con BOM (Power BI y Excel abren bien las tildes) y punto
decimal. Sin mapa de tiros: las coordenadas crudas no se republican.

Uso local: `uv run --env-file .env python -m pipeline.powerbi [--upload]`.
"""

from __future__ import annotations

import argparse
import csv
import io
import os
import sys
from collections.abc import Sequence
from datetime import date
from pathlib import Path
from typing import Any

import httpx

from pipeline import excel

OUT = Path(__file__).resolve().parents[1] / "data" / "powerbi"
MONTHS = (
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)
DAYS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
COMPETITION = ("lnb", "Liga Nacional 2026-27")

Table = tuple[list[str], list[list[Any]]]


def _cell(value: Any) -> Any:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, str):
        return excel.safe_text(value)
    return "" if value is None else value


def to_csv(table: Table) -> bytes:
    head, rows = table
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(head)
    writer.writerows([_cell(v) for v in row] for row in rows)
    return buffer.getvalue().encode("utf-8-sig")


def _eligible(players: Sequence[excel.Player]) -> list[excel.Player]:
    """Con el mismo mínimo de minutos que el libro (400, o el 40 % del que más jugó)."""
    threshold = min(excel.MIN_MINUTES, 0.4 * max((p.minutes for p in players), default=0))
    return [p for p in players if p.minutes >= threshold]


def _player_stat_rows(data: excel.Data) -> list[list[Any]]:
    """Jugador × estadística, con valor, valor cada 36 y percentil en el plantel."""
    eligible = _eligible(data.players)
    rows: list[list[Any]] = []
    for s in data.stats:
        group = [v for p in eligible if (v := excel.per36(p, s)) is not None]
        for p in data.players:
            raw = p.stats.get(s.id)
            if raw is None:
                continue
            v36 = excel.per36(p, s)
            pct = excel.percentile(group, v36, s.higher_is_better) if v36 is not None and group else None
            rows.append([p.id, COMPETITION[0], s.id, raw, v36 if s.per36 else None, pct, s.estimated])
    return rows


def _distribution(data: excel.Data) -> list[list[Any]]:
    out: list[list[Any]] = []
    for s in data.stats:
        vals = sorted(v for p in _eligible(data.players) if (v := excel.per36(p, s)) is not None)
        if len(vals) < 4 or vals[0] == vals[-1]:
            continue
        width = (vals[-1] - vals[0]) / 6
        for k in range(6):
            lo = vals[0] + k * width
            hi = lo + width
            count = sum(1 for v in vals if lo <= v < hi or (k == 5 and v == vals[-1]))
            out.append([s.id, k + 1, round(lo, 4), round(hi, 4), count])
    return out


def _correlation(data: excel.Data) -> list[list[Any]]:
    """Pearson entre las estadísticas de nivel A (las mismas del gráfico 14 del libro)."""
    eligible = _eligible(data.players)
    keys = [s for s in data.stats if s.level == "A"]
    out: list[list[Any]] = []
    for a in keys:
        for b in keys:
            pairs = [
                (x, y)
                for p in eligible
                if (x := excel.per36(p, a)) is not None and (y := excel.per36(p, b)) is not None
            ]
            r = excel.pearson([x for x, _ in pairs], [y for _, y in pairs]) if pairs else None
            if r is not None:
                out.append([a.id, b.id, round(r, 4)])
    return out


def _rolling_rows(data: excel.Data) -> list[list[Any]]:
    """Valor por partido con su media móvil de los últimos 5 (gráfico 5 de 9.4), en orden cronológico."""
    # El numerador lleva el factor de los cocientes (×100 en los %): una ventana es suma / suma.
    factor = {(s.entity, s.id): s.factor for s in data.series_stats}
    out: list[list[Any]] = []
    for (entity, entity_id, stat_id), points in data.series.items():
        window: list[float] = []
        f = factor.get((entity, stat_id), 1.0)
        for match_id, _day, value, raw_num, den in sorted(points, key=lambda x: x[1]):
            num = raw_num * f
            window = [*window[-4:], value]
            out.append(
                [entity, entity_id, match_id, stat_id, value, num, den, round(sum(window) / len(window), 4)]
            )
    return out


def build_tables(data: excel.Data, extra: dict[str, list[dict[str, Any]]]) -> dict[str, Table]:
    """Todas las tablas del modelo a partir de los datos ya leídos."""
    stats = data.stats
    by_id = {s.id: s for s in stats}
    dates = sorted({m["match_date"] for m in data.team})
    return {
        "dim_player": (
            ["player_id", "nombre", "zona", "posicion", "edad"],
            [[p.id, p.name, p.line, p.role, p.stats.get("age")] for p in data.players],
        ),
        "dim_competition": (["competition_code", "nombre"], [list(COMPETITION)]),
        "dim_date": (
            ["fecha", "anio", "mes", "nombre_mes", "dia_semana"],
            [
                [d, (x := date.fromisoformat(d)).year, x.month, MONTHS[x.month - 1], DAYS[x.weekday()]]
                for d in dates
            ],
        ),
        "dim_team": (
            ["equipo", "es_boca"],
            [[t, t == data.boca_name] for t in sorted(data.league)],
        ),
        "dim_stat": (
            [
                "stat_id",
                "nombre",
                "abrev",
                "grupo",
                "unidad",
                "descripcion_es",
                "formula",
                "nivel",
                "mas_es_mejor",
                "estimada",
                "por36",
            ],
            [
                [
                    s.id,
                    s.name,
                    s.short,
                    s.group,
                    s.unit,
                    s.description,
                    s.formula,
                    s.level,
                    s.higher_is_better,
                    s.estimated,
                    s.per36,
                ]
                for s in stats
            ],
        ),
        "dim_stat_set": (
            ["set_id", "conjunto", "stat_id", "orden"],
            [
                [sid, name, st, k + 1]
                for sid, name, ids in data.sets
                for k, st in enumerate(ids)
                if st in by_id
            ],
        ),
        "fact_player_stat": (
            ["player_id", "competition_code", "stat_id", "valor", "valor_36", "percentil", "estimada"],
            _player_stat_rows(data),
        ),
        "fact_player_minutes": (
            ["player_id", "competition_code", "partidos", "minutos", "minutos_titular"],
            [[p.id, COMPETITION[0], p.matches, p.minutes, round(p.starter_minutes, 1)] for p in data.players],
        ),
        "fact_match": (
            [
                "match_id",
                "fecha",
                "competition_code",
                "rival",
                "local",
                "puntos_favor",
                "puntos_contra",
                "resultado",
            ],
            [
                [
                    m["match_id"],
                    m["match_date"],
                    COMPETITION[0],
                    m["opponent"],
                    m["home"],
                    m["pf"],
                    m["pa"],
                    "G" if m["pf"] > m["pa"] else "P",
                ]
                for m in data.team
            ],
        ),
        "fact_match_period": (
            ["match_id", "cuarto", "puntos_favor", "puntos_contra"],
            [[mid, q, pf, pa] for mid, per in data.periods.items() for q, (pf, pa) in sorted(per.items())],
        ),
        "fact_table_position": (
            ["match_id", "fecha", "puesto"],
            [
                [m["match_id"], m["match_date"], place]
                for m, place in zip(
                    data.team,
                    excel.standings(data.league_games, data.boca_name, [m["match_date"] for m in data.team]),
                    strict=True,
                )
            ],
        ),
        "fact_team_match_stat": (
            ["match_id", "clave", "valor"],
            [[m["match_id"], k, v] for m in data.team for k, v in sorted(m["stats"].items())],
        ),
        "fact_team_season": (
            ["equipo", "stat_id", "valor"],
            [[t, k, v] for t, values in sorted(data.league.items()) for k, v in sorted(values.items())],
        ),
        "fact_stat_match_value": (
            ["entidad", "entity_id", "match_id", "stat_id", "valor", "numerador", "denominador", "rolling_5"],
            _rolling_rows(data),
        ),
        "stat_distribution": (["stat_id", "intervalo", "desde", "hasta", "jugadores"], _distribution(data)),
        "stat_correlation": (["stat_a", "stat_b", "pearson"], _correlation(data)),
        "fact_situational": (
            [
                "card_id",
                "categoria",
                "tarjeta",
                "fila",
                "partidos",
                "ganados",
                "perdidos",
                "pct_victorias",
                "dif_vs_base",
                "pf",
                "pc",
                "diferencia",
            ],
            [
                [
                    s["card_id"],
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
        ),
        "dim_chart": (
            ["chart_id", "titulo", "categoria", "tipo", "powerbi", "excel", "disponible", "motivo"],
            [
                [
                    r["chart_id"],
                    r["title_es"],
                    r["category"],
                    r["chart_type"],
                    r["powerbi"],
                    r["excel"],
                    r["available"],
                    r["reason_es"],
                ]
                for r in extra.get("chart_catalog", [])
            ],
        ),
        "chart_source_map": (
            ["chart_id", "destino_tipo", "destino_ref", "parametros", "etiqueta_es"],
            [
                [r["chart_id"], r["target_type"], r["target_ref"], r["params"], r["label_es"]]
                for r in extra.get("chart_source_map", [])
            ],
        ),
    }


def fetch_extra(url: str, key: str) -> dict[str, list[dict[str, Any]]]:
    with httpx.Client(timeout=excel.TIMEOUT) as c:
        return {
            "chart_catalog": excel._get(
                c,
                url,
                key,
                "chart_catalog",
                "chart_id,title_es,category,chart_type,powerbi,excel,available,reason_es",
                order="sort_order",
            ),
            "chart_source_map": excel._get(
                c, url, key, "chart_source_map", "chart_id,target_type,target_ref,params,label_es"
            ),
        }


def write(tables: dict[str, Table], out: Path = OUT) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    paths = []
    for name, table in tables.items():
        path = out / f"{name}.csv"
        path.write_bytes(to_csv(table))
        paths.append(path)
    return paths


def upload(tables: dict[str, Table], url: str, key: str) -> None:
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "x-upsert": "true",
        "Content-Type": "text/csv",
    }
    with httpx.Client(timeout=excel.TIMEOUT) as client:
        for name, table in tables.items():
            response = client.post(
                f"{url.rstrip('/')}/storage/v1/object/{excel.BUCKET}/powerbi/{name}.csv",
                content=to_csv(table),
                headers=headers,
            )
            if response.status_code >= 400:
                raise RuntimeError(f"Storage respondió {response.status_code}: {response.text[:200]}")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Modelo de Power BI (CSV en estrella)")
    parser.add_argument(
        "--upload", action="store_true", help="también sube los CSV al bucket exports/powerbi"
    )
    args = parser.parse_args(argv)
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    if not (url and key):
        print("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY.", file=sys.stderr)
        return 2
    tables = build_tables(excel.fetch(url, key), fetch_extra(url, key))
    for path in write(tables):
        print(f"{path.name}: {len(tables[path.stem][1])} filas")
    if args.upload:
        upload(tables, url, key)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
