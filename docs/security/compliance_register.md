# Registro de cumplimiento de fuentes

Cada fuente, su estado y lo que exige para usarla. Detalle y pruebas en `docs/source_audit.md`.

| Fuente | Estado | Qué exige o por qué no | Cómo se cumple |
|---|---|---|---|
| Liga Nacional de Básquet (laliganacional.com.ar) | activa (principal) | `robots.txt` permite todo; sin términos de uso publicados | Solo estadísticas derivadas con atribución en el pie; play-by-play y coordenadas de tiros no se republican; caché de partidos terminados; pausa entre pedidos y User-Agent identificable |
| Wikipedia y Wikidata | activa (plantel, posición, altura) | CC BY-SA, citar | Atribución en el pie y en Metadatos del libro; la fecha de nacimiento no se publica |
| SportScore | activa (validación de marcadores) | Enlace visible «Powered by SportScore»; no redistribuir en bloque | Solo para contrastar resultados; no se publica su dato |
| TheSportsDB | activa (validación de marcadores) | Uso no comercial de la API | Solo para contrastar resultados |
| API-Basketball | desactivada | El plan gratuito no cubre 2026-27 | Clave solo en `.env` local, sin uso |
| FIBA.basketball | solo chequeo manual | El pie prohíbe duplicar o redistribuir | No se automatiza |
| Sofascore | descartada | Sus términos limitan el uso automatizado | No se automatiza (regla del pedido) |
| Basketball-Reference | solo glosario | Pide no armar sitios con sus datos | Solo se consultaron fórmulas |
