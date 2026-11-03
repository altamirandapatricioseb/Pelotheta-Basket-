# README temporal: estado del proyecto

Registro vivo: dónde estamos, qué falta, qué quedó a medias. Actualizado el 3-nov-2026.
Para retomar en un chat nuevo: leer este archivo, `../PROMPT-2-BOCA-BASQUET.md` y `docs/source_audit.md`.

## Etapas (sección 3.1 del prompt)

| Etapa | Estado |
|---|---|
| 1. Preparación | En curso: Fase 0, Supabase y repo hechos; falta el deploy en Vercel (el dueño lo hace más adelante) |
| 3. Pipeline | En curso en local (se adelantó por pedido del dueño): adaptador LNB, validación del play-by-play y salida a CSV; falta la carga en Supabase, los workflows y la Interfaz 6 |
| 2 y 4 a 11 | Pendientes |

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
