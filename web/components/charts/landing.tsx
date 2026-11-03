'use client';

// Interfaz 1 (9.2): la landing con todos los gráficos a la vista, por categoría, igual que
// Pelotheta fútbol. Barra de categorías fija que resalta la sección actual, filtros globales de
// competición y localía, 3 o 4 números destacados por sección y una grilla de 1 a 3 columnas.

import { useEffect, useMemo, useState } from 'react';

import { AnimatedNumber } from '@/components/animated-number';
import type { ChartDef } from '@/lib/data/charts';
import type { LandingData } from '@/lib/data/landing';
import { formatDateTime } from '@/lib/format';
import { aggregateTeam, type TeamMatchRow } from '@/lib/stats/catalog';

import { ChartCard } from './chart-card';
import { CHARTS, type ChartContext } from './definitions';

const CATEGORIES: Record<string, string> = {
  A: 'Forma y resultados',
  B: 'Puntos y ritmo',
  C: 'Cuartos',
  D: 'Eficiencia y cuatro factores',
  E: 'Tiros',
  F: 'Rebotes, pérdidas y asistencias',
  G: 'Jugadores',
  H: 'Plantel y carga',
  I: 'Competición',
  J: 'Disciplina',
  K: 'Métricas propias',
  L: 'Situaciones',
  M: 'Modelos, contexto y calendario',
};

// Fuente de cada categoría (lo que se muestra al pie de la tarjeta).
const CATEGORY_SOURCE: Record<string, string> = {
  A: 'Liga Nacional de Básquet',
  B: 'Liga Nacional de Básquet; cálculo propio',
  C: 'Liga Nacional de Básquet (parciales)',
  D: 'Liga Nacional de Básquet (box score de toda la liga); cálculo propio',
  E: 'Liga Nacional de Básquet (box score y zonas de tiro)',
  F: 'Liga Nacional de Básquet (box score)',
  G: 'Liga Nacional de Básquet; Wikipedia (posiciones)',
  H: 'Liga Nacional de Básquet (fichas y box score)',
  I: 'Liga Nacional de Básquet; cálculo propio',
  J: 'Liga Nacional de Básquet (box score)',
  K: 'Cálculo propio sobre el play-by-play de la LNB',
  L: 'Liga Nacional de Básquet (parciales)',
  M: 'Cálculo propio sobre la LNB',
};

type Venue = 'todos' | 'local' | 'visitante';
// Referencia de percentiles y rankings: jugadores con al menos 40 minutos (pipeline/own_metrics.py).
const MIN_MINUTES = 40;

const INT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const DEC1 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DEC2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = (v: number) => INT.format(v);
const dec1 = (v: number) => DEC1.format(v);
const dec2 = (v: number) => DEC2.format(v);
const pct = (v: number) => `${DEC1.format(v)} %`;
const signed = (v: number) => `${v > 0 ? '+' : ''}${DEC1.format(v)}`;

interface Tile {
  label: string;
  value: number | null;
  format: (v: number) => string;
  hint?: string;
}

