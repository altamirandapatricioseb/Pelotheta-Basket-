'use client';

// Las seis interfaces contadas sobre una pizarra táctica. La sección queda pegada durante 600 vh: la
// cancha de básquet (vista desde arriba, vertical) va en el centro y la cámara se mueve con el
// scroll. Primero se ve el partido entero (Equipo), después se acerca a los cinco puntos del equipo
// (Jugadores), aísla a dos (Comparar), sienta a uno cargado de faltas (Situaciones), se aleja para
// trazar una jugada hasta el aro (Gráficos) y vuelve al círculo central (Actualizar). El texto de
// cada interfaz aparece a un costado y cambia de lado en cada paso.

import { motion, type MotionValue, useMotionValueEvent, useScroll, useSpring, useTransform } from 'motion/react';
import Link from 'next/link';
import { useRef } from 'react';

import { INTERFACES, type InterfaceLink } from '@/config/navigation';

const N = 6;
/** Medio ancho de la transición alrededor de cada frontera entre pasos (en progreso 0 a 1). */
const H = 0.045;

type Six<T> = readonly [T, T, T, T, T, T];

/** Entrada y salida para useTransform: cada valor se mantiene en su paso y cambia en la frontera. */
function hold<T>(values: Six<T>): { input: number[]; output: T[] } {
  const input = [0];
  const output: T[] = [values[0]];
  values.slice(1).forEach((v, i) => {
    const k = i + 1;
    input.push(k / N - H, k / N + H);
    output.push(values[i] as T, v);
  });
  input.push(1);
  output.push(values[5]);
  return { input, output };
}

/** Lo mismo que `hold`, evaluado a mano (para la cámara, que se escribe como atributo SVG). */
function at(values: Six<number>, p: number): number {
  const { input, output } = hold(values);
  for (let i = 1; i < input.length; i++) {
    const a = input[i - 1] ?? 0;
    const b = input[i] ?? 1;
    if (p <= b) {
      const t = b === a ? 1 : Math.min(1, Math.max(0, (p - a) / (b - a)));
      const e = t * t * (3 - 2 * t);
      const from = output[i - 1] ?? 0;
      return from + ((output[i] ?? from) - from) * e;
    }
  }
  return values[5];
}

interface StepCopy {
  icon: InterfaceLink['icon'];
  lead: string;
  text: string;
}

const STEPS: Six<StepCopy> = [
  {
    icon: 'equipo',
    lead: 'El partido entero, de arriba.',
    text: 'Tablas por partido, por rival, por mes y por competición: puntos, ritmo, cuatro factores, tiros, rebotes y cuartos. Cada tabla se descarga a Excel.',
  },
  {
    icon: 'jugadores',
    lead: 'Cada punto es un jugador.',
    text: 'El plantel completo con sus estadísticas y sus percentiles contra el resto del plantel. Cada jugador tiene su ficha, partido a partido.',
  },
  {
    icon: 'comparar',
    lead: 'Dos jugadores, frente a frente.',
    text: 'Estadística por estadística, en totales o cada 36 minutos, con la media del plantel y la de su posición como referencia.',
  },
  {
    icon: 'situaciones',
    lead: '¿Y si se va al descanso abajo?',
    text: 'Más de cien situaciones de partido: llegar abajo al descanso, meter doce triples, ganar el rebote, jugar de visitante o tener a un jugador cargado de faltas. Cada una contra el promedio de la temporada.',
  },
  {
    icon: 'graficos',
    lead: 'Cada jugada termina en un gráfico.',
    text: '76 gráficos en 13 categorías: forma, puntos y ritmo, cuartos, cuatro factores, tiros, rebote, jugadores, métricas propias y modelos. Todos se exportan como imagen o tabla.',
  },
  {
    icon: 'actualizar',
    lead: 'Vuelta al círculo central.',
    text: 'Los datos se cargan solos el día 1 de cada mes y un botón trae la última carga. Se ve la última actualización, el estado de cada fuente y el historial.',
  },
];

// Cancha FIBA de 15 × 28 m a 36 px por metro, centrada en el lienzo de 680 × 1050 (queda el margen
// del banco a los costados). Aros a 1,575 m del fondo; línea de tres a 6,75 m del aro.
const HOOP_TOP = 77.7;
const HOOP_BOTTOM = 972.3;
const ARC_TOP = 'M102.4 21V128.6A243 243 0 0 0 577.6 128.6V21';
const ARC_BOTTOM = 'M102.4 1029V921.4A243 243 0 0 1 577.6 921.4V1029';

