-- =============================================================================
-- Etapa 2: tabla «Resumen» del plantel (Interfaz 3, sección 9.1).
--
-- Una fila por jugador de Boca con totales de la temporada, calculados desde el box score
-- crudo (regla 8: se guardan contadores y todo lo demás se deriva acá o en el pipeline).
-- security_invoker = true: la vista corre con los permisos de anon y respeta RLS.
-- =============================================================================

create view api.player_summary
with (security_invoker = true) as
with boca_lines as (
  -- Solo las líneas de Boca; un jugador que estuvo en el banco sin entrar (0 segundos) no suma partido.
  select s.*
  from core.player_game_stats s
  join core.team t on t.team_id = s.team_id and t.is_boca
),
last_shirt as (
  -- El dorsal puede cambiar en la temporada: se muestra el del último partido.
  select distinct on (l.player_id) l.player_id, l.shirt_number
  from boca_lines l
  join core.game g on g.game_id = l.game_id
  order by l.player_id, g.game_date desc
)
select p.player_id,
       p.full_name,
       p.known_as,
       p.position_raw,
       p.height_cm,
       ls.shirt_number,
       count(*) filter (where l.seconds > 0)::int  as matches,
       count(*) filter (where l.started)::int       as starts,
       round(sum(l.seconds) / 60.0)::int             as minutes,
       sum(l.pts)::int                               as pts,
       sum(l.orb + l.drb)::int                       as reb,
       sum(l.ast)::int                               as ast,
       sum(l.efficiency)::int                        as efficiency
from boca_lines l
join core.player p on p.player_id = l.player_id
left join last_shirt ls on ls.player_id = l.player_id
group by p.player_id, p.full_name, p.known_as, p.position_raw, p.height_cm, ls.shirt_number;
comment on view api.player_summary is 'Resumen del plantel de Boca: partidos, minutos, puntos, rebotes, asistencias y valoración.';

grant select on api.player_summary to anon, service_role;
