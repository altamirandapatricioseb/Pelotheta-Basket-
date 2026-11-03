-- =============================================================================
-- Etapa 4: carga del pipeline, catálogo de estadísticas y valores calculados.
--
-- Cómo escribe el pipeline sin contraseña de la base (mismo patrón que el proyecto de fútbol):
--   * La conexión directa a Postgres es solo IPv6 y GitHub Actions usa IPv4, así que el
--     pipeline habla por HTTPS con la Data API, igual que la web.
--   * Se expone un segundo esquema, `ingest`, con funciones de carga. Solo `service_role`
--     (la clave secreta) tiene USAGE; si `anon` las llama, PostgREST responde permiso denegado.
--   * `ingest.load_batch` carga todo en una transacción: o entra completo o no entra.
-- =============================================================================

-- 1. Catálogo, conjuntos de columnas y valores calculados ----------------------

create table core.stat_catalog (
  stat_id           text primary key check (stat_id ~ '^[a-z0-9_]+$'),
  name_es           text not null,
  description_es    text not null check (length(description_es) <= 160),
  stat_group        text not null,
  entity            text not null check (entity in ('jugador', 'equipo')),
  unit              text not null,
  source            text not null,
  level             char(1) not null check (level in ('A', 'B', 'C')),
  formula           text,
  higher_is_better  boolean not null,
  available         boolean not null
);
comment on table core.stat_catalog is 'Catálogo de estadísticas (sección 5): nivel A/B/C, fórmula y disponibilidad.';

-- Conjuntos de columnas de las Interfaces 2 y 3 (9.1 y 9.5): viven en la base, no en el código.
create table core.stat_set (
  set_id      text primary key check (set_id ~ '^[a-z0-9_]+$'),
  entity      text not null check (entity in ('jugador', 'equipo')),
  name_es     text not null,
  sort_order  smallint not null
);
create table core.stat_set_item (
  set_id      text not null references core.stat_set (set_id) on delete cascade,
  stat_id     text not null references core.stat_catalog (stat_id),
  sort_order  smallint not null,
  primary key (set_id, stat_id)
);
create index stat_set_item_stat_idx on core.stat_set_item (stat_id);

-- Valores de temporada en formato largo: una fila por entidad y estadística. Por qué largo:
-- agregar una estadística nueva es una fila en el catálogo, no una columna nueva.
create table core.stat_value (
  entity        text not null check (entity in ('jugador', 'equipo')),
  entity_id     integer not null,  -- player_id o team_id según `entity`
  stat_id       text not null references core.stat_catalog (stat_id),
  value         numeric,           -- null = n/d
  is_estimated  boolean not null default false,
  computed_at   timestamptz not null default now(),
  primary key (entity, entity_id, stat_id)
);
create index stat_value_stat_idx on core.stat_value (stat_id);

-- Partido a partido de Boca (Interfaz 2): ratings, cuatro factores y Elo previo.
create table core.team_game_derived (
  game_id       integer primary key references core.game (game_id) on delete cascade,
  stats         jsonb not null,
  computed_at   timestamptz not null default now()
);

alter table core.stat_catalog      enable row level security;
alter table core.stat_set          enable row level security;
alter table core.stat_set_item     enable row level security;
alter table core.stat_value        enable row level security;
alter table core.team_game_derived enable row level security;
create policy anon_read on core.stat_catalog      for select to anon using (true);
create policy anon_read on core.stat_set          for select to anon using (true);
create policy anon_read on core.stat_set_item     for select to anon using (true);
create policy anon_read on core.stat_value        for select to anon using (true);
create policy anon_read on core.team_game_derived for select to anon using (true);
grant select on core.stat_catalog, core.stat_set, core.stat_set_item, core.stat_value,
                core.team_game_derived to anon;

-- 2. Vistas públicas ----------------------------------------------------------------

create view api.stat_catalog with (security_invoker = true) as
select stat_id, name_es, description_es, stat_group, entity, unit, source, level, formula,
       higher_is_better, available
from core.stat_catalog;

