-- =============================================================================
-- Situaciones: tablas, carga del catálogo y refresco (como Pelotheta fútbol).
--
-- `core.situational_catalog` viene de data/situational_catalog.csv (lo envía el pipeline con
-- `ingest.load_situations`, que además rearma todo). `core.refresh_situations()` junta las filas
-- de las vistas core.situ_cards_* en `core.situational_match` y calcula `core.situational_result`.
-- En el básquet no hay empates: `d` queda en 0 y se miden puntos a favor, en contra y margen.
-- =============================================================================
create table core.situational_catalog (
  card_id        text primary key check (card_id ~ '^s[0-9]{3}$'),
  category       text not null check (category ~ '^[A-J]$'),
  title_es       text not null,
  condition_es   text not null,
  params_es      text not null default '',
  measured_es    text not null,
  required_data  text not null,
  level          text not null check (level in ('A', 'B', 'C')),
  available      boolean not null,
  estimated      boolean not null default false,
  reason_es      text not null default '',
  -- Métrica que se destaca en la tarjeta: win_pct, margin, pf o pa.
  main_metric    text not null default 'win_pct' check (main_metric in ('win_pct', 'margin', 'pf', 'pa')),
  -- Estadísticas del partido que se muestran además en cada fila (claves separadas por espacio).
  extra_metrics  text not null default '',
  sort_order     smallint not null
);

create table core.situational_match (
  card_id     text not null,
  param_value text not null,
  param_order integer not null,
  match_id    integer not null references core.game (game_id) on delete cascade,
  primary key (card_id, param_value, match_id)
);

create table core.situational_result (
  card_id      text not null,
  param_value  text not null,
  param_order  integer not null,
  n            integer not null,
  w            integer not null,
  d            integer not null default 0,
  l            integer not null,
  win_pct      numeric not null,
  pf_avg       numeric not null,
  pa_avg       numeric not null,
  margin       numeric not null,
  base_win_pct numeric not null,
  delta        numeric not null,
  base_pf      numeric not null,
  base_pa      numeric not null,
  base_margin  numeric not null,
  stats        jsonb not null default '{}',
  base_stats   jsonb not null default '{}',
  computed_at  timestamptz not null default now(),
  primary key (card_id, param_value)
);

alter table core.situational_catalog enable row level security;
alter table core.situational_match enable row level security;
alter table core.situational_result enable row level security;
create policy anon_read on core.situational_catalog for select to anon using (true);
create policy anon_read on core.situational_match for select to anon using (true);
create policy anon_read on core.situational_result for select to anon using (true);
grant select on core.situational_catalog, core.situational_match, core.situational_result to anon;
grant select on core.situ_base to anon;

-- Promedios de las estadísticas que muestran las filas, para un grupo de partidos.
create function core.situ_stat_avgs(p_matches integer[])
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'efg', round(avg(core.sv(s, 'efg')) * 100, 1),
    'tov_pct', round(avg(core.sv(s, 'tov_pct')), 1),
    'orb_pct_team', round(avg(core.sv(s, 'orb_pct_team')) * 100, 1),
    'pace', round(avg(core.sv(s, 'pace')), 1),
    'ortg', round(avg(core.sv(s, 'ortg')), 1),
    'drtg', round(avg(core.sv(s, 'drtg')), 1),
    'team_fg3m', round(avg(core.sv(s, 'team_fg3m')), 1),
    'team_fg3_pct', round(avg(core.sv(s, 'team_fg3_pct')) * 100, 1),
    'reb_margin', round(avg(core.sv(s, 'reb_margin')), 1),
    'team_ast', round(avg(core.sv(s, 'team_ast')), 1),
    'team_tov', round(avg(core.sv(s, 'team_tov')), 1),
    'rival_fg3m', round(avg(core.sv(s, 'rival_fg3m')), 1),
    'team_fta', round(avg(core.sv(s, 'team_fta')), 1)
  ))
  from core.situ_base where match_id = any (p_matches)
$$;

