# Guía de Power BI

Power BI es el complemento local de la web, como en Pelotheta fútbol: el repositorio no trae un
`.pbix`, trae el modelo listo para armarlo. Esta guía lleva de cero a las siete páginas del reporte
y sigue, gráfico por gráfico, el cuadro 9.4 del pedido.

Qué hay en el repositorio:

| Archivo | Para qué |
|---|---|
| `data/powerbi/*.csv` | Modelo en estrella (19 tablas), UTF-8 con BOM y punto decimal. Lo genera `python -m pipeline.powerbi` |
| `powerbi/measures.dax` | Todas las medidas y las tablas calculadas (ejes de la dispersión, mínimo de minutos) |
| `powerbi/theme.json` y `powerbi/theme-oscuro.json` | Tema claro y oscuro con la paleta de la web y Montserrat |

## 1. Conectar los datos

Hay dos caminos. Los dos leen lo mismo que la web pública: nada privado.

### Opción A: importar los CSV (recomendada)

1. Bajá los CSV. O clonás el repositorio (`data/powerbi/`), o los tomás del bucket público, que el
   workflow actualiza cada vez que corre el pipeline:
   `https://jztmmfdkbajdrmzilxlt.supabase.co/storage/v1/object/public/exports/powerbi/<tabla>.csv`
   (por ejemplo `dim_player.csv`). Con la URL podés usar **Obtener datos → Web** y Power BI vuelve a
   bajarlos al tocar Actualizar.
2. Power BI Desktop → **Obtener datos → Texto o CSV** → elegí cada archivo. Origen del archivo:
   **65001: Unicode (UTF-8)**; delimitador: coma.
3. En **Transformar datos**, revisá los tipos: `fecha` como Fecha; `valor`, `valor_36`, `percentil`,
   `numerador`, `denominador`, `rolling_5`, `minutos` y `pearson` como Número decimal; `estimada`,
   `por36`, `mas_es_mejor`, `es_boca` y `local` como Número entero (0 o 1). Si tu Windows usa coma
   decimal, en **Cambiar tipo → Usando configuración regional** elegí *Inglés (Estados Unidos)*.

### Opción B: PostgreSQL directo a Supabase

Sirve para tener los datos al día sin bajar archivos. Usa el rol `powerbi_reader`, que solo puede
leer las vistas del esquema `api` (las mismas que la web): sin escritura, sin `ingest`, sin storage.

1. **Una sola vez, el dueño** le pone contraseña en el SQL Editor de Supabase (generá una larga, por
   ejemplo con un gestor de contraseñas, y no la guardes en el repositorio):

   ```sql
   alter role powerbi_reader with login password '<contraseña larga generada>';
   ```

   Para revocarlo: `alter role powerbi_reader nologin;`.
2. En el panel de Supabase → **Connect** → **Session pooler** copiá el host (algo como
   `aws-0-<región>.pooler.supabase.com`). Puerto **5432** (modo sesión, no el 6543 de transacciones).
3. Power BI → **Obtener datos → Base de datos PostgreSQL**. Servidor `<host>:5432`, base `postgres`,
   modo **Importar**. Credenciales de **Base de datos**: usuario `powerbi_reader.jztmmfdkbajdrmzilxlt`
   y la contraseña del paso 1. Cifrado: activado.
4. Elegí las vistas de `api` que necesites (`player_stat`, `player_summary`, `player_bio`,
   `stat_catalog`, `stat_set_column`, `boca_game`, `game_period`, `team_stat`, `situational_result`,
   `stat_match_series`, `chart_catalog`, `chart_source_map`). Por esta vía los datos llegan como en la
   base; los percentiles, el valor cada 36 y la media móvil de los CSV los arma `pipeline/powerbi.py`.
   Para seguir esta guía tal cual, usá la opción A.

**Nunca uses la service role key (clave secreta) en Power BI** (ni en ningún `.pbix` que compartas):
salta todas las reglas de seguridad de la base.

El rol tiene `statement_timeout` de 60 segundos, transacciones de solo lectura y como mucho 5
conexiones a la vez.

### Actualización

Es manual: botón **Actualizar** de Power BI Desktop. La actualización programada exige publicar en
el servicio de Power BI y depende de la licencia: queda fuera del alcance.

## 2. Tema y tipografía

**Vista → Temas → Buscar temas** → `powerbi/theme.json` (o `theme-oscuro.json`). Trae la paleta de la
web en el mismo orden: verde (principal), violeta (secundario, siempre junto al verde), rojo (solo
lo negativo), azul, amarillo y después el resto.

