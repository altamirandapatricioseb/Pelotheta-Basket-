import 'server-only';

import { getPlayerRows } from '@/lib/data/catalog';
import { getAlternatives, getMarketValues, getModelRun } from '@/lib/data/models';
import {
  GROUP_OF,
  GROUPS,
  type Group,
  type MarketPlayer,
  nearestGroup,
  type Need,
  type PriceUnit,
  type SquadPlayer,
  teamNeeds,
} from '@/lib/models/scouting';

export interface ScoutingData {
  squad: SquadPlayer[];
  market: MarketPlayer[];
  needs: Need[];
  unit: PriceUnit;
}

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Plantel con precio y zona, mercado de la liga sin el propio club y necesidades: lo que usan las dos
 * páginas del Ojeador. El mercado son los jugadores de otros clubes que calcula Alternativas (con sus
 * estadísticas cada 36 y en escala z): se vuelven a totales para medirlos igual que al plantel.
 * shortcut: son los más parecidos a cada jugador propio (hasta 25 por jugador), no la liga entera; si
 * el pipeline publica una tabla con todos los jugadores de la liga, se lee esa.
 */
export async function loadScouting(team: {
  slug: string;
  name: string;
}): Promise<{ ok: true; data: ScoutingData } | { ok: false; code: 'PEL-DB-001' }> {
  const [rows, alt, values, run] = await Promise.all([
    getPlayerRows(),
    getAlternatives(team.slug),
    getMarketValues(team.slug),
    getModelRun(team.slug, 'valor_mercado'),
  ]);
  if (!rows.ok || !alt.ok || !values.ok || !run.ok) return { ok: false, code: 'PEL-DB-001' };
  const unit: PriceUnit = run.data?.params.unit === 'USD' ? 'USD' : 'min';
  const usd = new Map(values.data.rows.map((r) => [r.playerId, r.actual]));
  const squad: SquadPlayer[] = rows.data.map((p) => ({
    id: p.playerId,
    name: p.name,
    position: p.position ? (GROUP_OF[p.position] ?? null) : null,
    // La ficha trae la edad con decimales: el Ojeador trabaja con años cumplidos.
    age: p.age === null ? null : Math.floor(p.age),
    minutes: p.minutes,
    stats: Object.fromEntries(Object.entries(p.stats).filter((e): e is [string, number] => typeof e[1] === 'number')),
    contractYears: null,
    value: unit === 'USD' ? (usd.get(p.playerId) ?? null) : p.matches ? p.minutes / p.matches : null,
  }));

  // Centroide en escala z de cada zona con los jugadores propios: sirve para ubicar a los de otros clubes.
  const zoneOf = new Map(squad.map((p) => [p.id, p.position]));
  const centroids = GROUPS.flatMap((group: Group) => {
    const own = alt.data.styles.filter((s) => zoneOf.get(s.playerId) === group);
    if (!own.length) return [];
    const keys = Object.keys(own[0]?.z ?? {});
    return [
      { group, z: Object.fromEntries(keys.map((k) => [k, own.reduce((a, s) => a + (s.z[k] ?? 0), 0) / own.length])) },
    ];
  });

  const ownName = plain(team.name);
  const seen = new Map<string, MarketPlayer>();
  for (const a of alt.data.alternatives) {
    if (a.section === 'club') continue;
    for (const m of a.members) {
      const key = `${m.name}|${m.team}`;
      const club = plain(m.team);
      // El box score dice «Boca» y la configuración «Boca Juniors»: se compara en los dos sentidos.
      if (seen.has(key) || club.includes(ownName) || ownName.includes(club)) continue;
      const minutes = m.minutes ?? 0;
      const stats: Record<string, number> = {};
      for (const [k, v] of Object.entries(m.features)) {
        if (v !== null) stats[k] = k === 'ts' ? v : (v * minutes) / 36;
      }
      const position = m.position ? (GROUP_OF[m.position] ?? null) : nearestGroup(m.z, centroids);
      seen.set(key, {
        name: m.name,
        team: m.team,
        position,
        estimated: !m.position && position !== null,
        age: m.age === null ? null : Math.floor(m.age),
        value: unit === 'USD' ? m.value : m.mpg,
        minutes: m.minutes,
        stats,
      });
    }
  }
  const market = [...seen.values()];
  return { ok: true, data: { squad, market, needs: teamNeeds(squad, market), unit } };
}
