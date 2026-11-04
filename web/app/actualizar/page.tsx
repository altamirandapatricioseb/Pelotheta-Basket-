import type { Metadata } from 'next';

import { UpdateButton } from '@/components/update/update-button';
import { getUpdates } from '@/lib/data/updates';
import { formatDateTime, formatNumber } from '@/lib/format';

export const metadata: Metadata = {
  description: 'Fecha y hora de la última actualización de los datos, estado de cada fuente e historial de cargas.',
};

const STATUS_ES: Record<string, string> = {
  ok: 'Completa',
  parcial: 'Parcial',
  error: 'Falló',
  omitido: 'Sin cambios',
  en_curso: 'En curso',
};
const SOURCE_ES: Record<string, string> = { global: 'Corrida completa', lnb: 'Liga Nacional de Básquet' };
const TRIGGER_ES: Record<string, string> = { schedule: 'Programada (día 1)', manual: 'A mano' };

export default async function ActualizarPage() {
  const updates = await getUpdates();
  const global = updates.ok ? updates.sources.find((s) => s.isGlobal) : undefined;

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="page-title">
          <span className="title-trace">Actualizar</span>
        </h1>
        <p className="mt-2 text-muted">
          Los datos se cargan solos el día 1 de cada mes. Este botón trae la última carga si hubo una nueva.
        </p>
      </div>

      {!updates.ok ? (
        <div role="alert" className="under-construction">
          <p className="font-bold">{updates.code}: la base de datos no responde.</p>
          <p className="text-muted">Puede estar pausada por inactividad. Probá de nuevo en unos minutos.</p>
        </div>
      ) : (
        <>
          <section aria-labelledby="ultima" className="under-construction">
            <h2 id="ultima" className="text-sm font-semibold text-muted">
              Última actualización exitosa
            </h2>
            <p className="text-3xl font-extrabold tabular">
              <time dateTime={global?.lastSuccessAt ?? undefined}>{formatDateTime(global?.lastSuccessAt)}</time>
            </p>
            <UpdateButton shownAt={global?.lastSuccessAt ?? null} />
          </section>

          <section aria-labelledby="fuentes" className="grid gap-3">
            <h2 id="fuentes" className="text-lg font-bold">
              Estado de las fuentes
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {updates.sources
                .filter((s) => !s.isGlobal)
                .map((s) => (
                  <li key={s.source} className="under-construction">
                    <p className="font-semibold">{SOURCE_ES[s.source] ?? s.source}</p>
                    <p className="text-sm text-muted">
                      Última corrida: {STATUS_ES[s.lastStatus ?? ''] ?? 'n/d'} · última carga exitosa:{' '}
                      {formatDateTime(s.lastSuccessAt)}
                    </p>
                  </li>
                ))}
            </ul>
          </section>

          <section aria-labelledby="historial" className="grid gap-3">
            <h2 id="historial" className="text-lg font-bold">
              Historial de cargas
            </h2>
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- región desplazable con nombre (axe) */}
            <div className="data-table-wrap" tabIndex={0} role="region" aria-label="Tabla (se desplaza de costado)">
              <table className="data-table tabular">
                <caption className="sr-only">Historial de cargas de datos</caption>
                <thead>
                  <tr>
                    <th scope="col">Terminó</th>
                    <th scope="col">Disparo</th>
                    <th scope="col">Resultado</th>
                    <th scope="col">Partidos nuevos</th>
                    <th scope="col">Filas</th>
                    <th scope="col">Duración (s)</th>
                    <th scope="col">Base (MB)</th>
                  </tr>
                </thead>
                <tbody>
                  {updates.history.map((h, i) => (
                    <tr key={`${h.finishedAt ?? ''}-${String(i)}`}>
                      <th scope="row" className="text-left font-semibold">
                        {formatDateTime(h.finishedAt ?? h.startedAt)}
                      </th>
                      <td>{TRIGGER_ES[h.trigger ?? ''] ?? 'n/d'}</td>
                      <td>{STATUS_ES[h.status ?? ''] ?? 'n/d'}</td>
                      <td>{formatNumber(h.gamesAdded)}</td>
                      <td>{formatNumber(h.rowsLoaded)}</td>
                      <td>{formatNumber(h.durationS)}</td>
                      <td>{formatNumber(h.dbSizeMb, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
