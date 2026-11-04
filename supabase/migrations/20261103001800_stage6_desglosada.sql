-- Etapa 6: estadística desglosada (9.8), como en Pelotheta fútbol. La serie partido a partido y
-- las ventanas de tiempo se resuelven en SQL (`api.stat_series` y `api.stat_windows`), sin
-- precalcular. Equipo y rival: el valor guardado de cada partido (con numerador y denominador
-- para los cocientes). Jugador: los valores de su box score en cada partido que jugó.

-- Valores por partido de un jugador: [numerador, denominador] (denominador null = conteo).
create function core.player_game_values(l core.player_game_stats)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'pts', jsonb_build_array(l.pts, null), 'trb', jsonb_build_array(l.orb + l.drb, null),
    'orb', jsonb_build_array(l.orb, null), 'drb', jsonb_build_array(l.drb, null),
    'ast', jsonb_build_array(l.ast, null), 'stl', jsonb_build_array(l.stl, null),
    'blk', jsonb_build_array(l.blk, null), 'tov', jsonb_build_array(l.tov, null),
    'pf', jsonb_build_array(l.pf, null), 'pf_drawn', jsonb_build_array(l.pf_drawn, null),
    'minutes', jsonb_build_array(round(l.seconds / 60.0, 1), null),
    'efficiency', jsonb_build_array(l.efficiency, null), 'plus_minus', jsonb_build_array(l.plus_minus, null),
    'fgm', jsonb_build_array(l.fg2m + l.fg3m, null), 'fga', jsonb_build_array(l.fg2a + l.fg3a, null),
    'fg2m', jsonb_build_array(l.fg2m, null), 'fg2a', jsonb_build_array(l.fg2a, null),
    'fg3m', jsonb_build_array(l.fg3m, null), 'fg3a', jsonb_build_array(l.fg3a, null),
    'ftm', jsonb_build_array(l.ftm, null), 'fta', jsonb_build_array(l.fta, null),
    'fg_pct', jsonb_build_array(l.fg2m + l.fg3m, l.fg2a + l.fg3a),
    'fg2_pct', jsonb_build_array(l.fg2m, l.fg2a), 'fg3_pct', jsonb_build_array(l.fg3m, l.fg3a),
    'ft_pct', jsonb_build_array(l.ftm, l.fta),
    'efg', jsonb_build_array(l.fg2m + l.fg3m + 0.5 * l.fg3m, l.fg2a + l.fg3a),
    'ts', jsonb_build_array(l.pts, 2 * (l.fg2a + l.fg3a + 0.44 * l.fta)),
    'ast_to', jsonb_build_array(l.ast, l.tov), 'three_rate', jsonb_build_array(l.fg3a, l.fg2a + l.fg3a),
    'ft_rate', jsonb_build_array(l.fta, l.fg2a + l.fg3a), 'points_per_shot', jsonb_build_array(l.pts, l.fg2a + l.fg3a),
    'game_score_avg', jsonb_build_array(
      l.pts + 0.4 * (l.fg2m + l.fg3m) - 0.7 * (l.fg2a + l.fg3a) - 0.4 * (l.fta - l.ftm) + 0.7 * l.orb
        + 0.3 * l.drb + l.stl + 0.7 * l.ast + 0.7 * l.blk - 0.4 * l.pf - l.tov, null)
  )
$$;

-- Estadísticas de temporada que, partido a partido, son un valor del box score.
create function core.player_stat_alias(p_stat text)
returns text
language sql immutable
set search_path = ''
as $$
  select coalesce(jsonb_build_object(
    'ppg', 'pts', 'rpg', 'trb', 'apg', 'ast', 'spg', 'stl', 'bpg', 'blk', 'tpg', 'tov', 'mpg', 'minutes',
    'fpg', 'pf', 'pm_per_game', 'plus_minus', 'max_pts', 'pts', 'max_trb', 'trb', 'max_ast', 'ast',
    'max_efficiency', 'efficiency', 'ppg_last5', 'pts', 'rpg_last5', 'trb', 'apg_last5', 'ast',
    'mpg_last5', 'minutes', 'ppg_home', 'pts', 'ppg_away', 'pts', 'ppg_wins', 'pts', 'ppg_losses', 'pts'
  ) ->> p_stat, p_stat)
$$;

