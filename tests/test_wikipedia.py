"""Pruebas del plantel de Wikipedia (sources/wikipedia.py) con una tabla armada a mano."""

from __future__ import annotations

import pytest

from sources import wikipedia


def _row(num: str, pos_title: str, name: str, height: str, weight: str, age: str) -> str:
    return (
        f"<tr><td>{num}</td><td>ARG</td><td><a title='{pos_title}'>X</a></td><td><a>{name}</a></td>"
        f"<td>{height}</td><td>{weight}</td><td>{age}</td><td>Club</td></tr>"
    )


def page(*rows: str) -> str:
    titles = ("N.º", "Nac.", "Pos.", "Nombre", "Altura", "Peso", "Edad")
    head = "<tr>" + "".join(f"<th>{t}</th>" for t in titles) + "</tr>"
    return f"<html><table class='sortable'>{head}{''.join(rows)}</table></html>"


ROWS = [
    _row("0", "Escolta (baloncesto)", "Michael Warren", "1.96 m (6 ft 5 in)", "82 kg (181 lb)", "30 años"),
    _row("11", "Base (baloncesto)", "José Vildoza", "1.90 m (6 ft 3 in)", "85 kg (187 lb)", "30 años"),
    _row("13", "Alero (baloncesto)", "Tomás Monacchi", "1.96 m", "92 kg", "28 años"),
    _row("20", "Ala-pívot", "Leonardo Lema", "2.03 m", "100 kg", "28 años"),
    _row("22", "Pívot (baloncesto)", "Francisco Cáffaro", "2,16 m", "110 kg", "26 años"),
]


def test_lee_posicion_altura_peso_y_edad() -> None:
    roster = wikipedia.parse_roster(page(*ROWS))
    assert [(p.shirt_number, p.position) for p in roster] == [
        (0, "SG"),
        (11, "PG"),
        (13, "SF"),
        (20, "PF"),
        (22, "C"),
    ]
    caffaro = roster[-1]
    assert (caffaro.height_cm, caffaro.weight_kg, caffaro.age) == (216, 110, 26)  # acepta coma decimal
    assert wikipedia.ZONE[caffaro.position] == "interno"


def test_posicion_desconocida_o_tabla_corta_es_error() -> None:
    with pytest.raises(wikipedia.ParseError):
        wikipedia.parse_roster(page(*ROWS[:4], _row("9", "Arquero", "Nadie", "1.80 m", "80 kg", "25 años")))
    with pytest.raises(wikipedia.ParseError):
        wikipedia.parse_roster(page(*ROWS[:2]))
    with pytest.raises(wikipedia.ParseError):
        wikipedia.parse_roster("<html><p>sin tabla</p></html>")
