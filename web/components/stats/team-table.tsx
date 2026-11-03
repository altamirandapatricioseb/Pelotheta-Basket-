'use client';

import { CaretDownIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';

import { formatNumber, NOT_AVAILABLE } from '@/lib/format';
import type { SummaryColumn } from '@/lib/stats/summary-columns';

interface TeamTableProps {
  caption: string;
  rowHeader: string;
  rows: readonly { id: string; label: string; highlight: boolean; values: Record<string, number | null> }[];
  columns: readonly SummaryColumn[];
}

/** Porcentajes guardados como proporción (0 a 1) se muestran como %; el resto con 1 decimal o entero. */
function show(value: number | null | undefined, column: SummaryColumn): string {
  if (value === null || value === undefined) return NOT_AVAILABLE;
  if (column.unit === '%' && Math.abs(value) <= 1) return `${formatNumber(value * 100, 1)} %`;
  return formatNumber(value, Number.isInteger(value) ? 0 : 1);
}

/** Tabla del equipo (Interfaz 2, 9.5): una a la vez, orden con un clic en el encabezado. */
export function TeamTable({ caption, rowHeader, rows, columns }: TeamTableProps) {
  const [sort, setSort] = useState<{ key: string | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' });
  const sorted = useMemo(() => {
    if (sort.key === null) return rows;
    const key = sort.key;
    return [...rows].sort((a, b) => {
      const va = a.values[key];
      const vb = b.values[key];
      // `n/d` siempre al final, sin importar el sentido del orden (9.10).
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      return sort.dir === 'asc' ? va - vb : vb - va;
    });
  }, [rows, sort]);

  return (
    <div className="grid gap-4">
      <div className="data-table-wrap">
        <table className="data-table tabular">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{rowHeader}</th>
              {columns.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    title={c.description}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      className="sort-button focus-ring"
                      onClick={() => {
                        // Primer clic: de menor a mayor; segundo clic: al revés (9.10).
                        setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === 'asc' ? 'desc' : 'asc' }));
                      }}
                    >
                      {c.short}
                      {active ? (
                        <CaretDownIcon
                          size={12}
                          weight="bold"
                          className="sort-arrow"
                          data-dir={sort.dir}
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} data-highlight={r.highlight || undefined}>
                <th scope="row" className="whitespace-nowrap text-left font-semibold">
                  {r.label}
                </th>
                {columns.map((c) => {
                  const v = r.values[c.key];
                  return (
                    <td
                      key={c.key}
                      title={v === null || v === undefined ? 'No disponible en las fuentes gratuitas' : undefined}
                    >
                      {show(v, c)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {columns.map((c) => (
          <div key={c.key}>
            <dt className="font-bold">
              {c.name} <span className="level-badge ml-1">Nivel {c.level}</span>
            </dt>
            <dd className="text-muted">
              {c.description}
              {c.formula ? ` Fórmula: ${c.formula}.` : ''}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
