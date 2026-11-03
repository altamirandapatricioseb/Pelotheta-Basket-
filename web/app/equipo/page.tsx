import type { Metadata } from 'next';
import { z } from 'zod';

import { SetPicker } from '@/components/stats/set-picker';
import { TeamTable } from '@/components/stats/team-table';
import { getSets, getTeamRows } from '@/lib/data/players';

export const metadata: Metadata = {
  title: 'Equipo',
  description: 'Boca Juniors básquet partido a partido, cuatro factores, tiro y la tabla de la Liga Nacional.',
};

const searchSchema = z.object({
  conjunto: z
    .string()
    .regex(/^[a-z0-9_]{1,40}$/)
    .optional()
    .catch(undefined),
});

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EquipoPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const params = searchSchema.parse({ conjunto: raw.conjunto });
  const sets = await getSets('equipo');
  const set = sets.ok ? (sets.data.sets.find((s) => s.id === params.conjunto) ?? sets.data.sets[0]) : undefined;
  const rows = set ? await getTeamRows(set.scope) : undefined;
  const columns = sets.ok && set ? set.statIds.flatMap((id) => sets.data.columns.get(id) ?? []) : [];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">
            <span className="title-trace">Equipo</span>
          </h1>
          <p className="mt-2 text-muted">Boca · Liga Nacional 2026-27 · una tabla por categoría</p>
        </div>
        {sets.ok && set ? <SetPicker basePath="/equipo" sets={sets.data.sets} current={set.id} /> : null}
      </div>
      {!sets.ok || rows?.ok === false ? (
        <div role="alert" className="under-construction">
          <p className="font-bold">PEL-DB-001: la base de datos no responde.</p>
          <p className="text-muted">Puede estar pausada por inactividad. Probá de nuevo en unos minutos.</p>
        </div>
      ) : set && rows?.ok && rows.data.length > 0 ? (
        <TeamTable
          key={set.id}
          caption={`${set.name} de Boca Juniors`}
          rowHeader={set.scope === 'partido' ? 'Partido' : set.scope === 'quinteto' ? 'Quinteto' : 'Equipo'}
          rows={rows.data}
          columns={columns}
        />
      ) : (
        <p className="under-construction text-muted">
          Todavía no hay partidos cargados. Se completan con la próxima actualización.
        </p>
      )}
      <p className="text-xs text-muted">Fuente: Liga Nacional de Básquet (box score oficial), cálculo propio.</p>
    </div>
  );
}
