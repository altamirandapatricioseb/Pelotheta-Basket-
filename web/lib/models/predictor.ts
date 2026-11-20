// Cuenta del predictor en el navegador, igual a la del pipeline (pipeline/match_predictor.py): con los
// β de la regresión de puntos y el perfil de cada club se calcula cualquier cruce, incluida la media de
// una liga, de un país o de toda la zona. Margen normal: P(gana) = Φ(margen / σ).

export const PROFILE_KEYS = [
  'att',
  'dfn',
  'pace',
  'efg',
  'efg_allowed',
  'tov',
  'tov_forced',
  'orb',
  'orb_allowed',
  'ftr',
  'ftr_allowed',
  'elo',
  'form',
] as const;
export type ProfileKey = (typeof PROFILE_KEYS)[number];

export interface Profile {
  name: string;
  values: Record<ProfileKey, number>;
  estimated: boolean;
  /** Cuántos clubes promedia (1 para un club). */
  count: number;
}

export interface Model {
  names: string[];
  beta: number[];
  sd_margin: number;
  sd_points: number;
}

export type Venue = 'local' | 'visitante' | 'neutral';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** Club promedio de un grupo: la media de cada rasgo del perfil. */
export function average(name: string, rows: Profile[]): Profile {
  const values = Object.fromEntries(PROFILE_KEYS.map((k) => [k, mean(rows.map((r) => r.values[k]))])) as Record<
    ProfileKey,
    number
  >;
  return { name, values, estimated: rows.some((r) => r.estimated), count: rows.length };
}

/** Variables del equipo T contra el rival R (como `side` del pipeline; el descanso queda en 0). */
export function side(t: Profile, r: Profile, home: boolean): Record<string, number> {
  const a = t.values;
  const b = r.values;
  return {
    ataque: a.att,
    defensa: b.dfn,
    ritmo: (a.pace + b.pace) / 2,
    tiro: 100 * (a.efg + b.efg_allowed),
    perdidas: 100 * (a.tov + b.tov_forced),
    rebote: 100 * (a.orb + b.orb_allowed),
    libres: 100 * (a.ftr + b.ftr_allowed),
    elo: (a.elo - b.elo) / 400,
    forma: a.form - b.form,
    descanso: 0,
    local: home ? 1 : 0,
  };
}

/** Aporte de cada variable a los puntos (β · x), para mostrar qué decide el partido. */
export function contributions(model: Model, row: Record<string, number>): Record<string, number> {
  return Object.fromEntries(model.names.map((n, i) => [n, (model.beta[i + 1] ?? 0) * (row[n] ?? 0)]));
}

const predict = (model: Model, row: Record<string, number>) =>
  (model.beta[0] ?? 0) + model.names.reduce((s, n, i) => s + (model.beta[i + 1] ?? 0) * (row[n] ?? 0), 0);

/** Puntos esperados del equipo propio y del rival según dónde se juega. */
export function points(model: Model, own: Profile, rival: Profile, venue: Venue) {
  const ownRow = side(own, rival, venue === 'local');
  const rivalRow = side(rival, own, venue === 'visitante');
  return { own: predict(model, ownRow), rival: predict(model, rivalRow), ownRow, rivalRow };
}

/** Φ(x) por la aproximación de Abramowitz y Stegun de la función error (error < 1,5 · 10⁻⁷). */
export function normCdf(x: number, sd = 1): number {
  const z = x / (sd * Math.SQRT2);
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  return 0.5 * (1 + Math.sign(z) * erf);
}

/** Probabilidad de cada tramo de margen (propio − rival), de −30 a +30 de a 5, por la normal. */
export function marginBins(margin: number, sd: number, width = 5, edge = 30) {
  const out: { label: string; p: number; win: boolean }[] = [];
  for (let lo = -edge; lo < edge; lo += width) {
    const a = lo === -edge ? -Infinity : lo;
    const b = lo + width >= edge ? Infinity : lo + width;
    const p = normCdf(b - margin, sd) - normCdf(a - margin, sd);
    const label = lo === -edge ? `≤ ${String(lo + width)}` : lo + width >= edge ? `${String(lo)}+` : `${String(lo)} a ${String(lo + width)}`;
    out.push({ label, p, win: lo >= 0 });
  }
  return out;
}

/** Monte Carlo reproducible (semilla fija): n márgenes normales con Box-Muller. */
export function simulate(margin: number, sd: number, n = 10_000, seed = 2026) {
  let s = seed >>> 0;
  const rand = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let win = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const z = Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
    const m = margin + sd * z;
    total += m;
    if (m > 0) win += 1;
  }
  return { n, win: win / n, meanMargin: total / n };
}
