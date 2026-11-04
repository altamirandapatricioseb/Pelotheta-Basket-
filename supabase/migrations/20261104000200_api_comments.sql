-- Etapa 11 (sección 15): descripción de cada vista de `api`. La Data API la publica en su OpenAPI y
-- `scripts/diccionario.py` la lleva al diccionario de datos. Solo metadatos: no cambia datos ni permisos.
comment on view api.boca_game is 'Partidos de Boca: fecha, localía, rival, puntos a favor y en contra y estadísticas del partido (JSON).';
comment on view api.boca_lineup is 'Quintetos, tríos y duplas de Boca reconstruidos desde el play-by-play, con su muestra.';
comment on view api.chart_catalog is 'Catálogo de gráficos de la landing (9.2.1): categoría, tipo, disponibilidad en Power BI y Excel y motivo si no hay datos.';
comment on view api.chart_source_map is 'Destino de «Ver origen de los datos» de cada gráfico (9.9).';
comment on view api.game_line is 'Box score por jugador de cada partido de la liga (sin play-by-play crudo).';
comment on view api.game_period is 'Puntos de Boca y del rival en cada cuarto de cada partido.';
comment on view api.ingest_history is 'Historial de cargas del pipeline (Interfaz 6): inicio, fin, estado, filas y partidos nuevos.';
comment on view api.league_game is 'Resultados de todos los partidos de la liga (local, visitante y puntos).';
comment on view api.player_bio is 'Ficha del plantel: nombre, posición, nacionalidad, altura y peso. Sin fecha de nacimiento.';
comment on view api.player_stat is 'Valor de temporada de cada estadística de cada jugador de Boca (formato largo).';
comment on view api.situational_catalog is 'Catálogo de las tarjetas de Situaciones (9.6): marco, condición y datos que necesita.';
comment on view api.situational_match is 'Partidos que cumplen cada fila de cada tarjeta de Situaciones («Ver los partidos»).';
comment on view api.situational_result is 'Resultado de cada fila de cada tarjeta: partidos, victorias, derrotas, % de victorias y diferencia contra la base.';
comment on view api.stat_catalog is 'Catálogo de estadísticas: nombre, descripción, cómo leerla, grupo, unidad, fuente, nivel A/B/C, fórmula y regla de agregación.';
comment on view api.stat_set_column is 'Columnas de cada conjunto de estadísticas (el desplegable de categoría de Equipo y Jugadores).';
comment on view api.team_stat is 'Valor de temporada de cada estadística de cada equipo de la liga (formato largo).';
