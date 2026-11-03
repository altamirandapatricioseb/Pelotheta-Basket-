import 'server-only';

import { createApiClient } from '@/lib/supabase/server';

export interface SourceStatus {
  source: string;
  isGlobal: boolean;
  lastStatus: string | null;
  lastSuccessAt: string | null;
  lastRunFinishedAt: string | null;
  gamesAdded: number | null;
}

export interface Run {
  startedAt: string | null;
  finishedAt: string | null;
  trigger: string | null;
  status: string | null;
  rowsLoaded: number | null;
  gamesAdded: number | null;
  durationS: number | null;
  dbSizeMb: number | null;
}

export type UpdateResult = { ok: true; sources: SourceStatus[]; history: Run[] } | { ok: false; code: 'PEL-DB-001' };

/** Estado de la última carga por fuente e historial de corridas (Interfaz 6, 9.11). */
export async function getUpdates(): Promise<UpdateResult> {
  try {
    const client = createApiClient();
    const [last, history] = await Promise.all([
      client
        .from('v_last_update')
        .select('source, is_global, last_status, last_success_at, last_run_finished_at, games_added'),
      client
        .from('ingest_history')
        .select('started_at, finished_at, trigger, status, rows_loaded, games_added, duration_s, db_size_mb'),
    ]);
    if (last.error || history.error) return { ok: false, code: 'PEL-DB-001' };
    return {
      ok: true,
      sources: last.data.flatMap((r) =>
        r.source === null
          ? []
          : [
              {
                source: r.source,
                isGlobal: r.is_global ?? false,
                lastStatus: r.last_status,
                lastSuccessAt: r.last_success_at,
                lastRunFinishedAt: r.last_run_finished_at,
                gamesAdded: r.games_added,
              },
            ],
      ),
      history: history.data.map((h) => ({
        startedAt: h.started_at,
        finishedAt: h.finished_at,
        trigger: h.trigger,
        status: h.status,
        rowsLoaded: h.rows_loaded,
        gamesAdded: h.games_added,
        durationS: h.duration_s,
        dbSizeMb: h.db_size_mb,
      })),
    };
  } catch {
    return { ok: false, code: 'PEL-DB-001' };
  }
}