La tipografía es **Montserrat**. Power BI usa las fuentes instaladas en la PC: si no la tenés,
instalala desde Google Fonts (`fonts.google.com/specimen/Montserrat`); si no, Power BI cae en Segoe
UI. Las letras griegas (α, Θ) salen con la fuente de respaldo del sistema.

## 3. Relaciones

**Vista de modelo**. Todas de uno a varios, dirección de filtro simple (de la dimensión al hecho),
salvo la indicada:

| Desde (uno) | Hacia (varios) |
|---|---|
| `dim_player[player_id]` | `fact_player_stat`, `fact_player_minutes` |
| `dim_stat[stat_id]` | `fact_player_stat`, `stat_distribution` |
| `dim_stat[stat_id]` | `dim_stat_set[stat_id]`, con dirección **Ambas** (así el segmentador de conjunto filtra las estadísticas) |
| `dim_competition[competition_code]` | `fact_player_stat`, `fact_player_minutes`, `fact_match` |
| `dim_date[fecha]` | `fact_match[fecha]` |
| `dim_team[equipo]` | `fact_match[rival]`, `fact_team_season[equipo]` |
| `fact_match[match_id]` | `fact_team_match_stat`, `fact_match_period`, `fact_stat_match_value`, `fact_table_position` |
| `dim_chart[chart_id]` | `chart_source_map[chart_id]` |

Sin relación (a propósito): `stat_correlation` (filtrala por `stat_a` y `stat_b`), `fact_situational`
y las tablas calculadas `Eje X`, `Eje Y` y `Mínimo de minutos`.

`fact_stat_match_value` tiene estadísticas de jugador (`entidad = "jugador"`, `entity_id` = el
jugador) y de Boca (`entidad = "equipo"`, `entity_id = 0`): la medida `Valor por partido del
jugador` lo resuelve con `TREATAS`, y su `stat_id` no se relaciona con `dim_stat` (que tiene solo
las de jugador).

Marcá `dim_date` como tabla de fechas (**Herramientas de tabla → Marcar como tabla de fechas**).

## 4. Medidas

1. **Modelado → Nueva tabla** para cada tabla calculada del principio de `powerbi/measures.dax`
   (`Eje X`, `Eje Y`, `Mínimo de minutos`; en esta última renombrá la columna `Value` a `Mínimo`).
2. **Modelado → Nueva medida** para cada medida. Conviene crear una tabla vacía `Medidas` y colgarlas
   ahí. Formato sugerido: percentiles e índices con 1 decimal.
3. Segmentadores globales (sincronizalos en todas las páginas con **Vista → Sincronizar
   segmentadores**): `dim_stat[nombre]` y `dim_stat_set[conjunto]` donde haga falta. Hay una sola
   competición cargada (Liga Nacional 2026-27).

Para elegir la estadística de un gráfico hay dos formas: el segmentador sobre `dim_stat` con la
medida `Valor seleccionado` (lo que usa esta guía), o **parámetros de campo** (Modelado → Nuevo
parámetro → Campos), que en versiones viejas de Power BI Desktop hay que activar en Opciones →
Características de vista previa.

Las medias de referencia (`Media del plantel (sin el jugador)`, `Media de su zona (sin el
jugador)`, `Media de su posición (sin el jugador)`) excluyen al jugador comparado con
`REMOVEFILTERS` y piden el mínimo de minutos (400 por defecto, como la web). `Media de la zona
filtrada` usa `ALLEXCEPT` y sí incluye a todos. Zonas: exteriores (base y escolta), aleros e
interiores (ala-pívot y pívot).

## 5. Las páginas

### 5.1 Tabla maestra

- **Matriz**: filas `dim_player[nombre]`; columnas `dim_stat[abrev]`; valores `Valor seleccionado`.
  Segmentadores: `dim_stat_set[conjunto]`, `dim_player[zona]`, `dim_player[posicion]`. Formato
  condicional del valor por `Percentil seleccionado` (escala verde del tema).
- Arriba, tarjetas con `Jugador actual`, `Ficha del jugador actual` y `Descripción de la estadística`.
- **Página de información sobre herramientas** (Formato de página → Permitir uso como información
  sobre herramientas) con `Estadística actual`, `Descripción de la estadística` y `Aviso de
  estimación`; asignala a la matriz.
- Clic derecho en un jugador → **Obtener detalles → Estadística desglosada** (drill-through, 5.7).

### 5.2 Comparador

- Segmentador de jugador (`dim_player[nombre]`, selección múltiple) y de conjunto.
- **Radar** (gráfico 1): visual personalizado de AppSource (**Obtener más objetos visuales** →
  buscá «Radar Chart», el de Microsoft). Categoría `dim_stat[abrev]`, valor `Percentil
  seleccionado`, leyenda `dim_player[nombre]`. Verificá que funcione en tu versión; si falla, usá
  **barras agrupadas** con los mismos campos.
