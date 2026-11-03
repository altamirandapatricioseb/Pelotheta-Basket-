import type { Metadata } from 'next';
import { z } from 'zod';

import { PlayerMasterView } from '@/components/players/player-master';
import { getCatalog, getPlayerRows, getStatSets } from '@/lib/data/catalog';

export const metadata: Metadata = {
  title: 'Jugadores',
  description:
    'Estadísticas del plantel de Boca Juniors básquet por categoría: anotación, tiro, zonas, rebote, creación, defensa, impacto, forma y más.',
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

export default async function JugadoresPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const params = searchSchema.parse({ conjunto: raw.conjunto, jugador: raw.jugador, estadistica: raw.estadistica });
  const [catalog, sets, players] = await Promise.all([getCatalog(), getStatSets('jugador'), getPlayerRows()]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="page-title">
          <span className="title-trace">Jugadores</span>
        </h1>
        <p className="mt-2 text-muted">Plantel de Boca · Liga Nacional 2026-27 · una tabla por categoría</p>
      </div>
      {!catalog.ok || !sets.ok || !players.ok ? (
        <div role="alert" className="under-construction">
          <p className="font-bold">PEL-DB-001: la base de datos no responde.</p>
          <p className="text-muted">Puede estar pausada por inactividad. Probá de nuevo en unos minutos.</p>
        </div>
      ) : players.data.length > 0 ? (
        <PlayerMasterView
          players={players.data}
          catalog={catalog.data}
          sets={sets.data}
          competitionName="Liga Nacional 2026-27"
          initialPlayerId={params.jugador ?? null}
          initialStat={params.estadistica ?? null}
          initialSet={params.conjunto ?? null}
        />
      ) : (
        <p className="under-construction text-muted">
          Todavía no hay partidos cargados. Se completan con la próxima actualización.
        </p>
      )}
    </div>
  );
}
