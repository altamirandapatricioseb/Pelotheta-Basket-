import { describe, expect, it } from 'vitest';

import { aggregateTeam, extremeOf, formatStat, type StatDef, type TeamMatchRow } from './catalog';

const stat = (over: Partial<StatDef>): StatDef => ({
  id: 'x',
  entity: 'equipo',
  name: 'x',
  short: 'x',
  description: '',
  reading: '',
  group: '',
  unit: 'puntos',
  source: 'lnb',
  level: 'B',
  formula: '',
  higherIsBetter: true,
  available: true,
  estimated: false,
  per36: true,
  rule: 'suma',
  arg1: 'pts',
  arg2: '',
  factor: 1,
  ...over,
});

const game = (stats: Record<string, number>): TeamMatchRow => ({
  matchId: 1,
  date: '2026-10-01',
  competitionCode: 'lnb',
  competitionName: 'Liga Nacional',
  opponent: 'Rival',
  home: true,
  pointsFor: 0,
  pointsAgainst: 0,
  stats,
});

describe('aggregateTeam', () => {
  const rows = [game({ pts: 80, fga: 60, efg_num: 30 }), game({ pts: 100, fga: 40, efg_num: 30 }), game({ pts: 90 })];

  it('suma, promedio por partido y máximo', () => {
    expect(aggregateTeam(rows, stat({}))).toBe(270);
    expect(aggregateTeam(rows, stat({}), { perMatch: true })).toBe(90);
    expect(aggregateTeam(rows, stat({ rule: 'maximo' }))).toBe(100);
  });

  it('cociente suma sobre suma, solo con partidos que tienen los dos datos', () => {
    // (30 + 30) / (60 + 40) = 0,6 y no el promedio de 0,5 y 0,75.
    expect(aggregateTeam(rows, stat({ rule: 'cociente', arg1: 'efg_num', arg2: 'fga', unit: '%' }))).toBe(0.6);
  });

  it('sin datos es n/d, no 0', () => {
    expect(aggregateTeam(rows, stat({ arg1: 'tov' }))).toBeNull();
  });
});

describe('formatStat', () => {
  it('porcentajes en cualquiera de las dos escalas y proporciones con dos decimales', () => {
    expect(formatStat(0.636, stat({ unit: '%' }), false)).toBe('63,6 %');
    expect(formatStat(17.8, stat({ unit: '%' }), false)).toBe('17,8 %');
    expect(formatStat(0.4, stat({ unit: 'proporción' }), false)).toBe('0,40');
    expect(formatStat(null, stat({}), false)).toBe('n/d');
  });
});

describe('extremeOf', () => {
  it('respeta el sentido de la estadística', () => {
    expect(extremeOf([1, 2, 3], 3, true)).toBe('best');
    expect(extremeOf([1, 2, 3], 3, false)).toBe('worst');
    expect(extremeOf([2, 2], 2, true)).toBeNull();
  });
});
