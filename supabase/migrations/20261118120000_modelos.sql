-- Modelos (interfaces Valor, Alternativas y Predictor), como en Pelotheta fútbol y adaptados al básquet:
-- * Valor: regresión lineal con toda la liga (minutos que la producción justifica o, con valores
--   cargados, valor de mercado). Las columnas *_eur guardan la variable objetivo del run (su unidad
--   está en model_run.params.unit), con los mismos nombres que fútbol para reciclar la web.
-- * Alternativas: perfiles con K-means y los más parecidos de otros clubes, en dupla y del plantel.
-- * Predictor: puntos por regresión lineal y margen normal (en básquet no hay empates).
-- Lo calcula Python (pipeline/analytics.py) y lo carga `ingest.load_models` reemplazando todo lo del
-- equipo. Todas las tablas llevan team_slug (web/config/teams.ts): listas para más equipos.

create table core.model_run (
  model       text not null check (model in ('valor_mercado', 'alternativas', 'predictor_partido')),
  team_slug   text not null check (team_slug ~ '^[a-z0-9-]+$'),
  status      text not null check (status in ('ok', 'sin_datos')),
  n           integer not null check (n >= 0),
  metrics     jsonb not null default '{}',
  params      jsonb not null default '{}',
  message     text,
  trained_at  timestamptz not null default now(),
  primary key (model, team_slug)
);

create table core.market_value_prediction (
  team_slug      text not null,
  player_id      integer not null references core.player (player_id) on delete cascade,
  actual_eur     numeric check (actual_eur >= 0),
  predicted_eur  numeric check (predicted_eur >= 0),
  low_eur        numeric,
  high_eur       numeric,
  residual_pct   numeric,
  features       jsonb not null,
  detail         jsonb not null default '{}',
  primary key (team_slug, player_id)
);

create table core.market_value_coef (
  team_slug  text not null,
  feature    text not null,
  coef       numeric not null,
  std_err    numeric not null,
  t_stat     numeric not null,
  p_value    numeric not null check (p_value between 0 and 1),
  ci_low     numeric not null,
  ci_high    numeric not null,
  primary key (team_slug, feature)
);

create table core.player_style (
  team_slug      text not null,
  player_id      integer not null references core.player (player_id) on delete cascade,
  cluster        smallint not null check (cluster >= 0),
  cluster_label  text not null,
  pc1            numeric not null,
  pc2            numeric not null,
  features       jsonb not null,
  z              jsonb not null,
  percentiles    jsonb not null,
  primary key (team_slug, player_id)
);

create table core.player_alternative (
  team_slug        text not null,
  player_id        integer not null references core.player (player_id) on delete cascade,
  section          text not null check (section in ('externo', 'dupla', 'club')),
  rank             smallint not null check (rank >= 1),
  members          jsonb not null,
  similarity       numeric not null check (similarity between 0 and 100),
  total_value_eur  numeric,
  savings_eur      numeric,
  primary key (team_slug, player_id, section, rank)
);

create table core.match_prediction (
  prediction_id  bigint generated always as identity primary key,
  team_slug      text not null,
  kind           text not null check (kind in ('escenario', 'backtest')),
  match_date     date,
  home_team      text not null,
  away_team      text not null,
  pts_home       numeric not null,
  pts_away       numeric not null,
  p_home         numeric not null check (p_home between 0 and 1),
  p_away         numeric not null check (p_away between 0 and 1),
  margin_sd      numeric not null check (margin_sd > 0),
  detail         jsonb not null default '{}',
  actual_home    smallint check (actual_home >= 0),
  actual_away    smallint check (actual_away >= 0),
  competition    text not null default 'liga',
  neutral        boolean not null default false,
  unique nulls not distinct (team_slug, kind, home_team, away_team, match_date, neutral)
);

-- Perfil de cada club para que la web calcule cualquier cruce (un club o la media de una liga,
-- de un país o de toda la zona) con los β del modelo.
create table core.team_strength (
  team_slug       text not null,
  team_name       text not null,
  competition     text not null default 'liga',
  country         text,
  league          text,
  estimated       boolean not null default false,
  games           integer not null default 0 check (games >= 0),
  points_for      integer not null default 0 check (points_for >= 0),
  points_against  integer not null default 0 check (points_against >= 0),
  profile         jsonb not null,
  elo             numeric,
  form            numeric,
  primary key (team_slug, team_name, competition)
);

create table core.stat_test (
  team_slug    text not null,
  test_id      text not null check (test_id ~ '^[a-z_0-9]+$'),
  title_es     text not null,
  statistic    numeric not null,
  df           integer,
  p_value      numeric check (p_value between 0 and 1),
  decision_es  text not null,
  detail       jsonb not null default '{}',
  primary key (team_slug, test_id)
);

