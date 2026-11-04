import { ArrowLeftIcon, CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react/ssr';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { BoxScore, ConclusionCards, day } from '@/components/detail/parts';
import { getGameDetail } from '@/lib/data/details';
import { NOT_AVAILABLE } from '@/lib/format';
import { gameConclusions, type GameStat, standing } from '@/lib/stats/conclusions';
import { formatValue } from '@/lib/stats/summary-columns';

export const metadata: Metadata = {
  title: 'Partido',
  description: 'Un partido de Boca Juniors básquet: resultado, cuartos, box score, conclusiones y estadísticas.',
};

// El id viene de la URL: se valida antes de usarlo (14.3).
const paramsSchema = z.object({ id: z.coerce.number().int().positive().max(1_000_000_000) });

// Rasgos de estilo o de contexto: no son buenos ni malos por sí mismos, no van a las conclusiones.
const NOT_A_VERDICT = new Set([
  'rest_days',
  'possessions',
  'pace',
  'elo_win_prob',
  'brier',
  'surprise',
  'timeouts',
  'three_rate',
  'net_rating_vs_last5',
  'team_fga',
  'team_fg3a',
  'team_pf',
]);

// Cuatro factores lado a lado: el valor de Boca y el mismo factor del rival.
const FACE_OFF = [
  ['efg', 'efg_against', 'eFG%'],
  ['tov_pct', 'tov_pct_against', 'Pérdidas por posesión'],
  ['orb_pct_team', 'orb_pct_against', 'Rebote ofensivo'],
  ['ft_per_fga', 'ft_per_fga_against', 'Libres convertidos por tiro de campo'],
] as const;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PartidoPage({ params }: PageProps) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const detail = await getGameDetail(parsed.data.id);
  if (detail === null) notFound();
  if (!detail.ok) {
    return (
      <div role="alert" className="under-construction">
        <p className="font-bold">PEL-DB-001: la base de datos no responde.</p>
        <p className="text-muted">Puede estar pausada por inactividad. Probá de nuevo en unos minutos.</p>
      </div>
    );
  }
  const { game, games, periods, boca, rival, sets, columns } = detail.data;
  const index = games.findIndex((g) => g.id === game.id);
  const prev = games[index - 1];
  const next = games[index + 1];
  const won = game.pointsFor > game.pointsAgainst;
  const average = (key: string) => {
    const values = games.map((g) => g.stats[key]).filter((v): v is number => typeof v === 'number');
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const stat = (key: string) => {
    const c = columns.get(key);
    const v = game.stats[key];
    return c && typeof v === 'number' ? formatValue(v, c) : NOT_AVAILABLE;
  };
  const keys = [...new Set(sets.flatMap((s) => s.statIds))];
  const verdicts = keys.flatMap((key): GameStat[] => {
    const column = columns.get(key);
    const value = game.stats[key];
    const avg = average(key);
    return column && typeof value === 'number' && avg !== null && !NOT_A_VERDICT.has(key)
      ? [{ column, value, average: avg }]
      : [];
  });
  const home = { name: 'Boca Juniors', points: game.pointsFor };
  const away = { name: game.opponent, points: game.pointsAgainst };
  const [left, right] = game.isHome ? [home, away] : [away, home];

  return (
    <div className="grid grid-cols-1 gap-8">
      <nav aria-label="Migas de pan" className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link href="/equipo?conjunto=partidos" className="chip focus-ring">
          <ArrowLeftIcon size={14} aria-hidden="true" /> Partidos
        </Link>
        <span className="ml-auto flex flex-wrap gap-2">
          {prev ? (
            <Link href={`/partido/${String(prev.id)}`} className="chip focus-ring">
              <CaretLeftIcon size={12} aria-hidden="true" /> {day(prev.date)} {prev.opponent}
            </Link>
          ) : null}
          {next ? (
            <Link href={`/partido/${String(next.id)}`} className="chip focus-ring">
              {day(next.date)} {next.opponent} <CaretRightIcon size={12} aria-hidden="true" />
            </Link>
          ) : null}
        </span>
      </nav>

      <header className="match-head">
        <p className="text-center text-xs font-semibold text-muted">
          Liga Nacional 2026-27 · {day(game.date)} · Boca {game.isHome ? 'local' : 'visitante'} · partido {index + 1} de{' '}
          {games.length}
        </p>
        <h1 className="sr-only">
          {left.name} {left.points} - {right.points} {right.name}
        </h1>
        <div className="match-score" aria-hidden="true">
          <span className="match-score__team">{left.name}</span>
          <span className="match-score__points">
            {left.points} - {right.points}
          </span>
          <span className="match-score__team match-score__team--away">{right.name}</span>
        </div>
        <p className="text-center font-bold" style={{ color: won ? 'var(--color-best)' : 'var(--color-worst)' }}>
          {won ? 'Victoria' : 'Derrota'} de Boca por {Math.abs(game.pointsFor - game.pointsAgainst)}
        </p>
        <dl className="match-facts">
          {[
            ['Posesiones', stat('possessions')],
            ['Ritmo', stat('pace')],
            ['Rating ofensivo', stat('ortg')],
            ['Rating defensivo', stat('drtg')],
            ['Rating neto', stat('net_rating')],
            ['Prob. de ganar (Elo)', stat('elo_win_prob')],
            ['Máxima ventaja', stat('max_lead')],
            ['Cambios de líder', stat('lead_changes')],
            ['Días de descanso', stat('rest_days')],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <ConclusionCards
        items={gameConclusions(verdicts)}
        basis={`Lo que más se apartó (10 % o más) del promedio de Boca en sus ${String(games.length)} partidos de la temporada.`}
      />

      <div className="match-grid">
        <section aria-labelledby="cuartos" className="grid gap-2">
          <h2 id="cuartos" className="text-xl font-bold">
            Por cuarto
          </h2>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- región desplazable con nombre (axe) */}
          <div className="data-table-wrap" tabIndex={0} role="region" aria-label="Tabla (se desplaza de costado)">
            <table className="data-table tabular">
              <caption className="sr-only">Puntos por cuarto</caption>
              <thead>
                <tr>
                  <th scope="col">Cuarto</th>
                  <th scope="col">Boca</th>
                  <th scope="col">{game.opponent}</th>
                  <th scope="col">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => {
                  const diff = p.pointsFor - p.pointsAgainst;
                  return (
                    <tr key={p.period} data-highlight={diff > 0 || undefined}>
                      <th scope="row">
                        {p.period <= 4 ? `${String(p.period)}.º` : `Suplementario ${String(p.period - 4)}`}
                      </th>
                      <td>{p.pointsFor}</td>
                      <td>{p.pointsAgainst}</td>
                      <td>{diff > 0 ? `+${String(diff)}` : diff}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section aria-labelledby="factores" className="grid gap-2">
          <h2 id="factores" className="text-xl font-bold">
            Cuatro factores
          </h2>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- región desplazable con nombre (axe) */}
          <div className="data-table-wrap" tabIndex={0} role="region" aria-label="Tabla (se desplaza de costado)">
            <table className="data-table tabular">
              <caption className="sr-only">Cuatro factores de Boca y del rival</caption>
              <thead>
                <tr>
                  <th scope="col">Factor</th>
                  <th scope="col">Boca</th>
                  <th scope="col">{game.opponent}</th>
                </tr>
              </thead>
              <tbody>
                {FACE_OFF.map(([own, other, label]) => (
                  <tr key={own}>
                    <th scope="row" title={columns.get(own)?.description}>
                      {label}
                    </th>
                    <td>{stat(own)}</td>
                    <td>{stat(other)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section aria-labelledby="box" className="grid gap-4">
        <h2 id="box" className="text-xl font-bold">
          Box score
        </h2>
        <BoxScore team="Boca Juniors" lines={boca} linkPlayers />
        <BoxScore team={game.opponent} lines={rival} linkPlayers={false} />
      </section>

      <section aria-labelledby="todas" className="grid gap-3">
        <h2 id="todas" className="text-xl font-bold">
          Todas las estadísticas del partido
        </h2>
        <p className="text-sm text-muted">
          Valor de este partido, promedio de la temporada y puesto de este partido entre los {games.length} de Boca (1 =
          el mejor según el sentido de cada estadística).
        </p>
        {sets.map((set, i) => (
          <details key={set.id} className="detail-block" open={i === 0}>
            <summary>
              {set.name} <span className="text-xs font-semibold text-muted">{set.statIds.length}</span>
            </summary>
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- región desplazable con nombre (axe) */}
            <div className="data-table-wrap" tabIndex={0} role="region" aria-label="Tabla (se desplaza de costado)">
              <table className="data-table tabular">
                <caption className="sr-only">{set.name}</caption>
                <thead>
                  <tr>
                    <th scope="col">Estadística</th>
                    <th scope="col">Este partido</th>
                    <th scope="col">Promedio</th>
                    <th scope="col">Puesto</th>
                  </tr>
                </thead>
                <tbody>
                  {set.statIds.map((key) => {
                    const c = columns.get(key);
                    if (!c) return null;
                    const v = game.stats[key];
                    const all = games.map((g) => g.stats[key]).filter((x): x is number => typeof x === 'number');
                    const rank = typeof v === 'number' && all.length > 1 ? standing(all, v, c.higherIsBetter) : null;
                    return (
                      <tr key={key}>
                        <th scope="row" title={c.description} className="text-left">
                          <Link href={`/estadistica/${key}?entidad=equipo`} className="focus-ring hover:underline">
                            {c.name}
                          </Link>
                        </th>
                        <td className="font-bold">{formatValue(v, c)}</td>
                        <td>{formatValue(average(key), c)}</td>
                        <td>{rank ? `${String(rank.rank)}.º de ${String(all.length)}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </section>
      <p className="text-xs text-muted">Fuente: Liga Nacional de Básquet (box score oficial), cálculo propio.</p>
    </div>
  );
}
