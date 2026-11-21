// Análisis estadísticos de cada interfaz (distribuciones, intervalos, pruebas de hipótesis, ANOVA,
// contingencia, correlación y regresión), como en Pelotheta fútbol y adaptados al básquet: los puntos
// se modelan con la normal, los triples con la Poisson y no hay empates. Cada constructor recibe los
// datos que la página ya cargó y devuelve análisis listos para graficar (calculados en el servidor).
// Todo se recalcula con cada carga de datos y para cualquier equipo.

import {
  type Anova,
  anova,
  chi2Independence,
  describe,
  fVariances,
  mean,
  ols,
  type Regression,
  type Summary,
  tCrit,
  twoProportions,
  welch,
} from './inference';
import {
  betaPdf,
  binomPmf,
  type Fit,
  goodnessOfFit,
  normalCdf,
  normalPdf,
  oneProportion,
  pearson,
  poissonPmf,
  qqPoints,
  seeded,
  simpleFit,
  wilson,
} from './probability';

export const ALPHA = 0.05;

/** Sección de la interfaz bajo la que va cada análisis (por lo que muestra, no por la técnica). */
export const SECTION_OF: Record<string, string> = {
  'puntos-favor': 'Puntos',
  'puntos-contra': 'Puntos',
  intervalos: 'Puntos',
  tcl: 'Puntos',
  triples: 'Triples',
  'proximo-triples': 'Triples',
  binomial: 'Resultados',
  'intervalos-resultado': 'Resultados',
  'localia-cajas': 'Local y visitante',
  'localia-pruebas': 'Local y visitante',
  'localia-contingencia': 'Local y visitante',
  'anova-competicion': 'Competiciones',
  'puntos-posesiones': 'Ritmo y eficiencia',
  'puntos-ts': 'Ritmo y eficiencia',
  'qq-ortg': 'Ritmo y eficiencia',
  'situaciones-ic': 'Cuánto cambia cada situación',
  'situaciones-pruebas': 'Cuánto cambia cada situación',
  'valoracion-zona': 'Valoración del plantel',
  'valoracion-normal': 'Valoración del plantel',
  'valoracion-qq': 'Valoración del plantel',
  correlaciones: 'Relación entre estadísticas',
  'puntos-tiros': 'Relación entre estadísticas',
  'regresion-valoracion': 'Relación entre estadísticas',
  'jugador-normal': 'Valoración partido a partido',
  'jugador-ic': 'Valoración partido a partido',
  'jugador-ic-prop': 'Valoración partido a partido',
  'jugador-cajas': 'Valoración partido a partido',
  'jugador-pruebas': 'Valoración partido a partido',
  'jugador-minutos': 'Valoración partido a partido',
  'jugador-qq': 'Valoración partido a partido',
  'jugador-triples': 'Triples',
  'jugador-marca': 'Triples',
  'comparar-cajas': 'Partido a partido',
  'comparar-ic': 'Partido a partido',
  'comparar-pruebas': 'Partido a partido',
  'estilos-correlacion': 'Estadísticas del agrupamiento',
  'valor-residuos': 'Qué tan confiable es el modelo',
  'valor-residuos-normal': 'Qué tan confiable es el modelo',
  'valor-qq': 'Qué tan confiable es el modelo',
  bayes: 'Probabilidad de ganar',
  'normal-binomial': 'Victorias de los próximos partidos',
  'serie-ic': 'Media y cambios en la temporada',
  'serie-pruebas': 'Media y cambios en la temporada',
  'serie-tendencia': 'Media y cambios en la temporada',
  'serie-normal': 'Cómo se reparten los valores',
  'partido-puntos': 'Qué tan probable era el resultado',
  'partido-margen': 'Qué tan probable era el resultado',
  'mercado-cajas': 'Cómo se reparten los minutos por zona',
  'mercado-anova': 'Cómo se reparten los minutos por zona',
  'mercado-contingencia': 'Edad y zona',
  'mercado-regresion': 'Qué explica los minutos',
  'mercado-curvas': 'Qué explica los minutos',
  'mercado-plantel': 'El plantel contra la liga',
};

/** Análisis que necesitan todo el ancho (tablas grandes o muchas filas). */
export const WIDE = new Set([
  'correlaciones',
  'estilos-correlacion',
  'situaciones-pruebas',
  'localia-pruebas',
  'jugador-pruebas',
  'comparar-pruebas',
  'regresion-valoracion',
  'mercado-plantel',
  'mercado-regresion',
]);
export type Format = 'num' | 'pct' | 'usd' | 'min' | 'int';

interface Base {
  id: string;
  title: string;
  intro: string;
  /** Conclusión en palabras (con la decisión de la prueba cuando hay una). */
  reading?: string;
}

export type Analysis = Base &
  (
    | {
        kind: 'dist';
        xTitle: string;
        model: string;
        bars: { label: string; observed: number; expected: number }[];
        fit: Fit | null;
      }
    | {
        kind: 'pmf';
        xTitle: string;
        bars: { label: string; p: number; highlight?: boolean; approx?: number }[];
        approxLabel?: string;
      }
    | {
        kind: 'ci';
        format: Format;
        rows: { label: string; est: number; lo: number; hi: number; n: number }[];
        ref?: { label: string; value: number };
      }
    | {
        kind: 'tests';
        rows: {
          question: string;
          test: string;
          a: string;
          b: string;
          letter: string;
          statistic: number;
          df: string;
          p: number;
        }[];
        labels: [string, string];
      }
    | { kind: 'box'; format: Format; rows: { label: string; summary: Summary }[] }
    | {
        kind: 'scatter';
        xTitle: string;
        yTitle: string;
        points: { key: string; x: number; y: number; label?: string; color?: string }[];
        line: { x: number; y: number }[];
        /** Curvas extra (por ejemplo, una por zona) con su color y nombre. */
        curves?: { key: string; label: string; color: string; points: { x: number; y: number }[] }[];
        note: string;
      }
    | { kind: 'corr'; labels: string[]; matrix: number[][]; pvals: number[][]; n: number }
    | { kind: 'anova'; result: Anova; rows: { label: string; summary: Summary }[]; format: Format }
    | {
        kind: 'contingency';
        rowLabels: string[];
        colLabels: string[];
        table: number[][];
        expected: number[][];
        residuals: number[][];
        statistic: number;
        df: number;
        p: number;
      }
    | { kind: 'regression'; result: Regression }
    | {
        kind: 'curves';
        xTitle: string;
        yTitle: string;
        curves: { key: string; label: string; color: string; points: { x: number; y: number }[] }[];
      }
  );

const f2 = (v: number) => v.toFixed(2).replace('.', ',');
const pc = (v: number) => `${(100 * v).toFixed(1).replace('.', ',')} %`;
const pv = (p: number) => (p < 0.001 ? '< 0,001' : p.toFixed(3).replace('.', ','));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const decide = (p: number, yes: string, no: string) =>
  `${p < ALPHA ? 'Se rechaza H₀' : 'No se rechaza H₀'} (p = ${pv(p)}): ${p < ALPHA ? yes : no}`;
const numbers = (xs: (number | null | undefined)[]) =>
  xs.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
/** Regla de Sturges: cantidad de clases del histograma según el tamaño de la muestra. */
const sturges = (n: number) => Math.max(4, Math.ceil(1 + Math.log2(n)));
/** Partidos mínimos para analizar (al principio de la temporada hay pocos: se muestran igual, con cuidado). */
const MIN_GAMES = 5;

/** Media con su intervalo t del 95 %. */
function meanCi(label: string, xs: number[]) {
  const s = describe(xs);
  return { label, est: s.mean, lo: s.ciLow, hi: s.ciHigh, n: s.n };
}

function propCi(label: string, x: number, n: number) {
  const w = wilson(x, n);
  return { label, est: w.p, lo: w.lo, hi: w.hi, n };
}

