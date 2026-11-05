-- ============================================================================
-- Pruebas de la toma de medidas de la visita comercial
--
-- POR QUÉ EXISTEN
-- Una medida mal apuntada no se nota hasta que el proveedor pregunta, y
-- entonces ya hay una puerta pedida. Lo que se comprueba aquí:
--
--   · que los límites paran el error de dedo (40 mm en vez de 4000) sin parar
--     el hueco raro de verdad;
--   · que varios huecos caben en la misma visita, que es para lo que se hizo;
--   · que al borrar un aviso se van sus medidas y no quedan filas huérfanas
--     apuntando a una visita que ya no existe;
--   · que una comercial cerrada sin ninguna medida aparece en la lista de la
--     oficina, porque es un viaje hecho del que no sale presupuesto;
--   · y la de siempre: que la comercial sigue valorándose en cero. La toma de
--     medidas no la convierte en una visita que se factura.
-- ============================================================================

insert into public.clientes (id, nombre) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'Cliente de las medidas')
  on conflict (id) do nothing;

delete from public.medidas      where aviso_id::text like 'eeeeeeee-0000-0000-0000-00000000000%';
delete from public.valoraciones where aviso_id::text like 'eeeeeeee-0000-0000-0000-00000000000%';
delete from public.avisos       where id::text       like 'eeeeeeee-0000-0000-0000-00000000000%';

insert into public.avisos (id, tipo, estado, cliente_id, horas, num_tecnicos, ruta, cerrado) values
  -- comercial con tres huecos medidos
  ('eeeeeeee-0000-0000-0000-00000000000a','comercial','cerrado',
   'eeeeeeee-0000-0000-0000-000000000001',2,1,'ruta2', now()),
  -- comercial cerrada sin medir nada: tiene que salir en la lista
  ('eeeeeeee-0000-0000-0000-00000000000b','comercial','cerrado',
   'eeeeeeee-0000-0000-0000-000000000001',1,1,'ruta2', now()),
  -- la que se borra al final, para ver que se lleva sus medidas por delante
  ('eeeeeeee-0000-0000-0000-00000000000c','comercial','cerrado',
   'eeeeeeee-0000-0000-0000-000000000001',1,1,'ruta2', now());

select public.valorar_aviso('eeeeeeee-0000-0000-0000-00000000000a');

do $$
declare
  v public.valoraciones%rowtype;
  n integer;
