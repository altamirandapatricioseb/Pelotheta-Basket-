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