/** Histograma de conteos (0, 1, 2…) contra una Poisson con la media observada y su bondad de ajuste. */
function poissonDist(id: string, title: string, what: string, xs: number[]): Analysis | null {
  if (xs.length < MIN_GAMES) return null;
  const lambda = mean(xs);
  const top = Math.max(4, ...xs);
  const counts = Array.from({ length: top + 1 }, (_, k) => xs.filter((v) => v === k).length);
  const expected = counts.map((_, k) =>
    k === top
      ? xs.length * (1 - counts.slice(0, top).reduce((s, _c, j) => s + poissonPmf(j, lambda), 0))
      : xs.length * poissonPmf(k, lambda),
  );
  const fit = goodnessOfFit(counts, expected, 1);
  return {
    id,
    kind: 'dist',
    title,
    intro: `Cuántas veces pasó cada cantidad de ${what} (barras) contra lo que espera una distribución de Poisson con la misma media, λ = ${f2(lambda)} (puntos). H₀: los datos siguen esa Poisson.`,
    xTitle: cap(what),
    model: `Poisson(λ = ${f2(lambda)})`,
    bars: counts.map((o, k) => ({
      label: k === top ? `${String(k)}+` : String(k),
      observed: o,
      expected: expected[k] ?? 0,
    })),
    fit,
    reading: fit
      ? `χ² = ${f2(fit.statistic)} con ${String(fit.df)} gl. ${decide(fit.p, 'los datos no siguen una Poisson.', 'la Poisson describe bien los datos.')}`
      : 'Muy pocos datos para la prueba de bondad de ajuste (cada clase necesita 5 esperados): el gráfico se completa con más partidos.',
  };
}

/** Histograma de una variable continua contra la normal con la misma media y desvío. */
function normalDist(id: string, title: string, what: string, xs: number[], min = MIN_GAMES): Analysis | null {
  if (xs.length < min) return null;
  const bins = sturges(xs.length);
  const s = describe(xs);
  const lo = s.min;
  const w = (s.max - s.min) / bins || 1;
  const counts = Array.from(
    { length: bins },
    (_, i) => xs.filter((v) => (i === bins - 1 ? v >= lo + i * w : v >= lo + i * w && v < lo + (i + 1) * w)).length,
  );
  const expected = counts.map((_, i) => {
    const a = i === 0 ? -Infinity : lo + i * w;
    const b = i === bins - 1 ? Infinity : lo + (i + 1) * w;
    return xs.length * (normalCdf(b, s.mean, s.sd) - normalCdf(a, s.mean, s.sd));
  });
  const fit = goodnessOfFit(counts, expected, 2);
  return {
    id,
    kind: 'dist',
    title,
    intro: `Histograma de ${what} (barras, ${String(bins)} clases por la regla de Sturges) contra una normal con la misma media (${f2(s.mean)}) y desvío (${f2(s.sd)}) (puntos). H₀: los datos son normales.`,
    xTitle: cap(what),
    model: `Normal(μ = ${f2(s.mean)}, σ = ${f2(s.sd)})`,
    bars: counts.map((o, i) => ({ label: f2(lo + (i + 0.5) * w), observed: o, expected: expected[i] ?? 0 })),
    fit,
    reading: fit
      ? `χ² = ${f2(fit.statistic)} con ${String(fit.df)} gl. ${decide(fit.p, 'no son normales: conviene cuidar las pruebas que suponen normalidad.', 'la normal es un buen modelo.')}`
      : 'Muy pocos datos para la prueba de bondad de ajuste (cada clase necesita 5 esperados): el gráfico se completa con más partidos.',
  };
}

function qq(id: string, what: string, xs: number[]): Analysis | null {
  if (xs.length < MIN_GAMES) return null;
  const pts = qqPoints(xs);
  const r = pearson(
    pts.map((p) => p.x),
    pts.map((p) => p.y),
  ).r;
  return {
    id,
    kind: 'scatter',
    title: `¿${cap(what)} es normal? (gráfico Q-Q)`,
    intro:
      'Cada punto es un dato estandarizado contra el cuantil que tendría en una normal. Si los puntos siguen la diagonal, la normal es un buen modelo; si se curvan en las puntas, hay colas más pesadas o asimetría.',
    xTitle: 'Cuantil teórico de la normal (z)',
    yTitle: 'Valor observado estandarizado',
    points: pts.map((p, i) => ({ key: String(i), x: p.x, y: p.y })),
    line: [
      { x: -3, y: -3 },
      { x: 3, y: 3 },
    ],
    note: `Correlación del Q-Q: ${f2(r)} (cuanto más cerca de 1, más normal).`,
  };
}

function regressionScatter(
  id: string,
  title: string,
  intro: string,
  xTitle: string,
  yTitle: string,
  pts: { key: string; x: number; y: number; label?: string }[],
): Analysis | null {
  if (pts.length < MIN_GAMES) return null;
  const x = pts.map((p) => p.x);
  const y = pts.map((p) => p.y);
  const { a, b } = simpleFit(x, y);
  const r = pearson(x, y);
  const lo = Math.min(...x);
  const hi = Math.max(...x);
  return {
    id,
    kind: 'scatter',
    title,
    intro,
    xTitle,
    yTitle,
    points: pts,
    line: [
      { x: lo, y: a + b * lo },
      { x: hi, y: a + b * hi },
    ],
    note: `Recta: ${yTitle.toLowerCase()} = ${f2(a)} ${b < 0 ? '−' : '+'} ${f2(Math.abs(b))} · ${xTitle.toLowerCase()}. r = ${f2(r.r)}, R² = ${f2(r.r * r.r)}, n = ${String(r.n)}.`,
    reading: `H₀: no hay relación lineal (ρ = 0). t = ${f2(r.t)} con ${String(r.n - 2)} gl. ${decide(r.p, 'hay relación lineal.', 'no hay evidencia de relación lineal.')}`,
  };
}

function correlation(
  id: string,
  title: string,
  intro: string,
  cols: { label: string; values: number[] }[],
): Analysis | null {
  const n = cols[0]?.values.length ?? 0;
  if (n < MIN_GAMES || cols.length < 3) return null;
  const tests = cols.map((a) => cols.map((b) => pearson(a.values, b.values)));
  return {
    id,
    kind: 'corr',
    title,
    intro,
    labels: cols.map((c) => c.label),
    matrix: tests.map((r) => r.map((t) => t.r)),
    pvals: tests.map((r) => r.map((t) => t.p)),
    n,
  };
}

function binomialNext(id: string, wins: number, n: number, games = 5): Analysis {
  const p = wins / n;
  const bars = Array.from({ length: games + 1 }, (_, k) => ({ label: String(k), p: binomPmf(k, games, p) }));
  const atLeast = bars.slice(Math.ceil(games / 2)).reduce((s, b) => s + b.p, 0);
  return {
    id,
    kind: 'pmf',
    title: `¿Cuántos de los próximos ${String(games)} partidos gana? (binomial)`,
    intro: `Si cada partido fuera independiente y se ganara con la misma probabilidad que en la temporada (p = ${pc(p)}), las victorias en ${String(games)} partidos siguen una binomial(n = ${String(games)}, p).`,
    xTitle: 'Victorias',
    bars,
    reading: `Probabilidad de ganar ${String(Math.ceil(games / 2))} o más: ${pc(atLeast)}. Esperanza: ${f2(games * p)} victorias; varianza: ${f2(games * p * (1 - p))}.`,
  };
}

