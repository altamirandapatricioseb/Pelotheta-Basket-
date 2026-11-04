# Tareas habituales. Requiere `just` (https://github.com/casey/just), uv y Node 24 con Corepack.
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

pnpm := "corepack pnpm@10.34.9"

# Levanta la web en modo desarrollo
dev:
    cd web; {{pnpm}} dev

# Todas las pruebas (Python y web)
test:
    uv run pytest -q
    cd web; {{pnpm}} test

# Lint y formato
lint:
    uv run ruff check sources tests scripts
    cd web; {{pnpm}} lint

# Pipeline de datos (etapa 3)
pipeline:
    uv run python -m pipeline.run

# Escaneos de seguridad locales
security:
    uv run ruff check --select S sources scripts
    cd web; {{pnpm}} audit --audit-level high --prod

# Regenera los tipos de la base (requiere `supabase login`)
types:
    npx supabase gen types typescript --project-id jztmmfdkbajdrmzilxlt --schema api > web/lib/database.types.ts

# Backup cifrado local de las vistas de api (14.2); --verify <archivo> para probar la restauración
backup *args:
    uv run --env-file .env --with pyrage==1.2.5 python -m scripts.backup {{args}}

# Diccionario, glosario y PDF único de entrega (sección 15)
docs:
    uv run --env-file .env python -m scripts.diccionario
    uv run --with mistune==3.1.4 python -m scripts.entrega
    cd web; node scripts/pdf.ts

# Sonda de la Fase 0 de una fuente, por ejemplo: just probe api_football
probe source:
    uv run python -m scripts.phase0.probe_{{source}}
