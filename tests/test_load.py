"""Pruebas de la carga (pipeline/load.py) sin red: el lote se arma con CSV de ejemplo y el envío
se prueba contra un transporte falso de httpx."""

from __future__ import annotations

import csv
import json
from pathlib import Path

import httpx
import pytest

from pipeline import load
from sources.lnb import BOCA_TEAM_ID

BOCA = str(BOCA_TEAM_ID)
URL, KEY = "https://abcdefgh.supabase.co", "sb_secret_prueba_no_real"


def _write(folder: Path, name: str, rows: list[dict[str, object]]) -> None:
    with (folder / f"{name}.csv").open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


@pytest.fixture
def processed(tmp_path: Path) -> Path:
    gid = "v2abcdefghijk"
    _write(
        tmp_path,
        "league_result",
        [
            {
                "source_game_id": gid,
                "played_at": "2026-10-28T20:35:00-03:00",
                "home_team_id": BOCA,
                "away_team_id": "2",
                "home_name": "BOCA",
                "away_name": "RIVAL",
                "home_points": 80,
                "away_points": 70,
            }
        ],
    )
    _write(
        tmp_path,
        "game",
        [
            {
                "source_game_id": gid,
                "played_at": "2026-10-28T20:35:00-03:00",
                "home_team_id": BOCA,
                "away_team_id": "2",
                "overtime_periods": 0,
            }
        ],
    )
    _write(
        tmp_path,
        "player_game_stats",
        [
            {
                "source_game_id": gid,
                "team_id": BOCA,
                "source_player_id": "7",
                "name": "SIETE, J.",
                "shirt_number": "",
                "started": True,
                "seconds": 1200,
                "pts": 20,
            }
        ],
    )
    _write(
        tmp_path,
        "game_period_score",
        [{"source_game_id": gid, "period": 1, "home_points": 80, "away_points": 70}],
    )
    _write(tmp_path, "team_game_stats", [{"source_game_id": gid, "team_id": BOCA, "pts": 80}])
    _write(
        tmp_path,
        "play_by_play_event",
        [
            {
                "source_game_id": gid,
                "seq": 0,
                "side": "",
                "event_type": "INICIO-PARTIDO",
                "source_player_id": "",
                "period": "",
                "clock_s": "",
                "score_home": "",
                "score_away": "",
            },
            {
                "source_game_id": gid,
                "seq": 1,
                "side": "visitante",
                "event_type": "CANASTA-2P",
                "source_player_id": "9",
                "period": 1,
                "clock_s": 590,
                "score_home": 0,
                "score_away": 2,
            },
        ],
    )
    _write(
        tmp_path,
        "shot",
        [
            {
                "source_game_id": gid,
                "team_id": "2",
                "source_player_id": "",
                "period": 1,
                "shot_value": 2,
                "made": True,
                "x_pct": 5,
                "y_pct": 50,
                "zone": "Z1",
            }
        ],
    )
    _write(tmp_path, "player_season", [{"source_player_id": "7", "name": "SIETE, J.", "pts": 20, "ts": ""}])
    _write(tmp_path, "league_table", [{"team_id": BOCA, "team": "BOCA", "wins": 1, "elo": 1510.0}])
    _write(tmp_path, "boca_season", [{"ortg": 110.5, "position": 1}])
    _write(tmp_path, "boca_game", [{"source_game_id": gid, "ortg": 110.5, "won": True, "opponent": "RIVAL"}])
    return tmp_path


def test_lote_completo_y_limpio(processed: Path) -> None:
    batch = load.build_batch(
        processed,
        run_id="00000000-0000-4000-8000-000000000000",
        trigger="manual",
        started_at="2026-11-03T05:00:00+00:00",
    )
    load.check_batch(batch)
    assert {t["source_id"]: t["is_boca"] for t in batch["teams"]} == {BOCA: True, "2": False}
    assert batch["player_lines"][0]["shirt_number"] is None  # '' -> null: Postgres no castea ''
    # La jugada sin reloj no viaja; la canasta del visitante queda con el id del equipo visitante.
    assert [(e["seq"], e["team_id"]) for e in batch["events"]] == [("1", "2")]
    assert batch["shots"][0]["source_player_id"] is None
    values = {(v["entity"], v["source_id"], v["stat_id"]): v for v in batch["stat_values"]}
    assert values[("jugador", "7", "pts")]["value"] == 20
    assert values[("jugador", "7", "ts")]["value"] is None  # n/d se carga como null, no como 0
    assert values[("equipo", BOCA, "elo")]["is_estimated"]
    assert ("equipo", BOCA, "position") not in values  # lo que no está en el catálogo no se carga
    assert batch["game_derived"][0]["stats"] == {"ortg": 110.5}
    assert {s["scope"] for s in batch["sets"]} == {"temporada", "partido"}


def test_rpc_manda_la_clave_solo_en_el_header() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"], seen["headers"] = str(request.url), request.headers
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"games": 1})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert load.rpc("load_batch", {"p_batch": {"x": 1}}, URL, KEY, client) == {"games": 1}
    assert seen["url"] == f"{URL}/rest/v1/rpc/load_batch"
    assert KEY not in str(seen["url"])
    headers = seen["headers"]
    assert isinstance(headers, httpx.Headers)
    assert headers["apikey"] == KEY and headers["content-profile"] == "ingest"


@pytest.mark.parametrize(
    ("url", "key"),
    [("https://abc.supabase.com", KEY), (URL, "sb_publishable_abc"), ("http://abcdefgh.supabase.co", KEY)],
)
def test_destino_invalido_no_se_llama(url: str, key: str) -> None:
    with pytest.raises(load.LoadError):
        load.rpc("load_batch", {}, url, key)


def test_error_de_supabase_sin_la_clave() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"message": "violates check constraint"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client, pytest.raises(load.LoadError) as err:
        load.rpc("load_batch", {}, URL, KEY, client)
    assert KEY not in str(err.value) and "400" in str(err.value)


def test_revalidacion_manda_el_secreto_y_no_rompe_si_falla(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"], seen["secret"] = str(request.url), request.headers.get("x-revalidate-secret")
        return httpx.Response(200, json={"ok": True})

    monkeypatch.setenv("SITE_URL", "https://pelotheta-basket-dva.vercel.app/")
    monkeypatch.setenv("REVALIDATE_SECRET", "s" * 40)
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert load.revalidate_site(client) == "ok"
    assert seen == {"url": "https://pelotheta-basket-dva.vercel.app/api/revalidar", "secret": "s" * 40}

    with httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(401))) as client:
        assert load.revalidate_site(client) == "falló (HTTP 401)"
    monkeypatch.delenv("REVALIDATE_SECRET")
    assert load.revalidate_site().startswith("omitida")
