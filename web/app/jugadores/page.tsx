import type { Metadata } from 'next';
import { z } from 'zod';

import { PlayerSummaryView } from '@/components/players/player-summary';
import { SetPicker } from '@/components/stats/set-picker';
import { getPlayers, getSets } from '@/lib/data/players';

export const metadata: Metadata = {
  title: 'Jugadores',
  description:
    'Estadísticas del plantel de Boca Juniors básquet por categoría: anotación, tiro, rebote, creación y más.',
};

// Los parámetros de la URL vienen de afuera: se validan antes de usarlos (14.3).
const searchSchema = z.object({
  conjunto: z
    .string()
    .regex(/^[a-z0-9_]{1,40}$/)
    .optional()
    .catch(undefined),
  jugador: z.coerce.number().int().positive().optional().catch(undefined),
  estadistica: z
    .string()
    .regex(/^[a-z0-9_]{1,40}$/)
    .optional()
    .catch(undefined),
});

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function DbError({ code }: { code: string }) {
  return (
    <div role="alert" className="under-construction">
      <p className="font-bold">{code}: la base de datos no responde.</p>
      <p className="text-muted">Puede estar pausada por inactividad. Probá de nuevo en unos minutos.</p>
    </div>
  );
}

export default async function JugadoresPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const params = searchSchema.parse({ conjunto: raw.conjunto, jugador: raw.jugador, estadistica: raw.estadistica });
  const [sets, players] = await Promise.all([getSets('jugador'), getPlayers()]);

  const header = (
    <div>
      <h1 className="page-title">
        <span className="title-trace">Jugadores</span>
      </h1>
      <p className="mt-2 text-muted">Plantel de Boca · Liga Nacional 2026-27 · una tabla por categoría</p>
    </div>
  );
  if (!sets.ok || !players.ok) {
    return (
      <div className="grid gap-6">
        {header}
        <DbError code="PEL-DB-001" />
      </div>
    );
  }
  // Un conjunto inexistente en la URL vuelve al primero (Resumen), nunca rompe la página.
  const set = sets.data.sets.find((s) => s.id === params.conjunto) ?? sets.data.sets[0];
  const columns = set ? set.statIds.flatMap((id) => sets.data.columns.get(id) ?? []) : [];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {header}
        {set ? <SetPicker basePath="/jugadores" sets={sets.data.sets} current={set.id} /> : null}
      </div>
      {players.data.length > 0 && set && columns.length > 0 ? (
        <PlayerSummaryView
          key={set.id}
          players={players.data}
          columns={columns}
          competitionName="Liga Nacional 2026-27"
          initialPlayerId={params.jugador ?? null}
          initialStat={params.estadistica ?? null}
        />
      ) : (
        <p className="under-construction text-muted">
          Todavía no hay partidos cargados. Se completan con la próxima actualización.
        </p>
      )}
    </div>
  );
}
