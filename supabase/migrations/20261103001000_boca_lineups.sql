-- Quintetos de Boca (5.8): minutos, posesiones estimadas y ratings con esos cinco en cancha.
-- Es un agregado de la temporada, no el play-by-play crudo, así que es público.
create table core.boca_lineup (
  lineup_key    text primary key check (lineup_key ~ '^[0-9-]+$'),
  players       text not null,
  stats         jsonb not null,
  small_sample  boolean not null,
  computed_at   timestamptz not null default now()
);
alter table core.boca_lineup enable row level security;
create policy anon_read on core.boca_lineup for select to anon using (true);
grant select on core.boca_lineup to anon;

create view api.boca_lineup with (security_invoker = true) as
select lineup_key, players, stats, small_sample from core.boca_lineup;
grant select on api.boca_lineup to anon, service_role;

-- Tercer origen de filas para las tablas del equipo.
alter table core.stat_set drop constraint stat_set_scope_check;
alter table core.stat_set add constraint stat_set_scope_check check (scope in ('temporada', 'partido', 'quinteto'));

-- load_batch también reemplaza los quintetos, en la misma transacción que el resto.
do $$
declare
  v_def text := pg_get_functiondef('ingest.load_batch(jsonb)'::regprocedure);
  v_anchor text := '  insert into core.team_game_derived (game_id, stats)';
  v_new text;
begin
  v_new := replace(v_def, v_anchor,
    '  delete from core.boca_lineup where true;
  insert into core.boca_lineup (lineup_key, players, stats, small_sample)
  select x ->> ''lineup_key'', x ->> ''players'', x -> ''stats'', (x ->> ''small_sample'')::boolean
  from jsonb_array_elements(coalesce(p_batch -> ''lineups'', ''[]'')) x;

' || v_anchor);
  if v_new = v_def then
    raise exception 'No se encontró dónde agregar los quintetos en ingest.load_batch';
  end if;
  execute v_new;
end;
$$;
revoke all on all functions in schema ingest from public, anon, authenticated;
grant execute on all functions in schema ingest to service_role;