-- Lectura pública (solo SELECT) como el resto del modelo; la escritura es del pipeline.
do $$
declare t text;
begin
  foreach t in array array['model_run', 'market_value_prediction', 'market_value_coef', 'player_style',
                           'player_alternative', 'match_prediction', 'team_strength', 'stat_test'] loop
    execute format('alter table core.%I enable row level security', t);
    execute format('create policy anon_read on core.%I for select to anon, powerbi_reader using (true)', t);
    execute format('grant select on core.%I to anon, powerbi_reader', t);
  end loop;
end $$;

-- Vistas públicas. El nombre del jugador sale de core.player; la fecha de nacimiento no.
create view api.model_run with (security_invoker = true) as
select model, team_slug, status, n, metrics, params, message, trained_at from core.model_run;
comment on view api.model_run is 'Estado, muestra, métricas y parámetros de cada modelo por equipo.';

create view api.market_value_prediction with (security_invoker = true) as
select m.team_slug, m.player_id, coalesce(p.known_as, p.full_name) as player_name, p.position_raw as position_group,
       m.actual_eur, m.predicted_eur, m.low_eur, m.high_eur, m.residual_pct, m.features, m.detail
from core.market_value_prediction m
join core.player p using (player_id);
comment on view api.market_value_prediction is 'Valor real contra el que predice la regresión (minutos o valor, ver model_run.params).';

create view api.market_value_coef with (security_invoker = true) as
select team_slug, feature, coef, std_err, t_stat, p_value, ci_low, ci_high from core.market_value_coef;
comment on view api.market_value_coef is 'Coeficientes de la regresión con error estándar, t, p e intervalo del 95 %.';

create view api.player_style with (security_invoker = true) as
select st.team_slug, st.player_id, coalesce(p.known_as, p.full_name) as player_name, p.position_raw as position_group,
       st.cluster, st.cluster_label, st.pc1, st.pc2, st.features, st.z, st.percentiles
from core.player_style st
join core.player p using (player_id);
comment on view api.player_style is 'Perfil de juego (grupo de K-means) y proyección en 2 componentes principales.';

create view api.player_alternative with (security_invoker = true) as
select team_slug, player_id, section, rank, members, similarity, total_value_eur, savings_eur
from core.player_alternative;
comment on view api.player_alternative is 'Alternativas de cada jugador de mejor a peor: otro club, dupla y compañero.';

create view api.match_prediction with (security_invoker = true) as
select team_slug, kind, match_date, home_team, away_team, pts_home, pts_away, p_home, p_away, margin_sd, detail,
       actual_home, actual_away, competition, neutral
from core.match_prediction;
comment on view api.match_prediction is 'Predicción por partido (puntos y margen normal): backtest sin mirar el futuro.';

create view api.team_strength with (security_invoker = true) as
select team_slug, team_name, competition, country, league, estimated, games, points_for, points_against, profile,
       elo, form
from core.team_strength;
comment on view api.team_strength is 'Perfil de cada club (ataque, defensa, ritmo, cuatro factores, Elo y forma) para el predictor.';

create view api.stat_test with (security_invoker = true) as
select team_slug, test_id, title_es, statistic, df, p_value, decision_es, detail from core.stat_test;
comment on view api.stat_test is 'Pruebas de hipótesis e intervalos de confianza del equipo (panel Probabilidad).';

grant select on api.model_run, api.market_value_prediction, api.market_value_coef, api.player_style,
  api.player_alternative, api.match_prediction, api.team_strength, api.stat_test
  to anon, powerbi_reader, service_role;

