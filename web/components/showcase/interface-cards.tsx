'use client';

// Las interfaces como tarjetas grandes: en la portada (fila ligada al scroll) y al final del
// selector de equipo (grilla). Entran escalonadas con curva exponencial de salida (9.10).

import { motion, stagger, type Variants } from 'motion/react';
import Link from 'next/link';

import { InterfaceIcon } from '@/components/header/interface-icon';
import { INTERFACES, type InterfaceLink } from '@/config/navigation';

const COPY: Record<InterfaceLink['icon'], string> = {
  graficos: '79 gráficos por categoría: forma, puntos y ritmo, cuartos, cuatro factores, tiros, rebote y modelos.',
  equipo: 'Tablas por partido, por rival, por mes, por competición y acumuladas, con descarga a Excel.',
  jugadores: 'El plantel completo con percentiles, conjuntos de estadísticas y la ficha de cada jugador.',
  situaciones: 'Qué pasa cuando se va al descanso abajo, cuando mete doce triples o cuando gana el rebote.',
  comparar: 'Dos jugadores frente a frente, estadística por estadística, con el plantel como referencia.',
  valor: 'Los minutos que le da el entrenador a cada jugador contra los que su producción justifica, con toda la liga.',
  alternativas: 'Para cada jugador, los más parecidos de la liga con K-means: de otro club, en dupla o del plantel.',
  predictor: 'Probabilidad de ganar contra cualquier rival o la media de una liga, con backtest y pruebas.',
  actualizar: 'La carga de datos a un botón: última actualización, estado de cada fuente e historial de cargas.',
};

export const LIST_VARIANTS: Variants = {
  hidden: {},
  show: { transition: { delayChildren: stagger(0.07) } },
};

export const ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.75, ease: [0.16, 1, 0.3, 1] } },
};

export function InterfaceCard({ item }: { item: InterfaceLink }) {
  return (
    <motion.li variants={ITEM_VARIANTS}>
      <Link href={item.href} className="show-card focus-ring">
        <span className="show-card__icon">
          <InterfaceIcon name={item.icon} size={26} />
        </span>
        <span className="grid gap-3">
          <span className="show-card__name">{item.label}</span>
          <span className="show-card__text">{COPY[item.icon]}</span>
          <span className="show-card__go">Entrar</span>
        </span>
      </Link>
    </motion.li>
  );
}

/** Grilla de las interfaces, que entra cuando aparece en pantalla. */
export function InterfaceGrid() {
  return (
    <motion.ul className="show-grid" variants={LIST_VARIANTS} initial="hidden" animate="show">
      {INTERFACES.map((item) => (
        <InterfaceCard key={item.href} item={item} />
      ))}
    </motion.ul>
  );
}
