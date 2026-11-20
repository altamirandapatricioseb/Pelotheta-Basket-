'use client';

import { useMemo, useState } from 'react';

import { ChartCard } from '@/components/charts/chart-card';
import { BarChart, ScatterChart } from '@/components/charts/primitives';
import { COUNTRIES } from '@/config/teams';
import type { ModelRun, Prediction, StatTest, Strength } from '@/lib/data/models';
import {
  average,
  contributions,
  marginBins,
  type Model,
  normCdf,
  points,
  PROFILE_KEYS,
  type Profile,
  simulate,
  type Venue,
} from '@/lib/models/predictor';

import { dec1, dec2, dec3, num, pct, pValue, Section, Tiles, WaitingData } from './common';
import { ProbabilityPanel } from './probability-panel';
import { SortableTable } from './sortable-table';

interface Props {
  team: string;
  run: ModelRun | null;
  predictions: Prediction[];
  strengths: Strength[];
  tests: StatTest[];
}

const SOURCE = 'Liga Nacional de Básquet (resultados y box score de toda la liga), API-Basketball si hay clave; cálculo propio';
const ALL = '';

interface Club extends Profile {
  country: string;
  league: string;
  games: number;
}

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .trim();

/** Perfil neutro: un club promedio de la Liga Nacional (sin datos propios, se marca como estimado). */
function neutral(model: Record<string, number>): Profile['values'] {
  return Object.fromEntries(PROFILE_KEYS.map((k) => [k, model[k] ?? (k === 'elo' ? 1500 : k === 'form' ? 0.5 : 0)])) as Profile['values'];
}

