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
