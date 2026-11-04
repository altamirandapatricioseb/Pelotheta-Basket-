import { describe, expect, it } from 'vitest';

import type { PlayerRow, StatDef } from './catalog';
import { gameConclusions, playerConclusions, playerStrengthConclusions, standing } from './conclusions';
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

describe('playerStrengthConclusions', () => {
  const stat = (id: string, group: string, higherIsBetter = true): StatDef => ({
    id,
    entity: 'jugador',
    name: id,
    short: id,
    description: '',
    reading: '',
    group,
    unit: '',
    source: '',
    level: 'A',
    formula: '',
    higherIsBetter,
    available: true,
    estimated: false,
    per36: true,
    rule: 'suma',
    arg1: id,
    arg2: '',
    factor: 1,
  });
  const player = (id: number, minutes: number, stats: Record<string, number>): PlayerRow => ({
    playerId: id,
    name: `J${String(id)}`,
    position: 'Base',
    shirtNumber: null,
    age: null,
    heightCm: null,
    weightKg: null,
    nationality: null,
    matches: 6,
    minutes,
    stats,
  });
  const players = [1, 2, 3, 4, 5].map((i) => player(i, 36, { pts: i * 10, tov: i, age: 20 + i }));
  const catalog = [stat('pts', 'anotacion'), stat('tov', 'creacion', false), stat('age', 'resumen')];

  it('todos los que llegan a 36 minutos llevan al menos una, y los de menos no', () => {
    const out = playerStrengthConclusions([...players, player(6, 35, { pts: 900, tov: 0 })], catalog);
    expect(new Set(out.map((c) => c.entityId))).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it('respeta el sentido de la estadística y no usa el perfil', () => {
    const out = playerStrengthConclusions(players, catalog);
    expect(out.every((c) => c.title !== 'age')).toBe(true);
    // El 1 anota menos que nadie, pero también pierde menos pelotas.
    expect(out.filter((c) => c.entityId === 1).map((c) => [c.title, c.tone])).toEqual([
      ['tov', 'positivo'],
      ['pts', 'negativo'],
    ]);
    expect(out.find((c) => c.entityId === 1 && c.title === 'tov')?.text).toContain('(menos es mejor)');
  });

  it('con menos de 5 jugadores comparables no afirma nada', () => {
    expect(playerStrengthConclusions(players.slice(0, 4), catalog)).toEqual([]);
  });
});
