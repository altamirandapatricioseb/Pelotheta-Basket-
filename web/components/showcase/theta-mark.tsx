'use client';

// El logo de Pelotheta como SVG animable: anillo (círculo central), barra interior (no toca el anillo,
// como en la letra theta) y las costuras de la pelota de básquet. Mismas formas que
// public/brand/system-logo.svg, en currentColor.

import { motion, type Variants } from 'motion/react';

const EASE = [0.16, 1, 0.3, 1] as const;

const RING: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  show: { pathLength: 1, opacity: 1, transition: { duration: 0.9, ease: EASE } },
};
const BAR: Variants = {
  hidden: { scaleX: 0 },
  show: { scaleX: 1, transition: { duration: 0.5, ease: EASE, delay: 0.45 } },
};
const SEAM: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  show: (i: number) => ({
    pathLength: 1,
    opacity: 1,
    transition: { duration: 0.6, ease: EASE, delay: 0.55 + i * 0.07 },
  }),
};

// La costura vertical se corta alrededor de la barra: así la barra queda suelta, como en la Θ.
const SEAMS = [
  'M32 9V24.5',
  'M32 39.5V55',
  'M14.5 15.5C18.5 22 18.5 42 14.5 48.5',
  'M49.5 15.5C45.5 22 45.5 42 49.5 48.5',
];

interface ThetaMarkProps {
  className?: string;
  /** Con `draw`, las partes entran en secuencia (loader y cierre); sin él, el logo ya está dibujado. */
  draw?: boolean;
}

export function ThetaMark({ className, draw = false }: ThetaMarkProps) {
  return (
    <motion.svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      initial={draw ? 'hidden' : false}
      animate="show"
      style={{ overflow: 'visible' }}
    >
      {SEAMS.map((d, i) => (
        <motion.path
          key={d}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          variants={SEAM}
          custom={i}
        />
      ))}
      <motion.rect
        x="21"
        y="29"
        width="22"
        height="6"
        rx="3"
        fill="currentColor"
        variants={BAR}
        style={{ transformOrigin: '32px 32px' }}
      />
      <motion.circle
        cx="32"
        cy="32"
        r="26"
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        variants={RING}
        style={{ rotate: -90, transformOrigin: '32px 32px' }}
      />
    </motion.svg>
  );
}
