import { describe, expect, it } from 'vitest';

import { COURT, zoneShots, type ZoneGame } from './shots';

const GAME: ZoneGame = {
  fga: 100,
  zones: {
    aro: { share: 0.4, pct: 0.6 },
    pintura: { share: 0.1, pct: 0.5 },
    media: { share: 0.05, pct: 0.4 },
    esquina3: { share: 0.1, pct: 0.5 },
    frontal3: { share: 0.35, pct: 0.4 },
  },
};

describe('zoneShots', () => {
  const shots = zoneShots([GAME]);

  it('respeta la cantidad, el reparto y el acierto de cada zona', () => {
    expect(shots).toHaveLength(100);
    expect(shots.filter((s) => s.value === 3)).toHaveLength(45);
    // 24 + 5 + 2 + 5 + 14
    expect(shots.filter((s) => s.made)).toHaveLength(50);
  });

  it('deja cada tiro dentro de la media cancha y cada triple detrás de la línea', () => {
    for (const s of shots) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(1);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(1);
      const dist = s.x * COURT.depth - COURT.hoop;
      const across = (s.y - 0.5) * COURT.width;
      const corner = Math.abs(across) > COURT.width / 2 - COURT.corner;
      if (s.value === 3) expect(corner || Math.hypot(dist, across) > COURT.arc).toBe(true);
      else expect(!corner && Math.hypot(dist, across) < COURT.arc).toBe(true);
    }
  });

  it('da siempre el mismo dibujo y tolera partidos sin zonas', () => {
    expect(zoneShots([GAME])).toEqual(shots);
    expect(zoneShots([{ fga: 60, zones: {} }])).toEqual([]);
  });
});
