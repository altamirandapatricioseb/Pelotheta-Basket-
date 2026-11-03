import { CheckCircleIcon, WarningCircleIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';

import type { Line } from '@/lib/data/details';
import { formatNumber } from '@/lib/format';
import type { Conclusion } from '@/lib/stats/conclusions';

/** dd/mm/aaaa desde una fecha ISO (aaaa-mm-dd). */
export const day = (iso: string) => iso.split('-').reverse().join('/');

export function ConclusionCards({ items, basis }: { items: readonly Conclusion[]; basis: string }) {
  return (
    <section aria-labelledby="conclusiones" className="grid gap-3">
      <h2 id="conclusiones" className="text-xl font-bold">
        Conclusiones
      </h2>
      {items.length ? (
        <ul className="concl-grid">
          {items.map((c) => {
            const Icon = c.tone === 'positivo' ? CheckCircleIcon : WarningCircleIcon;
            return (
              <li key={c.id} className={`concl concl--${c.tone}`}>
                <p className="concl__tag">
                  <Icon size={16} weight="fill" aria-hidden="true" />
                  {c.tone === 'positivo' ? 'A favor' : 'A mejorar'} · {c.title}
                </p>
                <p className="concl__text">{c.text}</p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted">Nada se aparta lo suficiente del resto para destacarlo.</p>
      )}
      <p className="text-xs text-muted">{basis}</p>
    </section>
  );
}

const shots = (made: number | null, att: number | null) => `${String(made ?? 0)}-${String(att ?? 0)}`;
const COUNTS = ['orb', 'drb', 'reb', 'ast', 'stl', 'tov', 'blk', 'pf', 'efficiency'] as const;
const HEAD = ['Min', 'Pts', '2P', '3P', 'TL', 'RO', 'RD', 'RT', 'Ast', 'Rob', 'Pér', 'Tap', 'Fal', 'Val', '+/-'];
const TITLE = [
  'Minutos',
  'Puntos',
  'Dobles convertidos-intentados',
  'Triples convertidos-intentados',
  'Tiros libres convertidos-intentados',
  'Rebotes ofensivos',
  'Rebotes defensivos',
  'Rebotes totales',
  'Asistencias',
  'Robos',
  'Pérdidas',
  'Tapas',
  'Faltas',
  'Valoración',
  'Más/menos',
];

/** Box score oficial de un equipo en un partido; los jugadores de Boca llevan a su página. */
export function BoxScore({ team, lines, linkPlayers }: { team: string; lines: readonly Line[]; linkPlayers: boolean }) {
  const sum = (k: keyof Line) => lines.reduce((a, l) => a + (typeof l[k] === 'number' ? l[k] : 0), 0);
  return (
    <section aria-label={`Box score de ${team}`} className="grid gap-2">
      <h3 className="text-lg font-bold">{team}</h3>
      <div className="data-table-wrap">
        <table className="data-table tabular">
          <caption className="sr-only">Box score de {team}</caption>
          <thead>
            <tr>
              <th scope="col">Jugador</th>
              {HEAD.map((h, i) => (
                <th key={h} scope="col" title={TITLE[i]}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.player_id}>
                <th scope="row" className="whitespace-nowrap text-left font-semibold">
                  <span className="mr-2 inline-block w-5 text-right text-xs text-muted">{l.shirt_number ?? ''}</span>
                  {linkPlayers && l.player_id !== null ? (
                    <Link href={`/jugador/${String(l.player_id)}`} className="focus-ring hover:underline">
                      {l.player}
                    </Link>
                  ) : (
                    l.player
                  )}
                  {l.started ? <span className="ml-1 text-xs text-muted">(T)</span> : null}
                </th>
                <td>{formatNumber(l.minutes, 1)}</td>
                <td className="font-bold">{l.pts}</td>
                <td>{shots(l.fg2m, l.fg2a)}</td>
                <td>{shots(l.fg3m, l.fg3a)}</td>
                <td>{shots(l.ftm, l.fta)}</td>
                {COUNTS.map((k) => (
                  <td key={k}>{l[k]}</td>
                ))}
                <td>{l.plus_minus !== null && l.plus_minus > 0 ? `+${String(l.plus_minus)}` : l.plus_minus}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td>{formatNumber(sum('minutes'))}</td>
              <td>{sum('pts')}</td>
              <td>{shots(sum('fg2m'), sum('fg2a'))}</td>
              <td>{shots(sum('fg3m'), sum('fg3a'))}</td>
              <td>{shots(sum('ftm'), sum('fta'))}</td>
              {COUNTS.map((k) => (
                <td key={k}>{sum(k)}</td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted">(T) titular. Minutos con un decimal.</p>
    </section>
  );
}
