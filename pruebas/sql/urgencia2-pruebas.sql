-- ============================================================================
-- Pruebas del recargo que elige la oficina
--
-- POR QUÉ EXISTEN
-- Esto es dinero, así que lo que hay que vigilar no es que funcione el caso
-- bonito, sino tres cosas:
--
--   · que el factor que escribe la oficina multiplique lo que tiene que
--     multiplicar: la mano de obra y el desplazamiento, su precio Y su coste;
--   · que el material NO lleve recargo: una banda de seguridad no vale el doble
--     por ser domingo;
--   · que una urgencia ya cerrada ANTES del 07-11-2026 valga exactamente lo
--     mismo si se vuelve a calcular. Eso es dinero ya facturado.
-- ============================================================================

insert into public.clientes (id, nombre) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'Cliente de las urgencias')
  on conflict (id) do nothing;

delete from public.valoraciones where aviso_id::text like 'eeeeeeee-0000-0000-0000-00000000000%';
delete from public.materiales  where aviso_id::text like 'eeeeeeee-0000-0000-0000-00000000000%';
delete from public.avisos      where id::text       like 'eeeeeeee-0000-0000-0000-00000000000%';

-- Tarifas conocidas, para que las cuentas salgan a mano
update public.tarifas set precio_hora = 40, coste_hora = 20,
       ruta1_importe = 30, ruta1_coste = 10, recargo_material = 0, iva = 21;

insert into public.avisos (id, tipo, estado, cliente_id, ruta, horas, num_tecnicos,
                           urgencia_modo, urgencia_factor, cerrado) values
  -- una visita normal, de referencia: 2 h a 40 €/h + ruta de 30 €
  ('eeeeeeee-0000-0000-0000-00000000000a','averia','cerrado',
   'eeeeeeee-0000-0000-0000-000000000001','ruta1', 2, 1, null, null, now()),
  -- la misma, pero urgencia de las dos cosas: ×3
  ('eeeeeeee-0000-0000-0000-00000000000b','urgencia','cerrado',
   'eeeeeeee-0000-0000-0000-000000000001','ruta1', 2, 1, 'ambas', 3, now()),
  -- y una urgencia DE ANTES: con factor y sin motivo
  ('eeeeeeee-0000-0000-0000-00000000000c','urgencia','cerrado',
   'eeeeeeee-0000-0000-0000-000000000001','ruta1', 2, 1, null, 2, now());

do $$
declare
  n integer;
  r record;
  v_antes numeric;
