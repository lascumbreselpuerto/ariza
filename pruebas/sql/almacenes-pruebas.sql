-- ============================================================================
-- Comprueba servidor/almacenes.sql: los almacenes de la oficina y el rastro de
-- la baja de material.                                            08-11-2026
--
-- Lo que se vigila, en orden de importancia:
--   1. que una baja no pueda existir sin motivo escrito ni sin almacén de
--      origen: sin eso, el rastro no sirve de nada;
--   2. que roto y perdido sean motivos distintos, y que el motivo viejo siga
--      valiendo para el histórico, que no se reescribe;
--   3. que el coste de la baja salga calculado, que es la cifra que hoy no
--      aparece en ninguna cuenta;
--   4. que el resumen por mes y almacén cuadre con lo dado de baja;
--   5. que no quepan dos almacenes activos con el mismo nombre, ni un almacén
--      con un tipo inventado, ni uno sin nombre;
--   6. y que un almacén retirado deje de estorbar sin borrar su histórico.
-- ============================================================================
do $$
declare
  v_art uuid; v_nave uuid; v_furgo uuid; v_obra uuid; v_av uuid; v_mov uuid;
  v_n int; v_coste numeric; v_txt text; v_fallo boolean;
begin
  -- ---------------------------------------------------------------- preparar
  insert into public.articulos (descripcion, unidad, activo, coste)
       values ('Banda para probar bajas', 'ud', true, 38.50)
    returning id into v_art;

  insert into public.ubicaciones (nombre, tipo, activo)
       values ('Nave de prueba bajas', 'nave', true) returning id into v_nave;
  insert into public.ubicaciones (nombre, tipo, activo)
       values ('Furgo 1 de prueba', 'furgoneta', true) returning id into v_furgo;

  -- 5. LOS ALMACENES ---------------------------------------------------------
  -- un almacén sin nombre con cuerpo no entra
  v_fallo := false;
  begin
    insert into public.ubicaciones (nombre, tipo) values ('a', 'otro');
  exception when check_violation then v_fallo := true;
  end;
  if not v_fallo then raise exception 'ha dejado crear un almacen llamado «a»'; end if;
  raise notice 'un almacen sin nombre con cuerpo no entra';

  -- un tipo inventado tampoco
  v_fallo := false;
  begin
    insert into public.ubicaciones (nombre, tipo) values ('Sitio raro', 'camion');
  exception when check_violation then v_fallo := true;
  end;
  if not v_fallo then raise exception 'ha dejado crear un almacen de tipo «camion»'; end if;
  raise notice 'un almacen con un tipo inventado tampoco';

  -- dos almacenes activos con el mismo nombre, no: nadie sabria en cual esta
  v_fallo := false;
  begin
    insert into public.ubicaciones (nombre, tipo) values ('  furgo 1 DE PRUEBA ', 'furgoneta');
  exception when unique_violation then v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'ha dejado dos almacenes activos con el mismo nombre';
  end if;
  raise notice 'dos almacenes activos no pueden llamarse igual, ni con otras mayusculas';

  -- el taller, el trastero o el contenedor de obra: almacenes que no son de nadie
  insert into public.ubicaciones (nombre, tipo, nota, activo)
       values ('Contenedor obra Jerez', 'otro', 'Hasta marzo', true)
    returning id into v_obra;
  raise notice 'un almacen que no es de nadie se puede crear: taller, trastero, contenedor';

  -- 1. LA BAJA SIN EXPLICAR --------------------------------------------------
  -- primero entra material, que si no no hay nada que dar de baja
  insert into public.movimientos_material (articulo_id, cantidad, hasta, motivo, nota, creado_por)
       values (v_art, 10, v_furgo, 'compra', 'albarán de prueba', 'Prueba');

  v_fallo := false;
  begin
    insert into public.movimientos_material (articulo_id, cantidad, desde, motivo, creado_por)
         values (v_art, 1, v_furgo, 'baja_roto', 'Prueba');
  exception when check_violation then v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'ha dejado dar de baja material SIN MOTIVO ESCRITO';
  end if;
  raise notice 'una baja sin motivo escrito no entra: es lo que pidio David';

  v_fallo := false;
  begin
    insert into public.movimientos_material (articulo_id, cantidad, desde, motivo, nota, creado_por)
         values (v_art, 1, v_furgo, 'baja_roto', 'ab', 'Prueba');
  exception when check_violation then v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'ha dejado una baja con un motivo de dos letras';
  end if;
  raise notice 'y tampoco con un motivo de dos letras, que no explica nada';

  -- y una baja «de la nada», sin almacén, tampoco: no se sabria que descuadra
  v_fallo := false;
  begin
    insert into public.movimientos_material (articulo_id, cantidad, motivo, nota, creado_por)
         values (v_art, 1, 'baja_perdido', 'No aparece por ninguna parte', 'Prueba');
  exception when check_violation then v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'ha dejado una baja sin decir de que almacen sale';
  end if;
  raise notice 'una baja sin almacen de origen no entra';

  -- 2. ROTO Y PERDIDO SON DISTINTOS -----------------------------------------
  insert into public.avisos (tipo, estado, prioridad, creado)
       values ('averia', 'asignado', 'normal', now()) returning id into v_av;

  insert into public.movimientos_material
         (articulo_id, cantidad, desde, motivo, nota, aviso_id, creado_por)
       values (v_art, 2, v_furgo, 'baja_roto',
               'Se partió el perfil al montarla, venía con una grieta', v_av, 'Juan')
    returning id into v_mov;
  raise notice 'una baja por ROTO, con su motivo y su asistencia, se guarda';

  insert into public.movimientos_material
         (articulo_id, cantidad, desde, motivo, nota, creado_por)
       values (v_art, 1, v_furgo, 'baja_perdido',
               'No aparece en la furgoneta desde la obra de Rota', 'Juan');
  raise notice 'y una baja por PERDIDO va por separado, que es otro problema';

  -- un motivo de baja inventado no entra
  v_fallo := false;
  begin
    insert into public.movimientos_material (articulo_id, cantidad, desde, motivo, nota, creado_por)
         values (v_art, 1, v_furgo, 'baja_robado', 'Se lo llevaron', 'Juan');
  exception when check_violation then v_fallo := true;
  end;
  if not v_fallo then raise exception 'ha dejado un motivo de baja que no existe'; end if;
  raise notice 'un motivo de baja inventado no entra';

  -- el motivo viejo sigue valiendo: el historico no se reescribe
  insert into public.movimientos_material (articulo_id, cantidad, desde, motivo, creado_por)
       values (v_art, 1, v_furgo, 'baja', 'Histórico');
  raise notice 'el motivo viejo «baja» sigue valiendo, sin motivo escrito: lo de antes no se reescribe';

  -- 3. EL COSTE DE LO QUE SE ROMPE ------------------------------------------
  select count(*), round(sum(coste_total), 2) into v_n, v_coste
    from public.bajas_material where articulo_id = v_art;
  -- tres bajas (una rota de 2 unidades, una perdida y una del motivo viejo),
  -- que son CUATRO unidades a 38,50 = 154,00
  if v_n <> 3 then
    raise exception 'la vista de bajas deberia traer 3 filas y trae %', v_n;
  end if;
  if v_coste <> 154.00 then
    raise exception 'el coste de las bajas deberia ser 154,00 y es %', v_coste;
  end if;
  raise notice 'la vista pone cifra a lo que se rompe: 3 bajas, 4 unidades, 154,00 euros';

  select motivo_nombre into v_txt from public.bajas_material where id = v_mov;
  if v_txt <> 'Roto' then raise exception 'el motivo deberia leerse «Roto» y se lee «%»', v_txt; end if;
  raise notice 'y cada baja dice en claro si fue rota, perdida u otra cosa';

  -- la baja lleva el almacen y de que asistencia viene
  select almacen into v_txt from public.bajas_material where id = v_mov;
  if v_txt <> 'Furgo 1 de prueba' then
    raise exception 'la baja deberia decir de que almacen sale y dice «%»', v_txt;
  end if;
  select count(*) into v_n from public.bajas_material where id = v_mov and aviso_id = v_av;
  if v_n <> 1 then raise exception 'la baja no guarda de que asistencia viene'; end if;
  raise notice 'con su almacen y la asistencia de la que viene, que es lo que pidio David';

  -- 4. EL RESUMEN POR MES Y ALMACÉN ----------------------------------------
  select count(*) into v_n from public.resumen_bajas()
   where almacen = 'Furgo 1 de prueba';
  if v_n < 2 then
    raise exception 'el resumen deberia separar los motivos de esa furgoneta y trae %', v_n;
  end if;
  select round(sum(coste_total), 2) into v_coste from public.resumen_bajas()
   where almacen = 'Furgo 1 de prueba';
  if v_coste <> 154.00 then
    raise exception 'el resumen del almacen deberia sumar 154,00 y suma %', v_coste;
  end if;
  raise notice 'el resumen por mes y almacen cuadra con lo dado de baja';

  -- 6. UN MOVIMIENTO NO SE CAMBIA NI SE BORRA -------------------------------
  -- (la regla es de permisos y aquí no hay sesión, así que se comprueba que
  --  las políticas existen y dicen lo que tienen que decir)
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'movimientos_material'
     and policyname = 'nadie cambia movimientos';
  if v_n <> 1 then raise exception 'falta la regla de que un movimiento no se cambia'; end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'movimientos_material'
     and policyname = 'equipo borra lo del parte'
     and qual like '%obra%' and qual like '%averia%';
  if v_n <> 1 then
    raise exception 'la regla de borrado deberia dejar solo lo del parte';
  end if;
  raise notice 'un movimiento no se cambia, y solo se borra lo que rehace un parte';

  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'ubicaciones'
     and policyname in ('gestion crea ubicaciones', 'gestion cambia ubicaciones');
  if v_n <> 2 then raise exception 'los almacenes no estan reservados a la oficina'; end if;
  raise notice 'los almacenes solo los crea y cambia la oficina';

  -- un almacén retirado deja de estorbar, pero su histórico se queda
  update public.ubicaciones set activo = false where id = v_obra;
  select count(*) into v_n from public.ubicaciones where id = v_obra;
  if v_n <> 1 then raise exception 'retirar un almacen no deberia borrarlo'; end if;
  -- y entonces su nombre se puede volver a usar, porque el único es de activos
  insert into public.ubicaciones (nombre, tipo) values ('Contenedor obra Jerez', 'otro');
  raise notice 'un almacen retirado se queda en el historico y libera su nombre';

  -- ---------------------------------------------------------------- limpiar
  delete from public.movimientos_material where articulo_id = v_art;
  delete from public.avisos where id = v_av;
  delete from public.articulos where id = v_art;
  delete from public.ubicaciones
   where nombre in ('Nave de prueba bajas', 'Furgo 1 de prueba', 'Contenedor obra Jerez');
  raise notice 'TODO EN VERDE: los almacenes de la oficina y el rastro de las bajas';
end $$;
