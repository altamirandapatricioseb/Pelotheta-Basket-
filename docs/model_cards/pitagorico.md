# Ficha del modelo: victorias pitagóricas

| Campo | Valor |
|---|---|
| Propósito | Victorias que «merecía» un equipo según sus puntos a favor y en contra |
| Fórmula | PF^x / (PF^x + PC^x) × partidos jugados |
| Exponente | Se calibra en cada carga sobre la tabla de la liga: el x que minimiza Σ (victorias reales − pitagóricas)², en una grilla de 5 a 25 con paso 0,1 (`pipeline/metrics.py: calibrate_pythagorean`). Supuesto de arranque: 14 |
| Datos | Puntos a favor y en contra de cada equipo (fixture de la LNB) |
| Supuestos | La diferencia de puntos explica las victorias; los partidos ajustados se reparten por azar |
| Validación | La calibración misma: el exponente que mejor explica la tabla real. Con pocas fechas varía mucho |
| Límites | A principio de temporada el exponente es inestable; no mira la calidad del rival |
| Se muestra | Gráfico 9 (reales frente a pitagóricas), Excel (G09) y Power BI, como estimado |
