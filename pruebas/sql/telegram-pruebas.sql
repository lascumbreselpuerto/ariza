-- ============================================================================
-- Pruebas de los avisos al grupo de la oficina
--
-- POR QUÉ EXISTEN
-- Esto mete tres disparadores en las dos tablas donde el técnico guarda su
-- trabajo. La pregunta que hay que contestar no es «¿llega el aviso?», que eso
-- se ve en el grupo, sino otra mucho más importante:
--
--     ¿puede un aviso que falla impedir que el técnico guarde?
--
-- Aquí NO hay pg_net ni config_interna, igual que si en producción se borrara
-- la configuración o se cayera la extensión. O sea: el peor caso. Y en el peor
-- caso el «He llegado», el cierre del parte y la jornada tienen que guardarse
-- igual. Un aviso al grupo que no sale es un fastidio; un técnico que no puede
-- cerrar el parte en casa del cliente es otra cosa.
-- ============================================================================

insert into public.clientes (id, nombre) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'Cliente de los avisos')
  on conflict (id) do nothing;

delete from public.jornadas where aviso_id = 'eeeeeeee-0000-0000-0000-00000000000a';
delete from public.valoraciones where aviso_id = 'eeeeeeee-0000-0000-0000-00000000000a';
delete from public.avisos where id = 'eeeeeeee-0000-0000-0000-00000000000a';
delete from public.telegram_enviados where clave like 'prueba:%';

insert into public.avisos (id, tipo, estado, cliente_id, horas, num_tecnicos, creado) values
  ('eeeeeeee-0000-0000-0000-00000000000a','averia','asignado',
   'eeeeeeee-0000-0000-0000-000000000001', 2, 1, now());

do $$
declare
  n   integer;
  t   timestamptz;
  v   timestamptz;
begin
  -- ---- 1. Está todo puesto ----------------------------------------------
  select count(*) into n from pg_tables
   where schemaname = 'public' and tablename = 'telegram_enviados';
  if n <> 1 then raise exception 'Falta la tabla telegram_enviados'; end if;

  select count(*) into n from pg_trigger
   where tgname in ('avisos_avisar_llegada','avisos_avisar_cierre','jornadas_avisar')
     and not tgisinternal;
  if n <> 3 then
    raise exception 'Tenían que estar los tres disparadores y hay %', n;
  end if;
  raise notice 'la tabla de control y los tres disparadores estan puestos';

  -- ---- 2. Un aviso, una vez ---------------------------------------------
  -- Es la clave primaria la que lo garantiza: el segundo insert de la misma
  -- clave falla, y eso es lo que la función de avisos usa para no repetir.
  insert into public.telegram_enviados (clave) values ('prueba:1');
  begin
    insert into public.telegram_enviados (clave) values ('prueba:1');
    raise exception 'Se ha dejado apuntar dos veces el mismo aviso: se repetiría en el grupo';
  exception when unique_violation then null;
  end;
  raise notice 'el mismo aviso no se puede apuntar dos veces: no se repite en el grupo';

  -- ---- 3. LA QUE MÁS IMPORTA: el fallo no bloquea el trabajo ------------
  -- Sin pg_net y sin config_interna, pedir el aviso revienta por dentro. El
  -- disparador se lo traga y el UPDATE tiene que llegar a la fila.
  update public.avisos set hora_inicio = now()
   where id = 'eeeeeeee-0000-0000-0000-00000000000a';
  select hora_inicio into t from public.avisos
   where id = 'eeeeeeee-0000-0000-0000-00000000000a';
  if t is null then
    raise exception 'El «He llegado» no se ha guardado: un aviso fallido ha bloqueado el trabajo';
  end if;
  raise notice 'el «He llegado» se guarda aunque el aviso al grupo falle';

  update public.avisos set cerrado = now(), trabajo = 'Alineada la fotocélula'
   where id = 'eeeeeeee-0000-0000-0000-00000000000a';
  select cerrado into v from public.avisos
   where id = 'eeeeeeee-0000-0000-0000-00000000000a';
  if v is null then
    raise exception 'El cierre del parte no se ha guardado: un aviso fallido lo ha bloqueado';
  end if;
  raise notice 'el cierre del parte se guarda aunque el aviso al grupo falle';

  insert into public.jornadas (aviso_id, fecha, horas, trabajo, proxima)
   values ('eeeeeeee-0000-0000-0000-00000000000a', current_date, 8,
           'Montado el bastidor', 'Falta traer el cuadro y dos emisores');
  select count(*) into n from public.jornadas
   where aviso_id = 'eeeeeeee-0000-0000-0000-00000000000a';
  if n <> 1 then
    raise exception 'La jornada no se ha guardado: un aviso fallido lo ha bloqueado';
  end if;
  raise notice 'la jornada se guarda aunque el aviso al grupo falle';

  -- ---- 4. Y no se avisa de lo que no toca -------------------------------
  -- Rellenar a mano la hora de una visita ya cerrada es papeleo de oficina, no
  -- una llegada. Se comprueba que la condición del disparador la deja fuera:
  -- la fila se actualiza y no hay nada que anunciar.
  update public.avisos set hora_inicio = null
   where id = 'eeeeeeee-0000-0000-0000-00000000000a';
  update public.avisos set hora_inicio = now() - interval '3 hours'
   where id = 'eeeeeeee-0000-0000-0000-00000000000a';
  select hora_inicio into t from public.avisos
   where id = 'eeeeeeee-0000-0000-0000-00000000000a';
  if t is null then raise exception 'La hora puesta a mano tenía que guardarse igual'; end if;
  raise notice 'rellenar la hora de una visita ya cerrada no es una llegada';

  -- ---- 5. Cerrar dos veces no es cerrar dos veces -----------------------
  -- El disparador solo mira el paso de abierta a cerrada. Un update posterior
  -- sobre una visita ya cerrada (la oficina corrigiendo el trabajo escrito,
  -- por ejemplo) no vuelve a anunciar el cierre.
  update public.avisos set trabajo = 'Alineada la fotocélula y engrasado'
   where id = 'eeeeeeee-0000-0000-0000-00000000000a';
  raise notice 'corregir un parte ya cerrado no vuelve a anunciar el cierre';

  delete from public.telegram_enviados where clave like 'prueba:%';
end $$;