const val = (m: TeamMatchRow, k: string) => m.stats[k] ?? null;
const mean = (ms: TeamMatchRow[], k: string) => {
  const v = ms.map((m) => val(m, k)).filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const share = (ms: TeamMatchRow[], test: (m: TeamMatchRow) => boolean) =>
  ms.length ? (ms.filter(test).length / ms.length) * 100 : null;
const won = (m: TeamMatchRow) => m.pointsFor > m.pointsAgainst;
const x100 = (v: number | null) => (v === null ? null : v * 100);

/** Números destacados de cada sección (9.2): 3 o 4, siempre con el filtro aplicado. */
function tiles(category: string, ctx: ChartContext): Tile[] {
  const { matches: ms, data, regulars } = ctx;
  const n = ms.length;
  const pooled = (id: string, perMatch = false) => {
    const stat = data.catalog.find((c) => c.id === id);
    return stat ? aggregateTeam(ms, stat, { perMatch }) : null;
  };
  const best = (id: string) => {
    const top = data.players
      .map((p) => ({ p, v: p.stats[id] ?? null }))
      .filter((x): x is { p: (typeof data.players)[number]; v: number } => x.v !== null)
      .sort((a, b) => b.v - a.v)[0];
    return top ? { value: top.v, hint: top.p.name } : { value: null };
  };
  const boca = data.league.find((t) => t.highlight);
  switch (category) {
    case 'A':
      return [
        { label: 'Partidos', value: n, format: int },
        { label: 'Victorias', value: ms.filter(won).length, format: int },
        { label: 'Porcentaje de victorias', value: share(ms, won), format: pct },
        {
          label: 'Diferencia de puntos',
          value: ms.reduce((a, m) => a + m.pointsFor - m.pointsAgainst, 0),
          format: int,
        },
      ];
    case 'B':
      return [
        { label: 'Puntos por partido', value: n ? ms.reduce((a, m) => a + m.pointsFor, 0) / n : null, format: dec1 },
        { label: 'Puntos recibidos', value: n ? ms.reduce((a, m) => a + m.pointsAgainst, 0) / n : null, format: dec1 },
        { label: 'ORtg', value: pooled('ortg'), format: dec1, hint: 'puntos cada 100 posesiones' },
        { label: 'Ritmo', value: mean(ms, 'pace'), format: dec1, hint: 'posesiones cada 40 minutos' },
      ];
    case 'C':
      return [
        { label: 'Diferencia en el 1.er cuarto', value: mean(ms, 'q1_diff'), format: signed },
        { label: 'Diferencia al descanso', value: mean(ms, 'h1_diff'), format: signed },
        { label: 'Diferencia en el 4.º cuarto', value: mean(ms, 'q4_diff'), format: signed },
      ];
    case 'D':
      return [
        { label: 'eFG%', value: x100(pooled('efg')), format: pct },
        { label: 'TOV%', value: pooled('tov_pct'), format: pct },
        { label: 'ORB%', value: x100(pooled('orb_pct_team')), format: pct },
        { label: 'TL por tiro de campo', value: pooled('ft_per_fga'), format: dec2 },
      ];
    case 'E':
      return [
        { label: 'Triples por partido', value: mean(ms, 'team_fg3m'), format: dec1 },
        { label: '% de triples', value: x100(pooled('team_fg3_pct')), format: pct },
        { label: 'Tiros cerca del aro', value: x100(mean(ms, 'team_aro_fga_share')), format: pct },
        { label: '% de libres', value: x100(pooled('team_ft_pct')), format: pct },
      ];
    case 'F':
      return [
        { label: 'Rebotes por partido', value: mean(ms, 'team_trb'), format: dec1 },
        { label: 'Asistencias por partido', value: mean(ms, 'team_ast'), format: dec1 },
        { label: 'Pérdidas por partido', value: mean(ms, 'team_tov'), format: dec1 },
        { label: 'Posesiones extra', value: mean(ms, 'extra_possessions'), format: signed, hint: 'por partido' },
      ];
    case 'G': {
      const scorer = best('ppg');
      const passer = best('apg');
      const per = best('per');
      return [
        { label: 'Jugadores usados', value: data.players.filter((p) => p.minutes > 0).length, format: int },
        { label: 'Goleador', value: scorer.value, format: dec1, hint: scorer.hint },
        { label: 'Más asistencias', value: passer.value, format: dec1, hint: passer.hint },
        { label: 'Mejor PER', value: per.value, format: dec1, hint: per.hint },
      ];
    }
    case 'H':
      return [
        { label: `Con ${String(MIN_MINUTES)} minutos o más`, value: regulars.length, format: int },
        { label: 'Más minutos', value: regulars[0]?.minutes ?? null, format: int, hint: regulars[0]?.name },
        { label: 'Días de descanso medios', value: mean(ms, 'rest_days'), format: dec1 },
      ];
    case 'I':
      return [
        { label: 'Elo actual', value: boca?.values.elo ?? null, format: int },
        { label: 'Puesto en la tabla', value: boca?.values.position ?? null, format: int },
        { label: 'SRS', value: boca?.values.srs ?? null, format: signed, hint: 'puntos sobre el promedio' },
      ];
    case 'J':
      return [
        { label: 'Faltas por partido', value: mean(ms, 'team_pf'), format: dec1 },
        { label: 'Libres a favor por partido', value: mean(ms, 'team_fta'), format: dec1 },
        { label: 'Libres en contra por partido', value: mean(ms, 'rival_fta'), format: dec1 },
      ];
    case 'K': {
      const ewa = best('ewa');
      const onOff = best('on_off');
      return [
        { label: 'Net Rating', value: pooled('net_rating'), format: signed },
        { label: 'Mayor EWA', value: ewa.value, format: dec1, hint: ewa.hint },
        { label: 'Mayor On/Off', value: onOff.value, format: signed, hint: onOff.hint },
      ];
    }
    case 'L':
      return [
        {
          label: 'Ganando al descanso',
          value: share(ms, (m) => (val(m, 'h1_diff') ?? 0) > 0),
          format: pct,
        },
        { label: 'Remontadas', value: ms.filter((m) => won(m) && (val(m, 'h1_diff') ?? 0) < 0).length, format: int },
        {
          label: 'Partidos ajustados',
          value: ms.filter((m) => Math.abs(m.pointsFor - m.pointsAgainst) <= 5).length,
          format: int,
          hint: '5 puntos o menos',
        },
      ];
    case 'M':
      return [
        { label: 'Probabilidad media de ganar', value: x100(mean(ms, 'elo_win_prob')), format: pct },
        { label: 'Brier medio del Elo', value: mean(ms, 'brier'), format: dec2, hint: '0 es perfecto' },
        { label: 'Sorpresa media', value: mean(ms, 'surprise'), format: dec2, hint: 'resultado menos lo previsto' },
      ];
    default:
      return [];
  }
}

export function Landing({ data, charts }: { data: LandingData; charts: ChartDef[] }) {
  const [competition, setCompetition] = useState('todas');
  const [venue, setVenue] = useState<Venue>('todos');
  const [active, setActive] = useState('A');

  const competitions = useMemo(
    () => [...new Map(data.matches.map((m) => [m.competitionCode, m.competitionName])).entries()],
    [data.matches],
  );
  const ctx = useMemo<ChartContext>(() => {
    const matches = data.matches.filter(
      (m) =>
        (competition === 'todas' || m.competitionCode === competition) &&
        (venue === 'todos' || (venue === 'local') === m.home),
    );
    const regulars = data.players.filter((p) => p.minutes >= MIN_MINUTES).sort((a, b) => b.minutes - a.minutes);
    return { data, matches, regulars };
  }, [data, competition, venue]);

  const sections = useMemo(
    () =>
      Object.keys(CATEGORIES)
        .map((c) => ({ id: c, name: CATEGORIES[c] ?? c, charts: charts.filter((x) => x.category === c) }))
        .filter((s) => s.charts.length),
    [charts],
  );

  // Resalta en la barra la sección que ocupa la parte de arriba de la pantalla.
  useEffect(() => {
    const elements = sections.flatMap((s) => document.getElementById(`categoria-${s.id.toLowerCase()}`) ?? []);
    // El observador solo avisa que algo cambió; la activa es la última sección cuyo comienzo ya
    // pasó por debajo de la barra (con los avisos parciales se elegía la anterior).
    const observer = new IntersectionObserver(
      () => {
        const line = window.innerHeight * 0.4;
        const current = elements.filter((el) => el.getBoundingClientRect().top <= line).at(-1) ?? elements[0];
        if (current) setActive(current.id.replace('categoria-', '').toUpperCase());
      },
      { rootMargin: '-140px 0px -55% 0px', threshold: [0, 1] },
    );
    for (const el of elements) observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [sections]);

  // La categoría activa queda a la vista dentro de la barra (en pantallas chicas se desplaza).
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('.category-bar');
    const chip = bar?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!bar || !chip) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    bar.scrollTo({
      left: chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2,
      behavior: still ? 'auto' : 'smooth',
    });
  }, [active]);

  const updated = data.updated ? formatDateTime(data.updated) : null;
  const working = charts.filter((c) => c.available).length;

  return (
    <div className="grid gap-6 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">
            <span className="title-trace">Gráficos</span>
          </h1>
          <p className="mt-2 text-muted">
            Boca Juniors · Liga Nacional 2026-27 · {charts.length} gráficos en {sections.length} categorías · {working}{' '}
            con datos
          </p>
        </div>
        <div
          className="flex min-w-0 max-w-full flex-wrap items-center gap-2"
          role="group"
          aria-label="Filtros globales"
        >
          <label className="flex min-w-0 max-w-full items-center gap-2 text-sm font-semibold text-muted">
            Competición
            <select
              className="select focus-ring min-w-0 flex-1"
              value={competition}
              onChange={(e) => {
                setCompetition(e.target.value);
              }}
            >
              <option value="todas">Todas</option>
              {competitions.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {(['todos', 'local', 'visitante'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className="chip focus-ring"
              aria-pressed={venue === v}
              onClick={() => {
                setVenue(v);
              }}
            >
              {v === 'todos' ? 'Local y visitante' : v === 'local' ? 'Local' : 'Visitante'}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted">
        Los filtros cambian los gráficos del equipo. Los de jugadores y los de la liga usan toda la temporada (
        {ctx.matches.length} partidos en el filtro).
      </p>

      <nav className="category-bar" aria-label="Categorías de gráficos">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#categoria-${s.id.toLowerCase()}`}
            className="chip focus-ring shrink-0"
            aria-current={active === s.id ? 'true' : undefined}
          >
            {s.name}
          </a>
        ))}
      </nav>

      {sections.map((s) => (
        <section
          key={s.id}
          id={`categoria-${s.id.toLowerCase()}`}
          className="landing-section grid gap-4"
          aria-labelledby={`titulo-${s.id}`}
        >
          <h2 id={`titulo-${s.id}`} className="text-xl font-bold">
            {s.name}
          </h2>
          <ul className="tile-row">
            {tiles(s.id, ctx).map((t) => (
              <li key={t.label} className="tile">
                <span className="tile-label">{t.label}</span>
                {t.value === null || !Number.isFinite(t.value) ? (
                  <span className="tile-value">n/d</span>
                ) : (
                  <AnimatedNumber value={t.value} format={t.format} className="tile-value tabular" />
                )}
                {t.hint ? <span className="tile-hint">{t.hint}</span> : null}
              </li>
            ))}
          </ul>
          <div className="chart-grid-layout">
            {s.charts.map((c) => {
              const render = CHARTS[c.id];
              const out =
                c.available && render ? render(ctx) : { empty: c.reason || 'Este gráfico todavía no tiene datos.' };
              const common = {
                id: c.id,
                number: c.id.slice(1),
                title: c.title,
                source: CATEGORY_SOURCE[c.category] ?? 'Liga Nacional de Básquet',
                updated,
                origin: c.origin?.href,
                originLabel: c.origin?.label,
                detailHref: c.detail?.href,
              };
              return 'empty' in out ? (
                <ChartCard key={c.id} {...common} empty={out.empty} />
              ) : (
                <ChartCard key={c.id} {...common} table={out.table} coverage={out.coverage}>
                  {out.node}
                </ChartCard>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
