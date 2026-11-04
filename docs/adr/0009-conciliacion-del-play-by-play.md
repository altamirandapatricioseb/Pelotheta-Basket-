# ADR 0009: conciliar el play-by-play con el box score antes de publicar tácticas

- Estado: aceptada (3-nov-2026, etapa 4)

## Contexto
Las estadísticas tácticas (5.8: quintetos, On/Off, NR individual, posesiones reales, clutch) salen
del play-by-play, que la LNB carga a mano en vivo y a veces trae eventos de más o de menos.

## Decisión
El pipeline reconstruye cada partido desde el play-by-play y lo compara con el box score oficial:
marcador final, totales por jugador, minutos y +/−. Si algo no cuadra, el partido va a cuarentena y
sus tácticas quedan en `n/d`; el box score del partido se usa igual. Lo de nivel C no se inventa.

## Consecuencias
- Las tácticas que se publican están verificadas contra la planilla oficial.
- Un partido en cuarentena baja la muestra de las tácticas; la web lo muestra como `n/d`.
