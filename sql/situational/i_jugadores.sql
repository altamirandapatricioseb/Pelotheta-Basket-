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
