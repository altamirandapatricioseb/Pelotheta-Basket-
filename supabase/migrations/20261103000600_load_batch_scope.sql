-- ingest.load_batch también guarda el `scope` de cada conjunto (migración anterior).
-- Se reescribe solo esa línea de la definición vigente, sin repetir la función entera.
do $$
declare
  v_def text := pg_get_functiondef('ingest.load_batch(jsonb)'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
    'insert into core.stat_set (set_id, entity, name_es, sort_order)',
    'insert into core.stat_set (set_id, entity, name_es, sort_order, scope)');
  v_new := replace(v_new,
    'x ->> ''name_es'', (x ->> ''sort_order'')::smallint',
    'x ->> ''name_es'', (x ->> ''sort_order'')::smallint, coalesce(x ->> ''scope'', ''temporada'')');
  if v_new = v_def or v_new !~ 'sort_order, scope\)' then
    raise exception 'No se encontró la línea a reemplazar en ingest.load_batch';
  end if;
  execute v_new;
end;
$$;
revoke all on all functions in schema ingest from public, anon, authenticated;
grant execute on all functions in schema ingest to service_role;
