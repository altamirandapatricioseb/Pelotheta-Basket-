-- Las tablas del equipo (Interfaz 2) salen de dos lugares: valores de temporada (tabla de la
-- liga) o partido a partido de Boca. `scope` dice de dónde lee cada conjunto.
alter table core.stat_set add column scope text not null default 'temporada'
  check (scope in ('temporada', 'partido'));

-- Va al final de la vista: create or replace solo permite agregar columnas al final.
create or replace view api.stat_set_column with (security_invoker = true) as
select s.set_id, s.entity, s.name_es as set_name, s.sort_order as set_order, i.stat_id, i.sort_order, s.scope
from core.stat_set s
join core.stat_set_item i using (set_id);
