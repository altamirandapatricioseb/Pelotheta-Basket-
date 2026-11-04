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
