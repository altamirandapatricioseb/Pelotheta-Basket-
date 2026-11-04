# Visión del producto (16.8)

**Problema.** Los datos de Boca básquet están en las planillas de cada partido de la Liga Nacional: se
puede ver un box score, pero no mirar una estadística en el tiempo, compararla contra el plantel o saber
cuándo un número es confiable. Los análisis avanzados (posesiones, ratings, quintetos, On/Off) no están
publicados para la LNB.

**Usuarios.**

| Persona | Quiere | Usa |
|---|---|---|
| Hincha analítico | Entender por qué Boca gana o pierde, más allá del resultado | Gráficos, Situaciones, estadística desglosada |
| Periodista deportivo | Un dato verificable, con fuente y fecha, para una nota | Tablas, «Ver origen de los datos», Excel |
| Reclutador técnico | Ver cómo trabaja quien hizo el sistema | La documentación, la seguridad, el pipeline y el sistema hermano de fútbol |

**Propuesta de valor.** Toda la temporada de Boca en la LNB en un solo lugar, con cada número explicado
(fuente, nivel A, B o C, si es estimado) y rastreable hasta el partido que lo origina, gratis, sin cuentas
y con la misma experiencia que Pelotheta fútbol.

**Qué no es.** No es un sitio de apuestas ni de pronósticos, no tiene cuentas de usuario ni comentarios y
no cubre otros equipos más que como rivales.

## KPIs de producto (4-nov-2026)

| KPI | Meta | Valor |
|---|---|---|
| Estadísticas con datos | ≥ 90 % del catálogo | 267 de 275 (97 %) |
| Gráficos con datos | ≥ 90 % | 73 de 76 (96 %) |
| Tarjetas de situaciones con datos de entrada | ≥ 90 % | 112 de 118 (95 %); 107 ya tienen casos |
| Valores `n/d` en la tabla del plantel | ≤ 10 % | 6,5 % (muestra pequeña al principio de la temporada) |
| Frescura de los partidos | ≤ 35 días | 7 días (último partido el 28-oct) |
| Tamaño de la base | ≤ 400 MB | 24 MB |

## Backlog priorizado (MoSCoW)

| Prioridad | Ítem | Estimación |
|---|---|---|
| Must | Correr el workflow mensual con datos nuevos y verificar Situaciones y Comparar con más jugadores | 0,5 días |
| Must | Notebooks de calibración del Elo y backtesting de 6.1 al cerrar la temporada (16.3) | 2 días, en 2027 |
| Should | Página `/estado` como la de fútbol (corridas, fuentes y KPIs en vivo) | 1 día |
| Should | Fuente para BCL y Liga Sudamericana si aparece una con permiso | 2 días |
| Could | Regresión visual con Playwright, como fútbol | 0,5 días |
| Won't | Cuentas de usuario, comentarios, otros equipos | — |

## Hoja de ruta

| Cuándo | Qué |
|---|---|
| Noviembre de 2026 | Cierre de la etapa 11 y primera carga mensual automática |
| Diciembre de 2026 | Revisión de las métricas con la primera mitad de la fase regular |
| Mayo de 2027 | Cierre de la temporada: notebooks, calibración y backup con datos completos |
| Febrero de 2027 | Revisión trimestral de accesos |
