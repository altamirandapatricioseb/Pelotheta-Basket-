import { describe, expect, it } from 'vitest';

import { marketAnalyses, priceCurves, teamAnalyses } from './analyses';
import { GROUPS, type MarketPlayer, nearestGroup, scoutReports, type SquadPlayer, teamNeeds } from './scouting';

const own = (id: number, position: string, minutes: number, age = 26, pts = 100): SquadPlayer => ({
  id,
  name: `J${String(id)}`,
  position,
  age,
  minutes,
  contractYears: null,
  value: minutes / 10,
  stats: { pts, ts: 0.55, ast: minutes / 20, tov: 10, orb: 5, drb: 20, blk: 2, stl: 5, fg2a: 30, fg3a: 30, fta: 10 },
});

// Exteriores y aleros completos; un solo interior y veterano. Seis exteriores: sobra.
const squad: SquadPlayer[] = [
  ...Array.from({ length: 6 }, (_, i) => own(1 + i, 'Exterior', 250 - i * 20)),
  ...Array.from({ length: 3 }, (_, i) => own(10 + i, 'Alero', 240 - i * 30)),
  own(20, 'Interior', 260, 34, 40),
];

const market = (n = 60): MarketPlayer[] =>
  Array.from({ length: n }, (_, i): MarketPlayer => ({
    name: `M${String(i)}`,
    team: 'Otro',
    position: GROUPS[i % 3] as string,
    age: 19 + (i % 15),
    value: 8 + (i % 25),
    minutes: 200,
    stats: { pts: 40 + i * 3, ts: 0.45 + (i % 10) / 50, orb: i % 12, drb: 10 + (i % 20), blk: i % 6, tov: 8 },
  }));

describe('ojeador de básquet', () => {
  it('la zona flaca y vieja es la mayor necesidad; seis exteriores no son necesidad', () => {
    const needs = teamNeeds(squad);
    expect(needs[0]?.group).toBe('Interior');
    expect(needs.find((n) => n.group === 'Exterior')?.score ?? 10).toBeLessThan(3);
    expect(needs.every((n) => n.score >= 0 && n.score <= 10)).toBe(true);
    expect(needs.find((n) => n.group === 'Exterior')?.players).toHaveLength(6);
  });

  it('con la liga, mide contra la liga, marca lo flojo y arma las tres categorías', () => {
    const needs = teamNeeds(squad, market());
    const interior = needs.find((n) => n.group === 'Interior');
    expect(interior?.reference).toBe('liga');
    expect(interior?.weakStats[0]?.percentile ?? 100).toBeLessThan(40);
    const reports = scoutReports(market(), needs);
    expect(new Set(reports.map((r) => r.category))).toEqual(new Set(['necesidad', 'oportunidad', 'promesa']));
    expect(reports.every((r) => r.score >= 0 && r.score <= 10)).toBe(true);
    expect(reports.filter((r) => r.category === 'promesa').every((r) => (r.player.age ?? 99) <= 23)).toBe(true);
    expect(reports.some((r) => r.strengths.length > 0)).toBe(true);
  });

  it('sin mercado no inventa informes', () => {
    expect(scoutReports([], teamNeeds(squad))).toEqual([]);
  });

  it('ubica la zona por el centroide más cercano', () => {
    const centroids = [
      { group: 'Exterior' as const, z: { ast: 1, orb: -1 } },
      { group: 'Interior' as const, z: { ast: -1, orb: 1.5 } },
    ];
    expect(nearestGroup({ ast: -0.8, orb: 1.2 }, centroids)).toBe('Interior');
    expect(nearestGroup({ ast: 0.9, orb: -0.5 }, centroids)).toBe('Exterior');
  });
});

describe('estadística del mercado y del equipo', () => {
  it('arma cajas, ANOVA, contingencia, regresión y las curvas por zona', () => {
    const rows = market(90).map((p) => ({
      name: p.name,
      team: p.team,
      group: p.position as string,
      age: p.age as number,
      value: (p.value as number) + (p.position === 'Interior' ? 10 : 0),
    }));
    const owned = [
      { value: 20, age: 25 },
      { value: 18, age: 30 },
      { value: 12, age: 22 },
    ];
    const ids = marketAnalyses(rows, owned, GROUPS, 'Boca', 'min').map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining(['mercado-cajas', 'mercado-anova', 'mercado-contingencia', 'mercado-regresion']),
    );
    expect(ids).toContain('mercado-plantel');
    expect(priceCurves(rows, GROUPS, 'min')).toHaveLength(3);
  });

  it('con pocos partidos no analiza y con ocho sí', () => {
    const m = (i: number) => ({
      home: i % 2 === 0,
      pointsFor: 80 + i,
      pointsAgainst: 78 - (i % 3) * 4,
      competitionName: 'LNB',
      stats: { team_fg3m: 8 + (i % 4) },
    });
    expect(teamAnalyses([m(1), m(2)])).toEqual([]);
    const ids = teamAnalyses(Array.from({ length: 8 }, (_, i) => m(i))).map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining(['puntos-favor', 'intervalos', 'triples', 'binomial', 'localia-pruebas']),
    );
  });
});
