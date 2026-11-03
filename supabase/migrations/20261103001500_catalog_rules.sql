-- Catálogo con las columnas de Pelotheta fútbol (sistema madre): abreviatura, cómo leerla,
-- estimada, si se puede llevar a 36 minutos (o a promedio por partido en el equipo) y la regla
-- para agrupar partidos (suma, promedio, máximo o cociente «suma sobre suma» con arg1 / arg2).
alter table core.stat_catalog
  add column short_name text,
  add column reading_es text,
  add column estimated  boolean not null default false,
  add column per_unit   boolean not null default false,
  add column rule       text not null default 'metrica'
    check (rule in ('metrica', 'suma', 'promedio', 'maximo', 'cociente')),
  add column arg1       text check (arg1 ~ '^[a-z0-9_]*$'),
  add column arg2       text check (arg2 ~ '^[a-z0-9_]*$'),
  add column factor     numeric not null default 1;

-- Las columnas nuevas van al final: `create or replace view` no deja insertar en el medio.
create or replace view api.stat_catalog with (security_invoker = true) as
select stat_id, name_es, description_es, stat_group, entity, unit, source, level, formula,
       higher_is_better, available, short_name, reading_es, estimated, per_unit, rule, arg1, arg2, factor
from core.stat_catalog;
grant select on api.stat_catalog to anon, service_role;

do $$
declare
  v_def text := pg_get_functiondef('ingest.load_batch(jsonb)'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
    '         (x ->> ''available'')::boolean
  from jsonb_array_elements(coalesce(p_batch -> ''catalog'', ''[]'')) x;',
    '         (x ->> ''available'')::boolean, nullif(x ->> ''abrev'', ''''), nullif(x ->> ''lectura_es'', ''''),
         coalesce((x ->> ''estimada'')::boolean, false), coalesce((x ->> ''por36'')::boolean, false),
         coalesce(nullif(x ->> ''agregacion'', ''''), ''metrica''), nullif(x ->> ''arg1'', ''''),
         nullif(x ->> ''arg2'', ''''), coalesce(nullif(x ->> ''factor'', '''')::numeric, 1)
  from jsonb_array_elements(coalesce(p_batch -> ''catalog'', ''[]'')) x;');
  if v_new = v_def then
    raise exception 'No se encontró la carga del catálogo en ingest.load_batch';
  end if;
  execute v_new;
end;
$$;
revoke all on all functions in schema ingest from public, anon, authenticated;
grant execute on all functions in schema ingest to service_role;
