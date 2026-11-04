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
