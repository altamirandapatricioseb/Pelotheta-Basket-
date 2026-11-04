# Gantt (planificado frente a real)

El plan suponía unas 2 horas por etapa en horas seguidas; lo real sale de los commits de cierre de cada
etapa (`git log`). Datos en `gantt.csv`. Hitos: cada commit de cierre (el dueño hace el push y Vercel
despliega desde `main`).

```mermaid
gantt
    title Pelotheta Θ básquet: planificado frente a real
    dateFormat YYYY-MM-DD HH:mm
    axisFormat %d %H:%M
    section 1. Preparación y Fase 0
    Plan :p1, 2026-11-03 01:30, 2026-11-03 03:30
    Real :done, r1, 2026-11-03 01:30, 2026-11-03 02:04
    section 3. Pipeline
    Plan :p3, 2026-11-03 05:30, 2026-11-03 07:30
    Real :done, r3, 2026-11-03 02:04, 2026-11-03 02:53
    section 2. Esqueleto
    Plan :p2, 2026-11-03 03:30, 2026-11-03 05:30
    Real :done, r2, 2026-11-03 02:53, 2026-11-03 03:13
    section 4. Estadísticas y tablas
    Plan :p4, 2026-11-03 07:30, 2026-11-03 11:30
    Real :done, r4, 2026-11-03 03:13, 2026-11-03 18:05
    section 5. Gráficos
    Plan :p5, 2026-11-03 11:30, 2026-11-03 13:30
    Real :done, r5, 2026-11-03 18:05, 2026-11-03 19:26
    section 6. Situaciones y desglosada
    Plan :p6, 2026-11-03 13:30, 2026-11-03 15:30
    Real :done, r6, 2026-11-03 19:26, 2026-11-03 21:30
    section 7. Comparar
    Plan :p7, 2026-11-03 15:30, 2026-11-03 17:30
    Real :done, r7, 2026-11-03 21:30, 2026-11-03 22:46
    section 8. Excel
    Plan :p8, 2026-11-03 17:30, 2026-11-03 19:30
    Real :done, r8, 2026-11-03 22:46, 2026-11-04 00:27
    section 9. Power BI
    Plan :p9, 2026-11-03 19:30, 2026-11-03 21:30
    Real :done, r9, 2026-11-04 00:27, 2026-11-04 01:33
    section 10. Pulido
    Plan :p10, 2026-11-03 21:30, 2026-11-03 23:30
    Real :done, r10, 2026-11-04 01:33, 2026-11-04 02:37
    section 11. Documentación
    Plan :p11, 2026-11-03 23:30, 2026-11-04 01:30
    Real :active, r11, 2026-11-04 02:37, 2026-11-04 05:00
```

**Desvíos.** La etapa 4 se llevó la mayor parte del día: la primera versión se rehízo para quedar igual a
Pelotheta fútbol (pedido del dueño), con el catálogo ampliado a 275 estadísticas. Las etapas 5 a 10 fueron
ports y cerraron más rápido que lo planificado; el retraso acumulado viene de la etapa 4.
