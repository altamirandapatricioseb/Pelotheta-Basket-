# README temporal: estado del proyecto

Registro vivo: dónde estamos, qué falta, qué quedó a medias. Actualizado el 3-nov-2026.
Para retomar en un chat nuevo: leer este archivo, `../PROMPT-2-BOCA-BASQUET.md` y `docs/source_audit.md`.

## Etapas (sección 3.1 del prompt)

| Etapa | Estado |
|---|---|
| 1. Preparación | Hecha: Fase 0, Supabase con RLS, Vercel (`pelotheta-basket-dva.vercel.app`) y GitHub |
| 2. Esqueleto | Hecha: header de 6 interfaces, tokens, tema claro y oscuro. **3-nov:** paleta, tokens y CSS copiados de Pelotheta fútbol (sistema madre, decisión del dueño): verde #64cc4f, violeta como secundario permitido, sin #b2e05b |
| 3. Pipeline | Hecha: adaptador LNB (toda la liga: 49 box scores, 38 play-by-play validados), plantel de Wikipedia, fichas de la LNB, carga en Supabase, workflows, revalidación e **Interfaz 6** (`/actualizar`) |
| 4. Estadísticas | **Hecha** (3-nov): 273 estadísticas en el catálogo con las columnas de fútbol (abreviatura, cómo leerla, regla de agregación, por 36). Equipo igual que fútbol: 15 categorías y vistas por partido, rival, mes, competición y acumulada (tarjetas con línea partido a partido); Jugadores igual que fútbol: 21 categorías, filtros de posición y minutos, cada 36, barras de percentil y personalizado. Detalle de partido y de jugador |
| 5. Gráficos (Interfaz 1) | **Hecha** (3-nov), igual que fútbol: landing en `/` con **76 gráficos en 13 categorías (A a M, numerados como 9.2.1), 73 con datos reales**. Barra de categorías que sigue el scroll, filtros de competición y localía, 3 o 4 números destacados por sección, tabla equivalente, PNG, datos en CSV y «Ver origen de los datos» (9.9). Sin datos, con motivo: 25 mapa de tiros (no se republican las coordenadas crudas; el reparto por zona está en el 26), 59 árbitros (la carga todavía no los lee) y 76 temporada anterior (no se carga, decisión del dueño). `data/chart_catalog.csv`, `data/chart_source_map.csv`, migración 1600 y `tests/test_chart_catalog.py` (sin enlaces rotos) |
| 6 a 11 | Pendientes. Siguiente: etapa 6, Situaciones y estadística desglosada (como fútbol) |

## Deploy y primera carga (3-nov-2026)

- **URL: https://pelotheta-basket-dva.vercel.app** (proyecto `pelotheta-basket-dva`, Root Directory `web`).
- `pelotheta-basket` (sin `-dva`) es la otra importación del mismo repo: se puede borrar desde Vercel.
- Supabase: migraciones 1 a 8 aplicadas. Security Advisor: 0 ERROR (4 INFO intencionales). `test_rls.py` 9 de 9 contra la base real.
- **Primera carga hecha** el 3-nov desde la máquina del dueño: 49 partidos de la liga, 6 de Boca con box score, 144 líneas de jugador, 3233 jugadas, 796 tiros y 690 valores de estadística. Base: 12,85 MB de 500.
- Dos intentos fallaron antes y la base los frenó sin cargar nada: (1) la LNB publica los partidos programados con 0-0 y se tomaban como jugados (corregido en `sources/lnb.py`); (2) la Data API rechaza `DELETE` sin `WHERE` (corregido en la migración 7). Después se corrigió la fecha de los partidos nocturnos, que quedaba en el día UTC siguiente (migración 9).
- Verificado en local con los datos cargados: Jugadores (10 categorías) y Equipo (4 categorías) con valores, descripciones y `n/d`; consola sin errores.

## Pasos pendientes del dueño

1. **Vercel** (proyecto `pelotheta-basket-dva`) → Settings → Environment Variables: `REVALIDATE_SECRET` = el valor de `REVALIDATE_SECRET` de tu `.env` local, tipo Sensitive, Production y Preview. Después, Redeploy.
2. **GitHub** → Settings → Secrets → Actions: `REVALIDATE_SECRET` con el mismo valor.
3. Hasta entonces la web puede tardar hasta 6 horas en mostrar los datos nuevos (caché). Para verlos ya: Vercel → proyecto → Settings → Caches → Purge Data Cache.

