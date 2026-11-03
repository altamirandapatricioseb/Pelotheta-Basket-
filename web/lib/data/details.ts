import 'server-only';

import { type DataResult, getPlayers, getSets, type PlayerSummary, type StatSet } from '@/lib/data/players';
import type { Database } from '@/lib/database.types';
import type { SummaryColumn } from '@/lib/stats/summary-columns';
import { createApiClient } from '@/lib/supabase/server';

export type Line = Database['api']['Views']['game_line']['Row'];

export interface GameSummary {
  id: number;
  date: string;
  isHome: boolean;
  opponent: string;
  pointsFor: number;
  pointsAgainst: number;
  stats: Record<string, number | null>;
}

const fail = (detail: string) => ({ ok: false, code: 'PEL-DB-001', detail }) as const;

async function bocaGames(): Promise<DataResult<GameSummary[]>> {
  const { data, error } = await createApiClient()
    .from('boca_game')
    .select('game_id, game_date, is_home, opponent, points_for, points_against, stats')
    .order('game_date');
  if (error) return fail(error.message);
  return {
    ok: true,
    data: data.flatMap((g) =>
      g.game_id === null || g.game_date === null || g.points_for === null || g.points_against === null
        ? []
        : [
            {
              id: g.game_id,
              date: g.game_date,
              isHome: g.is_home ?? false,
              opponent: g.opponent ?? '',
              pointsFor: g.points_for,
              pointsAgainst: g.points_against,
              stats: (g.stats ?? {}) as Record<string, number | null>,
            },
          ],
    ),
  };
}

export interface GameDetail {
  game: GameSummary;
  /** Todos los partidos de Boca en orden: promedio de la temporada y anterior/siguiente. */
  games: GameSummary[];
  periods: { period: number; pointsFor: number; pointsAgainst: number }[];
  boca: Line[];
  rival: Line[];
  sets: StatSet[];
  columns: Map<string, SummaryColumn>;
}

/** Un partido de Boca: resultado, cuartos, box score de los dos equipos y sus estadísticas. null = no existe. */
export async function getGameDetail(gameId: number): Promise<DataResult<GameDetail> | null> {
  try {
    const client = createApiClient();
    const [games, periods, lines, sets] = await Promise.all([
      bocaGames(),
      client.from('game_period').select('period, points_for, points_against').eq('game_id', gameId).order('period'),
      client.from('game_line').select('*').eq('game_id', gameId).order('minutes', { ascending: false }),
      getSets('equipo'),
    ]);
    if (!games.ok) return games;
    if (!sets.ok) return sets;
    if (periods.error) return fail(periods.error.message);
    if (lines.error) return fail(lines.error.message);
    const game = games.data.find((g) => g.id === gameId);
    if (!game) return null;
    return {
      ok: true,
      data: {
        game,
        games: games.data,
        periods: periods.data.flatMap((p) =>
          p.period === null || p.points_for === null || p.points_against === null
            ? []
            : [{ period: p.period, pointsFor: p.points_for, pointsAgainst: p.points_against }],
        ),
        boca: lines.data.filter((l) => l.is_boca),
        rival: lines.data.filter((l) => !l.is_boca),
        sets: sets.data.sets.filter((s) => s.scope === 'partido'),
        columns: sets.data.columns,
      },
    };
  } catch (cause) {
    return fail(cause instanceof Error ? cause.message : String(cause));
  }
}

export interface PlayerDetail {
  player: PlayerSummary;
  fullName: string | null;
  position: string | null;
  heightCm: number | null;
  nationality: string | null;
  weightKg: number | null;
  /** El plantel entero, para percentiles y puestos. */
  squad: PlayerSummary[];
  sets: StatSet[];
  columns: Map<string, SummaryColumn>;
  log: { game: GameSummary; line: Line }[];
}

/** Un jugador de Boca: ficha, todas sus estadísticas y sus partidos. null = no está en el plantel. */
export async function getPlayerDetail(playerId: number): Promise<DataResult<PlayerDetail> | null> {
  try {
    const client = createApiClient();
    const [players, sets, games, bio, lines] = await Promise.all([
      getPlayers(),
      getSets('jugador'),
      bocaGames(),
      client
        .from('player_bio')
        .select('full_name, position_raw, height_cm, nationality, weight_kg')
        .eq('player_id', playerId)
        .maybeSingle(),
      client.from('game_line').select('*').eq('player_id', playerId).eq('is_boca', true),
    ]);
    if (!players.ok) return players;
    if (!sets.ok) return sets;
    if (!games.ok) return games;
    if (bio.error) return fail(bio.error.message);
    if (lines.error) return fail(lines.error.message);
    const player = players.data.find((p) => p.playerId === playerId);
    if (!player) return null;
    const byGame = new Map(games.data.map((g) => [g.id, g]));
    return {
      ok: true,
      data: {
        player,
        fullName: bio.data?.full_name ?? null,
        position: bio.data?.position_raw ?? player.position,
        heightCm: bio.data?.height_cm ?? player.heightCm,
        nationality: bio.data?.nationality ?? null,
        weightKg: bio.data?.weight_kg ?? null,
        squad: players.data,
        sets: sets.data.sets,
        columns: sets.data.columns,
        log: lines.data
          .flatMap((line) => {
            const game = line.game_id === null ? undefined : byGame.get(line.game_id);
            return game ? [{ game, line }] : [];
          })
          .toSorted((a, b) => b.game.date.localeCompare(a.game.date)),
      },
    };
  } catch (cause) {
    return fail(cause instanceof Error ? cause.message : String(cause));
  }
}
