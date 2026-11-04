# Changelog

Formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado semántico. Commits en
Conventional Commits.

## [1.0.0] - 2026-11-04

Primera versión completa: las 11 etapas del pedido, como sistema hermano de Pelotheta fútbol.

### Agregado
- **Etapa 11:** documentación de la sección 15 (DER, diccionario generado, casos de uso, flujos,
  secuencias, arquitectura y red, Gantt, manuales, requisitos y trazabilidad, matriz de pruebas, ADR,
  gestión, fichas de modelos, soporte, glosario, portfolio) y PDF único de entrega (`just docs`).
- **Etapa 10:** CodeQL, Dependabot, salud cada 6 h, control semanal de seguridad, backup mensual cifrado
  con restauración probada, `/privacidad`, `/api/health`, `security.txt`, página 404, pruebas de
  accesibilidad con axe y `docs/security/`.
- **Etapa 9:** modelo de Power BI en estrella (19 CSV), rol `powerbi_reader`, medidas DAX, temas y guía.
- **Etapa 8:** libro de Excel con 26 hojas y gráficos nativos, bucket `exports` y `api.stat_match_series`.
- **Etapa 7:** Comparar contra plantel, zona, posición u otro jugador.
- **Etapa 6:** Situaciones (118 tarjetas en SQL) y estadística desglosada.
- **Etapa 5:** landing con 76 gráficos en 13 categorías.
- **Etapa 4:** catálogo de 275 estadísticas, Equipo y Jugadores, métricas propias y 6.1.
- **Etapas 1 a 3:** Fase 0, Supabase con RLS, esqueleto, adaptador de la LNB (toda la liga) con
  conciliación del play-by-play, workflow mensual, keepalive e Interfaz 6.

### Corregido
- Contraste del botón Actualizar, tablas desplazables sin foco de teclado y desborde horizontal en el
  celular de las páginas de jugador y partido (axe, etapa 10).
- Partidos duplicados por el id cambiante de la LNB (etapa 4).
- En la desglosada del Excel, el factor de los cocientes se aplica solo a la serie de Boca (etapa 9).
