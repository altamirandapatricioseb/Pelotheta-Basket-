# ADR 0006: dos variantes (α y β) de Mejoría y Potencial

- Estado: aceptada (3-nov-2026, etapa 4), igual que Pelotheta fútbol

## Contexto
Una sola fórmula de «mejoría» o «potencial» esconde sus supuestos. Las variantes descartadas (sección 6.1)
mezclaban unidades o se volvían cero después de los 28 años.

## Decisión
α: ventanas (últimos 5 contra el resto) con z ponderados y reducción por muestra chica. β: combinación fija
de nivel, tendencia y edad (0,60, 0,25 y 0,15). Las dos se publican con su aviso de estimación y su desglose.

## Consecuencias
- El acuerdo entre variantes es un indicador de confianza.
- En fútbol, el backtesting (notebook 04) mostró que la Mejoría α describe el pasado reciente y no
  anticipa el bloque siguiente. En básquet se lee igual, como descripción, hasta tener una temporada
  para validarla.
