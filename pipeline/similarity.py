"""Alternativas para un jugador: perfiles con K-means y los más parecidos, de otros clubes primero.

Mismo modelo que Pelotheta fútbol, con el box score de básquet:
1. Cada jugador con al menos `MIN_MINUTES` es un vector de estadísticas cada 36 minutos (y el
   tiro verdadero, que ya es una tasa), estandarizadas (z = (x − media) / desvío): así «tapones» y
   «puntos» pesan lo mismo.
2. K-means agrupa los vectores en k perfiles; k se elige entre 2 y 6 por la silueta más alta.
3. Para cada jugador del equipo elegido, tres listas de mejor a peor (más parecido primero):
   - «externo»: un jugador de otro club, 1 a 1;
   - «dupla»: dos jugadores de otros clubes cuyo perfil promedio se le parece (y que, con precios,
     juntos cuestan menos: la idea de Moneyball);
   - «club»: un compañero del mismo equipo, aparte, para que no tape a los de afuera.

A diferencia de fútbol, la LNB publica el box score de los dos equipos en cada partido: con
`--liga` entran todos los jugadores de la liga desde el primer día. Sin precios públicos de la LNB
(ver docs/source_audit.md), la dupla no se filtra por costo hasta que haya valores cargados.
"""

from __future__ import annotations

import itertools
from collections.abc import Mapping, Sequence
from typing import Any

from pipeline import stats
from pipeline.projection import percent_rank

MIN_MINUTES = 120
K_RANGE = range(2, 7)
TOP_EXTERNAL = 10
TOP_PAIR = 5
TOP_CLUB = 5
PAIR_POOL = 15  # las duplas se arman entre los 15 externos más parecidos (105 pares por jugador)
SILHOUETTE_SAMPLE = 400  # shortcut: silueta sobre una muestra fija; con varias ligas es O(n²)
BASE = 36.0

# (clave, etiqueta, nombre de perfil, cada 36). El tiro verdadero ya es una tasa.
FEATURES: tuple[tuple[str, str, str, bool], ...] = (
    ("pts", "Puntos", "Anotador", True),
    ("fg2a", "Tiros de 2 intentados", "Interno", True),
    ("fg3a", "Triples intentados", "Tirador", True),
    ("fta", "Libres intentados", "Penetrador", True),
    ("ts", "% de tiro verdadero", "Eficiente", False),
    ("ast", "Asistencias", "Generador", True),
    ("tov", "Pérdidas", "Conductor", True),
    ("orb", "Rebotes ofensivos", "Reboteador ofensivo", True),
    ("drb", "Rebotes defensivos", "Reboteador", True),
    ("stl", "Robos", "Ladrón", True),
    ("blk", "Tapones", "Taponero", True),
    ("pf_drawn", "Faltas recibidas", "Provocador", True),
)
KEYS = [k for k, _, _, _ in FEATURES]
NO_OTHERS = "Todavía no hay estadísticas de jugadores de otros clubes: por ahora solo aparecen compañeros."

Player = Mapping[str, Any]


def raw_features(p: Player) -> dict[str, float | None]:
    """Estadísticas cada 36 del jugador y su tiro verdadero (None sin tiros)."""
    st = p.get("stats") or {}
    minutes = float(p.get("minutes") or 0)
    out: dict[str, float | None] = {}
    for key, _, _, per36 in FEATURES:
        if key == "ts":
            shots = 2 * (float(st.get("fg2a", 0)) + float(st.get("fg3a", 0)) + 0.44 * float(st.get("fta", 0)))
            out[key] = float(st.get("pts", 0)) / shots if shots > 0 else None
        elif minutes <= 0:
            out[key] = None
        else:
            out[key] = float(st.get(key, 0)) * BASE / minutes if per36 else float(st.get(key, 0))
    return out