## Cómo cargar los datos

1. **Local:** `uv run python -m pipeline.run` y después `uv run --env-file .env python -m pipeline.load` (necesita `SUPABASE_SECRET_KEY` en `.env`).
2. **GitHub:** Actions → «Actualizar datos» → Run workflow (Secrets `SUPABASE_URL`, `SUPABASE_SECRET_KEY` y `REVALIDATE_SECRET`).

## Inventario de estadísticas (3-nov-2026)

`uv run python -m scripts.inventario` → `docs/inventario_estadisticas.md`. Hoy: 177 pedidas, 121 con datos (68,4 %), 43 calculables sin implementar, 7 esperando datos y 6 de nivel C.

## Etapa 4: cierre (3-nov-2026)

- Desde el play-by-play validado (`pipeline/tactics.py`): On/Off y NR con y sin cada jugador, EWA y ELA, 44 quintetos con minutos y NR, corridas, cambios de líder, minutos arriba y abajo, origen de los puntos (asistidos, triples, libres, segunda oportunidad), arranques y cierres de cuarto, clutch y tiempos muertos. Control: los minutos en cancha suman exactamente 5 × 40 × partidos.
- Sección 6.1 (`pipeline/projection.py`): las cinco fórmulas con los ejemplos del prompt reproducidos en tests. Índice de rendimiento calculado contra el plantel; Mejoría α y β y Potencial α y β `n/d` con su motivo (`docs/metricas_propias.md`).
- Pendiente para cuando haya datos: posición y edad de los jugadores (Wikipedia, Latinbasket) y box scores de toda la liga (`--liga`) para PER, Win Shares, BPM y percentiles contra la liga.

## Etapa 4: base (3-nov-2026)

- `pipeline/metrics.py`: fórmulas puras de 5.6 y 6 (tiro, posesiones, ratings, cuatro factores, USG%, AST%, ORB/DRB/TRB%, STL%, BLK%, Game Score, PIE, dobles, por 36, Elo, pitagórico calibrado, SRS, GB, rachas, Herfindahl, Jaccard, EWA, ELA). Toda división por cero da `n/d`.
- `pipeline/season.py` (corre al final de `pipeline.run`): `league_table`, `boca_game`, `boca_season` y `player_season` en `data/processed/`.
- `data/stat_catalog.csv`: 63 estadísticas con nivel A/B/C, fórmula y si están disponibles (PER, Win Shares y BPM quedan `n/d` hasta cargar los box scores de toda la liga con `--liga`).
- Control: Boca 95-83 Regatas da 77,82 posesiones, ORtg 122,08 y DRtg 106,66, igual que el cálculo a mano. Temporada: 3-3, 7.º, NR +4,3, SRS +3,8.
- Tests: 49 pasan (ejemplos a mano y propiedades con hypothesis).

## Etapa 2: qué está hecho (3-nov-2026)