create view api.stat_set_column with (security_invoker = true) as
select s.set_id, s.entity, s.name_es as set_name, s.sort_order as set_order, i.stat_id, i.sort_order
from core.stat_set s
join core.stat_set_item i using (set_id);

-- Valores de los jugadores de Boca con su nombre (Interfaz 3).
create view api.player_stat with (security_invoker = true) as
select v.entity_id as player_id, p.full_name, v.stat_id, v.value, v.is_estimated
from core.stat_value v
join core.player p on p.player_id = v.entity_id
where v.entity = 'jugador';

create view api.team_stat with (security_invoker = true) as
select v.entity_id as team_id, t.name as team, t.is_boca, v.stat_id, v.value, v.is_estimated
from core.stat_value v
join core.team t on t.team_id = v.entity_id
where v.entity = 'equipo';

-- Partidos de Boca con rival, resultado y lo calculado (Interfaz 2, «Partido a partido»).
create view api.boca_game with (security_invoker = true) as
select g.game_id, g.game_date, g.tip_off_at, g.home_team_id = b.team_id as is_home,
       r.name as opponent,
       case when g.home_team_id = b.team_id then g.home_points else g.away_points end as points_for,
       case when g.home_team_id = b.team_id then g.away_points else g.home_points end as points_against,
       d.stats
from core.game g
cross join (select team_id from core.team where is_boca) b
join core.team r on r.team_id = case when g.home_team_id = b.team_id then g.away_team_id else g.home_team_id end
left join core.team_game_derived d on d.game_id = g.game_id
where b.team_id in (g.home_team_id, g.away_team_id) and g.status = 'jugado';

grant select on api.stat_catalog, api.stat_set_column, api.player_stat, api.team_stat, api.boca_game
  to anon, service_role;

-- 3. Esquema de carga -------------------------------------------------------------------

create schema if not exists ingest;
comment on schema ingest is 'Solo service_role: funciones de carga del pipeline. Expuesto en la Data API sin permisos para anon.';
revoke all on schema ingest from public;
grant usage on schema ingest to service_role;
alter default privileges for role postgres in schema ingest revoke execute on routines from public;

-- Id interno de una entidad de la fuente (null si todavía no existe).
create function ingest.internal_id(p_source text, p_entity text, p_source_id text)
returns bigint
language sql
stable
set search_path = ''
as $$
  select internal_id from core.source_id_map
  where source = p_source and entity = p_entity and source_id = p_source_id;
$$;