create function api.stat_series(p_stat text, p_entity text, p_id integer default null)
returns table (
  match_id integer, match_date date, competition_code text, competition_name text, opponent text, home boolean,
  result text, points_for integer, points_against integer, minutes numeric, num numeric, den numeric,
  factor numeric, value numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with cat as (select rule, arg1, arg2, factor from api.stat_catalog where stat_id = p_stat),
  team as (
    select b.match_id, b.match_date, b.opponent_id, b.opponent, b.home, b.result, b.pf, b.pa,
           case when c.rule = 'cociente' then core.sv(b.s, c.arg1) else core.sv(b.s, p_stat) end as num,
           case when c.rule = 'cociente' then core.sv(b.s, c.arg2) end as den,
           case when c.rule = 'cociente' then c.factor else 1 end as factor
    from core.situ_base b cross join cat c
    where p_entity in ('equipo', 'rival') and (p_entity = 'equipo' or b.opponent_id = p_id)
  ),
  player as (
    select b.match_id, b.match_date, b.opponent, b.home, b.result, b.pf, b.pa, round(l.seconds / 60.0, 1) as minutes,
           (core.player_game_values(l) -> core.player_stat_alias(p_stat) ->> 0)::numeric as num,
           (core.player_game_values(l) -> core.player_stat_alias(p_stat) ->> 1)::numeric as den
    from core.player_game_stats l
    join core.situ_base b on b.match_id = l.game_id
    join core.team t on t.team_id = l.team_id and t.is_boca
    where p_entity = 'jugador' and l.player_id = p_id and l.seconds > 0
  )
  select match_id, match_date, 'lnb', 'Liga Nacional', opponent, home, result, pf, pa, null::numeric, num, den, factor,
         case when den is null then num when den = 0 then null else num / den * factor end
  from team
  union all
  select match_id, match_date, 'lnb', 'Liga Nacional', opponent, home, result, pf, pa, minutes, num, den, 1,
         case when den is null then num when den = 0 then null else num / den end
  from player
  order by match_date
$$;

create function api.stat_windows(p_stat text, p_entity text, p_id integer default null)
returns table (
  window_key text, label text, sort_order integer, n integer, value numeric, total numeric,
  best numeric, worst numeric, season numeric, delta numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with cat as (select rule, higher_is_better from api.stat_catalog where stat_id = p_stat),
  s as (
    select x.*, row_number() over (order by x.match_date desc) as rn
    from api.stat_series(p_stat, p_entity, p_id) x
    where x.value is not null
  ),
  last as (select max(match_date) as d from s),
  w as (
    -- Una fila por (ventana, partido). Las ventanas de días se miden desde el último partido.
    select 'u1' as window_key, 'Último partido' as label, 1 as sort_order, s.* from s where rn = 1
    union all select 'u3', 'Últimos 3 partidos', 2, s.* from s where rn <= 3
    union all select 'u5', 'Últimos 5 partidos', 3, s.* from s where rn <= 5
    union all select 'u10', 'Últimos 10 partidos', 4, s.* from s where rn <= 10
    union all select 'd' || d.days, 'Últimos ' || d.days || ' días', 4 + d.o::int, s.*
      from s, last, unnest(array[7, 14, 30, 60, 90]) with ordinality d (days, o)
      where s.match_date > last.d - d.days
    union all select 'mes', 'Mes en curso', 10, s.* from s, last
      where date_trunc('month', s.match_date) = date_trunc('month', last.d)
    union all select 'mes_anterior', 'Mes anterior', 11, s.* from s, last
      where date_trunc('month', s.match_date) = date_trunc('month', last.d) - interval '1 month'
    union all select 'temporada', 'Temporada', 12, s.* from s
    union all select 'comp:' || s.competition_code, s.competition_name, 20, s.* from s
    union all select case when s.home then 'local' else 'visitante' end,
                     case when s.home then 'Local' else 'Visitante' end, case when s.home then 30 else 31 end, s.* from s
    union all select 'res:' || s.result, case s.result when 'G' then 'En victorias' else 'En derrotas' end,
                     case s.result when 'G' then 40 else 42 end, s.* from s
    union all select 'rival:' || s.opponent, s.opponent, 50, s.* from s
  ),
  agg as (
    -- Cocientes: suma sobre suma; conteos y promedios: promedio por partido (y total si se suma).
    select w.window_key, w.label, w.sort_order, count(*)::int as n,
           case when count(w.den) > 0 then sum(w.num) / nullif(sum(w.den), 0) * max(w.factor) else avg(w.value) end as value,
           case when count(w.den) = 0 and (p_entity = 'jugador' or cat.rule = 'suma') then sum(w.value) end as total,
           case when cat.higher_is_better then max(w.value) else min(w.value) end as best,
           case when cat.higher_is_better then min(w.value) else max(w.value) end as worst
    from w cross join cat
    group by w.window_key, w.label, w.sort_order, cat.rule, cat.higher_is_better
  )
  select a.window_key, a.label, a.sort_order, a.n, a.value, a.total, a.best, a.worst, t.value, a.value - t.value
  from agg a
  cross join (select value from agg where window_key = 'temporada') t
  -- Por rival solo con 2 o más partidos contra el mismo.
  where not (a.window_key like 'rival:%' and a.n < 2)
  order by a.sort_order, a.label
$$;

grant execute on function core.player_game_values(core.player_game_stats) to anon, service_role;
grant execute on function core.player_stat_alias(text) to anon, service_role;
grant execute on function core.sv(jsonb, text) to anon, service_role;
grant execute on function api.stat_series(text, text, integer) to anon, service_role;
grant execute on function api.stat_windows(text, text, integer) to anon, service_role;
