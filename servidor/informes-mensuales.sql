-- ================================================================
-- SAFE2DOOR · LOS DOS INFORMES MENSUALES AL ADMINISTRADOR
--
-- QUÉ RESUELVE
--
-- David, 27-11-2026: «[los partes no facturados] en apartado diferente que se
-- enviará mensualmente por correo al administrador. Además también se enviará
-- por correo al administrador los resultados de los márgenes mensualmente.
-- Pero en documentos diferentes y correos diferentes. Llamémoslo "partes
-- eliminados" y "Margen de Noviembre".»
--
-- Y eligió: automáticos el día 1, y además un botón para mandarlos cuando
-- quiera.
--
-- DOS CORREOS, NO UNO
--
-- Son dos cosas distintas y se leen en momentos distintos. El margen es la
-- marcha del negocio y se lee con calma; los partes eliminados son dinero
-- puesto que no se cobró y se leen para preguntar. Juntarlos en un correo
-- haría que el segundo no se leyera nunca.
--
-- CÓMO FUNCIONA
--
-- La base de datos no manda correos: le pide a la función de correo (avisar.ts,
-- la misma que manda los partes y los avisos de revisiones) que lo haga. Aquí
-- hay dos funciones que hacen esa petición, y dos tareas programadas que las
-- llaman el día 1 de cada mes con el mes que acaba de cerrarse.
--
-- QUÉ MES SE MANDA
--
-- El ANTERIOR, no el actual. El día 1 de diciembre se manda noviembre, que es
-- el mes que ya está cerrado y no va a cambiar. Mandar el mes en curso sería
-- mandar un número a medias que al día siguiente es otro.
--
-- LAS DOS TAREAS
--
-- Se programan con nombres propios, «ariza-margen-mensual» y
-- «ariza-eliminados-mensual», y antes se quitan por si ya existían: así este
-- fichero se puede ejecutar las veces que haga falta sin acabar con la misma
-- tarea cuatro veces.
--
-- La hora es UTC, que es como pg_cron lee el reloj: a las 07:10 y 07:20 UTC,
-- que en España son las 08:10 y 08:20 en invierno y las 09:10 y 09:20 en
-- verano. Separadas diez minutos a propósito: dos correos a la vez se leen como
-- uno.
--
-- SI pg_cron NO ESTUVIERA DISPONIBLE
--
-- El fichero no se cae: la parte de las tareas va dentro de un bloque que
-- comprueba que la extensión está. Los botones de la aplicación funcionan
-- igual, y los informes se mandan a mano.
--
-- Se puede ejecutar las veces que haga falta.
--
-- 27-11-2026
-- ================================================================

-- ============================================================================
-- 1. El margen del mes
-- ============================================================================
create or replace function public.informe_margen(p_mes text default null)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sec text;
  v_url text;
  v_mes text;
begin
  /* Lo puede pedir la oficina y la administración desde el botón, y lo pide la
     tarea programada, que entra como el dueño de la base y no tiene perfil: por
     eso no se exige es_gestion() cuando no hay usuario. */
  if auth.uid() is not null and not public.es_gestion() then return false; end if;

  /* Sin mes, el anterior: es el que está cerrado y no va a cambiar. */
  v_mes := coalesce(nullif(btrim(p_mes), ''),
    to_char((now() at time zone 'Europe/Madrid')::date - interval '1 month', 'YYYY-MM'));

  select valor into v_url from public.config_interna where clave = 'avisos_url';
  select valor into v_sec from public.config_interna where clave = 'avisos_secreto';
  if v_url is null or v_sec is null then return false; end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-ariza-secreto', v_sec),
    body    := jsonb_build_object('tipo','margen','mes', v_mes)
  );
  return true;
end $$;

comment on function public.informe_margen(text) is
  'Pide a la función de correo que mande el informe del margen de un mes al '
  'administrador. Sin mes, el anterior: el que ya está cerrado. La llaman el '
  'botón de Gestión y la tarea programada del día 1.';

