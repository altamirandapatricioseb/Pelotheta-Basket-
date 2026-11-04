# Qué demuestra el proyecto para cada puesto

| Puesto | Dónde mirar |
|---|---|
| Data Engineer, SQL Developer | `pipeline/`, `sources/lnb.py`, `sql/situational/`, `supabase/migrations/` (vistas, funciones de carga, `api.stat_match_series` en forma de conjunto) |
| Data Analyst, BI | `docs/powerbi_guia.md`, `powerbi/measures.dax`, `pipeline/excel.py`, la interfaz Situaciones |
| Data Scientist, Sports Data Analyst | `docs/metricas_propias.md`, `pipeline/metrics.py`, `pipeline/tactics.py`, `docs/model_cards/` |
| Backend, Full Stack | `web/`, `web/app/api/`, `web/lib/data/` |
| Frontend, UX | `web/components/`, `web/e2e/a11y.spec.ts`, ADR 0010 (sistema hermano) |
| QA, QA Automation | `docs/pruebas/`, `web/e2e/`, `tests/` |
| DevOps, SRE | `.github/workflows/`, `docs/slo.md`, `docs/recuperacion.md` |
| Ciberseguridad, Auditoría, Compliance | `docs/security/`, `SECURITY.md`, `supabase/tests/database/security.test.sql`, `web/proxy.ts` |
| Soporte técnico | `docs/soporte/` |
| Business Analyst, Product Owner | `docs/producto/vision.md`, `docs/requisitos.md`, `docs/casos_de_uso.md` |
| Project Manager | `docs/gestion/` (Gantt, informe de cierre) |
| Arquitectura | `docs/adr/`, `docs/diagramas/` |
| Redes, Infraestructura | `docs/red/dominio.md`, `docs/diagramas/arquitectura.md` |
