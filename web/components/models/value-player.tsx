'use client';

// Pantalla de un jugador en Valor: lo que el entrenador le da (minutos, o su valor si se cargó) contra lo
// que su producción justifica, de dónde sale ese número, dónde queda en la liga y en el plantel, y
// jugadores de la liga que producen parecido.

import Link from 'next/link';

import { ChartCard } from '@/components/charts/chart-card';
import { BarChart, ScatterChart } from '@/components/charts/primitives';
import type { CoefRow, ModelRun, ValueRow } from '@/lib/data/models';

import { dec1, dec2, inUnit, num, Section, Tiles } from './common';
import { SortableTable } from './sortable-table';

export const SOURCE = 'Liga Nacional de Básquet (box score de toda la liga), regresión lineal propia';

export interface CloudPoint {
  name: string;
  team: string;
  actual: number;
  predicted: number;
  own: boolean;
}

export const unitOf = (run: ModelRun) => (run.params.unit === 'USD' ? 'USD' : 'min');
export const labelOf = (run: ModelRun, id: string) => {
  const features = (Array.isArray(run.params.features) ? run.params.features : []) as { id: string; label: string }[];
  return id === 'edad' ? 'Edad' : (features.find((f) => f.id === id)?.label ?? id);
};

export function reading(r: ValueRow, gap: number, unit: string): string {
  if (r.residualPct === null) return 'Sin dato real';
  const more = unit === 'USD' ? 'Vale más de lo esperado' : 'Juega más de lo que produce';
  const less = unit === 'USD' ? 'Vale menos de lo esperado' : 'Produce para jugar más';
  return r.residualPct > gap ? more : r.residualPct < -gap ? less : 'En línea con lo esperado';
}

interface Props {
  run: ModelRun;
  row: ValueRow;
  rows: ValueRow[];
  coefs: CoefRow[];
}

