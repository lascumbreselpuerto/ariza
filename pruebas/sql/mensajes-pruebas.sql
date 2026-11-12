-- ============================================================================
-- Pruebas del hilo de conversación
--
-- POR QUÉ EXISTEN
-- El hilo es un REGISTRO, no un chat: lo escrito no se edita y no se borra.
-- Eso no puede quedarse en que la aplicación no ponga el botón, porque
-- cualquiera con la clave pública puede llamar a la API directamente. Tiene que
-- ser la base de datos la que no deje.
--
-- Lo que se comprueba aquí es justo eso, y además lo que de verdad asusta:
--   1. Que el texto de un mensaje NO se pueda cambiar.
--   2. Que un mensaje NO se pueda borrar.
--   3. Que la chincheta SÍ se pueda poner y quitar.
--   4. Que un mensaje escrito en una visita quede colgado también de su puerta,
--      aunque quien lo escriba no mande la puerta.
--   5. Que un mensaje vacío no entre, y que uno enorme tampoco.
--   6. Y lo mismo que en telegram-pruebas.sql: que un aviso al grupo que falla
--      NO impida guardar el mensaje. Aquí no hay pg_net ni config_interna, o
--      sea el peor caso.
-- ============================================================================

insert into public.clientes (id, nombre) values
  ('dddddddd-0000-0000-0000-000000000001', 'Cliente de los mensajes')
  on conflict (id) do nothing;

delete from public.mensajes where texto like 'PRUEBA %';
delete from public.avisos  where id = 'dddddddd-0000-0000-0000-00000000000a';
delete from public.puertas where id = 'dddddddd-0000-0000-0000-0000000000ff';

insert into public.puertas (id, codigo, cliente_id, creado) values
  ('dddddddd-0000-0000-0000-0000000000ff','PR-9001',
   'dddddddd-0000-0000-0000-000000000001', now());

insert into public.avisos (id, tipo, estado, cliente_id, puerta_id, creado) values
  ('dddddddd-0000-0000-0000-00000000000a','averia','asignado',
   'dddddddd-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-0000000000ff', now());

-- ---------------------------------------------------------------------------
-- 1. Se guarda, y la puerta se rellena sola
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid; v_puerta uuid;
begin
  -- A propósito SIN puerta_id: quien escribe desde una visita no tiene por qué
  -- saber de qué puerta es.
  insert into public.mensajes (aviso_id, texto, quien)
  values ('dddddddd-0000-0000-0000-00000000000a','PRUEBA el cuadro es otro','Dani')
  returning id, puerta_id into v_id, v_puerta;

  if v_id is null then
    raise exception 'un mensaje normal no se ha podido guardar';
  end if;
  raise notice 'el mensaje se guarda aunque el aviso al grupo no pueda salir';

  if v_puerta is distinct from 'dddddddd-0000-0000-0000-0000000000ff'::uuid then
    raise exception 'la puerta no se ha rellenado sola: %', coalesce(v_puerta::text,'nula');
  end if;
  raise notice 'escrito en la visita, queda colgado también de su puerta';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Un mensaje vacío no es un mensaje
-- ---------------------------------------------------------------------------
do $$
declare v_entro boolean := false;
begin
  begin
    insert into public.mensajes (aviso_id, texto, quien)
    values ('dddddddd-0000-0000-0000-00000000000a','   ','Dani');
    v_entro := true;
  exception when check_violation then
    null;
  end;
  if v_entro then raise exception 'ha entrado un mensaje vacío'; end if;
  raise notice 'un mensaje en blanco no entra';
end $$;

do $$
declare v_entro boolean := false;
begin
  begin
    insert into public.mensajes (aviso_id, texto, quien)
    values ('dddddddd-0000-0000-0000-00000000000a', repeat('x', 2500), 'Dani');
    v_entro := true;
  exception when check_violation then
    null;
  end;
  if v_entro then raise exception 'ha entrado un mensaje de 2500 caracteres'; end if;
  raise notice 'y uno larguísimo tampoco: para eso están los documentos';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Un mensaje que no cuelga de nada no se puede leer desde ningún sitio
