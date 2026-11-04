# Recuperación ante desastres (16.5)

Qué hacer si se pierde la máquina, el proyecto de Supabase o el despliegue, y cuánto tarda volver.

## Qué hay y dónde

| Pieza | Dónde vive | Se recupera desde |
|---|---|---|
| Código, migraciones, catálogos, documentación | GitHub | `git clone` |
| Datos de partidos y estadísticas | Supabase (`core`) | El pipeline los vuelve a calcular desde la LNB (toda la liga, con la caché vacía, algo menos de una hora); el backup cifrado mensual (`backup.yml`, artefacto de 90 días) guarda todo lo publicado aunque una fuente desaparezca |
| Libros de Excel y CSV de Power BI | Bucket `exports` | Se regeneran con `pipeline.excel` y `pipeline.powerbi --upload` |
| Sitio | Vercel (conectado al repositorio) | Un push a `main`, o «Redeploy» en Vercel |
| Claves | GitHub Secrets, Vercel y el `.env` del dueño | Se rotan y se vuelven a cargar (ver `docs/security/access_review.md`) |

## Objetivos

- **RPO (cuántos datos se pueden perder):** ninguno de lo que todavía publican las fuentes, porque se vuelve
  a calcular; de lo publicado, como mucho un mes (el último backup cifrado).
- **RTO (cuánto tarda volver):** objetivo de 2 horas con el proyecto de Supabase en pie y de 4 horas si hay
  que crear uno nuevo.

## Procedimiento

1. **Máquina nueva:** `git clone`, copiar `.env.example` a `.env` y `web/.env.example` a `web/.env.local`, y
   completarlos (las claves salen de Supabase → Settings → API Keys).
2. **Proyecto de Supabase nuevo, si hace falta:** crearlo en la misma región, aplicar las migraciones con
   `npx supabase link --project-ref <ref>` y `npx supabase db push` (incluye el bucket `exports`),
   deshabilitar el registro en Auth y revisar el Security Advisor: 0 ERROR y 0 WARN.
3. **Datos:** `uv sync`, `uv run --env-file .env python -m pipeline.run --liga`, `... pipeline.load`,
   `... pipeline.excel` y `... pipeline.powerbi --upload`; `cd web && corepack pnpm install && pnpm build`.
4. **Sitio:** actualizar en Vercel las dos variables públicas si cambió el proyecto y volver a desplegar.
   Actualizar los secretos de GitHub (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`).
5. **Verificar:** `/api/health` responde `ok`, `/actualizar` muestra la corrida nueva y `pnpm e2e` contra
   producción (`E2E_BASE_URL=https://pelotheta-basket-dva.vercel.app pnpm e2e`) da todo en verde.

## Simulacros

| Fecha | Alcance | Resultado | Tiempo |
|---|---|---|---|
| 4-nov-2026 | Backup cifrado de las 20 vistas y restauración de prueba (`scripts/backup.py --verify`) | 8.502 filas restauradas y verificadas contra el manifiesto | 3 s |
| 4-nov-2026 | Pasos 3 (libro y CSV) y 5 contra la base en pie | Libro de 249 KB y 19 CSV regenerados; `/api/health` en `ok` | 2 min |

La clave privada del backup está en la máquina del dueño (`~/.pelotheta-basquet/backup-age.key`). Sin ella, los
backups no se pueden abrir: guardala también fuera de esa máquina.