- Reusado del fútbol: header fijo (se compacta al bajar, subrayado animado, menú de celular), botón de tema con cookie, número animado y la tabla «Resumen» con panel de contexto, orden por columna, búsqueda y navegación con teclado.
- Adaptado al básquet: tokens nuevos (#32B531, modo oscuro negro puro, sin violeta; contrastes AA verificados), columnas PJ, Tit., Min., PTS, REB, AST y VAL, «Cada 36 minutos», textura de media cancha de básquet y sin filtro de posición (la LNB no publica posiciones en el box score).
- `supabase/migrations/20261103000300_player_summary.sql`: vista `api.player_summary` (**no aplicada**: Supabase quedó para después).
- Verificado en local a 1280 px y 375 px: header completo, sin scroll horizontal, consola sin errores. `/jugadores` muestra el error controlado PEL-DB-001 porque la vista todavía no existe en la base.

## Etapa 3: qué está hecho (3-nov-2026)

- `sources/http_client.py` (reusado del fútbol): pausa de 3 s, caché, robots.txt y manifiesto con SHA-256.
- `sources/lnb.py`: fixture (JSON), box score, parciales, mapa de tiro con coordenadas y play-by-play, validados con pydantic.
- `pipeline/pbp.py`: reconstruye marcador, contadores, minutos y +/− desde las jugadas y los compara con el box score.
- `pipeline/run.py`: `uv run python -m pipeline.run [--desde] [--hasta] [--force] [--liga]`. Escribe `data/processed/*.csv` (no se versiona) y `data/last_run.json`.
- Primera corrida real: 6 partidos de Boca, 144 líneas de box score, 796 tiros y 3297 jugadas. Los 6 pasan la validación crítica; en los 6 faltan 1 o 2 faltas en las jugadas (ver `docs/source_audit.md`).
- Tests: 29 pasan (página sintética armada a mano + los 6 partidos reales de la caché local, que en CI se saltean).

Falta en la etapa 3: carga idempotente en Supabase (`pipeline/load.py`), workflows mensual y keepalive, `ingest_log` y la Interfaz 6. Se hace cuando el dueño retome Supabase.

## Etapa 1: qué está hecho

- **Fase 0** (`docs/source_audit.md`): la LNB oficial publica box score por jugador, play-by-play y mapa de tiro con coordenadas. Es la única fuente con estadísticas de la temporada 2026-27 (API-Basketball gratis solo cubre 2022-24).
- **Plan de skills** (`docs/skills_plan.md`), basado en el del proyecto de fútbol.
- **Supabase**: proyecto `pelotheta-basket` (ref `jztmmfdkbajdrmzilxlt`, sa-east-1, plan Free).
  Migraciones en `supabase/migrations/`: línea base de seguridad (esquema privado `core`, solo `api` expuesto, `public` cerrado, timeouts), modelo de básquet con RLS en las 16 tablas y vistas `api.system_status` y `api.v_last_update`.
- **Pruebas**: `tests/test_rls.py` pasa contra la base real (9 de 9: lee `api`, no llega a `core` ni a `public`, no inserta, no actualiza, no borra). Controles de `supabase/tests/database/security.test.sql` verificados por SQL.
- **Web**: Next.js con las cabeceras de seguridad y la CSP con nonce del proyecto de fútbol; la página de inicio lee la fila de prueba con la clave publicable. Typecheck, lint, 30 tests y build en verde en local, sin claves secretas en el bundle.

## Cierre de seguridad 14.9 (parcial)

- Security Advisor: 0 ERROR, 0 WARN, 4 INFO intencionales (`audit_log`, `play_by_play_event`, `shot` y `source_id_map` tienen RLS sin políticas: anon no ve ninguna fila).
- Cabeceras en la URL real: se verifican después del primer deploy.
- `risk_register.csv`: se crea al cerrar la etapa.

## Cómo probar

```bash
uv sync
SUPABASE_URL=https://jztmmfdkbajdrmzilxlt.supabase.co SUPABASE_PUBLISHABLE_KEY=<clave publicable> uv run pytest -q
```

## Pasos que necesitan al dueño

1. **Push** (un hook local bloquea `git push` al agente): `git push origin main` desde esta carpeta.
2. **Proyecto en Vercel** (el MCP no pudo crearlo; probablemente la app de Vercel en GitHub no ve el repo nuevo):
   vercel.com → Add New → Project → importar `Pelotheta-Basket-` (si no aparece: «Adjust GitHub App Permissions» y darle acceso al repo).
   Nombre `pelotheta-basket`, **Root Directory = `web`**, y en Environment Variables (Production y Preview):
   `NEXT_PUBLIC_SUPABASE_URL = https://jztmmfdkbajdrmzilxlt.supabase.co` y
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = <clave publicable sb_publishable_... del panel de Supabase>`. Deploy.
3. **GitHub Secrets** (Settings → Secrets and variables → Actions) para la etapa 3: `SUPABASE_URL` (termina en `.supabase.co`) y `SUPABASE_SECRET_KEY` (panel de Supabase → Project Settings → API Keys → Secret keys). No la pegues en el chat.
4. Avisar la URL de Vercel: el agente verifica que muestre «etapa: 1 - Preparación», las cabeceras de seguridad y la consola sin errores, y cierra la etapa 1.

## Notas

- Los nombres de las migraciones en el historial remoto de Supabase llevan el timestamp del MCP, no el de los archivos locales. Antes de usar `supabase db push` hay que alinear las versiones (`supabase migration repair`).

## Próxima etapa (2: esqueleto desplegado)

Skills a usar: `impeccable` (`shape`, `colorize`, `typeset`), `design:design-system`, `anthropic-skills:design-library`, `framer-motion`, y al cierre `impeccable` (`audit`, `polish`). Todas las invoca el agente.
