# Requisitos y trazabilidad

## Funcionales

| Id | Requisito | Caso de uso |
|---|---|---|
| RF01 | Mostrar al menos 50 gráficos de la temporada por categoría, con filtros y «Ver origen» | CU1 |
| RF02 | Tablas de jugadores y del equipo con una categoría visible a la vez, orden por columna y panel del jugador y la estadística actuales | CU2 |
| RF03 | Abrir la estadística desglosada con doble clic desde tablas, gráficos, tarjetas y comparación | CU3 |
| RF04 | Al menos 100 tarjetas de situaciones calculadas en SQL, con «Ver los partidos» | CU4 |
| RF05 | Comparar un jugador contra plantel, zona, posición y otro jugador, sin incluirlo en su referencia | CU5 |
| RF06 | Descargar el libro de Excel con gráficos nativos y hojas interactivas, y exportar la vista actual | CU6 |
| RF07 | Publicar los datos para Power BI (CSV en estrella) y por una API de solo lectura documentada | CU7 |
| RF08 | Mostrar la última actualización y detectar una carga nueva sin escribir en la base | CU8 |
| RF09 | Cargar la temporada desde la LNB con validación, conciliación del play-by-play, cuarentena y carga idempotente | CU9 |
| RF10 | Calcular Mejoría α y β y Potencial α y β sin datos futuros, con su aviso de estimación | CU2, CU3 |

## No funcionales

| Id | Tipo | Requisito |
|---|---|---|
| RNF01 | Seguridad | Con la clave pública se lee y no se escribe (RLS); ninguna clave secreta en el repositorio ni en el navegador |
| RNF02 | Seguridad | CSP con nonce, HSTS, nosniff, COOP y Permissions-Policy en todas las páginas |
| RNF03 | Seguridad | Parámetros de URL validados con Zod; un valor inválido vuelve al de defecto |
| RNF04 | Accesibilidad | WCAG 2.2 AA (axe sin violaciones) en todas las rutas, en los dos temas y en celular |
| RNF05 | Accesibilidad | Las animaciones respetan «reducir movimiento» |
| RNF06 | Disponibilidad | 99 % mensual medido cada 6 horas; frescura de datos de 35 días o menos |
| RNF07 | Responsive | Ninguna página se desplaza de costado en 375 px |
| RNF08 | Datos | Solo estadísticas derivadas: el play-by-play crudo y las coordenadas de los tiros no se publican |
| RNF09 | Recuperación | Backup mensual cifrado y restauración probada |
| RNF10 | Diseño | Igual que Pelotheta fútbol: Montserrat, paleta y componentes compartidos, tema claro y oscuro |

## Historias de usuario

```gherkin
Característica: Estadística desglosada
  Escenario: Abrir una estadística desde la tabla de jugadores
    Dado que estoy en /jugadores con la categoría Anotación
    Cuando hago doble clic en la celda de puntos de un jugador
    Entonces veo /estadistica/pts con sus ventanas de tiempo
    Y la ventana «Últimos 5 partidos» muestra n y la diferencia contra la temporada

Característica: Comparar
  Escenario: El jugador no entra en su propia media
    Dado que comparo a un base contra la media de exteriores
    Cuando miro la cantidad de jugadores de la referencia
    Entonces no lo cuenta a él

Característica: Seguridad de la API pública
  Escenario: Intento de escritura con la clave publicable
    Dado que tengo la clave publicable de docs/api.md
    Cuando envío un POST a /rest/v1/system_status
    Entonces la base lo rechaza
    Y ninguna fila cambia

Característica: Tácticas verificadas
  Escenario: Un partido cuyo play-by-play no cuadra
    Dado un partido donde el marcador reconstruido no coincide con el box score
    Cuando corre el pipeline
    Entonces el partido va a cuarentena
    Y sus tácticas quedan en n/d
```

## Matriz de trazabilidad

| Requisito | Caso de uso | Prueba | Código |
|---|---|---|---|
| RF01 | CU1 | `tests/test_chart_catalog.py`, `web/lib/charts/transform.test.ts` | `web/components/charts/`, `data/chart_catalog.csv` |
| RF02 | CU2 | `web/lib/stats/sort.test.ts`, `web/lib/stats/catalog.test.ts`, `web/lib/stats/team-groups.test.ts` | `web/components/players/player-master.tsx`, `web/components/team/team-table.tsx` |
| RF03 | CU3 | `web/lib/stats/detail.test.ts`, `tests/test_excel.py` (hoja Desglosada) | `web/app/estadistica/[stat]/page.tsx`, `api.stat_series`, `api.stat_match_series` |
| RF04 | CU4 | `tests/test_situations.py`, `web/lib/situations/board.test.ts` | `sql/situational/`, `web/components/situations/board.tsx` |
| RF05 | CU5 | `web/lib/compare/compare.test.ts`, `web/lib/compare/breakdown.test.ts` | `web/lib/compare/`, `web/components/compare/` |
| RF06 | CU6 | `tests/test_excel.py`, `web/lib/export/xlsx.test.ts` | `pipeline/excel.py`, `web/lib/export/xlsx.ts` |
| RF07 | CU7 | `tests/test_powerbi.py`, `tests/test_rls.py` | `pipeline/powerbi.py`, `docs/api.md` |
| RF08 | CU8 | `web/e2e/a11y.spec.ts` (ruta /actualizar) | `web/app/actualizar/page.tsx`, `web/app/api/ultima-actualizacion/route.ts` |
| RF09 | CU9 | `tests/test_lnb.py`, `tests/test_http_client.py`, `tests/test_load.py`, `tests/test_season.py` | `sources/lnb.py`, `pipeline/run.py`, `pipeline/pbp.py`, `pipeline/load.py` |
| RF10 | CU2, CU3 | `tests/test_projection.py`, `tests/test_metrics.py` | `pipeline/projection.py`, `pipeline/own_metrics.py` |
| RNF01 | CU7 | `tests/test_rls.py`, `supabase/tests/database/security.test.sql` | `supabase/migrations/` |
| RNF02 | — | `web/lib/security/csp.test.ts`, control semanal de cabeceras | `web/proxy.ts`, `web/next.config.ts` |
| RNF03 | — | `web/lib/security/blocklist.test.ts` | Validación Zod en `web/app/*/page.tsx` |
| RNF04 | Todos | `web/e2e/a11y.spec.ts` | `web/app/globals.css` |
| RNF05 | — | `web/e2e/a11y.spec.ts` (emula reducir movimiento) | `web/components/motion-provider.tsx` |
| RNF06 | CU8 | `.github/workflows/health.yml` | `web/app/api/health/route.ts` |
| RNF07 | — | `web/e2e/a11y.spec.ts` (sin desplazamiento horizontal) | `web/app/globals.css` |
| RNF08 | CU9 | `supabase/tests/database/security.test.sql` (prueba 7) | `api` sin vistas de `play_by_play_event` ni `shot` |
| RNF09 | — | `scripts/backup.py --verify` (4-nov-2026) | `scripts/backup.py`, `.github/workflows/backup.yml` |
| RNF10 | Todos | Capturas de `web/scripts/capturas.ts` | `web/styles/tokens.css`, `web/app/globals.css` |
