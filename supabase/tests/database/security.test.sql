-- Pruebas pgTAP de los controles de la base (14.2). Se corren con `npx supabase test db` contra
-- una base local, o pegadas en el SQL Editor / el MCP: todo va en una transacción que termina en
-- rollback, así que la extensión pgtap no queda instalada en producción.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(7);

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'core' and c.relkind = 'r' and not c.relrowsecurity),
  0::bigint, 'RLS activo en todas las tablas de core');

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   cross join (values ('anon'), ('authenticated')) r(role)
   where n.nspname in ('core', 'api') and c.relkind in ('r', 'v', 'm')
     and (has_table_privilege(r.role, c.oid, 'INSERT') or has_table_privilege(r.role, c.oid, 'UPDATE')
          or has_table_privilege(r.role, c.oid, 'DELETE') or has_table_privilege(r.role, c.oid, 'TRUNCATE'))),
  0::bigint, 'anon y authenticated no pueden escribir en core ni en api');

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   cross join (values ('anon'), ('authenticated')) r(role)
   where n.nspname = 'ingest' and has_function_privilege(r.role, p.oid, 'EXECUTE')),
  0::bigint, 'ninguna función de carga (ingest) se puede ejecutar sin la clave secreta');

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'api' and c.relkind = 'v'
     and not coalesce('security_invoker=true' = any(c.reloptions), false)),
  0::bigint, 'todas las vistas de api son security_invoker (respetan la RLS de quien consulta)');

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm') and has_table_privilege('anon', c.oid, 'SELECT')),
  0::bigint, 'el esquema public no expone tablas a anon');

select ok(
  exists (select 1 from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
          where r.rolname = 'anon' and exists (select 1 from unnest(s.setconfig) c where c like 'statement_timeout=%')),
  'anon tiene statement_timeout propio');

-- Los controles de powerbi_reader (etapa 9) y del bucket exports (etapa 8) se suman en esas etapas.

select is(
  (select count(*) from (values ('play_by_play_event'), ('shot'), ('audit_log'), ('source_id_map')) t(name)
   where has_table_privilege('anon', 'core.' || t.name, 'SELECT')),
  0::bigint, 'anon no lee el play-by-play ni los tiros crudos, ni la auditoría ni el mapeo de ids');

select * from finish();
rollback;
