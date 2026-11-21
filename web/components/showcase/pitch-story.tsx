'use client';

// Las diez interfaces contadas sobre una pizarra táctica. La sección queda pegada (100 vh por paso
// en escritorio, 80 en el celular): la cancha de básquet (vista desde arriba, vertical) va en el
// centro y la cámara se mueve con el scroll. Partido entero (Equipo), los cinco puntos (Jugadores),
// dos aislados (Comparar), uno y sus parecidos del rival (Alternativas), la línea real contra
// esperado (Valor), uno cargado de faltas (Situaciones), la barra de probabilidades (Predictor),
// una jugada hasta el aro (Gráficos), el mercado con la mira del ojeador (Ojeador) y vuelta al círculo central (Actualizar). El texto cambia de
// lado en cada paso; en el celular va debajo de la cancha.

import { motion, type MotionValue, useMotionValueEvent, useScroll, useSpring, useTransform } from 'motion/react';
import Link from 'next/link';
import { useRef } from 'react';

import { INTERFACES, type InterfaceLink } from '@/config/navigation';

/** Entrada y salida para useTransform: cada valor se mantiene en su paso y cambia en la frontera. */
function hold<T>(values: readonly T[]): { input: number[]; output: T[] } {
  const input = [0];
  const output: T[] = [values[0] as T];
  values.slice(1).forEach((v, i) => {
    const k = i + 1;
    input.push(k / N - H, k / N + H);
    output.push(values[i] as T, v);
  });
  input.push(1);
  output.push(values[N - 1] as T);
  return { input, output };
}

/** Lo mismo que `hold`, evaluado a mano (para la cámara, que se escribe como atributo SVG). */
function at(values: readonly number[], p: number): number {
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
  return values[N - 1] ?? 0;
}

interface StepCopy {
  icon: InterfaceLink['icon'];
  lead: string;
  text: string;
}

const STEPS: readonly StepCopy[] = [
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
    icon: 'alternativas',
    lead: 'Si se va, ¿quién se le parece?',
    text: 'Para cada jugador, los más parecidos de toda la Liga Nacional con K-means: uno de otro club, una dupla o un compañero, del mejor al peor, con su comparación completa.',
  },
  {
    icon: 'valor',
    lead: '¿Juega lo que vale su juego?',
    text: 'Los minutos que le da el entrenador contra los que su producción justifica, con una regresión lineal entrenada con toda la liga. Abajo de la línea, el «barato» de Moneyball.',
  },
  {
    icon: 'situaciones',
    lead: '¿Y si se va al descanso abajo?',
    text: 'Más de cien situaciones de partido: llegar abajo al descanso, meter doce triples, ganar el rebote, jugar de visitante o tener a un jugador cargado de faltas. Cada una contra el promedio de la temporada.',
  },
  {
    icon: 'predictor',
    lead: 'El próximo partido, en porcentajes.',
    text: 'Probabilidad de ganar contra cualquier rival de la zona o la media de una liga, con los puntos esperados, el ritmo y los cuatro factores, y un backtest de cuánto acierta.',
  },
  {
    icon: 'graficos',
    lead: 'Cada jugada termina en un gráfico.',
    text: '79 gráficos en 13 categorías: forma, puntos y ritmo, cuartos, cuatro factores, tiros, rebote, jugadores, métricas propias y modelos. Todos se exportan como imagen o tabla.',
  },
  {
    icon: 'ojeador',
    lead: '¿A quién vamos a buscar?',
    text: 'Informes como los de un ojeador, con nota de 0 a 10: qué zona le falta al plantel (profundidad, nivel contra la liga y edad), oportunidades que su club casi no usa y jóvenes promesas de otros clubes, con lo mejor en verde y lo peor en rojo.',
  },
  {
    icon: 'actualizar',
    lead: 'Vuelta al círculo central.',
    text: 'Los datos se cargan solos el día 1 de cada mes y un botón trae la última carga, con los tres modelos vueltos a entrenar. Se ve la última actualización, el estado de cada fuente y el historial.',
  },
];

const N = STEPS.length;
/** Medio ancho de la transición alrededor de cada frontera entre pasos (en progreso 0 a 1). */
const H = 0.028;
const stepOf = (icon: InterfaceLink['icon']) => STEPS.findIndex((s) => s.icon === icon);
const RED = stepOf('situaciones');
const GRAF = stepOf('graficos');
const SCOUT = stepOf('ojeador');

/** Un valor por paso: el de base, salvo en los pasos que se nombran. */
function per<T>(base: T, overrides: Partial<Record<InterfaceLink['icon'], T>>): T[] {
  return STEPS.map((s) => overrides[s.icon] ?? base);
}

