"""Adaptador del sitio oficial de la Liga Nacional de Básquet (laliganacional.com.ar).

Qué trae (verificado en la Fase 0, ver docs/source_audit.md):
- Fixture en JSON: `/api/fixture/laliga?fechaInicio=...&fechaFin=...`.
- Página de cada partido (HTML): box score por jugador, parciales por cuarto, mapa de tiro
  con coordenadas y play-by-play jugada por jugada.

Todo lo que devuelve la fuente es dato no confiable (sección 14.4): se parsea con el parser
de la librería estándar (no resuelve entidades externas) y se valida con modelos pydantic.
Si algo no cierra, se lanza `ParseError` y el partido va a cuarentena; nunca se carga a medias.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from bs4 import BeautifulSoup, Tag
from pydantic import BaseModel, Field, model_validator

from sources.http_client import PoliteClient

SOURCE = "lnb"
BASE_URL = "https://www.laliganacional.com.ar"
BOCA_TEAM_ID = 114735  # idEquipo de Boca en la LNB (el idClub es 19)
ARGENTINA_TZ = timezone(timedelta(hours=-3))  # Argentina no usa horario de verano

# Duración de cada período en segundos: 10 minutos los cuartos, 5 los suplementarios (FIBA).
QUARTER_S = 600
OVERTIME_S = 300


class ParseError(Exception):
    """La página no tiene la forma esperada: el partido no se carga y va a cuarentena."""


# --- Modelos ---------------------------------------------------------------------------------


class FixtureGame(BaseModel):
    source_game_id: str = Field(min_length=10, max_length=200)
    played_at: datetime
    home_name: str
    away_name: str
    home_team_id: int
    away_team_id: int
    home_route: str = Field(pattern=r"^[a-z0-9-]+$")
    away_route: str = Field(pattern=r"^[a-z0-9-]+$")
    home_points: int | None = Field(default=None, ge=0, le=250)
    away_points: int | None = Field(default=None, ge=0, le=250)

    @property
    def is_boca(self) -> bool:
        return BOCA_TEAM_ID in (self.home_team_id, self.away_team_id)

    @property
    def is_played(self) -> bool:
        # La LNB publica los partidos programados con 0-0, no vacíos; en básquet no hay 0-0 ni empates.
        if self.home_points is None or self.away_points is None:
            return False
        return self.home_points != self.away_points

    @property
    def url(self) -> str:
        return f"{BASE_URL}/laliga/partido/{self.source_game_id}/{self.home_route}-vs-{self.away_route}"


class PlayerLine(BaseModel):
    """Una fila del box score. Solo contadores crudos: todo lo demás se calcula después."""

    source_player_id: str = Field(pattern=r"^\d+$")
    name: str
    shirt_number: int | None = Field(default=None, ge=0, le=99)
    started: bool
    seconds: int = Field(ge=0, le=4200)
    pts: int = Field(ge=0)
    fg2m: int = Field(ge=0)
    fg2a: int = Field(ge=0)
    fg3m: int = Field(ge=0)
    fg3a: int = Field(ge=0)
    ftm: int = Field(ge=0)
    fta: int = Field(ge=0)
    orb: int = Field(ge=0)
    drb: int = Field(ge=0)
    ast: int = Field(ge=0)
    stl: int = Field(ge=0)
    tov: int = Field(ge=0)
    blk: int = Field(ge=0)
    blk_against: int = Field(ge=0)
    pf: int = Field(ge=0)
    pf_drawn: int = Field(ge=0)
    efficiency: int
    plus_minus: int

    @model_validator(mode="after")
    def _shots_add_up(self) -> PlayerLine:
        # Los mismos controles que la base (core.player_game_stats): si no cierran, el dato está mal.
        if self.fg2m > self.fg2a or self.fg3m > self.fg3a or self.ftm > self.fta:
            raise ValueError(f"{self.name}: más tiros convertidos que intentados")
        if self.pts != 2 * self.fg2m + 3 * self.fg3m + self.ftm:
            raise ValueError(f"{self.name}: los puntos no cierran con los tiros")
        return self


class TeamBox(BaseModel):
    club_id: int
    team_id: int
    name: str
    coach: str | None
    players: list[PlayerLine] = Field(min_length=5)
    totals: PlayerLine  # la fila «Totales» (incluye rebotes de equipo)

    @model_validator(mode="after")
    def _players_sum_to_totals(self) -> TeamBox:
        # Los puntos del equipo tienen que ser la suma de sus jugadores (los rebotes no: la fila
        # de totales suma también los rebotes de equipo, que no son de nadie).
        if sum(p.pts for p in self.players) != self.totals.pts:
            raise ValueError(f"{self.name}: los puntos de los jugadores no suman el total")
        return self


class PeriodScore(BaseModel):
    period: int = Field(ge=1, le=10)
    home_points: int = Field(ge=0)
    away_points: int = Field(ge=0)


class Shot(BaseModel):
    team_id: int
    source_player_id: str | None
    period: int = Field(ge=1, le=10)
    shot_value: Literal[2, 3]
    made: bool
    x_pct: float = Field(ge=0, le=100)
    y_pct: float = Field(ge=0, le=100)
    zone: str | None


class PbpEvent(BaseModel):
    seq: int = Field(ge=0)  # número `accion-N` de la fuente: orden cronológico
    side: Literal["local", "visitante"] | None  # None en inicio y fin de período o partido
    event_type: str = Field(pattern=r"^[A-Z0-9-]+$")
    source_player_id: str | None
    period: int | None = Field(default=None, ge=1, le=10)
    clock_s: int | None = Field(default=None, ge=0, le=QUARTER_S)  # segundos que quedan
    score_home: int | None = Field(default=None, ge=0)
    score_away: int | None = Field(default=None, ge=0)


class MatchData(BaseModel):
    home: TeamBox
    away: TeamBox
    periods: list[PeriodScore] = Field(min_length=4)
    shots: list[Shot]
    events: list[PbpEvent]

    @model_validator(mode="after")
    def _periods_add_up(self) -> MatchData:
        if sum(p.home_points for p in self.periods) != self.home.totals.pts:
            raise ValueError("los parciales del local no suman su resultado")
        if sum(p.away_points for p in self.periods) != self.away.totals.pts:
            raise ValueError("los parciales del visitante no suman su resultado")
        return self


# --- Fixture ---------------------------------------------------------------------------------


def fixture_url(start: date, end: date) -> str:
    return f"{BASE_URL}/api/fixture/laliga?fechaInicio={start.isoformat()}&fechaFin={end.isoformat()}"


def parse_fixture(payload: object) -> list[FixtureGame]:
    if not isinstance(payload, dict) or not isinstance(payload.get("partidos"), list):
        raise ParseError("el fixture no trae la lista 'partidos'")
    games = []
    for item in payload["partidos"]:
        try:
            played_at = datetime.strptime(item["fecha"], "%d/%m/%Y %H:%M").replace(tzinfo=ARGENTINA_TZ)
            games.append(
                FixtureGame(
                    source_game_id=item["idPartido"],
                    played_at=played_at,
                    home_name=item["equipoLocal"],
                    away_name=item["equipoVisitante"],
                    home_team_id=item["idEquipoLocal"],
                    away_team_id=item["idEquipoVisitante"],
                    home_route=item["localRuta"],
                    away_route=item["visitanteRuta"],
                    home_points=item.get("resultadoLocal"),
                    away_points=item.get("resultadoVisitante"),
                )
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise ParseError(f"partido del fixture con forma inesperada: {exc}") from exc
    return games


def month_windows(start: date, end: date) -> list[tuple[date, date]]:
    """Parte un rango en ventanas de un mes: cada respuesta queda chica y cacheable por separado."""
    windows = []
    cursor = start
    while cursor <= end:
        next_month = (cursor.replace(day=1) + timedelta(days=32)).replace(day=1)
        windows.append((cursor, min(end, next_month - timedelta(days=1))))
        cursor = next_month
    return windows


def fetch_fixture(client: PoliteClient, start: date, end: date) -> list[FixtureGame]:
    games: dict[str, FixtureGame] = {}
    for window_start, window_end in month_windows(start, end):
        result = client.get(fixture_url(window_start, window_end))
        if result.status != 200:
            raise ParseError(f"fixture: HTTP {result.status}")
        for game in parse_fixture(result.json()):
            games[game.source_game_id] = game
    return sorted(games.values(), key=lambda g: g.played_at)


# --- Página de partido -----------------------------------------------------------------------

_MADE_ATTEMPTED = re.compile(r"(\d+)\s*/\s*(\d+)")
_CLOCK = re.compile(r"Cuarto\s+(\d+)\s*-\s*(\d{2}):(\d{2}):(\d{2})")
_SCORE = re.compile(r"^\s*(\d+)\s*-\s*(\d+)\s*$")
_PHOTO_ID = re.compile(r"/fotos/(\d+)")
_CREST = re.compile(r"/escudos/(\d+)/(\d+)")


def _int(text: str) -> int:
    try:
        return int(text.strip())
    except ValueError as exc:
        raise ParseError(f"se esperaba un número y vino {text!r}") from exc


def _made_attempted(cell: Tag) -> tuple[int, int]:
    # La celda trae el porcentaje oculto (<span class="d-none">) y después «C/I».
    match = _MADE_ATTEMPTED.search(cell.get_text(" "))
    if match is None:
        raise ParseError(f"celda de tiros sin «convertidos/intentados»: {cell.get_text(' ')!r}")
    return int(match.group(1)), int(match.group(2))


def _minutes_to_seconds(text: str) -> int:
    minutes, _, seconds = text.strip().partition(":")
    return _int(minutes) * 60 + _int(seconds or "0")


def _line_from_cells(cells: list[Tag], *, totals: bool) -> PlayerLine:
    """Convierte las celdas de una fila del box score.

    Fila de jugador (23 celdas): foto, dorsal (con «*» si fue titular), nombre, minutos, puntos,
    2P C/I, 2P %, 3P C/I, 3P %, TL C/I, TL %, rebotes def., of. y total, asistencias,
    recuperaciones, pérdidas, tapones dados y recibidos, faltas cometidas y recibidas,
    valoración y +/−. La fila «Totales» trae lo mismo desde los minutos (21 celdas).
    """
    expected = 21 if totals else 23
    if len(cells) != expected:
        raise ParseError(f"fila del box score con {len(cells)} celdas (se esperaban {expected})")
    if totals:
        photo_id, shirt, started, name, rest = "0", None, False, "Totales", cells[1:]
    else:
        match = _PHOTO_ID.search(str(cells[0]))
        if match is None:
            raise ParseError("fila de jugador sin id de foto")
        dorsal = cells[1].get_text(strip=True)
        number = dorsal.replace("*", "").strip()
        photo_id, started, shirt = match.group(1), "*" in dorsal, (_int(number) if number else None)
        name, rest = cells[2].get_text(strip=True), cells[3:]
    fg2m, fg2a = _made_attempted(rest[2])
    fg3m, fg3a = _made_attempted(rest[4])
    ftm, fta = _made_attempted(rest[6])
    return PlayerLine(
        source_player_id=photo_id,
        name=name,
        shirt_number=shirt,
        started=started,
        seconds=0 if totals else _minutes_to_seconds(rest[0].get_text()),
        pts=_int(rest[1].get_text()),
        fg2m=fg2m,
        fg2a=fg2a,
        fg3m=fg3m,
        fg3a=fg3a,
        ftm=ftm,
        fta=fta,
        drb=_int(rest[8].get_text()),
        orb=_int(rest[9].get_text()),
        ast=_int(rest[11].get_text()),
        stl=_int(rest[12].get_text()),
        tov=_int(rest[13].get_text()),
        blk=_int(rest[14].get_text()),
        blk_against=_int(rest[15].get_text()),
        pf=_int(rest[16].get_text()),
        pf_drawn=_int(rest[17].get_text()),
        efficiency=_int(rest[18].get_text()),
        plus_minus=_int(rest[19].get_text()),
    )


def _team_box(table: Tag) -> TeamBox:
    # El nombre, el escudo (con idClub e idEquipo) y el entrenador están en los bloques
    # anteriores a la tabla, dentro del mismo contenedor.
    header = table.find_previous("div", class_="nombre-equipo")
    coach_block = table.find_previous("div", class_="entrenador")
    if not isinstance(header, Tag):
        raise ParseError("tabla de box score sin nombre de equipo")
    crest = _CREST.search(str(header))
    if crest is None:
        raise ParseError("tabla de box score sin escudo con ids")
    coach_span = coach_block.find("span") if isinstance(coach_block, Tag) else None
    tbody, tfoot = table.find("tbody"), table.find("tfoot")
    if not isinstance(tbody, Tag) or not isinstance(tfoot, Tag):
        raise ParseError("tabla de box score sin cuerpo o sin totales")
    players = [_line_from_cells(row.find_all("td"), totals=False) for row in tbody.find_all("tr")]
    totals_row = tfoot.find("tr")
    if not isinstance(totals_row, Tag):
        raise ParseError("tabla de box score sin fila de totales")
    totals = _line_from_cells(totals_row.find_all(["td", "th"]), totals=True)
    return TeamBox(
        club_id=int(crest.group(1)),
        team_id=int(crest.group(2)),
        name=header.get_text(strip=True),
        coach=coach_span.get_text(strip=True) if isinstance(coach_span, Tag) else None,
        players=players,
        totals=totals,
    )


def _embedded_json(html: str, name: str) -> object:
    """Lee una variable JavaScript con un literal JSON (`periodos = [...]`) sin ejecutar nada."""
    match = re.search(rf"\b{name}\s*=\s*(?=[\[{{])", html)
    if match is None:
        raise ParseError(f"la página no trae la variable {name}")
    try:
        value, _ = json.JSONDecoder().raw_decode(html, match.end())
    except json.JSONDecodeError as exc:
        raise ParseError(f"la variable {name} no es JSON válido") from exc
    return value


def _periods(html: str) -> list[PeriodScore]:
    raw = _embedded_json(html, "periodos")
    if not isinstance(raw, list):
        raise ParseError("periodos no es una lista")
    return [
        PeriodScore(
            period=p["periodo"],
            home_points=p["tanteo_periodo_local"],
            away_points=p["tanteo_periodo_visitante"],
        )
        for p in raw
    ]


def _shots(html: str) -> list[Shot]:
    raw = _embedded_json(html, "tiros")
    if not isinstance(raw, list):
        raise ParseError("tiros no es una lista")
    # Los convertidos llegan como CANASTA-2P/3P y los errados como TIRO2/3-FALLADO.
    values: dict[str, Literal[2, 3]] = {
        "CANASTA-2P": 2,
        "TIRO2-FALLADO": 2,
        "CANASTA-3P": 3,
        "TIRO3-FALLADO": 3,
    }
    shots = []
    for item in raw:
        value = values.get(str(item.get("accion_tipo", "")))
        if value is None:
            continue  # el mapa de tiro solo trae tiros de campo; cualquier otra cosa se ignora
        shots.append(
            Shot(
                team_id=item["equipo_id"],
                source_player_id=str(item["componente_id"]) if item.get("componente_id") else None,
                period=item["numero_periodo"],
                shot_value=value,
                made=bool(item["metido"]),
                x_pct=float(str(item["posicion_x"]).rstrip("%")),
                y_pct=float(str(item["posicion_y"]).rstrip("%")),
                zone=item.get("zona") or None,
            )
        )
    return shots


def _events(soup: BeautifulSoup) -> list[PbpEvent]:
    events = []
    for li in soup.select("li.accion"):
        classes = [str(c) for c in li.get_attribute_list("class") if c and c != "accion"]
        seq_class = next((c for c in classes if re.fullmatch(r"accion-\d+", c)), None)
        if seq_class is None:
            raise ParseError("jugada sin número de orden")
        side = next((c for c in classes if c in ("local", "visitante")), None)
        event_type = next(c for c in classes if c not in (seq_class, side))
        clock = _CLOCK.search(li.get_text(" ", strip=True))
        photo = li.find("img", class_="imgJugador")
        player_match = _PHOTO_ID.search(str(photo.get("src", ""))) if isinstance(photo, Tag) else None
        score_tag = li.find("strong", class_="informacionAdicional")
        score = _SCORE.match(score_tag.get_text()) if isinstance(score_tag, Tag) else None
        events.append(
            PbpEvent.model_validate(
                {
                    "seq": int(seq_class.removeprefix("accion-")),
                    "side": side,
                    "event_type": event_type,
                    "source_player_id": player_match.group(1) if player_match else None,
                    "period": int(clock.group(1)) if clock else None,
                    "clock_s": (int(clock.group(2)) * 3600 + int(clock.group(3)) * 60 + int(clock.group(4)))
                    if clock
                    else None,
                    "score_home": int(score.group(1)) if score else None,
                    "score_away": int(score.group(2)) if score else None,
                }
            )
        )
    # La página lista de la más nueva a la más vieja; el número de acción da el orden real.
    return sorted(events, key=lambda e: e.seq)


def parse_match(html: str) -> MatchData:
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.select("table.tabla-estadisticas")
    if len(tables) != 2:
        raise ParseError(f"se esperaban 2 tablas de box score y hay {len(tables)}")
    try:
        return MatchData(
            home=_team_box(tables[0]),
            away=_team_box(tables[1]),
            periods=_periods(html),
            shots=_shots(html),
            events=_events(soup),
        )
    except (KeyError, TypeError, ValueError, StopIteration) as exc:  # ValueError incluye ValidationError
        raise ParseError(f"página de partido con forma inesperada: {exc!r}") from exc


def fetch_match(client: PoliteClient, game: FixtureGame) -> tuple[MatchData, str]:
    """Devuelve el partido parseado y el SHA-256 de la página (cadena de custodia, 14.4)."""
    result = client.get(game.url)
    if result.status != 200:
        raise ParseError(f"partido {game.home_route}-vs-{game.away_route}: HTTP {result.status}")
    return parse_match(result.text()), result.sha256


# --- Ficha de jugador ------------------------------------------------------------------------------

_BIRTH = re.compile(r"Fecha de nacimiento:\s*</strong>\s*(\d{2})/(\d{2})/(\d{4})")
_FULL_NAME = re.compile(r'class="bloque-detalle-jugador">\s*<h4><strong>([^<]+)</strong>')


class PlayerBio(BaseModel):
    source_player_id: str = Field(pattern=r"^\d+$")
    full_name: str | None
    birth_date: date | None


def player_url(player_id: str) -> str:
    # El último tramo (nombre) no se valida en el sitio: alcanza con el id del jugador.
    return f"{BASE_URL}/laliga/jugador/19/{BOCA_TEAM_ID}/{player_id}/jugador"


def parse_player(html: str, player_id: str) -> PlayerBio:
    """Fecha de nacimiento y nombre completo de la ficha. Dato personal: solo se usa para la edad."""
    birth = _BIRTH.search(html)
    name = _FULL_NAME.search(html)
    born = date(int(birth.group(3)), int(birth.group(2)), int(birth.group(1))) if birth else None
    if born is not None and not date(1950, 1, 1) < born < date.today():
        raise ParseError(f"fecha de nacimiento imposible: {born}")
    return PlayerBio(
        source_player_id=player_id, full_name=name.group(1).strip() if name else None, birth_date=born
    )


def fetch_player(client: PoliteClient, player_id: str) -> PlayerBio:
    result = client.get(player_url(player_id))
    if result.status != 200:
        raise ParseError(f"ficha de jugador {player_id}: HTTP {result.status}")
    return parse_player(result.text(), player_id)
