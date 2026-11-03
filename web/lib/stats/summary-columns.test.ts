import { describe, expect, it } from 'vitest';

import type { PlayerSummary } from '@/lib/data/players';

import { columnValue, getColumn, rankAndPercentile, toColumn, type CatalogRow } from './summary-columns';

const base: PlayerSummary = {
  playerId: 1,
  name: 'Jugador de prueba',
  shortName: null,
  position: null,
  shirtNumber: 11,
  age: null,
  heightCm: 195,
  matches: 6,
  minutes: 180,
  values: { pts: 90, ts: 0.6, pts_per36: 18, per: null },
};

const row = (stat_id: string, unit: string): CatalogRow => ({
  stat_id,
  name_es: stat_id,
  description_es: 'x',
  unit,
  formula: null,
  level: 'B',
  available: true,
  higher_is_better: true,
});

describe('columnValue', () => {
  it('lleva a 36 minutos solo los conteos', () => {
    expect(columnValue(base, toColumn(row('pts', 'puntos')), true)).toBe(18);
    expect(columnValue(base, toColumn(row('ts', '%')), true)).toBe(0.6);
    expect(columnValue(base, toColumn(row('pts_per36', 'puntos')), true)).toBe(18); // ya está por 36
  });

  it('n/d queda null, nunca 0', () => {
    expect(columnValue(base, toColumn(row('per', 'puntos')), false)).toBeNull();
    expect(columnValue(base, toColumn(row('bpm', 'puntos')), false)).toBeNull();
  });

  it('sin minutos no hay valor cada 36', () => {
    expect(columnValue({ ...base, minutes: 0 }, toColumn(row('pts', 'puntos')), true)).toBeNull();
  });
});

describe('getColumn', () => {
  it('cae en la primera columna si la clave no existe', () => {
    const cols = [toColumn(row('pts', 'puntos')), toColumn(row('ts', '%'))];
    expect(getColumn(cols, 'ts')?.key).toBe('ts');
    expect(getColumn(cols, 'inventada')?.key).toBe('pts');
    expect(getColumn([], 'pts')).toBeUndefined();
  });
});

describe('rankAndPercentile', () => {
  it('ubica el valor en el plantel', () => {
    expect(rankAndPercentile([1, 5, 3, 9], 5)).toEqual({ rank: 2, percentile: 67 });
    expect(rankAndPercentile([1, 5, 3, 9], 9)).toEqual({ rank: 1, percentile: 100 });
  });
});
