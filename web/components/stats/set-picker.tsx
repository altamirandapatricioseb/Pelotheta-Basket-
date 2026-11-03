'use client';

import { useRouter } from 'next/navigation';

interface SetPickerProps {
  /** Ruta de la interfaz (por ejemplo /jugadores). */
  basePath: string;
  sets: readonly { id: string; name: string }[];
  current: string;
}

/** Desplegable de categoría (9.1 y 9.5): una sola tabla a la vez; la elegida queda en la URL. */
export function SetPicker({ basePath, sets, current }: SetPickerProps) {
  const router = useRouter();
  return (
    <label className="chip focus-ring gap-2">
      <span className="text-muted">Categoría</span>
      <select
        className="bg-transparent font-semibold text-fg outline-none"
        value={current}
        onChange={(event) => {
          router.push(`${basePath}?conjunto=${encodeURIComponent(event.target.value)}`, { scroll: false });
        }}
      >
        {sets.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
