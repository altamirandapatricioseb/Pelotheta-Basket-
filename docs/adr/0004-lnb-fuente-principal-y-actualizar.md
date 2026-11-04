# ADR 0004: Liga Nacional como fuente principal y «Actualizar» de solo lectura

- Estado: aceptada (3-nov-2026, cierre de la Fase 0)

## Contexto
- La Fase 0 (`docs/source_audit.md`) buscó box score por jugador de la LNB en fuentes gratuitas.
- laliganacional.com.ar permite todo en `robots.txt`, no publica términos de uso y trae, por partido,
  box score por jugador, parciales por cuarto, planteles con id estable, mapa de tiros con zona y el
  play-by-play completo.
- API-Basketball (plan gratuito) no cubre la temporada 2026-27; FIBA prohíbe duplicar o redistribuir;
  Sofascore limita el uso automatizado.

## Decisión
1. **Fuente principal:** la LNB, solo páginas públicas, con un cliente educado (pausa entre pedidos,
   User-Agent identificable, caché: un partido terminado se baja una sola vez). Se baja **toda la
   liga** (no solo Boca): el PER, los percentiles del índice y la tabla necesitan los demás equipos.
2. **Validación:** SportScore y TheSportsDB para los marcadores; el play-by-play reconstruido se
   concilia con el box score y los partidos que no cuadran van a cuarentena (5.8).
3. **Publicación:** solo estadísticas derivadas con atribución. El play-by-play crudo y las
   coordenadas de los tiros quedan en tablas sin acceso público.
4. **Interfaz 6 «Actualizar»:** muestra la fecha y hora de la última carga y su historial
   (`ingest_log`), y el botón **solo consulta** si hay una carga nueva (`/api/ultima-actualizacion`):
   no escribe en la base ni usa claves de escritura. La carga la hace el workflow mensual o el dueño
   desde Actions.

## Consecuencias
- Sin token de GitHub en la web: no hay superficie para disparar corridas en cadena.
- Si la LNB cambia su HTML, el adaptador falla con un error claro en `ingest_log` y la web sigue con
  lo último cargado.
