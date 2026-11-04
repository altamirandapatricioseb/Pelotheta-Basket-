# Gestión del proyecto (16.9)

El proyecto se llevó por etapas (tabla 3.1 del pedido), una por entregable, con un commit de cierre y el
estado en `README_TEMPORAL.md` al terminar cada una. Como es el sistema hermano de Pelotheta fútbol
(ADR 0010), la mayor parte del trabajo de cada etapa fue portar lo de fútbol y adaptarlo al básquet. La
visión, el backlog y la hoja de ruta están en `docs/producto/vision.md`; el Gantt, en `gantt.md`; el
cierre, en `informe_cierre.md`.

## Por qué no hay tablero de GitHub Projects

Lo lleva una sola persona: un tablero con un issue por entregable duplicaría lo que ya registran los
commits de cierre y el README temporal. Si se suma alguien, cada fila de la tabla de abajo pasa a ser un
milestone y cada ítem del backlog un issue.

## Definición de Terminado (aplicada en cada etapa)

1. Funciona en el navegador con datos reales y, después del push del dueño, en producción
   (`https://pelotheta-basket-dva.vercel.app`).
2. Lint, tipos y pruebas en verde (Python y web), con pruebas nuevas para la lógica nueva.
3. Visualmente igual a Pelotheta fútbol en lo que se portó.
4. Seguridad: sin secretos, RLS, cabeceras y advisors de Supabase en 0 ERROR y 0 WARN.
5. Documentado: README temporal y el documento de la sección correspondiente.

## Etapas

| Etapa | Planificado | Real | Desvío |
|---|---|---|---|
| 1. Preparación y Fase 0 | 3-nov | 3-nov | — |
| 2. Esqueleto | 3-nov | 3-nov | Se hizo después del pipeline (etapa 3), para tener datos reales |
| 3. Pipeline | 3-nov | 3-nov | Toda la liga y no solo Boca (PER y percentiles) |
| 4. Estadísticas y tablas | 3-nov | 3-nov | Se rehízo para quedar igual a fútbol (pedido del dueño) |
| 5. Gráficos | 3-nov | 3-nov | — |
| 6. Situaciones y desglosada | 3-nov | 3-nov | — |
| 7. Comparar | 3-nov | 3-nov | — |
| 8. Excel | 4-nov | 4-nov | Vista nueva `api.stat_match_series` para la Desglosada |
| 9. Power BI | 4-nov | 4-nov | — |
| 10. Pulido | 4-nov | 4-nov | 3 hallazgos de axe corregidos |
| 11. Documentación y entrega | 4-nov | 4-nov | — |

## Retrospectiva

- **Bien:** portar desde un sistema madre ahorró casi todo el diseño; cada etapa cerró en horas.
- **Mal:** la etapa 4 se hizo dos veces porque la primera versión no seguía a fútbol; al empezar, había
  que copiar primero y adaptar después.
- **Para la próxima:** con 6 partidos de Boca, varias métricas tienen muestra pequeña: los notebooks de
  calibración (16.3) esperan a tener una temporada.
