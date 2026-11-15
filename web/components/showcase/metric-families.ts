// Las 24 métricas propias (docs/metricas_propias.md y data/stat_catalog.csv) agrupadas por familia. Una sola lista para el
// diagrama del pipeline y para la sección de métricas, así el total siempre coincide.

export interface Metric {
  /** Abreviatura de dos a cuatro letras. */
  symbol: string;
  name: string;
}

export interface MetricFamily {
  slug: string;
  name: string;
  scope: 'Equipo' | 'Jugador';
  metrics: readonly Metric[];
}

export const FAMILIES: readonly MetricFamily[] = [
  {
    slug: 'fuerza',
    name: 'Fuerza',
    scope: 'Equipo',
    metrics: [
      { symbol: 'Elo', name: 'Elo propio' },
      { symbol: 'Pp', name: 'Probabilidad previa' },
      { symbol: 'So', name: 'Sorpresa' },
      { symbol: 'Br', name: 'Brier' },
    ],
  },
  {
    slug: 'ritmo',
    name: 'Ritmo y eficiencia',
    scope: 'Equipo',
    metrics: [
      { symbol: 'Pos', name: 'Posesiones' },
      { symbol: 'Rit', name: 'Ritmo' },
      { symbol: 'ORtg', name: 'Rating ofensivo' },
      { symbol: 'DRtg', name: 'Rating defensivo' },
    ],
  },
  {
    slug: 'esperado',
    name: 'Rendimiento esperado',
    scope: 'Equipo',
    metrics: [
      { symbol: 'NR', name: 'Net Rating' },
      { symbol: 'Pit', name: 'Pitagórico' },
      { symbol: 'NR⅓', name: 'NR por tercio' },
    ],
  },
  {
    slug: 'forma',
    name: 'Estado de forma',
    scope: 'Equipo',
    metrics: [
      { symbol: 'Ra', name: 'Rachas' },
      { symbol: 'Fo', name: 'Forma' },
      { symbol: 'Co', name: 'Consistencia' },
    ],
  },
  {
    slug: 'jugador',
    name: 'Jugador en cancha',
    scope: 'Jugador',
    metrics: [
      { symbol: 'NRc', name: 'NR en cancha' },
      { symbol: 'NRf', name: 'NR fuera de cancha' },
      { symbol: 'On', name: 'On/Off' },
      { symbol: 'EWA', name: 'Victorias que suma' },
      { symbol: 'ELA', name: 'Derrotas que suma' },
    ],
  },
  {
    slug: 'proyeccion',
    name: 'Mejoría y Potencial',
    scope: 'Jugador',
    metrics: [
      { symbol: 'IR', name: 'Índice de rendimiento' },
      { symbol: 'Mα', name: 'Mejoría α' },
      { symbol: 'Mβ', name: 'Mejoría β' },
      { symbol: 'Pα', name: 'Potencial α' },
      { symbol: 'Pβ', name: 'Potencial β' },
    ],
  },
];

export const METRIC_TOTAL = FAMILIES.reduce((sum, family) => sum + family.metrics.length, 0);