/** Teorema central del límite: medias de muestras de tamaño m (remuestreo con semilla) contra la normal. */
function centralLimit(id: string, what: string, xs: number[], m = 5, reps = 400): Analysis | null {
  if (xs.length < MIN_GAMES) return null;
  const rnd = seeded(xs.length * 31 + 7);
  const means = Array.from({ length: reps }, () =>
    mean(Array.from({ length: m }, () => xs[Math.floor(rnd() * xs.length)] as number)),
  );
  const d = normalDist(
    id,
    `Teorema central del límite: el promedio de ${String(m)} partidos`,
    `promedios de ${what}`,
    means,
  );
  if (!d) return null;
  const s = describe(xs);
  return {
    ...d,
    intro: `Se toman ${String(reps)} muestras al azar de ${String(m)} partidos (con reposición) y se calcula el promedio de ${what} de cada una. Aunque los datos originales no sean normales, los promedios se acercan a una normal con media μ = ${f2(s.mean)} y desvío σ/√n = ${f2(s.sd / Math.sqrt(m))}.`,
  };
}

const RESULTS = ['Victoria', 'Derrota'];

export interface TeamMatchLike {
  home: boolean;
  pointsFor: number;
  pointsAgainst: number;
  competitionName: string;
  stats: Record<string, number>;
}

/** Equipo: puntos, triples, resultados, localía, competiciones, ritmo y eficiencia. */
export function teamAnalyses(matches: TeamMatchLike[]): Analysis[] {
  if (matches.length < MIN_GAMES) return [];
  const pf = matches.map((m) => m.pointsFor);
  const pa = matches.map((m) => m.pointsAgainst);
  const wins = matches.filter((m) => m.pointsFor > m.pointsAgainst).length;
  const home = matches.filter((m) => m.home);
  const away = matches.filter((m) => !m.home);
  const triples = numbers(matches.map((m) => m.stats.team_fg3m)).map(Math.round);
  const lambda = triples.length ? mean(triples) : 0;
  const out: (Analysis | null)[] = [
    normalDist('puntos-favor', 'Puntos a favor por partido (normal)', 'puntos a favor', pf),
    normalDist('puntos-contra', 'Puntos en contra por partido (normal)', 'puntos en contra', pa),
    {
      id: 'intervalos',
      kind: 'ci',
      title: 'Estimación por intervalos (95 %)',
      intro: `Los ${String(matches.length)} partidos son una muestra del rendimiento del equipo. Media con intervalo t de Student (t crítico = ${f2(tCrit(0.05, matches.length - 1))}).`,
      format: 'num',
      rows: [
        meanCi('Puntos a favor', pf),
        meanCi('Puntos en contra', pa),
        meanCi(
          'Diferencia de puntos',
          matches.map((m) => m.pointsFor - m.pointsAgainst),
        ),
      ],
    },
    centralLimit('tcl', 'puntos a favor', pf),
    poissonDist('triples', 'Triples convertidos por partido (Poisson)', 'triples convertidos', triples),
    triples.length >= MIN_GAMES
      ? {
          id: 'proximo-triples',
          kind: 'pmf',
          title: '¿Cuántos triples mete en el próximo partido? (Poisson)',
          intro: `Con λ = ${f2(lambda)} triples por partido, la probabilidad de cada cantidad en un partido.`,
          xTitle: 'Triples convertidos',
          bars: Array.from({ length: Math.ceil(lambda * 2) + 1 }, (_, k) => ({
            label: String(k),
            p: poissonPmf(k, lambda),
          })),
          reading: `P(10 o más) = ${pc(1 - Array.from({ length: 10 }, (_, k) => poissonPmf(k, lambda)).reduce((a, b) => a + b, 0))} · P(5 o menos) = ${pc(Array.from({ length: 6 }, (_, k) => poissonPmf(k, lambda)).reduce((a, b) => a + b, 0))}.`,
        }
      : null,
    binomialNext('binomial', wins, matches.length),
    {
      id: 'intervalos-resultado',
      kind: 'ci',
      title: 'Proporción de victorias (95 %)',
      intro: 'Proporción de victorias y derrotas con su intervalo de confianza de Wilson (en básquet no hay empates).',
      format: 'pct',
      rows: [propCi('Victorias', wins, matches.length), propCi('Derrotas', matches.length - wins, matches.length)],
    },
  ];
  if (home.length >= 2 && away.length >= 2) {
    const hw = home.filter((m) => m.pointsFor > m.pointsAgainst).length;
    const aw = away.filter((m) => m.pointsFor > m.pointsAgainst).length;
    const t = welch(
      home.map((m) => m.pointsFor),
      away.map((m) => m.pointsFor),
    );
    const tpa = welch(
      home.map((m) => m.pointsAgainst),
      away.map((m) => m.pointsAgainst),
    );
    const f = fVariances(
      home.map((m) => m.pointsFor),
      away.map((m) => m.pointsFor),
    );
    const z = twoProportions(hw, home.length, aw, away.length);
    out.push(
      {
        id: 'localia-cajas',
        kind: 'box',
        title: 'Puntos a favor de local y de visitante',
        intro: 'Diagramas de caja: el rombo es la media; la raya, la mediana.',
        format: 'num',
        rows: [
          { label: 'Local', summary: describe(home.map((m) => m.pointsFor)) },
          { label: 'Visitante', summary: describe(away.map((m) => m.pointsFor)) },
        ],
      },
      {
        id: 'localia-pruebas',
        kind: 'tests',
        title: '¿Jugar de local cambia algo? (pruebas de hipótesis)',
        intro: 'Dos muestras independientes (partidos de local y de visitante). H₀ en cada fila: no hay diferencia.',
        labels: ['Local', 'Visitante'],
        rows: [
          {
            question: 'Puntos a favor por partido',
            test: 't de Welch',
            a: f2(mean(home.map((m) => m.pointsFor))),
            b: f2(mean(away.map((m) => m.pointsFor))),
            letter: 't',
            statistic: t.statistic,
            df: f2(t.df as number),
            p: t.p,
          },
          {
            question: 'Puntos en contra por partido',
            test: 't de Welch',
            a: f2(mean(home.map((m) => m.pointsAgainst))),
            b: f2(mean(away.map((m) => m.pointsAgainst))),
            letter: 't',
            statistic: tpa.statistic,
            df: f2(tpa.df as number),
            p: tpa.p,
          },
          {
            question: 'Dispersión de los puntos a favor',
            test: 'F de varianzas',
            a: '',
            b: '',
            letter: 'F',
            statistic: f.statistic,
            df: (f.df as number[]).join('; '),
            p: f.p,
          },
          {
            question: 'Proporción de victorias',
            test: 'z de dos proporciones',
            a: pc(z.p1),
            b: pc(z.p2),
            letter: 'z',
            statistic: z.statistic,
            df: '–',
            p: z.p,
          },
        ],
      },
    );
    const table = [home, away].map((g) => [
      g.filter((m) => m.pointsFor > m.pointsAgainst).length,
      g.filter((m) => m.pointsFor < m.pointsAgainst).length,
    ]);
    const c = chi2Independence(table);
    out.push({
      id: 'localia-contingencia',
      kind: 'contingency',
      title: '¿El resultado depende de la localía? (tabla de contingencia)',
      intro:
        'H₀: el resultado es independiente de jugar de local. Observados y, abajo, los esperados si fueran independientes.',
      rowLabels: ['Local', 'Visitante'],
      colLabels: RESULTS,
      table,
      ...c,
      df: c.df as number,
      reading: `χ² = ${f2(c.statistic)} con ${String(c.df)} gl. ${decide(c.p, 'el resultado depende de la localía.', 'no hay evidencia de que dependa.')} Con pocos partidos, varias celdas esperan menos de 5: tomarlo con cuidado.`,
    });
  }
  const comps = [...new Set(matches.map((m) => m.competitionName))]
    .map((name) => ({ name, xs: matches.filter((m) => m.competitionName === name).map((m) => m.pointsFor) }))
    .filter((g) => g.xs.length >= 3);
  if (comps.length >= 2) {
    const a = anova(comps.map((g) => g.xs));
    out.push({
      id: 'anova-competicion',
      kind: 'anova',
      title: '¿Anota más en alguna competición? (ANOVA)',
      intro: 'H₀: la media de puntos a favor es la misma en todas las competiciones (con al menos 3 partidos).',
      result: a,
      rows: comps.map((g) => ({ label: g.name, summary: describe(g.xs) })),
      format: 'num',
      reading: `F = ${f2(a.f)} con (${String(a.dfb)}; ${String(a.dfw)}) gl. ${decide(a.p, `la competición sí cambia los puntos (η² = ${pc(a.eta2)}).`, 'no hay evidencia de diferencia entre competiciones.')}`,
    });
  }
  const withPace = matches.filter((m) => typeof m.stats.possessions === 'number');
  const withTs = matches.filter((m) => typeof m.stats.ts === 'number');
  out.push(
    regressionScatter(
      'puntos-posesiones',
      'Puntos contra posesiones (regresión lineal simple)',
      'Cada punto es un partido. La pendiente es cuántos puntos suma cada posesión más: con más ritmo, más puntos.',
      'Posesiones',
      'Puntos',
      withPace.map((m, i) => ({ key: String(i), x: m.stats.possessions as number, y: m.pointsFor })),
    ),
    regressionScatter(
      'puntos-ts',
      'Puntos contra TS% (regresión lineal simple)',
      'Cada punto es un partido: cuánto pesa la eficiencia de tiro en el marcador.',
      'TS%',
      'Puntos',
      withTs.map((m, i) => ({ key: String(i), x: m.stats.ts as number, y: m.pointsFor })),
    ),
    qq('qq-ortg', 'el ORtg por partido', numbers(matches.map((m) => m.stats.ortg))),
  );
  return out.filter((a): a is Analysis => a !== null);
}

