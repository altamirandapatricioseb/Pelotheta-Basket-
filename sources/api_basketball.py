"""API-Basketball (api-sports.io): resultados de temporadas pasadas y de otras ligas de la zona.

Para qué: el predictor pesa partidos de hasta tres temporadas y necesita medir a rivales de otras
ligas (Liga Sudamericana, BCL Americas, Supercopa). La LNB solo publica la temporada en curso y
TheSportsDB gratis corta en 15 partidos por temporada (sondeo del 18-nov-2026).

Plan gratis: 100 consultas por día y temporadas 2022 a 2024 (docs/source_audit.md). Una corrida usa
1 consulta por país (para ubicar las ligas) y 1 por liga y temporada: menos de 30. Todo pasa por
PoliteClient (caché y manifiesto), así que una temporada terminada no se vuelve a pedir.

La clave va en API_BASKETBALL_KEY (la misma de cualquier API de api-sports.io), solo en el header y
nunca en la URL, la caché ni el manifiesto. Sin clave, el adaptador no hace nada.
"""

from __future__ import annotations

import os
from typing import Any

from pipeline.match_predictor import Result
from sources.http_client import PoliteClient

SOURCE = "api_basketball"
API = "https://v1.basketball.api-sports.io"
FREE_SEASONS = (2022, 2023, 2024)  # el plan gratis responde «try from 2022 to 2024»

# Código propio → (país en la API, texto del nombre de la liga, país y liga para el selector).
LEAGUES: dict[str, tuple[str, str, str, str]] = {
    "lnb": ("Argentina", "Liga A", "Argentina", "Liga Nacional"),
    "nbb": ("Brazil", "NBB", "Brasil", "NBB"),
    "lub": ("Uruguay", "Liga Uruguaya", "Uruguay", "Liga Uruguaya de Básquetbol"),
    "chi": ("Chile", "LNB", "Chile", "Liga Nacional de Básquetbol"),
    "par": ("Paraguay", "LNB", "Paraguay", "Liga Nacional de Básquetbol"),
    "lsb": ("World", "Liga Sudamericana", "Sudamérica", "Liga Sudamericana"),
    "bcla": ("World", "BCL Americas", "Sudamérica", "Basketball Champions League Americas"),
}
ZONE = {code: {"country": v[2], "league": v[3]} for code, v in LEAGUES.items() if code != "lnb"}


def token() -> str | None:
    return os.environ.get("API_BASKETBALL_KEY", "").strip() or None


def _get(client: PoliteClient, path: str, key: str) -> list[dict[str, Any]]:
    payload = client.get(f"{API}/{path}", headers={"x-apisports-key": key}, check_robots=False).json()
    if payload.get("errors"):
        raise ValueError(f"API-Basketball: {payload['errors']}")
    return list(payload.get("response") or [])


def find_league(leagues: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    """La liga cuyo nombre contiene `name` (sin distinguir mayúsculas)."""
    hits = [lg for lg in leagues if name.lower() in str(lg.get("name", "")).lower()]
    return hits[0] if hits else None


def parse_games(rows: list[dict[str, Any]], code: str) -> list[Result]:
    """Partidos terminados con su marcador final. Una fila rara se saltea."""
    out = []
    for g in rows:
        try:
            if (g.get("status") or {}).get("short") not in ("FT", "AOT"):
                continue
            scores = g["scores"]
            out.append(
                Result(
                    date=str(g["date"])[:10],
                    home=str(g["teams"]["home"]["name"]),
                    away=str(g["teams"]["away"]["name"]),
                    home_points=int(scores["home"]["total"]),
                    away_points=int(scores["away"]["total"]),
                    league=code,
                    # Las copas internacionales se juegan en sedes con varios equipos: cancha neutral.
                    neutral=code in ("lsb", "bcla"),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return out


def fetch(client: PoliteClient, max_seasons: int, warnings: list[str]) -> list[Result]:
    """Resultados de las ligas de `LEAGUES` en las últimas temporadas que da el plan gratis."""
    key = token()
    if key is None:
        warnings.append(
            "API-Basketball sin clave (API_BASKETBALL_KEY): sin temporadas pasadas ni ligas de la zona."
        )
        return []
    results: list[Result] = []
    by_country: dict[str, list[dict[str, Any]]] = {}
    for code, (country, name, _, _) in LEAGUES.items():
        try:
            if country not in by_country:
                by_country[country] = _get(client, f"leagues?country={country}", key)
            league = find_league(by_country[country], name)
            if league is None:
                warnings.append(f"API-Basketball: no encontré la liga «{name}» de {country}.")
                continue
            seasons = [
                str(s["season"])
                for s in league.get("seasons") or []
                if str(s.get("season", ""))[:4].isdigit() and int(str(s["season"])[:4]) in FREE_SEASONS
            ]
            for season in sorted(seasons)[-max_seasons:]:
                rows = _get(client, f"games?league={int(league['id'])}&season={season}", key)
                results += parse_games(rows, code)
        except (ValueError, KeyError, OSError) as exc:
            warnings.append(f"API-Basketball {code}: {type(exc).__name__}: {exc}"[:200])
    return results