// Cancha FIBA de 15 × 28 m a 36 px por metro, centrada en el lienzo de 680 × 1050 (queda el margen
// del banco a los costados). Aros a 1,575 m del fondo; línea de tres a 6,75 m del aro.
const HOOP_TOP = 77.7;
const HOOP_BOTTOM = 972.3;
const ARC_TOP = 'M102.4 21V128.6A243 243 0 0 0 577.6 128.6V21';
const ARC_BOTTOM = 'M102.4 1029V921.4A243 243 0 0 1 577.6 921.4V1029';

// Cámara por paso: zoom y punto de la cancha que queda en el centro.
const ZOOM = per(1, {
  jugadores: 1.6,
  comparar: 1.9,
  alternativas: 1.35,
  valor: 1.25,
  situaciones: 1.6,
  predictor: 1.15,
  graficos: 1.05,
  ojeador: 1.3,
});
const FOCUS_X = per(340, {});
const FOCUS_Y = per(525, {
  jugadores: 722,
  comparar: 720,
  alternativas: 600,
  valor: 640,
  situaciones: 722,
  graficos: 470,
  ojeador: 330,
});

type Pos = readonly [number, number];
interface Player {
  n: number;
  pct: number;
  pos: Pos[];
}
// Tres formas del equipo: la base, con el pivot en el banco (Situaciones) y atacando (Gráficos).
const same = (p: Pos, red: Pos, attack: Pos): Pos[] => STEPS.map((_, i) => (i === RED ? red : i === GRAF ? attack : p));

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
// Índices dentro de RIVAL que mira el Ojeador, con la nota de su informe (ilustrativa) y su color.
const SCOUTED = [
  { i: 0, score: '8,1', tone: 'show-pitch__grade--good' },
  { i: 2, score: '6,4', tone: 'show-pitch__grade--mid' },
  { i: 3, score: '4,2', tone: 'show-pitch__grade--bad' },
];

const RIVAL: Pos[][] = HOME.map(({ pos }) => {
  const [x, y] = pos[0] ?? [340, 525];
  const base: Pos = [680 - x, 1050 - y];
  const deep: Pos = [680 - x, 60 + (1050 - y - 60) * 0.8];
  return same(base, base, deep);
});