export interface SituationRowLike {
  title: string;
  param: string;
  n: number;
  w: number;
}

/** Situaciones: cada «cuando pasa X» es una proporción condicional con su intervalo y su prueba. */
export function situationAnalyses(rows: SituationRowLike[], baseWinPct: number | null): Analysis[] {
  const base = (baseWinPct ?? 0) / 100;
  // Con p₀ en 0 o 1 la prueba no tiene sentido (la temporada entera ganada o perdida).
  if (base <= 0 || base >= 1) return [];
  const tested = rows
    .filter((r) => r.n >= 3 && r.param)
    .map((r) => ({ ...r, ...oneProportion(r.w, r.n, base) }))
    .sort((a, b) => a.p - b.p)
    .slice(0, 14);
  if (!tested.length) return [];
  const best = tested[0];
  return [
    {
      id: 'situaciones-ic',
      kind: 'ci',
      title: 'Probabilidad condicional de ganar (intervalos del 95 %)',
      intro: `P(ganar | situación): proporción de victorias cuando se da cada situación, con su intervalo de Wilson. La línea es P(ganar) en toda la temporada (${pc(base)}). Si el intervalo no la toca, la situación cambia de verdad la probabilidad. Se muestran las 14 con la prueba más fuerte (al menos 3 partidos).`,
      format: 'pct',
      rows: tested.map((r) => propCi(`${r.title}: ${r.param}`, r.w, r.n)),
      ref: { label: 'Temporada', value: base },
    },
    {
      id: 'situaciones-pruebas',
      kind: 'tests',
      title: '¿La situación cambia la probabilidad de ganar? (z de una proporción)',
      intro: `H₀: P(ganar | situación) = P(ganar) = ${pc(base)}. Con muchas pruebas a la vez, alguna sale significativa por azar: mirar las de p muy chico.`,
      labels: ['En la situación', 'Temporada'],
      rows: tested.map((r) => ({
        question: `${r.title}: ${r.param} (n = ${String(r.n)})`,
        test: 'z de una proporción',
        a: pc(r.w / r.n),
        b: pc(base),
        letter: 'z',
        statistic: r.z,
        df: '–',
        p: r.p,
      })),
      reading: best
        ? `Teorema de Bayes: P(situación | ganó) = P(ganar | situación) · P(situación) / P(ganar). Por ejemplo, «${best.title}: ${best.param}» pasó en ${String(best.n)} partidos y se ganaron ${String(best.w)}.`
        : undefined,
    },
  ];
}

export interface PlayerLike {
  name: string;
  /** Zona: Exterior, Alero o Interior. */
  zone: string | null;
  minutes: number;
  games: number;
  stats: Record<string, number>;
}

const per36 = (p: PlayerLike, key: string) => {
  const v = p.stats[key];
  return v === undefined || !p.minutes ? null : (v / p.minutes) * 36;
};

const KEY_STATS: { key: string; label: string; rate: boolean }[] = [
  { key: 'pts', label: 'Puntos', rate: true },
  { key: 'trb', label: 'Rebotes', rate: true },
  { key: 'ast', label: 'Asistencias', rate: true },
  { key: 'stl', label: 'Robos', rate: true },
  { key: 'blk', label: 'Tapas', rate: true },
  { key: 'tov', label: 'Pérdidas', rate: true },
  { key: 'ts', label: 'TS%', rate: false },
  { key: 'efficiency', label: 'Valoración', rate: true },
];

/** Jugadores: valoración por zona, normalidad, correlaciones y regresión múltiple (cada 36 minutos). */
export function squadAnalyses(players: PlayerLike[]): Analysis[] {
  const regular = players.filter((p) => p.minutes >= 120 && p.games > 0 && typeof p.stats.efficiency === 'number');
  if (regular.length < MIN_GAMES) return [];
  const rating = (p: PlayerLike) => (p.stats.efficiency as number) / p.games;
  const ratings = regular.map(rating);
  const groups = ['Exterior', 'Alero', 'Interior']
    .map((g) => ({ label: g, xs: regular.filter((p) => p.zone === g).map(rating) }))
    .filter((g) => g.xs.length >= 2);
  const out: (Analysis | null)[] = [];
  if (groups.length >= 2) {
    const a = anova(groups.map((g) => g.xs));
    out.push({
      id: 'valoracion-zona',
      kind: 'anova',
      title: '¿La valoración depende de la zona? (ANOVA)',
      intro: `Jugadores con 120 minutos o más (n = ${String(regular.length)}). H₀: la valoración media por partido es la misma en exteriores, aleros e interiores.`,
      result: a,
      rows: groups.map((g) => ({ label: g.label, summary: describe(g.xs) })),
      format: 'num',
      reading: `F = ${f2(a.f)} con (${String(a.dfb)}; ${String(a.dfw)}) gl. ${decide(a.p, `la zona cambia la valoración (η² = ${pc(a.eta2)}).`, 'no hay evidencia de que la zona la cambie.')}`,
    });
  }
  out.push(
    normalDist(
      'valoracion-normal',
      'Distribución de la valoración por partido (normal)',
      'valoración por partido',
      ratings,
    ),
    qq('valoracion-qq', 'la valoración por partido', ratings),
  );
  const cols = KEY_STATS.map((s) => ({
    label: s.label,
    values: regular.map((p) => (s.rate ? per36(p, s.key) : (p.stats[s.key] ?? null))),
  })).filter((c) => c.values.every((v) => v !== null)) as { label: string; values: number[] }[];
  const shots = (p: PlayerLike) => (p.stats.fg2a ?? 0) + (p.stats.fg3a ?? 0);
  out.push(
    correlation(
      'correlaciones',
      'Correlaciones entre estadísticas (cada 36 minutos)',
      'Coeficiente de Pearson entre cada par de estadísticas del plantel. Verde: relación positiva fuerte; rojo: negativa. El asterisco marca las significativas (p < 0,05).',
      cols,
    ),
    regressionScatter(
      'puntos-tiros',
      'Puntos contra tiros de campo intentados (regresión simple)',
      'Cada punto es un jugador (totales de la temporada). Arriba de la recta saca más puntos por tiro que el resto del plantel.',
      'Tiros de campo intentados',
      'Puntos',
      regular
        .filter((p) => typeof p.stats.pts === 'number')
        .map((p) => ({ key: p.name, x: shots(p), y: p.stats.pts as number, label: p.name })),
    ),
  );
  const predictors = ['pts', 'trb', 'ast', 'tov'];
  const usable = regular.filter((p) => predictors.every((k) => typeof p.stats[k] === 'number'));
  if (usable.length >= predictors.length + 4) {
    const reg = ols(
      usable.map((p) => predictors.map((k) => per36(p, k) ?? 0)),
      usable.map((p) => per36(p, 'efficiency') ?? 0),
      ['Puntos cada 36', 'Rebotes cada 36', 'Asistencias cada 36', 'Pérdidas cada 36'],
    );
    if (reg)
      out.push({
        id: 'regresion-valoracion',
        kind: 'regression',
        title: '¿Qué explica la valoración? (regresión lineal múltiple)',
        intro:
          'Valoración = β₀ + β₁·puntos + β₂·rebotes + β₃·asistencias + β₄·pérdidas (todo cada 36 minutos). Cada β es cuánto cambia la valoración por una unidad más de esa estadística, con las demás fijas.',
        result: reg,
        reading: `R² = ${f2(reg.r2)}: estas cuatro estadísticas explican el ${pc(reg.r2)} de las diferencias de valoración. ${decide(reg.pF, 'el modelo en conjunto es significativo.', 'el modelo en conjunto no es significativo.')}`,
      });
  }
  return out.filter((a): a is Analysis => a !== null);
}

