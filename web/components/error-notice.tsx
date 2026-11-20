/** Aviso de base caída: el mismo texto que el resto de las páginas (PEL-DB-001). */
export function ErrorNotice({ code }: { code: 'PEL-DB-001' }) {
  return (
    <div role="alert" className="under-construction">
      <p className="font-bold">{code}: la base de datos no responde.</p>
      <p className="text-muted">Puede estar pausada por inactividad. Probá de nuevo en unos minutos.</p>
    </div>
  );
}
