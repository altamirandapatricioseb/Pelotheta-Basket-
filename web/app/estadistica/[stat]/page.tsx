import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { StatDetailView } from '@/components/stats/stat-detail';
import { getStatDetail } from '@/lib/data/desglosada';

export const metadata: Metadata = { title: 'Estadística desglosada' };

// Los parámetros de la URL vienen de afuera: se validan contra listas cerradas (14.3).
const paramsSchema = z.object({ stat: z.string().regex(/^[a-z][a-z0-9_]{0,60}$/) });
const searchSchema = z.object({
  entidad: z.enum(['jugador', 'equipo', 'rival']).catch('equipo'),
  id: z.coerce.number().int().positive().max(1_000_000_000).optional().catch(undefined),
  // Solo una ruta interna de Comparar: nada de enlaces a otros sitios (14.3).
  volver: z
    .string()
    .regex(/^\/comparar\?[a-zA-Z0-9_=&%.,-]{0,400}$/)
    .optional()
    .catch(undefined),
});

interface PageProps {
  params: Promise<{ stat: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ params, searchParams }: PageProps) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const raw = await searchParams;
  const search = searchSchema.parse({ entidad: raw.entidad, id: raw.id, volver: raw.volver });
  // Un jugador o un rival necesitan su id; el equipo no.
  if (search.entidad !== 'equipo' && search.id === undefined) notFound();
  const detail = await getStatDetail(parsed.data.stat, search.entidad, search.id ?? null);
  if (detail === null) notFound();
  if (!detail.ok) {
    return (
      <div role="alert" className="under-construction">
        <p className="font-bold">PEL-DB-001: la base de datos no responde.</p>
        <p className="text-muted">Puede estar pausada por inactividad. Probá de nuevo en unos minutos.</p>
      </div>
    );
  }
  const query = `?entidad=${search.entidad}${search.id !== undefined ? `&id=${String(search.id)}` : ''}${search.volver ? `&volver=${encodeURIComponent(search.volver)}` : ''}`;
  const backHref =
    search.volver ??
    (search.entidad === 'jugador'
      ? `/jugadores?jugador=${String(search.id)}&estadistica=${parsed.data.stat}`
      : `/equipo?estadistica=${parsed.data.stat}`);
  return <StatDetailView detail={detail.data} backHref={backHref} query={query} />;
}
