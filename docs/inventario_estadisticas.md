# Inventario de estadísticas

Generado por `scripts/inventario.py` a partir de `data/stat_catalog.csv` y de la lista de
pedidas que
todavía no están en el catálogo. Sobre las estadísticas **pedidas por el prompt**:

| Estado | Cantidad | % de las pedidas |
|---|---|---|
| cruda | 33 | 15,6 % |
| calculada | 146 | 68,9 % |
| falta calcular | 20 | 9,4 % |
| esperando datos | 7 | 3,3 % |
| nivel C | 6 | 2,8 % |
| **Total pedidas** | **212** | 100 % |

Con datos hoy: **179 de 212 (84,4 %)**. Calculables con los datos que ya hay
pero sin implementar: 20.
Agregadas por iniciativa propia (fuera de la cuenta):
9.

## Pedidas que todavía no están en el catálogo

| Estadística | Sección | Estado | Por qué |
|---|---|---|---|
| ORtg individual (Oliver) | 5.1 | falta calcular | fórmula larga del glosario |
| DRtg individual (Oliver) | 5.1 | falta calcular | fórmula larga del glosario |
| Stops | 5.1 | falta calcular | depende del DRtg individual |
| Points Produced | 5.1 | falta calcular | depende del ORtg individual |
| OWS, DWS y WS/48 | 5.1 | falta calcular | dependen de ORtg y DRtg individuales |
| OBPM y DBPM | 5.1 | falta calcular | coeficientes de BPM 2.0 |
| VORP | 5.1 | falta calcular | depende del BPM |
| Descalificaciones | 5.1 | nivel C | la fuente no las informa por separado |
| Faltas técnicas | 5.1 | nivel C | la fuente no las informa por separado |
| Posición por fecha (evolución) | 5.2 | falta calcular | resultados ya cargados |
| Totales del equipo por partido (tiros, rebotes, asistencias...) | 5.2 | falta calcular | box score del equipo |
| Por competición (BCL Américas, Supercopa) | 5.2 | esperando datos | sin fuente automatizable |
| Playoffs por separado | 5.2 | esperando datos | la temporada no llegó a playoffs |
| Árbitros | 5.3 | esperando datos | falta confirmar si la LNB los publica |
| Jugadores destacados del partido | 5.4 | falta calcular | Game Score por partido |
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