export function PredictorView({ team, run, predictions, strengths, tests }: Props) {
  const ownName = typeof run?.params.team_name === 'string' ? run.params.team_name : team;
  const clubs = useMemo<Club[]>(() => {
    const base = neutral((run?.metrics.neutral_profile ?? {}) as Record<string, number>);
    const fromDb: Club[] = strengths.map((s) => ({
      name: s.team,
      values: { ...base, ...s.profile },
      estimated: s.estimated,
      count: 1,
      country: s.country ?? 'Sin país',
      league: s.league ?? 'Sin liga',
      games: s.games,
    }));
    const known = new Set(fromDb.map((c) => `${plain(c.country)}|${plain(c.name)}`));
    // El resto de los clubes del selector de equipos (config/teams.ts): sin resultados abiertos, club promedio.
    const fromConfig: Club[] = COUNTRIES.flatMap((country) =>
      country.categories
        .filter((cat) => !(country.slug === 'argentina' && cat.slug === 'liga-nacional'))
        .flatMap((cat) =>
          cat.teams
            .filter((t) => !known.has(`${plain(country.name)}|${plain(t.name)}`))
            .map((t) => ({ name: t.name, values: base, estimated: true, count: 1, country: country.name, league: cat.name, games: 0 })),
        ),
    );
    return [...fromDb, ...fromConfig].filter((c) => plain(c.name) !== plain(ownName));
  }, [strengths, run, ownName]);
  const [country, setCountry] = useState(ALL);
  const [league, setLeague] = useState(ALL);
  const [rivalName, setRivalName] = useState(ALL);
  const [venue, setVenue] = useState<Venue>('local');

  const modelRaw = (run?.metrics.model ?? null) as unknown as Model | null;
  const own = strengths.find((s) => plain(s.team) === plain(ownName));
  if (!run || run.status !== 'ok' || !modelRaw || !own) {
    return (
      <WaitingData
        title="El predictor espera más partidos"
        message={run?.message ?? 'Todavía no corrió el pipeline con el paso de modelos.'}
      />
    );
  }
  const model = modelRaw;
  const ownProfile: Profile = { name: ownName, values: { ...neutral({}), ...own.profile }, estimated: false, count: 1 };
  const countries = [...new Set(clubs.map((c) => c.country))].sort((a, b) => a.localeCompare(b, 'es'));
  const leagues = [...new Set(clubs.filter((c) => !country || c.country === country).map((c) => c.league))];
  const pool = clubs.filter((c) => (!country || c.country === country) && (!league || c.league === league));
  const picked = pool.find((c) => c.name === rivalName);
  const scope = league ? league : country ? country : 'toda la zona';
  const rival: Profile = picked ?? average(`Media de ${scope} (${String(pool.length)} clubes)`, pool);
  const p = points(model, ownProfile, rival, venue);
  const margin = p.own - p.rival;
  const win = normCdf(margin, model.sd_margin);
  const sim = simulate(margin, model.sd_margin);
  const bins = marginBins(margin, model.sd_margin);
  const cOwn = contributions(model, p.ownRow);
  const cRival = contributions(model, p.rivalRow);
  const labels = Object.fromEntries(
    ((Array.isArray(run.params.variables) ? run.params.variables : []) as { id: string; label: string; help: string }[]).map((v) => [v.id, v]),
  );
  const decide = model.names
    .map((n) => ({ id: n, label: labels[n]?.label ?? n, help: labels[n]?.help ?? '', value: (cOwn[n] ?? 0) - (cRival[n] ?? 0) }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const backtest = predictions.filter((x) => x.kind === 'backtest');
  const ownIsHome = (x: Prediction) => plain(x.home) === plain(ownName);
  const calibration = (Array.isArray(run.metrics.calibration) ? run.metrics.calibration : []) as unknown as {
    bin: number;
    predicted: number;
    observed: number | null;
  }[];
  const variables = (Array.isArray(run.metrics.variables) ? run.metrics.variables : []) as unknown as {
    label: string;
    names: string[];
    brier: number | null;
    log_loss: number | null;
    mae_margin: number | null;
    accuracy: number | null;
  }[];
  const coefs = (Array.isArray(run.metrics.coefs) ? run.metrics.coefs : []) as unknown as {
    id: string;
    label: string;
    coef: number;
    std_err: number;
    p_value: number;
    low: number;
    high: number;
  }[];
  const leagueClubs = strengths.filter((s) => s.competition === 'liga');
  const fmtM = (v: number) => `${v >= 0 ? '+' : '−'}${dec1(Math.abs(v))}`;

  return (
    <div className="grid gap-10">
      <Section
        id="cruce"
        title="Elegí el partido"
        intro="Por defecto, contra la media de todos los equipos de la zona. Elegí país y liga para comparar con su media, o un club puntual. Los clubes sin resultados abiertos cuentan como un club promedio de la Liga Nacional y se marcan como estimados."
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm font-semibold">
            País del rival
            <select
              className="select"
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setLeague(ALL);
                setRivalName(ALL);
              }}
            >
              <option value={ALL}>Toda la zona</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Liga del rival
            <select
              className="select"
              value={league}
              onChange={(e) => {
                setLeague(e.target.value);
                setRivalName(ALL);
              }}
            >
              <option value={ALL}>{country ? `Todas las de ${country}` : 'Todas las ligas'}</option>
              {leagues.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Rival
            <select
              className="select"
              value={rivalName}
              onChange={(e) => {
                setRivalName(e.target.value);
              }}
            >
              <option value={ALL}>Media de {scope}</option>
              {pool.map((c) => (
                <option key={`${c.country}-${c.name}`} value={c.name}>
                  {c.name}
                  {c.estimated ? ' (estimado)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Dónde
            <select
              className="select"
              value={venue}
              onChange={(e) => {
                setVenue(e.target.value as Venue);
              }}
            >
              <option value="local">{team} de local</option>
              <option value="visitante">{team} de visitante</option>
              <option value="neutral">Cancha neutral (copas)</option>
            </select>
          </label>
        </div>
        <Tiles
          items={[
            {
              label: `Gana ${team}`,
              value: pct(win, 1),
              hint: `Pierde: ${pct(1 - win, 1)} · en básquet no hay empate`,
              help: `P(margen > 0) con el margen normal: Φ(margen esperado / σ), con σ = ${dec1(model.sd_margin)} puntos, el desvío del error del margen en los partidos de ajuste.`,
            },
            {
              label: 'Puntos esperados',
              value: `${dec1(p.own)} - ${dec1(p.rival)}`,
              hint: `${team} contra ${rival.name}`,
              help: 'Lo que da la regresión con las variables de los dos equipos (puntos = β₀ + Σ β · variable).',
            },
            { label: 'Margen esperado', value: `${fmtM(margin)} pts`, hint: `Total: ${dec1(p.own + p.rival)} puntos` },
            {
              label: 'Simulación',
              value: pct(sim.win, 1),
              hint: `${String(sim.n)} partidos simulados`,
              help: 'Monte Carlo: se sortean 10.000 márgenes de la normal y se cuenta cuántos gana. Tiene que dar casi lo mismo que la cuenta exacta.',
            },
          ]}
        />
        {rival.estimated ? (
          <p className="text-sm text-muted">
            {rival.name} incluye clubes sin resultados abiertos: se los cuenta como un club promedio de la Liga Nacional.
            Con la clave de API-Basketball, el pipeline suma los resultados de Brasil, Uruguay, Chile, Paraguay y las copas.
          </p>
        ) : null}
        <div className="chart-grid-layout">
          <ChartCard
            id="pred-margen"
            number="R1"
            title={`Cómo puede terminar: margen de ${team}`}
            source={SOURCE}
            updated={run.trainedAt}
            coverage="Probabilidad de cada tramo de diferencia final (positivo: gana)"
            table={{ head: ['Margen', 'Probabilidad'], rows: bins.map((b) => [b.label, b.p]) }}
          >
            <BarChart
              labels={bins.map((b) => b.label)}
              format={(v) => pct(v, 1)}
              series={[{ id: 'p', label: 'Probabilidad', slot: 1, values: bins.map((b) => b.p) }]}
              label={`Distribución del margen final de ${team} contra ${rival.name}`}
            />
          </ChartCard>
          <ChartCard
            id="pred-decide"
            number="R2"
            title="Qué decide el partido"
            source={SOURCE}
            updated={run.trainedAt}
            coverage={`Puntos de margen que aporta cada variable (a favor de ${team} si es positivo)`}
            table={{ head: ['Variable', 'Puntos de margen', 'Qué mide'], rows: decide.map((d) => [d.label, d.value, d.help]) }}
          >
            <BarChart
              labels={decide.map((d) => d.label)}
              horizontal
              format={fmtM}
              series={[{ id: 'd', label: 'Puntos de margen', slot: 2, values: decide.map((d) => d.value) }]}
              label="Aporte de cada variable al margen esperado"
            />
          </ChartCard>
        </div>
      </Section>

      <Section
        id="backtest"
        title="¿Acierta? El backtest"
        intro="Cada partido de la temporada se predijo solo con los partidos anteriores, como si fuera ese día. Así se mide sin trampa."
      >
        <Tiles
          items={[
            {
              label: 'Acierto del ganador',
              value: pct(num(run.metrics.accuracy), 0),
              hint: `${String(num(run.metrics.evaluated) ?? 0)} partidos de la liga evaluados`,
            },
            {
              label: 'Brier',
              value: dec3(num(run.metrics.brier)),
              hint: `Sin modelo (solo localía): ${dec3(num(run.metrics.brier_base))}`,
              help: 'Error cuadrático medio de la probabilidad de ganar: 0 es perfecto, 0,25 es tirar una moneda. Si es más bajo que sin modelo, el modelo sirve.',
            },
            {
              label: 'Error del margen',
              value: `${dec1(num(run.metrics.mae_margin))} pts`,
              help: 'Diferencia media absoluta entre el margen esperado y el real.',
            },
            {
              label: 'Variables elegidas',
              value: typeof run.metrics.chosen === 'string' ? run.metrics.chosen : 'n/d',
              help: 'El backtest prueba varias combinaciones de variables y se queda con la de menor Brier.',
            },
          ]}
        />
        <SortableTable
          caption={`Partidos de ${team} predichos sin mirar el futuro`}
          rows={backtest}
          rowKey={(x) => `${x.date ?? ''}-${x.home}-${x.away}`}
          columns={[
            { id: 'date', label: 'Fecha', value: (x) => x.date },
            { id: 'rival', label: 'Rival', value: (x) => (ownIsHome(x) ? `vs ${x.away}` : `en ${x.home}`) },
            {
              id: 'p',
              label: 'P(ganar)',
              numeric: true,
              value: (x) => (ownIsHome(x) ? x.pHome : x.pAway),
              render: (x) => pct(ownIsHome(x) ? x.pHome : x.pAway, 0),
            },
            {
              id: 'exp',
              label: 'Esperado',
              numeric: true,
              help: 'Puntos esperados de cada uno antes del partido.',
              value: (x) => (ownIsHome(x) ? x.ptsHome - x.ptsAway : x.ptsAway - x.ptsHome),
              render: (x) =>
                ownIsHome(x) ? `${dec1(x.ptsHome)}-${dec1(x.ptsAway)}` : `${dec1(x.ptsAway)}-${dec1(x.ptsHome)}`,
            },
            {
              id: 'real',
              label: 'Real',
              numeric: true,
              value: (x) => ((x.actualHome ?? 0) - (x.actualAway ?? 0)) * (ownIsHome(x) ? 1 : -1),
              render: (x) =>
                ownIsHome(x)
                  ? `${String(x.actualHome)}-${String(x.actualAway)}`
                  : `${String(x.actualAway)}-${String(x.actualHome)}`,
            },
            {
              id: 'ok',
              label: '¿Acertó?',
              value: (x) => ((x.ptsHome > x.ptsAway) === ((x.actualHome ?? 0) > (x.actualAway ?? 0)) ? 'Sí' : 'No'),
            },
          ]}
        />
        <div className="chart-grid-layout">
          <ChartCard
            id="pred-calibracion"
            number="R3"
            title="Calibración: ¿lo que dice 70 % pasa 7 de cada 10 veces?"
            source={SOURCE}
            updated={run.trainedAt}
            coverage="Cada punto: partidos agrupados por la probabilidad que les dio el modelo. Sobre la diagonal, bien calibrado"
            table={{
              head: ['Probabilidad desde', 'Partidos', 'Ganó el local'],
              rows: calibration.map((c) => [c.bin, c.predicted, c.observed]),
            }}
          >
            <ScatterChart
              points={calibration
                .filter((c) => c.observed !== null)
                .map((c) => ({
                  x: c.bin + 0.05,
                  y: c.observed ?? 0,
                  label: `${String(c.predicted)} partidos`,
                  size: Math.min(1, 0.3 + c.predicted / 20),
                }))}
              xLabel="Probabilidad que dio el modelo"
              yLabel="Proporción que ganó"
              diagonal
              label="Calibración de la probabilidad de ganar del local"
            />
          </ChartCard>
          <ChartCard
            id="pred-variables"
            number="R4"
            title="Qué combinación de variables predice mejor"
            source={SOURCE}
            updated={run.trainedAt}
            coverage="Brier del backtest de cada combinación (más bajo es mejor)"
            table={{
              head: ['Combinación', 'Brier', 'Error del margen', 'Acierto'],
              rows: variables.map((v) => [v.label, v.brier, v.mae_margin, v.accuracy]),
            }}
          >
            <BarChart
              labels={variables.map((v) => v.label)}
              horizontal
              format={(v) => dec3(v)}
              highlight={variables.findIndex((v) => v.label === run.metrics.chosen)}
              series={[{ id: 'b', label: 'Brier', slot: 3, values: variables.map((v) => v.brier) }]}
              label="Brier del backtest de cada combinación de variables"
            />
          </ChartCard>
        </div>
      </Section>

      <Section
        id="modelo"
        title="El modelo"
        intro={`Regresión lineal por mínimos cuadrados con ${String(num(run.metrics.rows) ?? 0)} filas (cada partido aporta las dos): explica el ${pct(num(run.metrics.r2), 0)} de las diferencias de puntos (R²). Temporadas: ${((run.params.seasons ?? []) as string[]).join(', ')}, con más peso a lo reciente (vida media de ${String(num(run.params.half_life_days) ?? 180)} días).`}
      >
        <SortableTable
          caption="Coeficientes de la regresión de puntos"
          rows={coefs.filter((c) => c.id !== 'intercepto')}
          rowKey={(c) => c.id}
          columns={[
            { id: 'var', label: 'Variable', value: (c) => c.label },
            { id: 'what', label: 'Qué mide', wrap: true, value: (c) => labels[c.id]?.help ?? '' },
            {
              id: 'beta',
              label: 'Puntos por unidad',
              numeric: true,
              help: 'Cuántos puntos más anota un equipo por una unidad más de la variable, con todo lo demás igual.',
              value: (c) => c.coef,
              render: (c) => dec2(c.coef),
            },
            {
              id: 'p',
              label: '¿Significativa?',
              help: 'Sí si p < 0,05: el efecto difícilmente sea casualidad.',
              value: (c) => c.p_value,
              render: (c) => (c.p_value < 0.05 ? `Sí (p ${pValue(c.p_value)})` : `No (p ${pValue(c.p_value)})`),
            },
            {
              id: 'ci',
              label: 'IC 95 %',
              numeric: true,
              help: 'Rango donde está el coeficiente verdadero con 95 % de confianza.',
              value: (c) => c.low,
              render: (c) => `[${dec2(c.low)}; ${dec2(c.high)}]`,
            },
          ]}
        />
        <h3 className="text-base font-bold">Los clubes de la Liga Nacional</h3>
        <SortableTable
          caption="Perfil de cada club de la Liga Nacional que usa el predictor"
          rows={leagueClubs}
          rowKey={(s) => s.team}
          current={(s) => plain(s.team) === plain(ownName)}
          columns={[
            { id: 'team', label: 'Club', value: (s) => s.team },
            { id: 'pj', label: 'PJ', numeric: true, value: (s) => s.games },
            {
              id: 'pf',
              label: 'PF/PJ',
              numeric: true,
              help: 'Puntos a favor por partido.',
              value: (s) => (s.games ? s.pointsFor / s.games : null),
              render: (s) => dec1(s.games ? s.pointsFor / s.games : null),
            },
            {
              id: 'pc',
              label: 'PC/PJ',
              numeric: true,
              help: 'Puntos en contra por partido.',
              value: (s) => (s.games ? s.pointsAgainst / s.games : null),
              render: (s) => dec1(s.games ? s.pointsAgainst / s.games : null),
            },
            {
              id: 'elo',
              label: 'Elo',
              numeric: true,
              help: 'Fuerza acumulada partido a partido (1500 = promedio).',
              value: (s) => s.elo,
              render: (s) => dec1(s.elo),
            },
            {
              id: 'pace',
              label: 'Ritmo',
              numeric: true,
              help: 'Posesiones por partido contra el promedio de la liga.',
              value: (s) => s.profile.pace ?? null,
              render: (s) => fmtM(s.profile.pace ?? 0),
            },
            {
              id: 'efg',
              label: 'eFG%',
              numeric: true,
              help: 'Acierto efectivo contra el promedio, en puntos porcentuales.',
              value: (s) => s.profile.efg ?? null,
              render: (s) => fmtM(100 * (s.profile.efg ?? 0)),
            },
            {
              id: 'tov',
              label: 'Pérdidas',
              numeric: true,
              help: 'Pérdidas por posesión contra el promedio, en puntos porcentuales (menos es mejor).',
              value: (s) => s.profile.tov ?? null,
              render: (s) => fmtM(100 * (s.profile.tov ?? 0)),
            },
            {
              id: 'orb',
              label: 'Reb. of.',
              numeric: true,
              help: 'Rebote ofensivo contra el promedio, en puntos porcentuales.',
              value: (s) => s.profile.orb ?? null,
              render: (s) => fmtM(100 * (s.profile.orb ?? 0)),
            },
            {
              id: 'form',
              label: 'Forma',
              numeric: true,
              help: 'Victorias en los últimos 5.',
              value: (s) => s.form,
              render: (s) => pct(s.form, 0),
            },
          ]}
        />
      </Section>

      {tests.length > 0 ? (
        <Section
          id="probabilidad"
          title="Probabilidad"
          intro="Las pruebas que sostienen el modelo: si los puntos son normales, intervalos de confianza y si la localía importa."
        >
          <ProbabilityPanel tests={tests} updated={run.trainedAt} />
        </Section>
      ) : null}
    </div>
  );
}
