-- Historial de cargas para la Interfaz 6 (9.11): las corridas globales, sin el mensaje interno.
create view api.ingest_history with (security_invoker = true) as
select started_at, finished_at, trigger, status, rows_loaded, games_added, duration_s, db_size_mb
from core.ingest_log
where source = 'global'
order by coalesce(finished_at, started_at) desc
limit 30;
grant select on api.ingest_history to anon, service_role;
