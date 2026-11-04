# Guía de entrevista: 30 preguntas sobre el proyecto

| # | Pregunta | Respuesta corta | Dónde se ve |
|---|---|---|---|
| 1 | ¿Qué problema resuelve? | Mirar la temporada de Boca en la LNB en el tiempo, contra el plantel y con cada número explicado | `docs/producto/vision.md` |
| 2 | ¿Por qué un sistema «hermano» de fútbol? | Decisión del dueño: misma experiencia, distintos datos; un cambio de diseño se porta | ADR 0010 |
| 3 | ¿Cómo elegiste la fuente? | Fase 0 con 10 fuentes: la LNB trae box score y play-by-play y su robots.txt lo permite | `docs/source_audit.md` |
| 4 | ¿Por qué bajás toda la liga? | El PER, los percentiles y la tabla necesitan a los demás equipos | ADR 0004 |
| 5 | ¿Cómo sabés que el play-by-play es correcto? | Lo reconstruyo y lo comparo con el box score; si no cuadra, cuarentena | ADR 0009, `pipeline/pbp.py` |
| 6 | ¿Qué es nivel A, B o C? | A de la fuente, B calculada, C sin dato (`n/d`, nunca cero) | `docs/diccionario_datos.md` |
| 7 | ¿Por qué dos esquemas en la base? | Las tablas en `core` no se exponen; la web solo ve vistas de `api` | ADR 0001 |
| 8 | ¿Qué protege la RLS si la clave publicable es pública? | Que con ella se lea y no se escriba: pgTAP lo verifica | `supabase/tests/database/security.test.sql` |
| 9 | ¿Por qué el cálculo va en el pipeline? | Vercel Hobby corta funciones largas; la web solo lee | ADR 0002 |
| 10 | ¿Cómo hiciste la serie por partido rápida? | Vista en forma de conjunto: 111 ms en vez de 6 s llamando la función 1.586 veces | `supabase/migrations/20261103001900_stage8_excel.sql` |
| 11 | ¿Qué es cada 36 minutos? | Valor normalizado a 36 minutos jugados, el equivalente de cada 90 del fútbol | `pipeline/excel.py: per36` |
| 12 | ¿Cómo comparás un jugador sin sesgo? | Nunca entra en su propia media; respeta el sentido de cada estadística | `web/lib/compare/compare.ts` |
| 13 | ¿Qué son las zonas? | Exteriores (base y escolta), aleros e interiores (ala-pívot y pívot) | `web/lib/compare/compare.ts` |
| 14 | ¿Cómo se calculan las Situaciones? | En SQL: una vista por marco devuelve (tarjeta, fila, partido) y una función calcula los resultados | `sql/situational/` |
| 15 | ¿Por qué no hay empates en Situaciones? | El básquet no los tiene: las columnas son G y P | `sql/situational/zz_refresh.sql` |
| 16 | ¿Qué es la estadística desglosada? | Una estadística por ventanas de tiempo con sus partidos | `web/app/estadistica/[stat]/page.tsx` |
| 17 | ¿Cómo es el Excel? | `xlsxwriter`, 26 hojas, gráficos nativos; el Comparador cambia con listas desplegables | `pipeline/excel.py` |
| 18 | ¿Cómo evitás la inyección de fórmulas en Excel y CSV? | Todo texto que empieza con `=`, `+`, `-` o `@` lleva apóstrofo | `pipeline/excel.py: safe_text` |
| 19 | ¿Cómo es el modelo de Power BI? | Estrella con hechos en formato largo: un segmentador elige la estadística | `docs/powerbi_guia.md` |
| 20 | ¿Qué hace la CSP? | Nonce por request y `strict-dynamic`; sin `unsafe-eval` | ADR 0003, `web/proxy.ts` |
| 21 | ¿Cómo detectás una clave filtrada? | gitleaks en cada push y semanal sobre todo el historial | `.github/workflows/` |
| 22 | ¿Qué pasa si Supabase se pausa? | Keepalive dos veces por semana; salud cada 6 h abre un issue | `docs/slo.md` |
| 23 | ¿Cómo es el backup? | Mensual, de las vistas, cifrado con age; la privada fuera del repositorio | `scripts/backup.py` |
| 24 | ¿Probaste restaurarlo? | Sí: 20 vistas y 8.502 filas verificadas contra el manifiesto | `docs/recuperacion.md` |
| 25 | ¿Cómo probás la accesibilidad? | axe con Playwright en 11 rutas, dos temas y dos tamaños | `web/e2e/a11y.spec.ts` |
| 26 | ¿Qué encontró axe? | Contraste del botón Actualizar, tablas sin foco de teclado y desborde en el celular | `docs/pruebas/plan_de_pruebas.md` |
| 27 | ¿Qué son la Mejoría y el Potencial? | Estimaciones propias en dos variantes, siempre con aviso | `docs/model_cards/mejoria_potencial.md` |
| 28 | ¿Están validadas? | Todavía no: con 6 partidos no hay muestra; se valida al cerrar la temporada | `docs/ideas_extra.md` |
| 29 | ¿Qué dejaste afuera y por qué? | Notebooks, modelo predictivo, k6 y regresión visual: sin muestra o sin plan | `docs/ideas_extra.md` |
| 30 | ¿Qué harías distinto? | Portar primero y adaptar después, desde el día uno | `docs/gestion/README.md` |
