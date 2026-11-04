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
