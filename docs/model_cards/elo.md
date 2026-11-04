# Ficha del modelo: Elo de clubes

| Campo | Valor |
|---|---|
| Propósito | Fuerza relativa de cada equipo de la Liga Nacional y probabilidad de victoria antes de cada partido |
| Fórmula | E = 1 / (1 + 10^((R_rival − R_propio − V) / 400)); R_nuevo = R + K × (S − E), con S = 1 si gana y 0 si pierde (en el básquet no hay empates) |
| Parámetros | Inicio 1500, K = 20, V (localía) = 100 (`pipeline/metrics.py`); supuestos de arranque de la sección 6 |
| Datos | Resultados de todos los partidos de la liga (fixture de la LNB), en orden de fecha |
| Supuestos | Todos los equipos arrancan iguales; la localía vale lo mismo en todas las canchas |
| Validación | Pendiente: con 49 partidos de la liga no hay muestra para calibrar K y V ni medir Brier y log-loss (en fútbol, notebook 03). Se hace al cerrar la temporada |
| Límites | Los primeros partidos sirven para que el Elo se acomode; no mira lesiones ni rotaciones |
| Se muestra | Elo del rival y probabilidad previa en Situaciones y en la tabla de la liga, como estimado |
