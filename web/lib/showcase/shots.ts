// Mapa de tiro de la portada. La base no publica los tiros con su posición (solo estadística
// derivada), así que se arma con lo que sí se publica: cuántos tiros de campo hubo en cada partido,
// qué parte fue de cada zona y con qué acierto. Cada tiro cae en un punto de su zona, elegido con un
// generador con semilla: el dibujo es el mismo en cada carga y respeta el reparto y el acierto reales.

export interface ShowcaseShot {
  /** Distancia a la línea de fondo como fracción de media cancha (0 = línea de fondo). */
  x: number;
  /** Ancho de la cancha, de 0 a 1. */
  y: number;
  value: 2 | 3;
  made: boolean;
}

export const ZONES = ['aro', 'pintura', 'media', 'esquina3', 'frontal3'] as const;
export type Zone = (typeof ZONES)[number];

export interface ZoneGame {
  /** Tiros de campo intentados en el partido. */
  fga: number;
  /** Por zona: parte de los tiros (0 a 1) y acierto (0 a 1). */
  zones: Partial<Record<Zone, { share: number; pct: number }>>;
}

// Media cancha FIBA, en metros.
export const COURT = { width: 15, depth: 14, hoop: 1.575, arc: 6.75, corner: 0.9, keyWidth: 4.9, keyDepth: 5.8 };
const MID = COURT.width / 2;

const inKey = (dist: number, across: number) => dist < COURT.keyDepth && Math.abs(across - MID) < COURT.keyWidth / 2;
const fromHoop = (dist: number, across: number) => Math.hypot(dist - COURT.hoop, across - MID);

/** Un punto (distancia al fondo, ancho) dentro de la zona; `rnd` da números de 0 a 1. */
function place(zone: Zone, rnd: () => number): [number, number] {
  const polar = (r: number, a: number): [number, number] => [COURT.hoop + r * Math.cos(a), MID + r * Math.sin(a)];
  // Hasta 20 intentos por tiro; el último se acepta igual (cae cerca del borde de su zona).
  for (let i = 0; i < 20; i++) {
    let p: [number, number];
    let ok = true;
    if (zone === 'aro') {
      p = polar(0.3 + 1.3 * Math.sqrt(rnd()), (rnd() - 0.5) * Math.PI);
    } else if (zone === 'pintura') {
      p = [0.4 + rnd() * (COURT.keyDepth - 0.4), MID + (rnd() - 0.5) * COURT.keyWidth];
      ok = fromHoop(...p) > 1.6;
    } else if (zone === 'media') {
      p = polar(2.2 + rnd() * (COURT.arc - 2.7), (rnd() - 0.5) * Math.PI);
      ok = !inKey(...p) && Math.abs(p[1] - MID) < MID - COURT.corner - 0.3;
    } else if (zone === 'esquina3') {
      const side = rnd() < 0.5 ? COURT.corner / 2 : COURT.width - COURT.corner / 2;
      p = [0.3 + rnd() * 2.5, side + (rnd() - 0.5) * 0.5];
    } else {
      p = polar(COURT.arc + 0.25 + rnd() * 1.3, (rnd() - 0.5) * Math.PI * 0.82);
      ok = p[1] > 0.3 && p[1] < COURT.width - 0.3;
    }
    if (ok || i === 19) return p;
  }
  return [COURT.hoop, MID];
}

/** Los tiros de campo de todos los partidos, repartidos por zona con su acierto. */
export function zoneShots(games: readonly ZoneGame[]): ShowcaseShot[] {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return games.flatMap((game) =>
    ZONES.flatMap((zone) => {
      const z = game.zones[zone];
      const n = z ? Math.round(z.share * game.fga) : 0;
      const made = z ? Math.round(z.pct * n) : 0;
      return Array.from({ length: n }, (_, i): ShowcaseShot => {
        const [dist, across] = place(zone, rnd);
        return {
          x: round(Math.min(1, Math.max(0, dist / COURT.depth))),
          y: round(Math.min(1, Math.max(0, across / COURT.width))),
          value: zone === 'esquina3' || zone === 'frontal3' ? 3 : 2,
          made: i < made,
        };
      });
    }),
  );
}
