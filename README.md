# Pelotheta Θ · Básquet

Sistema de análisis de datos de **Boca Juniors básquet** (Liga Nacional de Básquet, Argentina): pipeline en Python, base PostgreSQL en Supabase, web en Next.js desplegada en Vercel, exportación a Excel y modelo para Power BI. Proyecto de portfolio, sin fines comerciales.

Estado: **etapa 1 (preparación)**. El avance por etapas, cómo probar y los próximos pasos están en [README_TEMPORAL.md](README_TEMPORAL.md).

## Fuentes

La fuente principal es el sitio oficial de la LNB (box score, play-by-play y mapa de tiro). SportScore y TheSportsDB validan marcadores. Qué trae cada fuente, qué permite y qué se descartó: [docs/source_audit.md](docs/source_audit.md). El sitio publica solo estadísticas derivadas, con atribución; nunca el play-by-play crudo.

## Cómo correrlo en local

```bash
uv sync
uv run pytest -q
cd web && corepack pnpm@10.34.9 install && corepack pnpm@10.34.9 dev
```

Variables: copiá `.env.example` a `.env` y `web/.env.example` a `web/.env.local`. Las claves secretas nunca van al repositorio.

## Licencia

Código bajo licencia MIT ([LICENSE](LICENSE)). Los datos de terceros conservan sus licencias y términos.
