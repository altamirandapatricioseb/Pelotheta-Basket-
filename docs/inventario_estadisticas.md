# Inventario de estadísticas

Generado por `scripts/inventario.py` a partir de `data/stat_catalog.csv` y de la lista de
pedidas que
todavía no están en el catálogo. Sobre las estadísticas **pedidas por el prompt**:

| Estado | Cantidad | % de las pedidas |
|---|---|---|
| cruda | 16 | 9,0 % |
| calculada | 105 | 59,3 % |
| falta calcular | 43 | 24,3 % |
| esperando datos | 7 | 4,0 % |
| nivel C | 6 | 3,4 % |
| **Total pedidas** | **177** | 100 % |

Con datos hoy: **121 de 177 (68,4 %)**. Calculables con los datos que ya hay
pero sin implementar: 43.
Agregadas por iniciativa propia (fuera de la cuenta):
9.

## Pedidas que todavía no están en el catálogo

| Estadística | Sección | Estado | Por qué |
|---|---|---|---|
| Partidos como suplente | 5.1 | falta calcular | PJ − titularidades |
| Tiros de campo convertidos e intentados | 5.1 | falta calcular | totales ya en el box score |
| Dobles convertidos e intentados | 5.1 | falta calcular | totales ya en el box score |
| Triples convertidos e intentados | 5.1 | falta calcular | totales ya en el box score |
| Libres convertidos e intentados | 5.1 | falta calcular | totales ya en el box score |
| Faltas recibidas | 5.1 | falta calcular | ya en el box score |
| Faltas por partido | 5.1 | falta calcular | PF / PJ |
| Valores por 100 posesiones | 5.1 | falta calcular | posesiones en cancha ya calculadas |
| Nacionalidad y condición de extranjero | 5.1 | falta calcular | Wikipedia la trae |
| ORtg individual (Oliver) | 5.1 | falta calcular | fórmula larga del glosario |
| DRtg individual (Oliver) | 5.1 | falta calcular | fórmula larga del glosario |
| Stops | 5.1 | falta calcular | depende del DRtg individual |
| Points Produced | 5.1 | falta calcular | depende del ORtg individual |
| OWS, DWS y WS/48 | 5.1 | falta calcular | dependen de ORtg y DRtg individuales |
| OBPM y DBPM | 5.1 | falta calcular | coeficientes de BPM 2.0 |
| VORP | 5.1 | falta calcular | depende del BPM |
| Descalificaciones | 5.1 | nivel C | la fuente no las informa por separado |
| Faltas técnicas | 5.1 | nivel C | la fuente no las informa por separado |
| Rendimiento por cuarto | 5.2 | falta calcular | parciales ya cargados |
| Posición por fecha (evolución) | 5.2 | falta calcular | resultados ya cargados |
| Totales del equipo por partido (tiros, rebotes, asistencias...) | 5.2 | falta calcular | box score del equipo |
| FTr y DRB% del equipo | 5.2 | falta calcular | box score del equipo ya cargado |
| Por competición (BCL Américas, Supercopa) | 5.2 | esperando datos | sin fuente automatizable |
| Playoffs por separado | 5.2 | esperando datos | la temporada no llegó a playoffs |
| Forma reciente (últimos 5) | 5.3 | falta calcular | resultados ya cargados |
| Líderes de la liga por categoría | 5.3 | falta calcular | box scores de toda la liga ya cargados |
| Árbitros | 5.3 | esperando datos | falta confirmar si la LNB los publica |
| Jugadores destacados del partido | 5.4 | falta calcular | Game Score por partido |
| Comparación con los últimos 5 partidos | 5.4 | falta calcular | valores por partido |
| Minutos acumulados en 7, 14 y 28 días | 5.6 | falta calcular | minutos y fechas ya cargados |
| Rendimiento por nivel de rival | 5.7 | falta calcular | tabla y Elo ya calculados |
| Sorpresas (upsets) | 5.7 | falta calcular | probabilidad Elo ya calculada |
| Posesiones extra | 5.7 | falta calcular | ORB, robos y pérdidas ya cargados |
| Cobertura de datos por fuente | 5.7 | falta calcular | datos en last_run.json |
| Ventaja de localía de cada equipo | 5.7 | falta calcular | resultados ya cargados |
| Estabilidad del quinteto titular (Jaccard) | 5.7 | falta calcular | titulares ya cargados |
| Minutos por tramo de edad | 5.7 | falta calcular | edades de Wikipedia ya cargadas |
| Rachas de doble-doble y de 40 % en triples | 5.7 | falta calcular | box score por partido |
| Temporada actual frente a la anterior | 5.7 | esperando datos | falta cargar 2025-26 |
| Inicio de posesión y puntos por posesión | 5.8 | falta calcular | play-by-play validado |
| Puntos tras robo y tras pérdida rival | 5.8 | falta calcular | play-by-play validado |
| Ataque rápido (estimado) | 5.8 | falta calcular | play-by-play validado |
| Zonas de tiro y puntos esperados | 5.8 | falta calcular | 796 tiros de Boca con zona ya cargados |
| Tríos y duplas | 5.8 | falta calcular | tramos de cancha ya reconstruidos |
| Rotación (primer cambio, cambios por cuarto) | 5.8 | falta calcular | play-by-play validado |
| Puntos por posesión alrededor de los tiempos muertos | 5.8 | falta calcular | play-by-play validado |
| Faltas y bonus | 5.8 | esperando datos | la fuente omite algunas faltas en las jugadas |
| Estilo táctico frente a la liga (percentiles) | 5.8 | falta calcular | 38 play-by-play de la liga validados |
