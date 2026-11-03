'use client';

import { ArrowRightIcon, CaretDownIcon, InfoIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AnimatedNumber } from '@/components/animated-number';
import type { PlayerSummary } from '@/lib/data/players';
import { formatNumber, NOT_AVAILABLE } from '@/lib/format';
import { columnValue, getColumn, rankAndPercentile, type SummaryColumn } from '@/lib/stats/summary-columns';

type SortDir = 'asc' | 'desc';
const ROW_LAYOUT = { type: 'spring', stiffness: 520, damping: 44 } as const;

interface PlayerSummaryViewProps {
  players: PlayerSummary[];
  /** Columnas del conjunto elegido en el desplegable (vienen de la base). Nunca vacío. */
  columns: readonly SummaryColumn[];
  competitionName: string;
  initialPlayerId: number | null;
  initialStat: string | null;
}

function initials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : ''}`.toUpperCase();
}

function display(value: number | null, per36: boolean, column: SummaryColumn): string {
  // Los porcentajes se guardan como proporción (0 a 1) o ya en escala 0-100 (USG%, TOV%...).
  if (value !== null && column.unit === '%' && Math.abs(value) <= 1) return `${formatNumber(value * 100, 1)} %`;
  const decimals = (per36 && column.per36) || (value !== null && !Number.isInteger(value)) ? 1 : 0;
  return formatNumber(value, decimals);
}

/**
 * Interfaz 3, conjunto «Resumen» (9.1): panel alto con la ficha del jugador actual y la
 * descripción de la estadística actual, y debajo la tabla (un jugador por fila).
 * Jugador actual = fila seleccionada (clic o flechas arriba/abajo); estadística actual =
 * columna seleccionada (clic en el encabezado o flechas izquierda/derecha).
 */
export function PlayerSummaryView({
  players,
  columns,
  competitionName,
  initialPlayerId,
  initialStat,
}: PlayerSummaryViewProps) {
  const router = useRouter();
  const [per36, setPer36] = useState(false);
  const [query, setQuery] = useState('');
  const [statKey, setStatKey] = useState<string>(getColumn(columns, initialStat)?.key ?? '');
  const [sort, setSort] = useState<{ key: SummaryColumn['key']; dir: SortDir }>({ key: 'minutes', dir: 'desc' });
  // Al arrancar, el jugador actual es el de más minutos (9.1).
  const [selectedId, setSelectedId] = useState<number | null>(
    players.some((p) => p.playerId === initialPlayerId) ? initialPlayerId : (players[0]?.playerId ?? null),
  );
  const [previewId, setPreviewId] = useState<number | null>(null);
  const tableRef = useRef<HTMLTableSectionElement>(null);

  // `columns` nunca llega vacío (la página lo garantiza), así que siempre hay una columna actual.
  const column = (getColumn(columns, statKey) ?? columns[0]) as SummaryColumn;

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es-AR');
    const sortColumn = getColumn(columns, sort.key) ?? column;
    return players
      .filter((p) => !q || p.name.toLocaleLowerCase('es-AR').includes(q))
      .toSorted((a, b) => {
        const va = columnValue(a, sortColumn, per36);
        const vb = columnValue(b, sortColumn, per36);
        // `n/d` siempre al final, sin importar el sentido del orden (9.10).
        if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
        return sort.dir === 'asc' ? va - vb : vb - va;
      });
  }, [players, query, sort, per36, columns, column]);

  const current = players.find((p) => p.playerId === (previewId ?? selectedId)) ?? visible[0] ?? null;

  // El estado vive en la URL para poder compartir la vista exacta (9.1).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId !== null) url.searchParams.set('jugador', String(selectedId));
    url.searchParams.set('estadistica', statKey);
    window.history.replaceState(null, '', url);
  }, [selectedId, statKey]);

  const squadValues = useMemo(
    () => visible.map((p) => columnValue(p, column, per36)).filter((v): v is number => v !== null),
    [visible, column, per36],
  );
  const currentValue = current ? columnValue(current, column, per36) : null;
  const standing = currentValue === null ? null : rankAndPercentile(squadValues, currentValue);

  const onHeaderClick = (key: SummaryColumn['key']) => {
    setStatKey(key);
    // Primer clic: de menor a mayor; segundo clic sobre la misma columna: al revés (9.10).
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const moveSelection = useCallback(
    (step: number) => {
      const index = visible.findIndex((p) => p.playerId === selectedId);
      const next = visible[Math.min(visible.length - 1, Math.max(0, index + step))];
      if (!next) return;
      setSelectedId(next.playerId);
      tableRef.current?.querySelector<HTMLElement>(`[data-player="${String(next.playerId)}"]`)?.focus();
    },
    [visible, selectedId],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    const colIndex = columns.findIndex((c) => c.key === statKey);
    const keyActions: Record<string, () => void> = {
      ArrowDown: () => {
        moveSelection(1);
      },
      ArrowUp: () => {
        moveSelection(-1);
      },
      ArrowRight: () => {
        setStatKey((columns[colIndex + 1] ?? column).key);
      },
      ArrowLeft: () => {
        setStatKey((columns[colIndex - 1] ?? column).key);
      },
      // Enter abre el detalle del jugador seleccionado (lo mismo que el doble clic).
      Enter: () => {
        if (selectedId !== null) router.push(`/jugador/${String(selectedId)}`);
      },
    };
    const action = keyActions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  const average = (col: SummaryColumn) => {
    const values = visible.map((p) => columnValue(p, col, per36)).filter((v): v is number => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };

  return (
    <div className="grid gap-6">
      {/* Panel de contexto: ficha del jugador y descripción de la estadística actual. */}
      <div className="context-panel" aria-live="polite">
        <section aria-label="Jugador actual">
          <CourtTexture />
          {current ? (
            <div className="relative grid gap-5">
              <div className="flex items-center gap-4">
                <span className="avatar" aria-hidden="true">
                  {initials(current.name)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted">
                    {current.shirtNumber !== null ? `#${String(current.shirtNumber)} · ` : ''}
                    {current.position ?? 'Posición n/d'}
                    {previewId !== null && previewId !== selectedId ? ' · vista previa' : ''}
                  </p>
                  <h2 className="truncate text-2xl font-extrabold tracking-tight">{current.name}</h2>
                  <Link
                    href={`/jugador/${String(current.playerId)}`}
                    className="focus-ring mt-1 inline-flex items-center gap-1 text-sm font-bold text-link hover:underline"
                  >
                    Ver detalle del jugador <ArrowRightIcon size={14} aria-hidden="true" />
                  </Link>
                  <p className="text-sm text-muted">
                    {current.age !== null ? `${String(current.age)} años` : 'Edad n/d'} ·{' '}
                    {current.heightCm !== null ? `${formatNumber(current.heightCm / 100, 1)} m` : 'Altura n/d'} ·{' '}
                    {competitionName}
                  </p>
                </div>
              </div>
              <dl className="fact-grid">
                <Fact label="Partidos" value={current.matches} />
                <Fact label="Minutos" value={current.minutes} />
                <Fact label="Puntos" value={current.values.pts ?? 0} />
                <Fact label="Rebotes" value={current.values.trb ?? 0} />
                <Fact label="Asistencias" value={current.values.ast ?? 0} />
                <Fact label="Valoración" value={current.values.efficiency ?? 0} />
              </dl>
            </div>
          ) : (
            <p className="relative text-muted">No hay jugadores con estos filtros.</p>
          )}
        </section>

        <section aria-label="Estadística actual" className="grid content-start gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-extrabold tracking-tight">{column.name}</h2>
            <span className="level-badge" title="A: dato directo · B: calculado · C: no disponible">
              Nivel {column.level}
            </span>
          </div>
          <p className="max-w-[60ch] text-sm leading-relaxed">{column.description}</p>
          {column.formula ? (
            <p className="text-sm text-muted">
              Fórmula: <span className="font-semibold text-fg">{column.formula}</span>
            </p>
          ) : null}
          <p className="text-sm text-muted">
            Unidad: {per36 && column.per36 ? `${column.unit} cada 36 minutos` : column.unit}
          </p>
          {current ? (
            <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
              <p className="text-4xl font-extrabold tabular">
                {currentValue === null ? (
                  <span className="text-muted">{NOT_AVAILABLE}</span>
                ) : (
                  <AnimatedNumber value={currentValue} format={(v) => display(v, per36, column)} />
                )}
              </p>
              {standing ? (
                <p className="pb-1 text-sm text-muted">
                  <span className="font-bold text-fg">{standing.rank}.º</span> de {squadValues.length} en el plantel ·
                  percentil <span className="font-bold text-fg">{standing.percentile}</span>
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="text-xs text-muted">Fuente: Liga Nacional de Básquet (box score oficial), cálculo propio.</p>
        </section>
      </div>

      {/* Controles de la tabla. */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="chip focus-ring ml-auto cursor-text" htmlFor="buscar-jugador">
          <MagnifyingGlassIcon size={16} aria-hidden="true" />
          <span className="sr-only">Buscar jugador</span>
          <input
            id="buscar-jugador"
            type="search"
            placeholder="Buscar jugador"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            className="w-36 bg-transparent text-fg outline-none placeholder:text-muted"
          />
        </label>
        <button
          type="button"
          className="chip focus-ring"
          aria-pressed={per36}
          aria-current={per36}
          onClick={() => {
            setPer36((v) => !v);
          }}
        >
          Cada 36 minutos
        </button>
      </div>

      <div className="data-table-wrap">
        <table className="data-table tabular" role="grid" aria-readonly="true" onKeyDown={onKeyDown}>
          <caption className="sr-only">
            Resumen del plantel, {competitionName}. Flechas arriba y abajo cambian el jugador; izquierda y derecha, la
            estadística; Enter abre el detalle del jugador.
          </caption>
          <thead>
            <tr>
              <th scope="col">Jugador</th>
              {columns.map((c) => {
                const sorted = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    title={c.name}
                    data-current-stat={c.key === statKey || undefined}
                    aria-sort={sorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      className="sort-button focus-ring"
                      onClick={() => {
                        onHeaderClick(c.key);
                      }}
                    >
                      {c.short}
                      {sorted ? (
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
          <tbody
            ref={tableRef}
            onMouseLeave={() => {
              setPreviewId(null);
            }}
          >
            {visible.map((p, i) => {
              const selected = p.playerId === selectedId;
              return (
                <motion.tr
                  key={p.playerId}
                  layout="position"
                  transition={ROW_LAYOUT}
                  className="row-enter"
                  style={{ '--i': Math.min(i, 24) } as React.CSSProperties}
                  aria-selected={selected}
                  data-player={p.playerId}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => {
                    setSelectedId(p.playerId);
                  }}
                  onDoubleClick={() => {
                    router.push(`/jugador/${String(p.playerId)}`);
                  }}
                  title="Doble clic o Enter para ver el detalle"
                  onMouseEnter={() => {
                    setPreviewId(p.playerId);
                  }}
                  onFocus={() => {
                    setSelectedId(p.playerId);
                  }}
                >
                  <th scope="row" className="font-semibold">
                    <span className="flex items-center gap-2">
                      <span className="w-6 text-right text-xs text-muted">{p.shirtNumber ?? ''}</span>
                      {p.name}
                    </span>
                  </th>
                  {columns.map((c) => {
                    const v = columnValue(p, c, per36);
                    return (
                      <td key={c.key} data-current-stat={c.key === statKey || undefined}>
                        {v === null ? (
                          <span className="text-muted" title="No disponible en las fuentes gratuitas">
                            {NOT_AVAILABLE}
                          </span>
                        ) : (
                          display(v, per36, c)
                        )}
                      </td>
                    );
                  })}
                </motion.tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Promedio del plantel</td>
              {columns.map((c) => (
                <td key={c.key}>{display(average(c), per36, c)}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted">
        <InfoIcon size={14} aria-hidden="true" />
        Liga Nacional 2026-27. Jugadores sin minutos figuran n/d. Fuente: Liga Nacional de Básquet; cálculo propio.
      </p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <AnimatedNumber value={value} format={(v) => formatNumber(Math.round(v))} />
      </dd>
    </div>
  );
}

/** Media cancha de básquet en SVG (FIBA, 14 × 15 m): textura sutil del panel (9.10). */
function CourtTexture() {
  return (
    <svg className="court-texture" viewBox="0 0 400 260" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="8" y="8" width="384" height="244" />
        <rect x="8" y="88" width="98" height="84" />
        <circle cx="106" cy="130" r="32" />
        <circle cx="30" cy="130" r="8" />
        <path d="M8 22 H 44 A 128 128 0 0 1 44 238 H 8" />
        <circle cx="400" cy="130" r="32" />
      </g>
    </svg>
  );
}