-- SECURITY DEFINER por el REFRESH MATERIALIZED VIEW: vive en core, sin parámetros, search_path
-- vacío y solo la ejecuta service_role (a través de ingest.load_situations).
create function core.refresh_situations()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  season_stats jsonb;
begin
  refresh materialized view core.situ_base;

  delete from core.situational_match where true;
  insert into core.situational_match (card_id, param_value, param_order, match_id)
  select distinct on (card_id, param_value, match_id) card_id, param_value, param_order, match_id
  from (
    select * from core.situ_cards_a union all select * from core.situ_cards_b
    union all select * from core.situ_cards_c union all select * from core.situ_cards_d
    union all select * from core.situ_cards_e union all select * from core.situ_cards_f
    union all select * from core.situ_cards_g union all select * from core.situ_cards_h
    union all select * from core.situ_cards_i union all select * from core.situ_cards_j
  ) cards
  where match_id is not null and param_value is not null
  order by card_id, param_value, match_id, param_order;

  season_stats := core.situ_stat_avgs(array(select match_id from core.situ_base));

  delete from core.situational_result where true;
  insert into core.situational_result (card_id, param_value, param_order, n, w, d, l, win_pct, pf_avg, pa_avg, margin,
                                       base_win_pct, delta, base_pf, base_pa, base_margin, stats, base_stats)
  with base as (
    select avg(case when won then 100.0 else 0 end) as win_pct, avg(pf) as pf, avg(pa) as pa, avg(margin) as margin
    from core.situ_base
  )
  select m.card_id, m.param_value, min(m.param_order), count(*),
         count(*) filter (where b.won), 0, count(*) filter (where not b.won),
         round(avg(case when b.won then 100.0 else 0 end), 1),
         round(avg(b.pf), 1), round(avg(b.pa), 1), round(avg(b.margin), 1),
         round(max(base.win_pct), 1),
         round(avg(case when b.won then 100.0 else 0 end) - max(base.win_pct), 1),
         round(max(base.pf), 1), round(max(base.pa), 1), round(max(base.margin), 1),
         core.situ_stat_avgs(array_agg(m.match_id)), season_stats
  from core.situational_match m
  join core.situ_base b on b.match_id = m.match_id
  cross join base
  group by m.card_id, m.param_value;
end;
$$;
revoke all on function core.refresh_situations() from public, anon, authenticated;
grant execute on function core.refresh_situations() to service_role;

-- Carga del catálogo y refresco (lo llama el pipeline al final de cada carga).
create function ingest.load_situations(p_cards jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  n_cards integer;
begin
  delete from core.situational_catalog where true;
  insert into core.situational_catalog (card_id, category, title_es, condition_es, params_es, measured_es,
                                        required_data, level, available, estimated, reason_es, main_metric,
                                        extra_metrics, sort_order)
  select c ->> 'card_id', c ->> 'category', c ->> 'title_es', c ->> 'condition_es', coalesce(c ->> 'params_es', ''),
         c ->> 'measured_es', c ->> 'required_data', c ->> 'level', (c ->> 'available')::boolean,
         (c ->> 'estimated')::boolean, coalesce(c ->> 'reason_es', ''), coalesce(c ->> 'main_metric', 'win_pct'),
         coalesce(c ->> 'extra_metrics', ''), (c ->> 'sort_order')::smallint
  from jsonb_array_elements(p_cards) c;
  get diagnostics n_cards = row_count;
  perform core.refresh_situations();
  return jsonb_build_object('cards', n_cards, 'rows', (select count(*) from core.situational_result));
end;
$$;
revoke all on function ingest.load_situations(jsonb) from public, anon, authenticated;
grant execute on function ingest.load_situations(jsonb) to service_role;

-- Vistas de la web.
create view api.situational_catalog with (security_invoker = true) as
select card_id, category, title_es, condition_es, params_es, measured_es, required_data, level, available,
       estimated, reason_es, sort_order, main_metric, extra_metrics
from core.situational_catalog;

create view api.situational_result with (security_invoker = true) as
select card_id, param_value, param_order, n, w, d, l, win_pct, pf_avg, pa_avg, margin, base_win_pct, delta,
       base_pf, base_pa, base_margin, stats, base_stats, computed_at
from core.situational_result;

-- Partidos de cada fila («Ver los partidos»), con lo necesario para verificarlos a mano.
create view api.situational_match with (security_invoker = true) as
select m.card_id, m.param_value, m.match_id, b.match_date, b.opponent, b.home, b.pf as points_for,
       b.pa as points_against, b.result
from core.situational_match m
join core.situ_base b on b.match_id = m.match_id;

grant select on api.situational_catalog, api.situational_result, api.situational_match to anon, service_role;
