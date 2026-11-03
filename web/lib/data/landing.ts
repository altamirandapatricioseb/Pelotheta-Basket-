import 'server-only';

import { getCatalog, getPlayerRows, getTeamMatches } from '@/lib/data/catalog';
import type { Line } from '@/lib/data/details';
import { fetchAll, getTeamRows, type TeamRow } from '@/lib/data/players';
import type { PlayerRow, StatDef, TeamMatchRow } from '@/lib/stats/catalog';
import { createApiClient } from '@/lib/supabase/server';

export interface LeagueGame {
  date: string;
  home: string;
  away: string;
  homePoints: number;
  awayPoints: number;
}

/** Todo lo que dibujan los gráficos de la Interfaz 1 (9.2), leído una sola vez por página. */
export interface LandingData {
  matches: TeamMatchRow[];
  players: PlayerRow[];
  catalog: StatDef[];
  /** Líneas de box score de los jugadores de Boca, partido por partido. */
  lines: Line[];
  periods: { gameId: number; period: number; pointsFor: number; pointsAgainst: number }[];
  /** Tabla de la liga con las estadísticas de temporada de cada equipo. */
  league: TeamRow[];
  leagueGames: LeagueGame[];
  /** Fecha de la última carga correcta. */
  updated: string | null;
}

/** null si la base no responde (la página muestra el aviso PEL-DB-001). */
export async function getLandingData(): Promise<LandingData | null> {
  try {
    const client = createApiClient();
    const [matches, players, catalog, league, lines, periods, leagueGames, updated] = await Promise.all([
      getTeamMatches(),
      getPlayerRows(),
      getCatalog(),
      getTeamRows('temporada'),
      fetchAll((from, to) =>
        client.from('game_line').select('*').eq('is_boca', true).order('game_id').order('player_id').range(from, to),
      ),
      client.from('game_period').select('game_id, period, points_for, points_against').limit(1000),
      fetchAll((from, to) =>
        client
          .from('league_game')
          .select('game_date, home, away, home_points, away_points')
          .order('game_date')
          .order('game_id')
          .range(from, to),
      ),
      client.from('v_last_update').select('last_success_at').eq('is_global', true).limit(1),
    ]);
    if (!matches.ok || !players.ok || !catalog.ok || periods.error) return null;
    return {
      matches: matches.data,
      players: players.data,
      catalog: catalog.data,
      lines,
      periods: periods.data.flatMap((p) =>
        p.game_id === null || p.period === null || p.points_for === null || p.points_against === null
          ? []
          : [{ gameId: p.game_id, period: p.period, pointsFor: p.points_for, pointsAgainst: p.points_against }],
      ),
      league: league.ok ? league.data : [],
      leagueGames: leagueGames.flatMap((g) =>
        g.game_date && g.home && g.away && g.home_points !== null && g.away_points !== null
          ? [{ date: g.game_date, home: g.home, away: g.away, homePoints: g.home_points, awayPoints: g.away_points }]
          : [],
      ),
      updated: updated.data?.[0]?.last_success_at ?? null,
    };
  } catch {
    return null;
  }
}
