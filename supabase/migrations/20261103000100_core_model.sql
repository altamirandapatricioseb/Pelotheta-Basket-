-- =============================================================================
-- Modelo base (sección 7): entidades del básquet y registros de operación.
--
-- Decisiones:
--   * Claves internas propias (identity) y una tabla de mapeo de ids por fuente,
--     porque cada fuente numera distinto y ninguna es "la verdad".
--   * Cada fila guarda `source` y `fetched_at`: trazabilidad de dónde salió el dato.
--   * Se guardan solo datos crudos mínimos (regla 8): box score, play-by-play y tiros.
--     Todo lo demás (porcentajes, ritmo, ratings, métricas propias) se calcula después.
--   * RLS activado en TODAS las tablas. Sin políticas de escritura para nadie: escribe
--     solo service_role, que saltea RLS.
--   * El play-by-play y las coordenadas de tiro NO son públicos: el sitio muestra solo
--     estadísticas derivadas (regla 4 y acuerdo de datos de la LNB, ver source_audit.md).
-- =============================================================================

-- Estado del sistema: también es la "fila de prueba" de la etapa 1.
create table core.system_status (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);
comment on table core.system_status is 'Pares clave/valor de estado público del sistema (etapa, última actualización).';

create table core.competition (
  competition_id  smallint generated always as identity primary key,
  code            text not null unique,
  name_es         text not null,
  kind            text not null check (kind in ('liga', 'copa_nacional', 'copa_internacional', 'amistoso')),
  country         text,
  source          text not null,
  fetched_at      timestamptz not null default now()
);

