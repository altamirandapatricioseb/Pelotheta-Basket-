# Auditoría de fuentes (Fase 0)

Sondas reales del 3-nov-2026, con User-Agent identificable (`PelothetaBot/0.1`), pausa de 3 segundos o más entre requests y una o dos requests por endpoint. Temporada vigente de la LNB: **2026-27** (6 partidos de Boca jugados al 28-oct-2026).

## Conclusión

**Sí existe box score por jugador de la LNB en una fuente gratuita: el sitio oficial (`laliganacional.com.ar`).** Además publica play-by-play completo y mapa de tiro **con coordenadas**, así que las estadísticas tácticas de 5.8 y las zonas de tiro son calculables. Es la única fuente con estadísticas de la temporada actual: API-Basketball tiene la cobertura pero su plan gratuito no da acceso a temporadas posteriores a 2024. Las demás fuentes automatizables solo traen marcadores y sirven de validación.

## Resumen por fuente

| Fuente | Acceso | Consultar | Automatizar | Reutilizar en sitio público | Estado en el sistema |
|---|---|---|---|---|---|
| LNB oficial | HTML + 1 endpoint JSON, sin login | Sí | Sí: `robots.txt` permite `/` a `User-agent: *`; no hay página de términos de uso (solo política de privacidad) | Solo derivadas con atribución (ver riesgos) | **Principal**, activa |
| API-Basketball | API con clave gratuita | Sí | Sí (100 req/día) | Según términos de api-sports | **Desactivada**: plan gratis sin acceso a 2026-27 |
| SportScore | API sin clave | Sí | Sí (≈10.000 req/día por IP, 15 req/s) | Sí, con enlace visible «Powered by SportScore»; no redistribuir datasets en bloque | Validación de marcadores, activa |
| TheSportsDB | API, clave de prueba `123` | Sí | Sí, solo la API (no el sitio) | Sí para sitio web no comercial | Validación de marcadores, activa |
| Sofascore | Endpoints no oficiales | Sí | Sus términos lo limitan | No | Desactivada (decisión del dueño, regla del prompt) |
| FIBA.basketball | HTML | Sí | No: el pie prohíbe duplicar o redistribuir | No | Solo chequeo manual |
| 365Scores, Proballers, RealGM, Latinbasket, TeamKeys | No sondeadas | — | — | — | Sin verificar; solo contraste manual |
| Basketball-Reference | — | — | No (pide no armar sitios con sus datos) | No | Solo glosario de fórmulas |
| Wikipedia y Wikidata | API abierta | Sí | Sí | Sí, citando (CC BY-SA) | Apoyo: fecha de nacimiento y altura |

## LNB oficial: lo que devuelve de verdad

**`robots.txt`** (gestionado por Cloudflare): `User-agent: *` → `Allow: /`, con `Content-Signal: search=yes, ai-train=no, use=reference`. Bloquea por nombre a crawlers de entrenamiento de IA (GPTBot, ClaudeBot, CCBot y otros). El pipeline no entrena modelos ni es uno de esos agentes, y usa su propio User-Agent. Nada prohíbe una consulta mensual cacheada.

**Fixture (JSON):** `GET /api/fixture/laliga?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD` → `{"partidos": [...], "total": n}`. Cada partido trae `idPartido` (cadena opaca), `fecha` (`dd/mm/aaaa hh:mm`, hora argentina), equipos con `idEquipo*`, `idClub*` y `*Ruta`, y `resultadoLocal` / `resultadoVisitante`. Boca: `idClub = 19`, `idEquipo = 114735`, ruta `boca`. Del 1-oct al 3-nov-2026: 48 partidos de la liga, 6 de Boca.

**Página de partido (HTML, ≈1,3 MB):** `/laliga/partido/{idPartido}/{local}-vs-{visitante}`. Probado con Boca 95-83 Regatas (28-oct-2026):

| Bloque | Formato | Campos verificados |
|---|---|---|
| Box score (2 tablas, una por equipo) | `<table>` HTML | dorsal, titular (`*`), nombre, minutos (`mm:ss`), puntos, 2P C/I y %, 3P C/I y %, TL C/I y %, rebotes defensivos, ofensivos y totales, asistencias, recuperaciones, pérdidas, tapones dados y recibidos, faltas cometidas y recibidas, valoración, +/− |
| Parciales por cuarto | JSON embebido (`periodos`) | puntos por cuarto de cada equipo |
| Planteles del partido | JSON embebido (`jugadoresLocales`, `jugadoresVisitantes`) | `componente_id` (id estable del jugador), nombre, dorsal |
| Mapa de tiro | JSON embebido (`tiros`, 137 tiros) | equipo, jugador, cuarto, tipo (`TIRO2/3-METIDO/FALLADO`), `posicion_x` y `posicion_y` en %, `zona` (`Z1`…`Z14` con lado) |
| Zonas por jugador | JSON embebido (`tirosZonaLocal`, `tirosZonaVisitante`) | tiros metidos, fallados y totales por zona, dorsal y cuarto |
| Play-by-play | `<li class="accion {local|visitante} {TIPO}">` HTML, 624 eventos | tipo, jugador, dorsal, cuarto, reloj (`hh:mm:ss` en cuenta regresiva), marcador corrido en las canastas, orden (`accion-N`) |

