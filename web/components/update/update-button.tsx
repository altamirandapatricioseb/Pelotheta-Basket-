'use client';

import { ArrowClockwiseIcon } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { formatDateTime } from '@/lib/format';

interface UpdateButtonProps {
  /** Fecha de la última carga exitosa que se mostró al abrir la página. */
  shownAt: string | null;
}

type State =
  { kind: 'idle' } | { kind: 'checking' } | { kind: 'same' } | { kind: 'new'; at: string } | { kind: 'error' };

/**
 * Botón «Actualizar» (9.11): pregunta si hay una carga más nueva que la que se ve y, si la hay,
 * vuelve a pedir los datos. No escribe en la base ni usa claves: la carga la hace el workflow
 * mensual (o a mano desde GitHub Actions), nunca el navegador del visitante.
 */
export function UpdateButton({ shownAt }: UpdateButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function check() {
    setState({ kind: 'checking' });
    try {
      const response = await fetch('/api/ultima-actualizacion', { cache: 'no-store' });
      const body = (await response.json()) as { ok: boolean; lastSuccessAt?: string | null };
      if (!body.ok) {
        setState({ kind: 'error' });
        return;
      }
      const latest = body.lastSuccessAt ?? null;
      if (latest && latest !== shownAt) {
        setState({ kind: 'new', at: latest });
        router.refresh();
      } else {
        setState({ kind: 'same' });
      }
    } catch {
      setState({ kind: 'error' });
    }
  }

  return (
    <div className="grid gap-3">
      <button
        type="button"
        className="update-panel__button focus-ring"
        onClick={() => void check()}
        disabled={state.kind === 'checking'}
        aria-busy={state.kind === 'checking'}
      >
        <ArrowClockwiseIcon size={22} weight="bold" aria-hidden="true" />
        {state.kind === 'checking' ? 'Buscando datos nuevos…' : 'Actualizar'}
      </button>
      <p role="status" className="text-sm text-muted">
        {state.kind === 'same' && 'Ya estás viendo la última carga. La próxima corre el día 1 del mes.'}
        {state.kind === 'new' && `Hay una carga nueva (${formatDateTime(state.at)}): se actualizaron los datos.`}
        {state.kind === 'error' && 'PEL-DB-001: la base no responde. Probá de nuevo en unos minutos.'}
      </p>
    </div>
  );
}