export interface PlayerMatchLike {
  home: boolean;
  started: boolean | null;
  minutes: number | null;
  rating: number | null;
  triples: number | null;
}

/** Valoración de 10 o más: un partido bueno en la LNB. */
const GOOD = 10;

/** Un jugador: su valoración partido a partido, triples y diferencias de local o titular. */
export function playerAnalyses(matches: PlayerMatchLike[]): Analysis[] {
  const rated = matches.filter((m) => m.rating !== null && (m.minutes ?? 0) > 0);
  if (rated.length < MIN_GAMES) return [];
  const r = rated.map((m) => m.rating as number);
  const good = r.filter((v) => v >= GOOD).length;
  const out: (Analysis | null)[] = [
    normalDist('jugador-normal', 'Su valoración partido a partido (normal)', 'valoración', r),
    {
      id: 'jugador-ic',
      kind: 'ci',
      title: 'Estimación por intervalos (95 %)',
      intro: 'Valoración media con intervalo t de Student.',
      format: 'num',
      rows: [meanCi('Valoración media', r)],
    },
    {
      id: 'jugador-ic-prop',
      kind: 'ci',
      title: `Partidos con valoración de ${String(GOOD)} o más (95 %)`,
      intro: 'Proporción de partidos buenos, con su intervalo de confianza de Wilson.',
      format: 'pct',
      rows: [propCi(`Valoración ${String(GOOD)} o más`, good, r.length)],
    },
  ];
  const home = rated.filter((m) => m.home).map((m) => m.rating as number);
  const away = rated.filter((m) => !m.home).map((m) => m.rating as number);
  const st = rated.filter((m) => m.started === true).map((m) => m.rating as number);
  const sub = rated.filter((m) => m.started === false).map((m) => m.rating as number);
  const rows: Extract<Analysis, { kind: 'tests' }>['rows'] = [];
  if (home.length >= 2 && away.length >= 2) {
    const t = welch(home, away);
    rows.push({
      question: 'Valoración de local contra visitante',
      test: 't de Welch',
      a: f2(mean(home)),
      b: f2(mean(away)),
      letter: 't',
      statistic: t.statistic,
      df: f2(t.df as number),
      p: t.p,
    });
    const f = fVariances(home, away);
    rows.push({
      question: 'Regularidad de local contra visitante',
      test: 'F de varianzas',
      a: '',
      b: '',
      letter: 'F',
      statistic: f.statistic,
      df: (f.df as number[]).join('; '),
      p: f.p,
    });
  }
  if (st.length >= 2 && sub.length >= 2) {
    const t = welch(st, sub);
    rows.push({
      question: 'Valoración de titular contra suplente',
      test: 't de Welch',
      a: f2(mean(st)),
      b: f2(mean(sub)),
      letter: 't',
      statistic: t.statistic,
      df: f2(t.df as number),
      p: t.p,
    });
  }
  if (rows.length)
    out.push(
      {
        id: 'jugador-cajas',
        kind: 'box',
        title: 'Valoración según el partido',
        intro: 'Diagramas de caja de su valoración en cada grupo de partidos.',
        format: 'num',
        rows: [
          ...(home.length >= 2 ? [{ label: 'Local', summary: describe(home) }] : []),
          ...(away.length >= 2 ? [{ label: 'Visitante', summary: describe(away) }] : []),
          ...(st.length >= 2 ? [{ label: 'Titular', summary: describe(st) }] : []),
          ...(sub.length >= 2 ? [{ label: 'Suplente', summary: describe(sub) }] : []),
        ],
      },
      {
        id: 'jugador-pruebas',
        kind: 'tests',
        title: '¿Rinde distinto según el partido? (pruebas de hipótesis)',
        intro: 'H₀ en cada fila: no hay diferencia entre los dos grupos de partidos.',
        labels: ['Grupo 1', 'Grupo 2'],
        rows,
      },
    );
  out.push(
    regressionScatter(
      'jugador-minutos',
      'Valoración contra minutos jugados (regresión simple)',
      'Cada punto es un partido.',
      'Minutos',
      'Valoración',
      rated
        .filter((m) => m.minutes !== null)
        .map((m, i) => ({ key: String(i), x: m.minutes as number, y: m.rating as number })),
    ),
    qq('jugador-qq', 'su valoración', r),
  );
  const triples = rated.filter((m) => m.triples !== null).map((m) => m.triples as number);
  if (triples.some((g) => g > 0)) {
    const lambda = mean(triples);
    const p = 1 - poissonPmf(0, lambda);
    out.push(poissonDist('jugador-triples', 'Sus triples por partido (Poisson)', 'triples', triples), {
      id: 'jugador-marca',
      kind: 'pmf',
      title: '¿Mete un triple en el próximo partido? (Poisson y geométrica)',
      intro: `Con λ = ${f2(lambda)} triples por partido, P(mete al menos uno) = 1 − e^(−λ). La geométrica da en qué partido vuelve a meter si en uno no mete.`,
      xTitle: 'Partido en que mete un triple',
      bars: Array.from({ length: 8 }, (_, k) => ({ label: String(k + 1), p: (1 - p) ** k * p })),
      reading: `P(mete al menos un triple en un partido) = ${pc(p)}. Espera media hasta el próximo partido con triple: ${f2(1 / p)} partidos.`,
    });
  }
  return out.filter((a): a is Analysis => a !== null);
}

/** Comparar: dos jugadores partido a partido. */
export function compareAnalyses(
  a: { name: string; ratings: number[] },
  b: { name: string; ratings: number[] },
): Analysis[] {
  if (a.ratings.length < 3 || b.ratings.length < 3) return [];
  const t = welch(a.ratings, b.ratings);
  const f = fVariances(a.ratings, b.ratings);
  const ga = a.ratings.filter((v) => v >= GOOD).length;
  const gb = b.ratings.filter((v) => v >= GOOD).length;
  const z = twoProportions(ga, a.ratings.length, gb, b.ratings.length);
  return [
    {
      id: 'comparar-cajas',
      kind: 'box',
      title: 'Valoración partido a partido',
      intro: 'Diagramas de caja de la valoración de cada uno en los partidos que jugó.',
      format: 'num',
      rows: [
        { label: a.name, summary: describe(a.ratings) },
        { label: b.name, summary: describe(b.ratings) },
      ],
    },
    {
      id: 'comparar-ic',
      kind: 'ci',
      title: 'Valoración media (intervalos del 95 %)',
      intro: 'Si los intervalos no se tocan, la diferencia es clara.',
      format: 'num',
      rows: [meanCi(a.name, a.ratings), meanCi(b.name, b.ratings)],
    },
    {
      id: 'comparar-pruebas',
      kind: 'tests',
      title: '¿Uno rinde más o es más regular? (pruebas de hipótesis)',
      intro: 'Dos muestras independientes: los partidos de cada uno. H₀ en cada fila: son iguales.',
      labels: [a.name, b.name],
      rows: [
        {
          question: 'Valoración media',
          test: 't de Welch',
          a: f2(mean(a.ratings)),
          b: f2(mean(b.ratings)),
          letter: 't',
          statistic: t.statistic,
          df: f2(t.df as number),
          p: t.p,
        },
        {
          question: 'Regularidad (varianza)',
          test: 'F de varianzas',
          a: f2(describe(a.ratings).sd),
          b: f2(describe(b.ratings).sd),
          letter: 'F',
          statistic: f.statistic,
          df: (f.df as number[]).join('; '),
          p: f.p,
        },
        {
          question: `Partidos con ${String(GOOD)} o más`,
          test: 'z de dos proporciones',
          a: pc(z.p1),
          b: pc(z.p2),
          letter: 'z',
          statistic: z.statistic,
          df: '–',
          p: z.p,
        },
      ],
    },
  ];
}

