-- ================================================================
-- Lo que hace de verdad servidor/elementos-unificados.sql
--                                                   25-11-2026
--
-- Lo que se vigila, y por qué cada cosa:
--
--   1. Que un expediente NUEVO nazca con catalogo = 'familia47'. Si no, la
--      aplicación le da el catálogo de cuatro familias de antes y David vuelve
--      a ver en el expediente elementos distintos de los que marcó en la ficha,
--      que es la queja de la que sale todo esto.
--
--   2. Que los expedientes que YA EXISTÍAN se queden sin marca. Sus respuestas
--      están guardadas con las claves viejas y hay claves que no se
--      corresponden una a una. A uno ya emitido, cambiarle el catálogo es
--      cambiar lo que dice un documento firmado por el cliente.
--
--   3. Que el número de expediente siga siendo correlativo por año y único. Es
--      lo que David pidió como «número serial único e identificativo por
--      expediente», y ya existía: aquí se comprueba que este fichero no lo ha
--      roto al reescribir la función.
--
--   4. Que la base de datos siga sin dejar dos expedientes con la misma
--      referencia, ni aunque se intente a mano.
--
-- Uso: lo lanza pruebas/sql.sh después de los ficheros de servidor/.
-- ================================================================
\set ON_ERROR_STOP on

do $prueba$
declare
  v_pu    uuid;
  v_cli   uuid;
  v_r     json;
  v_id    uuid;
  v_cat   text;
  v_num   integer;
  v_ref   text;
  v_anio  integer;
  v_n     integer;
begin
  -- ---- Datos de partida ------------------------------------------
  delete from public.expedientes where referencia like 'EXP-%' and notas = 'PRUEBA-EU';
  delete from public.puertas where codigo = 'EU-1';

  insert into public.clientes (nombre) values ('Cliente de prueba EU')
    returning id into v_cli;
  insert into public.puertas (codigo, tipo, cliente_id)
    values ('EU-1', 'Seccional', v_cli) returning id into v_pu;

  -- Un expediente de los de ANTES: insertado a mano, sin pasar por la función.
  insert into public.expedientes (referencia, numero, puerta_id, cliente_id,
                                  situacion, familia, notas)
  values ('EXP-1999-001', 1, v_pu, v_cli, 'adecuacion', 'industrial', 'PRUEBA-EU');

  -- ---- 2: el de antes se queda sin marca -------------------------
  select catalogo into v_cat from public.expedientes where referencia = 'EXP-1999-001';
  if v_cat is not null then
    raise exception 'un expediente de antes ha salido con catalogo = %', v_cat;
  end if;
  raise notice 'un expediente de antes se queda con el catálogo de antes';

  -- ---- 1: el nuevo nace con el catálogo nuevo --------------------
  -- La función es SECURITY DEFINER y comprueba es_equipo(). En el andamio de
  -- pruebas esa función devuelve cierto, que es lo que hace falta aquí.
  v_r := public.crear_expediente(v_pu, 'nueva_instalador', 'industrial', null);
  if (v_r ->> 'ok') <> 'true' then
    raise exception 'crear_expediente no ha podido: %', v_r;
  end if;
  v_id := (v_r ->> 'id')::uuid;
  select catalogo, numero, referencia into v_cat, v_num, v_ref
    from public.expedientes where id = v_id;
  if v_cat <> 'familia47' then
    raise exception 'el expediente nuevo ha salido con catalogo = %', coalesce(v_cat,'(vacío)');
  end if;
  raise notice 'un expediente nuevo nace con el catálogo de las 11 familias';

  update public.expedientes set notas = 'PRUEBA-EU' where id = v_id;

  -- ---- 3: el número sigue siendo correlativo del año -------------
  v_anio := extract(year from (now() at time zone 'Europe/Madrid'))::int;
  if v_ref <> 'EXP-' || v_anio || '-' || lpad(v_num::text, 3, '0') then
    raise exception 'la referencia no cuadra con el número: % y %', v_ref, v_num;
  end if;
  raise notice 'y con su número correlativo del año, con el formato de siempre';

  -- Y el siguiente es el siguiente, no el mismo.
  v_r := public.crear_expediente(v_pu, 'nueva_instalador', 'industrial', null);
  update public.expedientes set notas = 'PRUEBA-EU'
   where id = (v_r ->> 'id')::uuid;
  select numero into v_n from public.expedientes where id = (v_r ->> 'id')::uuid;
  if v_n <> v_num + 1 then
    raise exception 'el segundo expediente debía ser el %, y es el %', v_num+1, v_n;
  end if;
  raise notice 'dos expedientes seguidos no comparten número';

  -- ---- 4: la referencia es única de verdad -----------------------
  begin
    insert into public.expedientes (referencia, numero, puerta_id, cliente_id,
                                    situacion, familia, notas)
    values (v_ref, 999, v_pu, v_cli, 'adecuacion', 'industrial', 'PRUEBA-EU');
    raise exception 'la base de datos ha dejado repetir la referencia %', v_ref;
  exception when unique_violation then
    raise notice 'y la base de datos no deja repetir una referencia';
  end;

  -- ---- Ejecutarlo dos veces no cambia nada -----------------------
  select count(*) into v_n from public.expedientes where notas = 'PRUEBA-EU';
  if v_n <> 3 then
    raise exception 'esperaba 3 expedientes de prueba y hay %', v_n;
  end if;
  raise notice 'quedan los tres expedientes de prueba que tenían que quedar';

  delete from public.expedientes where notas = 'PRUEBA-EU';
  delete from public.puertas where id = v_pu;
  delete from public.clientes where id = v_cli;
end
$prueba$;
