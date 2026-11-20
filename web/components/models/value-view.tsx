'use client';

import type { CoefRow, ModelRun, ValueRow } from '@/lib/data/models';

import { dec1, dec2, inUnit, num, pct, pValue, Section, Tiles, WaitingData } from './common';
import { type Column, SortableTable } from './sortable-table';
import { labelOf, reading, unitOf } from './value-player';

interface Props {
  run: ModelRun | null;
  rows: ValueRow[];
  coefs: CoefRow[];
}

export function ValueView({ run, rows, coefs }: Props) {
  if (!run || run.status !== 'ok' || rows.length === 0) {
    return (
      <WaitingData
        title="El modelo espera más partidos"
        message={run?.message ?? 'Todavía no corrió el pipeline con el paso de modelos.'}
      />
    );
  }
  const m = run.metrics;
  const unit = unitOf(run);
  const u = (v: number | null | undefined) => inUnit(v, unit);
  const gap = num(run.params.gap_pct) ?? 20;
  const players = [...rows].sort((a, b) => (b.actual ?? 0) - (a.actual ?? 0));
  const minutes = unit === 'min';

  const columns: Column<ValueRow>[] = [
    { id: 'name', label: 'Jugador', help: 'Tocá un jugador para ver su análisis completo.', value: (r) => r.name },
    { id: 'pos', label: 'Posición', value: (r) => r.position },
    { id: 'age', label: 'Edad', numeric: true, value: (r) => r.detail.age },
    { id: 'games', label: 'PJ', numeric: true, help: 'Partidos jugados.', value: (r) => r.detail.games },
    {
      id: 'actual',
      label: minutes ? 'Min/PJ real' : 'Valor real',
      numeric: true,
      help: minutes ? 'Minutos por partido que le da el entrenador.' : 'Valor de mercado cargado a mano.',
      value: (r) => r.actual,
      render: (r) => u(r.actual),
    },
    {
      id: 'pred',
      label: 'Esperado',
      numeric: true,
      help: 'Lo que su producción cada 36 y su edad justifican, según la regresión entrenada con toda la liga.',
      value: (r) => r.predicted,
      render: (r) => u(r.predicted),
    },
    {
      id: 'gap',
      label: 'Diferencia',
      numeric: true,
      help: '(real − esperado) / esperado. Negativo: produce para jugar más de lo que juega.',
      value: (r) => r.residualPct,
      render: (r) => (r.residualPct === null ? 'n/d' : `${dec1(r.residualPct)} %`),
    },
    { id: 'read', label: 'Lectura', value: (r) => reading(r, gap, unit) },
  ];

  return (
    <div className="grid gap-10">
      <Section
        id="como-se-lee"
        title="Cómo funciona"
        intro={
          minutes
            ? `La Liga Nacional no publica sueldos ni valores de pase y no hay un Transfermarkt abierto de básquet, así que el «precio» que se puede medir es el que paga el entrenador: los minutos. Una regresión lineal entrenada con ${String(run.n)} jugadores de toda la liga aprende cuántos minutos suele recibir alguien según lo que produce cada 36 (puntos, rebotes, asistencias, robos, tapones, pérdidas, faltas, tiro verdadero) y su edad. La diferencia dice quién juega más o menos de lo que su juego justifica. Si se cargan valores de mercado en data/manual/market_values.csv, el mismo modelo pasa a predecir el valor.`
            : `Una regresión lineal sobre ln(valor) entrenada con ${String(run.n)} jugadores de la liga con valor cargado, a partir de su producción cada 36 y su edad.`
        }
      >
        <Tiles
          items={[
            {
              label: 'Error típico',
              value: minutes ? u(num(m.mae_oos)) : `${dec1(num(m.median_ape_oos))} %`,
              hint: 'Sin ver a ningún jugador del plantel',
              help: 'Se entrena sin los jugadores del club y se los predice: el error medio absoluto en esa prueba honesta.',
            },
            {
              label: 'Error en la liga',
              value: minutes ? u(num(m.mae_cv)) : `${dec1(num(m.median_ape_cv))} %`,
              hint: 'Validación cruzada en 5 partes',
              help: 'Se parte la liga en 5, se entrena con 4 y se predice la quinta, cinco veces: el error medio absoluto sobre todos.',
            },
            {
              label: 'Explica',
              value: pct(num(m.r2)),
              hint: `de las diferencias (R²) · ${String(run.n)} jugadores`,
              help: 'Qué parte de las diferencias entre jugadores de la liga explican las variables. El resto: lesiones, faltas en el partido, decisiones del cuerpo técnico, rotación.',
            },
            {
              label: 'Jugadores del plantel',
              value: String(rows.length),
              hint: `con ${String(num(run.params.min_games) ?? 3)} partidos o más`,
            },
          ]}
        />
      </Section>

      <Section
        id="plantel"
        title="El plantel"
        intro="Tocá un jugador para ver de dónde sale su número, dónde queda en la liga y quién produce parecido. Los encabezados ordenan: un clic explica la columna, el segundo ordena de menor a mayor y el tercero de mayor a menor."
      >
        <SortableTable
          caption="Real, esperado y diferencia de cada jugador"
          rows={players}
          rowKey={(r) => String(r.playerId)}
          rowHref={(r) => `/valor/${String(r.playerId)}`}
          columns={columns}
        />
      </Section>

      <Section
        id="coeficientes"
        title="Qué pesa en la liga"
        intro="Cada fila es una característica. «Significativa» quiere decir que el efecto es demasiado grande para ser casualidad (p < 0,05)."
      >
        <SortableTable
          caption="Coeficientes de la regresión"
          rows={coefs.filter((c) => c.feature !== 'intercepto')}
          rowKey={(c) => c.feature}
          columns={[
            { id: 'var', label: 'Característica', value: (c) => labelOf(run, c.feature) },
            {
              id: 'beta',
              label: minutes ? 'Minutos por unidad' : 'β (en ln)',
              numeric: true,
              help: minutes
                ? 'Cuántos minutos por partido más recibe un jugador con una unidad más de esa característica, con todo lo demás igual.'
                : 'Cambio en ln(valor) por unidad: e^β − 1 es el cambio porcentual.',
              value: (c) => c.coef,
              render: (c) => dec2(c.coef),
            },
            {
              id: 'sig',
              label: '¿Significativa?',
              help: 'Sí si p < 0,05: el efecto difícilmente sea casualidad.',
              value: (c) => c.p,
              render: (c) => (c.p < 0.05 ? `Sí (p ${pValue(c.p)})` : `No (p ${pValue(c.p)})`),
            },
            {
              id: 'ci',
              label: 'IC 95 %',
              numeric: true,
              help: 'Rango donde está el coeficiente verdadero con 95 % de confianza. Si no toca el 0, el efecto es real.',
              value: (c) => c.low,
              render: (c) => `[${dec2(c.low)}; ${dec2(c.high)}]`,
            },
          ]}
        />
      </Section>
    </div>
  );
}
