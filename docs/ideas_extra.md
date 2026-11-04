# Extras de la sección 16 e ideas propias

Estado al 4-nov-2026. Lo que falta está justificado: o no hay datos suficientes todavía (6
partidos de Boca cargados), o lo impide el plan gratuito, o su costo no se justifica en un
sistema hermano de Pelotheta fútbol que ya lo demuestra.

## Sección 16

| Extra | Estado | Dónde está o por qué no |
|---|---|---|
| 16.1 Capas y calidad de datos | Parcial | Dos capas en vez de tres: `core` (privado) y `api` (vistas), igual que fútbol (ADR 0001). La calidad se controla en el pipeline: pydantic en cada fila, conciliación del play-by-play contra el box score (marcador, totales por jugador, minutos y +/−) con cuarentena (5.8), y validación de marcadores contra SportScore y TheSportsDB. Sin `raw`/`staging`/`marts` ni contratos YAML: con una sola fuente principal no agregan control, solo capas |
| 16.2 API documentada | Hecho, sin página propia | La Data API publica su OpenAPI en `/rest/v1/` (con `Accept-Profile: api`). Ejemplos y límites en `docs/api.md`. Sin `/api-docs` en la web: el mismo contenido en un documento evita mantener dos copias |
| 16.3 Notebooks | No | Con 6 partidos de Boca (49 de la liga) no hay muestra para calibrar el Elo ni para backtesting de Mejoría y Potencial. Fútbol los tiene (`notebooks/` de Pelotheta fútbol) y la metodología es la misma; se suman cuando haya una temporada |
| 16.4 Modelo predictivo | No | Misma razón: sin muestra, cualquier modelo sobreajusta. La regla de 16.4 (publicar solo si le gana al Elo) hoy no se puede evaluar |
| 16.5 SLOs, métricas y recuperación | Hecho | `docs/slo.md`, `/api/health` cada 6 h (`health.yml`), `ingest_log` por corrida y `docs/recuperacion.md` con el simulacro cronometrado (backup cifrado restaurado). Sin Lighthouse CI: el plan Hobby protege los previews y medirlos pide un secreto extra; las métricas de rendimiento se miden a mano antes de cada entrega |
| 16.6 Códigos de error y soporte | Hecho | `PEL-DB-001` (base sin respuesta) y `PEL-NF-404` (página inexistente) en la web, artículos en `docs/soporte/` y plantillas de issue (error, mejora, dato incorrecto) |
| 16.7 Pirámide de pruebas | Parcial | 152 pruebas de Python (pytest), 103 de la web (Vitest), 66 de accesibilidad y responsive (Playwright con axe, 11 rutas en dos temas y dos tamaños), 10 de la base (pgTAP) y RLS en vivo. Sin regresión visual ni k6: las capturas de fútbol cubren el mismo código de interfaz, y k6 contra un preview protegido no es posible en Hobby sin exponerlo |
| 16.8 Producto | Hecho | `docs/producto/vision.md` |
| 16.9 Gestión | Hecho | `docs/gestion/` (Gantt, Definición de Terminado, informe de cierre y retrospectiva). Sin GitHub Projects: el tablero vive en la cuenta del dueño |
| 16.10 Red y dominio | Hecho (sin dominio) | `docs/diagramas/arquitectura.md` (diagrama de red) y `docs/red/dominio.md` |

## Ideas propias (por iniciativa, no pedidas)

- **Sistema hermano de Pelotheta fútbol:** misma paleta, tipografía, componentes y estructura de
  datos, con datos de básquet. Un cambio de diseño se porta de un sistema al otro.
- **Situaciones calculadas en SQL** con 118 tarjetas y conclusiones automáticas del equipo y de los
  jugadores (diferencia de 25 puntos o más contra la base, con al menos 2 partidos).
- **Puesto en la tabla fecha por fecha** calculado con todos los resultados de la liga, en el libro
  de Excel (G10) y en Power BI, que fútbol no tiene.
- **Vista `api.stat_match_series`** en forma de conjunto (111 ms para toda la serie por partido, con
  los mismos valores que la desglosada de la web: 3.205 de 3.205).