-- Carga: reemplaza todo lo del equipo en una transacción (la función entera lo es). Los jugadores
-- llegan con su id de la LNB (source_player_id) y se traducen con core.source_id_map.
create function ingest.load_models(p_payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_team text := p_payload ->> 'team_slug';
  v_counts jsonb := '{}';
  n integer;
begin
  if v_team is null or v_team !~ '^[a-z0-9-]+$' then
    raise exception 'team_slug inválido';
  end if;
  delete from core.model_run where team_slug = v_team;
  delete from core.market_value_prediction where team_slug = v_team;
  delete from core.market_value_coef where team_slug = v_team;
  delete from core.player_style where team_slug = v_team;
  delete from core.player_alternative where team_slug = v_team;
  delete from core.match_prediction where team_slug = v_team;
  delete from core.team_strength where team_slug = v_team;
  delete from core.stat_test where team_slug = v_team;

  insert into core.model_run (model, team_slug, status, n, metrics, params, message)
  select r.model, v_team, r.status, r.n, coalesce(r.metrics, '{}'), coalesce(r.params, '{}'), r.message
  from jsonb_to_recordset(coalesce(p_payload -> 'runs', '[]'))
       as r(model text, status text, n integer, metrics jsonb, params jsonb, message text);

  insert into core.market_value_prediction (team_slug, player_id, actual_eur, predicted_eur, low_eur, high_eur,
                                            residual_pct, features, detail)
  select v_team, m.internal_id, r.actual_eur, r.predicted_eur, r.low_eur, r.high_eur, r.residual_pct, r.features,
         coalesce(r.detail, '{}')
  from jsonb_to_recordset(coalesce(p_payload -> 'market_predictions', '[]'))
       as r(source_player_id text, actual_eur numeric, predicted_eur numeric, low_eur numeric, high_eur numeric,
            residual_pct numeric, features jsonb, detail jsonb)
  join core.source_id_map m on m.source = 'lnb' and m.entity = 'player' and m.source_id = r.source_player_id;
  get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('market_predictions', n);

  insert into core.market_value_coef (team_slug, feature, coef, std_err, t_stat, p_value, ci_low, ci_high)
  select v_team, r.feature, r.coef, r.std_err, r.t_stat, r.p_value, r.ci_low, r.ci_high
  from jsonb_to_recordset(coalesce(p_payload -> 'market_coefs', '[]'))
       as r(feature text, coef numeric, std_err numeric, t_stat numeric, p_value numeric, ci_low numeric,
            ci_high numeric);

  insert into core.player_style (team_slug, player_id, cluster, cluster_label, pc1, pc2, features, z, percentiles)
  select v_team, m.internal_id, r.cluster, r.cluster_label, r.pc1, r.pc2, r.features, r.z, r.percentiles
  from jsonb_to_recordset(coalesce(p_payload -> 'styles', '[]'))
       as r(source_player_id text, cluster smallint, cluster_label text, pc1 numeric, pc2 numeric,
            features jsonb, z jsonb, percentiles jsonb)
  join core.source_id_map m on m.source = 'lnb' and m.entity = 'player' and m.source_id = r.source_player_id;
  get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('styles', n);

  insert into core.player_alternative (team_slug, player_id, section, rank, members, similarity, total_value_eur,
                                       savings_eur)
  select v_team, m.internal_id, r.section, r.rank, r.members, r.similarity, r.total_value_eur, r.savings_eur
  from jsonb_to_recordset(coalesce(p_payload -> 'alternatives', '[]'))
       as r(source_player_id text, section text, rank smallint, members jsonb, similarity numeric,
            total_value_eur numeric, savings_eur numeric)
  join core.source_id_map m on m.source = 'lnb' and m.entity = 'player' and m.source_id = r.source_player_id;
  get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('alternatives', n);

  insert into core.match_prediction (team_slug, kind, match_date, home_team, away_team, pts_home, pts_away, p_home,
                                     p_away, margin_sd, detail, actual_home, actual_away, competition, neutral)
  select v_team, r.kind, r.match_date, r.home_team, r.away_team, r.pts_home, r.pts_away, r.p_home, r.p_away,
         r.margin_sd, coalesce(r.detail, '{}'), r.actual_home, r.actual_away, coalesce(r.competition, 'liga'),
         coalesce(r.neutral, false)
  from jsonb_to_recordset(coalesce(p_payload -> 'match_predictions', '[]'))
       as r(kind text, match_date date, home_team text, away_team text, pts_home numeric, pts_away numeric,
            p_home numeric, p_away numeric, margin_sd numeric, detail jsonb, actual_home smallint,
            actual_away smallint, competition text, neutral boolean);
  get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('match_predictions', n);

  insert into core.team_strength (team_slug, team_name, competition, country, league, estimated, games, points_for,
                                  points_against, profile, elo, form)
  select v_team, r.team_name, coalesce(r.competition, 'liga'), r.country, r.league, coalesce(r.estimated, false),
         coalesce(r.games, 0), coalesce(r.points_for, 0), coalesce(r.points_against, 0), r.profile, r.elo, r.form
  from jsonb_to_recordset(coalesce(p_payload -> 'strengths', '[]'))
       as r(team_name text, competition text, country text, league text, estimated boolean, games integer,
            points_for integer, points_against integer, profile jsonb, elo numeric, form numeric);
  get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('strengths', n);

  insert into core.stat_test (team_slug, test_id, title_es, statistic, df, p_value, decision_es, detail)
  select v_team, r.test_id, r.title_es, r.statistic, r.df, r.p_value, r.decision_es, coalesce(r.detail, '{}')
  from jsonb_to_recordset(coalesce(p_payload -> 'tests', '[]'))
       as r(test_id text, title_es text, statistic numeric, df integer, p_value numeric, decision_es text,
            detail jsonb);
  get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('tests', n);
  return v_counts;
end;
$$;
revoke all on function ingest.load_models(jsonb) from public, anon, authenticated;
grant execute on function ingest.load_models(jsonb) to service_role;