/** Alternativas: correlación entre las estadísticas que usa el agrupamiento. */
export function styleAnalyses(
  rows: { features: Record<string, number> }[],
  labels: Record<string, string>,
): Analysis[] {
  const keys = Object.keys(rows[0]?.features ?? {}).filter((k) => rows.every((r) => typeof r.features[k] === 'number'));
  const a = correlation(
    'estilos-correlacion',
    'Correlación entre las estadísticas del agrupamiento',
    'Coeficiente de Pearson entre las estadísticas cada 36 que usa K-means. Las muy correlacionadas miden casi lo mismo: por eso se resumen en componentes principales. El asterisco marca p < 0,05.',
    keys.map((k) => ({ label: labels[k] ?? k, values: rows.map((r) => r.features[k] as number) })),
  );
  return a ? [a] : [];
}

/** Valor: diagnóstico de la regresión (residuos). En dólares trabaja con log₁₀; en minutos, lineal. */
export function valueAnalyses(
  rows: { name: string; actual: number | null; predicted: number | null }[],
  unit: string,
): Analysis[] {
  const ok = rows.filter((r) => r.actual !== null && r.predicted !== null && r.actual > 0 && r.predicted > 0);
  if (ok.length < MIN_GAMES) return [];
  const log = unit === 'USD';
  const t = (v: number) => (log ? Math.log10(v) : v);
  const fitted = ok.map((r) => t(r.predicted as number));
  const res = ok.map((r) => t(r.actual as number) - t(r.predicted as number));
  const big = log ? 0.3 : 2 * describe(res).sd;
  const out: (Analysis | null)[] = [
    {
      id: 'valor-residuos',
      kind: 'scatter',
      title: 'Residuos contra valores ajustados',
      intro: `Supuesto de la regresión: los residuos (${log ? 'log₁₀ real − log₁₀ esperado' : 'minutos reales − minutos esperados'}) no muestran forma y tienen la misma dispersión en todo el rango. Si forman un embudo o una curva, el modelo deja algo afuera.`,
      xTitle: log ? 'log₁₀ del valor esperado' : 'Minutos por partido esperados',
      yTitle: 'Residuo',
      points: ok.map((r, i) => ({
        key: r.name,
        x: fitted[i] as number,
        y: res[i] as number,
        label: Math.abs(res[i] as number) > big ? r.name : undefined,
      })),
      line: [
        { x: Math.min(...fitted), y: 0 },
        { x: Math.max(...fitted), y: 0 },
      ],
      note: `Media de los residuos: ${f2(mean(res))} (debe ser cerca de 0).`,
      reading: (() => {
        const c = pearson(fitted, res.map(Math.abs));
        return `Correlación entre el ajustado y el tamaño del residuo: ${f2(c.r)}. ${decide(c.p, 'la dispersión cambia con el valor (heterocedasticidad).', 'no hay evidencia de que la dispersión cambie.')}`;
      })(),
    },
    normalDist('valor-residuos-normal', '¿Los residuos son normales?', 'residuos', res),
    qq('valor-qq', 'el residuo', res),
  ];
  return out.filter((a): a is Analysis => a !== null);
}

/** Predictor: inferencia bayesiana de la probabilidad de ganar y aproximación normal a la binomial. */
export function predictorAnalyses(matches: TeamMatchLike[]): Analysis[] {
  if (matches.length < MIN_GAMES) return [];
  const n = matches.length;
  const w = matches.filter((m) => m.pointsFor > m.pointsAgainst).length;
  // A priori: en una liga sin empates un equipo promedio gana la mitad, con el peso de 10 partidos.
  const a0 = 5;
  const b0 = 5;
  const a1 = a0 + w;
  const b1 = b0 + n - w;
  const grid = Array.from({ length: 99 }, (_, i) => (i + 1) / 100);
  const post = a1 / (a1 + b1);
  const sdPost = Math.sqrt((a1 * b1) / ((a1 + b1) ** 2 * (a1 + b1 + 1)));
  const wi = wilson(w, n);
  const games = 20;
  const p = Math.min(0.99, Math.max(0.01, w / n));
  const mu = games * p;
  const sd = Math.sqrt(games * p * (1 - p));
  const ks = Array.from({ length: games + 1 }, (_, k) => k);
  const atLeast = Math.ceil(games / 2);
  return [
    {
      id: 'bayes',
      kind: 'curves',
      title: 'Probabilidad de ganar: inferencia clásica y bayesiana',
      intro: `Bayesiana: se parte de una creencia a priori, Beta(${f2(a0)}; ${f2(b0)}) (un equipo promedio gana la mitad), y se actualiza con los ${String(n)} partidos (${String(w)} victorias): la a posteriori es Beta(${f2(a1)}; ${f2(b1)}). Clásica: la proporción observada con su intervalo.`,
      xTitle: 'Probabilidad de ganar',
      yTitle: 'Densidad',
      curves: [
        {
          key: 'priori',
          label: 'A priori',
          color: 'var(--chart-axis)',
          points: grid.map((x) => ({ x, y: betaPdf(x, a0, b0) })),
        },
        {
          key: 'posteriori',
          label: 'A posteriori',
          color: 'var(--series-2)',
          points: grid.map((x) => ({ x, y: betaPdf(x, a1, b1) })),
        },
      ],
      reading: `Bayesiana: media a posteriori ${pc(post)}, intervalo creíble aproximado ${pc(Math.max(0, post - 1.96 * sdPost))} a ${pc(Math.min(1, post + 1.96 * sdPost))}. Clásica: ${pc(wi.p)} con intervalo de confianza de Wilson ${pc(wi.lo)} a ${pc(wi.hi)}. La bayesiana tira hacia el 50 %; con más partidos, las dos coinciden.`,
    },
    {
      id: 'normal-binomial',
      kind: 'pmf',
      title: `Victorias en los próximos ${String(games)} partidos: binomial y su aproximación normal`,
      intro: `Las victorias en ${String(games)} partidos son binomial(n = ${String(games)}, p = ${pc(p)}). Como n·p y n·(1 − p) superan 5, se aproxima por una normal con μ = n·p = ${f2(mu)} y σ = √(n·p·(1 − p)) = ${f2(sd)} (con corrección por continuidad).`,
      xTitle: `Victorias en ${String(games)} partidos`,
      bars: ks.map((k) => ({
        label: String(k),
        p: binomPmf(k, games, p),
        approx: normalCdf(k + 0.5, mu, sd) - normalCdf(k - 0.5, mu, sd),
      })),
      approxLabel: 'Normal aproximada',
      reading: `P(${String(atLeast)} victorias o más) según la binomial: ${pc(ks.filter((k) => k >= atLeast).reduce((s, k) => s + binomPmf(k, games, p), 0))}; según la normal: ${pc(1 - normalCdf(atLeast - 0.5, mu, sd))}.`,
    },
  ];
}

