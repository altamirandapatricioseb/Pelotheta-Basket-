# Diagramas de secuencia

## Carga de una página con datos

```mermaid
sequenceDiagram
    autonumber
    actor V as Visitante
    participant B as Navegador
    participant E as Borde de Vercel
    participant P as Proxy (proxy.ts)
    participant F as Función de Next.js
    participant C as Caché de datos (6 h)
    participant S as Supabase Data API
    participant DB as Postgres (RLS)
    V->>B: abre /jugadores
    B->>E: GET /jugadores (HTTPS, TLS 1.3)
    E->>P: request
    P->>P: ¿sonda de escáner? no · nonce nuevo y CSP
    P->>F: request con x-nonce
    F->>C: ¿player_stat en caché?
    alt en caché
        C-->>F: filas
    else vencida
        F->>S: GET /rest/v1/player_stat (clave publicable, Accept-Profile api, de a 1000 filas)
        S->>DB: SELECT como anon (statement_timeout propio)
        DB-->>S: filas que la RLS permite
        S-->>F: JSON
        F->>C: guarda con la etiqueta de datos
    end
    F-->>E: HTML con scripts firmados por el nonce
    E-->>B: 200 con CSP, HSTS, nosniff y COOP
    B->>B: hidrata y monta los gráficos al acercarse
```

## Corrida del workflow mensual

```mermaid
sequenceDiagram
    autonumber
    participant GH as GitHub Actions
    participant PL as Pipeline (Python)
    participant LNB as Liga Nacional
    participant S as Supabase (clave secreta)
    participant V as Vercel
    participant ST as Storage exports
    GH->>PL: python -m pipeline.run --liga
    loop cada partido nuevo, con pausa y caché
        PL->>LNB: GET (cliente educado, manifiesto)
        LNB-->>PL: HTML con box score, cuartos y play-by-play
    end
    PL->>PL: validación, conciliación y cuarentena
    PL->>PL: tablas de temporada y métricas
    GH->>PL: python -m pipeline.load
    PL->>S: rpc ingest.load_batch, load_charts y load_situations
    PL->>V: POST /api/revalidar con el secreto
    GH->>PL: python -m pipeline.excel y pipeline.powerbi --upload
    PL->>S: lee las vistas api (incluida stat_match_series)
    PL->>ST: pelotheta-basquet.xlsx y CSV de Power BI
```

## Exportación a Excel

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant W as Web
    participant ST as Storage exports
    participant X as lib/export/xlsx.ts (navegador)
    alt libro completo del pipeline
        U->>W: Descargar Excel
        W->>ST: enlace público del libro (xlsxwriter, gráficos nativos)
        ST-->>U: pelotheta-basquet.xlsx
    else vista actual
        U->>W: Descargar Excel en una tabla o en Comparar
        W->>X: filas, columnas visibles y orden
        X-->>U: xlsx armado en el navegador (sin tocar el servidor)
    end
```
