import { createHash, timingSafeEqual } from 'node:crypto';

import { revalidateTag } from 'next/cache';

import { DATA_CACHE_TAG } from '@/lib/supabase/server';

// Revalidación de la caché de datos (secciones 8.9 y 14.3). La llama el pipeline después de una
// carga exitosa, para que la web no muestre hasta 6 horas datos viejos. Solo POST, sin
// parámetros, protegida con un secreto en una cabecera. No escribe nada en la base.

export const dynamic = 'force-dynamic';

/** Compara en tiempo constante: se comparan hashes para que el largo del secreto no se filtre. */
function sameSecret(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function POST(request: Request): Response {
  const expected = process.env.REVALIDATE_SECRET ?? '';
  const given = request.headers.get('x-revalidate-secret') ?? '';
  // Sin secreto configurado la ruta queda cerrada: nunca se abre por omisión.
  if (expected.length < 32 || !sameSecret(given, expected)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  revalidateTag(DATA_CACHE_TAG, { expire: 0 });
  return Response.json({ ok: true, revalidated: DATA_CACHE_TAG });
}
