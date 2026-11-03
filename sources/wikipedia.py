"""Plantel de Boca desde Wikipedia en español: posición, dorsal, edad, altura y peso.

Por qué Wikipedia: la LNB no publica fichas de jugador legibles (las páginas se arman con
JavaScript y dan 404) y TheSportsDB tiene un plantel de 2020. Wikipedia es de licencia abierta
(CC BY-SA, se cita). Su robots.txt no permite a bots genéricos ni la API (/w/api.php) ni la REST
(/api/rest_v1/), pero sí la página del artículo (/wiki/): se lee esa, una vez por corrida y con
caché. Cada fila se cruza con el box score por el dorsal; si no coincide, no se usa.

Datos personales (Ley 25.326): la página renderizada trae la edad en años, no la fecha de
nacimiento, así que esa fecha nunca se guarda.
"""

from __future__ import annotations

import re
from typing import Literal

from bs4 import BeautifulSoup, Tag
from pydantic import BaseModel, Field

from sources.http_client import PoliteClient

SOURCE = "wikipedia"
URL = "https://es.wikipedia.org/wiki/Club_Atl%C3%A9tico_Boca_Juniors_(baloncesto)"

Position = Literal["PG", "SG", "SF", "PF", "C"]
# El enlace de la posición apunta al artículo de cada puesto.
POSITION_BY_TITLE: dict[str, Position] = {
    "Base (baloncesto)": "PG",
    "Escolta (baloncesto)": "SG",
    "Alero (baloncesto)": "SF",
    "Ala-pívot": "PF",
    "Pívot (baloncesto)": "C",
    "Pívot": "C",
}
# Zona de la posición para los pesos del índice de rendimiento (6.1.1).
ZONE: dict[str, str] = {
    "PG": "base_escolta",
    "SG": "base_escolta",
    "SF": "alero",
    "PF": "interno",
    "C": "interno",
}
POSITION_ES: dict[str, str] = {"PG": "Base", "SG": "Escolta", "SF": "Alero", "PF": "Ala-pívot", "C": "Pívot"}


class ParseError(Exception):
    """La página no tiene la tabla del plantel con la forma esperada."""


class RosterPlayer(BaseModel):
    shirt_number: int = Field(ge=0, le=99)
    name: str = Field(min_length=3)
    position: Position
    nationality: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    age: int | None = Field(default=None, ge=14, le=50)
    height_cm: int | None = Field(default=None, ge=150, le=235)
    weight_kg: int | None = Field(default=None, ge=50, le=170)


def _number(pattern: str, text: str) -> float | None:
    match = re.search(pattern, text)
    return float(match.group(1).replace(",", ".")) if match else None


def parse_roster(html: str) -> list[RosterPlayer]:
    """Lee la tabla ordenable que tiene las columnas N.º, Pos., Nombre, Altura, Peso y Edad."""
    soup = BeautifulSoup(html, "html.parser")
    table = next(
        (
            t
            for t in soup.select("table.sortable")
            if {"Altura", "Peso", "Edad"} <= set(t.get_text(" ").split())
        ),
        None,
    )
    if not isinstance(table, Tag):
        raise ParseError("no se encontró la tabla del plantel")
    players = []
    for tr in table.find_all("tr")[1:]:
        cells = tr.find_all("td")
        if len(cells) < 7:
            continue
        link = cells[2].find("a")
        title = str(link.get("title", "")) if isinstance(link, Tag) else ""
        if title not in POSITION_BY_TITLE:
            raise ParseError(f"posición desconocida en el plantel: {title!r}")
        height = _number(r"(\d[.,]\d{2})\s*m", cells[4].get_text(" "))
        weight = _number(r"(\d{2,3})\s*kg", cells[5].get_text(" "))
        age = _number(r"(\d{2})\s*años", cells[6].get_text(" "))
        players.append(
            RosterPlayer(
                shirt_number=int(cells[0].get_text(strip=True)),
                name=cells[3].get_text(" ", strip=True),
                position=POSITION_BY_TITLE[title],
                nationality=(
                    nat.group(0) if (nat := re.search(r"\b[A-Z]{3}\b", cells[1].get_text(" "))) else None
                ),
                age=int(age) if age else None,
                height_cm=round(height * 100) if height else None,
                weight_kg=int(weight) if weight else None,
            )
        )
    if len(players) < 5:
        raise ParseError(f"plantel con {len(players)} jugadores: la tabla cambió de forma")
    return players


def fetch_roster(client: PoliteClient) -> tuple[list[RosterPlayer], str]:
    """Devuelve el plantel y el SHA-256 de la página (cadena de custodia)."""
    result = client.get(URL)
    if result.status != 200:
        raise ParseError(f"Wikipedia respondió {result.status}")
    return parse_roster(result.text()), result.sha256
