-- load_batch también guarda los datos del plantel (Wikipedia): posición, nacimiento, altura, peso
-- y nacionalidad. Solo pisa un dato si el lote trae uno nuevo (coalesce): una corrida sin
-- Wikipedia no borra lo que ya estaba. `birth_date` sigue sin permiso de lectura para anon.
do $$
declare
  v_def text := pg_get_functiondef('ingest.load_batch(jsonb)'::regprocedure);
  v_new text := v_def;
begin
  v_new := replace(v_new,
    'insert into core.player (full_name, source) values (r ->> ''name'', v_source) returning player_id into v_id;',
    'insert into core.player (full_name, source, birth_date, position_raw, height_cm, weight_kg, nationality)
      values (r ->> ''name'', v_source, (r ->> ''birth_date'')::date, r ->> ''position'',
              (r ->> ''height_cm'')::smallint, (r ->> ''weight_kg'')::smallint, r ->> ''nationality'')
      returning player_id into v_id;');
  v_new := replace(v_new,
    'update core.player set full_name = r ->> ''name'', fetched_at = now() where player_id = v_id;',
    'update core.player
      set full_name = r ->> ''name'',
          birth_date = coalesce((r ->> ''birth_date'')::date, birth_date),
          position_raw = coalesce(r ->> ''position'', position_raw),
          height_cm = coalesce((r ->> ''height_cm'')::smallint, height_cm),
          weight_kg = coalesce((r ->> ''weight_kg'')::smallint, weight_kg),
          nationality = coalesce(r ->> ''nationality'', nationality),
          fetched_at = now()
      where player_id = v_id;');
  if v_new = v_def or v_new !~ 'position_raw = coalesce' or v_new !~ 'nationality\)\s+values' then
    raise exception 'No se encontraron las líneas de jugadores en ingest.load_batch';
  end if;
  execute v_new;
end;
$$;
revoke all on all functions in schema ingest from public, anon, authenticated;
grant execute on all functions in schema ingest to service_role;