// La jugada del paso 4: del base al aro, pasando por el escolta, el ala-pivot y el pivot.
const PLAY = [0, 1, 3, 4].map((i) => HOME[i]?.pos[GRAF] ?? ([340, 525] as const));
const PLAY_PATH = `${PLAY.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${String(x)} ${String(y)}`).join(' ')} L340 ${String(HOOP_TOP)}`;

function Dot({ player, index, progress }: { player: Player; index: number; progress: MotionValue<number> }) {
  const xs = hold(player.pos.map((p) => p[0]));
  const ys = hold(player.pos.map((p) => p[1]));
  const x = useTransform(progress, xs.input, xs.output);
  const y = useTransform(progress, ys.input, ys.output);
  const paired = PAIR.includes(index);
  const target = index === PAIR[0];
  const dim = hold(
    index === FOULED_OUT
      ? per(1, { comparar: 0.25, alternativas: 0.25, situaciones: 0.14, ojeador: 0.2 })
      : per(1, { comparar: paired ? 1 : 0.25, alternativas: target ? 1 : 0.25, ojeador: 0.2 }),
  );
  const opacity = useTransform(progress, dim.input, dim.output);
  const grow = hold(per(1, { comparar: paired ? 1.45 : 1, alternativas: target ? 1.45 : 1 }));
  const scale = useTransform(progress, grow.input, grow.output);
  const ring = hold(
    per(0, { jugadores: 1, comparar: paired ? 1 : 0.2, alternativas: target ? 1 : 0, valor: 1, situaciones: 0.5 }),
  );
  const ringOpacity = useTransform(progress, ring.input, ring.output);
  const label = hold(per(0, { jugadores: 1, comparar: 1, alternativas: 1, valor: 1, situaciones: 1 }));
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

function RivalDot({ pos, index, progress }: { pos: Pos[]; index: number; progress: MotionValue<number> }) {
  const xs = hold(pos.map((p) => p[0]));
  const ys = hold(pos.map((p) => p[1]));
  const x = useTransform(progress, xs.input, xs.output);
  const y = useTransform(progress, ys.input, ys.output);
  const scouted = SCOUTED.some((s) => s.i === index);
  const fade = hold(
    per(0.55, {
      jugadores: 0.2,
      comparar: 0.12,
      alternativas: 0.7,
      valor: 0.2,
      situaciones: 0.3,
      predictor: 0.45,
      graficos: 0.6,
      ojeador: scouted ? 1 : 0.15,
    }),
  );
  const opacity = useTransform(progress, fade.input, fade.output);
  const grow = hold(per(1, { ojeador: scouted ? 1.3 : 1 }));
  const scale = useTransform(progress, grow.input, grow.output);
  return <motion.circle r={18} className="show-pitch__rival" style={{ x, y, opacity, scale }} />;
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
  const { input, output } = hold(STEPS.map((_, i) => (i === step ? 1 : 0)));
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
  const playDraw = useTransform(progress, [GRAF / N + H, (GRAF + 1) / N - H], [0, 1]);

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
    const t = Math.min(1, Math.max(0, (p - (GRAF / N + H)) / (1 / N - 2 * H)));
    const back = Math.min(1, Math.max(0, (p - ((GRAF + 1) / N - H)) / (2 * H)));
    const pt = path.getPointAtLength(path.getTotalLength() * t);
    b.setAttribute('cx', String(pt.x + (340 - pt.x) * back));
    b.setAttribute('cy', String(pt.y + (525 - pt.y) * back));
    b.setAttribute('opacity', p > GRAF / N && p < (GRAF + 1) / N + H ? '1' : '0');
  });

  const byIcon = new Map(INTERFACES.map((i) => [i.icon, i]));

  return (
    <section ref={ref} className="show-pitch show-bleed" aria-labelledby="pitch-title">
      <div className="show-pitch__stage">
        <h2 id="pitch-title" className="sr-only">
          Las diez interfaces
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
            <Layer step={stepOf('equipo')} progress={progress}>
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
            <Layer step={stepOf('alternativas')} progress={progress}>
              {/* Del jugador elegido a los rivales que más se le parecen. */}
              {[0, 2, 1].map((j, i) => (
                <line
                  key={j}
                  x1="250"
                  y1="730"
                  x2={RIVAL[j]?.[0]?.[0] ?? 340}
                  y2={RIVAL[j]?.[0]?.[1] ?? 300}
                  className="show-pitch__link"
                  style={{ opacity: 1 - i * 0.3 }}
                />
              ))}
            </Layer>
            <Layer step={stepOf('valor')} progress={progress}>
              <line x1="120" y1="900" x2="560" y2="460" className="show-pitch__link" />
            </Layer>
            <Layer step={stepOf('predictor')} progress={progress}>
              <g transform="translate(340 525)">
                <rect x="-210" y="-26" width="294" height="52" rx="10" className="show-pitch__bar" />
                <rect x="84" y="-26" width="126" height="52" rx="10" className="show-pitch__bar show-pitch__bar--alt" />
                <text x="-63" textAnchor="middle" dy="8" className="show-pitch__odds">
                  70 %
                </text>
                <text x="147" textAnchor="middle" dy="8" className="show-pitch__odds">
                  30 %
                </text>
              </g>
            </Layer>
            <Layer step={stepOf('comparar')} progress={progress}>
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
            <Layer step={GRAF} progress={progress}>
              <motion.path ref={play} d={PLAY_PATH} className="show-pitch__play" style={{ pathLength: playDraw }} />
              <circle cx="340" cy={HOOP_TOP} r="26" className="show-pitch__xg" />
            </Layer>
            <Layer step={SCOUT} progress={progress}>
              {SCOUTED.map(({ i, score, tone }, k) => {
                const [x, y] = RIVAL[i]?.[SCOUT] ?? [340, 525];
                return (
                  <g key={i} transform={`translate(${String(x)} ${String(y)})`}>
                    <circle r="34" className="show-pitch__scope" style={{ animationDelay: `${String(k * -1.5)}s` }} />
                    <line x1="-46" x2="-30" className="show-pitch__scope-tick" />
                    <line x1="30" x2="46" className="show-pitch__scope-tick" />
                    <line y1="-46" y2="-30" className="show-pitch__scope-tick" />
                    <line y1="30" y2="46" className="show-pitch__scope-tick" />
                    <g transform="translate(0 -66)">
                      <rect x="-34" y="-18" width="68" height="36" rx="9" className={`show-pitch__grade ${tone}`} />
                      <text textAnchor="middle" dy="7" className="show-pitch__grade-text">
                        {score}
                      </text>
                    </g>
                  </g>
                );
              })}
            </Layer>
            <Layer step={stepOf('actualizar')} progress={progress}>
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
              <RivalDot key={i} pos={pos} index={i} progress={progress} />
            ))}
            {HOME.map((player, i) => (
              <Dot key={player.n} player={player} index={i} progress={progress} />
            ))}
            <Layer step={RED} progress={progress}>
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
