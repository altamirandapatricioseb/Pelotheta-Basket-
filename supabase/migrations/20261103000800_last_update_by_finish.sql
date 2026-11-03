-- La última corrida es la que TERMINÓ más tarde: una corrida larga que empezó antes que un fallo
-- posterior no debe quedar tapada por él (pasó el 3-nov con dos intentos fallidos).
create or replace view api.v_last_update
with (security_invoker = true) as
with last_run as (
  select distinct on (source)
         source, trigger, status, started_at, finished_at, rows_loaded, games_added, duration_s
  from core.ingest_log
  order by source, coalesce(finished_at, started_at) desc
),
last_ok as (
  select source, max(finished_at) as last_success_at
  from core.ingest_log
  where status in ('ok', 'parcial')
  group by source
)
select r.source,
       r.source = 'global' as is_global,
       r.trigger,
       r.status            as last_status,
       r.started_at        as last_run_started_at,
       r.finished_at       as last_run_finished_at,
       r.rows_loaded,
       r.games_added,
       r.duration_s,
       o.last_success_at
from last_run r
left join last_ok o using (source);
