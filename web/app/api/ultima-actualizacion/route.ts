import { createApiClient } from '@/lib/supabase/server';

// GET /api/ultima-actualizacion (9.11 y 14.3): solo lee api.v_last_update, sin parámetros y sin
// disparar nada. Responde sin caché para que el botón «Actualizar» vea una carga recién terminada.

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const { data, error } = await createApiClient()
      .from('v_last_update')
      .select('last_success_at')
      .eq('is_global', true)
      .abortSignal(AbortSignal.timeout(5000));
    if (error) return Response.json({ ok: false, code: 'PEL-DB-001' }, { status: 503 });
    return Response.json(
      { ok: true, lastSuccessAt: data[0]?.last_success_at ?? null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ ok: false, code: 'PEL-DB-001' }, { status: 503 });
  }
}
