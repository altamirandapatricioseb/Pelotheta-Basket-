import { describe, expect, it } from 'vitest';

import { gameConclusions, playerConclusions, standing } from './conclusions';
import type { SummaryColumn } from './summary-columns';

const col = (key: string, higherIsBetter = true, unit = 'puntos'): SummaryColumn => ({
  key,
  short: key,
  name: key,
  unit,
  description: '',
  level: 'B',
  per36: false,
  available: true,
  higherIsBetter,
});

describe('standing', () => {
  it('da vuelta el puesto cuando menos es mejor', () => {
    expect(standing([1, 2, 3, 4, 5], 1, true)).toEqual({ rank: 5, percentile: 0 });
    expect(standing([1, 2, 3, 4, 5], 1, false)).toEqual({ rank: 1, percentile: 100 });
  });
});

describe('playerConclusions', () => {
  it('separa fortalezas y debilidades e ignora grupos chicos', () => {
    const out = playerConclusions([
      { column: col('pts'), value: 20, rank: 1, percentile: 100, of: 10 },
      { column: col('tov', false), value: 4, rank: 10, percentile: 0, of: 10 },
      { column: col('ast'), value: 5, rank: 5, percentile: 50, of: 10 },
      { column: col('blk'), value: 3, rank: 1, percentile: 100, of: 3 },
    ]);
    expect(out.map((c) => [c.tone, c.title])).toEqual([
      ['positivo', 'pts'],
      ['negativo', 'tov'],
    ]);
    expect(out[0]?.text).toContain('1.º de 10');
  });
});

describe('gameConclusions', () => {
  it('marca lo que se aparta 10 % o más del promedio, según el sentido', () => {
    const out = gameConclusions([
      { column: col('ortg'), value: 120, average: 100 },
      { column: col('drtg', false), value: 120, average: 100 },
      { column: col('pace'), value: 72, average: 70 },
      { column: col('nr'), value: 5, average: 0 },
    ]);
    expect(out.map((c) => [c.tone, c.title])).toEqual([
      ['positivo', 'ortg'],
      ['negativo', 'drtg'],
    ]);
  });
});
