-- ================================================================
-- Pruebas de servidor/informes-mensuales.sql, contra Postgres de verdad.
--
-- QUÉ SE VIGILA, Y POR QUÉ CADA COSA
--
--  1. Que las tres funciones estén.
--
--  2. Que informes_disponibles() NO tenga efectos. Esta es la que importa:
--     la aplicación la llama en cada carga para saber si los informes están
--     instalados. Mi primera versión preguntaba llamando a informe_margen con
--     un mes imposible, y eso manda un correo de verdad: habría salido un
--     correo al administrador cada vez que alguien abría la aplicación. Aquí
--     se comprueba que esta función no escribe nada y que no pide ningún
--     envío.
--
--  3. Que las dos de informe NO manden nada si falta la configuración del
--     correo. Si la mandaran igual, el servidor se llenaría de peticiones a
--     una dirección vacía.
--
--  4. Y que el mes por defecto sea el ANTERIOR, no el actual: el día 1 de
--     diciembre se manda noviembre, que ya está cerrado.
--
-- Lo que NO se prueba aquí es el contenido del correo: lo arma la función de
-- correo (servidor/avisar.ts), que es otro programa y vive en Supabase.
--
-- 27-11-2026
-- ================================================================

do $$
declare
  n int; v_def text; v_guardado text;
begin
  -- 1. Las tres funciones
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('informe_margen','informe_eliminados','informes_disponibles');
  if n <> 3 then raise exception 'Faltan funciones de los informes: hay % de 3', n; end if;
  raise notice 'las tres funciones están: los dos informes y la de preguntar';

  -- 2. La de preguntar no hace nada
  if public.informes_disponibles() is not true then
    raise exception 'informes_disponibles() tendría que decir true';
  end if;
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'informes_disponibles';
  if v_def ilike '%http_post%' or v_def ilike '%insert%' or v_def ilike '%update%' then
    raise exception 'informes_disponibles() tiene efectos, y la aplicación la llama en cada '
      'carga: eso mandaría correos solo por abrir la aplicación';
  end if;
  raise notice 'y la de preguntar NO manda nada ni escribe nada: solo existe';

  -- 3. Sin configuración del correo, no se manda
  select valor into v_guardado from public.config_interna where clave = 'avisos_url';
  delete from public.config_interna where clave = 'avisos_url';
  if public.informe_margen('2026-11') is not false then
    raise exception 'Sin avisos_url, informe_margen tendría que decir false y no mandar nada';
  end if;
  if public.informe_eliminados('2026-11') is not false then
    raise exception 'Sin avisos_url, informe_eliminados tendría que decir false';
  end if;
  raise notice 'sin la configuración del correo no se manda nada, y se dice';
  if v_guardado is not null then
    insert into public.config_interna (clave, valor) values ('avisos_url', v_guardado)
      on conflict (clave) do update set valor = excluded.valor;
  end if;

  -- 4. El mes por defecto es el anterior
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'informe_margen';
  if v_def not ilike '%- interval ''1 month''%' then
    raise exception 'informe_margen no resta un mes: mandaría el mes en curso, que está a medias';
  end if;
  raise notice 'y sin mes se manda el ANTERIOR: el que ya está cerrado';
end $$;
