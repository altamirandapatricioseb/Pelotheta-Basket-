# Diccionario de datos

Generado por `scripts/diccionario.py` desde la especificación de la API y el catálogo
de estadísticas.
20 vistas del esquema `api` y 275 estadísticas. Las vistas no declaran nulabilidad: toda columna puede venir vacía (n/d). Las tablas
privadas de `core` están en `docs/diagramas/der.md`.

## Vistas del esquema `api`

### `boca_game`

Partidos de Boca: fecha, localía, rival, puntos a favor y en contra y estadísticas del partido (JSON).

| Columna | Tipo | Nota |
|---|---|---|
| `game_id` | int32 | Note: This is a Primary Key.<pk/> |
| `game_date` | date |  |
| `tip_off_at` | timestamp with time zone |  |
| `is_home` | boolean |  |
| `opponent` | text |  |
| `points_for` | int32 |  |
| `points_against` | int32 |  |
| `stats` | jsonb |  |

### `boca_lineup`

Quintetos, tríos y duplas de Boca reconstruidos desde el play-by-play, con su muestra.

| Columna | Tipo | Nota |
|---|---|---|
| `lineup_key` | text | Note: This is a Primary Key.<pk/> |
| `players` | text |  |
| `stats` | jsonb |  |
| `small_sample` | boolean |  |

### `chart_catalog`

Catálogo de gráficos de la landing (9.2.1): categoría, tipo, disponibilidad en Power BI y Excel y motivo si no hay datos.

| Columna | Tipo | Nota |
|---|---|---|
| `chart_id` | text | Note: This is a Primary Key.<pk/> |
| `category` | text |  |
| `title_es` | text |  |
| `chart_type` | text |  |
| `required_data` | text |  |
| `origin_ref` | text |  |
| `powerbi` | text |  |
| `excel` | text |  |
| `available` | boolean |  |
| `reason_es` | text |  |
| `sort_order` | int32 |  |

### `chart_source_map`

Destino de «Ver origen de los datos» de cada gráfico (9.9).

| Columna | Tipo | Nota |
|---|---|---|
| `chart_id` | text | Note: This is a Primary Key.<pk/> This is a Foreign Key to `chart_catalog.chart_id`.<fk table='chart_catalog' column='chart_id'/> |
| `target_type` | text | Note: This is a Primary Key.<pk/> |
| `target_ref` | text | Note: This is a Primary Key.<pk/> |
| `params` | text | Note: This is a Primary Key.<pk/> |
| `label_es` | text |  |

### `game_line`

Box score por jugador de cada partido de la liga (sin play-by-play crudo).

| Columna | Tipo | Nota |
|---|---|---|
| `game_id` | int32 | Note: This is a Primary Key.<pk/> This is a Foreign Key to `boca_game.game_id`.<fk table='boca_game' column='game_id'/> |
| `game_date` | date |  |
| `team_id` | int32 |  |
| `team` | text |  |
| `is_boca` | boolean |  |
| `player_id` | int32 | Note: This is a Primary Key.<pk/> This is a Foreign Key to `player_bio.player_id`.<fk table='player_bio' column='player_id'/> |
| `player` | text |  |
| `shirt_number` | int32 |  |
| `started` | boolean |  |
| `minutes` | numeric |  |
| `pts` | int32 |  |
| `fg2m` | int32 |  |
| `fg2a` | int32 |  |
| `fg3m` | int32 |  |
| `fg3a` | int32 |  |
| `ftm` | int32 |  |
| `fta` | int32 |  |
| `orb` | int32 |  |
| `drb` | int32 |  |
| `reb` | int32 |  |
| `ast` | int32 |  |
| `stl` | int32 |  |
| `tov` | int32 |  |
| `blk` | int32 |  |
| `pf` | int32 |  |
| `pf_drawn` | int32 |  |
| `efficiency` | int32 |  |
| `plus_minus` | int32 |  |

### `game_period`

Puntos de Boca y del rival en cada cuarto de cada partido.

| Columna | Tipo | Nota |
|---|---|---|
| `game_id` | int32 | Note: This is a Primary Key.<pk/> This is a Foreign Key to `boca_game.game_id`.<fk table='boca_game' column='game_id'/> |
| `period` | int32 | Note: This is a Primary Key.<pk/> |
| `points_for` | int32 |  |
| `points_against` | int32 |  |

### `ingest_history`

Historial de cargas del pipeline (Interfaz 6): inicio, fin, estado, filas y partidos nuevos.

| Columna | Tipo | Nota |
|---|---|---|
| `started_at` | timestamp with time zone |  |
| `finished_at` | timestamp with time zone |  |
| `trigger` | text |  |
| `status` | text |  |
| `rows_loaded` | int32 |  |
| `games_added` | int32 |  |
| `duration_s` | int32 |  |
| `db_size_mb` | numeric |  |

### `league_game`

Resultados de todos los partidos de la liga (local, visitante y puntos).

| Columna | Tipo | Nota |
|---|---|---|
| `game_id` | int32 | Note: This is a Primary Key.<pk/> |
| `game_date` | date |  |
| `home` | text |  |
| `away` | text |  |
| `home_points` | int32 |  |
| `away_points` | int32 |  |

### `player_bio`

Ficha del plantel: nombre, posición, nacionalidad, altura y peso. Sin fecha de nacimiento.

| Columna | Tipo | Nota |
|---|---|---|
| `player_id` | int32 | Note: This is a Primary Key.<pk/> |
| `full_name` | text |  |
| `known_as` | text |  |
| `position_raw` | text |  |
| `nationality` | text |  |
| `height_cm` | int32 |  |
| `weight_kg` | int32 |  |

### `player_stat`

Valor de temporada de cada estadística de cada jugador de Boca (formato largo).

