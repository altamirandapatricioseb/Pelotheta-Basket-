import { describe, expect, it } from 'vitest';

import type { PlayerSummary } from '@/lib/data/players';

import { columnValue, rankAndPercentile, SUMMARY_COLUMNS } from './summary-columns';

const base: PlayerSummary = {
  playerId: 1,
  name: 'Jugador de prueba',
  shortName: null,
  position: null,
  shirtNumber: 11,
  age: null,
  heightCm: 195,
  matches: 6,
  starts: 6,
  minutes: 180,
  pts: 90,
  reb: 30,
  ast: 24,
  efficiency: 110,
};

const column = (key: string) => {
  const found = SUMMARY_COLUMNS.find((c) => c.key === key);
  if (!found) throw new Error(key);
  return found;
};

describe('columnValue', () => {
  it('devuelve totales o valores cada 36 minutos', () => {
    expect(columnValue(base, column('pts'), false)).toBe(90);
    expect(columnValue(base, column('pts'), true)).toBe(18);
  });

  it('no convierte a 36 lo que no tiene sentido (partidos, minutos)', () => {
    expect(columnValue(base, column('matches'), true)).toBe(6);
    expect(columnValue(base, column('minutes'), true)).toBe(180);
  });

  it('sin minutos no hay valor cada 36', () => {
    expect(columnValue({ ...base, minutes: 0 }, column('pts'), true)).toBeNull();
  });
});

describe('rankAndPercentile', () => {
  it('ubica el valor en el plantel', () => {
    expect(rankAndPercentile([1, 5, 3, 9], 5)).toEqual({ rank: 2, percentile: 67 });
    expect(rankAndPercentile([1, 5, 3, 9], 9)).toEqual({ rank: 1, percentile: 100 });
  });
});
