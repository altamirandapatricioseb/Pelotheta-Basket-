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
