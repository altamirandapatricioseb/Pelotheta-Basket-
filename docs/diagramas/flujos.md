# Diagramas de flujo

## Carga mensual completa

```mermaid
flowchart TD
    A[workflow update.yml: cron mensual o Run workflow] --> B[pipeline.run --liga]
    B --> C[LNB: fixture de toda la liga y, por partido, box score, cuartos y play-by-play]
    C -- la fuente falla --> X1[Se conservan los partidos ya cargados; error en ingest_log] --> Z[Resumen de la corrida y /actualizar]
    C --> W[Wikipedia: plantel, posición y altura]
    W --> E{¿Cada fila pasa pydantic?}
    E -- no --> Q[Cuarentena en data/quarantine]
    E -- sí --> R{¿El play-by-play reconstruido cuadra con el box score?}
    R -- no --> QT[Partido en cuarentena: tácticas de 5.8 en n/d]
    R -- sí --> T[Tablas de temporada: métricas, propias, tácticas, Elo, 6.1]
    QT --> T
    T --> L[pipeline.load: load_batch idempotente, gráficos y situaciones]
    L --> S[refresh_situations en SQL]
    S --> V[Revalidación de la caché de la web]
    V --> X[pipeline.excel y pipeline.powerbi --upload al bucket exports]
    X --> Z
```

## Nivel A, B o C de una estadística

```mermaid
flowchart TD
    A[Estadística del catálogo] --> B{¿La fuente la publica directa?}
    B -- sí --> NA[Nivel A: viene de la LNB]
    B -- no --> C{¿Se puede calcular desde box score, play-by-play o fixture?}
    C -- sí --> D{¿El cálculo necesita un supuesto?}
    D -- no --> NB[Nivel B: calculada]
    D -- sí --> NBE[Nivel B estimada: se marca en la web]
    C -- no --> NC[Nivel C: n/d con el motivo]
```

## Mejoría α y β y Potencial α y β

```mermaid
flowchart TD
    A[Jugador y fecha] --> B{¿Edad y posición conocidas?}
    B -- no --> ND1[n/d]
    B -- sí --> C[Índice de rendimiento R: componentes con datos y pesos de su zona]
    C --> D{¿Cobertura de pesos suficiente?}
    D -- no --> ND2[R = n/d]
    D -- sí --> E[Ventanas: últimos partidos contra el resto, sin datos futuros]
    E --> F{¿Minutos mínimos en las dos ventanas?}
    F -- no --> ND3[Mejoría = n/d]
    F -- sí --> G[z de cada tasa, peso por minutos, Mejoría α = 50 + escala × w × Z]
    C --> H[Nivel N con reducción por muestra chica]
    H --> I[Potencial α = N + crecimiento hasta el pico ± margen]
    H --> J[Potencial β con R, tendencia y factor de edad]
```

## Doble clic a la estadística desglosada

```mermaid
flowchart LR
    A[Celda de Equipo o Jugadores, gráfico, tarjeta o fila de Comparar] -- doble clic o tecla D --> B[/estadistica/id con entidad e id/]
    B --> C[Ventanas, gráficos, partidos y relacionadas]
    C -- Volver --> D[Origen con sus filtros]
```

## Playbook: clave filtrada

```mermaid
flowchart TD
    A[Aviso: gitleaks, un tercero o el monitoreo] --> B{¿Qué clave?}
    B -- publicable --> P[Es pública por diseño: verificar con pgTAP y test_rls que siga sin escritura]
    B -- secreta de Supabase --> S1[Rotar en Supabase] --> S2[Actualizar GitHub Secrets y .env] --> S3[Revisar pg_stat_statements e ingest_log]
    B -- REVALIDATE_SECRET --> T1[Generar uno nuevo] --> T2[Actualizar Vercel y GitHub Secrets]
    S3 --> R[Registrar en risk_register.csv e incident_response.md]
    T2 --> R
    P --> R
```

## Ramas, previews y producción

```mermaid
flowchart LR
    A[Commit] --> B[CI: lint, tipos, pruebas, Semgrep, gitleaks, auditorías]
    B --> C[Preview de Vercel]
    C --> D[CodeQL en push y PR a main]
    D --> E[Push a main]
    E --> F[Deploy a producción en Vercel]
    F --> G[Salud cada 6 h y control semanal]
```
