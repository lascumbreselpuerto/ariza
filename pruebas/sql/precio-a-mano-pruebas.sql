-- ================================================================
-- Pruebas de servidor/precio-a-mano.sql, contra Postgres de verdad.
--
-- QUÉ SE VIGILA, Y POR QUÉ CADA COSA
--
--  1. Que con importe a mano, lo que se factura sea ESE importe.
--
--  2. Que el COSTE no cambie y que el margen se calcule contra él. Es lo que
--     pidió David: «estos importes sumarán en ingresos positivos y se le
--     calculará el margen con los costes estipulados». Si el margen se
--     calculara contra el importe a mano, saldría siempre el que quisiera
--     quien lo escribe, y la cuenta del mes no valdría nada.
--
--  3. Que el desglose del cálculo se siga guardando. Sin él no se puede ver
--     de dónde salía el precio ni cuánto se ha subido o bajado.
--
--  4. Y la que de verdad importa: que RECALCULAR NO BORRE el importe a mano.
--     Hay recálculos automáticos (al cerrar la visita y al corregir el parte),
--     y si cualquiera de ellos deshiciera la decisión de la oficina, el
--     importe cambiaría solo y nadie se enteraría hasta ver la factura.
--
--  5. Que al quitarlo se vuelva al calculado, que es la salida.
--
-- 27-11-2026
-- ================================================================

do $$
declare
  v_cli uuid; v_pta uuid; v_av uuid;
  v_calc numeric; v_coste numeric; v_total numeric; v_margen numeric; n int;
begin
  -- Tarifa conocida: 45 la hora de venta, 25 de coste, 25 de desplazamiento
  insert into public.tarifas (id, precio_hora, coste_hora, desplazamiento_fijo, iva)
    values (1, 45, 25, 25, 21)
    on conflict (id) do update set precio_hora = 45, coste_hora = 25,
      desplazamiento_fijo = 25, iva = 21;

  insert into public.clientes (nombre) values ('Cliente del precio a mano')
    returning id into v_cli;
  insert into public.puertas (cliente_id, codigo) values (v_cli, 'AR-MANO')
    returning id into v_pta;
  -- Dos horas: 90 de venta, 50 de coste, más 25 de desplazamiento
  insert into public.avisos (tipo, subtipo, estado, cliente_id, puerta_id, horas,
                             num_tecnicos, cerrado)
    values ('averia', 'averia', 'cerrado', v_cli, v_pta, 2, 1, now())
    returning id into v_av;

  perform public.valorar_aviso(v_av);
  select imp_total, coste_total,
         imp_mano_obra + imp_desplazamiento + imp_materiales
    into v_total, v_coste, v_calc
    from public.valoraciones where aviso_id = v_av;
  if v_total is null then raise exception 'No se ha valorado la visita'; end if;
  if v_total <> v_calc then
    raise exception 'Sin importe a mano, el total (%) tendría que ser la suma del cálculo (%)',
      v_total, v_calc;
  end if;
  raise notice 'sin importe a mano, se factura lo que sale del cálculo';

  -- 1, 2 y 3. Se pone un importe a mano por debajo del calculado
  update public.valoraciones
     set imp_manual = 100, manual_por = 'Oficina', manual_en = now(),
         manual_nota = 'Precio acordado con el administrador de la comunidad'
   where aviso_id = v_av;
  perform public.valorar_aviso(v_av);

  select imp_total, coste_total, margen,
         imp_mano_obra + imp_desplazamiento + imp_materiales
    into v_total, v_coste, v_margen, v_calc
    from public.valoraciones where aviso_id = v_av;

  if v_total <> 100 then
    raise exception 'Con importe a mano, lo que se factura tendría que ser 100 y es %', v_total;
  end if;
  raise notice 'con importe a mano, se factura ese importe';

  if v_calc <= 0 then
    raise exception 'El desglose del cálculo se ha perdido: suma %', v_calc;
  end if;
  raise notice 'y el desglose del cálculo se sigue guardando, para ver de dónde salía';

  -- El coste de dos horas a 25 más la ruta: no lo decide quien escribe el precio
  if v_coste <= 0 then raise exception 'El coste se ha quedado en %', v_coste; end if;
  if round(v_margen, 2) <> round(100 - v_coste, 2) then
    raise exception 'El margen (%) tendría que ser 100 menos el coste (%)', v_margen, v_coste;
  end if;
  raise notice 'el margen se calcula contra el COSTE real, no contra el importe escrito';

  -- Y con un importe a mano por debajo del coste, el margen sale negativo: la
  -- verdad, aunque no guste. Un precio regalado tiene que verse en el mes.
  update public.valoraciones set imp_manual = 10 where aviso_id = v_av;
  perform public.valorar_aviso(v_av);
  select margen into v_margen from public.valoraciones where aviso_id = v_av;
  if v_margen >= 0 then
    raise exception 'Un precio por debajo del coste tendría que dar margen negativo, y da %', v_margen;
  end if;
  raise notice 'un precio por debajo del coste da margen negativo, que es la verdad';

  -- 4. La importante: recalcular NO borra el importe a mano
  update public.valoraciones set imp_manual = 100 where aviso_id = v_av;
  perform public.valorar_aviso(v_av);
  perform public.valorar_aviso(v_av);
  perform public.valorar_aviso(v_av);
  select count(*) into n from public.valoraciones
   where aviso_id = v_av and imp_manual = 100 and imp_total = 100
     and manual_por = 'Oficina' and manual_nota like '%acordado%';
  if n <> 1 then
    raise exception 'Recalcular ha borrado o cambiado el importe puesto a mano';
  end if;
  raise notice 'recalcular tres veces NO borra el importe a mano ni su rastro';

  -- 5. Al quitarlo, vuelve el calculado
  update public.valoraciones
     set imp_manual = null, manual_por = null, manual_en = null, manual_nota = null
   where aviso_id = v_av;
  perform public.valorar_aviso(v_av);
  select imp_total, imp_mano_obra + imp_desplazamiento + imp_materiales
    into v_total, v_calc from public.valoraciones where aviso_id = v_av;
  if v_total <> v_calc then
    raise exception 'Al quitar el importe a mano tendría que volver el calculado: % contra %',
      v_total, v_calc;
  end if;
  raise notice 'y al quitarlo vuelve a valer el calculado';

  -- Se deja limpio
  delete from public.valoraciones where aviso_id = v_av;
  delete from public.avisos where id = v_av;
  delete from public.puertas where id = v_pta;
  delete from public.clientes where id = v_cli;
end $$;
