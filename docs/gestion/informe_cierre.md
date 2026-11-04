# Informe de cierre (4-nov-2026)

**URL:** <https://pelotheta-basket-dva.vercel.app>

## Alcance logrado frente al planificado

Las 11 etapas de la tabla 3.1 están hechas, como sistema hermano de Pelotheta fútbol. Lo que no se hizo
tal cual pide el pedido está justificado en `docs/ideas_extra.md` y en
`docs/security/fuera_de_alcance.md`. Desvíos del Gantt en `docs/gestion/gantt.md`: la etapa 4 se rehízo
para quedar igual a fútbol.

## Métricas finales

| Métrica | Valor |
|---|---|
| Pruebas automatizadas | 321 casos (pytest 152, Vitest 103, Playwright 66): 0 fallan |
| Cobertura | Pipeline 79 % (debajo de la meta de 85; ver `docs/pruebas/plan_de_pruebas.md`), web 97 % de líneas |
| Accesibilidad | 0 violaciones de axe en 11 rutas, 2 temas, escritorio y celular |
| Seguridad de la base | pgTAP 10/10; Security Advisor 0 ERROR y 0 WARN |
| Backup | Restauración verificada: 20 vistas, 8.502 filas |
| Base | 24 MB de 500 MB (5 %) |
| Estadísticas | 275 en el catálogo: 61 nivel A, 210 nivel B, 4 nivel C; 267 con datos |
| Gráficos | 76 diseñados, 73 con datos reales (3 sin datos con motivo: mapa de tiros, árbitros, temporada anterior) |
| Tarjetas de situaciones | 118 en el catálogo, 112 con datos de entrada y 107 con casos |
| Partidos | 6 de Boca y 49 de la liga cargados (al 28-oct) |
| Excel | `pelotheta-basquet.xlsx`, 26 hojas, ~250 KB |
| Power BI | 19 CSV en estrella |

## Fuentes

| Fuente | Estado |
|---|---|
| Liga Nacional de Básquet | Funciona: box score, cuartos, planteles, play-by-play y tiros de toda la liga (fuente principal) |
| Wikipedia | Funciona: plantel, posición, nacionalidad y altura |
| SportScore y TheSportsDB | Funcionan: validación de marcadores |
| API-Basketball | Desactivada: el plan gratuito no cubre 2026-27 |
| FIBA y Sofascore | No se automatizan por sus términos (ADR 0008) |

## Pendiente del dueño

1. Hacer el push de los commits de las etapas 5 a 11 y verificar el deploy en la URL real.
2. Cargar `SUPABASE_PUBLISHABLE_KEY` en GitHub Secrets (control semanal de RLS).
3. Correr a mano una vez `Seguridad semanal`, `Salud` y `Backup` (Actions → Run workflow).
4. Guardar la clave privada del backup (`~/.pelotheta-basquet/backup-age.key`) también fuera de esta
   máquina.

## Siguientes pasos

1. Primera carga mensual automática con partidos nuevos.
2. Subir la cobertura del pipeline a 85 % (`own_metrics.py`, `extras.py`, `season.py`).
3. Al cerrar la temporada: notebooks de calibración del Elo y backtesting de 6.1.
