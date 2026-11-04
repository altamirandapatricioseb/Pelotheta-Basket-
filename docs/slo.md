# Objetivos de servicio (SLO)

Los mismos objetivos que Pelotheta fútbol, con lo que este sistema puede medir de verdad en el plan
gratuito.

| SLO | Objetivo | Cómo se mide | Dónde se ve | Si no se cumple |
|---|---|---|---|---|
| Disponibilidad del sitio | 99 % mensual (unas 7 h de caída al mes) | `health.yml` consulta `/api/health` cada 6 h, dos veces seguidas | Issues con la etiqueta `salud` | Playbook «sitio caído» de `docs/security/incident_response.md` |
| Frescura de los datos | La última carga exitosa tiene 35 días o menos | `ingest_log` (última corrida con estado `ok`) | `/actualizar` y la fecha del header | Correr `update.yml` a mano; leer el paso que falló |
| Carga mensual exitosa | La corrida mensual termina bien | `ingest_log.status` y el resumen de la corrida en Actions | `/actualizar`, «Historial de cargas» | La carga es idempotente: se vuelve a correr |
| Accesibilidad | WCAG 2.2 AA sin hallazgos de axe | `web/e2e/a11y.spec.ts` (11 rutas, dos temas, escritorio y celular) | Control semanal contra producción | Corregir antes del próximo deploy |
| Tamaño de la base | Menos de 400 MB (el límite gratuito es 500 MB) | `ingest_log.db_size_mb` al terminar cada corrida | `/actualizar` | Revisar qué tabla creció |

Sin presupuesto de Lighthouse en CI (ver `docs/ideas_extra.md`, 16.5): se mide a mano antes de cada
entrega.
