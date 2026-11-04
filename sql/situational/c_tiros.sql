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