Tipos de evento vistos: `INICIO/FINAL-PARTIDO`, `INICIO/FINAL-PERIODO`, `CANASTA-1P/2P/3P`, `TIRO1/2/3-FALLADO`, `1-TIRO-LIBRE`, `2-TIROS-LIBRES`, `REBOTE-OFENSIVO/DEFENSIVO`, `ASISTENCIA`, `RECUPERACION`, `PERDIDA`, `TAPON-COMETIDO/RECIBIDO`, `FALTA-COMETIDA/RECIBIDA`, `CAMBIO-JUGADOR-ENTRA/SALE`, `TIEMPO-MUERTO-SOLICITADO` (con equipo: sí se sabe quién lo pidió), `FLECHA-ALTERNANCIA-LOCAL/VISITANTE`.

**Detalles técnicos para el adaptador:**
- La página es UTF-8 (cabecera y `<meta charset>`); en el JSON embebido los acentos llegan escapados (`ACUÑA`), así que se decodifica con `json` y no con expresiones regulares.
- El orden del play-by-play viene en el número `accion-N` (creciente), así que no hace falta invertir la lista para desempatar eventos del mismo segundo.
- No hay JSON para el box score ni para el play-by-play: se parsea HTML. Es el mayor riesgo de mantenimiento (cambio de maquetación). Mitigación: tests con páginas guardadas y validación del box score contra el play-by-play (5.8).
- Hay un handler `?handler=Recargar` (refresco en vivo); el pipeline no lo usa.

**Riesgo legal (sin cambios respecto del prompt):** según la prensa del sector, Genius Sports captura y comercializa estos datos (FIBA LiveStats) con un acuerdo exclusivo con la ADC. Por eso el sitio muestra solo estadísticas derivadas con atribución a la LNB, **no republica el play-by-play crudo** y el dueño puede pedir autorización escrita a la ADC (Av. Belgrano 1354, CABA, dueña del sitio según su política de privacidad).

## Fuentes de validación

- **SportScore:** cubre la LNB (`competition = "Argentinian Liga Nacional de Bosquetbol"`, equipo `boca-juniors`). El detalle de partido devuelve marcador y estado; `stats`, `incidents` y `lineups` llegan vacíos para la LNB. Sirve para validar marcadores. Exige el enlace «Powered by SportScore» en las páginas que usen sus datos.
- **TheSportsDB:** equipo 139585 = Boca Juniors, liga «Argentine LNB». Con la clave de prueba `eventslast` devuelve un solo partido (27-sep-2026, Intercontinental Cup, 93-62). Sirve como respaldo de resultados de otras competiciones.
- **API-Basketball:** la liga 18 («Liga A», Argentina) declara `statistics.players = true` para 2023-24, 2024-25, 2025-26 y 2026-27, pero el plan gratuito responde `Free plans do not have access to this season, try from 2022 to 2024`. Queda desactivada; se puede usar para backfill histórico de 2022-24 si el dueño lo pide.

## Dato crudo mínimo → qué se deriva (regla 8e)

| Dato crudo | Fuente | Qué se deriva | Si cae la fuente |
|---|---|---|---|
| Resultados y fechas de todos los partidos de la liga | LNB fixture JSON (validan SportScore y TheSportsDB) | Tabla, posiciones por fecha, rachas, local/visitante, pitagórico, MOV, SOS, SRS, GB, Elo, probabilidad pre-partido, sorpresas, descanso | Se mantiene con SportScore |
| Box score por jugador de cada partido | LNB HTML | Todos los totales y promedios, porcentajes, eFG%, TS%, tasas (USG%, AST%, ORB%…), Game Score, PIE, DD/TD, por 36/40, posesiones estimadas, ORtg/DRtg/NRtg de equipo, cuatro factores, PER/WS/BPM aproximados (con box score de toda la liga), consistencia, dependencia, banca, rotación, métricas de 6.1 | **Todo lo individual queda `n/d`**; respaldo: `data/manual/` |
| Parciales por cuarto | LNB JSON embebido | Rendimiento por cuarto, remontadas | `n/d` |
| Play-by-play | LNB HTML | Posesiones reales, ritmo, inicio de posesión y PPP, segunda oportunidad, ataque rápido (estimado), origen de puntos, quintetos/tríos/duplas, On/Off, NR/EWA/ELA individuales, rotación, tiempos muertos, corridas, bonus, clutch por minutos | **Sección 5.8 y métricas individuales de impacto `n/d`** |
| Coordenadas y zona de cada tiro | LNB JSON embebido | Zonas de tiro, efectividad por zona contra la liga, puntos esperados por tiro (estimado), puntos en la pintura | `n/d` |
| Fecha de nacimiento y altura | Wikipedia/Wikidata (verificar) | Edad a la fecha del partido, tramos de edad, quintetos grandes y chicos, Potencial | `n/d` en lo que dependa de edad o altura |

## Tamaño estimado

Un partido ≈ 620 eventos de play-by-play, ≈ 140 tiros y ≈ 24 filas de box score. Si se guarda toda la liga (≈ 380 partidos por temporada): ≈ 240.000 eventos y ≈ 53.000 tiros, del orden de 50 MB con índices. Entra en los 500 MB; si crece, se guarda el play-by-play solo de los partidos de Boca y agregados del resto (el crudo queda en `data/raw` con su hash).

## Pendientes

- Confirmar que los partidos de la Supercopa y de la BCL Americas tengan página en el mismo sitio (otra `delegacionKey`) o queden solo con resultados.
- Fecha de inicio exacta de la temporada 2026-27 para el backfill del fixture.
- Sondear 365Scores y Latinbasket solo si hace falta contrastar algo puntual.
