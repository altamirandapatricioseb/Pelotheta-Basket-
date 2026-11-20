-- La carga de toda la liga (box score y jugada a jugada de cada partido) ya no entra en los 8 s del
-- authenticator: el 18-nov-2026, con 78 partidos, ingest.load_batch se cortó por statement_timeout.
-- Solo el rol del pipeline (service_role) tiene más tiempo; la lectura pública (anon) sigue en 3 s.
alter role service_role set statement_timeout = '120s';
notify pgrst, 'reload config';