-- Carga un lote completo de la LNB. Idempotente: con el mismo lote la base queda igual.
--
-- Forma del lote (lo arma pipeline/load.py):
--   source, run_id, trigger, started_at, competition {code, name_es, season}, teams [{source_id,
--   name}], players [{source_id, name}], games [{source_id, played_at, home, away, home_points,
--   away_points, overtime_periods}], detail_games [source_id con box score], periods, player_lines,
--   team_lines, events, shots (con source_game_id), catalog, sets, set_items, stat_values,
--   game_derived, log {status, message}.
--
-- Por qué plpgsql con bucles simples y no un INSERT ... SELECT gigante: los lotes son chicos
-- (decenas de partidos) y así cada paso se puede leer y explicar por separado.
create function ingest.load_batch(p_batch jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_source     text := p_batch ->> 'source';
  v_comp_id    bigint;
  v_season_id  bigint;
  v_id         bigint;
  v_game_id    bigint;
  r            jsonb;
  n_games      integer := 0;
  n_new_games  integer := 0;
  n_rows       integer := 0;
  v_detail     bigint[];
begin
  if v_source is null or v_source !~ '^[a-z_]+$' then
    raise exception 'Lote sin fuente válida';
  end if;

  -- Competición y temporada.
  insert into core.competition (code, name_es, kind, country, source)
  values (p_batch -> 'competition' ->> 'code', p_batch -> 'competition' ->> 'name_es', 'liga', 'Argentina', v_source)
  on conflict (code) do update set name_es = excluded.name_es, fetched_at = now()
  returning competition_id into v_comp_id;
  insert into core.season (competition_id, name_es, source)
  values (v_comp_id, p_batch -> 'competition' ->> 'season', v_source)
  on conflict (competition_id, name_es) do update set fetched_at = now()
  returning season_id into v_season_id;

  -- Equipos (por id de la fuente; el nombre se actualiza si cambia).
  for r in select * from jsonb_array_elements(coalesce(p_batch -> 'teams', '[]')) loop
    v_id := ingest.internal_id(v_source, 'team', r ->> 'source_id');
    if v_id is null then
      insert into core.team (name, is_boca, source)
      values (r ->> 'name', coalesce((r ->> 'is_boca')::boolean, false), v_source)
      on conflict (name) do update set fetched_at = now()
      returning team_id into v_id;
      insert into core.source_id_map (source, entity, source_id, internal_id)
      values (v_source, 'team', r ->> 'source_id', v_id);
    else
      update core.team set name = r ->> 'name', fetched_at = now() where team_id = v_id;
    end if;
  end loop;

  -- Jugadores.
  for r in select * from jsonb_array_elements(coalesce(p_batch -> 'players', '[]')) loop
    v_id := ingest.internal_id(v_source, 'player', r ->> 'source_id');
    if v_id is null then
      insert into core.player (full_name, source) values (r ->> 'name', v_source) returning player_id into v_id;
      insert into core.source_id_map (source, entity, source_id, internal_id)
      values (v_source, 'player', r ->> 'source_id', v_id);
    else
      update core.player set full_name = r ->> 'name', fetched_at = now() where player_id = v_id;
    end if;
  end loop;

  -- Partidos (toda la liga). Los detalles de cada partido con box score se reemplazan completos.
  for r in select * from jsonb_array_elements(coalesce(p_batch -> 'games', '[]')) loop
    v_game_id := ingest.internal_id(v_source, 'game', r ->> 'source_id');
    if v_game_id is null then
      insert into core.game (season_id, game_date, tip_off_at, home_team_id, away_team_id, home_points,
                             away_points, overtime_periods, status, source)
      values (v_season_id, (r ->> 'played_at')::timestamptz::date, (r ->> 'played_at')::timestamptz,
              ingest.internal_id(v_source, 'team', r ->> 'home'), ingest.internal_id(v_source, 'team', r ->> 'away'),
              (r ->> 'home_points')::smallint, (r ->> 'away_points')::smallint,
              coalesce((r ->> 'overtime_periods')::smallint, 0), 'jugado', v_source)
      returning game_id into v_game_id;
      insert into core.source_id_map (source, entity, source_id, internal_id)
      values (v_source, 'game', r ->> 'source_id', v_game_id);
      n_new_games := n_new_games + 1;
    else
      update core.game
      set home_points = (r ->> 'home_points')::smallint, away_points = (r ->> 'away_points')::smallint,
          overtime_periods = coalesce((r ->> 'overtime_periods')::smallint, overtime_periods), fetched_at = now()
      where game_id = v_game_id;
    end if;
    n_games := n_games + 1;
  end loop;

  -- Detalle de los partidos con box score: se borra y se vuelve a cargar (idempotente).
  select array_agg(m.internal_id) into v_detail
  from core.source_id_map m
  join jsonb_array_elements_text(coalesce(p_batch -> 'detail_games', '[]')) d(sid) on m.source_id = d.sid
  where m.source = v_source and m.entity = 'game';
  delete from core.game_period_score  where game_id = any(v_detail);
  delete from core.player_game_stats  where game_id = any(v_detail);
  delete from core.team_game_stats    where game_id = any(v_detail);
  delete from core.play_by_play_event where game_id = any(v_detail);
  delete from core.shot               where game_id = any(v_detail);

  insert into core.game_period_score (game_id, period, home_points, away_points, source)
  select ingest.internal_id(v_source, 'game', x ->> 'source_game_id'), (x ->> 'period')::smallint,
         (x ->> 'home_points')::smallint, (x ->> 'away_points')::smallint, v_source
  from jsonb_array_elements(coalesce(p_batch -> 'periods', '[]')) x;

  insert into core.player_game_stats (game_id, player_id, team_id, shirt_number, started, seconds, pts, fg2m, fg2a,
    fg3m, fg3a, ftm, fta, orb, drb, ast, stl, tov, blk, blk_against, pf, pf_drawn, efficiency, plus_minus, source)
  select ingest.internal_id(v_source, 'game', x ->> 'source_game_id'),
         ingest.internal_id(v_source, 'player', x ->> 'source_player_id'),
         ingest.internal_id(v_source, 'team', x ->> 'team_id'),
         (x ->> 'shirt_number')::smallint, (x ->> 'started')::boolean, (x ->> 'seconds')::integer,
         (x ->> 'pts')::smallint, (x ->> 'fg2m')::smallint, (x ->> 'fg2a')::smallint, (x ->> 'fg3m')::smallint,
         (x ->> 'fg3a')::smallint, (x ->> 'ftm')::smallint, (x ->> 'fta')::smallint, (x ->> 'orb')::smallint,
         (x ->> 'drb')::smallint, (x ->> 'ast')::smallint, (x ->> 'stl')::smallint, (x ->> 'tov')::smallint,
         (x ->> 'blk')::smallint, (x ->> 'blk_against')::smallint, (x ->> 'pf')::smallint,
         (x ->> 'pf_drawn')::smallint, (x ->> 'efficiency')::smallint, (x ->> 'plus_minus')::smallint, v_source
  from jsonb_array_elements(coalesce(p_batch -> 'player_lines', '[]')) x;
  get diagnostics n_rows = row_count;

  insert into core.team_game_stats (game_id, team_id, pts, fg2m, fg2a, fg3m, fg3a, ftm, fta, orb, drb, ast, stl,
    tov, blk, pf, source)
  select ingest.internal_id(v_source, 'game', x ->> 'source_game_id'), ingest.internal_id(v_source, 'team', x ->> 'team_id'),
         (x ->> 'pts')::smallint, (x ->> 'fg2m')::smallint, (x ->> 'fg2a')::smallint, (x ->> 'fg3m')::smallint,
         (x ->> 'fg3a')::smallint, (x ->> 'ftm')::smallint, (x ->> 'fta')::smallint, (x ->> 'orb')::smallint,
         (x ->> 'drb')::smallint, (x ->> 'ast')::smallint, (x ->> 'stl')::smallint, (x ->> 'tov')::smallint,
         (x ->> 'blk')::smallint, (x ->> 'pf')::smallint, v_source
  from jsonb_array_elements(coalesce(p_batch -> 'team_lines', '[]')) x;

  insert into core.play_by_play_event (game_id, seq, period, clock_s, team_id, player_id, event_type, score_home,
    score_away, source)
  select ingest.internal_id(v_source, 'game', x ->> 'source_game_id'), (x ->> 'seq')::integer,
         (x ->> 'period')::smallint, (x ->> 'clock_s')::smallint,
         ingest.internal_id(v_source, 'team', x ->> 'team_id'), ingest.internal_id(v_source, 'player', x ->> 'source_player_id'),
         x ->> 'event_type', (x ->> 'score_home')::smallint, (x ->> 'score_away')::smallint, v_source
  from jsonb_array_elements(coalesce(p_batch -> 'events', '[]')) x
  where x ->> 'period' is not null;  -- inicio y fin de período no tienen reloj: no se guardan

  insert into core.shot (game_id, team_id, player_id, period, shot_value, made, x_pct, y_pct, zone, source)
  select ingest.internal_id(v_source, 'game', x ->> 'source_game_id'), ingest.internal_id(v_source, 'team', x ->> 'team_id'),
         ingest.internal_id(v_source, 'player', x ->> 'source_player_id'), (x ->> 'period')::smallint,
         (x ->> 'shot_value')::smallint, (x ->> 'made')::boolean, (x ->> 'x_pct')::numeric, (x ->> 'y_pct')::numeric,
         x ->> 'zone', v_source
  from jsonb_array_elements(coalesce(p_batch -> 'shots', '[]')) x;

  -- Catálogo y conjuntos: se reemplazan completos (son la definición vigente del pipeline).
  delete from core.stat_set;
  delete from core.stat_value;
  delete from core.stat_catalog;
  insert into core.stat_catalog
  select x ->> 'id', x ->> 'nombre_es', x ->> 'descripcion_es', x ->> 'grupo', x ->> 'categoria', x ->> 'unidad',
         x ->> 'fuente', x ->> 'nivel', nullif(x ->> 'formula', ''), (x ->> 'higher_is_better')::boolean,
         (x ->> 'available')::boolean
  from jsonb_array_elements(coalesce(p_batch -> 'catalog', '[]')) x;
  insert into core.stat_set (set_id, entity, name_es, sort_order)
  select x ->> 'set_id', x ->> 'entity', x ->> 'name_es', (x ->> 'sort_order')::smallint
  from jsonb_array_elements(coalesce(p_batch -> 'sets', '[]')) x;
  insert into core.stat_set_item (set_id, stat_id, sort_order)
  select x ->> 'set_id', x ->> 'stat_id', (x ->> 'sort_order')::smallint
  from jsonb_array_elements(coalesce(p_batch -> 'set_items', '[]')) x;
  insert into core.stat_value (entity, entity_id, stat_id, value, is_estimated)
  select x ->> 'entity',
         ingest.internal_id(v_source, case x ->> 'entity' when 'jugador' then 'player' else 'team' end, x ->> 'source_id'),
         x ->> 'stat_id', (x ->> 'value')::numeric, coalesce((x ->> 'is_estimated')::boolean, false)
  from jsonb_array_elements(coalesce(p_batch -> 'stat_values', '[]')) x;

  insert into core.team_game_derived (game_id, stats)
  select ingest.internal_id(v_source, 'game', x ->> 'source_game_id'), x -> 'stats'
  from jsonb_array_elements(coalesce(p_batch -> 'game_derived', '[]')) x
  on conflict (game_id) do update set stats = excluded.stats, computed_at = now();

  -- Registro de la corrida (Interfaz 6) y estado público.
  insert into core.ingest_log (run_id, source, trigger, started_at, finished_at, status, rows_loaded, games_added,
                               duration_s, db_size_mb, message)
  values ((p_batch ->> 'run_id')::uuid, 'global', p_batch ->> 'trigger', (p_batch ->> 'started_at')::timestamptz,
          now(), p_batch -> 'log' ->> 'status', n_rows, n_new_games,
          extract(epoch from now() - (p_batch ->> 'started_at')::timestamptz)::integer,
          round(pg_database_size(current_database()) / 1048576.0, 2), p_batch -> 'log' ->> 'message');
  insert into core.ingest_log (run_id, source, trigger, started_at, finished_at, status, rows_loaded, games_added)
  values ((p_batch ->> 'run_id')::uuid, v_source, p_batch ->> 'trigger', (p_batch ->> 'started_at')::timestamptz,
          now(), p_batch -> 'log' ->> 'status', n_rows, n_new_games);
  insert into core.system_status (key, value) values ('ultima_actualizacion', now()::text)
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return jsonb_build_object('games', n_games, 'new_games', n_new_games, 'player_lines', n_rows,
                            'db_size_mb', round(pg_database_size(current_database()) / 1048576.0, 2));
end;
$$;

-- Registro de una corrida fallida (el pipeline la llama si algo sale mal antes de cargar).
create function ingest.log_failure(p_run_id uuid, p_source text, p_trigger text, p_message text)
returns void
language sql
set search_path = ''
as $$
  insert into core.ingest_log (run_id, source, trigger, finished_at, status, message)
  values (p_run_id, p_source, p_trigger, now(), 'error', left(p_message, 500));
$$;

revoke all on all functions in schema ingest from public, anon, authenticated;
grant execute on all functions in schema ingest to service_role;

-- Exponer `ingest` en la Data API junto a `api` (sin permisos para anon, ver arriba).
alter role authenticator set pgrst.db_schemas = 'api, ingest';
notify pgrst, 'reload config';
