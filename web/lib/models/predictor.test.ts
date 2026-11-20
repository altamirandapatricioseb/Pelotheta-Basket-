import { describe, expect, it } from 'vitest';

import { average, marginBins, normCdf, points, PROFILE_KEYS, type Profile, simulate } from './predictor';

const club = (name: string, att: number, dfn: number): Profile => ({
  name,
  values: { ...(Object.fromEntries(PROFILE_KEYS.map((k) => [k, 0])) as Profile['values']), att, dfn, elo: 1500, form: 0.5 },
  estimated: false,
  count: 1,
});
const model = { names: ['ataque', 'defensa', 'local'], beta: [80, 60, 60, 3], sd_margin: 12, sd_points: 9 };

describe('predictor de básquet', () => {
  it('Φ da los valores conocidos de la normal', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-12, 12)).toBeCloseTo(0.1587, 3);
  });

  it('dos clubes iguales en cancha neutral empatan en puntos; de local suma la localía', () => {
    const a = club('A', 0, 0);
    expect(points(model, a, a, 'neutral').own).toBeCloseTo(points(model, a, a, 'neutral').rival, 9);
    const home = points(model, a, a, 'local');
    expect(home.own - home.rival).toBeCloseTo(3, 9);
    const away = points(model, a, a, 'visitante');
    expect(away.own - away.rival).toBeCloseTo(-3, 9);
  });

  it('la media promedia cada rasgo y los tramos del margen suman 1', () => {
    expect(average('m', [club('A', 0.1, 0), club('B', -0.1, 0.2)]).values.dfn).toBeCloseTo(0.1, 9);
    const total = marginBins(4, 12).reduce((s, b) => s + b.p, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('Monte Carlo coincide con la cuenta exacta', () => {
    expect(simulate(4, 12).win).toBeCloseTo(normCdf(4, 12), 1);
  });
});
