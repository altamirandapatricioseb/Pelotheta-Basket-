import type { Metadata } from 'next';
import { z } from 'zod';

import { ExcelDownloads } from '@/components/excel-downloads';
import { CompareView, type BreakdownData } from '@/components/compare/compare-view';
import { parseRefs, type RefSpec } from '@/lib/compare/compare';
import { getCatalog, getPlayerRows } from '@/lib/data/catalog';
import { getBreakdown, getPlayerPositions } from '@/lib/data/compare';

export const metadata: Metadata = {
  description:
    'Comparación de un jugador de Boca Juniors básquet contra la media del plantel, de una zona, de su posición u otro jugador, por categoría y con el desglose de cada estadística.',
};

// Los parámetros de la URL vienen de afuera: se validan antes de usarlos (14.3).
const searchSchema = z.object({
  jugador: z.coerce.number().int().positive().optional().catch(undefined),
  con: z
    .string()
    .regex(/^[a-z0-9,-]{1,120}$/)
    .optional()
    .catch(undefined),
  vista: z
    .string()
    .regex(/^[a-z]{3,20}$/)
    .catch('resumen'),
  stat: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,60}$/)
    .optional()
    .catch(undefined),
  modo: z.enum(['totales', 'por36']).catch('por36'),
  min: z.coerce.number().int().min(0).max(3000).catch(100),
  prom: z.enum(['simple', 'ponderado']).catch('simple'),
});

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function CompararPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const params = searchSchema.parse({
    jugador: one(raw.jugador),
    con: one(raw.con),
    vista: one(raw.vista),
    stat: one(raw.stat),
    modo: one(raw.modo),
    min: one(raw.min),
    prom: one(raw.prom),
  });
  const [players, catalog, positions] = await Promise.all([getPlayerRows(), getCatalog(), getPlayerPositions()]);
  const failed = [players, catalog, positions].some((r) => !r.ok);
  // Las tarjetas y conclusiones están siempre: sin elección, el de más minutos contra el plantel.
  const top = players.ok ? players.data.toSorted((a, b) => b.minutes - a.minutes)[0] : undefined;
  const main = players.ok ? (players.data.find((p) => p.playerId === params.jugador) ?? top) : undefined;
  const parsed = parseRefs(params.con);
  const refs: RefSpec[] = params.con === undefined && parsed.length === 0 ? [{ kind: 'equipo' }] : parsed;

  // El desglose necesita la serie partido a partido del jugador y, si hay, del otro jugador.
  let breakdown: BreakdownData | null = null;
  const stat = catalog.ok ? catalog.data.find((s) => s.id === params.stat && s.available) : undefined;
  if (params.vista === 'desglose' && main && stat) {
    const other = refs.find((r) => r.kind === 'jugador')?.playerId;
    const ids = [main.playerId, ...(other !== undefined && other !== main.playerId ? [other] : [])];
    const result = await getBreakdown(stat.id, ids);
    if (result.ok) breakdown = { statId: stat.id, playerIds: ids, ...result.data };
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">
            <span className="title-trace">Comparar</span>
          </h1>
          <p className="mt-2 text-muted">
            Un jugador contra la media del plantel, de una zona, de su posición u otro jugador, por categoría
          </p>
        </div>
        <ExcelDownloads />
      </div>
      {failed ? (
        <div role="alert" className="under-construction">
          <p className="font-bold">PEL-DB-001: la base de datos no responde.</p>
          <p className="text-muted">Puede estar pausada por inactividad. Probá de nuevo en unos minutos.</p>
        </div>
      ) : players.ok && catalog.ok && positions.ok && players.data.length ? (
        <CompareView
          players={players.data}
          catalog={catalog.data}
          positions={positions.data}
          initial={{
            mainId: main?.playerId ?? null,
            refs,
            view: params.vista,
            stat: stat?.id ?? null,
            per36: params.modo === 'por36',
            minMinutes: params.min,
            mode: params.prom,
          }}
          breakdown={breakdown}
        />
      ) : (
        <p className="under-construction text-muted">
          Todavía no hay partidos cargados. Se completan con la próxima actualización.
        </p>
      )}
    </div>
  );
}
