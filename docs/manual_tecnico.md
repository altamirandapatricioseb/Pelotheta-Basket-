# Manual técnico y de operación

## Arquitectura en una línea

Pipeline en Python (GitHub Actions, mensual) → Postgres de Supabase (`core` privado con RLS, `api` de
lectura) → web en Next.js 16 en Vercel, más el libro de Excel y los CSV de Power BI en el bucket
`exports`. Es la misma arquitectura que Pelotheta fútbol. Diagramas en `docs/diagramas/`; decisiones en
`docs/adr/`.

## Entorno local

```bash
uv sync                                                        # Python 3.13 y dependencias
cd web && corepack pnpm@10.34.9 install && cd ..               # web
just dev                                                       # web en http://localhost:3000
uv run --env-file .env python -m pipeline.run --liga           # scraping de toda la liga y tablas de temporada
uv run --env-file .env python -m pipeline.load                 # carga en Supabase y revalidación
uv run --env-file .env python -m pipeline.excel --out salida   # libro de Excel (sin --out lo sube)
uv run --env-file .env python -m pipeline.powerbi --upload     # CSV de Power BI
just test                                                      # pytest y Vitest
cd web && pnpm e2e                                             # Playwright: accesibilidad y responsive
just docs                                                      # diccionario, glosario y PDF de entrega
```

## Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `SUPABASE_URL` | `.env`, GitHub Secrets | Proyecto de Supabase del pipeline |
| `SUPABASE_SECRET_KEY` | `.env`, GitHub Secrets | Carga del pipeline, Excel, Power BI, backup y diccionario. Nunca en la web |
| `SUPABASE_PUBLISHABLE_KEY` | `.env`, GitHub Secrets | Keepalive, test de RLS y control semanal (es pública) |
| `REVALIDATE_SECRET` | `.env`, GitHub Secrets, Vercel | El pipeline vacía la caché de la web al terminar (`/api/revalidar`) |
| `SITE_URL` | `.env`, workflow | Sitio a revalidar |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `web/.env.local`, Vercel | Lectura de la web |
| `E2E_BASE_URL` | Opcional | Correr Playwright contra otro sitio |

## Cómo agregar…

**Una estadística.** Una fila en `data/stat_catalog.csv` (id, nombre, abreviatura, descripción, cómo
leerla, grupo, entidad, unidad, fuente, nivel, fórmula, más es mejor, por 36, regla de agregación y sus
argumentos). Si es de jugador y se puede ver por partido, su clave en `core.player_game_values` (o un alias
en `core.player_stat_alias`). Su cálculo de temporada va en `pipeline/` (`metrics.py`, `own_metrics.py`,
`tactics.py` o `season.py`). `tests/test_catalog.py` valida el CSV. La web, el libro y Power BI la toman en
la próxima carga.

**Un gráfico.** Una fila en `data/chart_catalog.csv` (y su origen en `data/chart_source_map.csv`) y su
dibujo en `web/components/charts/definitions.tsx`. `tests/test_chart_catalog.py` controla que cada
gráfico tenga su fila y que su origen exista.

**Una tarjeta de situaciones.** Una fila en `data/situational_catalog.csv` y su consulta en el marco que
corresponda de `sql/situational/` (con su migración). `tests/test_situations.py` valida el catálogo.

**Una fuente.** Un adaptador en `sources/` que use el cliente HTTP educado (`sources/http_client.py`:
pausa, robots.txt, caché y manifiesto), con funciones puras de parseo y su test con una respuesta
guardada en `tests/fixtures/`; la fila en `docs/source_audit.md` y en
`docs/security/compliance_register.md`. Si el sitio desafía a clientes automáticos, no se evade (ADR
0008).

**Una hoja o un gráfico del Excel.** En `pipeline/excel.py` (`build`), con su prueba en
`tests/test_excel.py`.

## Runbooks

**Carga fallida.** 1. Abrir la corrida en Actions (el resumen dice qué paso falló). 2. Si es la LNB: lo
ya cargado sigue; corregir el adaptador y volver a correr. 3. Si es la base: ver «Supabase pausado». 4.
Volver a correr: la carga es idempotente.

**Supabase pausado.** Panel de Supabase → Restore project; `/api/health` vuelve a `ok`; correr
`keepalive.yml` a mano. El keepalive corre dos veces por semana para que no pase.

**Rotar claves.** Supabase → Settings → API Keys: crear una clave secreta nueva, cargarla en GitHub Secrets
y `.env`, correr una carga de prueba y revocar la vieja. Para la publicable: crear la nueva, actualizar
Vercel, GitHub Secrets y el valor por defecto de `keepalive.yml`, y redesplegar.

**Restaurar el backup.** Descargar el artefacto `backup-cifrado` de la corrida de `backup.yml` y correr
`just backup --verify <archivo>` (usa `~/.pelotheta-basquet/backup-age.key`). Los JSON descifrados son las
vistas de `api`; para reconstruir la base desde cero, aplicar `supabase/migrations/` y correr el pipeline
(`docs/recuperacion.md`).

**Rollback de la web.** Vercel → Deployments → el deploy anterior → «Promote to Production». Si el
problema está en una migración, escribir una migración nueva que la revierta (nunca editar una aplicada).

**Caché vieja en desarrollo.** Si `next dev` muestra datos viejos, borrar `web/.next/dev/cache/fetch-cache`
y reiniciar el servidor.
