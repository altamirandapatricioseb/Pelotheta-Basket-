# ADR 0007: publicar la clave publicable de Supabase

- Estado: aceptada (3-nov-2026), igual que Pelotheta fútbol

## Contexto
La web lee la base solo desde el servidor, así que la clave publicable no está en el navegador. Pero la
API de solo lectura (16.2) es inútil sin ella, y el keepalive depende de ella: sin la clave, Supabase
pausa la base.

## Decisión
La clave publicable se publica en `docs/api.md` y queda como valor por defecto en `keepalive.yml`. La clave
secreta sigue prohibida en todo el repositorio (gitleaks en cada push).

## Consecuencias
- Seguridad: la protección es la RLS, no el secreto de la clave. pgTAP verifica cero permisos de escritura en
  las vistas para anon, authenticated y powerbi_reader; anon tiene su propio `statement_timeout` y 1000 filas por pedido.
- El abuso de lectura se mitiga con esos límites y la caché de 6 h de la web.
