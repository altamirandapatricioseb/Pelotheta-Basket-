import { describe, expect, it } from 'vitest';

import type { PlayerRow, StatDef } from '@/lib/stats/catalog';

import {
  compareStat,
  comparableStats,
  lineOf,
  parseRefs,
  perMatchValue,
  playersByLine,
  positionOf,
  quartiles,
  referenceLabel,
  referenceMembers,
  referencePerMatch,
  referencePool,
  referenceValue,
  refProblem,
  refSlot,
  refsToParam,
  sectionsFor,
  strengths,
  summarize,
  type RefSpec,
} from './compare';

function stat(id: string, over: Partial<StatDef> = {}): StatDef {
  return {
    id,
    entity: 'jugador',
    name: id,
    short: id,
    description: '',
    reading: '',
    group: 'anotacion',
    unit: 'puntos',
    source: '',
    level: 'A',
    formula: '',
    higherIsBetter: true,
    available: true,
    estimated: false,
    per36: true,
    rule: 'suma',
    arg1: id,
    arg2: '',
    factor: 1,
    ...over,
  };
}

function player(id: number, position: string | null, minutes: number, stats: Record<string, number>): PlayerRow {
  return {
    playerId: id,
    name: `Jugador ${String(id)}`,
    position,
    shirtNumber: null,
    age: null,
    heightCm: null,
    weightKg: null,
    nationality: null,
    matches: Math.max(1, Math.round(minutes / 36)),
    minutes,
    stats,
  };
}

const pts = stat('pts');
const tov = stat('tov', { higherIsBetter: false, group: 'creacion' });

const p1 = player(1, 'Base', 720, { pts: 240, tov: 40 });
const p2 = player(2, 'Escolta', 1440, { pts: 400, tov: 80 });
const p3 = player(3, 'Pívot', 720, { pts: 100, tov: 60 });
const p4 = player(4, 'Alero', 720, { pts: 0 });
const p5 = player(5, 'Base', 72, { pts: 10, tov: 4 });
const players = [p1, p2, p3, p4, p5];
const byId = new Map(players.map((p) => [p.playerId, positionOf(p.playerId, p.position ?? '')]));

describe('referencias en la URL', () => {
  it('vacío por defecto: nada elegido todavía', () => {
    expect(parseRefs(undefined)).toEqual([]);
    expect(parseRefs('cualquiera')).toEqual([]);
  });

  it('sin otro jugador, una sola media', () => {
    expect(parseRefs('interiores,equipo')).toEqual([{ kind: 'equipo' }]);
  });

  it('con otro jugador, él primero y las medias en su orden fijo', () => {
    expect(parseRefs('interiores,jugador-7,equipo,jugador-9,posicion')).toEqual([
      { kind: 'jugador', playerId: 7 },
      { kind: 'equipo' },
      { kind: 'posicion' },
      { kind: 'linea', line: 'interior' },
    ]);
    expect(
      refsToParam([
        { kind: 'linea', line: 'exterior' },
        { kind: 'jugador', playerId: 22 },
      ]),
    ).toBe('jugador-22,exteriores');
  });

  it('cada referencia tiene su color fijo', () => {
    expect(refSlot({ kind: 'jugador', playerId: 1 })).toBe(2);
    expect(refSlot({ kind: 'equipo' })).toBe(4);
    expect(refSlot({ kind: 'posicion' })).toBe(5);
    expect(refSlot({ kind: 'linea', line: 'exterior' })).toBe(6);
    expect(refSlot({ kind: 'linea', line: 'interior' })).toBe(8);
  });
});

describe('grupo de referencia', () => {
  it('percentiles: nunca el principal y con mínimo de minutos', () => {
    expect(referencePool(players, p1, byId, 400).map((p) => p.playerId)).toEqual([2, 3, 4]);
  });

  it('medias: plantel, cada zona y la posición; nunca el principal', () => {
    const ids = (spec: RefSpec, min = 0) => referenceMembers(spec, p1, players, byId, min).map((p) => p.playerId);
    expect(ids({ kind: 'equipo' })).toEqual([2, 3, 4, 5]);
    expect(ids({ kind: 'equipo' }, 400)).toEqual([2, 3, 4]);
    expect(ids({ kind: 'linea', line: 'exterior' })).toEqual([2, 5]);
    expect(ids({ kind: 'linea', line: 'interior' })).toEqual([3]);
    expect(ids({ kind: 'posicion' })).toEqual([5]);
    expect(ids({ kind: 'jugador', playerId: 3 })).toEqual([3]);
  });
});

describe('promedio de la referencia', () => {
  const members = [p2, p3];

  it('simple y ponderado por minutos, cada 36', () => {
    // 400 en 1440 = 10 cada 36; 100 en 720 = 5 cada 36.
    expect(referenceValue(members, pts, true, 'simple').value).toBeCloseTo(7.5);
    // (10 × 1440 + 5 × 720) / 2160 = 8,33.
    expect(referenceValue(members, pts, true, 'ponderado').value).toBeCloseTo(8.333, 2);
    expect(referenceValue([p4], tov, false, 'simple')).toEqual({ value: null, n: 0 });
  });
});