/** Estadística desglosada: la serie partido a partido de una estadística. */
export function seriesAnalyses(points: { value: number | null; date: string }[], what: string): Analysis[] {
  const xs = points.filter((p) => p.value !== null).map((p) => p.value as number);
  if (xs.length < MIN_GAMES + 1) return [];
  const half = Math.floor(xs.length / 2);
  const first = xs.slice(0, half);
  const second = xs.slice(half);
  const t = welch(first, second);
  const f = fVariances(first, second);
  const out: (Analysis | null)[] = [
    {
      id: 'serie-ic',
      kind: 'ci',
      title: 'Media por partido (intervalo del 95 %)',
      intro: `Media de ${what} por partido con intervalo t de Student (t crítico = ${f2(tCrit(0.05, xs.length - 1))}).`,
      format: 'num',
      rows: [meanCi('Toda la serie', xs), meanCi('Primera mitad', first), meanCi('Segunda mitad', second)],
    },
    {
      id: 'serie-pruebas',
      kind: 'tests',
      title: '¿Cambió entre la primera y la segunda mitad? (pruebas de hipótesis)',
      intro: 'Los partidos se parten en dos mitades por fecha. H₀: no cambió.',
      labels: ['Primera mitad', 'Segunda mitad'],
      rows: [
        {
          question: 'Media por partido',
          test: 't de Welch',
          a: f2(mean(first)),
          b: f2(mean(second)),
          letter: 't',
          statistic: t.statistic,
          df: f2(t.df as number),
          p: t.p,
        },
        {
          question: 'Dispersión',
          test: 'F de varianzas',
          a: '',
          b: '',
          letter: 'F',
          statistic: f.statistic,
          df: (f.df as number[]).join('; '),
          p: f.p,
        },
      ],
    },
    regressionScatter(
      'serie-tendencia',
      'Tendencia en la temporada (regresión simple)',
      'Cada punto es un partido en orden. Si la pendiente es significativa, la estadística viene subiendo o bajando.',
      'Partido',
      cap(what),
      xs.map((v, i) => ({ key: String(i), x: i + 1, y: v })),
    ),
    normalDist('serie-normal', 'Distribución de los valores por partido', what, xs),
  ];
  return out.filter((a): a is Analysis => a !== null);
}

/** Partido: qué tan probable era el resultado con la normal de los puntos y del margen de la temporada. */
export function matchAnalyses(match: TeamMatchLike, season: TeamMatchLike[]): Analysis[] {
  if (season.length < MIN_GAMES) return [];
  const pf = describe(season.map((m) => m.pointsFor));
  const margins = season.map((m) => m.pointsFor - m.pointsAgainst);
  const mg = describe(margins);
  const diff = match.pointsFor - match.pointsAgainst;
  const curve = (s: Summary, value: number, xTitle: string, label: string) => {
    const lo = Math.min(s.mean - 3.5 * s.sd, value - 5);
    const hi = Math.max(s.mean + 3.5 * s.sd, value + 5);
    const xs = Array.from({ length: 61 }, (_, i) => lo + ((hi - lo) * i) / 60);
    return {
      xTitle,
      yTitle: 'Densidad',
      curves: [
        {
          key: 'normal',
          label,
          color: 'var(--series-2)',
          points: xs.map((x) => ({ x, y: normalPdf(x, s.mean, s.sd) })),
        },
        {
          key: 'partido',
          label: 'Este partido',
          color: 'var(--color-fg)',
          points: [
            { x: value, y: 0 },
            { x: value, y: normalPdf(s.mean, s.mean, s.sd) },
          ],
        },
      ],
    };
  };
  const zPts = (match.pointsFor - pf.mean) / pf.sd;
  const zMargin = (diff - mg.mean) / mg.sd;
  const pWin = 1 - normalCdf(0, mg.mean, mg.sd);
  const tail = (z: number) => 2 * (1 - normalCdf(Math.abs(z)));
  return [
    {
      id: 'partido-puntos',
      kind: 'curves',
      title: '¿Fueron muchos o pocos puntos? (normal de los puntos a favor)',
      intro: `Los puntos a favor de la temporada aproximados por una normal (μ = ${f2(pf.mean)}, σ = ${f2(pf.sd)}); la línea vertical son los ${String(match.pointsFor)} de este partido.`,
      ...curve(pf, match.pointsFor, 'Puntos a favor', 'Temporada'),
      reading: `z = ${f2(zPts)}; P(un partido tan lejos de la media o más) = ${pc(tail(zPts))}: ${Math.abs(zPts) >= 2 ? 'un partido poco común (más de 2 desvíos).' : 'dentro de lo normal para la temporada.'}`,
    },
    {
      id: 'partido-margen',
      kind: 'curves',
      title: '¿Fue un partido raro? (normal de la diferencia de puntos)',
      intro: `La diferencia de puntos de la temporada aproximada por una normal (μ = ${f2(mg.mean)}, σ = ${f2(mg.sd)}); la línea vertical es la de este partido (${diff > 0 ? '+' : ''}${String(diff)}).`,
      ...curve(mg, diff, 'Diferencia de puntos', 'Temporada'),
      reading: `Con esa normal, P(ganar un partido) = P(diferencia > 0) = ${pc(pWin)}. Este partido: z = ${f2(zMargin)}, ${Math.abs(zMargin) >= 2 ? 'un resultado poco común (más de 2 desvíos de la media).' : 'dentro de lo normal para la temporada.'}`,
    },
  ];
}

// ——— Mercado del Ojeador ———

export interface MarketRowLike {
  name: string;
  team: string;
  group: string;
  age: number;
  value: number;
}

export const AGE_BANDS = [
  { label: 'Hasta 23', min: 0, max: 23 },
  { label: '24 a 27', min: 24, max: 27 },
  { label: '28 a 31', min: 28, max: 31 },
  { label: '32 o más', min: 32, max: 99 },
] as const;
const bandOf = (age: number) => AGE_BANDS.findIndex((b) => age >= b.min && age <= b.max);
export const GROUP_COLOR: Record<string, string> = {
  Exterior: 'var(--series-4)',
  Alero: 'var(--series-2)',
  Interior: 'var(--series-8)',
};

/** Diseño de la regresión del precio: edad, edad² y una indicadora por zona (la primera es la base). */
function design(age: number, group: string, groups: readonly string[]): number[] {
  return [age, age * age, ...groups.slice(1).map((g) => (g === group ? 1 : 0))];
}

/** Precio que espera la regresión múltiple (edad, edad² y zona) para cada edad, por zona. */
export function priceCurves(
  rows: MarketRowLike[],
  groups: readonly string[],
  unit: string,
): { group: string; points: { x: number; y: number }[] }[] {
  if (rows.length < groups.length + 6) return [];
  const t = (v: number) => (unit === 'USD' ? Math.log10(v) : v);
  const back = (v: number) => (unit === 'USD' ? 10 ** v : v);
  const reg = ols(
    rows.map((r) => design(r.age, r.group, groups)),
    rows.map((r) => t(r.value)),
    ['Edad', 'Edad²', ...groups.slice(1)],
  );
  if (!reg) return [];
  const ages = rows.map((r) => r.age);
  const lo = Math.min(...ages);
  const hi = Math.max(...ages);
  return groups.map((group) => ({
    group,
    points: Array.from({ length: hi - lo + 1 }, (_, i) => {
      const x = lo + i;
      const z = [1, ...design(x, group, groups)].reduce((a, v, j) => a + v * (reg.beta[j] ?? 0), 0);
      return { x, y: back(z) };
    }),
  }));
}

/**
 * Estadística del mercado del Ojeador: cómo se reparte el precio por zona (cajas y ANOVA), si zona y
 * edad van juntas (χ²), qué explica el precio (regresión múltiple) y el plantel contra la liga.
 */
