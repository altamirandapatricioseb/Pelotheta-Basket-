# API de solo lectura (16.2)

La Data API de Supabase (PostgREST) expone las vistas del esquema `api`, las mismas que lee la web. No
hay endpoints propios ni de escritura. Lista de vistas y columnas: `docs/diccionario_datos.md`.

- **URL:** `https://jztmmfdkbajdrmzilxlt.supabase.co/rest/v1/<vista>`
- **Clave publicable** (pública por diseño, ADR 0007): `sb_publishable_RPdj0Jqv7bVqMaNLJbztvw_dOwf9He4`
- **Cabeceras:** `apikey: <clave>` y `Accept-Profile: api`.
- **Especificación OpenAPI:** la Data API la publica en `/rest/v1/` (pide la clave secreta; el
  diccionario de datos se genera desde ahí).

## Ejemplos

```bash
# Partidos de Boca, del más reciente al más viejo
curl -s "https://jztmmfdkbajdrmzilxlt.supabase.co/rest/v1/boca_game?select=game_date,opponent,points_for,points_against&order=game_date.desc" \
  -H "apikey: sb_publishable_RPdj0Jqv7bVqMaNLJbztvw_dOwf9He4" -H "Accept-Profile: api"

# Puntos de un jugador en cada partido (la misma serie que la desglosada)
curl -s "https://jztmmfdkbajdrmzilxlt.supabase.co/rest/v1/stat_match_series?stat_id=eq.pts&entity=eq.jugador&entity_id=eq.175&select=match_date,value" \
  -H "apikey: sb_publishable_RPdj0Jqv7bVqMaNLJbztvw_dOwf9He4" -H "Accept-Profile: api"
```

```ts
const res = await fetch(
  'https://jztmmfdkbajdrmzilxlt.supabase.co/rest/v1/player_stat?stat_id=eq.pts&select=player_id,value',
  { headers: { apikey: 'sb_publishable_RPdj0Jqv7bVqMaNLJbztvw_dOwf9He4', 'Accept-Profile': 'api' } },
);
const rows = (await res.json()) as { player_id: number; value: number | null }[];
```

## Límites

| Límite | Valor |
|---|---|
| Filas por pedido | 1000 (paginar con `limit` y `offset`, o con la cabecera `Range`) |
| Tiempo por consulta | El `statement_timeout` del rol `anon` |
| Escritura | Ninguna: `POST`, `PATCH` y `DELETE` se rechazan (RLS, `tests/test_rls.py` y pgTAP) |
| Datos crudos | El play-by-play y las coordenadas de los tiros no están en la API |