-- ============================================================================
-- 2. Los partes eliminados del mes
-- ============================================================================
create or replace function public.informe_eliminados(p_mes text default null)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sec text;
  v_url text;
  v_mes text;
begin
  if auth.uid() is not null and not public.es_gestion() then return false; end if;

  v_mes := coalesce(nullif(btrim(p_mes), ''),
    to_char((now() at time zone 'Europe/Madrid')::date - interval '1 month', 'YYYY-MM'));

  select valor into v_url from public.config_interna where clave = 'avisos_url';
  select valor into v_sec from public.config_interna where clave = 'avisos_secreto';
  if v_url is null or v_sec is null then return false; end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-ariza-secreto', v_sec),
    body    := jsonb_build_object('tipo','eliminados','mes', v_mes)
  );
  return true;
end $$;

comment on function public.informe_eliminados(text) is
  'Pide a la función de correo que mande el informe de los partes que no se '
  'facturaron en un mes, con su coste. Sin mes, el anterior. La llaman el botón '
  'de Gestión y la tarea programada del día 1.';

-- ============================================================================
-- 2 bis. Una función para preguntar si esto está instalado, sin mandar nada
--
-- POR QUÉ EXISTE, Y ES IMPORTANTE
--
-- La aplicación necesita saber si los informes están disponibles para enseñar o
-- esconder sus botones. Mi primera versión lo preguntaba llamando a
-- informe_margen con un mes imposible... y eso MANDA UN CORREO. Habría salido
-- un correo al administrador en cada carga de la aplicación, con el margen del
-- año 1900. Lo cazó la prueba del banco al ver cinco informes pedidos sin que
-- nadie hubiera tocado un botón.
--
-- Así que la pregunta se hace con esta función, que no hace nada: existe o no
-- existe, y eso es toda la respuesta.
-- ============================================================================
create or replace function public.informes_disponibles()
returns boolean
language sql
immutable
as $$ select true $$;

comment on function public.informes_disponibles() is
  'Devuelve true y nada más. La aplicación la llama para saber si los informes '
  'mensuales están instalados, sin tener que llamar a una función que manda un '
  'correo de verdad.';

grant execute on function public.informes_disponibles() to authenticated;
grant execute on function public.informes_disponibles() to anon;
grant execute on function public.informes_disponibles() to service_role;

grant execute on function public.informe_margen(text) to authenticated;
grant execute on function public.informe_margen(text) to anon;
grant execute on function public.informe_margen(text) to service_role;
grant execute on function public.informe_eliminados(text) to authenticated;
grant execute on function public.informe_eliminados(text) to anon;
grant execute on function public.informe_eliminados(text) to service_role;

-- ============================================================================
-- 3. Las dos tareas del día 1
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron no está instalado: los informes NO saldrán solos. Los '
      'botones de Gestión funcionan igual. Para instalarla: Database > Extensions '
      'en el panel de Supabase, y volver a ejecutar este fichero.';
    return;
  end if;

  -- Se quitan por si ya estaban, para no acabar con la misma tarea repetida
  begin perform cron.unschedule('ariza-margen-mensual'); exception when others then null; end;
  begin perform cron.unschedule('ariza-eliminados-mensual'); exception when others then null; end;

  perform cron.schedule('ariza-margen-mensual', '10 7 1 * *',
    $cmd$select public.informe_margen();$cmd$);
  perform cron.schedule('ariza-eliminados-mensual', '20 7 1 * *',
    $cmd$select public.informe_eliminados();$cmd$);

  raise notice 'Programados: el día 1 de cada mes, a las 07:10 y 07:20 UTC, con el mes anterior.';
end $$;

-- ============================================================================
-- Comprobación rápida:
--
--   select public.informes_disponibles();   -- tiene que decir true
--   select jobname, schedule, command, active from cron.job
--    where jobname like 'ariza-%';
--
--   -- y para mandarlos ahora mismo, sin esperar al día 1:
--   select public.informe_margen('2026-11');
--   select public.informe_eliminados('2026-11');
-- ============================================================================
