# Soporte: códigos de error y triage (16.6)

Cada error visible del sitio lleva un código estable, igual que en Pelotheta fútbol. El código no
cambia de significado nunca; si aparece un problema nuevo, se crea un código nuevo.

| Código | Qué significa |
|---|---|
| [PEL-DB-001](PEL-DB-001.md) | La base de datos no responde |
| [PEL-NF-404](PEL-NF-404.md) | No existe esa página o ese dato |

## Cómo reportar un problema

- **Dato incorrecto:** plantilla `dato_incorrecto.yml` en Issues (página, estadística, valor visto y
  valor esperado con su fuente). No hay formulario propio, para no sumar superficie de ataque.
- **Algo no funciona:** plantilla `error.yml`.
- **Vulnerabilidad:** nunca en un issue público; ver `SECURITY.md`.

## Triage

1. **Reproducir:** abrir la página del issue con los mismos filtros. Si no se reproduce, pedir más
   datos y etiquetar `necesita-info`.
2. **Clasificar:** severidad (alta: sitio caído o dato público incorrecto en una métrica principal;
   media: una página o una estadística; baja: cosmético) y prioridad (P1 esta semana, P2 este mes, P3
   cuando se pueda).
3. **Ubicar la causa:** fuente (comparar con la planilla de la LNB), pipeline (cálculo o regla) o web
   (presentación).
4. **Corregir con prueba:** cada defecto corregido deja una prueba que lo reproduce.
5. **Cerrar:** con el commit que lo arregla y, si el dato era de la fuente, con la nota de por qué no
   se corrige acá.
