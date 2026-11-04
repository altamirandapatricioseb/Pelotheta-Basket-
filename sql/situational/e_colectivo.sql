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