create table core.season (
  season_id       integer generated always as identity primary key,
  competition_id  smallint not null references core.competition (competition_id),
  name_es         text not null,  -- por ejemplo '2026-27'
  start_date      date,
  end_date        date,
  source          text not null,
  fetched_at      timestamptz not null default now(),
  unique (competition_id, name_es),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table core.team (
  team_id     integer generated always as identity primary key,
  name        text not null unique,
  short_name  text,
  city        text,
  is_boca     boolean not null default false,
  source      text not null,
  fetched_at  timestamptz not null default now()
);
-- Solo puede haber un equipo marcado como Boca.
create unique index team_only_one_boca on core.team (is_boca) where is_boca;

create table core.player (
  player_id     integer generated always as identity primary key,
  full_name     text not null,
  known_as      text,
  -- Dato personal (Ley 25.326): se guarda solo para calcular la edad. No se publica.
  birth_date    date check (birth_date > date '1950-01-01'),
  position_raw  text,
  nationality   text,
  height_cm     smallint check (height_cm between 150 and 235),
  weight_kg     smallint check (weight_kg between 50 and 170),
  source        text not null,
  fetched_at    timestamptz not null default now()
);
comment on column core.player.birth_date is 'Dato personal: no se expone en la API pública; solo se usa para calcular la edad.';

create table core.referee (
  referee_id  integer generated always as identity primary key,
  name        text not null unique,
  source      text not null,
  fetched_at  timestamptz not null default now()
);

create table core.game (
  game_id           integer generated always as identity primary key,
  season_id         integer not null references core.season (season_id),
  game_date         date not null,
  tip_off_at        timestamptz,
  round_label       text,
  phase             text not null default 'regular' check (phase in ('regular', 'playoffs', 'otra')),
  home_team_id      integer not null references core.team (team_id),
  away_team_id      integer not null references core.team (team_id),
  home_points       smallint check (home_points >= 0),
  away_points       smallint check (away_points >= 0),
  overtime_periods  smallint not null default 0 check (overtime_periods between 0 and 6),
  status            text not null check (status in ('programado', 'jugado', 'suspendido', 'postergado', 'cancelado')),
  venue             text,
  source            text not null,
  fetched_at        timestamptz not null default now(),
  check (home_team_id <> away_team_id),
  -- Un partido jugado tiene que tener resultado, y en básquet no hay empates.
  check (status <> 'jugado' or (home_points is not null and away_points is not null and home_points <> away_points))
);
create index game_season_date_idx on core.game (season_id, game_date);
create index game_home_idx on core.game (home_team_id);
create index game_away_idx on core.game (away_team_id);

create table core.game_referee (
  game_id     integer not null references core.game (game_id) on delete cascade,
  referee_id  integer not null references core.referee (referee_id),
  primary key (game_id, referee_id)
);
create index game_referee_referee_idx on core.game_referee (referee_id);

-- Parciales por cuarto (5 en adelante = suplementarios).
create table core.game_period_score (
  game_id      integer not null references core.game (game_id) on delete cascade,
  period       smallint not null check (period between 1 and 10),
  home_points  smallint not null check (home_points >= 0),
  away_points  smallint not null check (away_points >= 0),
  source       text not null,
  fetched_at   timestamptz not null default now(),
  primary key (game_id, period)
);

-- Box score por jugador: solo contadores crudos. Porcentajes, eFG%, TS% y demás se calculan.
-- Por qué tiros de 2 y de 3 por separado y no "tiros de campo": es lo que publica la LNB y
-- de ahí sale todo lo demás (FG = 2P + 3P) sin perder información.
create table core.player_game_stats (
  game_id       integer not null references core.game (game_id) on delete cascade,
  player_id     integer not null references core.player (player_id),
  team_id       integer not null references core.team (team_id),
  shirt_number  smallint check (shirt_number between 0 and 99),
  started       boolean not null,
  seconds       integer not null check (seconds between 0 and 4200),
  pts           smallint not null check (pts >= 0),
  fg2m          smallint not null check (fg2m >= 0),
  fg2a          smallint not null check (fg2a >= fg2m),
  fg3m          smallint not null check (fg3m >= 0),
  fg3a          smallint not null check (fg3a >= fg3m),
  ftm           smallint not null check (ftm >= 0),
  fta           smallint not null check (fta >= ftm),
  orb           smallint not null check (orb >= 0),
  drb           smallint not null check (drb >= 0),
  ast           smallint not null check (ast >= 0),
  stl           smallint not null check (stl >= 0),
  tov           smallint not null check (tov >= 0),
  blk           smallint not null check (blk >= 0),
  blk_against   smallint not null check (blk_against >= 0),
  pf            smallint not null check (pf between 0 and 6),
  pf_drawn      smallint not null check (pf_drawn >= 0),
  efficiency    smallint,  -- "valoración" publicada; se recalcula y se usa para validar
  plus_minus    smallint,
  source        text not null,
  fetched_at    timestamptz not null default now(),
  primary key (game_id, player_id),
  -- Los puntos tienen que cerrar con los tiros: si no, el dato está mal y no entra.
  check (pts = 2 * fg2m + 3 * fg3m + ftm)
);
create index player_game_stats_player_idx on core.player_game_stats (player_id);
create index player_game_stats_team_idx on core.player_game_stats (team_id);

-- Totales de equipo tal como los publica la fuente (incluye rebotes de equipo, que no son
-- de ningún jugador). Sirve para validar la suma de los jugadores y para las fórmulas de equipo.
create table core.team_game_stats (
  game_id     integer not null references core.game (game_id) on delete cascade,
  team_id     integer not null references core.team (team_id),
  pts         smallint not null check (pts >= 0),
  fg2m        smallint not null check (fg2m >= 0),
  fg2a        smallint not null check (fg2a >= fg2m),
  fg3m        smallint not null check (fg3m >= 0),
  fg3a        smallint not null check (fg3a >= fg3m),
  ftm         smallint not null check (ftm >= 0),
  fta         smallint not null check (fta >= ftm),
  orb         smallint not null check (orb >= 0),
  drb         smallint not null check (drb >= 0),
  ast         smallint not null check (ast >= 0),
  stl         smallint not null check (stl >= 0),
  tov         smallint not null check (tov >= 0),
  blk         smallint not null check (blk >= 0),
  pf          smallint not null check (pf >= 0),
  source      text not null,
  fetched_at  timestamptz not null default now(),
  primary key (game_id, team_id)
);
create index team_game_stats_team_idx on core.team_game_stats (team_id);

-- Play-by-play (5.8). `seq` es el orden de la fuente (desempata eventos del mismo segundo).
-- `clock_s` = segundos que quedan en el cuarto (cuenta regresiva, 600 al empezar).
create table core.play_by_play_event (
  game_id     integer not null references core.game (game_id) on delete cascade,
  seq         integer not null check (seq >= 0),
  period      smallint not null check (period between 1 and 10),
  clock_s     smallint not null check (clock_s between 0 and 600),
  team_id     integer references core.team (team_id),
  player_id   integer references core.player (player_id),
  event_type  text not null,
  score_home  smallint check (score_home >= 0),
  score_away  smallint check (score_away >= 0),
  source      text not null,
  fetched_at  timestamptz not null default now(),
  primary key (game_id, seq)
);
create index pbp_team_idx on core.play_by_play_event (team_id);
create index pbp_player_idx on core.play_by_play_event (player_id);

-- Tiros con posición (mapa de tiro de la LNB): x e y en % de la cancha, zona de la fuente.
create table core.shot (
  shot_id     bigint generated always as identity primary key,
  game_id     integer not null references core.game (game_id) on delete cascade,
  team_id     integer not null references core.team (team_id),
  player_id   integer references core.player (player_id),
  period      smallint not null check (period between 1 and 10),
  shot_value  smallint not null check (shot_value in (2, 3)),
  made        boolean not null,
  x_pct       numeric(5, 2) check (x_pct between 0 and 100),
  y_pct       numeric(5, 2) check (y_pct between 0 and 100),
  zone        text,
  source      text not null,
  fetched_at  timestamptz not null default now()
);
create index shot_game_idx on core.shot (game_id);
create index shot_team_idx on core.shot (team_id);
create index shot_player_idx on core.shot (player_id);

-- Mapeo de ids: (fuente, entidad, id en la fuente) -> id interno.
create table core.source_id_map (
  source       text not null,
  entity       text not null check (entity in ('competition', 'season', 'team', 'player', 'referee', 'game')),
  source_id    text not null,
  internal_id  bigint not null,
  fetched_at   timestamptz not null default now(),
  primary key (source, entity, source_id)
);

-- Registro de cargas (sección 7 y 9.11): alimenta la Interfaz 6.
create table core.ingest_log (
  ingest_id    bigint generated always as identity primary key,
  run_id       uuid not null,
  source       text not null,  -- 'global' para la fila resumen de la corrida
  trigger      text not null check (trigger in ('schedule', 'manual')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null check (status in ('en_curso', 'ok', 'parcial', 'error', 'omitido')),
  rows_loaded  integer not null default 0 check (rows_loaded >= 0),
  games_added  integer not null default 0 check (games_added >= 0),
  duration_s   integer check (duration_s >= 0),
  db_size_mb   numeric(8, 2),
  message      text,
  check (finished_at is null or finished_at >= started_at)
);
create index ingest_log_source_idx on core.ingest_log (source, started_at desc);

-- Auditoría de cada corrida (14.6). NO es pública.
create table core.audit_log (
  audit_id        bigint generated always as identity primary key,
  run_id          uuid not null,
  workflow        text not null,
  commit_sha      text,
  tables_touched  text[] not null default '{}',
  rows_inserted   integer not null default 0,
  rows_updated    integer not null default 0,
  input_hashes    text[] not null default '{}',
  duration_ms     integer,
  result          text not null check (result in ('ok', 'parcial', 'error')),
  created_at      timestamptz not null default now()
);
comment on table core.audit_log is 'Auditoría de cargas. Solo la escribe y lee el pipeline. Retención: 12 meses.';

-- -----------------------------------------------------------------------------
-- RLS en todas las tablas del esquema core.
-- -----------------------------------------------------------------------------
alter table core.system_status       enable row level security;
alter table core.competition         enable row level security;
alter table core.season              enable row level security;
alter table core.team                enable row level security;
alter table core.player              enable row level security;
alter table core.referee             enable row level security;
alter table core.game                enable row level security;
alter table core.game_referee        enable row level security;
alter table core.game_period_score   enable row level security;
alter table core.player_game_stats   enable row level security;
alter table core.team_game_stats     enable row level security;
alter table core.play_by_play_event  enable row level security;
alter table core.shot                enable row level security;
alter table core.source_id_map       enable row level security;
alter table core.ingest_log          enable row level security;
alter table core.audit_log           enable row level security;

-- Políticas de SOLO LECTURA para anon sobre lo público. Ninguna política de
-- insert/update/delete existe para anon ni authenticated: sin política, RLS niega.
create policy anon_read on core.system_status      for select to anon using (true);
create policy anon_read on core.competition        for select to anon using (true);
create policy anon_read on core.season             for select to anon using (true);
create policy anon_read on core.team               for select to anon using (true);
create policy anon_read on core.player             for select to anon using (true);
create policy anon_read on core.referee            for select to anon using (true);
create policy anon_read on core.game               for select to anon using (true);
create policy anon_read on core.game_referee       for select to anon using (true);
create policy anon_read on core.game_period_score  for select to anon using (true);
create policy anon_read on core.player_game_stats  for select to anon using (true);
create policy anon_read on core.team_game_stats    for select to anon using (true);
create policy anon_read on core.ingest_log         for select to anon using (true);
-- play_by_play_event, shot, source_id_map y audit_log: sin política para anon, así que no
-- ve ninguna fila. Lo público de esas tablas sale después como agregados en vistas del
-- pipeline, nunca el dato crudo.

-- Permisos de columna para anon: solo lo que alguna vista pública necesita.
-- player.birth_date queda afuera a propósito (minimización de datos personales).
grant select on core.system_status, core.competition, core.season, core.team, core.referee,
                core.game, core.game_referee, core.game_period_score, core.player_game_stats,
                core.team_game_stats to anon;
grant select (player_id, full_name, known_as, position_raw, nationality, height_cm, weight_kg,
              source, fetched_at) on core.player to anon;
grant select (source, trigger, started_at, finished_at, status, rows_loaded, games_added, duration_s,
              db_size_mb) on core.ingest_log to anon;
