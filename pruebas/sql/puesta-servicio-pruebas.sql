-- ============================================================================
-- Pruebas de la puesta en servicio
--
-- POR QUÉ EXISTEN
-- Este cambio toca la regla que decide si una visita se cobra, y eso tiene dos
-- maneras de salir mal, las dos caras:
--
--   · que una puesta en servicio nueva se facture, cuando David ha dicho que no
--     es facturable porque la obra ya se facturó;
--   · que una puesta en servicio ANTIGUA, ya cerrada y facturada, se quede en
--     cero euros la próxima vez que alguien recalcule esa obra. Eso le borra el
--     importe a una factura emitida, y es el peor de los dos.
--
-- Las dos están probadas aquí, una en cada dirección.
--
-- Los datos: 2 h, un técnico, ruta 2 (45 €), sin material.
--   precio_hora 45  →  mano de obra 90,00
--   ruta 2          →  desplazamiento 45,00
--   total si se cobra  →  135,00
--   coste: 2 h × 22 €/h = 44,00 de mano + 15,00 de ruta = 59,00
-- ============================================================================

update public.tarifas
   set precio_hora = 45, coste_hora = 22, minimo_horas = 1,
       desplazamiento_fijo = 30, precio_km = 0.45, coste_km = 0.2,
       recargo_material = 40, iva = 21,
       ruta1_nombre = 'El Puerto', ruta1_importe = 30, ruta1_coste = 10,
       ruta2_nombre = 'Jerez',     ruta2_importe = 45, ruta2_coste = 15
 where id = 1;

insert into public.clientes (id, nombre) values
  ('dddddddd-0000-0000-0000-000000000001', 'Cliente de los remates')
  on conflict (id) do nothing;

delete from public.valoraciones where aviso_id::text like 'dddddddd-0000-0000-0000-00000000000%';
update public.avisos set instalacion_id = null
 where instalacion_id::text like 'dddddddd-0000-0000-0000-00000000000%';
delete from public.avisos where id::text like 'dddddddd-0000-0000-0000-00000000000%';

insert into public.avisos (id, tipo, subtipo, estado, cliente_id, horas, num_tecnicos, ruta,
                           cerrado, pendiente, pendiente_texto) values
  -- la obra: instalación cerrada con algo pendiente
  ('dddddddd-0000-0000-0000-00000000000a','instalacion','puerta_automatica','cerrado',
   'dddddddd-0000-0000-0000-000000000001',8,2,'ruta2', now(), true,
   'Falta programar el cuadro: no había corriente definitiva'),
  -- el remate de esa obra: NO se factura. Nace ABIERTO a propósito: lo que saca
  -- a una obra de la lista de remates pendientes es un remate cerrado, y eso se
  -- comprueba más abajo cerrándolo.
  ('dddddddd-0000-0000-0000-00000000000b','puesta_servicio',null,'asignado',
   'dddddddd-0000-0000-0000-000000000001',2,1,'ruta2', null, false, null),
  -- otro remate, pero por causa del cliente y marcado repercutible: SÍ se factura
  ('dddddddd-0000-0000-0000-00000000000c','puesta_servicio',null,'cerrado',
   'dddddddd-0000-0000-0000-000000000001',2,1,'ruta2', now(), false, null),
  -- una obra cerrada SIN nada pendiente: no sale en la lista de remates
  ('dddddddd-0000-0000-0000-00000000000d','instalacion','puerta_automatica','cerrado',
   'dddddddd-0000-0000-0000-000000000001',8,2,'ruta2', now(), false, null),
  -- Y LA QUE IMPORTA: una puesta en servicio de las de antes, cerrada y
  -- facturada antes del 05-11-2026. Tiene que seguir valiendo 135,00.
  ('dddddddd-0000-0000-0000-00000000000e','puesta_servicio',null,'cerrado',
   'dddddddd-0000-0000-0000-000000000001',2,1,'ruta2',
   timestamptz '2026-10-20 13:00:00+02', false, null);

update public.avisos
   set instalacion_id = 'dddddddd-0000-0000-0000-00000000000a',
       ps_causa = 'sin_corriente',
       ps_causa_detalle = 'La obra no tenía corriente definitiva el día del montaje'
 where id = 'dddddddd-0000-0000-0000-00000000000b';

update public.avisos
   set instalacion_id = 'dddddddd-0000-0000-0000-00000000000d',
       ps_causa = 'remates', ps_causa_detalle = 'Esperando el solado',
       repercutible = true
 where id = 'dddddddd-0000-0000-0000-00000000000c';

select public.valorar_aviso('dddddddd-0000-0000-0000-00000000000b');
select public.valorar_aviso('dddddddd-0000-0000-0000-00000000000c');
select public.valorar_aviso('dddddddd-0000-0000-0000-00000000000e');

do $$
declare
  v public.valoraciones%rowtype;
  n integer;
  r record;