| Columna | Tipo | Nota |
|---|---|---|
| `player_id` | int32 |  |
| `full_name` | text |  |
| `stat_id` | text | Note: This is a Foreign Key to `stat_catalog.stat_id`.<fk table='stat_catalog' column='stat_id'/> |
| `value` | numeric |  |
| `is_estimated` | boolean |  |

### `player_summary`

Resumen del plantel de Boca: partidos, minutos, puntos, rebotes, asistencias y valoración.

| Columna | Tipo | Nota |
|---|---|---|
| `player_id` | int32 | Note: This is a Primary Key.<pk/> |
| `full_name` | text |  |
| `known_as` | text |  |
| `position_raw` | text |  |
| `height_cm` | int32 |  |
| `shirt_number` | int32 |  |
| `matches` | int32 |  |
| `starts` | int32 |  |
| `minutes` | int32 |  |
| `pts` | int32 |  |
| `reb` | int32 |  |
| `ast` | int32 |  |
| `efficiency` | int32 |  |

### `situational_catalog`

Catálogo de las tarjetas de Situaciones (9.6): marco, condición y datos que necesita.

| Columna | Tipo | Nota |
|---|---|---|
| `card_id` | text | Note: This is a Primary Key.<pk/> |
| `category` | text |  |
| `title_es` | text |  |
| `condition_es` | text |  |
| `params_es` | text |  |
| `measured_es` | text |  |
| `required_data` | text |  |
| `level` | text |  |
| `available` | boolean |  |
| `estimated` | boolean |  |
| `reason_es` | text |  |
| `sort_order` | int32 |  |
| `main_metric` | text |  |
| `extra_metrics` | text |  |

### `situational_match`

Partidos que cumplen cada fila de cada tarjeta de Situaciones («Ver los partidos»).

| Columna | Tipo | Nota |
|---|---|---|
| `card_id` | text | Note: This is a Primary Key.<pk/> |
| `param_value` | text | Note: This is a Primary Key.<pk/> |
| `match_id` | int32 | Note: This is a Primary Key.<pk/> This is a Foreign Key to `boca_game.game_id`.<fk table='boca_game' column='game_id'/> |
| `match_date` | date |  |
| `opponent` | text |  |
| `home` | boolean |  |
| `points_for` | int32 |  |
| `points_against` | int32 |  |
| `result` | text |  |

### `situational_result`

Resultado de cada fila de cada tarjeta: partidos, victorias, derrotas, % de victorias y diferencia contra la base.

| Columna | Tipo | Nota |
|---|---|---|
| `card_id` | text | Note: This is a Primary Key.<pk/> |
| `param_value` | text | Note: This is a Primary Key.<pk/> |
| `param_order` | int32 |  |
| `n` | int32 |  |
| `w` | int32 |  |
| `d` | int32 |  |
| `l` | int32 |  |
| `win_pct` | numeric |  |
| `pf_avg` | numeric |  |
| `pa_avg` | numeric |  |
| `margin` | numeric |  |
| `base_win_pct` | numeric |  |
| `delta` | numeric |  |
| `base_pf` | numeric |  |
| `base_pa` | numeric |  |
| `base_margin` | numeric |  |
| `stats` | jsonb |  |
| `base_stats` | jsonb |  |
| `computed_at` | timestamp with time zone |  |

### `stat_catalog`

Catálogo de estadísticas: nombre, descripción, cómo leerla, grupo, unidad, fuente, nivel A/B/C, fórmula y regla de agregación.

| Columna | Tipo | Nota |
|---|---|---|
| `stat_id` | text | Note: This is a Primary Key.<pk/> |
| `name_es` | text |  |
| `description_es` | text |  |
| `stat_group` | text |  |
| `entity` | text |  |
| `unit` | text |  |
| `source` | text |  |
| `level` | character |  |
| `formula` | text |  |
| `higher_is_better` | boolean |  |
| `available` | boolean |  |
| `short_name` | text |  |
| `reading_es` | text |  |
| `estimated` | boolean |  |
| `per_unit` | boolean |  |
| `rule` | text |  |
| `arg1` | text |  |
| `arg2` | text |  |
| `factor` | numeric |  |

### `stat_match_series`

Valor de cada estadística por partido (Boca y jugadores del plantel), con las reglas de api.stat_series.

| Columna | Tipo | Nota |
|---|---|---|
| `stat_id` | text |  |
| `entity` | text |  |
| `entity_id` | int32 |  |
| `match_id` | int32 |  |
| `match_date` | date |  |
| `value` | numeric |  |
| `num` | numeric |  |
| `den` | numeric |  |
| `factor` | numeric |  |

### `stat_set_column`

Columnas de cada conjunto de estadísticas (el desplegable de categoría de Equipo y Jugadores).

| Columna | Tipo | Nota |
|---|---|---|
| `set_id` | text | Note: This is a Primary Key.<pk/> |
| `entity` | text |  |
| `set_name` | text |  |
| `set_order` | int32 |  |
| `stat_id` | text | Note: This is a Foreign Key to `stat_catalog.stat_id`.<fk table='stat_catalog' column='stat_id'/> |
| `sort_order` | int32 |  |
| `scope` | text |  |

### `system_status`

Estado público del sistema. Fila de prueba de la etapa 1.

| Columna | Tipo | Nota |
|---|---|---|
| `key` | text | Note: This is a Primary Key.<pk/> |
| `value` | text |  |
| `updated_at` | timestamp with time zone |  |

### `team_stat`

Valor de temporada de cada estadística de cada equipo de la liga (formato largo).

| Columna | Tipo | Nota |
|---|---|---|
| `team_id` | int32 |  |
| `team` | text |  |
| `is_boca` | boolean |  |
| `stat_id` | text | Note: This is a Foreign Key to `stat_catalog.stat_id`.<fk table='stat_catalog' column='stat_id'/> |
| `value` | numeric |  |
| `is_estimated` | boolean |  |

