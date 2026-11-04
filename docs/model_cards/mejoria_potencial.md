# Ficha del modelo: Mejoría y Potencial (sección 6.1)

## Propósito

Ordenar y explicar la evolución reciente y la proyección de los jugadores del plantel de Boca. Son
**estimaciones** para conversar sobre el plantel, no predicciones ni valuaciones de mercado. La misma
metodología que Pelotheta fútbol, con componentes y pesos del básquet. Detalle de cada fórmula en
`docs/metricas_propias.md`.

| Métrica | Pregunta | Escala |
|---|---|---|
| Índice de rendimiento | ¿Qué tan bien rinde frente al plantel? | 0 a 100 |
| Mejoría α | ¿Rinde mejor ahora que antes, en sus propias estadísticas? | 0 a 100; 50 = sin cambio |
| Mejoría β | ¿Cuántos puntos del índice subió o bajó entre dos bloques? | −100 a +100 |
| Potencial α | ¿A qué percentil puede llegar en su pico de edad? | 0 a 100, con rango |
| Potencial β | ¿Qué tan prometedor es hoy (nivel, tendencia y edad)? | 0 a 100 |

## Datos

Box score por partido de la LNB, minutos, posición del plantel (Wikipedia) y edad a la fecha. Temporada
2026-27 de la Liga Nacional.

## Método

- **Índice:** componentes A (anotación), C (creación), B (rebote), D (defensa), E (eficiencia e impacto)
  y P (participación), cada uno el promedio de los percentiles de sus estadísticas. Pesos por posición
  (`pipeline/projection.py: WEIGHTS`): base y escolta, alero, interno y sin posición. Un componente sin
  datos se saca y los pesos se reescalan; con cobertura menor a 0,6 el índice es `n/d`.
- **Mejoría α:** últimos partidos contra el resto de la temporada, con confiabilidad por minutos
  (K = 120).
- **Mejoría β:** dos bloques de al menos 6 apariciones cada uno.
- **Potencial α:** nivel con reducción por muestra chica (K = 400), crecimiento de 2 puntos de percentil
  por año hasta el pico (26 años) y tendencia con peso 0,5.
- **Potencial β:** combinación fija de nivel, tendencia y factor de edad.

## Supuestos y límites

- Todos los parámetros son supuestos de arranque de la sección 6.1, sin calibrar: con 6 partidos de
  Boca no hay muestra para backtesting.
- Sin datos futuros: cada valor usa solo los partidos anteriores a su fecha (`tests/test_projection.py`
  reproduce los ejemplos numéricos de 6.1).
- Con poca muestra, la web y los exportes muestran «muestra pequeña» y el aviso de estimación.

## Sesgos

- Los que juegan más minutos tienen percentiles más estables.
- Sin la posición del plantel, el jugador usa los pesos «sin posición».
