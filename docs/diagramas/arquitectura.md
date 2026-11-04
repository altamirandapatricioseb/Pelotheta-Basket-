# Arquitectura, despliegue, red y linaje

La misma arquitectura que Pelotheta fútbol (sistema madre), con las fuentes del básquet.

## C4: contexto

```mermaid
flowchart LR
    V([Visitante: hincha, periodista, reclutador])
    A([Analista con Excel o Power BI])
    D([Dueño-administrador])
    P[[Pelotheta Θ básquet]]
    F[(Fuentes externas: Liga Nacional de Básquet, Wikipedia; SportScore y TheSportsDB para validar)]
    V -- navega, exporta --> P
    A -- descarga el libro y los CSV, consulta la API --> P
    D -- corre el workflow, despliega, revisa /actualizar --> P
    P -- scraping educado y APIs --> F
```

## C4: contenedores

```mermaid
flowchart TB
    subgraph Vercel
        W[Web Next.js 16: 6 interfaces, desglosada, partido, jugador, privacidad]
        H[/api/health, /api/ultima-actualizacion y /api/revalidar/]
    end
    subgraph GitHub
        R[Repositorio]
        WF[Actions: update mensual, keepalive, salud, seguridad semanal, backup, CI, CodeQL]
    end
    subgraph Supabase
        API[Data API PostgREST: esquemas api e ingest]
        DB[(Postgres: core con RLS)]
        ST[(Storage: bucket exports)]
    end
    PL[Pipeline Python: sources y pipeline]
    W -- lectura con clave publicable --> API
    WF -- corre --> PL
    PL -- clave secreta, rpc ingest --> API
    API --> DB
    PL -- xlsx y CSV --> ST
    PL -- POST con secreto --> H
    W -- enlaces de descarga --> ST
    R -- push a main --> Vercel
```

## Despliegue

```mermaid
flowchart LR
    Dev[Máquina del dueño] -- git push --> GH[GitHub main]
    GH -- integración --> VP[Vercel: build y deploy]
    VP --> Prod[pelotheta-basket-dva.vercel.app]
    GH -- cron mensual y botón Run workflow --> GA[GitHub Actions ubuntu-latest]
    GA -- HTTPS 443 --> SB[Supabase: proyecto gratuito jztmmfdkbajdrmzilxlt]
    Prod -- HTTPS 443 --> SB
```

## Red

```mermaid
flowchart LR
    U[Navegador, IPv4 o IPv6] -- DNS: pelotheta-basket-dva.vercel.app --> DNS[(DNS de Vercel)]
    U -- TCP 443, TLS 1.2 o 1.3 --> EDGE[Red de borde anycast de Vercel]
    EDGE -- interno --> FN[Funciones de Next.js]
    FN -- TCP 443, TLS, inicia la función --> SBAPI[Supabase: *.supabase.co detrás de su CDN]
    SBAPI -- interno --> PG[(Postgres 5432, sin acceso público directo)]
    GHA[GitHub Actions] -- TCP 443, inicia el runner --> SBAPI
    GHA -- TCP 443 --> LNB[laliganacional.com.ar]
    PBI[Power BI Desktop] -. opcional: pooler de sesión 5432 con powerbi_reader, hoy sin login .-> PG
```

Todas las conexiones salen del cliente hacia el servidor: ni Vercel ni Supabase abren conexiones hacia
la máquina del dueño. La conexión directa a Postgres es solo IPv6; Vercel y Actions usan IPv4, por eso
todo va por la Data API (HTTPS) o por el pooler. Dominio propio en `docs/red/dominio.md`.

## Linaje de datos

```mermaid
flowchart LR
    S[Fuente: LNB, box score y play-by-play de cada partido] --> RAW[Crudo: data/raw, caché y manifiesto]
    RAW --> VAL[Validación: pydantic y conciliación del play-by-play con el box score]
    VAL --> Q[Cuarentena: data/quarantine]
    VAL --> CORE[core.game, core.player_game_stats, core.play_by_play_event]
    CORE --> DER[Derivadas del pipeline: core.stat_value, core.team_game_derived]
    DER --> VW[Vistas: api.player_stat, api.stat_match_series]
    VW --> G[Gráfico: ranking del plantel en la landing]
    VW --> X[Excel: Tabla maestra y Desglosada]
    VW --> PB[Power BI: fact_player_stat y fact_stat_match_value]
```
