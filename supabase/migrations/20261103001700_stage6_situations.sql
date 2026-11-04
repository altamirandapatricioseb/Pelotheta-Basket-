-- Etapa 6: Situaciones (9.6). Generada a partir de sql/situational/*.sql, en ese orden.

-- ---- 00_base.sql ----
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

-- ---- a_marcador.sql ----
-- =============================================================================
-- A. Marcador, cuartos y definiciones (tarjetas s001 a s014).
-- Cada SELECT devuelve los partidos de una fila: (card_id, param_value, param_order, match_id).
-- =============================================================================
create view core.situ_cards_a as
-- s001 y s002: ventaja o desventaja al descanso, por tramos.
select 's001' as card_id,
       case when half_diff <= 5 then '+1 a +5' when half_diff <= 10 then '+6 a +10' else '+11 o más' end as param_value,
       case when half_diff <= 5 then 1 when half_diff <= 10 then 2 else 3 end as param_order, match_id
from core.situ_base where half_diff > 0
union all
select 's002', case when half_diff >= -5 then '−1 a −5' when half_diff >= -10 then '−6 a −10' else '−11 o más' end,
       case when half_diff >= -5 then 1 when half_diff >= -10 then 2 else 3 end, match_id
from core.situ_base where half_diff < 0
union all
-- s003: empate al descanso.
select 's003', 'Empate al descanso', 1, match_id from core.situ_base where half_diff = 0
union all
-- s004 y s005: ventaja o desventaja al terminar el 3.er cuarto.
select 's004', case when q3_cum_diff <= 5 then '+1 a +5' when q3_cum_diff <= 10 then '+6 a +10' else '+11 o más' end,
       case when q3_cum_diff <= 5 then 1 when q3_cum_diff <= 10 then 2 else 3 end, match_id
from core.situ_base where q3_cum_diff > 0
union all
select 's005', case when q3_cum_diff >= -5 then '−1 a −5' when q3_cum_diff >= -10 then '−6 a −10' else '−11 o más' end,
       case when q3_cum_diff >= -5 then 1 when q3_cum_diff >= -10 then 2 else 3 end, match_id
from core.situ_base where q3_cum_diff < 0
union all
-- s006 y s007: ventaja o desventaja al terminar el 1.er cuarto.
select 's006', case when q1_diff <= 5 then '+1 a +5' else '+6 o más' end, case when q1_diff <= 5 then 1 else 2 end, match_id
from core.situ_base where q1_diff > 0
union all
select 's007', case when q1_diff >= -5 then '−1 a −5' else '−6 o más' end, case when q1_diff >= -5 then 1 else 2 end, match_id
from core.situ_base where q1_diff < 0
union all
-- s008: cantidad de cuartos ganados.
select 's008', case when quarters_won = 1 then '1 cuarto' else quarters_won || ' cuartos' end, quarters_won::int, match_id from core.situ_base where quarters_won is not null
union all
-- s009: partidos decididos por 5 puntos o menos.
select 's009', case when abs(margin) <= 5 then 'Por 5 o menos' else 'Por 6 o más' end,
       case when abs(margin) <= 5 then 1 else 2 end, match_id
from core.situ_base
union all
-- s010: por 1 a 3 puntos y con suplementario.
select 's010', 'Por 1 a 3 puntos', 1, match_id from core.situ_base where abs(margin) <= 3
union all
select 's010', 'Con suplementario', 2, match_id from core.situ_base where overtime_periods > 0
union all
-- s011: ventaja máxima alcanzada (play-by-play).
select 's011', case when core.sv(s, 'max_lead') < 10 then 'Menos de 10' when core.sv(s, 'max_lead') < 20 then '10 a 19' else '20 o más' end,
       case when core.sv(s, 'max_lead') < 10 then 1 when core.sv(s, 'max_lead') < 20 then 2 else 3 end, match_id
from core.situ_base where core.sv(s, 'max_lead') is not null
union all
-- s012: remontadas, desventaja máxima que tuvo que levantar (play-by-play).
select 's012', '5 o más abajo', 1, match_id from core.situ_base where core.sv(s, 'max_deficit') >= 5
union all
select 's012', '10 o más abajo', 2, match_id from core.situ_base where core.sv(s, 'max_deficit') >= 10
union all
select 's012', '15 o más abajo', 3, match_id from core.situ_base where core.sv(s, 'max_deficit') >= 15
union all
-- s013: victorias y derrotas por 15 o más.
select 's013', case when margin > 0 then 'Ganó por 15 o más' else 'Perdió por 15 o más' end,
       case when margin > 0 then 1 else 2 end, match_id
from core.situ_base where abs(margin) >= 15
union all
-- s014: último cuarto, quién lo ganó.
select 's014', case when q4f > q4a then 'Ganó el 4.º cuarto' when q4f < q4a then 'Perdió el 4.º cuarto' else 'Empató el 4.º cuarto' end,
       case when q4f > q4a then 1 when q4f < q4a then 2 else 3 end, match_id
from core.situ_base where q4f is not null;

-- ---- b_anotacion.sql ----
-- =============================================================================
-- B. Anotación y ritmo (tarjetas s015 a s026).
-- =============================================================================
create view core.situ_cards_b as
-- s015: anotar 80, 90 o 100 puntos o más (las filas se superponen: es «al menos»).
select 's015' as card_id, x || ' o más' as param_value, x as param_order, match_id
from core.situ_base cross join (values (80), (90), (100)) t (x) where pf >= x
union all
-- s016: recibir 70, 75 u 80 puntos o menos.
select 's016', x || ' o menos', x, match_id
from core.situ_base cross join (values (70), (75), (80)) t (x) where pa <= x
union all
-- s017: ritmo alto y bajo (posesiones cada 40 minutos).
select 's017', case when core.sv(s, 'pace') >= 76 then '76 o más' when core.sv(s, 'pace') >= 72 then '72 a 75,9' else 'Menos de 72' end,
       case when core.sv(s, 'pace') >= 76 then 1 when core.sv(s, 'pace') >= 72 then 2 else 3 end, match_id
from core.situ_base where core.sv(s, 'pace') is not null
union all
-- s018: ORtg de 110 o más y de 90 o menos.
select 's018', 'ORtg 110 o más', 1, match_id from core.situ_base where core.sv(s, 'ortg') >= 110
union all
select 's018', 'ORtg 90 o menos', 2, match_id from core.situ_base where core.sv(s, 'ortg') <= 90
union all
-- s019: DRtg de 95 o menos y de 110 o más.
select 's019', 'DRtg 95 o menos', 1, match_id from core.situ_base where core.sv(s, 'drtg') <= 95
union all
select 's019', 'DRtg 110 o más', 2, match_id from core.situ_base where core.sv(s, 'drtg') >= 110
union all
-- s020: Net Rating de +10 o más y de −10 o menos.
select 's020', 'Net Rating +10 o más', 1, match_id from core.situ_base where core.sv(s, 'net_rating') >= 10
union all
select 's020', 'Net Rating −10 o menos', 2, match_id from core.situ_base where core.sv(s, 'net_rating') <= -10
union all
-- s021: puntos totales del partido.
select 's021', case when pf + pa <= 160 then '160 o menos' when pf + pa <= 170 then '161 a 170'
                    when pf + pa <= 180 then '171 a 180' else 'Más de 180' end,
       case when pf + pa <= 160 then 1 when pf + pa <= 170 then 2 when pf + pa <= 180 then 3 else 4 end, match_id
from core.situ_base
union all
-- s022: cuartos de 25 puntos o más a favor.
select 's022', case n when 0 then 'Ningún cuarto de 25' when 1 then '1 cuarto de 25 o más' else '2 o más cuartos de 25' end,
       least(n, 2), match_id
from (select match_id, (q1f >= 25)::int + (q2f >= 25)::int + (q3f >= 25)::int + (q4f >= 25)::int as n
      from core.situ_base where q1f is not null) t
union all
-- s023: primer cuarto de 20 puntos o más.
select 's023', case when q1f >= 20 then 'Primer cuarto de 20 o más' else 'Primer cuarto de menos de 20' end,
       case when q1f >= 20 then 1 else 2 end, match_id
from core.situ_base where q1f is not null
union all
-- s024: recibir 25 o más en algún cuarto.
select 's024', case when worst_quarter_pa >= 25 then 'Recibió 25 o más en un cuarto' else 'Nunca recibió 25 en un cuarto' end,
       case when worst_quarter_pa >= 25 then 1 else 2 end, match_id
from core.situ_base where worst_quarter_pa is not null
union all
-- s026: puntos de segunda oportunidad (play-by-play).
select 's026', case when core.sv(s, 'pts_second_chance') >= 10 then '10 o más' else 'Menos de 10' end,
       case when core.sv(s, 'pts_second_chance') >= 10 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'pts_second_chance') is not null;

-- ---- c_tiros.sql ----
-- =============================================================================
-- C. Tiros (tarjetas s027 a s040). Los porcentajes del partido se guardan como proporción.
-- =============================================================================
create view core.situ_cards_c as
-- s027: triples convertidos (al menos 8, 10 o 12).
select 's027' as card_id, x || ' o más' as param_value, x as param_order, match_id
from core.situ_base cross join (values (8), (10), (12)) t (x) where core.sv(s, 'team_fg3m') >= x
union all
-- s028: % de triples de 40 % o más y de 28 % o menos.
select 's028', '40 % o más', 1, match_id from core.situ_base where core.sv(s, 'team_fg3_pct') >= 0.40
union all
select 's028', '28 % o menos', 2, match_id from core.situ_base where core.sv(s, 'team_fg3_pct') <= 0.28
union all
-- s029: 30 triples intentados o más.
select 's029', case when core.sv(s, 'team_fg3a') >= 30 then '30 o más intentos' else 'Menos de 30' end,
       case when core.sv(s, 'team_fg3a') >= 30 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'team_fg3a') is not null
union all
-- s030: eFG% de 55 % o más y de 45 % o menos.
select 's030', 'eFG% 55 % o más', 1, match_id from core.situ_base where core.sv(s, 'efg') >= 0.55
union all
select 's030', 'eFG% 45 % o menos', 2, match_id from core.situ_base where core.sv(s, 'efg') <= 0.45
union all
-- s031: TS% de 58 % o más.
select 's031', case when core.sv(s, 'ts') >= 0.58 then 'TS% 58 % o más' else 'TS% menor a 58 %' end,
       case when core.sv(s, 'ts') >= 0.58 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'ts') is not null
union all
-- s032: 25 tiros libres intentados o más.
select 's032', case when core.sv(s, 'team_fta') >= 25 then '25 o más libres' else 'Menos de 25' end,
       case when core.sv(s, 'team_fta') >= 25 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'team_fta') is not null
union all
-- s033: % de libres de 75 % o más y de 65 % o menos.
select 's033', '75 % o más', 1, match_id from core.situ_base where core.sv(s, 'team_ft_pct') >= 0.75
union all
select 's033', '65 % o menos', 2, match_id from core.situ_base where core.sv(s, 'team_ft_pct') <= 0.65
union all
-- s034: % de dobles de 50 % o más.
select 's034', case when core.sv(s, 'team_fg2m') / nullif(core.sv(s, 'team_fg2a'), 0) >= 0.5 then '50 % o más' else 'Menos de 50 %' end,
       case when core.sv(s, 'team_fg2m') / nullif(core.sv(s, 'team_fg2a'), 0) >= 0.5 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'team_fg2a') > 0
union all
-- s035: más tiros de campo intentados que el rival.
select 's035', case when core.sv(s, 'team_fga') > core.sv(s, 'rival_fga') then 'Más que el rival' else 'Igual o menos' end,
       case when core.sv(s, 'team_fga') > core.sv(s, 'rival_fga') then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'rival_fga') is not null
union all
-- s036: eFG% del rival de 48 % o menos.
select 's036', case when core.sv(s, 'efg_against') <= 0.48 then 'Rival con 48 % o menos' else 'Rival con más de 48 %' end,
       case when core.sv(s, 'efg_against') <= 0.48 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'efg_against') is not null
union all
-- s037: triples del rival (defensa del perímetro).
select 's037', case when core.sv(s, 'rival_fg3m') >= 10 then 'Rival con 10 o más triples' else 'Rival con menos de 10' end,
       case when core.sv(s, 'rival_fg3m') >= 10 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'rival_fg3m') is not null
union all
-- s038: tiros libres del rival.
select 's038', case when core.sv(s, 'rival_fta') >= 25 then 'Rival con 25 o más libres' else 'Rival con menos de 25' end,
       case when core.sv(s, 'rival_fta') >= 25 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'rival_fta') is not null
union all
-- s039: precisión por zona (zonas de la LNB agrupadas, ver pipeline/extras.py).
select 's039', 'Cerca del aro 60 % o más', 1, match_id from core.situ_base where core.sv(s, 'team_aro_fg_pct') >= 0.60
union all
select 's039', 'Cerca del aro menos de 60 %', 2, match_id from core.situ_base where core.sv(s, 'team_aro_fg_pct') < 0.60
union all
select 's039', 'Triple frontal 35 % o más', 3, match_id from core.situ_base where core.sv(s, 'team_frontal3_fg_pct') >= 0.35
union all
-- s040: 3PAr de 40 % o más (estilo de triples).
select 's040', case when core.sv(s, 'three_rate') >= 0.40 then '40 % o más de los tiros son triples' else 'Menos de 40 %' end,
       case when core.sv(s, 'three_rate') >= 0.40 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'three_rate') is not null;

-- ---- d_rebotes.sql ----
-- =============================================================================
-- D. Rebotes y posesiones (tarjetas s041 a s050).
-- =============================================================================
create view core.situ_cards_d as
-- s041: más rebotes que el rival.
select 's041' as card_id,
       case when core.sv(s, 'reb_margin') > 0 then 'Más rebotes' when core.sv(s, 'reb_margin') < 0 then 'Menos rebotes' else 'Igual' end as param_value,
       case when core.sv(s, 'reb_margin') > 0 then 1 when core.sv(s, 'reb_margin') < 0 then 2 else 3 end as param_order, match_id
from core.situ_base where core.sv(s, 'reb_margin') is not null
union all
-- s042: 12 rebotes ofensivos o más.
select 's042', case when core.sv(s, 'team_orb') >= 12 then '12 o más' else 'Menos de 12' end,
       case when core.sv(s, 'team_orb') >= 12 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'team_orb') is not null
union all
-- s043: ORB% de 30 % o más.
select 's043', case when core.sv(s, 'orb_pct_team') >= 0.30 then '30 % o más' else 'Menos de 30 %' end,
       case when core.sv(s, 'orb_pct_team') >= 0.30 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'orb_pct_team') is not null
union all
-- s044: DRB% de 75 % o más.
select 's044', case when core.sv(s, 'team_drb_pct') >= 0.75 then '75 % o más' else 'Menos de 75 %' end,
       case when core.sv(s, 'team_drb_pct') >= 0.75 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'team_drb_pct') is not null
union all
-- s045: puntos de segunda oportunidad concedidos (play-by-play).
select 's045', case when core.sv(s, 'pts_second_chance_rival') >= 10 then '10 o más concedidos' else 'Menos de 10' end,
       case when core.sv(s, 'pts_second_chance_rival') >= 10 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'pts_second_chance_rival') is not null
union all
-- s046: diferencia de rebotes de +10 o −10.
select 's046', '+10 o más', 1, match_id from core.situ_base where core.sv(s, 'reb_margin') >= 10
union all
select 's046', '−10 o menos', 2, match_id from core.situ_base where core.sv(s, 'reb_margin') <= -10
union all
-- s047: posesiones extra (ORB + robos − pérdidas, contra las del rival).
select 's047', case when core.sv(s, 'extra_possessions') > 0 then 'A favor' when core.sv(s, 'extra_possessions') < 0 then 'En contra' else 'Parejas' end,
       case when core.sv(s, 'extra_possessions') > 0 then 1 when core.sv(s, 'extra_possessions') < 0 then 2 else 3 end, match_id
from core.situ_base where core.sv(s, 'extra_possessions') is not null
union all
-- s048: pérdidas, 10 o menos y 18 o más.
select 's048', '10 o menos', 1, match_id from core.situ_base where core.sv(s, 'team_tov') <= 10
union all
select 's048', '18 o más', 2, match_id from core.situ_base where core.sv(s, 'team_tov') >= 18
union all
-- s049: 10 robos o más.
select 's049', case when core.sv(s, 'team_stl') >= 10 then '10 o más' else 'Menos de 10' end,
       case when core.sv(s, 'team_stl') >= 10 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'team_stl') is not null
union all
-- s050: 5 tapas o más.
select 's050', case when core.sv(s, 'team_blk') >= 5 then '5 o más' else 'Menos de 5' end,
       case when core.sv(s, 'team_blk') >= 5 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'team_blk') is not null;

-- ---- e_colectivo.sql ----
-- =============================================================================
-- E. Asistencias y juego colectivo (tarjetas s051 a s056).
-- =============================================================================
create view core.situ_cards_e as
with bench as (
  select match_id, sum(pts) filter (where not started) as bench_pts,
         count(*) filter (where pts >= 10) as scorers10,
         bool_or(usg_pct >= 30 and minutes >= 10) as heavy_user
  from core.situ_line group by match_id
)
-- s051: asistencias, 20 o más y 12 o menos.
select 's051' as card_id, '20 o más' as param_value, 1 as param_order, match_id
from core.situ_base where core.sv(s, 'team_ast') >= 20
union all
select 's051', '12 o menos', 2, match_id from core.situ_base where core.sv(s, 'team_ast') <= 12
union all
-- s052: relación asistencia/pérdida de 1,5 o más.
select 's052', case when core.sv(s, 'team_ast') / nullif(core.sv(s, 'team_tov'), 0) >= 1.5 then 'AST/TOV 1,5 o más' else 'Menos de 1,5' end,
       case when core.sv(s, 'team_ast') / nullif(core.sv(s, 'team_tov'), 0) >= 1.5 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'team_tov') > 0
union all
-- s053: 60 % o más de canastas asistidas.
select 's053', case when core.sv(s, 'team_ast_fgm') >= 0.6 then '60 % o más asistidas' else 'Menos de 60 %' end,
       case when core.sv(s, 'team_ast_fgm') >= 0.6 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'team_ast_fgm') is not null
union all
-- s054: puntos de la banca.
select 's054', '30 o más', 1, match_id from bench where bench_pts >= 30
union all
select 's054', '15 o menos', 2, match_id from bench where bench_pts <= 15
union all
-- s055: cantidad de jugadores con 10 puntos o más.
select 's055', case when scorers10 >= 4 then '4 o más' else scorers10::text end, least(scorers10, 4)::int, match_id from bench
union all
-- s056: algún jugador con 30 % o más de uso (y 10 minutos o más).
select 's056', case when heavy_user then 'Con un jugador de 30 % o más de uso' else 'Uso repartido' end,
       case when heavy_user then 1 else 2 end, match_id
from bench;

-- ---- f_defensa.sql ----
-- =============================================================================
-- F. Defensa y faltas (tarjetas s057 a s064).
-- =============================================================================
create view core.situ_cards_f as
with fouls as (
  select match_id, count(*) filter (where pf >= 4) as four_fouls, bool_or(pf >= 5) as fouled_out
  from core.situ_line group by match_id
),
rival_top as (select match_id, max(pts) as top from core.situ_rival_line group by match_id)
-- s057: faltas cometidas, 25 o más y 18 o menos.
select 's057' as card_id, '25 o más' as param_value, 1 as param_order, match_id
from core.situ_base where core.sv(s, 'team_pf') >= 25
union all
select 's057', '18 o menos', 2, match_id from core.situ_base where core.sv(s, 'team_pf') <= 18
union all
-- s058: faltas del rival, 25 o más.
select 's058', case when core.sv(s, 'rival_pf') >= 25 then 'Rival con 25 o más' else 'Rival con menos de 25' end,
       case when core.sv(s, 'rival_pf') >= 25 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'rival_pf') is not null
union all
-- s059: jugadores con 4 faltas o más y descalificados (5 faltas).
select 's059', case when four_fouls >= 2 then '2 o más con 4 faltas' else four_fouls || ' con 4 faltas' end,
       least(four_fouls, 2)::int, match_id
from fouls
union all
select 's059', 'Con un descalificado', 3, match_id from fouls where fouled_out
union all
-- s061: tiros libres concedidos frente al resultado.
select 's061', case when core.sv(s, 'rival_fta') <= 15 then '15 o menos' when core.sv(s, 'rival_fta') < 25 then '16 a 24' else '25 o más' end,
       case when core.sv(s, 'rival_fta') <= 15 then 1 when core.sv(s, 'rival_fta') < 25 then 2 else 3 end, match_id
from core.situ_base where core.sv(s, 'rival_fta') is not null
union all
-- s062: el rival anota 90 puntos o más.
select 's062', case when pa >= 90 then 'Rival con 90 o más' else 'Rival con menos de 90' end,
       case when pa >= 90 then 1 else 2 end, match_id
from core.situ_base
union all
-- s063: el rival tiene un anotador de 25 puntos o más.
select 's063', case when top >= 25 then 'Con un anotador de 25 o más' else 'Sin anotador de 25' end,
       case when top >= 25 then 1 else 2 end, match_id
from rival_top
union all
-- s064: resultado según el máximo anotador del rival.
select 's064', case when top < 15 then 'Menos de 15' when top < 20 then '15 a 19' when top < 25 then '20 a 24' else '25 o más' end,
       case when top < 15 then 1 when top < 20 then 2 when top < 25 then 3 else 4 end, match_id
from rival_top;

-- ---- g_contexto.sql ----
-- =============================================================================
-- G. Contexto (tarjetas s065 a s078). Las fechas y horas son de Buenos Aires.
-- =============================================================================
create view core.situ_cards_g as
-- s065: local y visitante.
select 's065' as card_id, case when home then 'Local' else 'Visitante' end as param_value,
       case when home then 1 else 2 end as param_order, match_id
from core.situ_base
union all
-- s066: local y visitante por competición (por ahora solo la Liga Nacional).
select 's066', 'Liga Nacional · ' || case when home then 'local' else 'visitante' end, case when home then 1 else 2 end, match_id
from core.situ_base
union all
-- s067: descanso desde el partido anterior.
select 's067', case when rest_days <= 1 then 'Días consecutivos' when rest_days <= 3 then '1 o 2 días libres' else '3 días libres o más' end,
       case when rest_days <= 1 then 1 when rest_days <= 3 then 2 else 3 end, match_id
from core.situ_base where rest_days is not null
union all
-- s068: partidos de Boca en los últimos 7 días, contando este.
select 's068', case when n >= 3 then '3 o más en 7 días' else n || ' en 7 días' end, least(n, 3)::int, match_id
from (
  select b.match_id, (select count(*) from core.situ_base o where o.match_date between b.match_date - 6 and b.match_date) as n
  from core.situ_base b
) t
union all
-- s070: día de la semana.
select 's070', (array['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'])[dow], dow, match_id
from core.situ_base where dow is not null
union all
-- s071: franja horaria del salto inicial.
select 's071', case when hour_local < 20 then 'Antes de las 20' when hour_local < 22 then '20 a 21:59' else '22 o más tarde' end,
       case when hour_local < 20 then 1 when hour_local < 22 then 2 else 3 end, match_id
from core.situ_base where hour_local is not null
union all
-- s072: mes del año.
select 's072', (array['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre',
                      'Octubre', 'Noviembre', 'Diciembre'])[month], month, match_id
from core.situ_base
union all
-- s073: fase de la temporada (primeras 10 fechas de Boca o el resto; sin playoffs todavía).
select 's073', case when seq <= 10 then 'Primeras 10 fechas' else 'Desde la fecha 11' end, case when seq <= 10 then 1 else 2 end, match_id
from core.situ_base
union all
-- s074: rival según su Elo antes del partido (1500 es el promedio de la liga).
select 's074', case when core.sv(s, 'elo_rival_pre') >= 1530 then 'Elo 1530 o más' when core.sv(s, 'elo_rival_pre') >= 1500 then '1500 a 1529'
                    when core.sv(s, 'elo_rival_pre') >= 1470 then '1470 a 1499' else 'Menos de 1470' end,
       case when core.sv(s, 'elo_rival_pre') >= 1530 then 1 when core.sv(s, 'elo_rival_pre') >= 1500 then 2
            when core.sv(s, 'elo_rival_pre') >= 1470 then 3 else 4 end, match_id
from core.situ_base where core.sv(s, 'elo_rival_pre') is not null
union all
-- s075: rival según su puesto actual en la tabla.
select 's075', case when opponent_position <= 4 then 'Rival del 1.º al 4.º' when opponent_position <= 8 then '5.º al 8.º'
                    when opponent_position <= 12 then '9.º al 12.º' else '13.º o más abajo' end,
       case when opponent_position <= 4 then 1 when opponent_position <= 8 then 2 when opponent_position <= 12 then 3 else 4 end, match_id
from core.situ_base where opponent_position is not null
union all
-- s076: rival rápido o lento (sus posesiones por partido contra el promedio de la liga).
select 's076', case when opponent_pace >= league_pace then 'Rival rápido' else 'Rival lento' end,
       case when opponent_pace >= league_pace then 1 else 2 end, match_id
from core.situ_base where opponent_pace is not null
union all
-- s077: historial contra cada rival.
select 's077', opponent, dense_rank() over (order by opponent)::int, match_id from core.situ_base;

-- ---- h_forma.sql ----
-- =============================================================================
-- H. Forma y rachas (tarjetas s079 a s088). Las «después de...» miden el partido SIGUIENTE.
-- =============================================================================
create view core.situ_cards_h as
with seq as (
  -- Racha en curso al terminar cada partido: largo de la serie de resultados iguales.
  select b.*, count(*) over (partition by result, grp order by seq) as streak
  from (select *, seq - row_number() over (partition by result order by seq) as grp from core.situ_base) b
),
prev5 as (
  select match_id, (select count(*) filter (where o.won) from core.situ_base o where o.seq between b.seq - 5 and b.seq - 1) as wins,
         (select count(*) from core.situ_base o where o.seq between b.seq - 5 and b.seq - 1) as games
  from core.situ_base b
),
streaks as (
  -- Las rachas más largas de victorias y de derrotas de la temporada.
  select result, grp, count(*) as len, rank() over (partition by result order by count(*) desc) as rk
  from (select *, seq - row_number() over (partition by result order by seq) as grp from core.situ_base) b
  group by result, grp
),
nr3 as (
  select match_id, avg(core.sv(s, 'net_rating')) over (order by seq rows between 3 preceding and 1 preceding) as nr_prev,
         count(*) over (order by seq rows between 3 preceding and 1 preceding) as n_prev
  from core.situ_base
)
-- s079: después de una victoria o de una derrota.
select 's079' as card_id, case when won then 'Tras ganar' else 'Tras perder' end as param_value,
       case when won then 1 else 2 end as param_order, next_match_id as match_id
from core.situ_base where next_match_id is not null
union all
-- s080: después de una paliza (15 puntos o más) a favor o en contra.
select 's080', case when margin > 0 then 'Tras ganar por 15 o más' else 'Tras perder por 15 o más' end,
       case when margin > 0 then 1 else 2 end, next_match_id
from core.situ_base where abs(margin) >= 15 and next_match_id is not null
union all
-- s081: después de 3 o más victorias o derrotas seguidas.
select 's081', case when won then 'Tras 3 o más victorias seguidas' else 'Tras 3 o más derrotas seguidas' end,
       case when won then 1 else 2 end, next_match_id
from seq where streak >= 3 and next_match_id is not null
union all
-- s082: forma de los 5 partidos anteriores (solo si ya jugó 5).
select 's082', case when wins <= 1 then '0 o 1 victoria en 5' when wins <= 3 then '2 o 3 victorias en 5' else '4 o 5 victorias en 5' end,
       case when wins <= 1 then 1 when wins <= 3 then 2 else 3 end, match_id
from prev5 where games = 5
union all
-- s083: venía de anotar 90 puntos o más.
select 's083', case when pf >= 90 then 'Venía de anotar 90 o más' else 'Venía de anotar menos de 90' end,
       case when pf >= 90 then 1 else 2 end, next_match_id
from core.situ_base where next_match_id is not null
union all
-- s084: venía de un partido con 8 triples o más.
select 's084', case when core.sv(s, 'team_fg3m') >= 8 then 'Venía de 8 triples o más' else 'Venía de menos de 8' end,
       case when core.sv(s, 'team_fg3m') >= 8 then 1 else 2 end, next_match_id
from core.situ_base where next_match_id is not null and core.sv(s, 'team_fg3m') is not null
union all
-- s085: después de un partido con tiempo suplementario.
select 's085', 'Tras un suplementario', 1, next_match_id from core.situ_base where overtime_periods > 0 and next_match_id is not null
union all
-- s086: después de una derrota por 1 a 3 puntos.
select 's086', 'Tras perder por 1 a 3', 1, next_match_id from core.situ_base where margin between -3 and -1 and next_match_id is not null
union all
-- s087: partidos de las rachas más largas de la temporada.
select 's087', case when s.result = 'G' then 'Racha de victorias más larga (' else 'Racha de derrotas más larga (' end || s.len || ')',
       case when s.result = 'G' then 1 else 2 end, b.match_id
from streaks s
join (select *, seq - row_number() over (partition by result order by seq) as grp from core.situ_base) b
  on b.result = s.result and b.grp = s.grp
where s.rk = 1
union all
-- s088: tendencia del Net Rating de los 3 partidos anteriores.
select 's088', case when nr_prev >= 0 then 'Venía con Net Rating positivo' else 'Venía con Net Rating negativo' end,
       case when nr_prev >= 0 then 1 else 2 end, match_id
from nr3 where n_prev = 3;

-- ---- i_jugadores.sql ----
-- =============================================================================
-- I. Jugadores y plantel (tarjetas s089 a s112). Las de «cuando X...» tienen una fila por
-- jugador de Boca: el orden de la fila es su id para que no cambie entre corridas.
-- =============================================================================
create view core.situ_cards_i as
with l as (select * from core.situ_line where minutes > 0),
starters as (
  select match_id, array_agg(player_id order by player_id) as five,
         count(*) filter (where position in ('Ala-pívot', 'Pívot')) as bigs,
         count(*) filter (where minutes >= 32) as heavy
  from core.situ_line where started group by match_id
),
by_game as (
  select l.match_id, count(*) filter (where l.minutes >= 10) as rotation,
         count(*) filter (where l.nationality is not null and l.nationality <> 'ARG') as foreign_players,
         avg(extract(year from age(b.match_date, l.birth_date))) as avg_age,
         sum(l.pts) filter (where not l.started) as bench_pts
  from l join core.situ_base b on b.match_id = l.match_id group by l.match_id
),
rival_bench as (
  select s.game_id as match_id, sum(s.pts) filter (where not s.started) as pts
  from core.player_game_stats s
  join core.team t on t.team_id = s.team_id and not t.is_boca
  join core.situ_base b on b.match_id = s.game_id
  group by s.game_id
),
best as (
  select distinct on (match_id) match_id, player_id, player_name from l order by match_id, game_score desc
),
top_usg as (
  select distinct on (match_id) match_id, player_id, player_name from l where minutes >= 10 order by match_id, usg_pct desc nulls last
),
ever as (select distinct player_id, player_name from core.situ_line where started),
seq as (select match_id, seq, match_date from core.situ_base)
-- s089: con X de titular y sin X de titular.
select 's089' as card_id, e.player_name || ': titular' as param_value, e.player_id * 2 as param_order, b.match_id
from ever e join core.situ_line s on s.player_id = e.player_id and s.started join core.situ_base b on b.match_id = s.match_id
union all
select 's089', e.player_name || ': sin ser titular', e.player_id * 2 + 1, b.match_id
from ever e cross join core.situ_base b
where not exists (select 1 from core.situ_line s where s.player_id = e.player_id and s.match_id = b.match_id and s.started)
union all
-- s090 a s100: cuando un jugador hace algo en el partido.
select 's090', player_name, player_id, match_id from l where pts >= 20
union all
select 's091', player_name, player_id, match_id from l
where (pts >= 10)::int + (reb >= 10)::int + (ast >= 10)::int + (stl >= 10)::int + (blk >= 10)::int >= 2
union all
select 's092', player_name, player_id, match_id from l where pf >= 4
union all
select 's093', player_name, player_id, match_id from l where minutes >= 30
union all
select 's094', player_name, player_id, match_id from l where minutes < 20
union all
select 's095', player_name, player_id, match_id from l where fg3a >= 5 and fg3m::numeric / fg3a >= 0.4
union all
select 's096', player_name, player_id, match_id from l where fga > 15
union all
select 's097', player_name, player_id, match_id from l where tov >= 6
union all
select 's098', player_name, player_id, match_id from l where ast >= 6
union all
select 's099', player_name, player_id, match_id from l where reb >= 10
union all
select 's100', player_name, player_id, match_id from l where game_score >= 20
union all
-- s101: el mejor jugador del partido (Game Score) frente al resultado.
select 's101', player_name, player_id, match_id from best
union all
-- s102: mismo quinteto titular que el partido anterior o con cambios.
select 's102', case when s.five = p.five then 'Mismo quinteto que el anterior' else 'Con cambios en el quinteto' end,
       case when s.five = p.five then 1 else 2 end, s.match_id
from starters s join core.situ_base b on b.match_id = s.match_id join starters p on p.match_id = b.prev_match_id
union all
-- s105: titulares con 32 minutos o más.
select 's105', case when heavy >= 2 then '2 o más titulares con 32 minutos' else heavy || ' con 32 minutos' end, least(heavy, 2)::int, match_id
from starters
union all
-- s106: la banca de Boca anota más que la del rival.
select 's106', case when g.bench_pts > r.pts then 'La banca anota más que la del rival' else 'Igual o menos' end,
       case when g.bench_pts > r.pts then 1 else 2 end, g.match_id
from by_game g join rival_bench r on r.match_id = g.match_id
union all
-- s107: edad promedio de los que jugaron.
select 's107', case when avg_age >= 28 then 'Promedio de 28 años o más' else 'Promedio de menos de 28' end,
       case when avg_age >= 28 then 1 else 2 end, match_id
from by_game where avg_age is not null
union all
-- s108: extranjeros en cancha.
select 's108', case when foreign_players >= 2 then '2 extranjeros o más' when foreign_players = 1 then '1 extranjero' else foreign_players || ' extranjeros' end,
       least(foreign_players, 2)::int, match_id
from by_game
union all
-- s109: rotación (jugadores con 10 minutos o más).
select 's109', case when rotation <= 8 then '8 o menos' when rotation = 9 then '9' else '10 o más' end,
       case when rotation <= 8 then 1 when rotation = 9 then 2 else 3 end, match_id
from by_game
union all
-- s110: el jugador más usado (USG%) frente al resultado.
select 's110', player_name, player_id, match_id from top_usg
union all
-- s111: quinteto titular con 2 grandes o con 1.
select 's111', case when bigs >= 3 then '3 grandes o más' when bigs = 2 then '2 grandes' else '1 grande o ninguno' end,
       case when bigs >= 3 then 3 when bigs = 2 then 2 else 1 end, match_id
from starters
union all
-- s112: algún jugador con más de 35 minutos jugando en días consecutivos.
select distinct 's112', 'Más de 35 minutos en días consecutivos', 1, l.match_id
from l join seq s on s.match_id = l.match_id join seq p on p.seq = s.seq - 1
where l.minutes > 35 and s.match_date - p.match_date <= 1;

-- ---- j_cuartos.sql ----
-- =============================================================================
-- J. Cuartos y minutos (tarjetas s113 a s118).
-- =============================================================================
create view core.situ_cards_j as
with q as (
  select match_id, q, f - a as diff, f
  from core.situ_base
  cross join lateral (values (1, q1f, q1a), (2, q2f, q2a), (3, q3f, q3a), (4, q4f, q4a)) v (q, f, a)
  where q1f is not null
)
-- s113: el mejor cuarto de Boca en cada partido.
select 's113' as card_id, q || '.º cuarto' as param_value, q as param_order, match_id
from (select distinct on (match_id) match_id, q from q order by match_id, diff desc, q) t
union all
-- s114: primera mitad frente a segunda mitad.
select 's114', case when h1 > 0 and h2 > 0 then 'Ganó las dos mitades' when h1 > 0 then 'Ganó solo la primera'
                    when h2 > 0 then 'Ganó solo la segunda' else 'No ganó ninguna' end,
       case when h1 > 0 and h2 > 0 then 1 when h1 > 0 then 2 when h2 > 0 then 3 else 4 end, match_id
from (select match_id, half_diff as h1, q3f + q4f - q3a - q4a as h2 from core.situ_base where q1f is not null) t
union all
-- s115: cada cuarto ganado por Boca (las filas se superponen).
select 's115', 'Ganó el ' || q || '.º cuarto', q, match_id from q where diff > 0
union all
-- s116: arranques de cuarto (primeros minutos, play-by-play).
select 's116', case when core.sv(s, 'quarter_start_diff') > 0 then 'Arranques a favor' else 'Arranques parejos o en contra' end,
       case when core.sv(s, 'quarter_start_diff') > 0 then 1 else 2 end, match_id
from core.situ_base where core.sv(s, 'quarter_start_diff') is not null
union all
-- s117: cierres en partidos ajustados (play-by-play).
select 's117', case when core.sv(s, 'clutch_net') > 0 then 'Cierre a favor' else 'Cierre parejo o en contra' end,
       case when core.sv(s, 'clutch_net') > 0 then 1 else 2 end, match_id
from core.situ_base where abs(margin) <= 5 and core.sv(s, 'clutch_net') is not null
union all
-- s118: el cuarto de menos puntos frente al resultado final.
select 's118', case when lo <= 15 then 'Algún cuarto de 15 o menos' else 'Todos los cuartos de 16 o más' end,
       case when lo <= 15 then 1 else 2 end, match_id
from (select match_id, least(q1f, q2f, q3f, q4f) as lo from core.situ_base where q1f is not null) t;

-- ---- zz_refresh.sql ----
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
