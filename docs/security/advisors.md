# Supabase Advisors

## 4-nov-2026 (etapa 10)

Security Advisor: 0 ERROR, 0 WARN. Solo 4 INFO intencionales:

| Nivel | Hallazgo | Justificación |
|---|---|---|
| INFO | `rls_enabled_no_policy` en `core.audit_log`, `core.source_id_map`, `core.play_by_play_event` y `core.shot` | Intencional: RLS activo sin políticas niega todo a anon y authenticated. El play-by-play crudo y las coordenadas de los tiros no se republican; solo los usa el pipeline con la clave secreta |

El rol `powerbi_reader` (etapa 9), el bucket `exports` y la vista `api.stat_match_series` (etapa 8)
no generaron avisos.
