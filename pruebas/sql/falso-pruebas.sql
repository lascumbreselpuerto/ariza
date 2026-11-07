-- ============================================================================
-- Pruebas del desplazamiento en falso
--
-- POR QUÉ EXISTEN
-- Esto cambia una regla de facturación, así que lo que hay que vigilar son los
-- números, y en las dos direcciones:
--
--   · que un falso NUEVO cobre el viaje y NADA más: ni mano de obra de un
--     trabajo que no se hizo, ni materiales;
--   · que su COSTE siga contando entero, para que el margen salga negativo y se
--     pueda ver lo que cuestan al año los viajes en balde;
--   · que un falso YA CERRADO antes del 07-11-2026 valga EXACTAMENTE lo que
--     valía. Eso es dinero ya facturado, y recalcularlo no puede moverlo.
-- ============================================================================

insert into public.clientes (id, nombre) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'Cliente de los viajes en balde')
  on conflict (id) do nothing;

delete from public.valoraciones where aviso_id::text like 'aaaaaaaa-1111-0000-0000-00000000000%';
delete from public.materiales  where aviso_id::text like 'aaaaaaaa-1111-0000-0000-00000000000%';
delete from public.avisos      where id::text       like 'aaaaaaaa-1111-0000-0000-00000000000%';

-- Tarifas conocidas, para que las cuentas salgan a mano
update public.tarifas set precio_hora = 40, coste_hora = 20,
       ruta1_importe = 30, ruta1_coste = 10, recargo_material = 0;

insert into public.avisos (id, tipo, estado, cliente_id, ruta, horas, num_tecnicos,
                           falso, falso_motivo, cerrado) values
  -- el viaje en balde de hoy: una hora de coche y nadie en la nave
  ('aaaaaaaa-1111-0000-0000-00000000000a','averia','cerrado',
   'aaaaaaaa-1111-0000-0000-000000000001','ruta1', 1, 1,
   true, 'No había nadie en la nave y el teléfono daba apagado', now()),
  -- uno de los de ANTES, del tipo viejo y cerrado en octubre
  ('aaaaaaaa-1111-0000-0000-00000000000b','falso','cerrado',
   'aaaaaaaa-1111-0000-0000-000000000001','ruta1', 1, 1,
   false, null, timestamptz '2026-10-15 12:00:00+02'),
  -- y una avería normal de referencia
  ('aaaaaaaa-1111-0000-0000-00000000000c','averia','cerrado',
   'aaaaaaaa-1111-0000-0000-000000000001','ruta1', 1, 1,
   false, null, now());

do $$
declare
  n integer;
  r record;
  v_antes numeric;
