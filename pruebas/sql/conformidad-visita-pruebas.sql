-- ============================================================================
-- Pruebas de servidor/conformidad-visita.sql                       09-11-2026
--
-- Lo que se comprueba aquí es lo que la aplicación NO puede comprobar sola:
-- que la base de datos se comporte como se espera cuando alguien borra una
-- visita, cuando se guarda dos veces la misma puerta, y que el jsonb de los
-- puntos se pueda consultar de verdad y no sea un saco donde escribir.
-- ============================================================================

do $$
declare
  v_cli uuid; v_pu uuid; v_av uuid; v_av2 uuid;
  v_n int; v_fallos int; v_txt text;
begin
  -- --- preparación: un cliente, una puerta y dos visitas ---
  insert into public.clientes (nombre) values ('Cliente conformidad')
    returning id into v_cli;
  insert into public.puertas (cliente_id, codigo, tipo)
    values (v_cli, 'PT-CONF-1', 'Seccional') returning id into v_pu;
  insert into public.avisos (cliente_id, puerta_id, tipo, estado, descripcion)
    values (v_cli, v_pu, 'averia', 'asignado', 'No invierte')
    returning id into v_av;
  insert into public.avisos (cliente_id, puerta_id, tipo, estado, descripcion)
    values (v_cli, v_pu, 'averia', 'asignado', 'Vuelve a fallar')
    returning id into v_av2;

  -- --- 1. Se guarda lo que el técnico contestó ---
  insert into public.conformidad_visita
    (aviso_id, puerta_id, familia, puntos, fallos, sin_mirar, quien)
  values (v_av, v_pu, 'industrial',
    '{"marcado":"no","presencia":"no","aplastamiento":"si","manual":"si","caida":"si","libro":"nd"}'::jsonb,
    2, 1, 'David Ariza Arana');
  select count(*) into v_n from public.conformidad_visita where aviso_id = v_av;
  if v_n <> 1 then raise exception 'FALLA 1: no se guardó la comprobación (%)', v_n; end if;
  raise notice 'OK 1: la comprobación de la visita queda guardada';

  -- --- 2. Los puntos se pueden consultar uno a uno ---
  select puntos->>'marcado' into v_txt
    from public.conformidad_visita where aviso_id = v_av;
  if v_txt is distinct from 'no' then
    raise exception 'FALLA 2: no se puede leer un punto suelto (%)', v_txt; end if;
  select count(*) into v_n
    from public.conformidad_visita c, jsonb_each_text(c.puntos) p
   where c.aviso_id = v_av and p.value = 'no';
  if v_n <> 2 then raise exception 'FALLA 2b: los puntos que fallan no se pueden contar (%)', v_n; end if;
  raise notice 'OK 2: los seis puntos se consultan y se cuentan desde SQL';

  -- --- 3. Una sola fila por visita y puerta ---
  begin
    insert into public.conformidad_visita (aviso_id, puerta_id, puntos)
      values (v_av, v_pu, '{"marcado":"si"}'::jsonb);
    raise exception 'FALLA 3: ha dejado meter DOS comprobaciones de la misma puerta en la misma visita';
  exception when unique_violation then
    raise notice 'OK 3: una visita dice una sola cosa de cada puerta';
  end;

  -- --- 4. La misma puerta sí puede tener otra comprobación en OTRA visita ---
  -- Es lo que permite ver si lo que faltaba en marzo sigue faltando hoy.
  -- El «creado» se pone a mano un día después: dentro de una transacción,
  -- now() devuelve siempre el mismo instante, así que sin esto las dos filas
  -- nacerían con la misma hora y «la última» no significaría nada. Cazado el
  -- 09-11-2026 al escribir esta prueba, y por eso la aplicación desempata por
  -- identificador además de por fecha.
  insert into public.conformidad_visita
    (aviso_id, puerta_id, familia, puntos, fallos, quien, creado)
  values (v_av2, v_pu, 'industrial',
    '{"marcado":"si","presencia":"no"}'::jsonb, 1, 'David Ariza Arana',
    now() + interval '1 day');
  select count(*) into v_n from public.conformidad_visita where puerta_id = v_pu;
  if v_n <> 2 then raise exception 'FALLA 4: la puerta no guarda su historial (%)', v_n; end if;
  raise notice 'OK 4: la misma puerta acumula una comprobación por visita';

  -- --- 5. La última de una puerta es la que vale ---
  select fallos into v_fallos from public.conformidad_visita
   where puerta_id = v_pu order by creado desc limit 1;
  if v_fallos <> 1 then
    raise exception 'FALLA 5: la última comprobación no es la que sale (%)', v_fallos; end if;
  raise notice 'OK 5: se puede saber cómo quedó la puerta la última vez';

  -- --- 6. Si se borra la visita, se va con ella ---
  -- Es un dato de esa visita, no un documento que deba sobrevivir solo.
  delete from public.avisos where id = v_av2;
  select count(*) into v_n from public.conformidad_visita where aviso_id = v_av2;
  if v_n <> 0 then raise exception 'FALLA 6: la comprobación sobrevive a su visita (%)', v_n; end if;
  raise notice 'OK 6: al borrar la visita se va su comprobación';

  -- --- 7. Y si se borra la puerta, también ---
  delete from public.puertas where id = v_pu;
  select count(*) into v_n from public.conformidad_visita where puerta_id = v_pu;
  if v_n <> 0 then raise exception 'FALLA 7: la comprobación sobrevive a su puerta (%)', v_n; end if;
  raise notice 'OK 7: al borrar la puerta se va su comprobación';

  -- --- limpieza ---
  delete from public.avisos   where cliente_id = v_cli;
  delete from public.clientes where id = v_cli;
  raise notice 'Conformidad en cada visita: 7 comprobaciones, todas bien.';
end $$;
