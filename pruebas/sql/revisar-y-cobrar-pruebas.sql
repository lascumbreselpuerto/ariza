-- ================================================================
-- Pruebas de servidor/revisar-y-cobrar.sql, contra Postgres de verdad.
--
-- QUÉ SE VIGILA, Y POR QUÉ CADA COSA
--
--  1. Que las columnas estén y que «no_facturar» nazca en FALSE y no en nulo:
--     con nulo, un «where no_facturar is not true» y un «where not
--     no_facturar» dirían cosas distintas y las dos listas se descuadrarían.
--
--  2. Que la vista del material perdido saque el material de los partes que no
--     se facturan, con su coste, y SOLO esos.
--
--  3. Que no mueva ni una unidad del almacén. Esto es lo que más importa de
--     este fichero: el material ya salió cuando se cerró el parte, y volver a
--     descontarlo lo contaría dos veces. La vista solo mira.
--
--  4. Que el resumen del mes separe lo facturable del coste perdido. Si los
--     mezclara, el mes parecería haber vendido menos de lo que vendió, y el
--     correo al administrador diría una cosa que no es.
--
--  5. Y que una visita anulada no entre en ninguna de las dos: no se hizo.
--
-- 27-11-2026
-- ================================================================

do $$
declare
  v_cli uuid; v_pta uuid; v_si uuid; v_no uuid; v_anu uuid; v_art uuid;
  n int; v_num numeric; v_mes text;
  v_movs_antes int; v_movs_despues int;
  -- Los totales del mes ANTES de meter nada. La base de pruebas la comparten
  -- todas las suites y puede tener visitas de otras: comprobar el total del mes
  -- a pelo daba por bueno lo que sumaran las demás. Se mide la DIFERENCIA.
  v_f0 numeric; v_c0 numeric; v_m0 numeric; v_cp0 numeric; v_cob0 numeric; v_v0 int;
