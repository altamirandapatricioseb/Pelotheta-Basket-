import { CaretDownIcon, FileXlsIcon } from '@phosphor-icons/react/dist/ssr';

import { readPublicEnv } from '@/lib/env';

/** Nombre del libro en el bucket `exports` (igual que `pipeline/excel.py: FILE_NAME`). */
export const BOOK_FILE = 'pelotheta-basquet.xlsx';

/**
 * «Descargar Excel» (sección 10), como en Pelotheta fútbol: el libro que arma el pipeline con
 * gráficos nativos, hojas interactivas (Comparador, Dispersión y Desglosada) y una hoja por
 * gráfico, en el bucket público `exports` de Supabase Storage. Hay una sola competición cargada:
 * el libro de la Liga Nacional es también el global.
 */
export function ExcelDownloads() {
  const env = readPublicEnv();
  const base = `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/exports`;
  return (
    <details className="downloads">
      <summary className="chip focus-ring">
        <FileXlsIcon size={16} aria-hidden="true" />
        Descargar Excel
        <CaretDownIcon size={12} aria-hidden="true" />
      </summary>
      <div className="downloads__menu">
        <p className="text-xs text-muted">
          Libro con gráficos nativos, Comparador, Dispersión y Desglosada interactivos. Se actualiza con cada carga de
          datos.
        </p>
        <ul>
          <li>
            <a href={`${base}/${BOOK_FILE}`} download className="focus-ring">
              <FileXlsIcon size={16} aria-hidden="true" />
              Liga Nacional 2026-27
            </a>
          </li>
        </ul>
      </div>
    </details>
  );
}
