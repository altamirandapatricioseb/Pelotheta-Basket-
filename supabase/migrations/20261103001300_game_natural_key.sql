-- El idPartido de la LNB es una cadena cifrada que cambia en cada pedido: la corrida de GitHub del
-- 3-nov trajo ids nuevos y los 49 partidos quedaron duplicados. Un partido se identifica por su
-- clave natural (temporada, fecha, local, visitante): se unifican los duplicados y se impide que vuelva.

-- 1. Cada id de la fuente apunta al partido más viejo de su grupo.
with groups as (
  select game_id, min(game_id) over (partition by season_id, game_date, home_team_id, away_team_id) as keep
  from core.game
)
update core.source_id_map m
set internal_id = g.keep
from groups g
where m.entity = 'game' and m.internal_id = g.game_id and g.game_id <> g.keep;

-- 2. Se borran las copias (sus detalles se van en cascada; la próxima carga los repone).
delete from core.game g
using (
  select game_id, min(game_id) over (partition by season_id, game_date, home_team_id, away_team_id) as keep
  from core.game
) d
where g.game_id = d.game_id and d.game_id <> d.keep;

-- 3. Nunca más dos filas para el mismo partido.
alter table core.game add constraint game_natural_key unique (season_id, game_date, home_team_id, away_team_id);

-- 4. load_batch: si el id de la fuente es nuevo pero el partido ya existe, se reusa el partido.
do $$
declare
  v_def text := pg_get_functiondef('ingest.load_batch(jsonb)'::regprocedure);
  v_old text := '    v_game_id := ingest.internal_id(v_source, ''game'', r ->> ''source_id'');
    if v_game_id is null then';
  v_new text;
begin
  v_new := replace(v_def, v_old,
'    v_game_id := ingest.internal_id(v_source, ''game'', r ->> ''source_id'');
    if v_game_id is null then
      -- Id nuevo de un partido que ya está (la LNB cambia el id en cada pedido): se reusa.
      select g.game_id into v_game_id
      from core.game g
      where g.season_id = v_season_id
        and g.game_date = ((r ->> ''played_at'')::timestamptz at time zone ''America/Argentina/Buenos_Aires'')::date
        and g.home_team_id = ingest.internal_id(v_source, ''team'', r ->> ''home'')
        and g.away_team_id = ingest.internal_id(v_source, ''team'', r ->> ''away'');
      if v_game_id is not null then
        insert into core.source_id_map (source, entity, source_id, internal_id)
        values (v_source, ''game'', r ->> ''source_id'', v_game_id);
      end if;
    end if;
    if v_game_id is null then');
  if v_new = v_def then
    raise exception 'No se encontró la búsqueda del partido en ingest.load_batch';
  end if;
  execute v_new;
end;
$$;
revoke all on all functions in schema ingest from public, anon, authenticated;
grant execute on all functions in schema ingest to service_role;
