"""Inventario de estadísticas: cuántas de las pedidas por el prompt hay, por estado.

`uv run python -m scripts.inventario` escribe docs/inventario_estadisticas.md.

Estados:
- cruda: viene directo de una fuente (nivel A, disponible).
- calculada: se calcula en el pipeline y está cargada (nivel B, disponible).
- falta calcular: pedida, calculable con los datos que ya hay, todavía no implementada.
- esperando datos: la fórmula está o se puede hacer, pero faltan datos (más partidos, otra fuente).
- nivel C: ninguna fuente gratuita la publica; queda n/d a propósito.

Las pedidas que no están en el catálogo se listan acá a mano, con su sección del prompt.
"""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "stat_catalog.csv"
OUT = ROOT / "docs" / "inventario_estadisticas.md"

# Agregadas por iniciativa propia (no figuran en el prompt): se cuentan aparte.
EXTRAS = {
    "rendimiento_cobertura", "possessions_on", "minutes_tied", "max_run_rival", "big_runs_rival",
    "pts_second_chance_rival", "tov_per36", "stl_per36", "blk_per36",
}  # fmt: skip

# Estado de las del catálogo que no están disponibles.
NOT_AVAILABLE_STATE = {
    "win_shares": "falta calcular",
    "bpm": "falta calcular",
    "mejoria_alpha": "esperando datos",
    "mejoria_beta": "esperando datos",
}

# Pedidas por el prompt que todavía no están en el catálogo: (nombre, sección, estado, motivo).
PENDING: list[tuple[str, str, str, str]] = [
    ("ORtg individual (Oliver)", "5.1", "falta calcular", "fórmula larga del glosario"),
    ("DRtg individual (Oliver)", "5.1", "falta calcular", "fórmula larga del glosario"),
    ("Stops", "5.1", "falta calcular", "depende del DRtg individual"),
    ("Points Produced", "5.1", "falta calcular", "depende del ORtg individual"),
    ("OWS, DWS y WS/48", "5.1", "falta calcular", "dependen de ORtg y DRtg individuales"),
    ("OBPM y DBPM", "5.1", "falta calcular", "coeficientes de BPM 2.0"),
    ("VORP", "5.1", "falta calcular", "depende del BPM"),
    ("Descalificaciones", "5.1", "nivel C", "la fuente no las informa por separado"),
    ("Faltas técnicas", "5.1", "nivel C", "la fuente no las informa por separado"),
    ("Posición por fecha (evolución)", "5.2", "falta calcular", "resultados ya cargados"),
    (
        "Totales del equipo por partido (tiros, rebotes, asistencias...)",
        "5.2",
        "falta calcular",
        "box score del equipo",
    ),
    ("Por competición (BCL Américas, Supercopa)", "5.2", "esperando datos", "sin fuente automatizable"),
    ("Playoffs por separado", "5.2", "esperando datos", "la temporada no llegó a playoffs"),
    ("Árbitros", "5.3", "esperando datos", "falta confirmar si la LNB los publica"),
    ("Jugadores destacados del partido", "5.4", "falta calcular", "Game Score por partido"),
    ("Temporada actual frente a la anterior", "5.7", "esperando datos", "falta cargar 2025-26"),
    ("Inicio de posesión y puntos por posesión", "5.8", "falta calcular", "play-by-play validado"),
    ("Puntos tras robo y tras pérdida rival", "5.8", "falta calcular", "play-by-play validado"),
    ("Ataque rápido (estimado)", "5.8", "falta calcular", "play-by-play validado"),
    ("Zonas de tiro y puntos esperados", "5.8", "falta calcular", "796 tiros de Boca con zona ya cargados"),
    ("Tríos y duplas", "5.8", "falta calcular", "tramos de cancha ya reconstruidos"),
    ("Rotación (primer cambio, cambios por cuarto)", "5.8", "falta calcular", "play-by-play validado"),
    (
        "Puntos por posesión alrededor de los tiempos muertos",
        "5.8",
        "falta calcular",
        "play-by-play validado",
    ),
    ("Faltas y bonus", "5.8", "esperando datos", "la fuente omite algunas faltas en las jugadas"),
    (
        "Estilo táctico frente a la liga (percentiles)",
        "5.8",
        "falta calcular",
        "38 play-by-play de la liga validados",
    ),
]

ORDER = ["cruda", "calculada", "falta calcular", "esperando datos", "nivel C"]


def classify(row: dict[str, str]) -> str:
    if row["nivel"] == "C":
        return "nivel C"
    if row["available"] == "true":
        return "cruda" if row["nivel"] == "A" else "calculada"
    return NOT_AVAILABLE_STATE.get(row["id"], "esperando datos")


def pct(n: int, base: int) -> str:
    return f"{100 * n / base:.1f} %".replace(".", ",") if base else "0 %"


def main() -> None:
    with CATALOG.open(encoding="utf-8", newline="") as fh:
        catalog = list(csv.DictReader(fh))
    requested: Counter[str] = Counter()
    extras: Counter[str] = Counter()
    for row in catalog:
        if row["grupo"] == "auxiliar":  # numeradores y denominadores para agrupar partidos, no se muestran
            continue
        (extras if row["id"] in EXTRAS else requested)[classify(row)] += 1
    for _, _, state, _ in PENDING:
        requested[state] += 1
    total = sum(requested.values())
    ready = requested["cruda"] + requested["calculada"]

    lines = [
        "# Inventario de estadísticas",
        "",
        "Generado por `scripts/inventario.py` a partir de `data/stat_catalog.csv` y de la lista de",
        "pedidas que",
        "todavía no están en el catálogo. Sobre las estadísticas **pedidas por el prompt**:",
        "",
        "| Estado | Cantidad | % de las pedidas |",
        "|---|---|---|",
        *[f"| {s} | {requested[s]} | {pct(requested[s], total)} |" for s in ORDER],
        f"| **Total pedidas** | **{total}** | 100 % |",
        "",
        f"Con datos hoy: **{ready} de {total} ({pct(ready, total)})**. Calculables con los datos que ya hay",
        f"pero sin implementar: {requested['falta calcular']}.",
        "Agregadas por iniciativa propia (fuera de la cuenta):",
        f"{sum(extras.values())}.",
        "",
        "## Pedidas que todavía no están en el catálogo",
        "",
        "| Estadística | Sección | Estado | Por qué |",
        "|---|---|---|---|",
        *[f"| {n} | {sec} | {state} | {why} |" for n, sec, state, why in PENDING],
    ]
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print("\n".join(lines[5:16]))


if __name__ == "__main__":
    main()
