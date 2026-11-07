-- ============================================================================
-- Pruebas de los periféricos y de «otros trabajos»
--
-- POR QUÉ EXISTEN
-- Lo que hay que vigilar aquí no es el caso bonito:
--
--   · Que se puedan guardar VARIOS periféricos en la misma visita. Si solo
--     cupiera uno, la mitad del trabajo del día se quedaría sin apuntar.
--   · Que una clave inventada no entre. Una clave que la aplicación no sabe
--     nombrar se convierte en una visita de la que nadie sabe qué se montó.
--   · Que «otro» sin explicar y «otros trabajos» sin explicar no entren por
--     ninguna puerta, ni siquiera cargando datos a mano.
--   · Que las asistencias de antes del 06-11-2026, con las columnas vacías,
--     sigan guardándose y leyéndose igual.
-- ============================================================================

insert into public.clientes (id, nombre) values
  ('cccccccc-0000-0000-0000-000000000001', 'Cliente de los periféricos')
  on conflict (id) do nothing;

delete from public.avisos where id::text like 'cccccccc-0000-0000-0000-00000000000%';

insert into public.avisos (id, tipo, subtipo, estado, cliente_id,
                           perifericos, perifericos_otro, cerrado) values
  -- una instalación con dos fotocélulas y una banda: el caso de todos los días
  ('cccccccc-0000-0000-0000-00000000000a','instalacion','perifericos','cerrado',
   'cccccccc-0000-0000-0000-000000000001',
   array['foto_sinc','foto_comp','banda'], null, now()),
  -- la misma pieza, pero atendida como avería: tiene que poder registrarse igual
  ('cccccccc-0000-0000-0000-00000000000b','averia','perifericos','cerrado',
   'cccccccc-0000-0000-0000-000000000001',
   array['foto_sinc'], null, now()),
  -- una de las de antes: sin ninguna de las columnas nuevas
  ('cccccccc-0000-0000-0000-00000000000c','averia','averia','cerrado',
   'cccccccc-0000-0000-0000-000000000001', null, null, now());

do $$
declare
  n integer;
  r record;
