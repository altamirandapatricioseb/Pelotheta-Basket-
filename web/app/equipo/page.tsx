import type { Metadata } from 'next';
import { z } from 'zod';

import { ExcelDownloads } from '@/components/excel-downloads';
import { TeamTableView } from '@/components/team/team-table';
import { getCatalog, getStatSets, getTeamMatches } from '@/lib/data/catalog';
import { getTeamRows } from '@/lib/data/players';

export const metadata: Metadata = {
  description:
    'Tablas de Boca Juniors básquet por categoría: partido a partido, por rival, por mes y acumulada, con cuatro factores, tiro, zonas, rebote, rival y la tabla de la Liga Nacional.',
};

// Los parámetros de la URL vienen de afuera: se validan contra listas cerradas (14.3).
const searchSchema = z.object({
  conjunto: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,40}$/)
    .optional()
    .catch(undefined),
  vista: z.enum(['partido', 'rival', 'mes', 'competicion', 'acumulada']).catch('partido'),
});

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EquipoPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const params = searchSchema.parse({ conjunto: raw.conjunto, vista: raw.vista });
  const [matches, catalog, sets, league, lineups] = await Promise.all([
    getTeamMatches(),
    getCatalog(),
    getStatSets('equipo'),
    getTeamRows('temporada'),
    getTeamRows('quinteto'),
  ]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">
            <span className="title-trace">Equipo</span>
          </h1>
          <p className="mt-2 text-muted">Boca Juniors · Liga Nacional 2026-27 · una categoría por vez</p>
        </div>
        <ExcelDownloads />
      </div>
      {matches.ok && catalog.ok && sets.ok ? (
        <TeamTableView
          matches={matches.data}
          catalog={catalog.data}
          sets={sets.data}
          otherRows={{ temporada: league.ok ? league.data : [], quinteto: lineups.ok ? lineups.data : [] }}
          initialSet={params.conjunto ?? null}
          initialView={params.vista}
        />
      ) : (
        <div role="alert" className="under-construction">
          <p className="font-bold">PEL-DB-001: la base de datos no responde.</p>
          <p className="text-muted">Puede estar pausada por inactividad. Probá de nuevo en unos minutos.</p>
        </div>
      )}
    </div>
  );
}
