import { createApiClient } from '@/lib/supabase/server';

// Etapa 1: la página solo prueba que la web lee la fila de prueba de Supabase con la clave
// pública (criterio de terminado de la etapa 1). Las 6 interfaces llegan desde la etapa 2.
export default async function Page() {
  const { data, error } = await createApiClient().from('system_status').select('key, value, updated_at');
  const rows = data ?? [];

  return (
    <section aria-labelledby="titulo">
      <h1 id="titulo">Pelotheta Θ · Boca Juniors básquet</h1>
      <p className="muted">En construcción. Etapa de prueba: lectura desde Supabase con la clave pública.</p>
      {error ? (
        <p role="alert">PEL-DB-001: la base de datos no responde. Probá de nuevo en unos minutos.</p>
      ) : (
        <dl className="status">
          {rows.map((row) => (
            <div key={row.key}>
              <dt>{row.key}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
