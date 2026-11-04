"""Diccionario de datos (sección 15): genera docs/diccionario_datos.md.

Igual que en Pelotheta fútbol. Fuentes: la especificación OpenAPI que publica la Data API (PostgREST
la arma desde `information_schema` y los `COMMENT ON` de la base) para cada vista y columna, y el
catálogo de estadísticas (`data/stat_catalog.csv`) para la fuente y el nivel A, B o C de cada
estadística. No necesita la contraseña de la base (la raíz de la Data API pide la clave secreta):
`uv run --env-file .env python -m scripts.diccionario`.
"""

from __future__ import annotations

import csv
import os
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "diccionario_datos.md"
GLOSSARY = ROOT / "docs" / "glosario.md"
NL = chr(10)
NULLABLE_NOTE = "Las vistas no declaran nulabilidad: toda columna puede venir vacía (n/d)."


def build(spec: dict, catalog: list[dict[str, str]]) -> str:
    schemas = spec["components"]["schemas"]
    lines = [
        "# Diccionario de datos",
        "",
        "Generado por `scripts/diccionario.py` desde la especificación de la API y el catálogo",
        "de estadísticas.",
        f"{len(schemas)} vistas del esquema `api` y {len(catalog)} estadísticas. {NULLABLE_NOTE} Las tablas",
        "privadas de `core` están en `docs/diagramas/der.md`.",
        "",
        "## Vistas del esquema `api`",
        "",
    ]
    for name, schema in sorted(schemas.items()):
        lines += [f"### `{name}`", "", schema.get("description") or "Sin descripción.", ""]
        lines += ["| Columna | Tipo | Nota |", "|---|---|---|"]
        for column, prop in schema["properties"].items():
            kind = prop.get("format") or prop.get("type") or "—"
            note = (prop.get("description") or "").replace("|", "/").replace("\n", " ")
            lines.append(f"| `{column}` | {kind} | {note} |")
        lines.append("")
    lines += [
        "## Estadísticas del catálogo",
        "",
        "Nivel A: viene de una fuente. B: calculada desde datos crudos. C: sin dato (n/d). «Estimada»: el",
        "cálculo usa un supuesto y la web lo marca.",
        "",
        "| Id | Entidad | Nombre | Unidad | Fuente | Nivel | Estimada | Fórmula |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for s in catalog:
        formula = (s.get("formula") or "").replace("|", "/")
        lines.append(
            f"| `{s['id']}` | {s['categoria']} | {s['nombre_es']} | {s.get('unidad', '')} "
            f"| {s.get('fuente', '')} | {s.get('nivel', '')} "
            f"| {'sí' if s.get('estimada') == 'true' else 'no'} | {formula} |"
        )
    return "\n".join(lines) + "\n"


TERMS = {
    "n/d": "Sin dato: ninguna fuente lo publica o no alcanza la muestra. Nunca es cero.",
    "Nivel A, B o C": "A viene de una fuente; B la calcula el sistema desde datos crudos; C no tiene dato.",
    "Estimada": "El cálculo usa un supuesto; la web lo marca.",
    "Cada 36 minutos": "Valor dividido por los minutos jugados y multiplicado por 36.",
    "Percentil": "Porcentaje del plantel que queda por debajo; 50 es el medio.",
    "Ventana": "Partidos (últimos N, últimos días, local, por rival) sobre los que se resume un dato.",
    "Elo": "Fuerza de un equipo que cambia con cada resultado de la liga.",
    "Posesiones": "Ataques de un equipo; se estiman del box score o se cuentan en el play-by-play.",
    "ORtg, DRtg y NR": "Puntos anotados y recibidos cada 100 posesiones, y su diferencia.",
    "Zona": "Exteriores (base y escolta), aleros e interiores (ala-pívot y pívot).",
    "Cuarentena": "Partido cuyo play-by-play no cuadra con el box score: sus tácticas quedan en n/d.",
    "Situación": "Condición de un partido (por ejemplo, perder al descanso) y cómo le fue a Boca.",
    "Desglosada": "Página de una estadística por ventanas de tiempo, con sus partidos.",
}


def glossary(catalog: list[dict[str, str]]) -> str:
    """Glosario: términos del sistema y cada estadística del catálogo con su descripción."""
    lines = ["# Glosario", "", "Generado por `scripts/diccionario.py` desde `data/stat_catalog.csv`.", ""]
    lines += ["## Términos", ""] + [f"- **{k}:** {v}" for k, v in TERMS.items()]
    lines += ["", "## Estadísticas", ""]
    seen: set[str] = set()
    for s in sorted(catalog, key=lambda r: r["nombre_es"].lower()):
        if s["nombre_es"] in seen:
            continue
        seen.add(s["nombre_es"])
        lines.append(f"- **{s['nombre_es']}** ({s['categoria']}): {s.get('descripcion_es', '').strip()}")
    return NL.join(lines) + NL


def main() -> int:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SECRET_KEY", "")
    if not (url and key):
        raise SystemExit("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY.")
    response = httpx.get(
        f"{url}/rest/v1/",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept-Profile": "api"},
        timeout=60,
    )
    response.raise_for_status()
    spec = response.json()
    spec.setdefault("components", {}).setdefault("schemas", spec.get("definitions", {}))
    with (ROOT / "data" / "stat_catalog.csv").open(encoding="utf-8") as handle:
        catalog = list(csv.DictReader(handle))
    OUT.write_text(build(spec, catalog), encoding="utf-8")
    GLOSSARY.write_text(glossary(catalog), encoding="utf-8")
    print(f"{OUT.name}: {len(spec['components']['schemas'])} vistas, {len(catalog)} estadísticas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
