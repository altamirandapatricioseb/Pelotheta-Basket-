-- La fecha del partido es la de Argentina, no la de UTC: un partido de las 21:05 en Buenos Aires
-- son las 00:05 del día siguiente en UTC y quedaba con la fecha corrida.
do $$
declare
  v_def text := pg_get_functiondef('ingest.load_batch(jsonb)'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
    '(r ->> ''played_at'')::timestamptz::date',
    '((r ->> ''played_at'')::timestamptz at time zone ''America/Argentina/Buenos_Aires'')::date');
  if v_new = v_def then
    raise exception 'No se encontró el cálculo de la fecha en ingest.load_batch';
  end if;
  execute v_new;
end;
$$;
revoke all on all functions in schema ingest from public, anon, authenticated;
grant execute on all functions in schema ingest to service_role;

update core.game
set game_date = (tip_off_at at time zone 'America/Argentina/Buenos_Aires')::date
where tip_off_at is not null
  and game_date <> (tip_off_at at time zone 'America/Argentina/Buenos_Aires')::date;
