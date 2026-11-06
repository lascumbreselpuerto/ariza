-- ============================================================================
-- Pruebas de las unidades por tipo y de los fijos
--
-- POR QUÉ EXISTEN
-- Dos cosas que hay que vigilar aquí, y ninguna es el caso bonito:
--
--   · Que una comercial ANTIGUA, sin unidades, siga significando una puerta de
--     cada tipo. Si al leerla saliera cero, el parte no pediría medir nada y la
--     oferta se quedaría sin medidas sin que nadie lo notara.
--   · Que un error de dedo en las unidades no entre. Un 30 donde iba un 3 se
--     convierte en treinta huecos que medir y en una oferta absurda.
-- ============================================================================

insert into public.clientes (id, nombre) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Cliente de las unidades')
  on conflict (id) do nothing;

delete from public.medidas where aviso_id::text like 'bbbbbbbb-0000-0000-0000-00000000000%';
delete from public.avisos  where id::text      like 'bbbbbbbb-0000-0000-0000-00000000000%';

insert into public.avisos (id, tipo, estado, cliente_id, tipos_puerta, tipos_uds, cerrado) values
  -- oferta de tres seccionales y una peatonal
  ('bbbbbbbb-0000-0000-0000-00000000000a','comercial','cerrado',
   'bbbbbbbb-0000-0000-0000-000000000001',
   array['Seccional','Peatonal automática corredera'],
   '[{"tipo":"Seccional","uds":3},{"tipo":"Peatonal automática corredera","uds":1}]'::jsonb,
   now()),
  -- una comercial de las de antes: tipos sin unidades
  ('bbbbbbbb-0000-0000-0000-00000000000b','comercial','cerrado',
   'bbbbbbbb-0000-0000-0000-000000000001',
   array['Seccional'], null, now());

do $$
declare
  n integer;
  r record;
