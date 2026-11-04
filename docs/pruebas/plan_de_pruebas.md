# Plan e informe de pruebas

Estilo ISO/IEC/IEEE 29119 simplificado, igual que Pelotheta fútbol. Los casos, con el resultado de la
última corrida, están en `matriz_casos_prueba.xlsx` (y `.csv`), generados por `scripts/matriz_pruebas.py`
desde los reportes JUnit de pytest, Vitest y Playwright.

## Alcance

**Dentro:** pipeline (adaptadores, conciliación del play-by-play, cálculos, carga, Excel, Power BI,
backup), base de datos (RLS, permisos, bucket) y web (lógica, accesibilidad, responsive). **Fuera:** las
plataformas (Vercel, Supabase, GitHub) y las fuentes de terceros, salvo sus respuestas guardadas en
`tests/fixtures/`.

## Estrategia por nivel

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Unidad (Python) | pytest | Parseo de la LNB, fórmulas de 5.6 y 6, métricas propias, 6.1 con los ejemplos numéricos, tácticas, Situaciones, Excel, Power BI |
| Unidad (web) | Vitest | Catálogo, orden, conclusiones, desglosada, Comparar, Situaciones, transformaciones de gráficos, CSP, bloqueo de sondas, xlsx |
| Integración | pytest contra la base real | RLS con la clave publicable (lee y no escribe; el bucket no acepta subidas) |
| Base | pgTAP (MCP o SQL Editor) | RLS, permisos, `ingest`, `security_invoker`, `powerbi_reader`, bucket |
| Punta a punta | Playwright con axe | WCAG 2.2 AA y sin desplazamiento de costado en 11 rutas, dos temas, escritorio y celular |
| Seguridad | CodeQL, Semgrep, gitleaks, ZAP, auditorías | En CI y en el control semanal contra producción |

## Entornos

| Entorno | Para qué |
|---|---|
| Local (Windows, Python 3.13, Node 24) | Unidad, e2e contra `next dev` |
| CI (GitHub Actions, ubuntu-latest) | Lint, tipos, unidad, Semgrep, gitleaks, CodeQL |
| Producción (`pelotheta-basket-dva.vercel.app`) | Accesibilidad y ZAP semanales, salud cada 6 h |
| Base (Supabase) | pgTAP y RLS en vivo |

## Criterios de entrada

El código compila (tipos), el lint pasa y la rama tiene las pruebas de la lógica nueva.

## Criterios de salida

| Criterio | Umbral | Resultado (4-nov-2026) |
|---|---|---|
| Pruebas automatizadas | 0 fallas | 321 casos (pytest 152, Vitest 103, Playwright 66): 321 pasan, 0 fallan |
| Cobertura del pipeline | ≥ 85 % (meta de fútbol) | **79 %: no se alcanza.** Bajan el promedio `own_metrics.py` (17 %), `extras.py` (44 %) y `season.py` (56 %), que se prueban por sus resultados en la carga real; las fórmulas (`metrics.py` 100 %, `pbp.py` 99 %, `projection.py` 97 %) sí están cubiertas |
| Cobertura de la web | ≥ 80 % de líneas | 97 % |
| Accesibilidad | 0 violaciones de axe | 0 en 11 rutas, 2 temas y 2 dispositivos |
| Seguridad de la base | pgTAP completo | 10/10 |
| RLS en vivo | Lee y no escribe | 10/10 (`tests/test_rls.py`) |

## Defectos encontrados (y corregidos)

| Defecto | Cómo se encontró | Corrección |
|---|---|---|
| Contraste bajo del botón Actualizar (18 px no es texto grande) | axe en `/actualizar` | Texto más oscuro sobre el verde |
| Tablas desplazables sin foco de teclado | axe en celular (`/partido`, `/actualizar`) | `tabIndex`, `role="region"` y nombre |
| Jugador y partido se salían 142 y 222 px de costado en el celular | Prueba sin desplazamiento horizontal | Hijos de grilla con `min-width: 0` |
| La serie por partido tardaba 6 s | Plan de la consulta (`explain analyze`) | Vista en forma de conjunto: 111 ms, mismos valores (3.205 de 3.205) |
| El factor de los cocientes podía aplicarse a las series de jugador | Revisión del modelo de Power BI | Solo en la serie de Boca |
| Diferencias de porcentaje mal escaladas en Comparar | Prueba en el navegador | Escala según los valores comparados |
| Partidos duplicados por el id cambiante de la LNB | Carga real | Clave estable del partido |

## Riesgos de las pruebas

- Las e2e corren contra datos reales: con más partidos, una ruta fija (jugador 175, partido 142) puede
  cambiar de contenido.
- pgTAP no corre en CI (necesita la contraseña de la base): se corre antes de cada entrega.
- Sin regresión visual ni prueba de carga (ver `docs/ideas_extra.md`, 16.7).
