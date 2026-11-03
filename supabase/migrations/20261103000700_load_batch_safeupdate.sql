-- La Data API de Supabase usa pg-safeupdate: un DELETE sin WHERE se rechaza. load_batch
-- reemplaza a propósito el catálogo y los conjuntos completos dentro de la misma transacción,
-- así que se hace explícito con `where true`.
do $$
declare
  v_def text := pg_get_functiondef('ingest.load_batch(jsonb)'::regprocedure);
  v_new text := v_def;
begin
  v_new := replace(v_new, 'delete from core.stat_set;', 'delete from core.stat_set where true;');
  v_new := replace(v_new, 'delete from core.stat_value;', 'delete from core.stat_value where true;');
  v_new := replace(v_new, 'delete from core.stat_catalog;', 'delete from core.stat_catalog where true;');
  if v_new = v_def or v_new ~ 'delete from core\.stat_(set|value|catalog);' then
    raise exception 'No se encontraron los DELETE a corregir en ingest.load_batch';
  end if;
  execute v_new;
end;
$$;
revoke all on all functions in schema ingest from public, anon, authenticated;
grant execute on all functions in schema ingest to service_role;