begin
  -- ---- 1. Las columnas están ----------------------------------------------
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='avisos'
     and column_name in ('instalacion_id','ps_causa','ps_causa_detalle','repercutible');
  if n <> 4 then raise exception 'A avisos le faltan columnas de la puesta en servicio: % de 4', n; end if;
  raise notice 'las cuatro columnas de la puesta en servicio existen';

  -- ---- 2. Una causa inventada no entra ------------------------------------
  begin
    update public.avisos set ps_causa = 'Albanileria'
     where id = 'dddddddd-0000-0000-0000-00000000000b';
    raise exception 'Se ha dejado guardar «Albanileria» con mayúscula: no se contaría en ninguna fila';
  exception when check_violation then null;
  end;
  raise notice 'una causa mal escrita no entra';

  -- ---- 3. LA QUE IMPORTA (ida): el remate nuevo NO se factura --------------
  select * into v from public.valoraciones where aviso_id = 'dddddddd-0000-0000-0000-00000000000b';
  if v.imp_total is distinct from 0.00 then
    raise exception 'Una puesta en servicio tiene que salir a cero y ha salido %', v.imp_total;
  end if;
  -- y aun así cuesta: 2 h a 22 € más los 15 € de la ruta 2
  if v.coste_total is distinct from 59.00 then
    raise exception 'El coste del remate son 59,00 y ha salido %', v.coste_total;
  end if;
  if v.margen >= 0 then
    raise exception 'Un remate que no se cobra tiene margen negativo, y ha salido %', v.margen;
  end if;
  raise notice 'un remate nuevo no se factura, y su coste de 59,00 sigue contando';

  -- ---- 4. Pero si la oficina lo marca repercutible, sí ---------------------
  select * into v from public.valoraciones where aviso_id = 'dddddddd-0000-0000-0000-00000000000c';
  if v.imp_total is distinct from 135.00 then
    raise exception 'Un remate marcado repercutible se cobra entero, 135,00, y ha salido %', v.imp_total;
  end if;
  raise notice 'un remate marcado repercutible se cobra entero: lo decide la oficina';

  -- ---- 5. LA QUE IMPORTA (vuelta): lo ya cerrado no se mueve --------------
  -- Esta es la que protege una factura emitida. Si algún día alguien quita la
  -- condición de la fecha «para simplificar», esta comprobación se pone roja.
  select * into v from public.valoraciones where aviso_id = 'dddddddd-0000-0000-0000-00000000000e';
  if v.imp_total is distinct from 135.00 then
    raise exception 'Una puesta en servicio cerrada antes del 05-11-2026 vale 135,00 y ha salido %',
      v.imp_total;
  end if;
  raise notice 'una puesta en servicio anterior al 05-11-2026 vale EXACTAMENTE lo que valia';

  -- ---- 6. La obra con remate pendiente sale en la lista -------------------
  -- El remate está apuntado pero sin cerrar, así que la obra sigue a medias.
  select count(*) into n from public.obras_con_remate_pendiente
   where id = 'dddddddd-0000-0000-0000-00000000000a';
  if n <> 1 then raise exception 'La obra con remate pendiente no sale en la lista'; end if;
  select count(*) into n from public.obras_con_remate_pendiente
   where id = 'dddddddd-0000-0000-0000-00000000000d';
  if n <> 0 then raise exception 'Una obra cerrada sin nada pendiente no debe salir en la lista'; end if;
  raise notice 'la obra con remate pendiente sale en la lista, y la que quedo terminada no';

  -- ---- 7. Y deja de salir cuando el remate se hace ------------------------
  -- Con el remate solo APUNTADO la obra sigue en la lista: lo que la saca es un
  -- remate cerrado. Si bastara con apuntarlo, una obra desaparecería de la lista
  -- el día que alguien abre el aviso, sin que nadie haya ido a terminarla.
  update public.avisos set cerrado = now(), estado = 'cerrado'
   where id = 'dddddddd-0000-0000-0000-00000000000b';
  select count(*) into n from public.obras_con_remate_pendiente
   where id = 'dddddddd-0000-0000-0000-00000000000a';
  if n <> 0 then raise exception 'Con el remate ya cerrado, la obra no debe seguir en la lista'; end if;
  raise notice 'lo que saca una obra de la lista es un remate CERRADO, no uno apuntado';
  -- y la valoración del remate, ya cerrado hoy, sigue en cero
  perform public.valorar_aviso('dddddddd-0000-0000-0000-00000000000b');
  select * into v from public.valoraciones where aviso_id = 'dddddddd-0000-0000-0000-00000000000b';
  if v.imp_total is distinct from 0.00 then
    raise exception 'El remate cerrado hoy tiene que seguir a cero y ha salido %', v.imp_total;
  end if;
  raise notice 'y cerrado hoy sigue a cero: el cierre no lo convierte en facturable';

  -- ---- 8. La cuenta de lo que cuestan los remates -------------------------
  select * into r from public.remates_por_causa where causa = 'sin_corriente';
  if r.visitas <> 1 or r.coste is distinct from 59.00 or r.facturado is distinct from 0.00 then
    raise exception 'La cuenta por causa «sin_corriente» no cuadra: % visitas, coste %, facturado %',
      r.visitas, r.coste, r.facturado;
  end if;
  select * into r from public.remates_por_causa where causa = 'remates';
  if r.repercutidas <> 1 or r.facturado is distinct from 135.00 then
    raise exception 'La cuenta por causa «remates» no cuadra: % repercutidas, facturado %',
      r.repercutidas, r.facturado;
  end if;
  raise notice 'la cuenta por causa cuadra: lo que cuesta cada motivo y lo que se repercutio';

  -- ---- 9. Al borrar la obra, el remate no se va con ella ------------------
  -- El remate es una visita hecha, con sus horas y su coste. Si se borrara con
  -- la obra, desaparecería trabajo pagado de las cuentas del año.
  delete from public.avisos where id = 'dddddddd-0000-0000-0000-00000000000d';
  select count(*) into n from public.avisos where id = 'dddddddd-0000-0000-0000-00000000000c';
  if n <> 1 then raise exception 'Al borrar la obra se ha llevado su remate por delante'; end if;
  select instalacion_id into r from public.avisos where id = 'dddddddd-0000-0000-0000-00000000000c';
  if r.instalacion_id is not null then
    raise exception 'El remate tiene que quedarse apuntando a nada, y apunta a %', r.instalacion_id;
  end if;
  raise notice 'al borrar la obra, su remate se queda: es trabajo hecho que cuenta igual';
end $$;
