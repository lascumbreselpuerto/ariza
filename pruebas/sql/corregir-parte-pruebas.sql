-- ================================================================
-- Pruebas de servidor/corregir-parte.sql, contra Postgres de verdad.
--
-- QUÉ SE VIGILA
--  1. Que estén las cuatro columnas del rastro y acepten lo suyo.
--  2. Que el contador nazca en cero y no en nulo: un parte sin corregir
--     tiene cero correcciones, no «no se sabe». Si fuera nulo, cualquier
--     cuenta que lo sume daría nulo y la pantalla no diría nada.
--  3. Que el índice de los partes corregidos esté, y que sea PARCIAL.
--     Un índice sobre todos los avisos no sirve: lo que se busca son los
--     pocos que se han tocado después de cerrarlos.
--  4. Y lo que de verdad importa de este fichero: que corregir NO toque
--     la fecha de cierre. Aquí se comprueba con un UPDATE a pelo, como
--     el que hace la aplicación, que la fila queda con su cerrado
--     original y con el rastro puesto.
--
-- 27-11-2026
-- ================================================================

do $$
declare
  v_cli uuid; v_pta uuid; v_av uuid;
  v_cerrado timestamptz := '2026-11-10 13:30:00+01';
  n int; v_def text;
begin
  insert into public.clientes (nombre) values ('Cliente de la corrección')
    returning id into v_cli;
  insert into public.puertas (cliente_id, codigo) values (v_cli, 'AR-CORR')
    returning id into v_pta;
  insert into public.avisos (tipo, subtipo, estado, cliente_id, puerta_id, horas,
                             trabajo, cerrado, cerrado_por)
    values ('averia', 'averia', 'cerrado', v_cli, v_pta, 2,
            'Sustituida la banda', v_cerrado, 'Juan el técnico')
    returning id into v_av;

  -- 2. El contador nace en cero
  select correcciones into n from public.avisos where id = v_av;
  if n is null then raise exception 'correcciones ha nacido en nulo, y tiene que nacer en cero'; end if;
  if n <> 0 then raise exception 'correcciones ha nacido en %, y tiene que nacer en cero', n; end if;
  raise notice 'un parte sin corregir tiene cero correcciones, no «no se sabe»';

  -- 4. La corrección: se apunta el rastro y NO se toca el cierre
  update public.avisos
     set horas = 3,
         corregido_en = now(),
         corregido_por = 'Oficina',
         corregido_nota = 'Apuntó 2 horas y fueron 3, lo confirmó por teléfono',
         correcciones = correcciones + 1
   where id = v_av;

  select count(*) into n from public.avisos
   where id = v_av and cerrado = v_cerrado and cerrado_por = 'Juan el técnico';
  if n <> 1 then
    raise exception 'La fecha de cierre o quién cerró han cambiado al corregir, y no deben';
  end if;
  raise notice 'corregir no toca la fecha de cierre ni quién cerró';

  select count(*) into n from public.avisos
   where id = v_av and horas = 3 and correcciones = 1
     and corregido_por = 'Oficina' and corregido_en is not null
     and corregido_nota like '%fueron 3%';
  if n <> 1 then raise exception 'El rastro de la corrección no se ha guardado entero'; end if;
  raise notice 'y queda guardado el cambio, con quién, cuándo, por qué y cuántas veces';

  -- La segunda corrección suma, no sustituye el número
  update public.avisos set correcciones = correcciones + 1,
         corregido_nota = 'Faltaba un material' where id = v_av;
  select correcciones into n from public.avisos where id = v_av;
  if n <> 2 then raise exception 'La segunda corrección tendría que contar dos, y cuenta %', n; end if;
  raise notice 'la segunda corrección cuenta dos: tres correcciones y una no se ven igual';

  -- 3. El índice, y que sea parcial
  select count(*) into n from pg_indexes
   where schemaname = 'public' and indexname = 'avisos_corregidos_idx';
  if n <> 1 then raise exception 'Falta el índice avisos_corregidos_idx'; end if;
  select indexdef into v_def from pg_indexes
   where schemaname = 'public' and indexname = 'avisos_corregidos_idx';
  if v_def not ilike '%where%corregido_en is not null%' then
    raise exception 'El índice de los partes corregidos no es parcial: %', v_def;
  end if;
  raise notice 'el índice está y es parcial: solo los partes que se han tocado';

  -- Se deja limpio
  delete from public.avisos where id = v_av;
  delete from public.puertas where id = v_pta;
  delete from public.clientes where id = v_cli;
end $$;