begin
  insert into public.tarifas (id, precio_hora, coste_hora, desplazamiento_fijo, iva)
    values (1, 45, 25, 30, 21)
    on conflict (id) do update set precio_hora = 45, coste_hora = 25,
      desplazamiento_fijo = 30, iva = 21;

  insert into public.clientes (nombre) values ('Cliente de revisar y cobrar')
    returning id into v_cli;
  insert into public.puertas (cliente_id, codigo) values (v_cli, 'AR-REV')
    returning id into v_pta;
  insert into public.articulos (descripcion, unidad, coste, activo)
    values ('Banda de la prueba de revisar', 'ud', 48, true) returning id into v_art;

  -- Una que se factura, una que no, y una anulada
  insert into public.avisos (tipo, subtipo, estado, cliente_id, puerta_id, horas, cerrado)
    values ('averia','averia','cerrado', v_cli, v_pta, 2, now()) returning id into v_si;
  insert into public.avisos (tipo, subtipo, estado, cliente_id, puerta_id, horas, cerrado)
    values ('averia','averia','cerrado', v_cli, v_pta, 2, now()) returning id into v_no;
  insert into public.avisos (tipo, subtipo, estado, cliente_id, puerta_id, horas, cerrado, anulada)
    values ('averia','averia','cerrado', v_cli, v_pta, 2, now(), true) returning id into v_anu;

  insert into public.materiales (aviso_id, articulo_id, descripcion, cantidad, coste, precio)
    values (v_no, v_art, 'Banda de la prueba de revisar', 2, 48, 67.2);
  insert into public.materiales (aviso_id, articulo_id, descripcion, cantidad, coste, precio)
    values (v_si, v_art, 'Banda de la prueba de revisar', 1, 48, 67.2);

  select to_char(now() at time zone 'Europe/Madrid', 'YYYY-MM') into v_mes;
  select coalesce(facturable,0), coalesce(coste,0), coalesce(margen,0),
         coalesce(coste_perdido,0), coalesce(cobrado,0), coalesce(visitas,0)
    into v_f0, v_c0, v_m0, v_cp0, v_cob0, v_v0
    from public.margen_por_mes where mes = v_mes;
  v_f0 := coalesce(v_f0,0); v_c0 := coalesce(v_c0,0); v_m0 := coalesce(v_m0,0);
  v_cp0 := coalesce(v_cp0,0); v_cob0 := coalesce(v_cob0,0); v_v0 := coalesce(v_v0,0);

  insert into public.valoraciones (aviso_id, imp_mano_obra, imp_desplazamiento,
      imp_materiales, imp_total, coste_total, margen)
    values (v_si, 90, 30, 67.2, 187.2, 128, 59.2),
           (v_no, 90, 30, 134.4, 254.4, 176, 78.4),
           (v_anu, 90, 30, 0, 120, 80, 40);

  -- 1. El valor por defecto
  select count(*) into n from public.valoraciones
   where aviso_id in (v_si, v_no) and no_facturar is false;
  if n <> 2 then
    raise exception 'no_facturar tendría que nacer en false, y hay % de 2 así', n;
  end if;
  raise notice 'no_facturar nace en false, no en nulo: las dos listas no se pueden descuadrar';

  -- Cuántos movimientos de almacén hay antes de decidir
  select count(*) into v_movs_antes from public.movimientos_material;

  -- 2. Se decide no facturar la segunda
  update public.valoraciones
     set no_facturar = true, no_facturar_motivo = 'Error nuestro',
         no_facturar_por = 'Oficina', no_facturar_en = now(),
         revisado_en = now(), revisado_por = 'Oficina'
   where aviso_id = v_no;

  select count(*), coalesce(sum(coste), 0) into n, v_num
    from public.material_perdido where aviso_id = v_no;
  if n <> 1 then raise exception 'El material del parte no facturado no sale en la vista'; end if;
  if v_num <> 96 then
    raise exception 'El coste del material perdido tendría que ser 96 (2 × 48) y es %', v_num;
  end if;
  raise notice 'el material de un parte no facturado sale con su coste: 2 × 48 = 96';

  select count(*) into n from public.material_perdido where aviso_id = v_si;
  if n <> 0 then
    raise exception 'El material de un parte que SÍ se factura no tiene que salir ahí';
  end if;
  raise notice 'y el de los partes que sí se facturan no sale';

  -- 3. Y no se ha movido nada del almacén
  select count(*) into v_movs_despues from public.movimientos_material;
  if v_movs_despues <> v_movs_antes then
    raise exception 'Decidir no facturar ha movido el almacén: % movimientos antes, % después. '
      'El material ya salió al cerrar el parte y no se puede descontar dos veces',
      v_movs_antes, v_movs_despues;
  end if;
  raise notice 'decidir no facturar NO mueve ni una unidad del almacén';

  -- 4. El resumen del mes, medido por la DIFERENCIA que han traído estas tres
  select facturable - v_f0 into v_num from public.margen_por_mes where mes = v_mes;
  if v_num <> 187.2 then
    raise exception 'Lo facturable del mes tendría que subir 187,20 (solo la que se factura) y sube %', v_num;
  end if;
  raise notice 'el facturable del mes NO incluye los partes no facturados';

  select coste_perdido - v_cp0 into v_num from public.margen_por_mes where mes = v_mes;
  if v_num <> 176 then
    raise exception 'El coste perdido del mes tendría que subir 176 y sube %', v_num;
  end if;
  raise notice 'y el coste de lo no facturado va aparte, en coste_perdido';

  select margen - v_m0 into v_num from public.margen_por_mes where mes = v_mes;
  if v_num <> 59.2 then
    raise exception 'El margen del mes tendría que subir 59,20 y sube %', v_num;
  end if;
  raise notice 'el margen del mes sale de lo que sí se factura';

  -- 5. La anulada no entra en ninguna de las dos
  select visitas - v_v0 into n from public.margen_por_mes where mes = v_mes;
  if n <> 2 then
    raise exception 'El mes tendría que contar 2 visitas más (la anulada no se hizo) y cuenta %', n;
  end if;
  raise notice 'una visita anulada no entra: no se hizo';

  -- El cobro a medias: se guarda lo cobrado, lo pendiente se calcula
  update public.valoraciones
     set facturado = true, factura_ref = 'F-2026-500',
         cobrado_importe = 100, cobrado_el = current_date
   where aviso_id = v_si;
  select cobrado - v_cob0 into v_num from public.margen_por_mes where mes = v_mes;
  if v_num <> 100 then
    raise exception 'Lo cobrado del mes tendría que subir 100 y sube %', v_num;
  end if;
  raise notice 'lo cobrado del mes suma lo cobrado de verdad, no el total de las facturas';

  -- Se deja limpio
  delete from public.materiales where aviso_id in (v_si, v_no);
  delete from public.valoraciones where aviso_id in (v_si, v_no, v_anu);
  delete from public.avisos where id in (v_si, v_no, v_anu);
  delete from public.articulos where id = v_art;
  delete from public.puertas where id = v_pta;
  delete from public.clientes where id = v_cli;
end $$;
