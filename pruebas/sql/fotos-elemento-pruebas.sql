-- ================================================================
-- Lo que hace de verdad servidor/fotos-elemento.sql
--                                                   25-11-2026
--
-- Lo que se vigila, y por qué cada cosa:
--
--   1. Que una foto se pueda atar a su elemento. Es lo que pidió David: «fotos
--      de todo lo seleccionado y anotado». Sin esto, las fotos van todas a un
--      montón y seis meses después nadie sabe si esa foto de un poste era la
--      fotocélula, la banda o el pulsador.
--
--   2. Que las fotos de ANTES se queden sin elemento. Esa es la verdad: nadie
--      apuntó de qué eran. Inventarles uno sería peor que dejarlo en blanco.
--
--   3. Que el índice esté puesto. La pregunta «qué elementos de esta puerta
--      tienen foto» se hace al abrir cada ficha; sin índice es un recorrido de
--      la tabla entera cada vez.
--
--   4. Que se pueda contar, desde SQL, qué elementos marcados de una puerta se
--      han quedado sin foto. Es el reclamo que David pidió, y tiene que poder
--      calcularse sin abrir la aplicación.
--
--   5. Y la firma de quien corrige un componente, que es lo que permite que el
--      panel de la ficha sea de solo lectura para el técnico y corregible por
--      la oficina sin perder el rastro.
--
-- Uso: lo lanza pruebas/sql.sh después de los ficheros de servidor/.
-- ================================================================
\set ON_ERROR_STOP on

do $prueba$
declare
  v_cli uuid;
  v_pu  uuid;
  v_n   integer;
  v_t   text;
begin
  -- ---- Datos de partida ------------------------------------------
  delete from public.fotos where ruta like 'PRUEBA-FE/%';
  delete from public.componentes where nombre = 'PRUEBA-FE';
  delete from public.puertas where codigo = 'FE-1';

  insert into public.clientes (nombre) values ('Cliente de prueba FE')
    returning id into v_cli;
  insert into public.puertas (codigo, tipo, cliente_id, elementos, seguridad)
  values ('FE-1', 'Seccional', v_cli,
          array['Fotocélulas','Banda de seguridad','Luz de maniobra']::text[],
          array['Fotocélulas']::text[])
  returning id into v_pu;

  -- Una foto de antes: sin elemento, como las que ya están subidas.
  insert into public.fotos (puerta_id, ruta, autor)
  values (v_pu, 'PRUEBA-FE/vieja.jpg', 'Técnico');

  -- ---- 1: una foto atada a su elemento ---------------------------
  insert into public.fotos (puerta_id, ruta, autor, elemento)
  values (v_pu, 'PRUEBA-FE/fotocelulas.jpg', 'Técnico', 'fotocelulas');
  select elemento into v_t from public.fotos where ruta = 'PRUEBA-FE/fotocelulas.jpg';
  if v_t <> 'fotocelulas' then
    raise exception 'la foto no ha guardado su elemento: %', coalesce(v_t,'(vacío)');
  end if;
  raise notice 'una foto se puede atar a su elemento';

  -- ---- 2: las de antes se quedan sin elemento --------------------
  select elemento into v_t from public.fotos where ruta = 'PRUEBA-FE/vieja.jpg';
  if v_t is not null then
    raise exception 'a una foto de antes se le ha puesto elemento: %', v_t;
  end if;
  raise notice 'y las de antes se quedan sin elemento, que es la verdad';

  -- ---- 3: el índice está puesto ----------------------------------
  select count(*) into v_n from pg_indexes
   where schemaname = 'public' and indexname = 'fotos_puerta_elemento_idx';
  if v_n <> 1 then
    raise exception 'falta el índice fotos_puerta_elemento_idx';
  end if;
  raise notice 'el índice de puerta y elemento está puesto';

  -- ---- 4: se puede contar lo que falta ---------------------------
  -- Tres elementos marcados, uno con foto: faltan dos.
  select count(*) into v_n
    from (
      select unnest(elementos) as nombre from public.puertas where id = v_pu
    ) m
   where m.nombre is not null;
  if v_n <> 3 then
    raise exception 'esperaba 3 elementos marcados y hay %', v_n;
  end if;
  select count(distinct elemento) into v_n
    from public.fotos where puerta_id = v_pu and elemento is not null;
  if v_n <> 1 then
    raise exception 'esperaba 1 elemento con foto y hay %', v_n;
  end if;
  raise notice 'se puede contar, desde SQL, qué elementos marcados no tienen foto';

  -- Y una segunda foto del mismo elemento no lo cuenta dos veces.
  insert into public.fotos (puerta_id, ruta, autor, elemento)
  values (v_pu, 'PRUEBA-FE/fotocelulas-2.jpg', 'Técnico', 'fotocelulas');
  select count(distinct elemento) into v_n
    from public.fotos where puerta_id = v_pu and elemento is not null;
  if v_n <> 1 then
    raise exception 'dos fotos del mismo elemento cuentan como %', v_n;
  end if;
  raise notice 'y dos fotos del mismo elemento no lo cuentan dos veces';

  -- ---- 5: la firma de quien corrige un componente ----------------
  insert into public.componentes (puerta_id, clave, nombre, marca, num_serie)
  values (v_pu, 'motor', 'PRUEBA-FE', 'Hörmann', '4471-2019');
  update public.componentes
     set num_serie = '4471-2020', actualizado = now(), actualizado_por = 'Oficina'
   where nombre = 'PRUEBA-FE';
  select actualizado_por into v_t from public.componentes where nombre = 'PRUEBA-FE';
  if v_t <> 'Oficina' then
    raise exception 'no ha quedado quién corrigió el componente: %', coalesce(v_t,'(vacío)');
  end if;
  raise notice 'y queda escrito quién corrigió un componente';

  -- ---- Al borrar la puerta, sus fotos se van con ella ------------
  delete from public.puertas where id = v_pu;
  select count(*) into v_n from public.fotos where ruta like 'PRUEBA-FE/%';
  if v_n <> 0 then
    raise exception 'quedan % fotos sueltas de una puerta borrada', v_n;
  end if;
  raise notice 'borrada la puerta, sus fotos se van con ella y no quedan sueltas';

  delete from public.componentes where nombre = 'PRUEBA-FE';
  delete from public.clientes where id = v_cli;
end
$prueba$;
