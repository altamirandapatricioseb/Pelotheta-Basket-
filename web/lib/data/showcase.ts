import 'server-only';

import { ZONES, zoneShots, type ShowcaseShot, type ZoneGame } from '@/lib/showcase/shots';
import { createApiClient } from '@/lib/supabase/server';

export type { ShowcaseShot };

export interface ShowcaseData {
  /** Tiros de campo para el canvas de la portada (material visual, sin cifras en pantalla). */
  shots: ShowcaseShot[];
}

/** Lo mínimo que necesita la portada; si la base no responde, la portada igual se dibuja. */
export async function getShowcaseData(): Promise<ShowcaseData> {
  try {
    // Con orden fijo el dibujo no cambia entre cargas (el generador consume los partidos en fila).
    const { data } = await createApiClient().from('boca_game').select('stats').order('game_date').limit(200);
    const games = (data ?? []).flatMap(({ stats }): ZoneGame[] => {
      if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return [];
      const num = (key: string) => {
        const v = stats[key];
        return typeof v === 'number' ? v : null;
      };
      const fga = num('team_fga');
      if (fga === null) return [];
      const zones: ZoneGame['zones'] = {};
      for (const zone of ZONES) {
        const share = num(`team_${zone}_fga_share`);
        if (share !== null) zones[zone] = { share, pct: num(`team_${zone}_fg_pct`) ?? 0 };
      }
      return [{ fga, zones }];
    });
    // La Θ tiene unos 1.200 puntos: con la temporada avanzada se toma un tiro de cada k, que
    // conserva el reparto por zona y el acierto.
    const all = zoneShots(games);
    const k = Math.max(1, Math.ceil(all.length / 1200));
    return { shots: all.filter((_, i) => i % k === 0) };
  } catch {
    return { shots: [] };
  }
}