// Cámara por paso: zoom y punto de la cancha que queda en el centro.
const ZOOM: Six<number> = [1, 1.6, 1.9, 1.6, 1.05, 1];
const FOCUS_X: Six<number> = [340, 340, 340, 340, 340, 340];
const FOCUS_Y: Six<number> = [525, 722, 720, 722, 470, 525];

type Pos = readonly [number, number];
interface Player {
  n: number;
  pct: number;
  pos: Six<Pos>;
}
const same = (p: Pos, s3: Pos, s4: Pos): Six<Pos> => [p, p, p, s3, s4, p];

// El equipo propio ataca hacia arriba. Pasos 0 a 2: defensa en su zona. Paso 3: el pivot, con cinco
// faltas, al banco. Paso 4: el equipo ataca el aro de arriba.
const HOME: Player[] = [
  { n: 5, pct: 0.86, pos: same([250, 730], [260, 740], [340, 400]) },
  { n: 7, pct: 0.74, pos: same([430, 730], [420, 740], [545, 290]) },
  { n: 11, pct: 0.62, pos: same([170, 860], [180, 850], [135, 290]) },
  { n: 14, pct: 0.55, pos: same([510, 860], [440, 880], [455, 150]) },
  { n: 21, pct: 0.9, pos: same([340, 905], [340, 905], [265, 170]) },
];
// Índices dentro de HOME: el cargado de faltas del paso 3 y los dos comparados del paso 2.
const FOULED_OUT = 4;
const PAIR = [0, 1];

const RIVAL: Six<Pos>[] = HOME.map(({ pos }) => {
  const [x, y] = pos[0];
  const base: Pos = [680 - x, 1050 - y];
  const deep: Pos = [680 - x, 60 + (1050 - y - 60) * 0.8];
  return same(base, base, deep);
});