begin
  -- ---- 1. Las columnas están -----------------------------------------------
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='avisos'
     and column_name in ('falso','falso_motivo','falso_resuelto','falso_nueva_id');
  if n <> 4 then raise exception 'Faltan columnas del falso: % de 4', n; end if;
  raise notice 'las cuatro columnas del desplazamiento en falso existen';

  -- ---- 2. Un falso sin explicación no entra --------------------------------
  begin
    update public.avisos set falso_motivo = null
     where id = 'aaaaaaaa-1111-0000-0000-00000000000a';
    raise exception 'Se ha dejado guardar un viaje en balde sin explicar';
  exception when check_violation then null;
  end;
  begin
    update public.avisos set falso = true, falso_motivo = '   '
     where id = 'aaaaaaaa-1111-0000-0000-00000000000c';
    raise exception 'Se ha dejado explicar un viaje en balde con tres espacios';
  exception when check_violation then null;
  end;
  raise notice 'un viaje en balde sin explicar no entra por ninguna puerta';

  -- ---- 3. La referencia: una avería normal ---------------------------------
  perform public.valorar_aviso('aaaaaaaa-1111-0000-0000-00000000000c');
  select imp_mano_obra, imp_desplazamiento, imp_total, coste_total into r
    from public.valoraciones where aviso_id = 'aaaaaaaa-1111-0000-0000-00000000000c';
  if r.imp_total <> 70 then
    raise exception 'La avería de referencia: 40 de hora y 30 de ruta son 70, y salen %', r.imp_total;
  end if;
  raise notice 'una averia normal de 1 h con ruta1 se factura a 70';

  -- ---- 4. LA QUE IMPORTA: el falso nuevo cobra el viaje y nada más ---------
  perform public.valorar_aviso('aaaaaaaa-1111-0000-0000-00000000000a');
  select imp_mano_obra, imp_desplazamiento, imp_materiales, imp_total, coste_total, margen into r
    from public.valoraciones where aviso_id = 'aaaaaaaa-1111-0000-0000-00000000000a';
  if r.imp_mano_obra <> 0 then
    raise exception 'Un viaje en balde no lleva mano de obra, y salen %', r.imp_mano_obra;
  end if;
  if r.imp_desplazamiento <> 30 then
    raise exception 'El viaje sí se cobra: son 30 y salen %', r.imp_desplazamiento;
  end if;
  if r.imp_total <> 30 then
    raise exception 'El total de un viaje en balde son 30 y salen %', r.imp_total;
  end if;
  raise notice 'un viaje en balde se cobra a 30: el desplazamiento y nada mas';

  -- ---- 5. El coste sigue contando entero -----------------------------------
  -- Si el coste se pusiera a cero con el importe, un viaje en balde parecería
  -- gratis y la empresa no vería nunca lo que le cuestan.
  if r.coste_total <> 30 then
    raise exception 'El coste: 1 h a 20 más 10 de ruta son 30, y salen %', r.coste_total;
  end if;
  if r.margen <> 0 then
    raise exception 'El margen de este viaje tendría que ser 0 (30 menos 30) y es %', r.margen;
  end if;
  raise notice 'el coste del viaje en balde cuenta entero: 30 cobrados, 30 costados';

  -- ---- 6. Ni los materiales -----------------------------------------------
  insert into public.materiales (aviso_id, descripcion, cantidad, coste, precio)
    values ('aaaaaaaa-1111-0000-0000-00000000000a','Un emisor que se dejó', 1, 20, 40);
  perform public.valorar_aviso('aaaaaaaa-1111-0000-0000-00000000000a');
  select imp_materiales, imp_total, coste_total into r from public.valoraciones
   where aviso_id = 'aaaaaaaa-1111-0000-0000-00000000000a';
  if r.imp_materiales <> 0 then
    raise exception 'En un viaje en balde no se factura material, y salen %', r.imp_materiales;
  end if;
  if r.coste_total <> 50 then
    raise exception 'El coste sí cuenta el material: 30 más 20 son 50, y salen %', r.coste_total;
  end if;
  raise notice 'el material de un viaje en balde no se factura, pero su coste cuenta';

  -- ---- 7. LA OTRA QUE IMPORTA: lo de antes no se mueve ---------------------
  -- Un falso cerrado en octubre se facturó entero, con su mano de obra. Si la
  -- regla nueva lo alcanzara, recalcularlo le borraría 40 € a una factura
  -- emitida.
  perform public.valorar_aviso('aaaaaaaa-1111-0000-0000-00000000000b');
  select imp_mano_obra, imp_total into r from public.valoraciones
   where aviso_id = 'aaaaaaaa-1111-0000-0000-00000000000b';
  if r.imp_mano_obra <> 40 then
    raise exception 'Un falso de octubre llevaba 40 de mano de obra y ahora lleva %', r.imp_mano_obra;
  end if;
  if r.imp_total <> 70 then
    raise exception 'Un falso de octubre valía 70 y ahora vale %', r.imp_total;
  end if;
  v_antes := r.imp_total;
  perform public.valorar_aviso('aaaaaaaa-1111-0000-0000-00000000000b');
  select imp_total into r from public.valoraciones
   where aviso_id = 'aaaaaaaa-1111-0000-0000-00000000000b';
  if r.imp_total <> v_antes then
    raise exception 'Volver a calcularlo lo ha movido: % a %', v_antes, r.imp_total;
  end if;
  raise notice 'un falso cerrado en octubre sigue valiendo 70, con su mano de obra';

  -- ---- 8. La lista de las que hay que volver a concertar -------------------
  select count(*) into n from public.falsos_pendientes
   where id = 'aaaaaaaa-1111-0000-0000-00000000000a';
  if n <> 1 then raise exception 'El viaje en balde de hoy tiene que salir en la lista'; end if;
  select se_cobra, nos_cuesta into r from public.falsos_pendientes
   where id = 'aaaaaaaa-1111-0000-0000-00000000000a';
  if r.se_cobra <> 30 or r.nos_cuesta <> 50 then
    raise exception 'La lista no trae los importes: cobra % y cuesta %', r.se_cobra, r.nos_cuesta;
  end if;
  -- y sale de la lista cuando alguien dice que ya se ha vuelto a quedar
  update public.avisos set falso_resuelto = true
   where id = 'aaaaaaaa-1111-0000-0000-00000000000a';
  select count(*) into n from public.falsos_pendientes
   where id = 'aaaaaaaa-1111-0000-0000-00000000000a';
  if n <> 0 then raise exception 'Una vez gestionada, no debe seguir en la lista'; end if;
  raise notice 'la lista saca los viajes en balde pendientes, con lo que se cobra y lo que cuesta';

  -- ---- 9. La cuenta del mes ------------------------------------------------
  select viajes, cobrado, costado into r from public.falsos_resumen
   where mes = date_trunc('month', now())::date;
  if r.viajes <> 1 then raise exception 'Este mes hay 1 viaje en balde y salen %', r.viajes; end if;
  if r.cobrado <> 30 or r.costado <> 50 then
    raise exception 'La cuenta del mes no cuadra: cobrado % costado %', r.cobrado, r.costado;
  end if;
  raise notice 'la cuenta del mes dice lo cobrado y lo costado en viajes en balde';
end $$;