- **Matriz lado a lado**: filas `dim_stat[nombre]`, columnas `dim_player[nombre]`, valores `Valor
  seleccionado` y `Percentil seleccionado`.
- **Barras de diferencia**: eje `dim_stat[nombre]`, valor `Diferencia con sentido`, color `Color por
  signo`.

### 5.3 Equipo y partidos

- **Tabla de partidos**: `fecha`, `rival`, `local`, `puntos_favor`, `puntos_contra`, `resultado`
  (color con `Color por resultado`).
- Tarjetas: `Ganados`, `Perdidos`, `% de victorias`, `Puntos a favor por partido`, `Puntos en contra
  por partido`, `Puesto en la tabla` (filtrá `dim_team[es_boca] = 1`).
- Gráficos 5 a 10 y 12: ver el cuadro de la sección 6.

### 5.4 Exploración

- **Dispersión configurable** (gráfico 2): segmentadores `Eje X[nombre]` y `Eje Y[nombre]`
  (selección única); dispersión con X `Valor eje X`, Y `Valor eje Y`, detalles `dim_player[nombre]`,
  tamaño `Minutos`, leyenda `dim_player[zona]`. Panel **Análisis** → línea de mediana en los dos ejes.
- **Ranking** (3), **distribución** (4), **minutos** (12) y **matriz de correlación** (14).

### 5.5 Situaciones

- Segmentadores `fact_situational[categoria]` y `fact_situational[tarjeta]`.
- Barras: eje `fact_situational[fila]`, valor `% de victorias en la situación`; información sobre
  herramientas con `Partidos en la situación` y `Diferencia con la base` (positiva en verde,
  negativa en rojo con formato condicional).
- Tabla con `partidos`, `ganados`, `perdidos`, `pf`, `pc`, `diferencia`. Con menos de 5 partidos en
  una fila, leela como orientativa (la web lo avisa igual). En el básquet no hay empates.

### 5.6 Comparación directa

- Segmentador del jugador principal (`dim_player[nombre]`, selección única) y de la referencia: un
  segmentador desconectado con «Plantel», «Zona» y «Posición» (Modelado → Nueva tabla:
  `Referencia = DATATABLE ( "Referencia", STRING, { { "Plantel" }, { "Zona" }, { "Posición" } } )`) y
  una medida que elija con `SWITCH ( SELECTEDVALUE ( Referencia[Referencia] ), "Zona", [Media de su
  zona (sin el jugador)], "Posición", [Media de su posición (sin el jugador)], [Media del plantel
  (sin el jugador)] )`. Para otro jugador: `Jugador B = dim_player` con **Nueva tabla**, relación
  inactiva y `USERELATIONSHIP`.
- **Tablas por categoría** (filtro `dim_stat[grupo]`), **radar de percentiles**, **barras
  divergentes** (`Diferencia con sentido`, color `Color por signo`) y **gráfico de bala** (barras con
  `Valor seleccionado` y una línea de referencia con la media elegida).

### 5.7 Estadística desglosada (drill-through)

- En **Campos de obtención de detalles** poné `dim_player[nombre]` y `dim_stat[nombre]`. Activá
  **Mantener todos los filtros**.
- **Ventanas de tiempo** (último partido, últimos 5 y 10, últimos 30 días, mes): filtros de fecha
  relativa sobre `fact_match[fecha]` (Filtro → Fecha relativa) o un segmentador `N superiores` por
  fecha, con la medida `Valor de la ventana` (suma sobre suma, como la web).
- **Evolución por partido** (gráfico 5): líneas con eje `fact_match[fecha]`, valores `Valor por
  partido del jugador` y `Media móvil de 5`.
- Tabla partido por partido: `fact_match[fecha]`, `rival`, `fact_stat_match_value[valor]`.
- Botón **Atrás** (Insertar → Botones → Atrás) para volver a la página de origen.

### Botones «Ver origen» (9.9)

`dim_chart` lista los 76 gráficos del catálogo y `chart_source_map` a dónde lleva cada uno. En cada
visual que tenga origen, agregá un botón (Insertar → Botones → En blanco) con texto `Texto del botón
origen` y acción **Navegación de página** hacia la página del destino (`destino_tipo = desglosada` →
5.7; `tabla` → la página de esa tabla). Filtrá el botón por su `chart_id`. Si el gráfico no tiene
filas en `chart_source_map`, `Tiene origen` da 0 y el botón no se muestra: no lleva a ningún lado y
no pasa nada.

