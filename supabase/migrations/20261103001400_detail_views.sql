-- Vistas para las páginas de detalle de partido y de jugador (Interfaces 1 y 2).
-- Solo box score y parciales (estadística derivada pública); nunca el play-by-play ni los tiros.

-- Líneas de jugador de cada partido de Boca, de los dos equipos: box score del partido y
-- registro partido a partido del jugador.
create view api.game_line with (security_invoker = true) as
select s.game_id, g.game_date, s.team_id, t.name as team, t.is_boca, s.player_id,
       coalesce(p.known_as, p.full_name) as player, s.shirt_number, s.started,
       round(s.seconds / 60.0, 1) as minutes, s.pts, s.fg2m, s.fg2a, s.fg3m, s.fg3a, s.ftm, s.fta,
       s.orb, s.drb, s.orb + s.drb as reb, s.ast, s.stl, s.tov, s.blk, s.pf, s.pf_drawn,
       s.efficiency, s.plus_minus
from core.player_game_stats s
join core.game g on g.game_id = s.game_id
join core.team t on t.team_id = s.team_id
join core.player p on p.player_id = s.player_id
where g.status = 'jugado'
  and exists (select 1 from core.team b where b.is_boca and b.team_id in (g.home_team_id, g.away_team_id));
grant select on api.game_line to anon, service_role;

-- Parciales por cuarto de los partidos de Boca, del lado de Boca.
create view api.game_period with (security_invoker = true) as
select ps.game_id, ps.period,
       case when g.home_team_id = b.team_id then ps.home_points else ps.away_points end as points_for,
       case when g.home_team_id = b.team_id then ps.away_points else ps.home_points end as points_against
from core.game_period_score ps
join core.game g on g.game_id = ps.game_id
join core.team b on b.is_boca and b.team_id in (g.home_team_id, g.away_team_id)
where g.status = 'jugado';
grant select on api.game_period to anon, service_role;

-- Datos generales del jugador que no están en player_summary (la fecha de nacimiento no se expone).
create view api.player_bio with (security_invoker = true) as
select player_id, full_name, known_as, position_raw, nationality, height_cm, weight_kg
from core.player;
grant select on api.player_bio to anon, service_role;
