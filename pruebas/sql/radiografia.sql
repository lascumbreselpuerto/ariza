-- ============================================================================
-- ARIZA SAT · RADIOGRAFÍA DE LA BASE DE DATOS
--
-- QUÉ ES ESTO Y POR QUÉ EXISTE
-- El instalador que se dio el 14-11-2026 estaba incompleto: juntaba los 41
-- ficheros de servidor/, que son los que se han ido escribiendo desde que el
-- proyecto guarda sus SQL, pero el esquema ORIGINAL de la base se creó antes
-- de eso y nunca se guardó en ningún fichero. Faltaban 18 tablas y 15
-- funciones, así que el instalador reventaba en una base nueva.
--
-- Se puede reconstruir ese esquema leyendo el código de la aplicación, pero
-- sería una aproximación: columnas deducidas de cómo se usan, tipos elegidos a
-- ojo y permisos inventados. Y la lección de esa misma equivocación es que una
-- aproximación dada por buena es lo que rompe las cosas.
--
-- Esto hace lo contrario: le pregunta a la base de datos de verdad cómo está
-- hecha, y devuelve el SQL exacto que la reconstruye.
--
-- ES DE SOLO LECTURA. No crea, no cambia y no borra nada. Son consultas a los
-- catálogos de Postgres y nada más. Se puede ejecutar las veces que se quiera.
--
-- CÓMO SE USA
--   1. Abre el editor de SQL del proyecto de PRODUCCIÓN (el que está en uso).
--   2. Pega esto entero y ejecútalo.
--   3. Sale una tabla con dos columnas: «n» y «linea».
--   4. Descárgala en CSV con el botón de descarga del editor.
--
-- Juntando las líneas en el orden de «n» sale el esquema completo.
-- ============================================================================

with

-- ---- Solo lo que es de la aplicación ----
-- Las tablas y vistas del esquema public, sin las que Postgres o Supabase
-- ponen por su cuenta.
tablas as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'v', 'm', 'p')
     and not c.relispartition
),

-- ---- 1. Las tablas, columna por columna ----
-- El tipo se pide con format_type, que es el que escribe Postgres: así un
-- numeric(10,2) sale con su precisión y un text[] con sus corchetes.
col_tablas as (
  select t.relname,
         string_agg(
           format('  %I %s%s%s',
             a.attname,
             format_type(a.atttypid, a.atttypmod),
             case when a.attnotnull then ' not null' else '' end,
             case when ad.adbin is not null
                  then ' default ' || pg_get_expr(ad.adbin, ad.adrelid) else '' end),
           e',\n' order by a.attnum) as cuerpo
    from tablas t
    join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid = t.oid and ad.adnum = a.attnum
   where t.relkind in ('r', 'p')
   group by t.relname
),
ddl_tablas as (
  select 1000 as bloque, relname as orden2, 0 as sub,
         format(e'create table if not exists public.%I (\n%s\n);', relname, cuerpo) as linea
    from col_tablas
),

-- ---- 2. Claves, unicidades y comprobaciones ----
-- Van aparte de la tabla y no dentro, para que el orden de creación no importe:
-- una clave ajena que apunta a una tabla que todavía no existe rompería el
-- fichero, y así se añaden todas al final.
-- Primero las primarias y las unicidades, y DESPUÉS las ajenas y las
-- comprobaciones. El orden importa: una clave ajena necesita que la unicidad a
-- la que apunta ya exista, y si todas se mezclan ordenadas por nombre de tabla,
-- la de «aviso_puertas» intenta apuntar a «proveedores» antes de que
-- «proveedores» tenga su primaria. Pasó al probarlo, el 16-11-2026.
ddl_restr as (
  select 2000 as bloque, t.relname as orden2, 0 as sub,
         format(e'do $$ begin\n  if not exists (select 1 from pg_constraint where conname = %L and conrelid = %L::regclass) then\n    alter table public.%I add constraint %I %s;\n  end if;\nend $$;',
                co.conname, 'public.'||t.relname, t.relname, co.conname,
                pg_get_constraintdef(co.oid)) as linea
    from pg_constraint co
    join tablas t on t.oid = co.conrelid
   where co.contype in ('p', 'u')
     and not co.conname like '%_not_null'
),
ddl_restr2 as (
  select 2600 as bloque, t.relname as orden2, 0 as sub,
         format(e'do $$ begin\n  if not exists (select 1 from pg_constraint where conname = %L and conrelid = %L::regclass) then\n    alter table public.%I add constraint %I %s;\n  end if;\nend $$;',
                co.conname, 'public.'||t.relname, t.relname, co.conname,
                pg_get_constraintdef(co.oid)) as linea
    from pg_constraint co
    join tablas t on t.oid = co.conrelid
   where co.contype in ('f', 'c')
     and not co.conname like '%_not_null'
),

