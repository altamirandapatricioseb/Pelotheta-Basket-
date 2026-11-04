import { ArrowLeftIcon } from '@phosphor-icons/react/ssr';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { ConclusionCards, day } from '@/components/detail/parts';
import { getPlayerDetail } from '@/lib/data/details';
import { formatNumber, NOT_AVAILABLE } from '@/lib/format';
import { playerConclusions, type RankedStat, standing } from '@/lib/stats/conclusions';
import { columnValue, formatValue } from '@/lib/stats/summary-columns';

export const metadata: Metadata = {
  title: 'Jugador',
  description: 'Un jugador de Boca Juniors básquet: ficha, conclusiones, todas sus estadísticas y sus partidos.',
};

// El id viene de la URL: se valida antes de usarlo (14.3).
const paramsSchema = z.object({ id: z.coerce.number().int().positive().max(1_000_000_000) });

// Conjuntos de volumen, contexto o identidad: se muestran, pero no sirven para decir si juega bien.
const NOT_A_VERDICT = new Set(['resumen', 'marcas', 'evolucion', 'promedios', 'tiro_totales', 'liga', 'carga']);
// Percentiles entre jugadores con al menos este tramo de los minutos del más usado: sin esto un
// suplente con 3 minutos y un acierto encabeza cualquier porcentaje.
const MIN_SHARE_OF_MINUTES = 0.25;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function JugadorPage({ params }: PageProps) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const detail = await getPlayerDetail(parsed.data.id);
  if (detail === null) notFound();
  if (!detail.ok) {
    return (
      <div role="alert" className="under-construction">
        <p className="font-bold">PEL-DB-001: la base de datos no responde.</p>
        <p className="text-muted">Puede estar pausada por inactividad. Probá de nuevo en unos minutos.</p>
      </div>
    );
  }
  const { player, squad, sets, columns, log } = detail.data;
  const maxMinutes = Math.max(0, ...squad.map((p) => p.minutes));
  const pool = squad.filter((p) => p.minutes >= MIN_SHARE_OF_MINUTES * maxMinutes || p.playerId === player.playerId);
  // Conteos cada 36 minutos (si no, gana el que más juega); tasas y porcentajes tal cual.
  const rankOf = (key: string): RankedStat | null => {
    const column = columns.get(key);
    if (!column) return null;
    const value = columnValue(player, column, column.per36);
    const values = pool.map((p) => columnValue(p, column, column.per36)).filter((v): v is number => v !== null);
    if (value === null || values.length < 2) return null;
    return { column, value, of: values.length, ...standing(values, value, column.higherIsBetter) };
  };
  const verdictKeys = [...new Set(sets.filter((s) => !NOT_A_VERDICT.has(s.id)).flatMap((s) => s.statIds))];
  const conclusions = playerConclusions(verdictKeys.flatMap((k) => rankOf(k) ?? []));
  const fact = (key: string) => {
    const c = columns.get(key);
    return c ? formatValue(player.values[key], c) : NOT_AVAILABLE;
  };
  const played = log.filter((g) => (g.line.minutes ?? 0) > 0).length;

  return (
    <div className="grid gap-8">
      <nav aria-label="Migas de pan" className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link href="/jugadores" className="chip focus-ring">
          <ArrowLeftIcon size={14} aria-hidden="true" /> Jugadores
        </Link>
        <span className="ml-auto">
          <Link href={`/jugadores?jugador=${String(player.playerId)}`} className="chip focus-ring">
            Ver en la tabla
          </Link>
        </span>
      </nav>

      <header className="match-head">
        <div className="flex items-center gap-4">
          <span className="avatar" aria-hidden="true">
            {player.name
              .split(' ')
              .filter(Boolean)
              .map((w, i, all) => (i === 0 || i === all.length - 1 ? w[0] : ''))
              .join('')
              .toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted">
              {[
                player.shirtNumber !== null ? `#${String(player.shirtNumber)}` : null,
                detail.data.position ?? 'Posición n/d',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight">{player.name}</h1>
            {detail.data.fullName && detail.data.fullName !== player.name ? (
              <p className="text-sm text-muted">{detail.data.fullName}</p>
            ) : null}
          </div>
        </div>
        <dl className="match-facts">
          {[
            ['Edad', player.age !== null ? `${formatNumber(player.age, 1)} años` : NOT_AVAILABLE],
            [
              'Altura',
              detail.data.heightCm !== null
                ? `${(detail.data.heightCm / 100).toFixed(2).replace('.', ',')} m`
                : NOT_AVAILABLE,
            ],
            ['Peso', detail.data.weightKg !== null ? `${String(detail.data.weightKg)} kg` : NOT_AVAILABLE],
            ['Nacionalidad', detail.data.nationality ?? NOT_AVAILABLE],
            ['Partidos', String(player.matches)],
            ['Titularidades', fact('starts')],
            ['Minutos por partido', fact('mpg')],
            ['Puntos por partido', fact('ppg')],
            ['Rebotes por partido', fact('rpg')],
            ['Asistencias por partido', fact('apg')],
            ['PER', fact('per')],
            ['Tiro verdadero', fact('ts')],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <ConclusionCards
        items={conclusions}
        basis={`Percentil entre los ${String(pool.length)} jugadores de Boca con al menos el 25 % de los minutos del más usado; los conteos se comparan cada 36 minutos.`}
      />

      <section aria-labelledby="todas" className="grid gap-3">
        <h2 id="todas" className="text-xl font-bold">
          Todas sus estadísticas
        </h2>
        <p className="text-sm text-muted">
          Liga Nacional 2026-27. Percentil 100 = el mejor del grupo según el sentido de cada estadística.
        </p>
        {sets.map((set, i) => (
          <details key={set.id} className="detail-block" open={i === 0}>
            <summary>
              {set.name} <span className="text-xs font-semibold text-muted">{set.statIds.length}</span>
            </summary>
            <div className="data-table-wrap">
              <table className="data-table tabular">
                <caption className="sr-only">
                  {set.name} de {player.name}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Estadística</th>
                    <th scope="col">Total o valor</th>
                    <th scope="col">Cada 36</th>
                    <th scope="col">Percentil</th>
                    <th scope="col">Puesto</th>
                  </tr>
                </thead>
                <tbody>
                  {set.statIds.map((key) => {
                    const c = columns.get(key);
                    if (!c) return null;
                    const rank = rankOf(key);
                    return (
                      <tr key={key}>
                        <th scope="row" title={c.description} className="text-left">
                          <Link
                            href={`/estadistica/${key}?entidad=jugador&id=${String(player.playerId)}`}
                            className="focus-ring hover:underline"
                          >
                            {c.name}
                          </Link>
                          {!c.higherIsBetter ? <span className="ml-1 text-xs text-muted">(menos es mejor)</span> : null}
                        </th>
                        <td className="font-bold">{formatValue(player.values[key], c)}</td>
                        <td>{c.per36 ? formatValue(columnValue(player, c, true), c) : '—'}</td>
                        <td>{rank ? rank.percentile : '—'}</td>
                        <td>{rank ? `${String(rank.rank)}.º de ${String(rank.of)}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </section>

      <section aria-labelledby="partidos" className="grid gap-3">
        <h2 id="partidos" className="text-xl font-bold">
          Sus partidos ({played} jugados de {log.length} en la planilla)
        </h2>
        <div className="data-table-wrap">
          <table className="data-table tabular">
            <caption className="sr-only">Partidos de {player.name}</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Rival</th>
                <th scope="col">Resultado</th>
                <th scope="col">Rol</th>
                <th scope="col">Min</th>
                <th scope="col">Pts</th>
                <th scope="col">RT</th>
                <th scope="col">Ast</th>
                <th scope="col">Rob</th>
                <th scope="col">Tap</th>
                <th scope="col">Pér</th>
                <th scope="col" title="Tiros de campo convertidos-intentados">
                  TC
                </th>
                <th scope="col">3P</th>
                <th scope="col">TL</th>
                <th scope="col">Val</th>
                <th scope="col">+/-</th>
              </tr>
            </thead>
            <tbody>
              {log.map(({ game, line }) => {
                const won = game.pointsFor > game.pointsAgainst;
                return (
                  <tr key={game.id} data-highlight={won || undefined}>
                    <th scope="row">
                      <Link href={`/partido/${String(game.id)}`} className="focus-ring hover:underline">
                        {day(game.date)}
                      </Link>
                    </th>
                    <td className="text-left">
                      {game.isHome ? 'vs' : 'en'} {game.opponent}
                    </td>
                    <td className="text-left">
                      {won ? 'G' : 'P'} {game.pointsFor}-{game.pointsAgainst}
                    </td>
                    <td className="text-left">
                      {line.started ? 'Titular' : (line.minutes ?? 0) > 0 ? 'Suplente' : 'No entró'}
                    </td>
                    <td>{formatNumber(line.minutes, 1)}</td>
                    <td className="font-bold">{line.pts}</td>
                    <td>{line.reb}</td>
                    <td>{line.ast}</td>
                    <td>{line.stl}</td>
                    <td>{line.blk}</td>
                    <td>{line.tov}</td>
                    <td>
                      {(line.fg2m ?? 0) + (line.fg3m ?? 0)}-{(line.fg2a ?? 0) + (line.fg3a ?? 0)}
                    </td>
                    <td>
                      {line.fg3m}-{line.fg3a}
                    </td>
                    <td>
                      {line.ftm}-{line.fta}
                    </td>
                    <td>{line.efficiency}</td>
                    <td>
                      {line.plus_minus !== null && line.plus_minus > 0
                        ? `+${String(line.plus_minus)}`
                        : line.plus_minus}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs text-muted">
        Fuente: Liga Nacional de Básquet (box score y ficha oficial), Wikipedia (posición, altura, peso y nacionalidad),
        cálculo propio.
      </p>
    </div>
  );
}
