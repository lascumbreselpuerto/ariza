-- ============================================================================
-- Pruebas del «no se sabe» del año y del instalador
--
-- POR QUÉ EXISTEN
-- Lo que hay que vigilar aquí es que no se puedan decir dos cosas a la vez. Si
-- una puerta pudiera tener el año escrito Y la marca de «no se sabe», la ficha
-- enseñaría una cosa y el papel la otra, y nadie sabría cuál es la buena.
--
-- Y lo de siempre: que las puertas que ya existen sigan guardándose igual.
-- ============================================================================

insert into public.clientes (id, nombre) values
  ('dddddddd-0000-0000-0000-000000000001', 'Cliente del no se sabe')
  on conflict (id) do nothing;

delete from public.puertas where id::text like 'dddddddd-0000-0000-0000-00000000000%';

insert into public.puertas (id, cliente_id, codigo, tipo, anio, instalador) values
  -- una puerta de las de siempre, con su año y su instalador
  ('dddddddd-0000-0000-0000-00000000000a','dddddddd-0000-0000-0000-000000000001',
   'AR-9100','Seccional', 2019, 'Ariza Puertas y Automatismos'),
  -- y una de los años ochenta, de la que no se sabe nada
  ('dddddddd-0000-0000-0000-00000000000b','dddddddd-0000-0000-0000-000000000001',
   'AR-9101','Basculante', null, null);

do $$
declare
  n integer;
  r record;
begin
  -- ---- 1. Las columnas están, y nacen apagadas -----------------------------
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='puertas'
     and column_name in ('anio_desconocido','instalador_desconocido');
  if n <> 2 then raise exception 'Faltan columnas del «no se sabe»: % de 2', n; end if;
  select anio_desconocido, instalador_desconocido into r from public.puertas
   where id = 'dddddddd-0000-0000-0000-00000000000a';
  if r.anio_desconocido or r.instalador_desconocido then
    raise exception 'Una puerta nueva no puede nacer con el año dado por desconocido';
  end if;
  raise notice 'las dos columnas existen y nacen apagadas';

  -- ---- 2. La puerta antigua: se marca lo que no se sabe --------------------
  update public.puertas
     set anio_desconocido = true, instalador_desconocido = true
   where id = 'dddddddd-0000-0000-0000-00000000000b';
  select anio, instalador, anio_desconocido into r from public.puertas
   where id = 'dddddddd-0000-0000-0000-00000000000b';
  if not r.anio_desconocido then raise exception 'No se ha guardado el «no se sabe»'; end if;
  if r.anio is not null then raise exception 'Un año desconocido no puede tener año'; end if;
  raise notice 'una puerta sin datos se puede marcar como desconocida';

  -- ---- 3. LA QUE IMPORTA: no se pueden decir las dos cosas -----------------
  -- Marcada «no se sabe» y con el año escrito: una de las dos es mentira, y la
  -- ficha enseñaría una y los papeles la otra.
  begin
    update public.puertas set anio = 1985
     where id = 'dddddddd-0000-0000-0000-00000000000b';
    raise exception 'Se ha dejado poner un año en una puerta marcada como de año desconocido';
  exception when check_violation then null;
  end;
  begin
    update public.puertas set instalador = 'Alguien'
     where id = 'dddddddd-0000-0000-0000-00000000000b';
    raise exception 'Se ha dejado poner instalador en una puerta marcada como desconocido';
  exception when check_violation then null;
  end;
  -- y al revés: marcar desconocido una puerta que tiene el año escrito
  begin
    update public.puertas set anio_desconocido = true
     where id = 'dddddddd-0000-0000-0000-00000000000a';
    raise exception 'Se ha dejado marcar «no se sabe» en una puerta que tiene el año puesto';
  exception when check_violation then null;
  end;
  raise notice 'el año y el «no se sabe» no pueden convivir, en ningún orden';

  -- ---- 4. Un instalador de espacios en blanco no cuenta como escrito -------
  -- Si contara, una puerta podría quedar marcada como desconocida y con un
  -- instalador de tres espacios, que en pantalla no se ve pero en la base está.
  update public.puertas set instalador = '   '
   where id = 'dddddddd-0000-0000-0000-00000000000a';
  update public.puertas set instalador_desconocido = true
   where id = 'dddddddd-0000-0000-0000-00000000000a';
  raise notice 'un instalador de espacios no impide marcar «no se sabe»';

  -- ---- 5. Se puede volver atrás -------------------------------------------
  -- El día que aparezca el dato, se desmarca y se escribe. Si esto no se
  -- pudiera, un «no se sabe» puesto por error sería para siempre.
  update public.puertas set anio_desconocido = false, anio = 1985
   where id = 'dddddddd-0000-0000-0000-00000000000b';
  select anio, anio_desconocido into r from public.puertas
   where id = 'dddddddd-0000-0000-0000-00000000000b';
  if r.anio <> 1985 or r.anio_desconocido then
    raise exception 'No se ha podido volver atrás: % / %', r.anio, r.anio_desconocido;
  end if;
  raise notice 'el día que aparece el dato se desmarca y se escribe';

  -- ---- 6. Las puertas de siempre siguen guardándose ------------------------
  update public.puertas set modelo = 'Rino 4'
   where id = 'dddddddd-0000-0000-0000-00000000000a';
  raise notice 'una puerta de las de antes se sigue guardando sin tocar nada nuevo';
end $$;
