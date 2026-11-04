# Diagrama entidad-relación

Dos esquemas, como en Pelotheta fútbol: `core` (privado, con RLS, solo lo escribe el pipeline con la
clave secreta) y `api` (vistas `security_invoker` que lee la web con la clave publicable). Columnas
completas y tipos en `docs/diccionario_datos.md`.

## Esquema privado `core`

```mermaid
erDiagram
  competition ||--o{ season : tiene
  season ||--o{ game : agrupa
  team ||--o{ game : "juega de local"
  team ||--o{ game : "juega de visitante"
  game ||--o{ game_period_score : "parciales por cuarto"
  game ||--o{ team_game_stats : "box score de equipo"
  game ||--o{ player_game_stats : "box score de jugador"
  player ||--o{ player_game_stats : registra
  team ||--o{ player_game_stats : "juega para"
  game ||--o{ play_by_play_event : "play-by-play (crudo, no público)"
  player ||--o{ play_by_play_event : protagoniza
  game ||--o{ shot : "tiros (crudo, no público)"
  player ||--o{ shot : lanza
  game ||--o{ game_referee : dirigen
  referee ||--o{ game_referee : arbitra
  game ||--|| team_game_derived : "derivadas por partido"
  stat_catalog ||--o{ stat_value : "valor de temporada"
  stat_catalog ||--o{ stat_set_item : "forma parte de"
  stat_set ||--o{ stat_set_item : contiene
  chart_catalog ||--o{ chart_source_map : "lleva a su origen"
  situational_catalog ||--o{ situational_result : "filas de la tarjeta"
  situational_catalog ||--o{ situational_match : "partidos de cada fila"
  game ||--o{ situational_match : cumple

  competition {
    smallint competition_id PK
    text code
    text name_es
  }
  season {
    int season_id PK
    smallint competition_id FK
    text name_es
  }
  team {
    int team_id PK
    text name
    bool is_boca
  }
  game {
    int game_id PK
    int season_id FK
    date game_date
    int home_team_id FK
    int away_team_id FK
    smallint home_points
    smallint away_points
  }
  game_period_score {
    int game_id PK
    smallint period PK
    smallint home_points
    smallint away_points
  }
  team_game_stats {
    int game_id PK
    int team_id PK
    smallint pts
  }
  player {
    int player_id PK
    text full_name
    date birth_date "no se expone a anon"
    text position_raw
  }
  player_game_stats {
    int game_id PK
    int player_id PK
    int team_id FK
    bool started
    int seconds
    smallint pts
  }
  play_by_play_event {
    int game_id PK
    int seq PK
    int player_id FK
    text event_type
  }
  shot {
    bigint shot_id PK
    int game_id FK
    int player_id FK
    numeric x_pct
    numeric y_pct
  }
  referee {
    int referee_id PK
    text name
  }
  game_referee {
    int game_id PK
    int referee_id PK
  }
  team_game_derived {
    int game_id PK
    jsonb stats
  }
  stat_catalog {
    text stat_id PK
    text entity
    char level "A, B o C"
    text rule
  }
  stat_value {
    text entity PK
    int entity_id PK
    text stat_id PK
    numeric value
  }
  stat_set {
    text set_id PK
    text entity
  }
  stat_set_item {
    text set_id PK
    text stat_id PK
  }
  chart_catalog {
    text chart_id PK
    bool available
  }
  chart_source_map {
    text chart_id PK
    text target_type PK
  }
  situational_catalog {
    text card_id PK
    text category
  }
  situational_result {
    text card_id PK
    text param_value PK
    int n
    numeric win_pct
  }
  situational_match {
    text card_id PK
    text param_value PK
    int match_id PK
  }
```

Tablas sin relaciones (operación): `ingest_log` (cada corrida con inicio, fin, filas y tamaño de la
base), `audit_log` (SHA del commit, tablas tocadas y hashes de entrada), `system_status`,
`source_id_map` (ids de cada fuente) y `boca_lineup` (quintetos). `situ_base` es una vista
materializada con una fila por partido de Boca, base de las Situaciones.

## Esquema público `api` (vistas)

```mermaid
flowchart LR
  subgraph core
    G[game] --- PGS[player_game_stats] --- P[player]
    SC[stat_catalog] --- SV[stat_value]
    SITU[situational_*]
    CH[chart_catalog / chart_source_map]
  end
  subgraph api
    boca_game
    league_game
    game_line
    game_period
    player_summary
    player_bio
    player_stat
    team_stat
    stat_catalog_v[stat_catalog]
    stat_set_column
    situational_catalog
    situational_result
    situational_match
    chart_catalog_v[chart_catalog]
    chart_source_map_v[chart_source_map]
    stat_match_series
    system_status
    v_last_update
    ingest_history
    boca_lineup
  end
  G --> boca_game & league_game & game_period
  PGS --> game_line & player_summary
  P --> player_bio
  SV --> player_stat & team_stat
  SC --> stat_catalog_v & stat_set_column
  SITU --> situational_catalog & situational_result & situational_match
  CH --> chart_catalog_v & chart_source_map_v
  PGS --> stat_match_series
```

## Modelo estrella de Power BI

```mermaid
erDiagram
  dim_player ||--o{ fact_player_stat : ""
  dim_stat ||--o{ fact_player_stat : ""
  dim_competition ||--o{ fact_player_stat : ""
  dim_player ||--o{ fact_player_minutes : ""
  dim_stat ||--o{ dim_stat_set : "ambas direcciones"
  dim_stat ||--o{ stat_distribution : ""
  dim_date ||--o{ fact_match : ""
  dim_team ||--o{ fact_match : rival
  dim_team ||--o{ fact_team_season : ""
  fact_match ||--o{ fact_team_match_stat : ""
  fact_match ||--o{ fact_match_period : ""
  fact_match ||--o{ fact_stat_match_value : ""
  fact_match ||--o{ fact_table_position : ""
  dim_chart ||--o{ chart_source_map : ""
  dim_player {
    int player_id PK
    text zona
    text posicion
  }
  dim_stat {
    text stat_id PK
    text grupo
    text nivel
  }
  fact_player_stat {
    int player_id FK
    text stat_id FK
    float valor
    float valor_36
    float percentil
  }
  fact_match {
    int match_id PK
    date fecha
    text rival
  }
```

`stat_correlation`, `fact_situational` y las tablas calculadas (`Eje X`, `Eje Y`, `Mínimo de
minutos`) no se relacionan: se filtran con sus propias columnas (ver `docs/powerbi_guia.md`).
