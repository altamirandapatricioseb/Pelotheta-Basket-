-- =============================================================================
-- Situaciones (Interfaz 4, sección 9.6): bases comunes de todas las tarjetas, como en
-- Pelotheta fútbol.
--
-- Cada tarjeta responde «cuando pasa X, ¿qué le pasa a Boca?». Las consultas de las tarjetas
-- (archivos a_*.sql a j_*.sql) solo dicen qué partidos entran en cada fila: devuelven
-- (card_id, param_value, param_order, match_id). `core.refresh_situations` (zz_refresh.sql)
-- guarda esas filas en `core.situational_match` y calcula el resultado de cada fila (G-P, % de
-- victorias, puntos a favor y en contra, margen y diferencia contra la temporada de Boca).
--
-- Las tarjetas «después de...» ponen en la fila el partido SIGUIENTE (`next_match_id`).
-- =============================================================================

-- Valor numérico de una estadística del partido guardada en jsonb (null si no está).
create function core.sv(p_stats jsonb, p_key text)
returns numeric
language sql immutable
set search_path = ''
as $$ select (p_stats ->> p_key)::numeric $$;

-- Una fila por partido jugado de Boca con todo lo que usan las tarjetas. Materializada: se
-- recalcula al final de cada carga (son pocas filas, tarda milisegundos).
create materialized view core.situ_base as
with boca as (select team_id from core.team where is_boca),
g as (
  select g.game_id as match_id, g.game_date as match_date, g.tip_off_at, g.home_team_id = b.team_id as home,
         case when g.home_team_id = b.team_id then g.away_team_id else g.home_team_id end as opponent_id,
         case when g.home_team_id = b.team_id then g.home_points else g.away_points end as pf,
         case when g.home_team_id = b.team_id then g.away_points else g.home_points end as pa,
         g.overtime_periods, coalesce(d.stats, '{}'::jsonb) as s
  from core.game g
  cross join boca b
  left join core.team_game_derived d on d.game_id = g.game_id
  where g.status = 'jugado' and b.team_id in (g.home_team_id, g.away_team_id)
),
q as (
  -- Puntos de Boca y del rival en cada cuarto (sin suplementarios).
  select ps.game_id,
         sum(case when ps.period = 1 then f end) as q1f, sum(case when ps.period = 1 then a end) as q1a,
         sum(case when ps.period = 2 then f end) as q2f, sum(case when ps.period = 2 then a end) as q2a,
         sum(case when ps.period = 3 then f end) as q3f, sum(case when ps.period = 3 then a end) as q3a,
         sum(case when ps.period = 4 then f end) as q4f, sum(case when ps.period = 4 then a end) as q4a,
         count(*) filter (where ps.period <= 4 and f > a) as quarters_won,
         max(f) filter (where ps.period <= 4) as best_quarter_pts, max(a) filter (where ps.period <= 4) as worst_quarter_pa
  from (
    select ps.game_id, ps.period,
           case when g.home_team_id = b.team_id then ps.home_points else ps.away_points end as f,
           case when g.home_team_id = b.team_id then ps.away_points else ps.home_points end as a
    from core.game_period_score ps
    join core.game g on g.game_id = ps.game_id
    cross join boca b
  ) ps
  group by ps.game_id
),
rival_pace as (
  -- Posesiones por partido de cada equipo en toda la liga (rival rápido o lento).
  select t.team_id, avg(0.5 * ((t.fg2a + t.fg3a) + 0.44 * t.fta - t.orb + t.tov
                              + (o.fg2a + o.fg3a) + 0.44 * o.fta - o.orb + o.tov)) as poss
  from core.team_game_stats t
  join core.team_game_stats o on o.game_id = t.game_id and o.team_id <> t.team_id
  group by t.team_id
)
select g.*, t.name as opponent,
       case when g.pf > g.pa then 'G' else 'P' end as result, g.pf > g.pa as won, g.pf - g.pa as margin,
       q.q1f, q.q1a, q.q2f, q.q2a, q.q3f, q.q3a, q.q4f, q.q4a, q.quarters_won, q.best_quarter_pts, q.worst_quarter_pa,
       q.q1f - q.q1a as q1_diff, q.q1f + q.q2f - q.q1a - q.q2a as half_diff,
       q.q1f + q.q2f + q.q3f - q.q1a - q.q2a - q.q3a as q3_cum_diff,
       pos.value as opponent_position, rp.poss as opponent_pace,
       (select avg(poss) from rival_pace) as league_pace,
       extract(isodow from g.tip_off_at at time zone 'America/Argentina/Buenos_Aires')::int as dow,
       extract(hour from g.tip_off_at at time zone 'America/Argentina/Buenos_Aires')::int as hour_local,
       extract(month from g.match_date)::int as month,
       row_number() over (order by g.tip_off_at) as seq,
       lag(g.match_id) over (order by g.tip_off_at) as prev_match_id,
       lead(g.match_id) over (order by g.tip_off_at) as next_match_id,
       g.match_date - lag(g.match_date) over (order by g.tip_off_at) as rest_days
from g
join core.team t on t.team_id = g.opponent_id
left join q on q.game_id = g.match_id
left join core.stat_value pos on pos.entity = 'equipo' and pos.entity_id = g.opponent_id and pos.stat_id = 'position'
left join rival_pace rp on rp.team_id = g.opponent_id;
create unique index situ_base_match on core.situ_base (match_id);

-- Líneas de box score de los jugadores de Boca con minutos, Game Score y uso del partido.
create view core.situ_line as
with team as (
  select game_id, team_id, sum(seconds) / 60.0 as team_min,
         sum(fg2a + fg3a + 0.44 * fta + tov) as team_plays
  from core.player_game_stats group by game_id, team_id
)
select l.game_id as match_id, l.player_id, coalesce(nullif(p.known_as, ''), p.full_name) as player_name,
       p.position_raw as position, p.nationality, p.birth_date, l.started, l.seconds / 60.0 as minutes,
       l.pts, l.orb + l.drb as reb, l.ast, l.stl, l.blk, l.tov, l.pf, l.fg3m, l.fg3a, l.fg2a + l.fg3a as fga,
       l.fta, l.plus_minus,
       l.pts + 0.4 * (l.fg2m + l.fg3m) - 0.7 * (l.fg2a + l.fg3a) - 0.4 * (l.fta - l.ftm) + 0.7 * l.orb
         + 0.3 * l.drb + l.stl + 0.7 * l.ast + 0.7 * l.blk - 0.4 * l.pf - l.tov as game_score,
       case when l.seconds > 0 and t.team_plays > 0
            then 100 * (l.fg2a + l.fg3a + 0.44 * l.fta + l.tov) * (t.team_min / 5) / ((l.seconds / 60.0) * t.team_plays)
       end as usg_pct
from core.player_game_stats l
join core.team bt on bt.team_id = l.team_id and bt.is_boca
join core.player p on p.player_id = l.player_id
join team t on t.game_id = l.game_id and t.team_id = l.team_id
join core.situ_base b on b.match_id = l.game_id;

-- Líneas de los jugadores del rival (máximo anotador del rival).
create view core.situ_rival_line as
select l.game_id as match_id, l.player_id, l.pts
from core.player_game_stats l
join core.team t on t.team_id = l.team_id and not t.is_boca
join core.situ_base b on b.match_id = l.game_id;