### `v_last_update`

Última corrida y última carga exitosa: una fila global y una por fuente.

| Columna | Tipo | Nota |
|---|---|---|
| `source` | text |  |
| `is_global` | boolean |  |
| `trigger` | text |  |
| `last_status` | text |  |
| `last_run_started_at` | timestamp with time zone |  |
| `last_run_finished_at` | timestamp with time zone |  |
| `rows_loaded` | int32 |  |
| `games_added` | int32 |  |
| `duration_s` | int32 |  |
| `last_success_at` | timestamp with time zone |  |

## Estadísticas del catálogo

Nivel A: viene de una fuente. B: calculada desde datos crudos. C: sin dato (n/d). «Estimada»: el
cálculo usa un supuesto y la web lo marca.

| Id | Entidad | Nombre | Unidad | Fuente | Nivel | Estimada | Fórmula |
|---|---|---|---|---|---|---|---|
| `games` | jugador | Partidos jugados | partidos | lnb | B | no | Partidos con minutos > 0 |
| `starts` | jugador | Titularidades | partidos | lnb | A | no |  |
| `minutes` | jugador | Minutos | minutos | lnb | B | no | Σ minutos por partido |
| `pts` | jugador | Puntos | puntos | lnb | B | no | 2 × 2P + 3 × 3P + TL |
| `trb` | jugador | Rebotes | rebotes | lnb | B | no | ORB + DRB |
| `orb` | jugador | Rebotes ofensivos | rebotes | lnb | A | no |  |
| `drb` | jugador | Rebotes defensivos | rebotes | lnb | A | no |  |
| `ast` | jugador | Asistencias | asistencias | lnb | A | no |  |
| `stl` | jugador | Robos | robos | lnb | A | no |  |
| `blk` | jugador | Tapas | tapas | lnb | A | no |  |
| `tov` | jugador | Pérdidas | pérdidas | lnb | A | no |  |
| `pf` | jugador | Faltas cometidas | faltas | lnb | A | no |  |
| `fg_pct` | jugador | % de campo | % | lnb | B | no | FG / FGA |
| `fg3_pct` | jugador | % de triples | % | lnb | B | no | 3P / 3PA |
| `ft_pct` | jugador | % de libres | % | lnb | B | no | TL / TLI |
| `efg` | jugador | eFG% | % | lnb | B | no | (FG + 0,5 × 3P) / FGA |
| `ts` | jugador | TS% | % | lnb | B | no | PTS / (2 × (FGA + 0,44 × FTA)) |
| `points_per_shot` | jugador | Puntos por tiro de campo | puntos | lnb | B | no | (2 × (FG − 3P) + 3 × 3P) / FGA |
| `three_rate` | jugador | 3PAr | proporción | lnb | B | no | 3PA / FGA |
| `ft_rate` | jugador | FTr | proporción | lnb | B | no | FTA / FGA |
| `ast_to` | jugador | Asistencias por pérdida | proporción | lnb | B | no | AST / TOV |
| `tov_pct` | jugador | TOV% | % | lnb | B | no | 100 × TOV / (FGA + 0,44 × FTA + TOV) |
| `usg_pct` | jugador | USG% | % | lnb | B | no | 100 × ((FGA + 0,44 FTA + TOV) × MinEq/5) / (MP × (FGA_eq + 0,44 FTA_eq + TOV_eq)) |
| `ast_pct` | jugador | AST% | % | lnb | B | no | 100 × AST / ((MP / (MinEq/5)) × FG_eq − FG) |
| `orb_pct` | jugador | ORB% | % | lnb | B | no | 100 × (ORB × MinEq/5) / (MP × (ORB_eq + DRB_rival)) |
| `drb_pct` | jugador | DRB% | % | lnb | B | no | 100 × (DRB × MinEq/5) / (MP × (DRB_eq + ORB_rival)) |
| `trb_pct` | jugador | TRB% | % | lnb | B | no | 100 × (TRB × MinEq/5) / (MP × (TRB_eq + TRB_rival)) |
| `stl_pct` | jugador | STL% | % | lnb | B | no | 100 × (STL × MinEq/5) / (MP × Pos_rival) |
| `blk_pct` | jugador | BLK% | % | lnb | B | no | 100 × (BLK × MinEq/5) / (MP × 2PA_rival) |
| `game_score_avg` | jugador | Game Score medio | puntos | lnb | B | no | PTS + 0,4 FG − 0,7 FGA − 0,4 (FTA − FT) + 0,7 ORB + 0,3 DRB + STL + 0,7 AST + 0,7 BLK − 0,4 PF − TOV |
| `game_score_stdev` | jugador | Consistencia (desvío del Game Score) | puntos | lnb | B | no | Desvío estándar muestral |
| `pie` | jugador | PIE | proporción | lnb | B | no | Suma del jugador / misma suma de ambos equipos |
| `double_doubles` | jugador | Dobles-dobles | partidos | lnb | B | no | Conteo |
| `triple_doubles` | jugador | Triples-dobles | partidos | lnb | B | no | Conteo |
| `pts_per36` | jugador | Puntos cada 36 minutos | puntos | lnb | B | no | PTS × 36 / MP |
| `team_points_share` | jugador | % de los puntos del equipo | % | lnb | B | no | PTS / PTS_eq |
| `streak_10_pts` | jugador | Racha de 10 o más puntos | partidos | lnb | B | no | Racha máxima |
| `efficiency` | jugador | Valoración | puntos | lnb | A | no |  |
| `plus_minus` | jugador | +/− | puntos | lnb | A | no |  |
| `possessions` | equipo | Posesiones | posesiones | lnb | B | sí | 0,5 × (FGA + 0,44 FTA − ORB + TOV de ambos equipos) |
| `pace` | equipo | Ritmo | posesiones | lnb | B | sí | 40 × Pos / (MinEq/5) |
| `ortg` | equipo | ORtg | puntos | lnb | B | sí | 100 × PTS / Pos |
| `drtg` | equipo | DRtg | puntos | lnb | B | sí | 100 × PTS_rival / Pos |
| `net_rating` | equipo | Net Rating | puntos | lnb | B | sí | ORtg − DRtg |
| `mov` | equipo | MOV | puntos | lnb | B | no | (PF − PA) / PJ |
| `pyth_wins` | equipo | Victorias pitagóricas | victorias | lnb | B | no | PJ × PF^x / (PF^x + PA^x), x calibrado con la tabla |
| `srs` | equipo | SRS | puntos | lnb | B | no | MOV + SOS, iterado hasta converger |
| `sos` | equipo | SOS | puntos | lnb | B | no | Promedio del SRS de los rivales |
| `gb` | equipo | Partidos detrás del líder | partidos | lnb | B | no | ((W_líder − W) + (L − L_líder)) / 2 |
| `elo` | equipo | Elo | puntos | lnb | B | no | R + K × (S − E), K = 20, V = 100 |
| `elo_win_prob` | equipo | Probabilidad de ganar antes del partido | % | lnb | B | no | 1 / (1 + 10^((R_rival − R − V) / 400)) |
| `brier_mean` | equipo | Brier del Elo | puntos | lnb | B | no | Promedio de (p − resultado)² |
| `efg_against` | equipo | eFG% del rival | % | lnb | B | no | (FG + 0,5 × 3P) / FGA del rival |
| `orb_pct_team` | equipo | ORB% del equipo | % | lnb | B | no | ORB / (ORB + DRB_rival) |
| `ft_per_fga` | equipo | Libres por tiro de campo | proporción | lnb | B | no | FT / FGA |
| `scorer_herfindahl` | equipo | Concentración del ataque | índice | lnb | B | no | Σ (PTS_jugador / PTS_eq)² |
| `per` | jugador | PER | puntos | lnb | B | no | uPER × ritmo liga / ritmo equipo × 15 / aPER medio de la liga |
| `win_shares` | jugador | Win Shares | victorias | lnb | B | no | Metodología de Basketball-Reference (aproximación para la LNB) |
| `bpm` | jugador | BPM | puntos | lnb | B | no | Metodología de Basketball-Reference (aproximación para la LNB) |
| `play_types` | equipo | Tipos de jugada |  | n/d | C | no |  |
| `defensive_scheme` | equipo | Esquema defensivo |  | n/d | C | no |  |
| `contested_shots` | equipo | Tiros contestados |  | n/d | C | no |  |
| `media_rating` | jugador | Calificación de medios | puntos | n/d | C | no |  |
| `played` | equipo | Partidos jugados (equipo) | partidos | lnb | B | no | Conteo de resultados |
| `wins` | equipo | Victorias | partidos | lnb | B | no | Conteo de resultados |
| `losses` | equipo | Derrotas | partidos | lnb | B | no | Conteo de resultados |
| `win_pct` | equipo | % de victorias | % | lnb | B | no | W / PJ |
| `points_for_pg` | equipo | Puntos a favor por partido | puntos | lnb | B | no | PF / PJ |
| `points_against_pg` | equipo | Puntos en contra por partido | puntos | lnb | B | no | PA / PJ |
| `points_for` | equipo | Puntos a favor | puntos | lnb | A | no |  |
| `points_against` | equipo | Puntos en contra | puntos | lnb | A | no |  |
| `rest_days` | equipo | Días de descanso | días | lnb | B | no | Fecha del partido − fecha del anterior |
| `tov_pct_against` | equipo | TOV% del rival | % | lnb | B | no | 100 × TOV / (FGA + 0,44 × FTA + TOV) del rival |
| `orb_pct_against` | equipo | ORB% del rival | % | lnb | B | no | ORB_rival / (ORB_rival + DRB) |
| `ft_per_fga_against` | equipo | Libres por tiro del rival | proporción | lnb | B | no | FT / FGA del rival |
| `brier` | equipo | Brier del partido | puntos | lnb | B | no | (p − resultado)² |
| `possessions_on` | jugador | Posesiones en cancha | posesiones | lnb | B | sí | 0,5 × (FGA + 0,44 FTA − ORB + TOV) de los tramos con él en cancha |
| `ortg_on` | jugador | ORtg en cancha | puntos | lnb | B | sí | 100 × PTS_eq en cancha / Pos en cancha |
| `drtg_on` | jugador | DRtg en cancha | puntos | lnb | B | sí | 100 × PTS_rival en cancha / Pos en cancha |
| `net_rating_on` | jugador | NR en cancha | puntos | lnb | B | no | ORtg en cancha − DRtg en cancha |
| `net_rating_off` | jugador | NR fuera de cancha | puntos | lnb | B | no | ORtg fuera − DRtg fuera |
| `on_off` | jugador | On/Off | puntos | lnb | B | no | NR en cancha − NR fuera |
| `ewa` | jugador | EWA | victorias | lnb | B | no | (Min / 40) × [P(ORtg_on) − P(ORtg_rep)], P(a) = a^x / (a^x + L^x) |
| `ela` | jugador | ELA | derrotas | lnb | B | no | (Min / 40) × [Q(DRtg_on) − Q(DRtg_rep)], Q(g) = g^x / (g^x + L^x) |
| `rendimiento_indice` | jugador | Índice de rendimiento | índice | lnb | B | no | Σ peso × promedio de percentiles por componente (pesos sin posición) |
| `rendimiento_cobertura` | jugador | Cobertura del índice | proporción | lnb | B | no | Σ pesos de los componentes con datos |
| `mejoria_alpha` | jugador | Mejoría α | índice | n/d | B | no | 50 + 16,7 × w × Z |
| `mejoria_beta` | jugador | Mejoría β | puntos | n/d | B | no | R_reciente − R_anterior |
| `potencial_alpha` | jugador | Potencial α | percentil | lnb | B | no | min(100, N + G × años × (1 + λ × M)) |
| `potencial_beta` | jugador | Potencial β | índice | lnb | B | no | 0,60 R* + 0,25 T + 0,15 × 100 × F_edad |
| `ast_per36` | jugador | Asistencias cada 36 minutos | asistencias | lnb | B | no | AST × 36 / MP |
| `pf_per36` | jugador | Faltas cada 36 minutos | faltas | lnb | B | no | PF × 36 / MP |
| `game_score_per36` | jugador | Game Score cada 36 minutos | puntos | lnb | B | no | Σ Game Score × 36 / MP |
| `team_minutes_share` | jugador | % de los minutos del equipo | % | lnb | B | no | MP / minutos de juego del equipo |
| `max_run` | equipo | Mayor corrida a favor | puntos | lnb | B | no | Máximo de puntos consecutivos |
| `max_run_rival` | equipo | Mayor corrida en contra | puntos | lnb | B | no | Máximo de puntos consecutivos del rival |
| `big_runs` | equipo | Corridas de 8-0 o más | corridas | lnb | B | no | Conteo de corridas ≥ 8 |
| `big_runs_rival` | equipo | Corridas de 8-0 o más en contra | corridas | lnb | B | no | Conteo de corridas ≥ 8 del rival |
| `lead_changes` | equipo | Cambios de líder | cambios | lnb | B | no | Conteo |
| `max_lead` | equipo | Mayor ventaja | puntos | lnb | B | no | Máximo de (PTS − PTS_rival) |
| `max_deficit` | equipo | Mayor desventaja | puntos | lnb | B | no | Máximo de (PTS_rival − PTS) |
| `minutes_leading` | equipo | Minutos arriba | minutos | lnb | B | no | Σ tiempo con ventaja |
| `minutes_trailing` | equipo | Minutos abajo | minutos | lnb | B | no | Σ tiempo con desventaja |
| `minutes_tied` | equipo | Minutos empatado | minutos | lnb | B | no | Σ tiempo empatado |
| `pts_assisted_share` | equipo | % de puntos asistidos | % | lnb | B | no | Puntos de canastas asistidas / PTS |
| `pts_3_share` | equipo | % de puntos de triple | % | lnb | B | no | 3 × 3P / PTS |
| `pts_ft_share` | equipo | % de puntos de libre | % | lnb | B | no | TL / PTS |
| `pts_second_chance` | equipo | Puntos de segunda oportunidad | puntos | lnb | B | no | Puntos tras ORB hasta el cambio de posesión |
| `pts_second_chance_rival` | equipo | Puntos de segunda oportunidad del rival | puntos | lnb | B | no | Puntos del rival tras su ORB |
| `quarter_start_diff` | equipo | Diferencia en los arranques de cuarto | puntos | lnb | B | no | Σ (PTS − PTS_rival) en los minutos 0 a 3 |
| `quarter_end_diff` | equipo | Diferencia en los cierres de cuarto | puntos | lnb | B | no | Σ (PTS − PTS_rival) en los últimos 3 minutos |
| `clutch_net` | equipo | Diferencia en el clutch | puntos | lnb | B | no | PTS − PTS_rival en el clutch |
| `timeouts` | equipo | Tiempos muertos pedidos | tiempos muertos | lnb | A | no |  |
| `possessions_pbp` | equipo | Posesiones (desde las jugadas) | posesiones | lnb | B | no | 0,5 × (FGA + 0,44 FTA − ORB + TOV) desde el play-by-play |
| `age` | jugador | Edad | años | wikipedia | A | no |  |
| `height_cm` | jugador | Altura | cm | wikipedia | A | no |  |
| `weight_kg` | jugador | Peso | kg | wikipedia | A | no |  |
| `pts_per40` | jugador | Puntos cada 40 minutos | puntos | lnb | B | no | PTS × 40 / MP |
| `stl_per36` | jugador | Robos cada 36 minutos | robos | lnb | B | no | STL × 36 / MP |
| `blk_per36` | jugador | Tapas cada 36 minutos | tapas | lnb | B | no | BLK × 36 / MP |
| `tov_per36` | jugador | Pérdidas cada 36 minutos | pérdidas | lnb | B | no | TOV × 36 / MP |
| `fg2_pct` | jugador | % de dobles | % | lnb | B | no | 2P / 2PA |
| `mpg` | jugador | Minutos por partido | minutos | lnb | B | no | MP / PJ |
| `ppg` | jugador | Puntos por partido | puntos | lnb | B | no | PTS / PJ |
| `rpg` | jugador | Rebotes por partido | rebotes | lnb | B | no | TRB / PJ |
| `apg` | jugador | Asistencias por partido | asistencias | lnb | B | no | AST / PJ |
| `spg` | jugador | Robos por partido | robos | lnb | B | no | STL / PJ |
| `bpg` | jugador | Tapas por partido | tapas | lnb | B | no | BLK / PJ |
| `tpg` | jugador | Pérdidas por partido | pérdidas | lnb | B | no | TOV / PJ |
| `bench_pts_share` | equipo | % de puntos de la banca | % | lnb | B | no | PTS suplentes / PTS |
| `bench_ppg` | equipo | Puntos de la banca por partido | puntos | lnb | B | no | PTS suplentes / PJ |
| `rotation_depth` | equipo | Profundidad de la rotación | jugadores | lnb | B | no | Conteo de jugadores con MP/PJ ≥ 10 |
| `pyth_losses` | equipo | Derrotas pitagóricas | derrotas | lnb | B | no | PJ − victorias pitagóricas |
| `longest_win_streak` | equipo | Racha de victorias | partidos | lnb | B | no | Racha máxima |
| `home_win_pct` | equipo | % de victorias de local | % | lnb | B | no | W local / PJ local |
| `away_win_pct` | equipo | % de victorias de visitante | % | lnb | B | no | W visitante / PJ visitante |
| `net_rating_stdev` | equipo | Consistencia del NR | puntos | lnb | B | no | Desvío estándar muestral del NR por partido |
| `position` | equipo | Posición en la tabla | puesto | lnb | B | no | Orden por % de victorias y MOV |
| `fgm` | jugador | Tiros de campo convertidos | tiros | lnb | B | no | 2P + 3P |
| `fga` | jugador | Tiros de campo intentados | tiros | lnb | B | no | 2PA + 3PA |
| `fg2m` | jugador | Dobles convertidos | tiros | lnb | A | no |  |
| `fg2a` | jugador | Dobles intentados | tiros | lnb | A | no |  |
| `fg3m` | jugador | Triples convertidos | tiros | lnb | A | no |  |
| `fg3a` | jugador | Triples intentados | tiros | lnb | A | no |  |
| `ftm` | jugador | Libres convertidos | tiros | lnb | A | no |  |
| `fta` | jugador | Libres intentados | tiros | lnb | A | no |  |
| `pf_drawn` | jugador | Faltas recibidas | faltas | lnb | A | no |  |
| `bench_games` | jugador | Partidos desde el banco | partidos | lnb | B | no | PJ − titularidades |
| `fpg` | jugador | Faltas por partido | faltas | lnb | B | no | PF / PJ |
| `pts_per100` | jugador | Puntos cada 100 posesiones | puntos | lnb | B | no | 100 × PTS / posesiones en cancha |
| `trb_per100` | jugador | Rebotes cada 100 posesiones | rebotes | lnb | B | no | 100 × TRB / posesiones en cancha |
| `ast_per100` | jugador | Asistencias cada 100 posesiones | asistencias | lnb | B | no | 100 × AST / posesiones en cancha |
| `minutes_last_7d` | jugador | Minutos en los últimos 7 días | minutos | lnb | B | no | Σ MP de los últimos 7 días |
| `minutes_last_14d` | jugador | Minutos en los últimos 14 días | minutos | lnb | B | no | Σ MP de los últimos 14 días |
| `minutes_last_28d` | jugador | Minutos en los últimos 28 días | minutos | lnb | B | no | Σ MP de los últimos 28 días |
| `streak_double_double` | jugador | Racha de dobles-dobles | partidos | lnb | B | no | Racha máxima |
| `streak_three_40` | jugador | Racha de 40 % en triples | partidos | lnb | B | no | Racha máxima |
| `rank_ppg` | jugador | Puesto en puntos por partido | puesto | lnb | B | no | Orden de PTS/PJ en la liga |
| `rank_rpg` | jugador | Puesto en rebotes por partido | puesto | lnb | B | no | Orden de TRB/PJ en la liga |
| `rank_apg` | jugador | Puesto en asistencias por partido | puesto | lnb | B | no | Orden de AST/PJ en la liga |
| `rank_spg` | jugador | Puesto en robos por partido | puesto | lnb | B | no | Orden de STL/PJ en la liga |
| `rank_bpg` | jugador | Puesto en tapas por partido | puesto | lnb | B | no | Orden de BLK/PJ en la liga |
| `rank_per` | jugador | Puesto en PER | puesto | lnb | B | no | Orden de PER en la liga |
| `is_foreign` | jugador | Extranjero | sí/no | wikipedia | A | no |  |
| `team_fga` | equipo | Tiros de campo del equipo | tiros | lnb | B | no | 2PA + 3PA |
| `team_fg3a` | equipo | Triples del equipo | tiros | lnb | A | no |  |
| `team_fta` | equipo | Libres del equipo | tiros | lnb | A | no |  |
| `team_orb` | equipo | Rebotes ofensivos del equipo | rebotes | lnb | A | no |  |
| `team_drb` | equipo | Rebotes defensivos del equipo | rebotes | lnb | A | no |  |
| `team_ast` | equipo | Asistencias del equipo | asistencias | lnb | A | no |  |
| `team_stl` | equipo | Robos del equipo | robos | lnb | A | no |  |
| `team_blk` | equipo | Tapas del equipo | tapas | lnb | A | no |  |
| `team_tov` | equipo | Pérdidas del equipo | pérdidas | lnb | A | no |  |
| `team_pf` | equipo | Faltas del equipo | faltas | lnb | A | no |  |
| `team_ftr` | equipo | FTr del equipo | proporción | lnb | B | no | FTA / FGA |
| `team_drb_pct` | equipo | DRB% del equipo | % | lnb | B | no | DRB / (DRB + ORB_rival) |
| `extra_possessions` | equipo | Posesiones extra | posesiones | lnb | B | no | (ORB + STL − TOV) − lo mismo del rival |
| `surprise` | equipo | Sorpresa | puntos | lnb | B | no | Resultado (1/0) − prob. Elo |
| `net_rating_vs_last5` | equipo | NR frente a los 5 anteriores | puntos | lnb | B | no | NR − promedio de los 5 anteriores |
| `q1_diff` | equipo | Diferencia en el 1.er cuarto | puntos | lnb | B | no | Promedio de (PTS − PTS_rival) del cuarto |
| `q2_diff` | equipo | Diferencia en el 2.º cuarto | puntos | lnb | B | no | Promedio de (PTS − PTS_rival) del cuarto |
| `q3_diff` | equipo | Diferencia en el 3.er cuarto | puntos | lnb | B | no | Promedio de (PTS − PTS_rival) del cuarto |
| `q4_diff` | equipo | Diferencia en el 4.º cuarto | puntos | lnb | B | no | Promedio de (PTS − PTS_rival) del cuarto |
| `last5_wins` | equipo | Victorias en los últimos 5 | partidos | lnb | B | no | Conteo |
| `last5_net_rating` | equipo | NR de los últimos 5 | puntos | lnb | B | no | Promedio del NR |
| `net_rating_vs_top` | equipo | NR contra el tercio alto | puntos | lnb | B | no | Promedio del NR |
| `net_rating_vs_mid` | equipo | NR contra el tercio medio | puntos | lnb | B | no | Promedio del NR |
| `net_rating_vs_bottom` | equipo | NR contra el tercio bajo | puntos | lnb | B | no | Promedio del NR |
| `coverage_box_score` | equipo | Cobertura de box score | % | lnb | B | no | Partidos con box score / jugados |
| `coverage_pbp` | equipo | Cobertura de play-by-play | % | lnb | B | no | Partidos validados / con box score |
| `starters_jaccard` | equipo | Estabilidad del quinteto titular | índice | lnb | B | no | Promedio de Jaccard entre partidos consecutivos |
| `min_share_age_21` | equipo | % de minutos de hasta 21 años | % | lnb | B | no | Minutos del tramo / minutos totales |
| `min_share_age_22_26` | equipo | % de minutos de 22 a 26 años | % | lnb | B | no | Minutos del tramo / minutos totales |
| `min_share_age_27_31` | equipo | % de minutos de 27 a 31 años | % | lnb | B | no | Minutos del tramo / minutos totales |
| `min_share_age_32` | equipo | % de minutos de 32 años o más | % | lnb | B | no | Minutos del tramo / minutos totales |
| `home_advantage` | equipo | Ventaja de localía | % | lnb | B | no | W% local − W% visitante |
| `team_fgm` | equipo | Dobles y triples convertidos | tiros | lnb | A | no | 2PM + 3PM |
| `team_fg2m` | equipo | Dobles convertidos | tiros | lnb | A | no |  |
| `team_fg2a` | equipo | Dobles intentados | tiros | lnb | A | no |  |
| `team_fg3m` | equipo | Triples convertidos | tiros | lnb | A | no |  |
| `team_ftm` | equipo | Libres convertidos | tiros | lnb | A | no |  |
| `team_trb` | equipo | Rebotes totales | rebotes | lnb | A | no | ORB + DRB |
| `team_fg_pct` | equipo | % de campo | % | lnb | B | no | FGM / FGA |
| `team_fg3_pct` | equipo | % de triples | % | lnb | B | no | 3PM / 3PA |
| `team_ft_pct` | equipo | % de libres | % | lnb | B | no | FTM / FTA |
| `team_ast_fgm` | equipo | Canastas asistidas | % | lnb | B | no | AST / FGM |
| `rival_fgm` | equipo | Canastas del rival | tiros | lnb | A | no |  |
| `rival_fga` | equipo | Tiros del rival | tiros | lnb | A | no |  |
| `rival_fg2m` | equipo | Dobles del rival | tiros | lnb | A | no |  |
| `rival_fg2a` | equipo | Dobles intentados del rival | tiros | lnb | A | no |  |
| `rival_fg3m` | equipo | Triples del rival | tiros | lnb | A | no |  |
| `rival_fg3a` | equipo | Triples intentados del rival | tiros | lnb | A | no |  |
| `rival_ftm` | equipo | Libres del rival | tiros | lnb | A | no |  |
| `rival_fta` | equipo | Libres intentados del rival | tiros | lnb | A | no |  |
| `rival_orb` | equipo | Rebotes ofensivos del rival | rebotes | lnb | A | no |  |
| `rival_drb` | equipo | Rebotes defensivos del rival | rebotes | lnb | A | no |  |
| `rival_trb` | equipo | Rebotes del rival | rebotes | lnb | A | no | ORB + DRB |
| `rival_ast` | equipo | Asistencias del rival | asistencias | lnb | A | no |  |
| `rival_stl` | equipo | Robos del rival | robos | lnb | A | no |  |
| `rival_blk` | equipo | Tapas del rival | tapas | lnb | A | no |  |
| `rival_tov` | equipo | Pérdidas del rival | pérdidas | lnb | A | no |  |
| `rival_pf` | equipo | Faltas del rival | faltas | lnb | A | no |  |
| `rival_fg3_pct` | equipo | % de triples del rival | % | lnb | B | no | 3PM rival / 3PA rival |
| `won` | equipo | Victorias | % | lnb | A | no | Ganados / jugados |
| `net_points` | equipo | Diferencia de puntos | puntos | lnb | B | no | PTS − PTS rival |
| `reb_margin` | equipo | Diferencia de rebotes | rebotes | lnb | B | no | TRB − TRB rival |
| `tov_margin` | equipo | Diferencia de pérdidas | pérdidas | lnb | B | no | TOV rival − TOV |
| `ast_margin` | equipo | Diferencia de asistencias | asistencias | lnb | B | no | AST − AST rival |
| `h1_diff` | equipo | Diferencia en el 1.er tiempo | puntos | lnb | B | no | Suma de Q1 y Q2 |
| `h2_diff` | equipo | Diferencia en el 2.º tiempo | puntos | lnb | B | no | Suma de Q3 y Q4 |
| `team_efg_num` | equipo | Auxiliar: numerador de eFG% | tiros | lnb | B | no | FGM + 0,5 × 3PM |
| `rival_efg_num` | equipo | Auxiliar: numerador de eFG% rival | tiros | lnb | B | no | FGM + 0,5 × 3PM |
| `team_ts_den` | equipo | Auxiliar: denominador de TS% | tiros | lnb | B | no | 2 × (FGA + 0,44 × FTA) |
| `rival_ts_den` | equipo | Auxiliar: denominador de TS% rival | tiros | lnb | B | no | 2 × (FGA + 0,44 × FTA) |
| `team_tov_den` | equipo | Auxiliar: jugadas de Boca | jugadas | lnb | B | no | FGA + 0,44 × FTA + TOV |
| `rival_tov_den` | equipo | Auxiliar: jugadas del rival | jugadas | lnb | B | no | FGA + 0,44 × FTA + TOV |
| `orb_chances` | equipo | Auxiliar: rebotes en el aro de Boca | rebotes | lnb | B | no | ORB + DRB rival |
| `drb_chances` | equipo | Auxiliar: rebotes en el aro rival | rebotes | lnb | B | no | DRB + ORB rival |
| `ppg_home` | jugador | Puntos por partido de local | puntos | lnb | B | no | PTS / PJ de local |
| `ppg_away` | jugador | Puntos por partido de visitante | puntos | lnb | B | no | PTS / PJ de visitante |
| `ppg_wins` | jugador | Puntos por partido en victorias | puntos | lnb | B | no | PTS / PJ en partidos ganados |
| `ppg_losses` | jugador | Puntos por partido en derrotas | puntos | lnb | B | no | PTS / PJ en partidos perdidos |
| `pm_wins` | jugador | Más/menos en victorias | puntos | lnb | B | no | +/- / PJ en partidos ganados |
| `pm_losses` | jugador | Más/menos en derrotas | puntos | lnb | B | no | +/- / PJ en partidos perdidos |
| `pm_per_game` | jugador | Más/menos por partido | puntos | lnb | A | no | +/- / PJ |
| `ppg_last5` | jugador | Puntos, últimos 5 | puntos | lnb | B | no | PTS / 5 de sus últimos 5 partidos |
| `rpg_last5` | jugador | Rebotes, últimos 5 | rebotes | lnb | B | no | TRB / 5 de sus últimos 5 partidos |
| `apg_last5` | jugador | Asistencias, últimos 5 | asistencias | lnb | B | no | AST / 5 de sus últimos 5 partidos |
| `mpg_last5` | jugador | Minutos, últimos 5 | minutos | lnb | B | no | Minutos / 5 de sus últimos 5 partidos |
| `max_pts` | jugador | Máximo de puntos | puntos | lnb | A | no |  |
| `max_trb` | jugador | Máximo de rebotes | rebotes | lnb | A | no |  |
| `max_ast` | jugador | Máximo de asistencias | asistencias | lnb | A | no |  |
| `max_efficiency` | jugador | Mejor valoración | puntos | lnb | A | no |  |
| `aro_fga_share` | jugador | Tiros cerca del aro | % | lnb | B | no | Tiros de la zona / FGA |
| `aro_fg_pct` | jugador | Acierto cerca del aro | % | lnb | B | no | Convertidos / intentados de la zona |
| `pintura_fga_share` | jugador | Tiros en el resto de la pintura | % | lnb | B | no | Tiros de la zona / FGA |
| `pintura_fg_pct` | jugador | Acierto en el resto de la pintura | % | lnb | B | no | Convertidos / intentados de la zona |
| `media_fga_share` | jugador | Tiros de media distancia | % | lnb | B | no | Tiros de la zona / FGA |
| `media_fg_pct` | jugador | Acierto de media distancia | % | lnb | B | no | Convertidos / intentados de la zona |
| `esquina3_fga_share` | jugador | Tiros de triple desde la esquina | % | lnb | B | no | Tiros de la zona / FGA |
| `esquina3_fg_pct` | jugador | Acierto de triple desde la esquina | % | lnb | B | no | Convertidos / intentados de la zona |
| `frontal3_fga_share` | jugador | Tiros de triple frontal o de 45° | % | lnb | B | no | Tiros de la zona / FGA |
| `frontal3_fg_pct` | jugador | Acierto de triple frontal o de 45° | % | lnb | B | no | Convertidos / intentados de la zona |
| `team_aro_fga_share` | equipo | Tiros cerca del aro | % | lnb | B | no | Tiros de la zona / FGA |
| `team_aro_fg_pct` | equipo | Acierto cerca del aro | % | lnb | B | no | Convertidos / intentados de la zona |
| `team_pintura_fga_share` | equipo | Tiros en el resto de la pintura | % | lnb | B | no | Tiros de la zona / FGA |
| `team_pintura_fg_pct` | equipo | Acierto en el resto de la pintura | % | lnb | B | no | Convertidos / intentados de la zona |
| `team_media_fga_share` | equipo | Tiros de media distancia | % | lnb | B | no | Tiros de la zona / FGA |
| `team_media_fg_pct` | equipo | Acierto de media distancia | % | lnb | B | no | Convertidos / intentados de la zona |
| `team_esquina3_fga_share` | equipo | Tiros de triple desde la esquina | % | lnb | B | no | Tiros de la zona / FGA |
| `team_esquina3_fg_pct` | equipo | Acierto de triple desde la esquina | % | lnb | B | no | Convertidos / intentados de la zona |
| `team_frontal3_fga_share` | equipo | Tiros de triple frontal o de 45° | % | lnb | B | no | Tiros de la zona / FGA |
| `team_frontal3_fg_pct` | equipo | Acierto de triple frontal o de 45° | % | lnb | B | no | Convertidos / intentados de la zona |
| `elo_pre` | equipo | Elo de Boca antes del partido | puntos | lnb | B | no | Elo previo de la corrida de toda la liga |
| `elo_rival_pre` | equipo | Elo del rival antes del partido | puntos | lnb | B | no | Elo previo de la corrida de toda la liga |