-- ---- 3. Índices ----
-- Los que Postgres crea solo para una clave primaria o una unicidad no van
-- aquí: los crea la restricción de arriba. Se reconocen porque tienen una
-- restricción asociada.
ddl_indices as (
  select 3000 as bloque, i.tablename as orden2, 0 as sub,
         -- Se le mete el «if not exists», que indexdef no trae, para que el
         -- fichero se pueda ejecutar dos veces. Por posición y no con una
         -- expresión regular: una contrabarra de más dentro de un literal de
         -- SQL dejaba escrito «\1index» y el fichero no arrancaba.
         case when i.indexdef like 'CREATE UNIQUE INDEX %'
                then 'create unique index if not exists ' || substr(i.indexdef, 21)
              when i.indexdef like 'CREATE INDEX %'
                then 'create index if not exists ' || substr(i.indexdef, 14)
              else i.indexdef end || ';' as linea
    from pg_indexes i
    join tablas t on t.relname = i.tablename
   where i.schemaname = 'public'
     and not exists (select 1 from pg_constraint co
                      where co.conrelid = t.oid
                        and co.conindid = (quote_ident(i.schemaname)||'.'||quote_ident(i.indexname))::regclass)
),

-- ---- 4. Las vistas ----
ddl_vistas as (
  select 4000 as bloque, t.relname as orden2, 0 as sub,
         format(e'create or replace view public.%I as\n%s',
                t.relname, pg_get_viewdef(t.oid, true)) as linea
    from tablas t
   where t.relkind = 'v'
),

-- ---- 5. Las funciones ----
-- pg_get_functiondef devuelve la función tal cual está, con su cuerpo, su
-- lenguaje, su security definer y su search_path. Es la fuente exacta.
ddl_funciones as (
  select 2500 as bloque, p.proname as orden2, 0 as sub,
         pg_get_functiondef(p.oid) || ';' as linea
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
),

-- ---- 6. Los disparadores ----
ddl_triggers as (
  select 6000 as bloque, t.relname as orden2, 0 as sub,
         format(e'drop trigger if exists %I on public.%I;\n%s;',
                tg.tgname, t.relname, pg_get_triggerdef(tg.oid)) as linea
    from pg_trigger tg
    join tablas t on t.oid = tg.tgrelid
   where not tg.tgisinternal
),

-- ---- 7. Seguridad por filas, y sus políticas ----
-- Esto es lo que decide quién ve qué. Sin ello, una base de pruebas sería una
-- base donde el técnico ve los márgenes.
ddl_rls as (
  select 7000 as bloque, t.relname as orden2, 0 as sub,
         format('alter table public.%I enable row level security;', t.relname) as linea
    from tablas t
   where t.relkind in ('r', 'p') and t.relrowsecurity
),
ddl_politicas as (
  select 7100 as bloque, pol.tablename as orden2, 0 as sub,
         format(e'drop policy if exists %I on public.%I;\ncreate policy %I on public.%I as %s for %s to %s%s%s;',
                pol.policyname, pol.tablename,
                pol.policyname, pol.tablename, pol.permissive, pol.cmd,
                array_to_string(pol.roles, ', '),
                case when pol.qual is not null then ' using ('||pol.qual||')' else '' end,
                case when pol.with_check is not null then ' with check ('||pol.with_check||')' else '' end) as linea
    from pg_policies pol
   where pol.schemaname = 'public'
),

-- ---- 8. Permisos de tabla y de columna ----
ddl_grants as (
  select 8000 as bloque, g.table_name as orden2, 0 as sub,
         format('grant %s on public.%I to %I;',
                string_agg(distinct g.privilege_type, ', '), g.table_name, g.grantee) as linea
    from information_schema.role_table_grants g
    join tablas t on t.relname = g.table_name
   where g.table_schema = 'public'
     and g.grantee in ('anon', 'authenticated', 'service_role')
   group by g.table_name, g.grantee
),
ddl_grants_col as (
  select 8100 as bloque, g.table_name as orden2, 0 as sub,
         format('grant %s (%I) on public.%I to %I;',
                g.privilege_type, g.column_name, g.table_name, g.grantee) as linea
    from information_schema.column_privileges g
    join tablas t on t.relname = g.table_name
   where g.table_schema = 'public'
     and g.grantee in ('anon', 'authenticated', 'service_role')
     and not exists (
       select 1 from information_schema.role_table_grants rg
        where rg.table_schema = 'public' and rg.table_name = g.table_name
          and rg.grantee = g.grantee and rg.privilege_type = g.privilege_type)
   group by g.table_name, g.grantee, g.privilege_type, g.column_name
),