begin
  -- ---- 1. La columna y los multiplicadores existen ------------------------
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='avisos' and column_name='urgencia_modo';
  if n <> 1 then raise exception 'Falta avisos.urgencia_modo'; end if;
  select urgencia_x_uno, urgencia_x_dos into r from public.tarifas limit 1;
  if r.urgencia_x_uno <> 2 or r.urgencia_x_dos <> 3 then
    raise exception 'Los multiplicadores no son 2 y 3: % y %', r.urgencia_x_uno, r.urgencia_x_dos;
  end if;
  raise notice 'la columna del motivo existe y los multiplicadores son 2 y 3';

  -- ---- 2. Un motivo inventado no entra ------------------------------------
  begin
    update public.avisos set urgencia_modo = 'cuando_me_parezca'
     where id = 'eeeeeeee-0000-0000-0000-00000000000b';
    raise exception 'Se ha dejado guardar un motivo que no existe';
  exception when check_violation then null;
  end;
  -- y un motivo en una visita que no es urgencia tampoco
  begin
    update public.avisos set urgencia_modo = 'ambas'
     where id = 'eeeeeeee-0000-0000-0000-00000000000a';
    raise exception 'Se ha dejado poner motivo de urgencia en una avería';
  exception when check_violation then null;
  end;
  raise notice 'ni un motivo inventado ni un motivo en una visita que no es urgencia';

  -- ---- 3. LA QUE IMPORTA: lo que multiplica el factor ----------------------
  perform public.valorar_aviso('eeeeeeee-0000-0000-0000-00000000000a');
  select imp_mano_obra, imp_desplazamiento, imp_total, coste_total into r
    from public.valoraciones where aviso_id = 'eeeeeeee-0000-0000-0000-00000000000a';
  if r.imp_mano_obra <> 80 then raise exception 'La visita normal: 2 h a 40 son 80, y salen %', r.imp_mano_obra; end if;
  if r.imp_desplazamiento <> 30 then raise exception 'La ruta 1 son 30, y salen %', r.imp_desplazamiento; end if;
  if r.coste_total <> 50 then raise exception 'El coste: 2 h a 20 más 10 de ruta son 50, y salen %', r.coste_total; end if;
  raise notice 'la visita de referencia vale 110 y cuesta 50';

  perform public.valorar_aviso('eeeeeeee-0000-0000-0000-00000000000b');
  select imp_mano_obra, imp_desplazamiento, imp_total, coste_total into r
    from public.valoraciones where aviso_id = 'eeeeeeee-0000-0000-0000-00000000000b';
  if r.imp_mano_obra <> 240 then
    raise exception 'La urgencia ×3: 80 por 3 son 240, y salen %', r.imp_mano_obra;
  end if;
  if r.imp_desplazamiento <> 90 then
    raise exception 'El desplazamiento ×3: 30 por 3 son 90, y salen %', r.imp_desplazamiento;
  end if;
  -- Y el coste sube igual: si al técnico se le paga el triple por salir de
  -- noche, un margen que no lo cuente hace que las urgencias parezcan más
  -- rentables de lo que son.
  if r.coste_total <> 150 then
    raise exception 'El coste ×3: 2 h a 60 más 30 de ruta son 150, y salen %', r.coste_total;
  end if;
  raise notice 'el ×3 multiplica la mano de obra y el desplazamiento, precio y coste';

  -- ---- 4. El material NO lleva recargo -------------------------------------
  insert into public.materiales (aviso_id, descripcion, cantidad, coste, precio)
    values ('eeeeeeee-0000-0000-0000-00000000000b','Banda de seguridad', 1, 50, 100);
  perform public.valorar_aviso('eeeeeeee-0000-0000-0000-00000000000b');
  select imp_materiales into r from public.valoraciones
   where aviso_id = 'eeeeeeee-0000-0000-0000-00000000000b';
  if r.imp_materiales <> 100 then
    raise exception 'El material no lleva recargo: son 100 y salen %', r.imp_materiales;
  end if;
  raise notice 'una banda de seguridad no vale el triple por ser domingo';

  -- ---- 5. Una urgencia DE ANTES vale lo mismo -----------------------------
  -- No tiene motivo, solo factor. Si el cálculo hubiera pasado a depender del
  -- motivo, esta visita se quedaría sin recargo y cambiaría de importe una
  -- factura ya emitida.
  perform public.valorar_aviso('eeeeeeee-0000-0000-0000-00000000000c');
  select imp_total into v_antes from public.valoraciones
   where aviso_id = 'eeeeeeee-0000-0000-0000-00000000000c';
  if v_antes <> 220 then
    raise exception 'La urgencia antigua ×2: (80+30) por 2 son 220, y salen %', v_antes;
  end if;
  perform public.valorar_aviso('eeeeeeee-0000-0000-0000-00000000000c');
  select imp_total into r from public.valoraciones
   where aviso_id = 'eeeeeeee-0000-0000-0000-00000000000c';
  if r.imp_total <> v_antes then
    raise exception 'Volver a calcular una urgencia antigua la ha movido: % a %', v_antes, r.imp_total;
  end if;
  raise notice 'una urgencia de antes, sin motivo, vale exactamente lo que valia';

  -- ---- 6. La cuenta por motivo --------------------------------------------
  select visitas, factor into r from public.urgencias_por_modo where modo = 'ambas';
  if r.visitas <> 1 or r.factor <> 3 then
    raise exception 'La cuenta por motivo no cuadra: % visitas, factor %', r.visitas, r.factor;
  end if;
  select count(*) into n from public.urgencias_por_modo where modo = 'sin indicar';
  if n <> 1 then raise exception 'Las urgencias de antes tienen que salir como «sin indicar»'; end if;
  raise notice 'la cuenta separa las urgencias por motivo, y las de antes van aparte';
end $$;
