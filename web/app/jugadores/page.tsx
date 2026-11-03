import type { Metadata } from 'next';
import { z } from 'zod';

import { PlayerSummaryView } from '@/components/players/player-summary';
import { getPlayerSummary } from '@/lib/data/players';

export const metadata: Metadata = {
  title: 'Jugadores',
  description:
    'Resumen del plantel de Boca Juniors básquet: partidos, minutos, puntos, rebotes, asistencias y valoración.',
};

// Los parámetros de la URL vienen de afuera: se validan antes de usarlos (14.3).
const searchSchema = z.object({
  jugador: z.coerce.number().int().positive().optional().catch(undefined),
  estadistica: z
    .string()
    .regex(/^[a-zA-Z]{1,30}$/)
    .optional()
    .catch(undefined),
});

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function JugadoresPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const params = searchSchema.parse({ jugador: raw.jugador, estadistica: raw.estadistica });
  const summary = await getPlayerSummary();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="page-title">
          <span className="title-trace">Jugadores</span>
        </h1>
        <p className="mt-2 text-muted">Resumen del plantel · Liga Nacional 2026-27</p>
      </div>

      {summary.ok ? (
        summary.data.length > 0 ? (
          <PlayerSummaryView
            players={summary.data}
            competitionName="Liga Nacional 2026-27"
            initialPlayerId={params.jugador ?? null}
            initialStat={params.estadistica ?? null}
          />
        ) : (
          <p className="under-construction text-muted">
            Todavía no hay partidos cargados. Se completan con la próxima actualización.
          </p>
        )
      ) : (
        <div role="alert" className="under-construction">
          <p className="font-bold">{summary.code}: la base de datos no responde.</p>
          <p className="text-muted">Puede estar pausada por inactividad. Probá de nuevo en unos minutos.</p>
        </div>
      )}
    </div>
  );
}