## 6. Gráfico por gráfico (cuadro 9.4)

| # | Gráfico | Visual de Power BI | Campos | Medidas | Segmentadores |
|---|---|---|---|---|---|
| 1 | Comparador de jugadores | Radar de AppSource; si no anda, barras agrupadas. Matriz lado a lado | `dim_stat[abrev]`, `dim_player[nombre]` | `Percentil seleccionado`, `Valor seleccionado` | Jugador (varios), conjunto |
| 2 | Dispersión configurable | Dispersión con línea de mediana (Análisis) | `dim_player[nombre]` (detalles), `dim_player[zona]` (leyenda) | `Valor eje X`, `Valor eje Y`, `Minutos` (tamaño) | `Eje X[nombre]`, `Eje Y[nombre]` |
| 3 | Ranking | Barras horizontales con filtro **N superiores** (10) por `Valor seleccionado` | `dim_player[nombre]` | `Valor seleccionado`, `Puesto` | Estadística (`dim_stat[nombre]`) |
| 4 | Distribución | Columnas (caja y bigotes solo con visual personalizado, opcional) | `stat_distribution[intervalo]`, `desde`, `hasta` | `Jugadores en el intervalo` | Estadística |
| 5 | Evolución por partido | Líneas | `fact_match[fecha]` | `Valor por partido del jugador` (o `NR` del equipo), `Media móvil de 5` | Jugador, estadística |
| 6 | Puntos a favor y en contra | Dos gráficos de líneas | `fact_match[fecha]` | `Puntos a favor`, `Puntos en contra`; `ORtg`, `DRtg` | — |
| 7 | Cuatro factores | Barras agrupadas | `fact_team_season[stat_id]` filtrada a `efg`, `tov_pct`, `orb_pct_team`, `ft_per_fga`; leyenda `dim_team[es_boca]` | `Valor de temporada del equipo`, `Promedio de la liga` | — |
| 8 | Rendimiento por cuarto | Columnas apiladas | `fact_match[fecha]` (eje), `fact_match_period[cuarto]` (leyenda) | `Puntos en el cuarto` (o `Diferencia en el cuarto`) | — |
| 9 | Victorias reales frente a pitagóricas | Dispersión con línea de referencia (Análisis → línea de tendencia o constante en y = x) | `dim_team[equipo]` (detalles) | `Victorias pitagóricas` (X), `Victorias` (Y) | — |
| 10 | Evolución de la tabla | Líneas con el eje Y invertido (Formato → Eje Y → Invertir intervalo) | `fact_table_position[fecha]` | `fact_table_position[puesto]` (mínimo) | — (calculada con todos los resultados de la liga: % de victorias y diferencia de puntos; la LNB desempata por resultados entre sí) |
| 11 | Mapa de tiros | — | — | — | **No se exporta**: las coordenadas crudas no se republican (el reparto por zona está en el grupo `zonas` de `dim_stat`) |
| 12 | Minutos por partido | Columnas apiladas + línea de carga | `dim_player[nombre]` | `Minutos como titular`, `Minutos desde el banco` (apiladas), `Minutos por partido` (línea) | — |
| 13 | Métricas propias | Barras con formato condicional por signo | `dim_player[nombre]` | `On/Off`, `NR en cancha`, `EWA`, `ELA`; color `Color por signo` | — |
| 14 | Matriz de correlación | Matriz con escala de color (formato condicional) | `stat_correlation[stat_a]` (filas), `stat_b` (columnas) | `Correlación` | — |

Los demás gráficos del catálogo están en `dim_chart` con su columna `powerbi` (`sí`, `alternativa`
o `no`) y el motivo en `motivo`: la mayoría son variantes de estos 14 con otra estadística o
categoría y se arman igual, cambiando el segmentador.

## 7. Notas

- Los porcentajes vienen como en la base: algunos de 0 a 1 (`efg`, `ts`, `orb_pct_team`) y otros de
  0 a 100 (`tov_pct`, `usg_pct`). Mirá `dim_stat[unidad]` antes de aplicar el formato porcentaje.
- Las estadísticas con `estimada = 1` son aproximaciones del pipeline: mostrá `Aviso de estimación`
  en la información sobre herramientas.
- No se probó en Power BI Desktop (no está en la PC donde se armó): las medidas DAX están revisadas
  a mano, no ejecutadas.
- **Publicar en la web** (incrustar el reporte en el sitio) exige una licencia que lo permita y que
  un administrador habilite la opción; en cuentas personales suele no estar disponible. Por eso la
  web usa sus propios gráficos y Power BI queda como complemento local.
