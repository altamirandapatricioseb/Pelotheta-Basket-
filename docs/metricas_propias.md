# Métricas propias (secciones 6 y 6.1)

Todas son **estimadas** y propuestas de este sistema, no estándares. Se calculan en el pipeline (`pipeline/metrics.py`, `pipeline/tactics.py`, `pipeline/projection.py`, `pipeline/own_metrics.py`) y la web las marca como estimadas. Estado al 3-nov-2026: 6 partidos de Boca con play-by-play validado.

## Posesiones y ratings

`Pos ≈ 0,5 × [(FGA + 0,44 × FTA − ORB + TOV) del equipo + lo mismo del rival]`. `ORtg = 100 × PTS / Pos`, `DRtg = 100 × PTS_rival / Pos`, `NR = ORtg − DRtg`.

Ejemplo (Boca 95-83 Regatas, 28-oct-2026): jugadas de Boca 68 + 0,44 × 16 − 13 + 17 = 79,04; de Regatas 76,6 → Pos = 77,82 → ORtg 122,1, DRtg 106,7, NR +15,4.

## NR por jugador y On/Off

Se reconstruye quién estaba en cancha en cada jugada (los cinco «entran» al empezar cada cuarto y se siguen los cambios). En cada tramo se suman los puntos de los dos equipos y las jugadas que terminan posesiones; las posesiones del tramo salen con la misma fórmula de arriba.

- `NR en cancha = 100 × (PTS_eq − PTS_rival) / Pos` con el jugador en cancha; `NR fuera` igual con él en el banco; `On/Off = NR en cancha − NR fuera`.
- Control: la suma de minutos en cancha de todos los jugadores da exactamente 5 × 40 × partidos (240 minutos en 6 partidos).
- Límite: es el resultado del equipo con el jugador en cancha, no su producción individual. Con pocos minutos el ruido es enorme (aviso de muestra pequeña por debajo de 400 minutos).

## EWA y ELA

- `EWA = (Min / 40) × [P(ORtg_on) − P(ORtg_rep)]`, con `P(a) = a^x / (a^x + L^x)`.
- `ELA = (Min / 40) × [Q(DRtg_on) − Q(DRtg_rep)]`, con `Q(g) = g^x / (g^x + L^x)`. Positivo suma derrotas (malo); negativo las evita.
- `x`: exponente pitagórico calibrado por mínimos cuadrados con la tabla de la LNB (grilla de 5 a 25, paso 0,1). Hoy da 18,1 con pocas fechas jugadas: es ruidoso y se muestra el valor usado. Supuesto de partida: 14.
- `L`: puntos cada 100 posesiones de los dos equipos en los partidos de Boca (no hay box score de toda la liga todavía).
- **Reemplazo:** el prompt pide «los suplentes de su posición», pero la LNB no publica posiciones. Se usa el promedio ponderado por minutos de los suplentes del plantel (jugadores que empezaron menos de la mitad de sus partidos). Es un supuesto declarado.

Ejemplo de la fórmula: 400 minutos, ORtg con él 115, reemplazo 105, liga 110, x = 14 → `EWA = 10 × (0,651 − 0,343) ≈ 3,1`.

## Índice de rendimiento (6.1.1)

Promedio ponderado de percentiles por componente (A anotación, C creación, B rebote, D defensa, E eficiencia e impacto con el On/Off como NR relativo, P participación). Referencia: el plantel de Boca con al menos 40 minutos, porque solo hay box scores de los partidos de Boca. Sin posición publicada se usan los pesos «sin posición» (0,25 · 0,20 · 0,15 · 0,20 · 0,15 · 0,05). Con cobertura menor a 0,6 queda `n/d`. El ejemplo del prompt (base: 70, 80, 30, 50, 75, 60 → 68,5) está reproducido en `tests/test_projection.py`.

## Mejoría α y β, Potencial α y β (6.1.2 a 6.1.5)

Las fórmulas están implementadas y probadas con los ejemplos del prompt (Mejoría α 55,6; Mejoría β +7,5; Potencial α ≈ 62 con rango 54 a 70; Potencial β 65,8 y 74,0). Con los datos de hoy quedan `n/d`, con el motivo en el catálogo:

| Métrica | Por qué hoy es n/d | Qué la habilita |
|---|---|---|
| Mejoría α | El set de estadísticas depende de la posición, y pide 8 partidos recientes y 12 de base | Posición (Wikipedia o Latinbasket) y 20 partidos |
| Mejoría β | Pide dos bloques de 6 apariciones o más | 12 partidos con minutos |
| Potencial α | Necesita posición y edad | Fecha de nacimiento y posición |
| Potencial β | Necesita la edad | Fecha de nacimiento |

**Variantes descartadas** (6.1): (a) «Game Score promedio × percentil / 100 × (27 − edad) / 8»: mezcla unidades, se vuelve negativa desde los 27 años, depende del volumen de minutos y no está acotada. (b) «Game Score de los últimos N − Game Score de la temporada»: ya existe como ventana en la estadística desglosada (etapa 6).

## Lo que no se calcula (nivel C)

Tipos de jugada, esquemas defensivos, tiros contestados y calidad de tiro con tracking: ninguna fuente gratuita los publica y estimarlos exigiría supuestos que no se pueden defender.
