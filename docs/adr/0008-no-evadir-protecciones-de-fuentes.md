# ADR 0008: no evadir protecciones de las fuentes

- Estado: aceptada (3-nov-2026), la misma regla que Pelotheta fútbol

## Contexto
FIBA.basketball prohíbe duplicar o redistribuir sus datos y Sofascore limita el uso automatizado de
sus endpoints. Saltear esos límites daría más datos, pero viola sus términos.

## Decisión
El pipeline se identifica siempre (User-Agent con el enlace del repositorio), respeta robots.txt y
las pausas, y nunca evade desafíos, CAPTCHAs ni bloqueos. FIBA y Sofascore quedan para chequeo
manual; si una fuente bloquea, se registra como aviso y la corrida sigue sin ella.

## Consecuencias
- Lo que solo publican esas fuentes (por ejemplo, la BCL) queda en `n/d` con su motivo.
