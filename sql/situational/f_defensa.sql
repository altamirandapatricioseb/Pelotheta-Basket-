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
