-- Etapa 8 (secciones 10 y 14): libros de Excel del pipeline.
--
-- 1. Bucket público `exports` con los libros. Lectura pública (las URLs del bucket público);
--    escritura solo con la clave secreta, que no pasa por RLS: no se crea ninguna política de
--    escritura. Tamaño máximo y tipos MIME acotados.
-- 2. `api.stat_match_series`: el valor de cada estadística en cada partido, para Boca y para cada
--    jugador del plantel, con las mismas reglas que la desglosada de la web (`api.stat_series`).
--    La lee la hoja `Desglosada` del libro.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exports', 'exports', true, 10485760,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/png'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Jugadores en forma de conjunto (una llamada a player_game_values por línea de box score, no una
-- por estadística): mismas claves, alias y regla de valor que la rama de jugador de stat_series.
create view api.stat_match_series with (security_invoker = true) as
with lines as (
  select l.player_id, l.game_id, v.key, (v.value ->> 0)::numeric as num, (v.value ->> 1)::numeric as den
  from core.player_game_stats l
  join core.team t on t.team_id = l.team_id and t.is_boca
  cross join lateral jsonb_each(core.player_game_values(l)) v
  where l.seconds > 0
)
select c.stat_id, 'jugador'::text as entity, l.player_id as entity_id, b.match_id, b.match_date,
       case when l.den is null then l.num when l.den = 0 then null else l.num / l.den end as value,
       l.num, l.den, 1::numeric as factor
from api.stat_catalog c
join lines l on l.key = core.player_stat_alias(c.stat_id)
join core.situ_base b on b.match_id = l.game_id
where c.entity = 'jugador' and c.available and l.num is not null and (l.den is null or l.den <> 0)
union all
select c.stat_id, 'equipo', 0, s.match_id, s.match_date, s.value, s.num, s.den, s.factor
from api.stat_catalog c
cross join lateral api.stat_series(c.stat_id, 'equipo', null) s
where c.entity = 'equipo' and c.available and s.value is not null;

comment on view api.stat_match_series is
  'Valor de cada estadística por partido (Boca y jugadores del plantel), con las reglas de api.stat_series.';

grant select on api.stat_match_series to anon, service_role;