-- ---------------------------------------------------------------------------
do $$
declare v_entro boolean := false;
begin
  begin
    insert into public.mensajes (texto, quien) values ('PRUEBA huérfano','Dani');
    v_entro := true;
  exception when check_violation then
    null;
  end;
  if v_entro then raise exception 'ha entrado un mensaje sin visita ni puerta'; end if;
  raise notice 'un mensaje sin visita ni puerta no entra';
end $$;

-- ---------------------------------------------------------------------------
-- 4. La chincheta se puede poner y quitar
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid; v_fijado boolean;
begin
  select id into v_id from public.mensajes where texto = 'PRUEBA el cuadro es otro';
  update public.mensajes set fijado = true where id = v_id;
  select fijado into v_fijado from public.mensajes where id = v_id;
  if not v_fijado then raise exception 'la chincheta no se ha puesto'; end if;
  update public.mensajes set fijado = false where id = v_id;
  select fijado into v_fijado from public.mensajes where id = v_id;
  if v_fijado then raise exception 'la chincheta no se ha quitado'; end if;
  raise notice 'la chincheta se pone y se quita';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Lo importante: el texto no se cambia y el mensaje no se borra
--
-- Esto se comprueba por los PERMISOS, que es lo que de verdad protege. El rol
-- «authenticated» es con el que entra la aplicación; el superusuario que lanza
-- estas pruebas se lo salta todo, así que preguntar por los permisos es la
-- única manera honesta de comprobarlo aquí.
-- ---------------------------------------------------------------------------
do $$
declare v_texto boolean; v_fijado boolean; v_borra boolean; v_pol int;
begin
  v_texto  := has_column_privilege('authenticated','public.mensajes','texto','UPDATE');
  v_fijado := has_column_privilege('authenticated','public.mensajes','fijado','UPDATE');
  v_borra  := has_table_privilege ('authenticated','public.mensajes','DELETE');

  if v_texto then
    raise exception 'LA APLICACIÓN PUEDE REESCRIBIR EL TEXTO DE UN MENSAJE. '
                    'El hilo deja de ser un registro: quien se equivoca borra la prueba.';
  end if;
  raise notice 'el texto de un mensaje NO se puede reescribir';

  if not v_fijado then
    raise exception 'la chincheta no se puede tocar y entonces no sirve de nada';
  end if;
  raise notice 'y la chincheta sí, que es lo único que debe poder cambiarse';

  if v_borra then
    raise exception 'LA APLICACIÓN PUEDE BORRAR MENSAJES. No puede.';
  end if;
  raise notice 'un mensaje NO se puede borrar desde la aplicación';

  select count(*) into v_pol from pg_policies
   where schemaname = 'public' and tablename = 'mensajes' and cmd = 'DELETE';
  if v_pol > 0 then
    raise exception 'hay % política(s) de borrado en mensajes', v_pol;
  end if;
  raise notice 'y no hay ninguna política de borrado que lo permita';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Si se va la visita, se va su conversación
--
-- Es lo que se quiere: el mensaje es de ese trabajo, no un documento que deba
-- sobrevivir solo. Lo que NO se quiere es que borrar una visita falle porque
-- tiene mensajes colgando.
-- ---------------------------------------------------------------------------
do $$
declare v_quedan int;
begin
  delete from public.avisos where id = 'dddddddd-0000-0000-0000-00000000000a';
  select count(*) into v_quedan from public.mensajes where texto like 'PRUEBA %';
  if v_quedan > 0 then
    raise exception 'han quedado % mensajes sueltos tras borrar la visita', v_quedan;
  end if;
  raise notice 'al borrar la visita se va su conversación, sin dejar sueltos';
end $$;

delete from public.puertas  where id = 'dddddddd-0000-0000-0000-0000000000ff';
delete from public.clientes where id = 'dddddddd-0000-0000-0000-000000000001';
