# Caso de estudio: Pelotheta Θ básquet

**Situación.** Ya existía Pelotheta fútbol, un sistema de análisis de Boca Juniors. El objetivo era
tener lo mismo para el básquet de Boca en la Liga Nacional, gratis y online, sin rediseñar: los dos
sistemas tenían que verse casi iguales, con distintos datos.

**Tarea.** Encontrar una fuente gratuita y permitida con box score por jugador de la LNB, construir el
pipeline, la base, la web con seis interfaces, el Excel, el modelo de Power BI, la seguridad y la
documentación, en las 11 etapas del pedido.

**Acción.**
- Fase 0: auditoría de 10 fuentes. La LNB publica box score, cuartos, planteles, mapa de tiros y
  play-by-play completo, con `robots.txt` que lo permite (ADR 0004). FIBA y Sofascore quedaron fuera por
  sus términos (ADR 0008).
- Pipeline en Python que baja **toda la liga** (49 partidos, no solo los 6 de Boca), porque el PER, los
  percentiles y la tabla necesitan a todos. El play-by-play se reconstruye y se concilia con el box
  score; los partidos que no cuadran van a cuarentena (ADR 0009).
- Base en Supabase con dos esquemas (privado con RLS y público de vistas), cálculo en el pipeline y en
  SQL escrito a mano: 118 tarjetas de Situaciones y la serie por partido de cada estadística.
- Web en Next.js portada del sistema madre (ADR 0010): mismos tokens, componentes y vistas, con cada 36
  en vez de cada 90, zonas en vez de líneas y sin empates.
- Excel con `xlsxwriter` (26 hojas, gráficos nativos e interactivos) y Power BI en estrella (19 CSV y DAX).
- Seguridad: CSP con nonce, RLS verificada con pgTAP (10/10), CodeQL, Semgrep, gitleaks, ZAP, backup
  cifrado con restauración probada, y accesibilidad WCAG 2.2 AA con axe (66/66).

**Resultado.**

| Métrica | Valor |
|---|---|
| Estadísticas del catálogo con datos | 267 de 275 (61 nivel A, 210 nivel B, 4 nivel C) |
| Gráficos | 76 diseñados, 73 con datos reales |
| Tarjetas de Situaciones | 118, 112 con datos de entrada y 107 con casos |
| Pruebas | Python, web, accesibilidad y base (números en `docs/gestion/informe_cierre.md`) |
| Tamaño de la base | 24 MB de 500 MB |
| Tiempo | 11 etapas en dos días, gracias a portar del sistema madre |

**Aprendizajes.**
- Portar primero y adaptar después: la etapa 4 se hizo dos veces porque la primera versión no seguía
  a fútbol.
- Una sola fuente buena (la LNB) alcanza si se valida contra sí misma: la conciliación del
  play-by-play con el box score es la prueba de calidad más fuerte del sistema.
- Con 6 partidos, varias métricas tienen muestra pequeña: se avisa en todos lados en vez de esconderlo.