begin
  -- ---- 1. La tabla y sus columnas están ----------------------------------
  select count(*) into n from information_schema.tables
   where table_schema='public' and table_name='medidas';
  if n <> 1 then raise exception 'Falta la tabla public.medidas'; end if;
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='medidas'
     and column_name in ('aviso_id','orden','ubicacion','tipo_puerta','ancho_mm','alto_mm',
                         'dintel_mm','lateral_mm','situacion','electricidad','auxiliares',
                         'notas','sin_medir','sin_medir_motivo');
  if n <> 14 then raise exception 'A public.medidas le faltan columnas: hay % de 14', n; end if;
  raise notice 'la tabla medidas existe con sus catorce columnas';

  -- ---- 2. Tres huecos en la misma visita ---------------------------------
  insert into public.medidas (aviso_id, orden, ubicacion, tipo_puerta, ancho_mm, alto_mm,
                              dintel_mm, situacion, electricidad, auxiliares) values
    ('eeeeeeee-0000-0000-0000-00000000000a',0,'Nave trasera, porton izquierdo','Seccional',
     4000,4200,600,'hueco','existe','Dos mandos y fotocelulas exteriores'),
    ('eeeeeeee-0000-0000-0000-00000000000a',1,'Nave trasera, porton derecho','Seccional',
     4000,4200,600,'hueco','existe',null),
    ('eeeeeeee-0000-0000-0000-00000000000a',2,'Entrada de oficinas','Peatonal automática',
     1600,2200,null,'manual','por_comprobar','Lector de proximidad');
  select count(*) into n from public.medidas
   where aviso_id = 'eeeeeeee-0000-0000-0000-00000000000a';
  if n <> 3 then raise exception 'Una visita tiene que poder llevar tres huecos y lleva %', n; end if;
  raise notice 'tres huecos medidos en la misma visita comercial';

  -- ---- 3. El error de dedo no entra --------------------------------------
  -- 40 en vez de 4000. Si esto se guarda, se pasa al presupuesto tal cual.
  begin
    insert into public.medidas (aviso_id, ancho_mm, alto_mm)
      values ('eeeeeeee-0000-0000-0000-00000000000a', 40, 4200);
    raise exception 'Se ha dejado guardar un ancho de 40 mm';
  exception when check_violation then null;
  end;
  begin
    insert into public.medidas (aviso_id, ancho_mm, alto_mm)
      values ('eeeeeeee-0000-0000-0000-00000000000a', 4000, 99999);
    raise exception 'Se ha dejado guardar un alto de 99.999 mm';
  exception when check_violation then null;
  end;
  raise notice 'un ancho de 40 mm y un alto de 99.999 mm no entran';

  -- ---- 4. Pero el hueco raro de verdad sí ---------------------------------
  -- Un portón industrial de 12 m de ancho existe, y un dintel de 0 también:
  -- los límites están para el error de dedo, no para decidir qué es normal.
  insert into public.medidas (aviso_id, ubicacion, ancho_mm, alto_mm, dintel_mm)
    values ('eeeeeeee-0000-0000-0000-00000000000a','Muelle de carga',12000,5500,0);
  raise notice 'un porton de 12 m con dintel cero se guarda: el limite es para el error, no para el hueco';
  delete from public.medidas where ubicacion = 'Muelle de carga';

  -- ---- 5. Sin medir, pero dicho ------------------------------------------
  -- El hueco al que no se pudo llegar se apunta igual, sin medidas y con el
  -- motivo: así la oficina sabe que hay que volver, en vez de no saber nada.
  insert into public.medidas (aviso_id, ubicacion, sin_medir, sin_medir_motivo)
    values ('eeeeeeee-0000-0000-0000-00000000000a','Puerta del almacen alto',
            true,'Estaba la mercancia delante y no se podia acceder');
  select count(*) into n from public.medidas
   where aviso_id = 'eeeeeeee-0000-0000-0000-00000000000a' and sin_medir;
  if n <> 1 then raise exception 'El hueco sin medir no se ha guardado'; end if;
  raise notice 'un hueco sin medir se guarda con su motivo y sin inventar medidas';
  delete from public.medidas where sin_medir;

  -- ---- 6. LA QUE IMPORTA: la comercial sigue a cero -----------------------
  -- Medir no es facturar. Si esto cambiara, se le estaría cobrando al cliente
  -- la visita en la que se le fue a ofertar. Se vuelve a valorar AHORA, con
  -- los tres huecos ya guardados: valorarla antes no probaría nada.
  perform public.valorar_aviso('eeeeeeee-0000-0000-0000-00000000000a');
  select * into v from public.valoraciones
   where aviso_id = 'eeeeeeee-0000-0000-0000-00000000000a';
  if v.imp_total is distinct from 0.00 then
    raise exception 'Una comercial con medidas tiene que seguir a cero y ha salido %', v.imp_total;
  end if;
  if v.coste_total <= 0 then
    raise exception 'La comercial no se cobra, pero cuesta: coste %', v.coste_total;
  end if;
  raise notice 'la comercial con medidas sigue valorandose en cero, y su coste sigue contando';

  -- ---- 7. La lista de las que no trajeron ninguna medida ------------------
  select count(*) into n from public.comerciales_sin_medidas
   where id = 'eeeeeeee-0000-0000-0000-00000000000b';
  if n <> 1 then raise exception 'Una comercial cerrada sin medidas no sale en la lista'; end if;
  select count(*) into n from public.comerciales_sin_medidas
   where id = 'eeeeeeee-0000-0000-0000-00000000000a';
  if n <> 0 then raise exception 'Una comercial CON medidas no debe salir en la lista'; end if;
  raise notice 'la comercial cerrada sin medidas sale en la lista de la oficina, y la que midio no';

  -- ---- 8. Al borrar la visita se van sus medidas --------------------------
  insert into public.medidas (aviso_id, ubicacion, ancho_mm, alto_mm)
    values ('eeeeeeee-0000-0000-0000-00000000000c','Hueco de la visita que se borra',3000,3000);
  delete from public.avisos where id = 'eeeeeeee-0000-0000-0000-00000000000c';
  select count(*) into n from public.medidas
   where aviso_id = 'eeeeeeee-0000-0000-0000-00000000000c';
  if n <> 0 then raise exception 'Han quedado % medidas de una visita borrada', n; end if;
  raise notice 'al borrar la visita se van sus medidas: no quedan filas huerfanas';
end $$;