// La jugada del paso 4: del base al aro, pasando por el escolta, el ala-pivot y el pivot.
const PLAY = [0, 1, 3, 4].map((i) => HOME[i]?.pos[4] ?? ([340, 525] as const));
const PLAY_PATH = `${PLAY.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${String(x)} ${String(y)}`).join(' ')} L340 ${String(HOOP_TOP)}`;

function Dot({ player, index, progress }: { player: Player; index: number; progress: MotionValue<number> }) {
  const xs = hold(player.pos.map((p) => p[0]) as unknown as Six<number>);
  const ys = hold(player.pos.map((p) => p[1]) as unknown as Six<number>);
  const x = useTransform(progress, xs.input, xs.output);
  const y = useTransform(progress, ys.input, ys.output);
  const paired = PAIR.includes(index);
  const dim = hold<number>(index === FOULED_OUT ? [1, 1, 0.25, 0.14, 1, 1] : [1, 1, paired ? 1 : 0.25, 1, 1, 1]);
  const opacity = useTransform(progress, dim.input, dim.output);
  const grow = hold<number>([1, 1, paired ? 1.45 : 1, 1, 1, 1]);
  const scale = useTransform(progress, grow.input, grow.output);
  const ring = hold<number>([0, 1, paired ? 1 : 0.2, 0.5, 0, 0]);
  const ringOpacity = useTransform(progress, ring.input, ring.output);
  const label = hold<number>([0, 1, 1, 1, 0, 0]);
  const labelOpacity = useTransform(progress, label.input, label.output);
  const c = 2 * Math.PI * 33;
  return (
    <motion.g style={{ x, y, opacity, scale }}>
      <motion.circle
        r={33}
        className="show-pitch__ring"
        strokeDasharray={`${String(c * player.pct)} ${String(c)}`}
        transform="rotate(-90)"
        style={{ opacity: ringOpacity }}
      />
      <circle r={22} className="show-pitch__home" />
      <motion.text className="show-pitch__num" textAnchor="middle" dy="6" style={{ opacity: labelOpacity }}>
        {player.n}
      </motion.text>
    </motion.g>
  );
}

function RivalDot({ pos, progress }: { pos: Six<Pos>; progress: MotionValue<number> }) {
  const xs = hold(pos.map((p) => p[0]) as unknown as Six<number>);
  const ys = hold(pos.map((p) => p[1]) as unknown as Six<number>);
  const x = useTransform(progress, xs.input, xs.output);
  const y = useTransform(progress, ys.input, ys.output);
  const fade = hold<number>([0.55, 0.2, 0.12, 0.3, 0.6, 0.55]);
  const opacity = useTransform(progress, fade.input, fade.output);
  return <motion.circle r={18} className="show-pitch__rival" style={{ x, y, opacity }} />;
}

/** Capa que solo se ve en un paso. */
function Layer({
  step,
  progress,
  children,
}: {
  step: number;
  progress: MotionValue<number>;
  children: React.ReactNode;
}) {
  const values = [0, 0, 0, 0, 0, 0].map((_, i) => (i === step ? 1 : 0)) as unknown as Six<number>;
  const { input, output } = hold(values);
  const opacity = useTransform(progress, input, output);
  return <motion.g style={{ opacity }}>{children}</motion.g>;
}

function Panel({
  index,
  step,
  href,
  label,
  progress,
}: {
  index: number;
  step: StepCopy;
  href: string;
  label: string;
  progress: MotionValue<number>;
}) {
  const from = index / N;
  const to = (index + 1) / N;
  const first = index === 0;
  const last = index === N - 1;
  // Aparece mientras la camara termina de llegar a su paso y se va cuando empieza a irse al siguiente.
  const opacity = useTransform(
    progress,
    [first ? -1 : from, first ? -0.5 : from + H, to - H, last ? 2 : to],
    [0, 1, 1, last ? 1 : 0],
  );
  const y = useTransform(progress, [from, from + H], [first ? 0 : 32, 0]);
  // Los paneles apagados salen del orden de tabulación: el foco nunca cae en un enlace invisible.
  const visibility = useTransform(opacity, (v) => (v > 0.01 ? 'visible' : 'hidden'));
  return (
    <motion.article
      className="show-pitch__panel"
      data-side={index % 2 === 0 ? 'left' : 'right'}
      style={{ opacity, y, visibility }}
    >
      <p className="show-pitch__index tabular">
        {String(index + 1).padStart(2, '0')} · {label}
      </p>
      <h3 className="show-pitch__lead">{step.lead}</h3>
      <p className="show-pitch__text">{step.text}</p>
      <Link href={href} className="show-pitch__go focus-ring" data-cursor="Entrar">
        Entrar a {label}
      </Link>
    </motion.article>
  );
}

export function PitchStory() {
  const ref = useRef<HTMLElement>(null);
  const camera = useRef<SVGGElement>(null);
  const ball = useRef<SVGCircleElement>(null);
  const play = useRef<SVGPathElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const progress = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.7 });
  const playDraw = useTransform(progress, [4 / N + H, 5 / N - H], [0, 1]);

  // Cámara y pelota: se escriben como atributos SVG en cada cambio de progreso, sin re-render.
  useMotionValueEvent(progress, 'change', (p) => {
    const g = camera.current;
    if (g) {
      const s = at(ZOOM, p);
      g.setAttribute(
        'transform',
        `translate(340 525) scale(${s.toFixed(4)}) translate(${(-at(FOCUS_X, p)).toFixed(2)} ${(-at(FOCUS_Y, p)).toFixed(2)})`,
      );
    }
    const b = ball.current;
    const path = play.current;
    if (!b || !path) return;
    const t = Math.min(1, Math.max(0, (p - (4 / N + H)) / (1 / N - 2 * H)));
    const back = Math.min(1, Math.max(0, (p - (5 / N - H)) / (2 * H)));
    const pt = path.getPointAtLength(path.getTotalLength() * t);
    b.setAttribute('cx', String(pt.x + (340 - pt.x) * back));
    b.setAttribute('cy', String(pt.y + (525 - pt.y) * back));
    b.setAttribute('opacity', p > 4 / N ? '1' : '0');
  });

  const byIcon = new Map(INTERFACES.map((i) => [i.icon, i]));

  return (
    <section ref={ref} className="show-pitch show-bleed" aria-labelledby="pitch-title">
      <div className="show-pitch__stage">
        <h2 id="pitch-title" className="sr-only">
          Las seis interfaces
        </h2>
        <div className="show-pitch__panels">
          {STEPS.map((s, i) => {
            const item = byIcon.get(s.icon);
            return (
              <Panel
                key={s.icon}
                index={i}
                step={s}
                href={item?.href ?? '/'}
                label={item?.label ?? ''}
                progress={progress}
              />
            );
          })}
        </div>
        <svg
          viewBox="0 0 680 1050"
          className="show-pitch__board"
          role="img"
          aria-label="Pizarra táctica: la cancha de básquet con los cinco jugadores del equipo y los del rival"
        >
          <g ref={camera}>
            <rect x="0" y="0" width="680" height="1050" className="show-pitch__grass" />
            <Layer step={0} progress={progress}>
              <path d={`${ARC_TOP}Z`} className="show-pitch__zone" style={{ opacity: 0.1 }} />
              <path d={`${ARC_BOTTOM}Z`} className="show-pitch__zone" style={{ opacity: 0.1 }} />
              <rect
                x="251.8"
                y="21"
                width="176.4"
                height="208.8"
                className="show-pitch__zone"
                style={{ opacity: 0.2 }}
              />
              <rect
                x="251.8"
                y="820.2"
                width="176.4"
                height="208.8"
                className="show-pitch__zone"
                style={{ opacity: 0.2 }}
              />
            </Layer>
            <g className="show-pitch__lines">
              <rect x="70" y="21" width="540" height="1008" />
              <line x1="70" x2="610" y1="525" y2="525" />
              <circle cx="340" cy="525" r="64.8" />
              <rect x="251.8" y="21" width="176.4" height="208.8" />
              <rect x="251.8" y="820.2" width="176.4" height="208.8" />
              <path d="M275.2 229.8A64.8 64.8 0 0 0 404.8 229.8" />
              <path d="M275.2 820.2A64.8 64.8 0 0 1 404.8 820.2" />
              <path d={ARC_TOP} />
              <path d={ARC_BOTTOM} />
              <line x1="307.6" x2="372.4" y1="64.2" y2="64.2" />
              <line x1="307.6" x2="372.4" y1="985.8" y2="985.8" />
              <circle cx="340" cy={HOOP_TOP} r="8.3" />
              <circle cx="340" cy={HOOP_BOTTOM} r="8.3" />
            </g>
            <Layer step={2} progress={progress}>
              <line x1="250" x2="430" y1="730" y2="730" className="show-pitch__link" />
              {[0.7, -0.45, 0.3, -0.8, 0.55].map((v, i) => (
                <rect
                  key={i}
                  x={v > 0 ? 340 : 340 + v * 90}
                  y={620 + i * 13}
                  width={Math.abs(v) * 90}
                  height={8}
                  rx={3}
                  className={v > 0 ? 'show-pitch__bar' : 'show-pitch__bar show-pitch__bar--alt'}
                />
              ))}
            </Layer>
            <Layer step={4} progress={progress}>
              <motion.path ref={play} d={PLAY_PATH} className="show-pitch__play" style={{ pathLength: playDraw }} />
              <circle cx="340" cy={HOOP_TOP} r="26" className="show-pitch__xg" />
            </Layer>
            <Layer step={5} progress={progress}>
              {[0, 1, 2].map((i) => (
                <circle
                  key={i}
                  cx="340"
                  cy="525"
                  r="60"
                  className="show-pitch__ripple"
                  style={{ animationDelay: `${String(i * 0.8)}s` }}
                />
              ))}
            </Layer>
            {RIVAL.map((pos, i) => (
              <RivalDot key={i} pos={pos} progress={progress} />
            ))}
            {HOME.map((player, i) => (
              <Dot key={player.n} player={player} index={i} progress={progress} />
            ))}
            <Layer step={3} progress={progress}>
              {/* Las cinco faltas del pivot, como las luces del tablero. */}
              {[0, 1, 2, 3, 4].map((i) => (
                <circle key={i} cx={316 + i * 12} cy="862" r="4.5" className="show-pitch__card" />
              ))}
              <g transform="translate(340 640)">
                <rect x="-70" y="-22" width="140" height="44" rx="10" className="show-pitch__score" />
                <text textAnchor="middle" dy="8" className="show-pitch__score-text">
                  38 – 45
                </text>
              </g>
            </Layer>
            <circle ref={ball} r="9" cx="340" cy="525" className="show-pitch__ball" opacity="0" />
          </g>
        </svg>
      </div>
    </section>
  );
}