describe('comparación de una estadística', () => {
  const pool = referencePool(players, p1, byId, 0);

  it('diferencia con el sentido de la estadística: menos pérdidas es mejor', () => {
    const row = compareStat(tov, p1, [[p2]], pool, false, 'simple');
    expect(row.refs[0]?.diff).toBe(-40);
    expect(row.refs[0]?.diffPct).toBeCloseTo(-50);
    expect(row.refs[0]?.verdict).toBe('mejor');
  });

  it('percentil del jugador y fila sin dato', () => {
    expect(compareStat(pts, p1, [pool], pool, true, 'simple').percentile).toBe(100);
    const missing = compareStat(tov, p4, [[p2]], [p2], false, 'simple');
    expect(missing.missing).toBe(true);
    expect(missing.refs[0]?.verdict).toBeNull();
  });

  it('resumen y fortalezas, sin contar las de uso', () => {
    const minutos = stat('min', { group: 'resumen', per36: false });
    const withMin = { ...p1, stats: { ...p1.stats, min: 5000 } };
    const poolMin = pool.map((p) => ({ ...p, stats: { ...p.stats, min: p.minutes } }));
    const rows = [
      compareStat(pts, withMin, [poolMin], poolMin, true, 'simple'),
      compareStat(tov, withMin, [poolMin], poolMin, true, 'simple'),
      compareStat(stat('ast'), withMin, [poolMin], poolMin, true, 'simple'),
      compareStat(minutos, withMin, [poolMin], poolMin, false, 'simple'),
    ];
    expect(summarize(rows, 0)).toEqual({ better: 3, worse: 0, equal: 0, missing: 1 });
    expect(
      strengths(rows, 0, 5)
        .best.map((r) => r.stat.id)
        .sort(),
    ).toEqual(['pts', 'tov']);
  });
});

describe('estadísticas, zonas y secciones', () => {
  it('comparables: de jugador, con dato, sin perfil, sin nivel C y con sección', () => {
    const catalog = [
      stat('pts'),
      stat('ortg', { entity: 'equipo' }),
      stat('raro', { group: 'sin_seccion' }),
      stat('nd', { available: false }),
      stat('c', { level: 'C' }),
      stat('age', { group: 'resumen' }),
    ];
    expect(comparableStats(catalog).map((s) => s.id)).toEqual(['pts']);
  });

  it('secciones según la zona del principal', () => {
    expect(sectionsFor('exterior')[0]?.id).toBe('creacion');
    expect(sectionsFor('interior')[0]?.id).toBe('rebote');
    expect(sectionsFor(null)).toHaveLength(12);
  });

  it('zona del jugador desde la posición', () => {
    expect(lineOf(p3, byId.get(3))).toBe('Interior');
    expect(lineOf(p4, undefined)).toBe('Ala');
    expect(lineOf({ ...p4, position: null }, undefined)).toBeNull();
  });
});

describe('valores por partido y rangos', () => {
  it('totales por partido y tasas tal cual', () => {
    expect(perMatchValue(p2, pts)).toBeCloseTo(10);
    expect(perMatchValue(p2, stat('pct', { per36: false, arg1: 'x' }))).toBeNull();
    expect(referencePerMatch([p2, p3], pts, 'simple')).toBeCloseTo(7.5);
  });

  it('cuartiles con interpolación lineal', () => {
    expect(quartiles([1, 2, 3, 4, 5])).toEqual({ min: 1, q1: 2, q3: 4, max: 5 });
    expect(quartiles([])).toBeNull();
  });
});

describe('nombres, problemas y buscador', () => {
  it('nombres de las referencias', () => {
    expect(referenceLabel({ kind: 'equipo' }, byId.get(1), players).long).toBe('Media del plantel');
    expect(referenceLabel({ kind: 'linea', line: 'interior' }, byId.get(1), players).long).toBe('Media de interiores');
    expect(referenceLabel({ kind: 'posicion' }, byId.get(1), players).short).toBe('Base');
  });

  it('referencias que no se pueden usar', () => {
    const noRole = new Map(byId);
    noRole.set(1, { ...positionOf(1, ''), role: null });
    expect(refProblem({ kind: 'posicion' }, p1, noRole, players)).toBe('su posición no está informada');
    expect(refProblem({ kind: 'jugador', playerId: 99 }, p1, byId, players)).toBe(
      'el otro jugador no jugó en este período',
    );
  });

  it('busca sin tildes y agrupa por zona y minutos', () => {
    const named = [{ ...p2, name: 'Ángel Vildoza' }, p1, p3, p4, p5];
    expect(playersByLine(named, byId, 'angel').map((g) => [g.line, g.players.map((p) => p.playerId)])).toEqual([
      ['Exteriores', [2]],
    ]);
    expect(playersByLine(named, byId).map((g) => g.line)).toEqual(['Exteriores', 'Aleros', 'Interiores']);
    expect(playersByLine(named, byId)[0]?.players.map((p) => p.playerId)).toEqual([2, 1, 5]);
  });
});