export function ValuePlayer({ run, row, rows, coefs }: Props) {
  const unit = unitOf(run);
  const u = (v: number | null | undefined) => inUnit(v, unit);
  const gap = num(run.params.gap_pct) ?? 20;
  const log = run.params.scale === 'log';
  const cloud = (Array.isArray(run.metrics.cloud) ? run.metrics.cloud : []) as unknown as CloudPoint[];
  const hist = (Array.isArray(run.metrics.residual_hist) ? run.metrics.residual_hist : []) as unknown as {
    from: number;
    to: number;
    count: number;
    normal: number;
  }[];
  const coef = new Map(coefs.map((c) => [c.feature, c]));
  const effects = Object.entries(row.detail.effects)
    .map(([id, value]) => ({ id, label: labelOf(run, id), value, p: coef.get(id)?.p ?? null }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  // Paso a paso: del jugador promedio de la liga a lo esperado, sumando (o multiplicando) cada aporte.
  const steps: { label: string; value: number; change: number | null }[] = [];
  let running = row.detail.average ?? 0;
  steps.push({ label: 'Jugador promedio de la liga', value: running, change: null });
  for (const e of effects) {
    running = log ? running * (1 + e.value) : running + e.value;
    steps.push({ label: e.label, value: running, change: e.value });
  }
  const squad = [...rows].filter((r) => r.residualPct !== null).sort((a, b) => (a.residualPct ?? 0) - (b.residualPct ?? 0));
  const comparables = row.detail.comparables;
  const fmtEffect = (v: number) => (log ? `${v >= 0 ? '+' : '−'}${dec1(Math.abs(v) * 100)} %` : `${v >= 0 ? '+' : '−'}${dec1(Math.abs(v))} min`);
  const outOfSample = row.detail.oos;

  return (
    <div className="grid gap-10">
      <Section
        id="resumen"
        title={row.name}
        intro={`${row.position ?? 'Posición n/d'} · ${String(row.detail.age ?? 'n/d')} años · ${String(row.detail.games ?? 'n/d')} partidos, ${String(row.detail.starts ?? 'n/d')} de titular.`}
      >
        <Tiles
          items={[
            {
              label: typeof run.params.real === 'string' ? run.params.real : 'Real',
              value: u(row.actual),
              help:
                unit === 'USD'
                  ? 'Valor de mercado cargado a mano con su fuente (data/manual/market_values.csv).'
                  : 'Minutos por partido que le da el entrenador: el «precio» que el equipo paga por él en tiempo de juego.',
            },
            {
              label: typeof run.params.model === 'string' ? run.params.model : 'Esperado',
              value: u(row.predicted),
              hint: `Rango del 95 %: ${u(row.low)} a ${u(row.high)}`,
              help: 'Lo que la regresión, entrenada con toda la liga, espera para alguien que produce como él. El rango cubre al 95 % de los jugadores con esa producción.',
            },
            {
              label: 'Diferencia',
              value: row.residualPct === null ? 'n/d' : `${dec1(row.residualPct)} %`,
              hint: reading(row, gap, unit),
              help: `(real − esperado) / esperado. Más de ${String(gap)} % se marca como diferencia.`,
            },
            {
              label: 'Sin él en el ajuste',
              value: u(outOfSample),
              hint: 'Entrenado solo con los otros clubes',
              help: 'Lo que esperaría el modelo si no hubiera visto a ningún jugador de este equipo: la prueba honesta de que no se lo aprendió de memoria.',
            },
          ]}
        />
        <Link href="/valor" className="chip focus-ring w-fit">
          ← Todo el plantel
        </Link>
      </Section>

      <Section
        id="como-se-arma"
        title="Cómo se arma el número"
        intro="Se parte del jugador promedio de la liga y se suma lo que aporta cada característica suya frente a ese promedio (coeficiente × diferencia con la media). Así se llega a lo esperado."
      >
        <div className="chart-grid-layout">
          <ChartCard
            id="valor-aportes"
            number="J1"
            title="Qué le suma y qué le resta"
            source={SOURCE}
            updated={run.trainedAt}
            coverage="Cada barra: cuánto mueve lo esperado frente al jugador promedio de la liga"
            table={{ head: ['Característica', 'Aporte', 'p del coeficiente'], rows: effects.map((e) => [e.label, e.value, e.p]) }}
          >
            <BarChart
              labels={effects.map((e) => e.label)}
              horizontal
              format={fmtEffect}
              series={[{ id: 'efecto', label: 'Aporte', slot: 1, values: effects.map((e) => e.value) }]}
              label={`Aporte de cada característica a lo esperado de ${row.name}`}
            />
          </ChartCard>
          <ChartCard
            id="valor-pasos"
            number="J2"
            title="Del jugador promedio a lo esperado"
            source={SOURCE}
            updated={run.trainedAt}
            coverage="Cada barra: lo esperado acumulado después de sumar esa característica"
            table={{ head: ['Paso', 'Acumulado', 'Cambio'], rows: steps.map((s) => [s.label, s.value, s.change]) }}
          >
            <BarChart
              labels={steps.map((s) => s.label)}
              horizontal
              format={(v) => u(v)}
              highlight={steps.length - 1}
              series={[{ id: 'acum', label: 'Acumulado', slot: 2, values: steps.map((s) => s.value) }]}
              label={`Cómo se llega a lo esperado de ${row.name}`}
            />
          </ChartCard>
        </div>
        <SortableTable
          caption={`Cálculo paso a paso de lo esperado para ${row.name}`}
          rows={steps}
          rowKey={(s) => s.label}
          columns={[
            { id: 'step', label: 'Paso', value: (s) => s.label },
            {
              id: 'change',
              label: 'Aporte',
              numeric: true,
              help: 'Coeficiente × (valor del jugador − promedio de la liga).',
              value: (s) => s.change,
              render: (s) => (s.change === null ? '—' : fmtEffect(s.change)),
            },
            { id: 'value', label: 'Acumulado', numeric: true, value: (s) => s.value, render: (s) => u(s.value) },
          ]}
        />
      </Section>

      <Section id="contexto" title="En la liga y en el plantel">
        <div className="chart-grid-layout">
          <ChartCard
            id="valor-liga"
            number="J3"
            title="Real contra esperado en toda la liga"
            source={SOURCE}
            updated={run.trainedAt}
            coverage="Arriba de la diagonal juegan más de lo que su producción justifica; abajo, menos (los «baratos» de Moneyball)"
            table={{ head: ['Jugador', 'Club', 'Real', 'Esperado'], rows: cloud.map((c) => [c.name, c.team, c.actual, c.predicted]) }}
          >
            <ScatterChart
              points={[
                ...cloud
                  .filter((c) => !c.own)
                  .map((c) => ({ x: c.predicted, y: c.actual, label: `${c.name} (${c.team})`, slot: 4 as const, size: 0.3 })),
                ...rows.map((r) => ({
                  x: r.predicted ?? 0,
                  y: r.actual ?? 0,
                  label: `${r.name}: real ${u(r.actual)}, esperado ${u(r.predicted)}`,
                  slot: r.playerId === row.playerId ? (1 as const) : (2 as const),
                  size: r.playerId === row.playerId ? 1 : 0.6,
                })),
              ]}
              groups={[
                { label: row.name, slot: 1 },
                { label: 'Plantel', slot: 2 },
                { label: 'Resto de la liga', slot: 4 },
              ]}
              xLabel="Esperado"
              yLabel="Real"
              diagonal
              label="Real contra esperado de cada jugador de la liga"
            />
          </ChartCard>
          <ChartCard
            id="valor-comparables"
            number="J4"
            title="Jugadores de la liga que producen parecido"
            source={SOURCE}
            updated={run.trainedAt}
            coverage="Producción cada 36 más cercana (sin contar la edad): cuánto juegan ellos y cuánto esperaría el modelo"
            table={{
              head: ['Jugador', 'Club', 'Real', 'Esperado'],
              rows: comparables.map((c) => [c.name, c.team, c.value, c.predicted]),
            }}
          >
            <BarChart
              labels={[row.name, ...comparables.map((c) => `${c.name} (${c.team})`)]}
              horizontal
              format={(v) => u(v)}
              highlight={0}
              series={[
                { id: 'real', label: 'Real', slot: 1, values: [row.actual, ...comparables.map((c) => c.value)] },
                { id: 'esp', label: 'Esperado', slot: 2, values: [row.predicted, ...comparables.map((c) => c.predicted)] },
              ]}
              label={`${row.name} y los jugadores de la liga que producen parecido`}
            />
          </ChartCard>
          <ChartCard
            id="valor-plantel"
            number="J5"
            title="Dónde queda en el plantel"
            source={SOURCE}
            updated={run.trainedAt}
            coverage="Diferencia entre real y esperado de cada jugador del plantel"
            table={{ head: ['Jugador', 'Diferencia %'], rows: squad.map((r) => [r.name, r.residualPct]) }}
          >
            <BarChart
              labels={squad.map((r) => r.name)}
              horizontal
              format={(v) => `${dec1(v)} %`}
              highlight={squad.findIndex((r) => r.playerId === row.playerId)}
              series={[{ id: 'dif', label: 'Real contra esperado', slot: 1, values: squad.map((r) => r.residualPct) }]}
              label="Diferencia porcentual entre real y esperado de cada jugador del plantel"
            />
          </ChartCard>
          <ChartCard
            id="valor-error"
            number="J6"
            title="¿Cuánto se equivoca el modelo? Errores de toda la liga"
            source={SOURCE}
            updated={run.trainedAt}
            coverage={`Barras: cuántos jugadores tienen cada error (real − esperado). Línea: lo que daría una normal; si se parecen, los intervalos son confiables. Desvío del error: ${u(num(run.metrics.residual_sd))}`}
            table={{ head: ['Desde', 'Hasta', 'Jugadores', 'Normal'], rows: hist.map((h) => [h.from, h.to, h.count, h.normal]) }}
          >
            <BarChart
              labels={hist.map((h) => `${dec1(h.from)} a ${dec1(h.to)}`)}
              format={(v) => dec2(v)}
              series={[
                { id: 'obs', label: 'Jugadores', slot: 1, values: hist.map((h) => h.count) },
                { id: 'norm', label: 'Normal esperada', slot: 3, values: hist.map((h) => h.normal) },
              ]}
              label="Distribución de los errores del modelo en la liga contra una normal"
            />
          </ChartCard>
        </div>
        <h3 className="text-base font-bold">Jugadores de la liga que producen parecido</h3>
        <SortableTable
          caption={`Comparables de ${row.name} en la liga`}
          rows={comparables}
          rowKey={(c) => `${c.name}-${c.team}`}
          columns={[
            { id: 'name', label: 'Jugador', value: (c) => c.name },
            { id: 'team', label: 'Club', value: (c) => c.team },
            { id: 'age', label: 'Edad', numeric: true, value: (c) => c.age },
            { id: 'real', label: 'Real', numeric: true, help: 'Lo que juega en su club.', value: (c) => c.value, render: (c) => u(c.value) },
            {
              id: 'pred',
              label: 'Esperado',
              numeric: true,
              help: 'Lo que su producción justifica según el modelo.',
              value: (c) => c.predicted,
              render: (c) => u(c.predicted),
            },
          ]}
        />
      </Section>
    </div>
  );
}