begin
  -- ---- 1. Las columnas están ----------------------------------------------
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='avisos' and column_name='tipos_uds';
  if n <> 1 then raise exception 'Falta avisos.tipos_uds'; end if;
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='medidas' and column_name in ('fijos','fijos_mm');
  if n <> 2 then raise exception 'Faltan las columnas de los fijos: % de 2', n; end if;
  raise notice 'las columnas de unidades y de fijos existen';

  -- ---- 2. Se leen las unidades que se guardaron ---------------------------
  select coalesce(sum((e->>'uds')::int), 0) into n
    from public.avisos a, jsonb_array_elements(a.tipos_uds) e
   where a.id = 'bbbbbbbb-0000-0000-0000-00000000000a';
  if n <> 4 then raise exception 'Tres seccionales y una peatonal son 4 puertas, y salen %', n; end if;
  raise notice 'tres seccionales y una peatonal se leen como cuatro puertas';

  -- ---- 3. El error de dedo no entra ---------------------------------------
  begin
    update public.avisos
       set tipos_uds = '[{"tipo":"Seccional","uds":300}]'::jsonb
     where id = 'bbbbbbbb-0000-0000-0000-00000000000b';
    raise exception 'Se han dejado guardar 300 puertas de un tipo';
  exception when check_violation then null;
  end;
  begin
    update public.avisos
       set tipos_uds = '[{"tipo":"Seccional","uds":0}]'::jsonb
     where id = 'bbbbbbbb-0000-0000-0000-00000000000b';
    raise exception 'Se han dejado guardar cero puertas de un tipo';
  exception when check_violation then null;
  end;
  begin
    update public.avisos
       set tipos_uds = '[{"tipo":"","uds":2}]'::jsonb
     where id = 'bbbbbbbb-0000-0000-0000-00000000000b';
    raise exception 'Se han dejado guardar unidades de un tipo sin nombre';
  exception when check_violation then null;
  end;
  raise notice 'ni 300 unidades, ni cero, ni un tipo sin nombre: nada de eso entra';

  -- ---- 4. LA QUE IMPORTA: la comercial antigua sigue valiendo -------------
  -- Sin unidades era una de cada tipo. Si esto cambiara, las ofertas de antes
  -- del 06-11-2026 dejarían de pedir medidas.
  select tipos_uds, array_length(tipos_puerta, 1) as tipos into r
    from public.avisos where id = 'bbbbbbbb-0000-0000-0000-00000000000b';
  if r.tipos_uds is not null then
    raise exception 'La comercial antigua no tenía unidades y ahora tiene %', r.tipos_uds;
  end if;
  if r.tipos <> 1 then
    raise exception 'La comercial antigua tiene que seguir con su tipo marcado';
  end if;
  raise notice 'una comercial de antes sigue sin unidades, y eso significa una de cada tipo';

  -- ---- 5. Los fijos de un hueco ------------------------------------------
  insert into public.medidas (aviso_id, ubicacion, tipo_puerta, ancho_mm, alto_mm,
                              fijos, fijos_mm)
    values ('bbbbbbbb-0000-0000-0000-00000000000a','Entrada principal',
            'Peatonal automática corredera', 1600, 2200, 'practicable', 900);
  select fijos, fijos_mm into r from public.medidas
   where aviso_id = 'bbbbbbbb-0000-0000-0000-00000000000a' and ubicacion = 'Entrada principal';
  if r.fijos <> 'practicable' or r.fijos_mm <> 900 then
    raise exception 'Los fijos no se han guardado: % de % mm', r.fijos, r.fijos_mm;
  end if;
  raise notice 'un fijo practicable de 900 mm se guarda con su medida';

  -- ---- 6. Un tipo de fijo inventado no entra ------------------------------
  begin
    update public.medidas set fijos = 'Practicable'
     where aviso_id = 'bbbbbbbb-0000-0000-0000-00000000000a' and ubicacion = 'Entrada principal';
    raise exception 'Se ha dejado guardar «Practicable» con mayúscula';
  exception when check_violation then null;
  end;
  raise notice 'un tipo de fijo mal escrito no entra';

  -- ---- 7. La lista de las que midieron de menos ---------------------------
  -- Se ofertaron 4 puertas y hay 1 hueco medido: la oferta no se puede redactar.
  select count(*) into n from public.comerciales_con_huecos_de_menos
   where id = 'bbbbbbbb-0000-0000-0000-00000000000a';
  if n <> 1 then raise exception 'Una comercial con menos huecos medidos no sale en la lista'; end if;
  -- y si se miden los cuatro, deja de salir
  insert into public.medidas (aviso_id, ubicacion, ancho_mm, alto_mm) values
    ('bbbbbbbb-0000-0000-0000-00000000000a','Portón 1', 4000, 4200),
    ('bbbbbbbb-0000-0000-0000-00000000000a','Portón 2', 4000, 4200),
    ('bbbbbbbb-0000-0000-0000-00000000000a','Portón 3', 4000, 4200);
  select count(*) into n from public.comerciales_con_huecos_de_menos
   where id = 'bbbbbbbb-0000-0000-0000-00000000000a';
  if n <> 0 then raise exception 'Con los cuatro huecos medidos no debe salir en la lista'; end if;
  raise notice 'la lista saca las ofertas en las que falta medir, y las suelta cuando se mide';

  -- ---- 8. Un hueco sin medir no cuenta como medido ------------------------
  -- Si contara, bastaría con marcar «no se ha podido medir» en cuatro huecos
  -- para que la oferta pareciera completa.
  delete from public.medidas
   where aviso_id = 'bbbbbbbb-0000-0000-0000-00000000000a' and ubicacion = 'Portón 3';
  insert into public.medidas (aviso_id, ubicacion, sin_medir, sin_medir_motivo)
    values ('bbbbbbbb-0000-0000-0000-00000000000a','Portón 3', true, 'No se podía acceder');
  select count(*) into n from public.comerciales_con_huecos_de_menos
   where id = 'bbbbbbbb-0000-0000-0000-00000000000a';
  if n <> 1 then raise exception 'Un hueco sin medir no puede contar como medido'; end if;
  raise notice 'un hueco sin medir no cuenta: la oferta sigue incompleta';
end $$;