-- ---- 9. Permisos de ejecución de las funciones ----
ddl_grants_fn as (
  select 8200 as bloque, p.proname as orden2, 0 as sub,
         format('grant execute on function public.%I(%s) to %I;',
                p.proname, pg_get_function_identity_arguments(p.oid), r.grantee) as linea
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join (select unnest(array['anon','authenticated','service_role']) as grantee) r
   where n.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege(r.grantee, p.oid, 'execute')
),

-- ---- 10. Los comentarios ----
-- En este proyecto los comentarios de las tablas y columnas explican por qué
-- existe cada cosa. Son documentación, no decoración: se llevan también.
ddl_coment_tabla as (
  select 9000 as bloque, t.relname as orden2, 0 as sub,
         format('comment on %s public.%I is %L;',
                case when t.relkind = 'v' then 'view'
                     when t.relkind = 'm' then 'materialized view'
                     else 'table' end,
                t.relname, d.description) as linea
    from pg_description d
    join tablas t on t.oid = d.objoid
   where d.objsubid = 0 and d.description <> ''
),
ddl_coment_col as (
  select 9100 as bloque, t.relname as orden2, a.attnum as sub,
         format('comment on column public.%I.%I is %L;', t.relname, a.attname, d.description) as linea
    from pg_description d
    join tablas t on t.oid = d.objoid
    join pg_attribute a on a.attrelid = t.oid and a.attnum = d.objsubid
   where d.objsubid > 0 and d.description <> ''
),

-- ---- 11. Los almacenes de ficheros ----
-- Cuáles hay y cuáles son públicos. Las políticas de los almacenes van en el
-- bloque de abajo, aparte, porque viven en otro esquema.
ddl_buckets as (
  select 9500 as bloque, b.id as orden2, 0 as sub,
         format('-- almacén %L · público: %s', b.id, b.public) as linea
    from storage.buckets b
),
ddl_pol_storage as (
  select 9600 as bloque, pol.policyname as orden2, 0 as sub,
         format(e'drop policy if exists %I on storage.%I;\ncreate policy %I on storage.%I as %s for %s to %s%s%s;',
                pol.policyname, pol.tablename,
                pol.policyname, pol.tablename, pol.permissive, pol.cmd,
                array_to_string(pol.roles, ', '),
                case when pol.qual is not null then ' using ('||pol.qual||')' else '' end,
                case when pol.with_check is not null then ' with check ('||pol.with_check||')' else '' end) as linea
    from pg_policies pol
   where pol.schemaname = 'storage'
),

-- ---- 12. La cabecera y las extensiones ----
-- Un cuerpo de función puede nombrar una vista y una vista puede llamar a una
-- función: con esto Postgres no comprueba los cuerpos al crearlos y el orden
-- deja de importar. Es lo mismo que hace pg_dump al restaurar.
ddl_cabecera as (
  select 1 as bloque, '' as orden2, 0 as sub,
         'set check_function_bodies = off;' as linea
),
-- Las extensiones van como COMENTARIO, no como orden. Un proyecto nuevo de
-- Supabase ya trae las suyas, cada una en el esquema que le toca, y volver a
-- crearlas desde aquí es buscarse un problema que no hace falta. Se listan solo
-- para saber cuáles hay.
ddl_ext as (
  select 100 as bloque, e.extname as orden2, 0 as sub,
         format('-- extensión instalada: %s', e.extname) as linea
    from pg_extension e
   where e.extname not in ('plpgsql')
),

-- ---- 13. La cuenta, en la primera línea ----
-- El editor de Supabase puede cortar un resultado largo. Si la primera línea
-- dice cuántas hay en total, se sabe mirando la última si ha llegado entero o
-- si falta la mitad. Un esquema a medias dado por entero es exactamente la
-- equivocación que este fichero viene a arreglar.
cuerpo as (
  select * from ddl_cabecera
  union all select * from ddl_ext
  union all select * from ddl_tablas
  union all select * from ddl_restr
  union all select * from ddl_restr2
  union all select * from ddl_indices
  union all select * from ddl_vistas
  union all select * from ddl_funciones
  union all select * from ddl_triggers
  union all select * from ddl_rls
  union all select * from ddl_politicas
  union all select * from ddl_grants
  union all select * from ddl_grants_col
  union all select * from ddl_grants_fn
  union all select * from ddl_coment_tabla
  union all select * from ddl_coment_col
  union all select * from ddl_buckets
  union all select * from ddl_pol_storage
),
todo as (
  select 0 as bloque, '' as orden2, 0 as sub,
         '-- RADIOGRAFIA ARIZA SAT · la ultima linea tiene que ser la numero '||
         (select count(*) from cuerpo)||'. Si no lo es, el resultado viene cortado.' as linea
  union all select * from cuerpo
)

select row_number() over (order by bloque, orden2, sub, linea) - 1 as n,
       linea
  from todo
 order by n;
