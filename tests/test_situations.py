"""Tests del catálogo de Situaciones (9.6) y de su correspondencia con las consultas SQL."""

from __future__ import annotations

import re

import pytest
from pydantic import ValidationError

from pipeline import situations

CARDS = situations.load_cards()
SQL = "\n".join(p.read_text(encoding="utf-8") for p in sorted(situations.SQL_DIR.glob("*.sql")))
SQL_IDS = set(re.findall(r"'(s[0-9]{3})'", SQL))


def test_al_menos_cien_tarjetas_numeradas_sin_huecos() -> None:
    ids = [c.id for c in CARDS]
    assert len(ids) >= 100
    assert ids == [f"s{n:03d}" for n in range(1, len(ids) + 1)]


def test_cada_tarjeta_con_datos_tiene_su_consulta_y_viceversa() -> None:
    available = {c.id for c in CARDS if c.available}
    assert available == SQL_IDS
    # Las que no tienen datos no tienen consulta: quedan n/d con su motivo.
    assert not {c.id for c in CARDS if not c.available} & SQL_IDS


def test_cada_vista_de_categoria_entra_en_el_refresco() -> None:
    views = set(re.findall(r"create view core\.(situ_cards_[a-j])", SQL))
    assert views == {f"situ_cards_{c}" for c in "abcdefghij"}
    refresh = SQL[SQL.index("create function core.refresh_situations") :]
    assert all(f"core.{v}" in refresh for v in views)


def test_sin_datos_siempre_con_motivo() -> None:
    row = {
        "id": "s999",
        "categoria": "A",
        "titulo_es": "Prueba",
        "condicion": "Prueba",
        "resultado_medido": "Resultado del partido",
        "datos_requeridos": "nada",
        "nivel": "C",
        "available": "false",
    }
    with pytest.raises(ValidationError):
        situations.Card.model_validate(row)
    assert not situations.Card.model_validate({**row, "motivo": "No hay datos"}).available
