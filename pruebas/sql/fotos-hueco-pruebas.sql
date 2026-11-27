-- ================================================================
-- Pruebas de servidor/fotos-hueco.sql, contra Postgres de verdad.
--
-- QUÉ SE VIGILA
--  1. Que la columna esté y acepte el id de un hueco.
--  2. Que el índice esté. Sin él, «qué fotos tiene este hueco» es un
--     recorrido de la tabla entera por cada hueco de cada parte.
--  3. Que las fotos de antes se queden SIN hueco: es la verdad, nadie
--     apuntó de cuál eran, y no se les inventa uno.
--  4. Que NO haya clave ajena a «medidas». Esto es lo que más importa:
--     los huecos de un parte se borran y se vuelven a insertar al
--     guardar, y una cascada se llevaría las fotos en ese borrado.
--     Si alguien añade la clave ajena «para que quede más limpio»,
--     esta prueba se pone roja y dice por qué.
--  5. Que se pueda dejar el hueco en nulo: es lo que hace la aplicación
--     cuando el técnico quita un hueco, para que sus fotos pasen a las
--     generales de la visita en vez de quedarse invisibles.
--
-- 26-11-2026
-- ================================================================

do $$
declare
  v_pta uuid; v_av uuid; v_med uuid; v_vieja uuid; n int;
begin
  -- Una puerta, una visita y un hueco, lo mínimo para colgar una foto
  insert into public.clientes (nombre) values ('Cliente de prueba hueco')
    returning id into v_pta;
  insert into public.puertas (cliente_id, codigo) values (v_pta, 'AR-HUECO')
    returning id into v_pta;
  insert into public.avisos (tipo, estado, descripcion)
    values ('comercial', 'asignado', 'Ofertar tres portones') returning id into v_av;

  -- Una foto de antes: se sube sin hueco, como todas las de antes del 26-11
  insert into public.fotos (aviso_id, ruta) values (v_av, 'antes/1.jpg')
    returning id into v_vieja;
  select count(*) into n from public.fotos where id = v_vieja and medida_id is null;
  if n <> 1 then
    raise exception 'Una foto de antes tendría que quedarse sin hueco, y no es el caso';
  end if;
  raise notice 'las fotos de antes se quedan sin hueco, que es la verdad';

  insert into public.medidas (aviso_id, orden, ubicacion, ancho_mm, alto_mm)
    values (v_av, 1, 'portón izquierdo', 4000, 4500) returning id into v_med;

  -- Lo suyo: la foto de ese hueco
  insert into public.fotos (aviso_id, medida_id, ruta, etapa)
    values (v_av, v_med, 'huecos/izq.jpg', 'encontrado');
  select count(*) into n from public.fotos where medida_id = v_med;
  if n <> 1 then raise exception 'La foto del hueco no se ha guardado con su hueco'; end if;
  raise notice 'una foto se cuelga de su hueco medido';

  -- El índice, que es lo que hace que la pregunta no cueste la tabla entera
  select count(*) into n from pg_indexes
    where schemaname = 'public' and indexname = 'fotos_medida_idx';
  if n <> 1 then raise exception 'Falta el índice fotos_medida_idx'; end if;
  raise notice 'el índice por hueco está puesto';

  -- Y lo que NO tiene que haber: clave ajena a medidas
  select count(*) into n from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
   where t.relname = 'fotos' and c.contype = 'f' and a.attname = 'medida_id';
  if n <> 0 then
    raise exception 'fotos.medida_id tiene clave ajena a medidas: los huecos se borran y se '
      'vuelven a insertar en cada guardado, y una cascada se llevaría las fotos por delante';
  end if;
  raise notice 'y NO lleva clave ajena, a propósito: los huecos se rehacen en cada guardado';

  -- Quitar un hueco: sus fotos pasan a generales, no se pierden
  update public.fotos set medida_id = null where medida_id = v_med;
  delete from public.medidas where id = v_med;
  select count(*) into n from public.fotos where aviso_id = v_av and medida_id is null;
  if n <> 2 then
    raise exception 'Al quitar un hueco sus fotos tendrían que quedar en las generales de la visita';
  end if;
  raise notice 'al quitar un hueco, sus fotos pasan a las generales y no se pierden';

  -- Se deja limpio
  delete from public.fotos where aviso_id = v_av;
  delete from public.avisos where id = v_av;
  delete from public.puertas where id = v_pta;
end $$;