begin
  -- ---- 1. Las columnas están ----------------------------------------------
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='avisos'
     and column_name in ('perifericos','perifericos_otro','subtipo_detalle');
  if n <> 3 then raise exception 'Faltan columnas de periféricos: % de 3', n; end if;
  raise notice 'las tres columnas existen';

  -- ---- 2. Varios periféricos en la misma visita ---------------------------
  select array_length(perifericos, 1) as cuantos into r from public.avisos
   where id = 'cccccccc-0000-0000-0000-00000000000a';
  if r.cuantos <> 3 then
    raise exception 'Dos fotocélulas y una banda son 3, y se han guardado %', r.cuantos;
  end if;
  raise notice 'tres periféricos de una misma visita se guardan los tres';

  -- ---- 3. El mismo trabajo, como avería y como instalación ----------------
  -- Decisión de David el 06-11-2026: el tipo dice cómo se factura, el subtipo
  -- qué se hizo. Si uno de los dos no entrara, el motor quemado se registraría
  -- como lo que no es.
  select count(*) into n from public.avisos
   where id::text like 'cccccccc-0000-0000-0000-00000000000%'
     and subtipo = 'perifericos' and tipo in ('averia','instalacion');
  if n <> 2 then raise exception 'El subtipo de periféricos tiene que valer en los dos tipos'; end if;
  raise notice 'periféricos vale en avería y en instalación';

  -- ---- 4. Una clave inventada no entra ------------------------------------
  begin
    update public.avisos set perifericos = array['fotocelula_de_las_mias']
     where id = 'cccccccc-0000-0000-0000-00000000000b';
    raise exception 'Se ha dejado guardar un periférico que no existe en la lista';
  exception when check_violation then null;
  end;
  -- y tampoco una lista con uno bueno y uno malo mezclados, que es el caso que
  -- se cuela cuando la comprobación solo mira el primer elemento
  begin
    update public.avisos set perifericos = array['banda','lo_que_sea']
     where id = 'cccccccc-0000-0000-0000-00000000000b';
    raise exception 'Se ha dejado guardar una lista con una clave mala dentro';
  exception when check_violation then null;
  end;
  begin
    update public.avisos set perifericos = array[]::text[]
     where id = 'cccccccc-0000-0000-0000-00000000000b';
    raise exception 'Se ha dejado guardar una lista vacía: o hay periféricos o es null';
  exception when check_violation then null;
  end;
  raise notice 'ni una clave inventada, ni mezclada con una buena, ni una lista vacía';

  -- ---- 5. LA QUE IMPORTA: «otro» sin explicar no entra --------------------
  -- Las pantallas ya lo piden, pero una asistencia creada desde otro sitio se
  -- colaría, y lo que entra sin explicación se queda sin explicación para
  -- siempre.
  begin
    update public.avisos set perifericos = array['banda','otro'], perifericos_otro = null
     where id = 'cccccccc-0000-0000-0000-00000000000b';
    raise exception 'Se ha dejado guardar «otro» sin decir qué es';
  exception when check_violation then null;
  end;
  begin
    update public.avisos set perifericos = array['banda','otro'], perifericos_otro = '   '
     where id = 'cccccccc-0000-0000-0000-00000000000b';
    raise exception 'Se ha dejado guardar «otro» explicado con tres espacios';
  exception when check_violation then null;
  end;
  update public.avisos set perifericos = array['banda','otro'],
                           perifericos_otro = 'bucle de masa de la rampa'
   where id = 'cccccccc-0000-0000-0000-00000000000b';
  raise notice '«otro» entra solo cuando se dice qué es';

  -- ---- 6. «Otros trabajos» sin explicar tampoco ---------------------------
  begin
    update public.avisos set subtipo = 'otros', perifericos = null,
                             perifericos_otro = null, subtipo_detalle = null
     where id = 'cccccccc-0000-0000-0000-00000000000b';
    raise exception 'Se ha dejado guardar «otros trabajos» sin explicar cuál';
  exception when check_violation then null;
  end;
  update public.avisos set subtipo = 'otros', perifericos = null, perifericos_otro = null,
                           subtipo_detalle = 'Reponer la señalización de la nave 3'
   where id = 'cccccccc-0000-0000-0000-00000000000b';
  raise notice '«otros trabajos» entra con lo que escribe la oficina';

  -- ---- 7. Las de antes del 06-11-2026 siguen valiendo ---------------------
  -- Si el check obligara a algo en las columnas nuevas, no se podría ni
  -- corregir un teléfono en una avería de octubre.
  select perifericos, subtipo_detalle into r from public.avisos
   where id = 'cccccccc-0000-0000-0000-00000000000c';
  if r.perifericos is not null or r.subtipo_detalle is not null then
    raise exception 'Una avería de las de antes no puede haberse rellenado sola';
  end if;
  update public.avisos set descripcion = 'Se corrige el teléfono'
   where id = 'cccccccc-0000-0000-0000-00000000000c';
  raise notice 'una avería de antes se sigue pudiendo guardar sin tocar nada nuevo';

  -- ---- 8. La cuenta de qué periférico se monta más ------------------------
  select visitas, como_instalacion into r from public.perifericos_mas_montados
   where periferico = 'foto_sinc';
  if r.visitas <> 1 then
    raise exception 'La fotocélula sincronizada se montó en 1 visita viva y salen %', r.visitas;
  end if;
  if r.como_instalacion <> 1 then
    raise exception 'Esa visita era una instalación y la vista no lo separa bien';
  end if;
  select count(*) into n from public.perifericos_mas_montados where periferico = 'banda';
  if n <> 1 then raise exception 'La banda tiene que salir en la cuenta'; end if;
  raise notice 'la cuenta de periféricos separa las averías de las instalaciones';

  -- ---- 9. Una visita anulada no cuenta ------------------------------------
  -- Si contara, el almacén se llenaría de piezas de visitas que no se hicieron.
  update public.avisos set anulada = true, anulada_motivo = 'Prueba'
   where id = 'cccccccc-0000-0000-0000-00000000000a';
  select count(*) into n from public.perifericos_mas_montados where periferico = 'foto_comp';
  if n <> 0 then raise exception 'Una visita anulada no puede contar en la cuenta'; end if;
  raise notice 'una visita anulada no cuenta en la cuenta de periféricos';

  -- ---- 10. El cajón de «otros trabajos», a la vista -----------------------
  select count(*) into n from public.otros_trabajos
   where id = 'cccccccc-0000-0000-0000-00000000000b';
  if n <> 1 then raise exception 'Una visita de «otros trabajos» tiene que salir en la lista'; end if;
  select subtipo_detalle into r from public.otros_trabajos
   where id = 'cccccccc-0000-0000-0000-00000000000b';
  if r.subtipo_detalle not like '%nave 3%' then
    raise exception 'La lista tiene que traer lo que escribió la oficina';
  end if;
  raise notice 'las visitas de «otros trabajos» se pueden repasar con lo que se escribió';
end $$;
