import 'server-only';

import { createApiClient } from '@/lib/supabase/server';

export interface PlayerSummary {
  playerId: number;
  name: string;
  shortName: string | null;
  position: string | null;
  shirtNumber: number | null;
  age: number | null;
  heightCm: number | null;
  matches: number;
  starts: number;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  efficiency: number;
}

export type DataResult<T> = { ok: true; data: T } | { ok: false; code: 'PEL-DB-001'; detail: string };

const SUMMARY_COLUMNS =
  'player_id, full_name, known_as, position_raw, height_cm, shirt_number, matches, starts, minutes, pts, reb, ast, efficiency';

function fail(cause: unknown): { ok: false; code: 'PEL-DB-001'; detail: string } {
  return { ok: false, code: 'PEL-DB-001', detail: cause instanceof Error ? cause.message : String(cause) };
}

/** Tabla «Resumen» del plantel de Boca en la temporada. */
export async function getPlayerSummary(): Promise<DataResult<PlayerSummary[]>> {
  try {
    const { data, error } = await createApiClient()
      .from('player_summary')
      .select(SUMMARY_COLUMNS)
      .order('minutes', { ascending: false })
      .limit(200);
    if (error) return fail(error.message);
    const rows = data.flatMap((r) =>
      r.player_id === null || r.full_name === null
        ? []
        : [
            {
              playerId: r.player_id,
              name: r.full_name,
              shortName: r.known_as,
              position: r.position_raw,
              shirtNumber: r.shirt_number,
              // shortcut: la LNB no publica fecha de nacimiento; la edad llega con Wikidata (etapa 4).
              age: null,
              heightCm: r.height_cm,
              matches: r.matches ?? 0,
              starts: r.starts ?? 0,
              minutes: r.minutes ?? 0,
              pts: r.pts ?? 0,
              reb: r.reb ?? 0,
              ast: r.ast ?? 0,
              efficiency: r.efficiency ?? 0,
            },
          ],
    );
    return { ok: true, data: rows };
  } catch (cause) {
    return fail(cause);
  }
}