export function marketAnalyses(
  rows: MarketRowLike[],
  own: { value: number; age: number }[],
  groups: readonly string[],
  team: string,
  unit: string,
): Analysis[] {
  const byGroup = groups.map((g) => rows.filter((r) => r.group === g));
  if (byGroup.some((g) => g.length < 3)) return [];
  const money = unit === 'USD';
  const what = money ? 'valor de mercado' : 'minutos por partido';
  const fmt: Format = money ? 'usd' : 'min';
  const t = (v: number) => (money ? Math.log10(v) : v);
  const out: (Analysis | null)[] = [];
  const summaries = [
    ...groups.map((g, i) => ({ label: g, summary: describe((byGroup[i] ?? []).map((r) => r.value)) })),
    { label: 'Toda la liga', summary: describe(rows.map((r) => r.value)) },
    ...(own.length >= 3 ? [{ label: team, summary: describe(own.map((o) => o.value)) }] : []),
  ];
  out.push({
    id: 'mercado-cajas',
    kind: 'box',
    title: `${cap(what)} por zona`,
    intro: `Los ${String(rows.length)} jugadores de otros clubes que mira el Ojeador, estratificados por zona: cada estrato se describe por separado. ${money ? '' : 'Sin valores de mercado cargados, el precio es lo que paga el entrenador: los minutos.'}`,
    format: fmt,
    rows: summaries,
  });
  const a = anova(byGroup.map((g) => g.map((r) => t(r.value))));
  out.push({
    id: 'mercado-anova',
    kind: 'anova',
    title: `¿La zona cambia ${money ? 'el precio' : 'los minutos'}? (ANOVA de un factor)`,
    intro: `H₀: la media ${money ? 'del logaritmo del valor' : 'de minutos por partido'} es la misma en las ${String(groups.length)} zonas.${money ? ' Se usa el logaritmo porque el precio es muy asimétrico.' : ''}`,
    result: a,
    rows: groups.map((g, i) => ({ label: g, summary: describe((byGroup[i] ?? []).map((r) => r.value)) })),
    format: fmt,
    reading: `F = ${f2(a.f)} con (${String(a.dfb)}; ${String(a.dfw)}) gl. ${decide(a.p, `la zona sí cambia la media (η² = ${pc(a.eta2)}).`, 'no hay evidencia de que la zona cambie la media.')}`,
  });
  const table = groups.map((g) =>
    AGE_BANDS.map((_, j) => rows.filter((r) => r.group === g && bandOf(r.age) === j).length),
  );
  const c = chi2Independence(table);
  out.push({
    id: 'mercado-contingencia',
    kind: 'contingency',
    title: '¿Zona y edad van juntas? (tabla de contingencia)',
    intro:
      'H₀: la zona y la franja de edad son independientes. Cada celda muestra los jugadores observados y, abajo, los esperados si fueran independientes; más violeta, más se aparta de lo esperado.',
    rowLabels: [...groups],
    colLabels: AGE_BANDS.map((b) => b.label),
    table,
    ...c,
    df: c.df as number,
    reading: `χ² = ${f2(c.statistic)} con ${String(c.df)} gl. ${decide(c.p, 'la edad se reparte distinto según la zona.', 'la edad se reparte igual en todas las zonas.')} Con pocos jugadores por celda, tomarlo con cuidado.`,
  });
  const reg = ols(
    rows.map((r) => design(r.age, r.group, groups)),
    rows.map((r) => t(r.value)),
    ['Edad', 'Edad²', ...groups.slice(1).map((g) => `${g} (contra ${groups[0] ?? ''})`)],
  );
  if (reg) {
    const peak = (reg.beta[2] ?? 0) < 0 ? -(reg.beta[1] ?? 0) / (2 * (reg.beta[2] ?? 1)) : null;
    out.push(
      {
        id: 'mercado-regresion',
        kind: 'regression',
        title: `Qué explica ${money ? 'el precio' : 'los minutos'} (regresión lineal múltiple)`,
        intro: `Modelo: ${money ? 'log₁₀(valor)' : 'minutos'} = β₀ + β₁·edad + β₂·edad² + una indicadora por zona (${groups[0] ?? ''} es la base). La edad al cuadrado capta que sube hasta un pico y después baja.`,
        result: reg,
        reading: `R² = ${f2(reg.r2)}. ${peak !== null && peak > 15 && peak < 45 ? `Pico a los ${f2(peak)} años. ` : ''}${decide(reg.pF, 'el modelo en conjunto es significativo.', 'el modelo en conjunto no es significativo: la edad y la zona explican poco; el resto es lo que produce cada uno.')}`,
      },
      {
        id: 'mercado-curvas',
        kind: 'scatter',
        title: `${cap(what)} contra edad, con la regresión por zona`,
        intro:
          'Cada punto es un jugador de otro club con el color de su zona; cada curva, lo que espera el modelo para esa zona.',
        xTitle: 'Edad (años)',
        yTitle: cap(what),
        points: rows.map((r) => ({
          key: `${r.name}|${r.team}`,
          x: r.age,
          y: r.value,
          color: GROUP_COLOR[r.group],
        })),
        line: [],
        curves: priceCurves(rows, groups, unit).map((cv) => ({
          key: cv.group,
          label: cv.group,
          color: GROUP_COLOR[cv.group] ?? 'var(--series-2)',
          points: cv.points,
        })),
        note: groups.map((g) => g).join(' · '),
      },
    );
  }
  if (own.length >= 3) {
    const ownV = own.map((o) => t(o.value));
    const leagueV = rows.map((r) => t(r.value));
    const tt = welch(ownV, leagueV);
    const f = fVariances(ownV, leagueV);
    const young = 23;
    const z = twoProportions(
      own.filter((o) => o.age <= young).length,
      own.length,
      rows.filter((r) => r.age <= young).length,
      rows.length,
    );
    const shown = (v: number) => (money ? `US$ ${f2(10 ** v / 1e3)} mil` : `${f2(v)} min`);
    out.push({
      id: 'mercado-plantel',
      kind: 'tests',
      title: `${team} contra la liga (pruebas de hipótesis)`,
      intro: `Dos muestras independientes: el plantel de ${team} (n = ${String(own.length)}) y los jugadores de otros clubes (n = ${String(rows.length)}). H₀ en cada fila: son iguales.`,
      labels: [team, 'Liga'],
      rows: [
        {
          question: `${cap(what)} medio`,
          test: 't de Welch',
          a: shown(mean(ownV)),
          b: shown(mean(leagueV)),
          letter: 't',
          statistic: tt.statistic,
          df: f2(tt.df as number),
          p: tt.p,
        },
        {
          question: `Dispersión de ${what}`,
          test: 'F de varianzas',
          a: f2(describe(ownV).sd),
          b: f2(describe(leagueV).sd),
          letter: 'F',
          statistic: f.statistic,
          df: (f.df as number[]).join('; '),
          p: f.p,
        },
        {
          question: `Jugadores de ${String(young)} años o menos`,
          test: 'z de dos proporciones',
          a: pc(z.p1),
          b: pc(z.p2),
          letter: 'z',
          statistic: z.statistic,
          df: '–',
          p: z.p,
        },
      ],
    });
  }
  return out.filter((x): x is Analysis => x !== null);
}

/** Un partido como lo guarda la base (estadísticas que pueden faltar) en la forma de los análisis. */
export function asTeamMatch(g: {
  isHome: boolean;
  pointsFor: number;
  pointsAgainst: number;
  stats: Record<string, number | null>;
}): TeamMatchLike {
  return {
    home: g.isHome,
    pointsFor: g.pointsFor,
    pointsAgainst: g.pointsAgainst,
    competitionName: 'Liga Nacional',
    stats: Object.fromEntries(Object.entries(g.stats).filter((e): e is [string, number] => typeof e[1] === 'number')),
  };
}