def _style_name(center: Sequence[float], used: set[str]) -> str:
    # Las dos variables con el z más alto del centro dan el nombre («Tirador · Generador»).
    words: list[str] = []
    for i in sorted(range(len(FEATURES)), key=lambda i: -center[i]):
        if FEATURES[i][2] not in words:
            words.append(FEATURES[i][2])
        if len(words) == 2:
            break
    name, n = " · ".join(words), 2
    while name in used:
        name = f"{' · '.join(words)} {n}"
        n += 1
    used.add(name)
    return name


def _best_k(
    points: list[list[float]],
) -> tuple[int, list[int], list[list[float]], float, list[dict[str, float]]]:
    step = max(1, len(points) // SILHOUETTE_SAMPLE)
    sample = list(range(0, len(points), step))
    trials = []
    for k in K_RANGE:
        if k >= len(points):
            break
        labels, centers, inertia = stats.kmeans(points, k)
        score = stats.silhouette([points[i] for i in sample], [labels[i] for i in sample])
        trials.append((score, k, labels, centers, inertia))
    score, k, labels, centers, _ = max(trials, key=lambda t: t[0])
    return k, labels, centers, score, [{"k": t[1], "silhouette": t[0], "inertia": t[4]} for t in trials]


def _member(c: Player, label: str, raw: Mapping[str, float | None], z: Sequence[float]) -> dict[str, Any]:
    """Una opción con lo necesario para su desglose: sus estadísticas cada 36 y en escala z."""
    games = c.get("games") or 0
    return {
        "name": c["name"],
        "team": c["team"],
        "player_id": c.get("player_id"),
        "position": c.get("position"),
        "age": c.get("age"),
        "minutes": c.get("minutes"),
        "games": games,
        "mpg": round(float(c.get("minutes") or 0) / games, 1) if games else None,
        "profile": label,
        "value_eur": c.get("value"),
        "features": {k: None if (v := raw.get(k)) is None else round(v, 3) for k in KEYS},
        "z": {k: round(z[j], 3) for j, k in enumerate(KEYS)},
    }


def fit(own: Sequence[Player], others: Sequence[Player], team_slug: str) -> dict[str, Any]:
    """Run del modelo: {'run', 'styles', 'alternatives'} listo para la base.

    `own`: jugadores del equipo elegido (source_player_id, name, team, position, minutes, games,
    stats, value). `others`: jugadores de otros clubes con la misma forma.
    """
    params: dict[str, Any] = {
        "features": [{"id": k, "label": label, "style": style} for k, label, style, _ in FEATURES],
        "min_minutes": MIN_MINUTES,
        "per": int(BASE),
    }

    def eligible(p: Player) -> dict[str, float | None] | None:
        if (p.get("minutes") or 0) < MIN_MINUTES:
            return None
        f = raw_features(p)
        return f if all(v is not None for v in f.values()) else None

    mine = [(p, f) for p in own if (f := eligible(p)) is not None]
    outside = [(p, f) for p in others if (f := eligible(p)) is not None]
    params["others_total"] = len(others)
    params["others_with_stats"] = len(outside)
    if len(mine) < 5:
        return {
            "run": {
                "model": "alternativas",
                "team_slug": team_slug,
                "status": "sin_datos",
                "n": len(mine),
                "metrics": {},
                "params": params,
                "message": f"Hay {len(mine)} jugadores propios con {MIN_MINUTES} minutos o más.",
            },
            "styles": [],
            "alternatives": [],
        }
    everyone = mine + outside
    columns = [[float(f[k] or 0) for _, f in everyone] for k in KEYS]
    points = [list(row) for row in zip(*stats.zscores(columns), strict=True)]
    k, labels, centers, score, curve = _best_k(points)
    used: set[str] = set()
    names = {c: _style_name(centers[c], used) for c in range(k)}
    n_mine = len(mine)
    coords, shares = stats.pca2(points)
    center = [stats.mean(col) for col in zip(*points, strict=True)]
    # «% de parecido»: distancia contra el doble del punto más lejano al centro (cota del par más
    # lejano, sin calcular las n² distancias).
    d_ref = 2 * max(stats.dist(p, center) for p in points) or 1.0

    def similarity(d: float) -> float:
        return round(max(0.0, 100 * (1 - d / d_ref)), 1)

    styles = [
        {
            "source_player_id": p["source_player_id"],
            "cluster": labels[i],
            "cluster_label": names[labels[i]],
            "pc1": coords[i][0],
            "pc2": coords[i][1],
            "features": {key: round(columns[j][i], 3) for j, key in enumerate(KEYS)},
            "z": {key: round(points[i][j], 3) for j, key in enumerate(KEYS)},
            # Percentil contra toda la liga (no solo el plantel): 100 = el que más hace eso.
            "percentiles": {
                key: round(percent_rank(columns[j], columns[j][i]) or 0, 1) for j, key in enumerate(KEYS)
            },
        }
        for i, (p, _) in enumerate(mine)
    ]
    # La nube de la liga para el gráfico de perfiles: posición en los 2 ejes y su grupo.
    cloud = [
        {
            "name": p["name"],
            "team": p["team"],
            "cluster": labels[i],
            "pc1": round(coords[i][0], 3),
            "pc2": round(coords[i][1], 3),
        }
        for i, (p, _) in enumerate(everyone)
        if i >= n_mine
    ]
    alternatives: list[dict[str, Any]] = []
    for i, (target, _) in enumerate(mine):
        value = target.get("value")
        club = sorted((j for j in range(n_mine) if j != i), key=lambda j: stats.dist(points[i], points[j]))
        ext = sorted(range(n_mine, len(everyone)), key=lambda j: stats.dist(points[i], points[j]))
        for section, picks in (("club", club[:TOP_CLUB]), ("externo", ext[:TOP_EXTERNAL])):
            for rank, j in enumerate(picks, start=1):
                cand = everyone[j][0]
                price = cand.get("value")
                alternatives.append(
                    {
                        "source_player_id": target["source_player_id"],
                        "section": section,
                        "rank": rank,
                        "members": [_member(cand, names[labels[j]], everyone[j][1], points[j])],
                        "similarity": similarity(stats.dist(points[i], points[j])),
                        "total_value_eur": price,
                        "savings_eur": value - price if value and price else None,
                    }
                )
        pairs = []
        for a, b in itertools.combinations(ext[:PAIR_POOL], 2):
            pa, pb = everyone[a][0].get("value"), everyone[b][0].get("value")
            total = pa + pb if pa and pb else None
            if value and total is not None and total > value:
                continue  # Moneyball: la dupla tiene que costar menos que el jugador que se va
            profile = [(x + y) / 2 for x, y in zip(points[a], points[b], strict=True)]
            pairs.append((stats.dist(points[i], profile), a, b, total))
        pairs.sort(key=lambda t: t[0])
        for rank, (d, a, b, total) in enumerate(pairs[:TOP_PAIR], start=1):
            alternatives.append(
                {
                    "source_player_id": target["source_player_id"],
                    "section": "dupla",
                    "rank": rank,
                    "members": [
                        _member(everyone[a][0], names[labels[a]], everyone[a][1], points[a]),
                        _member(everyone[b][0], names[labels[b]], everyone[b][1], points[b]),
                    ],
                    "similarity": similarity(d),
                    "total_value_eur": total,
                    "savings_eur": value - total if value and total is not None else None,
                }
            )
    corr = [[round(stats.pearson(a, b), 3) for b in columns] for a in columns]
    return {
        "run": {
            "model": "alternativas",
            "team_slug": team_slug,
            "status": "ok",
            "n": len(everyone),
            "metrics": {
                "k": k,
                "silhouette": score,
                "k_curve": curve,
                "pca_share": list(shares),
                "correlation": corr,
                "own_players": n_mine,
                "other_players": len(outside),
                "cloud": cloud,
                "league_means": {key: round(stats.mean(columns[j]), 3) for j, key in enumerate(KEYS)},
            },
            "params": params,
            "message": None if outside else NO_OTHERS,
        },
        "styles": styles,
        "alternatives": alternatives,
    }
