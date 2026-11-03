# README temporal: estado del proyecto

Registro vivo: dónde estamos, qué falta, qué quedó a medias. Actualizado el 3-nov-2026.
Para retomar en un chat nuevo: leer este archivo, `../PROMPT-2-BOCA-BASQUET.md` y `docs/source_audit.md`.

## Etapas (sección 3.1 del prompt)

| Etapa | Estado |
|---|---|
| 1. Preparación | En curso: Fase 0, Supabase y repo hechos; falta el deploy en Vercel |
| 2 a 11 | Pendientes |

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

1. **GitHub Secrets** (Settings → Secrets and variables → Actions) para la etapa 3: `SUPABASE_URL` (termina en `.supabase.co`) y `SUPABASE_SECRET_KEY` (panel de Supabase → Project Settings → API Keys → Secret keys). No la pegues en el chat.
2. Confirmar que la URL de Vercel abre y muestra «etapa: 1 - Preparación».

## Próxima etapa (2: esqueleto desplegado)

Skills a usar: `impeccable` (`shape`, `colorize`, `typeset`), `design:design-system`, `anthropic-skills:design-library`, `framer-motion`, y al cierre `impeccable` (`audit`, `polish`). Todas las invoca el agente.
