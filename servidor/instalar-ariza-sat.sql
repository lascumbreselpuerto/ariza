-- ============================================================================
-- ARIZA SAT · INSTALACIÓN COMPLETA EN UN PROYECTO NUEVO DE SUPABASE
--
-- Generado el 17 de noviembre de 2026 a partir de la radiografía de la base de
-- producción de Ariza Puertas y Automatismos.
--
--
-- QUÉ ES ESTO
-- El esquema EXACTO de la base que está en uso: sus tablas con sus columnas y
-- sus tipos, sus claves, sus índices, sus vistas, sus funciones, sus
-- disparadores, sus permisos, sus políticas de seguridad y sus comentarios.
--
-- No está deducido de nada. Se leyó de los catálogos de Postgres de la base de
-- verdad, que es donde Postgres guarda cómo está hecha.
--
--
-- POR QUÉ ESTE Y NO EL DE ANTES
-- El instalador del 14-11-2026 juntaba los 41 ficheros de servidor/, que son
-- los que se han ido escribiendo desde que el proyecto guarda sus SQL. Pero el
-- esquema original se creó antes de eso y nunca se guardó en un fichero:
-- faltaban 18 tablas y 15 funciones, y reventaba en la línea 172.
--
-- Este fichero SUSTITUYE a aquel. No hay que ejecutar nada más: los 41
-- ficheros de servidor/ ya están aplicados en producción, así que lo que
-- hicieron está dentro de esto.
--
--
-- QUÉ NO TRAE, Y ES A PROPÓSITO
--   · LOS DATOS. Ni clientes, ni puertas, ni avisos, ni fotos. La base de
--     pruebas se quiere vacía.
--   · LOS AVISOS. La tabla config_interna queda vacía, y sin avisos_url ni
--     avisos_secreto no sale ni un mensaje de Telegram ni un correo. Es
--     justo lo que se quiere en pruebas: silencio total.
--   · TU USUARIO. Se crea solo al registrarte en la aplicación de pruebas.
--     No hace falta ponerlo como administrador a mano: la base trae una
--     función, rol_guard, que pone rol de administrador al que se registre
--     con el correo de la empresa. Cualquier otro entra como técnico, y los
--     roles los cambias tú desde Oficina → Equipo.
--
--
-- CÓMO SE USA
--   1. Crea el proyecto nuevo en Supabase y espera a que termine de montarse.
--   2. Abre el editor de SQL.
--   3. Pega esto ENTERO y dale a ejecutar. Tarda un rato.
--   4. Al final devuelve dos tablas: la cuenta de lo que ha quedado montado y
--      los siete almacenes de ficheros. Compara con lo que dice el LEEME.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO. Si algo falla por el camino, se
-- arregla y se vuelve a lanzar entero.
-- ============================================================================


-- ============================================================================
-- RED DE SEGURIDAD
--
-- Esto es para montar una base NUEVA. Si se lanza por error contra la base que
-- está en uso, se para aquí en vez de ponerse a recrear políticas y funciones
-- sobre una base con el trabajo de la empresa dentro.
--
-- Si alguna vez hace falta relanzarlo sobre una base que YA tiene datos (por
-- ejemplo para reparar algo), comenta este bloque y nada más.
-- ============================================================================
do $$
declare n bigint;
begin
  if to_regclass('public.clientes') is not null then
    execute 'select count(*) from public.clientes' into n;
    if n > 0 then
      raise exception
        'Esta base ya tiene % cliente(s). Este fichero es para montar una base NUEVA y vacía. Si de verdad quieres ejecutarlo aquí, comenta el bloque RED DE SEGURIDAD.', n;
    end if;
  end if;
end $$;


-- ============================================================================
-- Un cuerpo de función puede nombrar una vista, y una vista puede llamar a una
-- función. Con esto Postgres no comprueba los cuerpos al crearlos y el orden
-- deja de importar. Es lo mismo que hace pg_dump al restaurar una copia.
-- ============================================================================
set check_function_bodies = off;

-- ============================================================================
-- LAS EXTENSIONES QUE TIENE LA BASE DE PRODUCCIÓN
--
-- Van como comentario y no como orden: un proyecto nuevo de Supabase ya trae
-- las suyas, cada una en el esquema que le toca, y volver a crearlas desde
-- aquí es buscarse un problema que no hace falta. Se listan para saber cuáles
-- hay, por si alguna vez falta una.
-- ============================================================================

-- extensión instalada: pg_cron
-- extensión instalada: pg_net
-- extensión instalada: pg_stat_statements
-- extensión instalada: pgcrypto
-- extensión instalada: supabase_vault
-- extensión instalada: uuid-ossp


-- ==========================================================================
-- LAS FUNCIONES  ·  50
--
-- Van las primeras porque hay columnas cuyo valor por defecto llama a una de
-- ellas, y una comprobación de tabla que usa otra. Postgres no deja crear una
-- tabla cuyo valor por defecto llame a una función que todavía no existe.
--
-- Aquí dentro está todo lo que la aplicación pide a la base por su nombre:
-- crear y emitir un expediente, valorar una visita, la ficha pública del QR,
-- el presupuesto público, generar las preventivas, anular y reabrir una
-- asistencia, y quién puede ver qué (es_equipo y es_gestion).
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.admin_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select p.id from public.perfiles p
   where p.rol = 'admin' and coalesce(p.activo, true)
   order by p.nombre nulls last, p.id
   limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.anular_asistencia(p_aviso uuid, p_motivo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_quien text; v_puerta uuid; v_firma text; v_motivo text;
begin
  if not public.es_gestion() then
    return json_build_object('ok', false, 'motivo', 'permiso');
  end if;

  v_motivo := btrim(coalesce(p_motivo, ''));
  if length(v_motivo) < 3 then
    return json_build_object('ok', false, 'motivo', 'sin_motivo');
  end if;

  select puerta_id, firma_ruta into v_puerta, v_firma
    from public.avisos where id = p_aviso;
  if not found then
    return json_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if v_firma is not null then
    return json_build_object('ok', false, 'motivo', 'ya_firmada');
  end if;

  select coalesce(nombre, '') into v_quien from public.perfiles where id = auth.uid();

  update public.avisos
     set anulada = true,
         anulada_motivo = v_motivo,
         anulada_en = now(),
         anulada_por = nullif(v_quien, ''),
         estado = 'cerrado',
         cerrado = now(),
         cerrado_por = nullif(v_quien, ''),
         actualizado = now()
   where id = p_aviso;

  -- Si la puerta estaba marcada por este aviso y no le queda ningún otro
  -- abierto, vuelve a operativa. Si le queda otro, se deja como está.
  if v_puerta is not null then
    update public.puertas p
       set estado = 'operativa', estado_desde = now()
     where p.id = v_puerta
       and p.estado in ('aviso_recibido','tecnico_asignado','en_reparacion','esperando_repuesto')
       and not exists (
         select 1 from public.avisos a
          where a.puerta_id = v_puerta and a.id <> p_aviso and a.cerrado is null);
  end if;

  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.archivar_asistencia(p_aviso uuid, p_archivar boolean DEFAULT true)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_quien text;
begin
  if not public.es_admin() then
    return json_build_object('ok', false, 'motivo', 'permiso');
  end if;
  if not exists (select 1 from public.avisos where id = p_aviso) then
    return json_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  select coalesce(nombre, '') into v_quien from public.perfiles where id = auth.uid();

  update public.avisos
     set archivado = p_archivar,
         archivado_en  = case when p_archivar then now() else null end,
         archivado_por = case when p_archivar then nullif(v_quien, '') else null end
   where id = p_aviso;

  return json_build_object('ok', true, 'archivado', p_archivar);
end $function$
;

CREATE OR REPLACE FUNCTION public.archivar_cliente(p_cliente uuid, p_archivar boolean DEFAULT true)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_nombre text; v_quien text;
begin
  if not public.es_admin() then
    return json_build_object('ok', false, 'motivo', 'permiso');
  end if;
  select nombre into v_nombre from public.clientes where id = p_cliente;
  if v_nombre is null then
    return json_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  select coalesce(nombre, '') into v_quien from public.perfiles where id = auth.uid();

  update public.clientes
     set archivado = p_archivar,
         archivado_en  = case when p_archivar then now() else null end,
         archivado_por = case when p_archivar then nullif(v_quien, '') else null end
   where id = p_cliente;

  return json_build_object('ok', true, 'nombre', v_nombre, 'archivado', p_archivar);
end $function$
;

CREATE OR REPLACE FUNCTION public.articulo_por_barras(p_codigo text)
 RETURNS TABLE(id uuid, descripcion text, unidad text, codigo text, token text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with limpio as (
    select regexp_replace(coalesce(p_codigo, ''), '[^0-9A-Za-z]', '', 'g') as c
  ), formas as (
    -- se busca por el código tal cual y por su forma de trece cifras, para que
    -- dé igual que el lector haya devuelto doce o trece
    select c as forma from limpio
    union
    select '0' || c from limpio where c ~ '^[0-9]{12}$'
    union
    select substring(c from 2) from limpio where c ~ '^0[0-9]{12}$'
  )
  select a.id, a.descripcion, a.unidad, a.codigo, a.token
    from public.articulos a
   where coalesce(a.activo, true)
     and a.ean is not null
     and regexp_replace(a.ean, '[^0-9A-Za-z]', '', 'g') in (select forma from formas)
   limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.avisar_cierre()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if new.cerrado is not null
     and old.cerrado is null
     and not coalesce(new.anulada, false) then
    perform public.avisar_grupo(
      jsonb_build_object('tipo','cierre','aviso_id', new.id));
  end if;
  return new;
exception when others then
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.avisar_grupo(p_cuerpo jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_url text;
  v_sec text;
begin
  select valor into v_url from public.config_interna where clave = 'avisos_url';
  select valor into v_sec from public.config_interna where clave = 'avisos_secreto';
  if v_url is null or v_sec is null then return; end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-ariza-secreto', v_sec),
    body    := p_cuerpo
  );
exception when others then
  -- Que el aviso no salga no puede impedir guardar el trabajo. Nunca.
  return;
end $function$
;

CREATE OR REPLACE FUNCTION public.avisar_jornada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  perform public.avisar_grupo(
    jsonb_build_object('tipo','jornada','aviso_id', new.aviso_id, 'jornada_id', new.id));
  return new;
exception when others then
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.avisar_llegada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  /* Solo en el momento en que se sella la hora, y solo en una visita que está
     abierta: rellenar a mano la hora de una visita ya cerrada o anulada es
     papeleo de oficina, no una llegada que haya que anunciar. */
  if new.hora_inicio is not null
     and old.hora_inicio is null
     and new.cerrado is null
     and not coalesce(new.anulada, false) then
    perform public.avisar_grupo(
      jsonb_build_object('tipo','llegada','aviso_id', new.id));
  end if;
  return new;
exception when others then
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.avisar_mensaje()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_tecnico uuid;
  v_cerrado timestamptz;
begin
  if new.aviso_id is null then return new; end if;

  select a.tecnico_id, a.cerrado into v_tecnico, v_cerrado
    from public.avisos a where a.id = new.aviso_id;

  /* Fijado: suena siempre, lo escriba quien lo escriba. Es la manera de decir
     «esto hay que saberlo ahora».
     Sin fijar: suena solo si quien escribe NO es el técnico que tiene esa
     asistencia. Escribir en la tuya propia es dejar una nota, no llamar a
     nadie. */
  if new.fijado
     or v_tecnico is null
     or new.perfil_id is null
     or new.perfil_id <> v_tecnico then
    perform public.avisar_grupo(jsonb_build_object(
      'tipo',       'mensaje',
      'aviso_id',   new.aviso_id,
      'mensaje_id', new.id));
  end if;
  return new;
exception when others then
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.aviso_dueno()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_admin uuid;
begin
  if new.tecnico_id is null and coalesce(new.tipo, 'averia') = 'averia' then
    v_admin := public.admin_id();
    if v_admin is not null then
      new.tecnico_id := v_admin;
      new.tecnico := coalesce((select nombre from public.perfiles where id = v_admin), '');
      if coalesce(new.estado, 'recibido') = 'recibido' then
        new.estado := 'asignado';
      end if;
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.aviso_publico(p_codigo text, p_token text, p_tipo text, p_descripcion text, p_nombre text, p_telefono text, p_email text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_puerta uuid;
  v_tipo   text := case when p_tipo = 'comercial' then 'comercial' else 'averia' end;
  v_nom    text := btrim(coalesce(p_nombre, ''));
  v_tel    text := btrim(coalesce(p_telefono, ''));
  v_mail   text := nullif(btrim(coalesce(p_email, '')), '');
begin
  select p.id into v_puerta
    from puertas p join etiquetas e on e.codigo = p.codigo
   where p.codigo = p_codigo and e.token = p_token;
  if v_puerta is null then
    return json_build_object('ok', false, 'error', 'etiqueta');
  end if;
  if v_nom = '' or length(regexp_replace(v_tel, '\D', '', 'g')) < 9 then
    return json_build_object('ok', false, 'error', 'contacto');
  end if;
  if length(btrim(coalesce(p_descripcion, ''))) < 5 then
    return json_build_object('ok', false, 'error', 'descripcion');
  end if;

  insert into avisos (puerta_id, tipo, estado, descripcion, origen, contacto,
                      contacto_nombre, contacto_telefono, contacto_email)
  values (v_puerta, v_tipo, 'recibido', btrim(p_descripcion), 'cliente',
          v_nom || ' · ' || v_tel || coalesce(' · ' || v_mail, ''),
          v_nom, v_tel, v_mail);

  -- Una petición de presupuesto no cambia el estado de la puerta; una avería sí
  if v_tipo <> 'comercial' then
    update puertas set estado = 'aviso_recibido', estado_desde = now()
     where id = v_puerta and estado = 'operativa';
  end if;

  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.avisos_sellar_alta()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.movido_el := coalesce(new.movido_el, now());
  new.estado_el := coalesce(new.estado_el, now());
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.avisos_sellar_movimiento()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- Se sella solo si quien hace el cambio NO ha puesto él la fecha. Si la pone
  -- (el relleno de más arriba, o una corrección a mano), manda la suya.
  -- Sin esta condición la columna sería imposible de rellenar: el disparador
  -- machacaría con la fecha de hoy el relleno del propio fichero, y el día que
  -- se ejecutara, TODO lo que está abierto parecería recién tocado. Es decir,
  -- el panel de lo parado saldría vacío y mintiendo.
  if new.movido_el is not distinct from old.movido_el then
    new.movido_el := now();
  end if;
  if new.estado is distinct from old.estado
     and new.estado_el is not distinct from old.estado_el then
    new.estado_el := now();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.borrar_asistencia(p_aviso uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_firma text; v_cerrado timestamptz; v_ruta text;
begin
  if not public.es_admin() then
    return json_build_object('ok', false, 'motivo', 'permiso');
  end if;

  select firma_ruta, cerrado into v_firma, v_cerrado
    from public.avisos where id = p_aviso;
  if not found then
    return json_build_object('ok', false, 'motivo', 'no_existe');
  end if;

  if v_firma is not null then
    return json_build_object('ok', false, 'motivo', 'firmada');
  end if;

  delete from public.avisos where id = p_aviso;
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.borrar_cliente(p_cliente uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_nombre text;
  v_puertas   bigint;
  v_avisos    bigint;
  v_contratos bigint;
begin
  if not public.es_admin() then
    return json_build_object('ok', false, 'motivo', 'permiso');
  end if;

  select nombre into v_nombre from public.clientes where id = p_cliente;
  if v_nombre is null then
    return json_build_object('ok', false, 'motivo', 'no_existe');
  end if;

  select count(*) into v_puertas   from public.puertas   where cliente_id = p_cliente;
  select count(*) into v_avisos    from public.avisos    where cliente_id = p_cliente;
  select count(*) into v_contratos from public.contratos where cliente_id = p_cliente;

  if v_puertas + v_avisos + v_contratos > 0 then
    return json_build_object('ok', false, 'motivo', 'tiene_historial',
      'puertas', v_puertas, 'avisos', v_avisos, 'contratos', v_contratos,
      'nombre', v_nombre);
  end if;

  delete from public.clientes where id = p_cliente;
  return json_build_object('ok', true, 'nombre', v_nombre);
end $function$
;

CREATE OR REPLACE FUNCTION public.borrar_expediente(p_exp uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_estado text;
begin
  if not public.es_admin() then
    return json_build_object('ok', false, 'motivo', 'permiso');
  end if;
  select estado into v_estado from public.expedientes where id = p_exp;
  if not found then
    return json_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  -- Un expediente ya emitido es documentación entregada al cliente: no se borra.
  if v_estado = 'emitido' then
    return json_build_object('ok', false, 'motivo', 'emitido');
  end if;
  delete from public.expedientes where id = p_exp;
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.cliente_arrastra(p_cliente uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select json_build_object(
    'puertas',   (select count(*) from public.puertas   where cliente_id = p_cliente),
    'avisos',    (select count(*) from public.avisos    where cliente_id = p_cliente),
    'contratos', (select count(*) from public.contratos where cliente_id = p_cliente),
    'firmadas',  (select count(*) from public.avisos
                   where cliente_id = p_cliente and firma_ruta is not null)
  )
  where public.es_equipo();
$function$
;

CREATE OR REPLACE FUNCTION public.contrato_publico(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'referencia', k.referencia,
    'estado', k.estado,
    'cliente', c.nombre,
    'alta', k.fecha_alta,
    'vence', k.fecha_vencimiento,
    'a_peticion', k.a_peticion,
    'periodicidad_meses', k.periodicidad_meses,
    'incluye', k.incluye,
    'excluye', k.excluye,
    'clausulas', k.clausulas,
    'prioridad_horas', k.prioridad_horas,
    'firmado_el', k.firmado_el,
    'puertas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'codigo', p.codigo, 'tipo', p.tipo, 'direccion', p.direccion,
               'ubicacion', p.ubicacion, 'marca', p.marca, 'modelo', p.modelo,
               'ultima_revision', p.ultima_revision, 'proxima_revision', p.proxima_revision)
             order by p.codigo)
        from public.contrato_puertas cp
        join public.puertas p on p.id = cp.puerta_id
       where cp.contrato_id = k.id), '[]'::jsonb))
    from public.contratos k
    join public.clientes c on c.id = k.cliente_id
   where k.token = p_token and k.estado <> 'baja';
$function$
;

CREATE OR REPLACE FUNCTION public.correo_del_parte(p_aviso uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
           nullif(btrim(a.contacto_email), ''),
           nullif(btrim(c1.email), ''),
           nullif(btrim(c2.email), '')
         )
    from public.avisos a
    left join public.clientes c1 on c1.id = a.cliente_id
    left join public.puertas  pu on pu.id = a.puerta_id
    left join public.clientes c2 on c2.id = pu.cliente_id
   where a.id = p_aviso;
$function$
;

CREATE OR REPLACE FUNCTION public.crear_expediente(p_puerta uuid, p_situacion text, p_familia text, p_aviso uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_id uuid; v_num int; v_ref text; v_cli uuid; v_quien text; v_anio int;
begin
  if not public.es_equipo() then
    return json_build_object('ok', false, 'motivo', 'permiso');
  end if;
  if p_situacion not in ('nueva_fabricante','nueva_instalador','adecuacion','modificacion') then
    return json_build_object('ok', false, 'motivo', 'situacion');
  end if;
  if p_familia not in ('industrial','peatonal','barrera','cortafuegos') then
    return json_build_object('ok', false, 'motivo', 'familia');
  end if;

  select cliente_id into v_cli from public.puertas where id = p_puerta;
  select coalesce(nombre, '') into v_quien from public.perfiles where id = auth.uid();

  v_anio := extract(year from (now() at time zone 'Europe/Madrid'))::int;
  select coalesce(max(e.numero), 0) + 1 into v_num
    from public.expedientes e
   where extract(year from e.fecha_apertura) = v_anio;
  v_ref := 'EXP-' || v_anio || '-' || lpad(v_num::text, 3, '0');

  insert into public.expedientes (referencia, numero, puerta_id, cliente_id, aviso_id,
                                  situacion, familia, autor)
  values (v_ref, v_num, p_puerta, v_cli, p_aviso, p_situacion, p_familia, nullif(v_quien, ''))
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id, 'referencia', v_ref);
end $function$
;

CREATE OR REPLACE FUNCTION public.duplicar_asistencia(p_aviso uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_id uuid;
begin
  if not public.es_equipo() then
    raise exception 'Sin permiso';
  end if;

  insert into public.avisos (
    puerta_id, cliente_id, direccion_libre, tipo, prioridad, estado, origen,
    descripcion, notas_oficina,
    contacto, contacto_nombre, contacto_telefono, contacto_email,
    tecnico_id, tecnico, fecha_prevista)
  select a.puerta_id, a.cliente_id, a.direccion_libre, a.tipo, a.prioridad,
         case when a.tecnico_id is null then 'recibido' else 'asignado' end,
         a.origen,
         a.descripcion, a.notas_oficina,
         a.contacto, a.contacto_nombre, a.contacto_telefono, a.contacto_email,
         a.tecnico_id, a.tecnico, null
    from public.avisos a
   where a.id = p_aviso
  returning id into v_id;

  if v_id is null then
    raise exception 'La asistencia que quieres duplicar no existe';
  end if;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.emitir_expediente(p_exp uuid, p_firmante text, p_cargo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_quien text;
begin
  if not public.es_gestion() then
    return json_build_object('ok', false, 'motivo', 'permiso');
  end if;
  if not exists (select 1 from public.expedientes where id = p_exp) then
    return json_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if length(btrim(coalesce(p_firmante, ''))) < 3 then
    return json_build_object('ok', false, 'motivo', 'sin_firmante');
  end if;
  select coalesce(nombre, '') into v_quien from public.perfiles where id = auth.uid();

  update public.expedientes
     set estado = 'emitido', emitido_el = now(), emitido_por = nullif(v_quien, ''),
         firmante = btrim(p_firmante), firmante_cargo = nullif(btrim(coalesce(p_cargo,'')), ''),
         actualizado = now()
   where id = p_exp;
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.enviar_contrato(p_contrato uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_sec text; v_url text; v_mail text;
begin
  if not public.es_gestion() then return false; end if;
  select c.email into v_mail
    from public.contratos k join public.clientes c on c.id = k.cliente_id
   where k.id = p_contrato;
  if v_mail is null or btrim(v_mail) = '' then return false; end if;
  select valor into v_url from public.config_interna where clave = 'avisos_url';
  select valor into v_sec from public.config_interna where clave = 'avisos_secreto';
  if v_url is null or v_sec is null then return false; end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-ariza-secreto', v_sec),
    body    := jsonb_build_object('tipo','contrato','contrato_id', p_contrato)
  );
  update public.contratos set expedido_el = coalesce(expedido_el, current_date) where id = p_contrato;
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.enviar_parte(p_aviso uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_sec  text;
  v_url  text;
  v_mail text;
begin
  if not public.es_gestion() then return false; end if;

  if not exists (select 1 from public.avisos
                  where id = p_aviso and cerrado is not null) then
    return false;
  end if;

  select coalesce(
           nullif(btrim(a.contacto_email), ''),
           nullif(btrim(c1.email), ''),
           nullif(btrim(c2.email), '')
         )
    into v_mail
    from public.avisos a
    left join public.clientes c1 on c1.id = a.cliente_id
    left join public.puertas  pu on pu.id = a.puerta_id
    left join public.clientes c2 on c2.id = pu.cliente_id
   where a.id = p_aviso;

  if v_mail is null then return false; end if;

  select valor into v_url from public.config_interna where clave = 'avisos_url';
  select valor into v_sec from public.config_interna where clave = 'avisos_secreto';
  if v_url is null or v_sec is null then return false; end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-ariza-secreto', v_sec),
    body    := jsonb_build_object('tipo','parte','aviso_id', p_aviso)
  );
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.es_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select exists (
    select 1 from public.perfiles p
     where p.id = auth.uid() and p.rol = 'admin' and coalesce(p.activo, true)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.tecnicos_de_aviso(p_aviso uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select t.tecnico_id from public.aviso_tecnicos t where t.aviso_id = p_aviso
  union
  select a.tecnico_id from public.avisos a where a.id = p_aviso and a.tecnico_id is not null;
$function$
;

CREATE OR REPLACE FUNCTION public.es_equipo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from perfiles p where p.id = auth.uid() and p.activo);
$function$
;

CREATE OR REPLACE FUNCTION public.es_gestion()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select exists (
    select 1 from public.perfiles p
     where p.id = auth.uid() and p.rol in ('admin','oficina') and coalesce(p.activo, true)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.ficha_publica(p_codigo text, p_token text)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select json_build_object(
    'codigo', p.codigo, 'tipo', p.tipo, 'uso', p.uso,
    'marca', p.marca, 'modelo', p.modelo, 'ubicacion', p.ubicacion,
    'estado', p.estado, 'estado_desde', p.estado_desde,
    'ultima_revision', p.ultima_revision, 'proxima_revision', p.proxima_revision,
    'aviso', (select json_build_object('tipo', a.tipo, 'estado', a.estado,
                'creado', a.creado, 'fecha_prevista', a.fecha_prevista)
              from avisos a
              where a.puerta_id = p.id and a.cerrado is null and a.tipo <> 'comercial'
              order by a.creado desc limit 1),
    'documentos', (select coalesce(json_agg(json_build_object('nombre', d.nombre, 'tipo', d.tipo, 'ruta', d.ruta)
                     order by d.creado), '[]'::json)
                   from documentos d where d.puerta_id = p.id and d.publico))
  from puertas p join etiquetas e on e.codigo = p.codigo
  where p.codigo = p_codigo and e.token = p_token;
$function$
;

CREATE OR REPLACE FUNCTION public.generar_preventivas(p_dias integer DEFAULT 21)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  r record;
  n int := 0;
begin
  -- desde la app solo la puede llamar alguien del equipo; el cron entra sin sesión y pasa
  if auth.uid() is not null and not public.es_equipo() then
    raise exception 'no autorizado';
  end if;
  for r in
    select pu.id, pu.codigo, pu.cliente_id, pu.proxima_revision
      from public.puertas pu
     where pu.sin_mantenimiento = false
       and pu.proxima_revision is not null
       and pu.proxima_revision <= current_date + p_dias
       and not exists (
         select 1 from public.avisos a
          where a.puerta_id = pu.id
            and a.tipo = 'mantenimiento'
            and a.cerrado is null
       )
  loop
    insert into public.avisos
      (puerta_id, cliente_id, tipo, estado, origen, prioridad, fecha_prevista,
       descripcion, notas_oficina, creado_por)
    values
      (r.id, r.cliente_id, 'mantenimiento', 'recibido', 'interno', 'programada', r.proxima_revision,
       'Revisión periódica programada',
       'Generada automáticamente. Rellena el guión de revisión al cerrar la visita.',
       'sistema');
    n := n + 1;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.marco_maquinas(p_fecha date)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_fecha is null then 'pendiente'
    when p_fecha < date '2027-01-20' then 'directiva'
    else 'reglamento'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.mensaje_completa_puerta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.puerta_id is null and new.aviso_id is not null then
    select a.puerta_id into new.puerta_id
      from public.avisos a where a.id = new.aviso_id;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.normaliza_ean()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v text;
begin
  if new.ean is null or btrim(new.ean) = '' then
    new.ean := null;                       -- vacío es no tener código, no cadena vacía
    return new;
  end if;
  v := regexp_replace(new.ean, '[^0-9A-Za-z]', '', 'g');
  -- Un UPC-A de doce cifras es el mismo código que el EAN-13 que empieza por
  -- cero: se guarda siempre con trece, para que la misma caja no dé dos
  -- artículos.
  if v ~ '^[0-9]{12}$' then
    v := '0' || v;
  end if;
  new.ean := upper(v);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notificar_aviso()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'extensions'
AS $function$
declare
  v_url text;
  v_sec text;
  v_tipo text;
begin
  select valor into v_url from public.config_interna where clave = 'avisos_url';
  select valor into v_sec from public.config_interna where clave = 'avisos_secreto';
  if v_url is null or v_sec is null then
    return new;
  end if;

  -- Una asistencia anulada no genera parte, así que no genera correo de cierre.
  if coalesce(new.anulada, false) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.origen = 'cliente' then v_tipo := 'nuevo'; end if;
  elsif tg_op = 'UPDATE' then
    if new.cerrado is not null and old.cerrado is null then
      v_tipo := 'cerrado';
    elsif new.tecnico_id is not null and new.tecnico_id is distinct from old.tecnico_id then
      v_tipo := 'asignado';
    end if;
  end if;

  if v_tipo is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ariza-secreto', v_sec),
    body    := jsonb_build_object('tipo', v_tipo, 'aviso_id', new.id)
  );
  return new;
exception when others then
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.periodicidad_puerta(p_puerta uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select pu.periodicidad_meses from public.puertas pu
      where pu.id = p_puerta and pu.periodicidad_meses is not null),
    (select cp.periodicidad_meses from public.contrato_puertas cp
       join public.contratos k on k.id = cp.contrato_id and k.estado = 'activo'
      where cp.puerta_id = p_puerta and cp.periodicidad_meses is not null
      order by k.fecha_alta desc limit 1),
    (select k.periodicidad_meses from public.contrato_puertas cp
       join public.contratos k on k.id = cp.contrato_id and k.estado = 'activo'
      where cp.puerta_id = p_puerta
      order by k.fecha_alta desc limit 1),
    (select k.periodicidad_meses from public.contratos k
       join public.puertas pu on pu.cliente_id = k.cliente_id
      where pu.id = p_puerta and k.estado = 'activo'
      order by k.fecha_alta desc limit 1),
    (select (valor #>> '{}')::int from public.ajustes where clave = 'periodicidad_defecto'),
    12
  );
$function$
;

CREATE OR REPLACE FUNCTION public.presupuesto_publico(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.presupuestos%rowtype;
  v_lineas jsonb;
  v_adj    jsonb;
  v_cliente text;
  v_puerta  text;
begin
  if p_token is null or length(p_token) < 8 then
    return jsonb_build_object('ok', false, 'motivo', 'sin_token');
  end if;
  select * into p from public.presupuestos where token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if p.estado = 'borrador' then
    return jsonb_build_object('ok', false, 'motivo', 'no_enviado');
  end if;

  begin
    insert into public.presupuesto_visitas (presupuesto_id) values (p.id);
  exception when others then
    null;  -- que no se pueda apuntar la visita no impide ver la oferta
  end;

  select coalesce(nombre, '') into v_cliente from public.clientes where id = p.cliente_id;
  select coalesce(codigo, '') into v_puerta  from public.puertas  where id = p.puerta_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'descripcion', l.descripcion, 'cantidad', l.cantidad,
           'unidad', l.unidad, 'precio', l.precio, 'importe', l.importe,
           'tipo', l.tipo, 'nombre', l.nombre, 'referencia', l.referencia,
           'detalle', l.detalle, 'dto', l.dto) order by l.orden), '[]'::jsonb)
    into v_lineas
    from public.presupuesto_lineas l
   where l.presupuesto_id = p.id;

  -- Solo los marcados como públicos: lo de la oficina se queda en la oficina
  select coalesce(jsonb_agg(jsonb_build_object(
           'nombre', a.nombre, 'descripcion', a.descripcion,
           'ruta', a.ruta, 'tipo', a.tipo, 'bytes', a.bytes) order by a.orden), '[]'::jsonb)
    into v_adj
    from public.presupuesto_adjuntos a
   where a.presupuesto_id = p.id and a.publico;

  return jsonb_build_object(
    'ok', true,
    'referencia', p.referencia, 'titulo', p.titulo, 'descripcion', p.descripcion,
    'estado', p.estado, 'fecha', p.fecha, 'valido_hasta', p.valido_hasta,
    'caducado', (p.valido_hasta is not null and p.valido_hasta < current_date
                 and p.estado not in ('aceptado','convertido')),
    'cliente', v_cliente, 'puerta', v_puerta,
    'materiales', p.materiales, 'mano_obra', p.mano_obra,
    'desplazamiento', p.desplazamiento, 'descuento', p.descuento,
    'base', p.base, 'tipo_iva', p.tipo_iva, 'iva', p.iva, 'total', p.total,
    'condiciones', p.condiciones,
    'aceptado_el', p.aceptado_el, 'aceptado_por', p.aceptado_por,
    'rechazado_el', p.rechazado_el,
    'adjuntos', v_adj,
    'lineas', v_lineas);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reabrir_asistencia(p_aviso uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not public.es_gestion() then
    return json_build_object('ok', false, 'motivo', 'permiso');
  end if;
  if not exists (select 1 from public.avisos where id = p_aviso and anulada) then
    return json_build_object('ok', false, 'motivo', 'no_anulada');
  end if;
  update public.avisos
     set anulada = false, anulada_motivo = null, anulada_en = null, anulada_por = null,
         cerrado = null, cerrado_por = null,
         estado = case when tecnico_id is null then 'recibido' else 'asignado' end,
         actualizado = now()
   where id = p_aviso;
  return json_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.rentabilidad_contratos()
 RETURNS TABLE(cliente_id uuid, cliente text, referencia text, precio_anual numeric, coste_visitas numeric, margen numeric, n_visitas bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select c.id, c.nombre, k.referencia,
         coalesce(k.precio_anual, 0),
         coalesce(sum(x.coste_total), 0),
         coalesce(k.precio_anual, 0) - coalesce(sum(x.coste_total), 0),
         count(x.aviso_id)
    from public.contratos k
    join public.clientes c on c.id = k.cliente_id
    left join public.avisos a
           on (a.cliente_id = c.id
               or a.puerta_id in (select id from public.puertas where cliente_id = c.id))
          and a.cerrado is not null
          and (a.cerrado at time zone 'Europe/Madrid')::date >= (current_date - 365)
    left join public.valoraciones x on x.aviso_id = a.id
   where public.es_gestion() and k.estado = 'activo'
   group by c.id, c.nombre, k.referencia, k.precio_anual
   order by 6;
$function$
;

CREATE OR REPLACE FUNCTION public.responder_presupuesto(p_token text, p_acepta boolean, p_nombre text, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.presupuestos%rowtype;
begin
  if p_token is null or length(p_token) < 8 then
    return jsonb_build_object('ok', false, 'motivo', 'sin_token');
  end if;
  select * into p from public.presupuestos where token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if p.estado not in ('emitido', 'enviado') then
    return jsonb_build_object('ok', false, 'motivo', 'ya_respondido');
  end if;
  if p.valido_hasta is not null and p.valido_hasta < current_date then
    return jsonb_build_object('ok', false, 'motivo', 'caducado');
  end if;
  if p_acepta and coalesce(trim(p_nombre), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sin_nombre');
  end if;

  if p_acepta then
    update public.presupuestos
       set estado = 'aceptado', aceptado_el = now(),
           aceptado_por = trim(p_nombre), actualizado = now()
     where id = p.id;
  else
    update public.presupuestos
       set estado = 'rechazado', rechazado_el = now(),
           rechazado_motivo = nullif(trim(coalesce(p_motivo, '')), ''),
           actualizado = now()
     where id = p.id;
  end if;

  return jsonb_build_object('ok', true, 'estado', case when p_acepta then 'aceptado' else 'rechazado' end);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resumen_bajas(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)
 RETURNS TABLE(mes text, almacen text, motivo_nombre text, cuantas bigint, coste_total numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select to_char(date_trunc('month', b.creado), 'YYYY-MM') as mes,
         coalesce(b.almacen, 'Sin almacén')                as almacen,
         b.motivo_nombre,
         count(*)                                          as cuantas,
         round(sum(b.coste_total), 2)                      as coste_total
    from public.bajas_material b
   where (p_desde is null or b.creado >= p_desde)
     and (p_hasta is null or b.creado < (p_hasta + 1))
   group by 1, 2, 3
   order by 1 desc, 5 desc nulls last
$function$
;

CREATE OR REPLACE FUNCTION public.resumen_gestion(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)
 RETURNS TABLE(cerradas bigint, facturable numeric, coste numeric, margen numeric, por_facturar numeric, n_por_facturar bigint, cobrado_obra numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  with v as (
    select a.cobrado, a.cobro_importe, a.sin_cargo,
           x.imp_total, x.coste_total, x.margen, x.facturado
      from public.avisos a
      join public.valoraciones x on x.aviso_id = a.id
     where public.es_gestion()
       and a.cerrado is not null
       and (p_desde is null or (a.cerrado at time zone 'Europe/Madrid')::date >= p_desde)
       and (p_hasta is null or (a.cerrado at time zone 'Europe/Madrid')::date <= p_hasta)
  )
  select count(*),
         coalesce(sum(imp_total), 0),
         coalesce(sum(coste_total), 0),
         coalesce(sum(margen), 0),
         coalesce(sum(imp_total) filter (where not facturado and not cobrado and not sin_cargo), 0),
         count(*) filter (where not facturado and not cobrado and not sin_cargo),
         coalesce(sum(cobro_importe) filter (where cobrado), 0)
    from v;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rol_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if (select email from auth.users where id = new.id) = 'arizapuertasautomaticas@gmail.com' then
    new.rol := 'admin';
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.rol is distinct from 'tecnico' and not public.es_admin() then
      new.rol := 'tecnico';
    end if;
  else
    if new.rol is distinct from old.rol and not public.es_admin() then
      new.rol := old.rol;
    end if;
  end if;
  if new.rol not in ('admin','oficina','tecnico') then new.rol := 'tecnico'; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.siguiente_contrato()
 RETURNS TABLE(numero integer, referencia text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a int := extract(year from current_date)::int; n int;
begin
  if not public.es_gestion() then return; end if;
  select coalesce(max(k.numero), 0) + 1 into n
    from public.contratos k
   where extract(year from k.fecha_alta)::int = a;
  numero := n;
  referencia := 'MTO-' || a || '-' || lpad(n::text, 3, '0');
  return next;
end $function$
;

CREATE OR REPLACE FUNCTION public.siguiente_expediente()
 RETURNS TABLE(numero integer, referencia text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_anio int; v_num int;
begin
  if not public.es_equipo() then
    return;
  end if;
  v_anio := extract(year from (now() at time zone 'Europe/Madrid'))::int;
  select coalesce(max(e.numero), 0) + 1 into v_num
    from public.expedientes e
   where extract(year from e.fecha_apertura) = v_anio;
  return query select v_num, 'EXP-' || v_anio || '-' || lpad(v_num::text, 3, '0');
end $function$
;

CREATE OR REPLACE FUNCTION public.sumar_cuotas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_k uuid;
begin
  v_k := coalesce(new.contrato_id, old.contrato_id);
  update public.contratos
     set precio_anual = (select coalesce(sum(cuota_anual), 0)
                           from public.contrato_puertas where contrato_id = v_k)
   where id = v_k;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.tipos_uds_valido(j jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select j is null or (
    jsonb_typeof(j) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(j) e
       where jsonb_typeof(e) <> 'object'
          or e->>'tipo' is null
          or e->>'tipo' = ''
          or (e->>'uds') is null
          or (e->>'uds') !~ '^[0-9]+$'
          or (e->>'uds')::int < 1
          or (e->>'uds')::int > 50
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.token_contrato()
 RETURNS text
 LANGUAGE sql
AS $function$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$function$
;

CREATE OR REPLACE FUNCTION public.tras_cerrar_preventiva()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_meses int;
  v_dia date;
begin
  if new.cerrado is not null and old.cerrado is null
     and new.tipo = 'mantenimiento' and new.puerta_id is not null then
    v_meses := public.periodicidad_puerta(new.puerta_id);
    v_dia := (new.cerrado at time zone 'Europe/Madrid')::date;
    update public.puertas
       set ultima_revision  = v_dia,
           proxima_revision = v_dia + (v_meses || ' months')::interval
     where id = new.puerta_id;
  end if;
  return new;
exception when others then
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.valorar_aviso(p_aviso uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  t  public.tarifas%rowtype;
  a  public.avisos%rowtype;
  k  public.contratos%rowtype;
  v_horas   numeric;
  v_precioh numeric;
  v_mano    numeric := 0;
  v_desp    numeric := 0;
  v_mat     numeric := 0;
  v_cmat    numeric := 0;
  v_cliente uuid;
  v_mo_inc  boolean := false;
  v_dp_inc  boolean := false;
  v_dto     numeric := 0;
  v_dto_mo  numeric := 0;
  -- Añadidas el 02-11-2026 para cobrar el desplazamiento por ruta
  v_ruta    text;
  v_cdesp   numeric := 0;
  v_fu      numeric := 1;   -- factor de urgencia sobre el precio
  v_costeh  numeric;        -- coste de la hora, con su factor si lo lleva
begin
  if not public.es_equipo() then return; end if;
  select * into t from public.tarifas where id = 1;
  select * into a from public.avisos where id = p_aviso;
  if a.id is null or t.id is null then return; end if;

  -- primero, el contrato que cubre esa puerta en concreto
  if a.puerta_id is not null then
    select k2.* into k from public.contrato_puertas cp
      join public.contratos k2 on k2.id = cp.contrato_id
     where cp.puerta_id = a.puerta_id and k2.estado = 'activo'
     order by k2.fecha_alta desc limit 1;
  end if;
  -- si no hay, el contrato del cliente
  if k.id is null then
    v_cliente := coalesce(a.cliente_id,
                 (select pu.cliente_id from public.puertas pu where pu.id = a.puerta_id));
    if v_cliente is not null then
      select * into k from public.contratos
       where cliente_id = v_cliente and estado = 'activo'
       order by fecha_alta desc limit 1;
    end if;
  end if;

  if k.id is not null then
    -- el contrato solo cubre las revisiones periódicas, no las averías
    if a.tipo = 'mantenimiento' then
      v_mo_inc := k.mano_obra_incluida;
      v_dp_inc := k.desplazamiento_incluido;
    end if;
    v_dto    := coalesce(k.descuento_material, 0);
    v_dto_mo := coalesce(k.descuento_mano_obra, 0);
  end if;

  -- (a) materiales escritos a mano que coinciden exactamente con un artículo:
  -- se enlazan solos. precio de venta = coste + recargo, menos el descuento.
  update public.materiales m
     set articulo_id = ar.id,
         coste  = coalesce(m.coste, ar.coste),
         precio = round(coalesce(m.coste, ar.coste)
                        * (1 + coalesce(ar.recargo, t.recargo_material) / 100)
                        * (1 - v_dto / 100), 2)
    from public.articulos ar
   where m.aviso_id = p_aviso
     and m.articulo_id is null
     and lower(btrim(m.descripcion)) = lower(btrim(ar.descripcion));

  -- (b) CORRECCIÓN DEL 02-11-2026
  -- Una línea que alguien enlazó a mano desde la oficina no tenía de dónde
  -- sacar el coste: el enlace automático de arriba solo mira las que están SIN
  -- enlazar, y el cálculo de abajo exige tener coste. Así que la línea quedaba
  -- enlazada con su artículo y seguía valiendo CERO euros, y enlazarla no
  -- servía de nada. Aquí coge el coste y el recargo de su artículo.
  update public.materiales m
     set coste  = ar.coste,
         precio = round(ar.coste
                        * (1 + coalesce(ar.recargo, t.recargo_material) / 100)
                        * (1 - v_dto / 100), 2)
    from public.articulos ar
   where m.aviso_id = p_aviso
     and m.articulo_id = ar.id
     and m.coste is null
     and ar.coste is not null;

  -- (c) líneas con coste y sin precio: el recargo general y el descuento
  update public.materiales m
     set precio = round(m.coste * (1 + t.recargo_material / 100) * (1 - v_dto / 100), 2)
   where m.aviso_id = p_aviso and m.coste is not null and m.precio is null;

  -- lo que no tiene precio suma cero, y eso es lo que Gestión lista aparte
  select coalesce(sum(precio * cantidad), 0), coalesce(sum(coste * cantidad), 0)
    into v_mat, v_cmat
    from public.materiales where aviso_id = p_aviso;

  -- mano de obra: el mínimo facturable manda sobre las horas reales
  v_horas := greatest(coalesce(a.horas, 0), t.minimo_horas);
  /* ---- El recargo de urgencia (04-11-2026) ----
     Antes era un porcentaje de Tarifas, el mismo a cualquier hora. Ahora es un
     factor que depende de CUÁNDO se hizo: ×2 en horario laboral y ×3 fuera de
     horario, en fin de semana y en festivos. Lo calcula la aplicación con la
     hora de llegada sellada y lo deja guardado en avisos.urgencia_factor,
     porque los días festivos los sabe ella y no la base de datos.
     Si no hay factor guardado se hace lo de antes, con el porcentaje: así
     ninguna urgencia anterior al 04-11-2026 cambia de importe al recalcularla. */
  v_fu := case when a.tipo <> 'urgencia' then 1
               when coalesce(a.urgencia_factor, 0) > 0 then a.urgencia_factor
               else 1 + coalesce(t.recargo_urgencia, 0) / 100 end;
  v_precioh := t.precio_hora * v_fu;
  /* El coste de la hora sube con el MISMO factor, decisión de David el
     04-11-2026: si al técnico se le paga más por salir de noche, un margen que
     no lo cuente hace que las urgencias parezcan más rentables de lo que son.
     Solo cuando hay factor guardado: al porcentaje de antes nunca se le aplicó
     al coste, y tocarlo movería el margen de lo ya cerrado. */
  v_costeh := t.coste_hora * (case when a.tipo = 'urgencia'
                                    and coalesce(a.urgencia_factor, 0) > 0
                               then a.urgencia_factor else 1 end);
  if not v_mo_inc then
    v_mano := round(v_horas * coalesce(a.num_tecnicos, 1) * v_precioh * (1 - v_dto_mo / 100), 2);
  end if;
  -- ---- EL DESPLAZAMIENTO, POR RUTA (02-11-2026) --------------------------
  -- Antes: importe fijo más kilómetros, y los kilómetros los estimaba cada
  -- técnico a ojo. Ahora sale de la ruta, que la valora administración. Solo
  -- 'km', que es lo que cae fuera de las cinco rutas, hace la cuenta de antes.
  -- Sin ruta apuntada se valora como ruta1, que es lo que decidió David; el
  -- histórico no se mueve porque rutas.sql le puso ruta a todo lo que había.
  v_ruta := coalesce(nullif(btrim(coalesce(a.ruta, '')), ''), 'ruta1');
  if not v_dp_inc then
    if v_ruta = 'km' then
      v_desp  := round(t.desplazamiento_fijo + coalesce(a.desplazamiento, 0) * t.precio_km, 2);
      v_cdesp := round(coalesce(a.desplazamiento, 0) * t.coste_km, 2);
    else
      -- La ruta 1 cae al importe fijo de toda la vida si está sin rellenar.
      -- Las demás, a cero: así se ve en Gestión que esa ruta no está valorada,
      -- en vez de cobrar un número inventado.
      v_desp := round(coalesce(case v_ruta
          when 'ruta1' then coalesce(t.ruta1_importe, t.desplazamiento_fijo)
          when 'ruta2' then t.ruta2_importe
          when 'ruta3' then t.ruta3_importe
          when 'ruta4' then t.ruta4_importe
          when 'ruta5' then t.ruta5_importe end, 0), 2);
      v_cdesp := round(coalesce(case v_ruta
          when 'ruta1' then t.ruta1_coste
          when 'ruta2' then t.ruta2_coste
          when 'ruta3' then t.ruta3_coste
          when 'ruta4' then t.ruta4_coste
          when 'ruta5' then t.ruta5_coste end, 0), 2);
    end if;
  end if;
  /* El desplazamiento de una urgencia también lleva su factor: salir a las tres
     de la mañana gasta la misma gasolina y cuesta bastante más de todo lo
     demás. Igual que arriba, solo cuando hay factor guardado. */
  if a.tipo = 'urgencia' and coalesce(a.urgencia_factor, 0) > 0 then
    v_desp  := round(v_desp  * a.urgencia_factor, 2);
    v_cdesp := round(v_cdesp * a.urgencia_factor, 2);
  end if;

  -- las visitas comerciales, las de garantía y los desplazamientos en falso no se cobran
  /* Cambiado el 04-11-2026: garantía deja de ser un tipo y pasa a ser un
     subtipo de la correctiva. Lo viejo se sigue mirando por el tipo, para que
     el histórico cerrado como «garantía» siga valiendo cero. */
  /* ---- La puesta en servicio, a cero (05-11-2026) ----
     David: «La puesta en marcha no se hará siempre, es solo cuando no se ha
     podido terminar por algún motivo. No es algo que siempre va a ocurrir y
     como tal no es facturable. Es un punto de finalización de un proyecto o
     instalación que ya se debe de haber terminado y facturado.»

     Dos cosas que hacen esta regla menos simple de lo que parece, y las dos
     cuestan dinero si se hacen mal:

       · Se puede marcar REPERCUTIBLE. Si la obra se quedó parada por culpa del
         cliente (sin corriente definitiva, albañilería suya, remates suyos), el
         segundo viaje lo decide la oficina y entonces sí se factura. Eso lo
         marca gestión a mano: nunca lo pone el ordenador solo.

       · Lo ya cerrado NO se mueve. Hasta hoy una puesta en servicio se
         facturaba como cualquier visita, así que las que ya están cerradas y
         facturadas siguen valiendo lo que valían. La regla nueva alcanza solo a
         las que se cierren a partir de hoy. Sin esta condición, recalcular una
         obra del mes pasado le borraría el importe a una factura ya emitida. */
  if a.tipo in ('comercial','garantia')
     or coalesce(a.subtipo, '') = 'garantia'
     or a.sin_cargo
     or (a.tipo = 'puesta_servicio'
         and coalesce(a.repercutible, false) = false
         and (a.cerrado is null or a.cerrado >= timestamptz '2026-11-05 00:00:00+01')) then
    v_mano := 0; v_desp := 0; v_mat := 0;
  end if;

  /* ---- El desplazamiento en falso: se cobra el viaje (07-11-2026) ----
     David: «Cuando el técnico valore que es una asistencia en falso,
     explicándolo en la app, puede activarla, cerrando el parte para que desde
     oficina se vuelva a gestionar la asistencia con el cliente, pero cobrándole
     al cliente el desplazamiento en falso.»

     Hasta hoy esto estaba mal de dos maneras a la vez, y las dos se
     comprobaron con números antes de tocar nada:

       · La aplicación DECÍA que un falso no se factura. Mentira: se facturaba
         entero. Un falso de una hora con la ruta 1 salía a 70 €, 40 de ellos de
         mano de obra de un trabajo que nadie hizo.
       · Y esa mano de obra es justo lo que no se puede defender si el cliente
         pide el desglose: lo que pasó fue un viaje, no una reparación.

     Desde hoy se cobra el DESPLAZAMIENTO y nada más. Decisión de David el
     07-11-2026, también cuando el cliente tiene contrato de mantenimiento: el
     contrato cubre las revisiones, no los viajes en balde porque no abrieron.

     El COSTE no se toca: las horas del técnico y el coste de la ruta siguen
     contando enteros. Así el margen de un viaje en balde sale negativo, que es
     la verdad, y de ahí sale la cuenta de lo que cuestan al año.

     Lo ya cerrado NO se mueve, como siempre: la regla nueva alcanza solo a lo
     que se cierre a partir de hoy. Sin esta condición, recalcular un falso del
     mes pasado le borraría la mano de obra a una factura ya emitida. */
  if (coalesce(a.falso, false) or a.tipo = 'falso')
     and (a.cerrado is null or a.cerrado >= timestamptz '2026-11-07 00:00:00+01') then
    v_mano := 0; v_mat := 0;
  end if;

  insert into public.valoraciones as v
    (aviso_id, imp_mano_obra, imp_desplazamiento, imp_materiales, imp_total, coste_total, margen, calculado)
  values (
    p_aviso, v_mano, v_desp, v_mat,
    round(v_mano + v_desp + v_mat, 2),
    round(v_horas * coalesce(a.num_tecnicos, 1) * v_costeh
          + v_cdesp + v_cmat, 2),
    round(v_mano + v_desp + v_mat, 2)
      - round(v_horas * coalesce(a.num_tecnicos, 1) * v_costeh
              + v_cdesp + v_cmat, 2),
    now())
  on conflict (aviso_id) do update set
    imp_mano_obra = excluded.imp_mano_obra,
    imp_desplazamiento = excluded.imp_desplazamiento,
    imp_materiales = excluded.imp_materiales,
    imp_total = excluded.imp_total,
    coste_total = excluded.coste_total,
    margen = excluded.margen,
    calculado = now();
end $function$
;


-- ==========================================================================
-- LAS TABLAS  ·  42
--
-- Cada una con las columnas que tiene en producción, con su tipo exacto y su
-- valor por defecto. Sin claves ni índices todavía: eso va después, para que
-- el orden de creación no importe.
-- ==========================================================================

create table if not exists public.ajustes (
  clave text not null,
  valor jsonb not null default '[]'::jsonb,
  actualizado timestamp with time zone not null default now()
);

create table if not exists public.articulos (
  id uuid not null default gen_random_uuid(),
  descripcion text not null,
  unidad text not null default 'ud'::text,
  coste numeric(10,2),
  recargo numeric(5,2),
  referencia text,
  proveedor text,
  activo boolean not null default true,
  creado timestamp with time zone not null default now(),
  codigo text,
  token text,
  familia text,
  marca text,
  minimo numeric,
  ubicacion text,
  ean text,
  notas text,
  detalle text,
  foto_ruta text,
  precio_venta numeric,
  proveedor_id uuid,
  ubicacion_id uuid
);

create table if not exists public.aviso_puertas (
  id uuid not null default gen_random_uuid(),
  aviso_id uuid not null,
  puerta_id uuid not null,
  orden integer,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text
);

create table if not exists public.aviso_tecnicos (
  id uuid not null default gen_random_uuid(),
  aviso_id uuid not null,
  tecnico_id uuid not null,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text
);

create table if not exists public.avisos (
  id uuid not null default gen_random_uuid(),
  puerta_id uuid,
  tipo text not null default 'averia'::text,
  estado text not null default 'recibido'::text,
  descripcion text default ''::text,
  origen text not null default 'tecnico'::text,
  contacto text default ''::text,
  tecnico text default ''::text,
  fecha_prevista date,
  creado timestamp with time zone not null default now(),
  actualizado timestamp with time zone not null default now(),
  cerrado timestamp with time zone,
  tecnico_id uuid,
  contacto_nombre text,
  contacto_telefono text,
  contacto_email text,
  cliente_id uuid,
  notas_oficina text,
  prioridad text default 'normal'::text,
  direccion_libre text,
  diagnostico text,
  trabajo text,
  horas numeric(5,2),
  num_tecnicos integer default 1,
  desplazamiento numeric(6,1),
  hora_inicio timestamp with time zone,
  hora_fin timestamp with time zone,
  estado_final text,
  pendiente boolean not null default false,
  pendiente_texto text,
  cobrado boolean not null default false,
  cobro_importe numeric(10,2),
  cobro_forma text,
  cobro_ref text,
  firma_ruta text,
  firma_nombre text,
  firma_sin text,
  cerrado_por text,
  enviado_cliente boolean not null default false,
  sin_cargo boolean not null default false,
  sin_cargo_motivo text,
  archivado boolean not null default false,
  archivado_en timestamp with time zone,
  archivado_por text,
  anulada boolean not null default false,
  anulada_motivo text,
  anulada_en timestamp with time zone,
  anulada_por text,
  parte_enviado_el timestamp with time zone,
  obra_larga boolean not null default false,
  presupuesto_id uuid,
  movido_el timestamp with time zone,
  estado_el timestamp with time zone,
  ruta text,
  subtipo text,
  tipos_puerta text[],
  urgencia_factor numeric,
  instalacion_id uuid,
  ps_causa text,
  ps_causa_detalle text,
  repercutible boolean not null default false,
  sin_puerta boolean not null default false,
  sin_puerta_motivo text,
  tipos_uds jsonb,
  perifericos text[],
  perifericos_otro text,
  subtipo_detalle text,
  urgencia_modo text,
  falso boolean not null default false,
  falso_motivo text,
  falso_resuelto boolean not null default false,
  falso_nueva_id uuid,
  parte_lo_lleva uuid,
  parte_lo_lleva_desde timestamp with time zone
);

create table if not exists public.centros (
  id uuid not null default gen_random_uuid(),
  cliente_id uuid not null,
  nombre text not null default ''::text,
  direccion text,
  poblacion text,
  cp text,
  provincia text,
  acceso text,
  horario text,
  contacto_nombre text,
  contacto_telefono text,
  avisos_seguridad text,
  notas text,
  activo boolean not null default true,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text,
  actualizado timestamp with time zone not null default now(),
  ruta text
);

create table if not exists public.clientes (
  id uuid not null default gen_random_uuid(),
  nombre text not null,
  nif text,
  telefono text,
  email text,
  direccion text,
  poblacion text,
  tipo text,
  contrato boolean not null default false,
  notas text,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text,
  archivado boolean not null default false,
  archivado_en timestamp with time zone,
  archivado_por text,
  plazo_pago_dias integer,
  forma_pago text,
  ruta text
);

create table if not exists public.componentes (
  id uuid not null default gen_random_uuid(),
  puerta_id uuid not null,
  clave text,
  nombre text not null default ''::text,
  marca text,
  modelo text,
  num_serie text,
  fecha_instalacion date,
  notas text,
  foto_ruta text,
  doc_ruta text,
  doc_nombre text,
  activo boolean not null default true,
  retirado_el date,
  retirado_motivo text,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text,
  actualizado timestamp with time zone not null default now()
);

create table if not exists public.config_interna (
  clave text not null,
  valor text not null
);

create table if not exists public.conformidad_visita (
  id uuid not null default gen_random_uuid(),
  aviso_id uuid not null,
  puerta_id uuid not null,
  familia text,
  puntos jsonb not null default '{}'::jsonb,
  fallos integer not null default 0,
  sin_mirar integer not null default 0,
  nota text,
  perfil_id uuid,
  quien text,
  creado timestamp with time zone not null default now()
);

create table if not exists public.conjunto_lineas (
  id uuid not null default gen_random_uuid(),
  conjunto_id uuid not null,
  orden integer not null default 0,
  tipo text not null default 'material'::text,
  articulo_id uuid,
  nombre text not null default ''::text,
  detalle text,
  cantidad numeric not null default 1,
  unidad text not null default 'ud'::text,
  creado timestamp with time zone not null default now()
);

create table if not exists public.conjuntos (
  id uuid not null default gen_random_uuid(),
  nombre text not null default ''::text,
  detalle text,
  familia text,
  notas text,
  activo boolean not null default true,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text
);

create table if not exists public.contactos (
  id uuid not null default gen_random_uuid(),
  cliente_id uuid not null,
  nombre text not null default ''::text,
  cargo text,
  email text,
  telefono text,
  principal boolean not null default false,
  notas text,
  activo boolean not null default true,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text
);

create table if not exists public.contrato_puertas (
  contrato_id uuid not null,
  puerta_id uuid not null,
  cuota_anual numeric(10,2) not null default 0,
  periodicidad_meses integer
);

create table if not exists public.contratos (
  id uuid not null default gen_random_uuid(),
  cliente_id uuid,
  referencia text,
  estado text not null default 'activo'::text,
  fecha_alta date not null default CURRENT_DATE,
  fecha_vencimiento date,
  renovacion_auto boolean not null default true,
  periodicidad_meses integer not null default 12,
  precio_anual numeric(10,2),
  forma_pago text,
  incluye text,
  excluye text,
  aviso_dias integer not null default 30,
  avisado_el date,
  notas text,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text,
  mano_obra_incluida boolean not null default true,
  desplazamiento_incluido boolean not null default true,
  descuento_material numeric(5,2) not null default 0,
  numero integer,
  duracion_meses integer,
  a_peticion boolean not null default false,
  clausulas jsonb not null default '[]'::jsonb,
  descuento_mano_obra numeric(5,2) not null default 0,
  prioridad_horas integer,
  token text default token_contrato(),
  expedido_el date,
  firmante_nombre text,
  firmante_dni text,
  firmado_el timestamp with time zone,
  firma_ruta text
);

create table if not exists public.documentos (
  id uuid not null default gen_random_uuid(),
  puerta_id uuid,
  nombre text not null default ''::text,
  tipo text default 'Manual de instrucciones'::text,
  ruta text not null,
  autor text default ''::text,
  creado timestamp with time zone not null default now(),
  publico boolean not null default false,
  bucket text not null default 'documentos'::text
);

create table if not exists public.entregas_obra (
  id uuid not null default gen_random_uuid(),
  aviso_id uuid,
  puerta_id uuid,
  cliente_id uuid,
  fecha date not null default CURRENT_DATE,
  entregado text,
  pruebas jsonb not null default '[]'::jsonb,
  conformidad text not null default 'conforme'::text,
  comentario text,
  formacion boolean not null default false,
  documentacion boolean not null default false,
  firma_ruta text,
  firma_nombre text,
  firma_nif text,
  firma_el timestamp with time zone,
  entregado_por text,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text
);

create table if not exists public.etiquetas (
  codigo text not null,
  token text not null,
  creado timestamp with time zone not null default now()
);

create table if not exists public.expediente_docs (
  id uuid not null default gen_random_uuid(),
  expediente_id uuid not null,
  elemento text,
  fabricante text,
  tipo_doc text,
  referencia text,
  fecha_doc date,
  ruta text not null,
  nombre text,
  mime text,
  orden integer not null default 0,
  creado timestamp with time zone not null default now(),
  autor text
);

create table if not exists public.expediente_fotos (
  id uuid not null default gen_random_uuid(),
  expediente_id uuid not null,
  apartado text not null,
  ruta text not null,
  pie text,
  orden integer not null default 0,
  creado timestamp with time zone not null default now(),
  autor text
);

create table if not exists public.expedientes (
  id uuid not null default gen_random_uuid(),
  referencia text,
  numero integer,
  puerta_id uuid,
  cliente_id uuid,
  aviso_id uuid,
  situacion text not null default 'nueva_fabricante'::text,
  familia text not null default 'industrial'::text,
  fecha_apertura date not null default ((now() AT TIME ZONE 'Europe/Madrid'::text))::date,
  fecha_puesta_servicio date,
  estado text not null default 'borrador'::text,
  datos jsonb not null default '{}'::jsonb,
  notas text,
  emitido_el timestamp with time zone,
  emitido_por text,
  firmante text,
  firmante_cargo text,
  archivado boolean not null default false,
  creado timestamp with time zone not null default now(),
  actualizado timestamp with time zone not null default now(),
  autor text
);

create table if not exists public.fotos (
  id uuid not null default gen_random_uuid(),
  puerta_id uuid,
  aviso_id uuid,
  ruta text not null,
  descripcion text default ''::text,
  autor text default ''::text,
  creado timestamp with time zone not null default now(),
  etapa text
);

create table if not exists public.jornadas (
  id uuid not null default gen_random_uuid(),
  aviso_id uuid not null,
  fecha date not null default CURRENT_DATE,
  hora_inicio timestamp with time zone,
  hora_fin timestamp with time zone,
  horas numeric,
  num_tecnicos integer not null default 1,
  tecnico_id uuid,
  trabajo text,
  proxima text,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text,
  km numeric
);

create table if not exists public.materiales (
  id uuid not null default gen_random_uuid(),
  aviso_id uuid,
  descripcion text not null,
  cantidad numeric(10,2) not null default 1,
  unidad text default 'ud'::text,
  creado timestamp with time zone not null default now(),
  articulo_id uuid,
  coste numeric(10,2),
  precio numeric(10,2),
  jornada_id uuid
);

create table if not exists public.materiales_previstos (
  id uuid not null default gen_random_uuid(),
  aviso_id uuid not null,
  articulo_id uuid,
  descripcion text not null default ''::text,
  cantidad numeric not null default 1,
  nota text,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text
);

create table if not exists public.medidas (
  id uuid not null default gen_random_uuid(),
  aviso_id uuid,
  orden integer not null default 0,
  ubicacion text,
  tipo_puerta text,
  ancho_mm numeric,
  alto_mm numeric,
  dintel_mm numeric,
  lateral_mm numeric,
  situacion text,
  electricidad text,
  auxiliares text,
  notas text,
  sin_medir boolean not null default false,
  sin_medir_motivo text,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text,
  fijos text,
  fijos_mm numeric
);

create table if not exists public.mensajes (
  id uuid not null default gen_random_uuid(),
  aviso_id uuid,
  puerta_id uuid,
  texto text not null,
  foto_ruta text,
  fijado boolean not null default false,
  perfil_id uuid,
  quien text,
  creado timestamp with time zone not null default now()
);

create table if not exists public.movimientos_material (
  id uuid not null default gen_random_uuid(),
  articulo_id uuid not null,
  cantidad numeric not null,
  desde uuid,
  hasta uuid,
  motivo text not null default 'ajuste'::text,
  aviso_id uuid,
  puerta_id uuid,
  nota text,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text,
  creado_por_id uuid
);

create table if not exists public.perfiles (
  id uuid not null,
  nombre text not null default ''::text,
  rol text not null default 'tecnico'::text,
  activo boolean not null default true,
  creado timestamp with time zone not null default now(),
  foto_ruta text
);

create table if not exists public.peticiones_material (
  id uuid not null default gen_random_uuid(),
  aviso_id uuid,
  descripcion text not null,
  unidad text not null default 'ud'::text,
  cantidad numeric,
  ean text,
  foto_ruta text not null,
  estado text not null default 'pendiente'::text,
  articulo_id uuid,
  nota text,
  creado timestamp with time zone not null default now(),
  creado_por uuid default auth.uid(),
  resuelto timestamp with time zone,
  resuelto_por uuid
);

create table if not exists public.presupuesto_adjuntos (
  id uuid not null default gen_random_uuid(),
  presupuesto_id uuid not null,
  nombre text not null default ''::text,
  descripcion text,
  ruta text not null,
  tipo text,
  bytes bigint,
  orden integer not null default 0,
  publico boolean not null default true,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text
);

create table if not exists public.presupuesto_envios (
  id uuid not null default gen_random_uuid(),
  presupuesto_id uuid not null,
  contacto_id uuid,
  destino text not null default ''::text,
  nombre text,
  nota text,
  cuando timestamp with time zone not null default now(),
  por text default ''::text
);

create table if not exists public.presupuesto_lineas (
  id uuid not null default gen_random_uuid(),
  presupuesto_id uuid not null,
  orden integer not null default 0,
  tipo text not null default 'material'::text,
  articulo_id uuid,
  descripcion text not null default ''::text,
  cantidad numeric not null default 1,
  unidad text not null default 'ud'::text,
  precio numeric not null default 0,
  importe numeric not null default 0,
  coste numeric not null default 0,
  creado timestamp with time zone not null default now(),
  nombre text,
  referencia text,
  detalle text,
  dto numeric not null default 0,
  variante text,
  km numeric,
  foto_ruta text
);

create table if not exists public.presupuesto_visitas (
  id uuid not null default gen_random_uuid(),
  presupuesto_id uuid not null,
  cuando timestamp with time zone not null default now()
);

create table if not exists public.presupuestos (
  id uuid not null default gen_random_uuid(),
  referencia text,
  cliente_id uuid,
  puerta_id uuid,
  aviso_id uuid,
  titulo text not null default ''::text,
  descripcion text,
  estado text not null default 'borrador'::text,
  token text,
  validez_dias integer not null default 30,
  fecha date,
  valido_hasta date,
  materiales numeric not null default 0,
  mano_obra numeric not null default 0,
  desplazamiento numeric not null default 0,
  descuento numeric not null default 0,
  base numeric not null default 0,
  tipo_iva numeric not null default 21,
  iva numeric not null default 0,
  total numeric not null default 0,
  coste numeric not null default 0,
  condiciones text,
  notas_internas text,
  enviado_el timestamp with time zone,
  aceptado_el timestamp with time zone,
  aceptado_por text,
  rechazado_el timestamp with time zone,
  rechazado_motivo text,
  convertido_aviso uuid,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text,
  actualizado timestamp with time zone not null default now(),
  anexos text,
  emitido_el timestamp with time zone,
  enviado_a text,
  firma_ruta text,
  firma_nombre text,
  firma_nif text,
  firma_el timestamp with time zone,
  firma_info text,
  contacto_id uuid,
  subtitulo text
);

create table if not exists public.proveedores (
  id uuid not null default gen_random_uuid(),
  nombre text not null default ''::text,
  nif text,
  contacto text,
  telefono text,
  email text,
  direccion text,
  web text,
  plazo_dias integer,
  condiciones text,
  notas text,
  activo boolean not null default true,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text
);

create table if not exists public.puertas (
  id uuid not null default gen_random_uuid(),
  codigo text,
  cliente text default ''::text,
  direccion text default ''::text,
  ubicacion text default ''::text,
  tipo text default ''::text,
  uso text default ''::text,
  tipo_cliente text default ''::text,
  marca text default ''::text,
  modelo text default ''::text,
  cuadro text default ''::text,
  motor text default ''::text,
  anio integer,
  instalador text default ''::text,
  ancho_mm integer,
  alto_mm integer,
  peso_kg numeric,
  seguridad text[] default '{}'::text[],
  ultima_revision date,
  proxima_revision date,
  estado text not null default 'operativa'::text,
  estado_desde timestamp with time zone not null default now(),
  notas text default ''::text,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text,
  cliente_id uuid,
  periodicidad_meses integer,
  sin_mantenimiento boolean not null default false,
  centro_id uuid,
  matricula text,
  sin_matricula text,
  modo text,
  usuarios text,
  dintel_mm numeric,
  ficha_tocada_por text,
  ficha_tocada_el timestamp with time zone,
  arrastre_kg numeric,
  vueltas_muelle numeric,
  otros_elementos text,
  anio_desconocido boolean not null default false,
  instalador_desconocido boolean not null default false
);

create table if not exists public.revisiones (
  id uuid not null default gen_random_uuid(),
  aviso_id uuid,
  puerta_id uuid,
  tipo_puerta text,
  fecha date not null default CURRENT_DATE,
  tecnico text default ''::text,
  puntos jsonb not null default '[]'::jsonb,
  resultado text default 'apta'::text,
  apta boolean,
  riesgo boolean not null default false,
  deficiencias text,
  recomendaciones text,
  creado timestamp with time zone not null default now()
);

create table if not exists public.tarifas (
  id integer not null default 1,
  precio_hora numeric(10,2) not null default 45,
  coste_hora numeric(10,2) not null default 25,
  minimo_horas numeric(5,2) not null default 1,
  recargo_urgencia numeric(5,2) not null default 50,
  desplazamiento_fijo numeric(10,2) not null default 25,
  precio_km numeric(10,2) not null default 0.45,
  coste_km numeric(10,2) not null default 0.30,
  recargo_material numeric(5,2) not null default 40,
  iva numeric(5,2) not null default 21,
  actualizado timestamp with time zone not null default now(),
  actualizado_por text default ''::text,
  precio_hora_particular numeric,
  precio_hora_retail numeric,
  precio_hora_industria numeric,
  ruta1_nombre text,
  ruta1_importe numeric,
  ruta1_coste numeric,
  ruta2_nombre text,
  ruta2_importe numeric,
  ruta2_coste numeric,
  ruta3_nombre text,
  ruta3_importe numeric,
  ruta3_coste numeric,
  ruta4_nombre text,
  ruta4_importe numeric,
  ruta4_coste numeric,
  ruta5_nombre text,
  ruta5_importe numeric,
  ruta5_coste numeric,
  urgencia_x_laboral numeric,
  urgencia_x_fuera numeric,
  urgencia_desde integer,
  urgencia_hasta integer,
  urgencia_x_uno numeric,
  urgencia_x_dos numeric
);

create table if not exists public.telegram_enviados (
  clave text not null,
  enviado timestamp with time zone not null default now()
);

create table if not exists public.textos_presu (
  id uuid not null default gen_random_uuid(),
  destino text not null default 'condiciones'::text,
  titulo text not null default ''::text,
  cuerpo text not null default ''::text,
  orden integer not null default 0,
  activo boolean not null default true,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text
);

create table if not exists public.ubicaciones (
  id uuid not null default gen_random_uuid(),
  nombre text not null,
  tipo text not null default 'nave'::text,
  perfil_id uuid,
  activo boolean not null default true,
  creado timestamp with time zone not null default now(),
  nota text,
  orden integer,
  creado_por text default ''::text
);

create table if not exists public.valoraciones (
  aviso_id uuid not null,
  imp_mano_obra numeric(10,2) not null default 0,
  imp_desplazamiento numeric(10,2) not null default 0,
  imp_materiales numeric(10,2) not null default 0,
  imp_total numeric(10,2) not null default 0,
  coste_total numeric(10,2) not null default 0,
  margen numeric(10,2) not null default 0,
  facturado boolean not null default false,
  factura_ref text,
  facturado_el date,
  calculado timestamp with time zone not null default now(),
  vence_el date,
  cobrado_el date,
  cobro_forma text,
  cobro_ref text
);


-- ==========================================================================
-- CLAVES PRIMARIAS Y UNICIDADES  ·  44
--
-- Primero estas y luego las ajenas, porque una clave ajena necesita que la
-- unicidad a la que apunta ya exista.
--
-- Van con guardia y no con un «add constraint» a secas, porque Postgres no
-- tiene «add constraint if not exists» y el fichero tiene que poder lanzarse
-- dos veces.
-- ==========================================================================

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ajustes_pkey' and conrelid = 'public.ajustes'::regclass) then
    alter table public.ajustes add constraint ajustes_pkey PRIMARY KEY (clave);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'articulos_pkey' and conrelid = 'public.articulos'::regclass) then
    alter table public.articulos add constraint articulos_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'aviso_puertas_pkey' and conrelid = 'public.aviso_puertas'::regclass) then
    alter table public.aviso_puertas add constraint aviso_puertas_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_pkey' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'centros_pkey' and conrelid = 'public.centros'::regclass) then
    alter table public.centros add constraint centros_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_pkey' and conrelid = 'public.clientes'::regclass) then
    alter table public.clientes add constraint clientes_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'componentes_pkey' and conrelid = 'public.componentes'::regclass) then
    alter table public.componentes add constraint componentes_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'config_interna_pkey' and conrelid = 'public.config_interna'::regclass) then
    alter table public.config_interna add constraint config_interna_pkey PRIMARY KEY (clave);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conformidad_visita_pkey' and conrelid = 'public.conformidad_visita'::regclass) then
    alter table public.conformidad_visita add constraint conformidad_visita_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conjunto_lineas_pkey' and conrelid = 'public.conjunto_lineas'::regclass) then
    alter table public.conjunto_lineas add constraint conjunto_lineas_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conjuntos_pkey' and conrelid = 'public.conjuntos'::regclass) then
    alter table public.conjuntos add constraint conjuntos_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contactos_pkey' and conrelid = 'public.contactos'::regclass) then
    alter table public.contactos add constraint contactos_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contrato_puertas_pkey' and conrelid = 'public.contrato_puertas'::regclass) then
    alter table public.contrato_puertas add constraint contrato_puertas_pkey PRIMARY KEY (contrato_id, puerta_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contratos_pkey' and conrelid = 'public.contratos'::regclass) then
    alter table public.contratos add constraint contratos_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'documentos_pkey' and conrelid = 'public.documentos'::regclass) then
    alter table public.documentos add constraint documentos_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entregas_obra_pkey' and conrelid = 'public.entregas_obra'::regclass) then
    alter table public.entregas_obra add constraint entregas_obra_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'etiquetas_pkey' and conrelid = 'public.etiquetas'::regclass) then
    alter table public.etiquetas add constraint etiquetas_pkey PRIMARY KEY (codigo);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expediente_docs_pkey' and conrelid = 'public.expediente_docs'::regclass) then
    alter table public.expediente_docs add constraint expediente_docs_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expediente_fotos_pkey' and conrelid = 'public.expediente_fotos'::regclass) then
    alter table public.expediente_fotos add constraint expediente_fotos_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expedientes_pkey' and conrelid = 'public.expedientes'::regclass) then
    alter table public.expedientes add constraint expedientes_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expedientes_referencia_key' and conrelid = 'public.expedientes'::regclass) then
    alter table public.expedientes add constraint expedientes_referencia_key UNIQUE (referencia);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fotos_pkey' and conrelid = 'public.fotos'::regclass) then
    alter table public.fotos add constraint fotos_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'jornadas_pkey' and conrelid = 'public.jornadas'::regclass) then
    alter table public.jornadas add constraint jornadas_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'materiales_pkey' and conrelid = 'public.materiales'::regclass) then
    alter table public.materiales add constraint materiales_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'materiales_previstos_pkey' and conrelid = 'public.materiales_previstos'::regclass) then
    alter table public.materiales_previstos add constraint materiales_previstos_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'medidas_pkey' and conrelid = 'public.medidas'::regclass) then
    alter table public.medidas add constraint medidas_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mensajes_pkey' and conrelid = 'public.mensajes'::regclass) then
    alter table public.mensajes add constraint mensajes_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_material_pkey' and conrelid = 'public.movimientos_material'::regclass) then
    alter table public.movimientos_material add constraint movimientos_material_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'perfiles_pkey' and conrelid = 'public.perfiles'::regclass) then
    alter table public.perfiles add constraint perfiles_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'peticiones_material_pkey' and conrelid = 'public.peticiones_material'::regclass) then
    alter table public.peticiones_material add constraint peticiones_material_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presupuesto_adjuntos_pkey' and conrelid = 'public.presupuesto_adjuntos'::regclass) then
    alter table public.presupuesto_adjuntos add constraint presupuesto_adjuntos_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presupuesto_envios_pkey' and conrelid = 'public.presupuesto_envios'::regclass) then
    alter table public.presupuesto_envios add constraint presupuesto_envios_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presupuesto_lineas_pkey' and conrelid = 'public.presupuesto_lineas'::regclass) then
    alter table public.presupuesto_lineas add constraint presupuesto_lineas_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presupuesto_visitas_pkey' and conrelid = 'public.presupuesto_visitas'::regclass) then
    alter table public.presupuesto_visitas add constraint presupuesto_visitas_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presupuestos_pkey' and conrelid = 'public.presupuestos'::regclass) then
    alter table public.presupuestos add constraint presupuestos_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'proveedores_pkey' and conrelid = 'public.proveedores'::regclass) then
    alter table public.proveedores add constraint proveedores_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'puertas_codigo_key' and conrelid = 'public.puertas'::regclass) then
    alter table public.puertas add constraint puertas_codigo_key UNIQUE (codigo);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'puertas_pkey' and conrelid = 'public.puertas'::regclass) then
    alter table public.puertas add constraint puertas_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'revisiones_pkey' and conrelid = 'public.revisiones'::regclass) then
    alter table public.revisiones add constraint revisiones_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tarifas_pkey' and conrelid = 'public.tarifas'::regclass) then
    alter table public.tarifas add constraint tarifas_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'telegram_enviados_pkey' and conrelid = 'public.telegram_enviados'::regclass) then
    alter table public.telegram_enviados add constraint telegram_enviados_pkey PRIMARY KEY (clave);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'textos_presu_pkey' and conrelid = 'public.textos_presu'::regclass) then
    alter table public.textos_presu add constraint textos_presu_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ubicaciones_pkey' and conrelid = 'public.ubicaciones'::regclass) then
    alter table public.ubicaciones add constraint ubicaciones_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'valoraciones_pkey' and conrelid = 'public.valoraciones'::regclass) then
    alter table public.valoraciones add constraint valoraciones_pkey PRIMARY KEY (aviso_id);
  end if;
end $$;


-- ==========================================================================
-- CLAVES AJENAS Y COMPROBACIONES  ·  113
--
-- Las ajenas son las que impiden que una asistencia apunte a un cliente que no
-- existe. Las comprobaciones son las reglas que la base hace cumplir por su
-- cuenta, pase lo que pase en la aplicación.
-- ==========================================================================

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'articulos_proveedor_id_fkey' and conrelid = 'public.articulos'::regclass) then
    alter table public.articulos add constraint articulos_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'articulos_ubicacion_id_fkey' and conrelid = 'public.articulos'::regclass) then
    alter table public.articulos add constraint articulos_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'aviso_puertas_aviso_id_fkey' and conrelid = 'public.aviso_puertas'::regclass) then
    alter table public.aviso_puertas add constraint aviso_puertas_aviso_id_fkey FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'aviso_puertas_puerta_id_fkey' and conrelid = 'public.aviso_puertas'::regclass) then
    alter table public.aviso_puertas add constraint aviso_puertas_puerta_id_fkey FOREIGN KEY (puerta_id) REFERENCES puertas(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_cliente_id_fkey' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_estado_chk' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_estado_chk CHECK ((estado = ANY (ARRAY['recibido'::text, 'asignado'::text, 'en_curso'::text, 'repuesto'::text, 'cerrado'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_falso_explicado' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_falso_explicado CHECK (((falso IS NOT TRUE) OR (COALESCE(btrim(falso_motivo), ''::text) <> ''::text)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_falso_nueva_distinta' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_falso_nueva_distinta CHECK (((falso_nueva_id IS NULL) OR (falso_nueva_id <> id)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_falso_nueva_id_fkey' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_falso_nueva_id_fkey FOREIGN KEY (falso_nueva_id) REFERENCES avisos(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_instalacion_id_fkey' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_instalacion_id_fkey FOREIGN KEY (instalacion_id) REFERENCES avisos(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_otros_explicado' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_otros_explicado CHECK (((subtipo IS DISTINCT FROM 'otros'::text) OR (COALESCE(btrim(subtipo_detalle), ''::text) <> ''::text)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_perif_otro_explicado' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_perif_otro_explicado CHECK (((perifericos IS NULL) OR (NOT ('otro'::text = ANY (perifericos))) OR (COALESCE(btrim(perifericos_otro), ''::text) <> ''::text)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_perifericos_validos' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_perifericos_validos CHECK (((perifericos IS NULL) OR (((COALESCE(array_length(perifericos, 1), 0) >= 1) AND (COALESCE(array_length(perifericos, 1), 0) <= 16)) AND (perifericos <@ ARRAY['foto_sinc'::text, 'foto_comp'::text, 'barrera'::text, 'radar'::text, 'banda'::text, 'banda_cuadro'::text, 'limitador'::text, 'bucle'::text, 'lector'::text, 'mandos'::text, 'columna'::text, 'semaforo'::text, 'destellante'::text, 'senal'::text, 'paro'::text, 'otro'::text]))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_presupuesto_fk' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_presupuesto_fk FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_ps_causa_valida' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_ps_causa_valida CHECK (((ps_causa IS NULL) OR (ps_causa = ANY (ARRAY['sin_corriente'::text, 'albanileria'::text, 'remates'::text, 'material_cli'::text, 'nuestra'::text, 'otra'::text]))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_puerta_id_fkey' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_puerta_id_fkey FOREIGN KEY (puerta_id) REFERENCES puertas(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_subtipo_valido' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_subtipo_valido CHECK (((subtipo IS NULL) OR (subtipo = ANY (ARRAY['averia'::text, 'garantia'::text, 'puerta_automatica'::text, 'puerta_manual'::text, 'puerta_peatonal'::text, 'automatismo'::text, 'normativa'::text, 'perifericos'::text, 'sust_motor'::text, 'sust_central'::text, 'otros'::text]))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_tecnico_id_fkey' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_tecnico_id_fkey FOREIGN KEY (tecnico_id) REFERENCES perfiles(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_tipo_chk' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_tipo_chk CHECK ((tipo = ANY (ARRAY['averia'::text, 'mantenimiento'::text, 'comercial'::text, 'instalacion'::text, 'puesta_servicio'::text, 'normativa'::text, 'garantia'::text, 'falso'::text, 'urgencia'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_tipos_uds_forma' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_tipos_uds_forma CHECK (tipos_uds_valido(tipos_uds));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_urgencia_factor_valido' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_urgencia_factor_valido CHECK (((urgencia_factor IS NULL) OR ((urgencia_factor >= (1)::numeric) AND (urgencia_factor <= (10)::numeric))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_urgencia_modo_solo_urgencia' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_urgencia_modo_solo_urgencia CHECK (((urgencia_modo IS NULL) OR (tipo = 'urgencia'::text)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_urgencia_modo_valido' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_urgencia_modo_valido CHECK (((urgencia_modo IS NULL) OR (urgencia_modo = ANY (ARRAY['fuera'::text, 'urgente'::text, 'ambas'::text]))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'centros_cliente_id_fkey' and conrelid = 'public.centros'::regclass) then
    alter table public.centros add constraint centros_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'centros_ruta_valida' and conrelid = 'public.centros'::regclass) then
    alter table public.centros add constraint centros_ruta_valida CHECK (((ruta IS NULL) OR (ruta = ANY (ARRAY['ruta1'::text, 'ruta2'::text, 'ruta3'::text, 'ruta4'::text, 'ruta5'::text, 'km'::text]))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_ruta_valida' and conrelid = 'public.clientes'::regclass) then
    alter table public.clientes add constraint clientes_ruta_valida CHECK (((ruta IS NULL) OR (ruta = ANY (ARRAY['ruta1'::text, 'ruta2'::text, 'ruta3'::text, 'ruta4'::text, 'ruta5'::text, 'km'::text]))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'componentes_puerta_id_fkey' and conrelid = 'public.componentes'::regclass) then
    alter table public.componentes add constraint componentes_puerta_id_fkey FOREIGN KEY (puerta_id) REFERENCES puertas(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conformidad_visita_aviso_id_fkey' and conrelid = 'public.conformidad_visita'::regclass) then
    alter table public.conformidad_visita add constraint conformidad_visita_aviso_id_fkey FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conformidad_visita_perfil_id_fkey' and conrelid = 'public.conformidad_visita'::regclass) then
    alter table public.conformidad_visita add constraint conformidad_visita_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES perfiles(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conformidad_visita_puerta_id_fkey' and conrelid = 'public.conformidad_visita'::regclass) then
    alter table public.conformidad_visita add constraint conformidad_visita_puerta_id_fkey FOREIGN KEY (puerta_id) REFERENCES puertas(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conjunto_lineas_articulo_id_fkey' and conrelid = 'public.conjunto_lineas'::regclass) then
    alter table public.conjunto_lineas add constraint conjunto_lineas_articulo_id_fkey FOREIGN KEY (articulo_id) REFERENCES articulos(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conjunto_lineas_conjunto_id_fkey' and conrelid = 'public.conjunto_lineas'::regclass) then
    alter table public.conjunto_lineas add constraint conjunto_lineas_conjunto_id_fkey FOREIGN KEY (conjunto_id) REFERENCES conjuntos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contactos_cliente_id_fkey' and conrelid = 'public.contactos'::regclass) then
    alter table public.contactos add constraint contactos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contrato_puertas_contrato_id_fkey' and conrelid = 'public.contrato_puertas'::regclass) then
    alter table public.contrato_puertas add constraint contrato_puertas_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contrato_puertas_puerta_id_fkey' and conrelid = 'public.contrato_puertas'::regclass) then
    alter table public.contrato_puertas add constraint contrato_puertas_puerta_id_fkey FOREIGN KEY (puerta_id) REFERENCES puertas(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contratos_cliente_id_fkey' and conrelid = 'public.contratos'::regclass) then
    alter table public.contratos add constraint contratos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contratos_estado_chk' and conrelid = 'public.contratos'::regclass) then
    alter table public.contratos add constraint contratos_estado_chk CHECK ((estado = ANY (ARRAY['activo'::text, 'suspendido'::text, 'baja'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'documentos_puerta_id_fkey' and conrelid = 'public.documentos'::regclass) then
    alter table public.documentos add constraint documentos_puerta_id_fkey FOREIGN KEY (puerta_id) REFERENCES puertas(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entregas_obra_aviso_id_fkey' and conrelid = 'public.entregas_obra'::regclass) then
    alter table public.entregas_obra add constraint entregas_obra_aviso_id_fkey FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entregas_obra_cliente_id_fkey' and conrelid = 'public.entregas_obra'::regclass) then
    alter table public.entregas_obra add constraint entregas_obra_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entregas_obra_puerta_id_fkey' and conrelid = 'public.entregas_obra'::regclass) then
    alter table public.entregas_obra add constraint entregas_obra_puerta_id_fkey FOREIGN KEY (puerta_id) REFERENCES puertas(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expediente_docs_expediente_id_fkey' and conrelid = 'public.expediente_docs'::regclass) then
    alter table public.expediente_docs add constraint expediente_docs_expediente_id_fkey FOREIGN KEY (expediente_id) REFERENCES expedientes(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expediente_fotos_expediente_id_fkey' and conrelid = 'public.expediente_fotos'::regclass) then
    alter table public.expediente_fotos add constraint expediente_fotos_expediente_id_fkey FOREIGN KEY (expediente_id) REFERENCES expedientes(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expedientes_aviso_id_fkey' and conrelid = 'public.expedientes'::regclass) then
    alter table public.expedientes add constraint expedientes_aviso_id_fkey FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expedientes_cliente_id_fkey' and conrelid = 'public.expedientes'::regclass) then
    alter table public.expedientes add constraint expedientes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expedientes_estado_chk' and conrelid = 'public.expedientes'::regclass) then
    alter table public.expedientes add constraint expedientes_estado_chk CHECK ((estado = ANY (ARRAY['borrador'::text, 'completo'::text, 'emitido'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expedientes_familia_chk' and conrelid = 'public.expedientes'::regclass) then
    alter table public.expedientes add constraint expedientes_familia_chk CHECK ((familia = ANY (ARRAY['industrial'::text, 'peatonal'::text, 'barrera'::text, 'cortafuegos'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expedientes_puerta_id_fkey' and conrelid = 'public.expedientes'::regclass) then
    alter table public.expedientes add constraint expedientes_puerta_id_fkey FOREIGN KEY (puerta_id) REFERENCES puertas(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expedientes_situacion_chk' and conrelid = 'public.expedientes'::regclass) then
    alter table public.expedientes add constraint expedientes_situacion_chk CHECK ((situacion = ANY (ARRAY['nueva_fabricante'::text, 'nueva_instalador'::text, 'adecuacion'::text, 'modificacion'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fotos_aviso_id_fkey' and conrelid = 'public.fotos'::regclass) then
    alter table public.fotos add constraint fotos_aviso_id_fkey FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fotos_de_alguien' and conrelid = 'public.fotos'::regclass) then
    alter table public.fotos add constraint fotos_de_alguien CHECK (((puerta_id IS NOT NULL) OR (aviso_id IS NOT NULL)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fotos_etapa_valida' and conrelid = 'public.fotos'::regclass) then
    alter table public.fotos add constraint fotos_etapa_valida CHECK (((etapa IS NULL) OR (etapa = ANY (ARRAY['encontrado'::text, 'hecho'::text, 'sustituido'::text, 'otra'::text]))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fotos_puerta_id_fkey' and conrelid = 'public.fotos'::regclass) then
    alter table public.fotos add constraint fotos_puerta_id_fkey FOREIGN KEY (puerta_id) REFERENCES puertas(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'jornadas_aviso_id_fkey' and conrelid = 'public.jornadas'::regclass) then
    alter table public.jornadas add constraint jornadas_aviso_id_fkey FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'materiales_articulo_id_fkey' and conrelid = 'public.materiales'::regclass) then
    alter table public.materiales add constraint materiales_articulo_id_fkey FOREIGN KEY (articulo_id) REFERENCES articulos(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'materiales_aviso_id_fkey' and conrelid = 'public.materiales'::regclass) then
    alter table public.materiales add constraint materiales_aviso_id_fkey FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'materiales_jornada_id_fkey' and conrelid = 'public.materiales'::regclass) then
    alter table public.materiales add constraint materiales_jornada_id_fkey FOREIGN KEY (jornada_id) REFERENCES jornadas(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'materiales_previstos_articulo_id_fkey' and conrelid = 'public.materiales_previstos'::regclass) then
    alter table public.materiales_previstos add constraint materiales_previstos_articulo_id_fkey FOREIGN KEY (articulo_id) REFERENCES articulos(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'materiales_previstos_aviso_id_fkey' and conrelid = 'public.materiales_previstos'::regclass) then
    alter table public.materiales_previstos add constraint materiales_previstos_aviso_id_fkey FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'medidas_aviso_id_fkey' and conrelid = 'public.medidas'::regclass) then
    alter table public.medidas add constraint medidas_aviso_id_fkey FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'medidas_fijos_valido' and conrelid = 'public.medidas'::regclass) then
    alter table public.medidas add constraint medidas_fijos_valido CHECK ((((fijos IS NULL) OR (fijos = ANY (ARRAY['ninguno'::text, 'ciego'::text, 'practicable'::text, 'superior'::text, 'varios'::text]))) AND ((fijos_mm IS NULL) OR ((fijos_mm > (0)::numeric) AND (fijos_mm < (30000)::numeric)))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'medidas_rango' and conrelid = 'public.medidas'::regclass) then
    alter table public.medidas add constraint medidas_rango CHECK ((((ancho_mm IS NULL) OR ((ancho_mm > (100)::numeric) AND (ancho_mm < (30000)::numeric))) AND ((alto_mm IS NULL) OR ((alto_mm > (100)::numeric) AND (alto_mm < (30000)::numeric))) AND ((dintel_mm IS NULL) OR ((dintel_mm >= (0)::numeric) AND (dintel_mm < (30000)::numeric))) AND ((lateral_mm IS NULL) OR ((lateral_mm >= (0)::numeric) AND (lateral_mm < (30000)::numeric)))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mensajes_aviso_id_fkey' and conrelid = 'public.mensajes'::regclass) then
    alter table public.mensajes add constraint mensajes_aviso_id_fkey FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mensajes_de_algo' and conrelid = 'public.mensajes'::regclass) then
    alter table public.mensajes add constraint mensajes_de_algo CHECK (((aviso_id IS NOT NULL) OR (puerta_id IS NOT NULL)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mensajes_perfil_id_fkey' and conrelid = 'public.mensajes'::regclass) then
    alter table public.mensajes add constraint mensajes_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES perfiles(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mensajes_puerta_id_fkey' and conrelid = 'public.mensajes'::regclass) then
    alter table public.mensajes add constraint mensajes_puerta_id_fkey FOREIGN KEY (puerta_id) REFERENCES puertas(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mensajes_texto' and conrelid = 'public.mensajes'::regclass) then
    alter table public.mensajes add constraint mensajes_texto CHECK (((char_length(btrim(texto)) >= 1) AND (char_length(btrim(texto)) <= 2000)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_baja_con_almacen' and conrelid = 'public.movimientos_material'::regclass) then
    alter table public.movimientos_material add constraint movimientos_baja_con_almacen CHECK (((motivo <> ALL (ARRAY['baja_roto'::text, 'baja_perdido'::text, 'baja_otro'::text])) OR (desde IS NOT NULL)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_baja_con_motivo' and conrelid = 'public.movimientos_material'::regclass) then
    alter table public.movimientos_material add constraint movimientos_baja_con_motivo CHECK (((motivo <> ALL (ARRAY['baja_roto'::text, 'baja_perdido'::text, 'baja_otro'::text])) OR (length(btrim(COALESCE(nota, ''::text))) >= 3)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_material_articulo_id_fkey' and conrelid = 'public.movimientos_material'::regclass) then
    alter table public.movimientos_material add constraint movimientos_material_articulo_id_fkey FOREIGN KEY (articulo_id) REFERENCES articulos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_material_aviso_id_fkey' and conrelid = 'public.movimientos_material'::regclass) then
    alter table public.movimientos_material add constraint movimientos_material_aviso_id_fkey FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_material_cantidad_check' and conrelid = 'public.movimientos_material'::regclass) then
    alter table public.movimientos_material add constraint movimientos_material_cantidad_check CHECK ((cantidad > (0)::numeric));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_material_creado_por_id_fkey' and conrelid = 'public.movimientos_material'::regclass) then
    alter table public.movimientos_material add constraint movimientos_material_creado_por_id_fkey FOREIGN KEY (creado_por_id) REFERENCES perfiles(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_material_desde_fkey' and conrelid = 'public.movimientos_material'::regclass) then
    alter table public.movimientos_material add constraint movimientos_material_desde_fkey FOREIGN KEY (desde) REFERENCES ubicaciones(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_material_hasta_fkey' and conrelid = 'public.movimientos_material'::regclass) then
    alter table public.movimientos_material add constraint movimientos_material_hasta_fkey FOREIGN KEY (hasta) REFERENCES ubicaciones(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_material_mueve' and conrelid = 'public.movimientos_material'::regclass) then
    alter table public.movimientos_material add constraint movimientos_material_mueve CHECK (((desde IS NOT NULL) OR (hasta IS NOT NULL)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_material_puerta_id_fkey' and conrelid = 'public.movimientos_material'::regclass) then
    alter table public.movimientos_material add constraint movimientos_material_puerta_id_fkey FOREIGN KEY (puerta_id) REFERENCES puertas(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_motivo_valido' and conrelid = 'public.movimientos_material'::regclass) then
    alter table public.movimientos_material add constraint movimientos_motivo_valido CHECK ((motivo = ANY (ARRAY['compra'::text, 'obra'::text, 'averia'::text, 'traspaso'::text, 'devolucion'::text, 'ajuste'::text, 'baja_roto'::text, 'baja_perdido'::text, 'baja_otro'::text, 'baja'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'perfiles_id_fkey' and conrelid = 'public.perfiles'::regclass) then
    alter table public.perfiles add constraint perfiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'perfiles_nombre_con_cuerpo' and conrelid = 'public.perfiles'::regclass) then
    alter table public.perfiles add constraint perfiles_nombre_con_cuerpo CHECK (((nombre IS NULL) OR (length(btrim(nombre)) >= 2)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'perfiles_rol_chk' and conrelid = 'public.perfiles'::regclass) then
    alter table public.perfiles add constraint perfiles_rol_chk CHECK ((rol = ANY (ARRAY['admin'::text, 'oficina'::text, 'tecnico'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'peticiones_con_foto' and conrelid = 'public.peticiones_material'::regclass) then
    alter table public.peticiones_material add constraint peticiones_con_foto CHECK ((length(btrim(foto_ruta)) > 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'peticiones_descripcion_con_cuerpo' and conrelid = 'public.peticiones_material'::regclass) then
    alter table public.peticiones_material add constraint peticiones_descripcion_con_cuerpo CHECK ((length(btrim(descripcion)) >= 3));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'peticiones_estado_valido' and conrelid = 'public.peticiones_material'::regclass) then
    alter table public.peticiones_material add constraint peticiones_estado_valido CHECK ((estado = ANY (ARRAY['pendiente'::text, 'resuelta'::text, 'descartada'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'peticiones_material_articulo_id_fkey' and conrelid = 'public.peticiones_material'::regclass) then
    alter table public.peticiones_material add constraint peticiones_material_articulo_id_fkey FOREIGN KEY (articulo_id) REFERENCES articulos(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'peticiones_material_aviso_id_fkey' and conrelid = 'public.peticiones_material'::regclass) then
    alter table public.peticiones_material add constraint peticiones_material_aviso_id_fkey FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'peticiones_material_creado_por_fkey' and conrelid = 'public.peticiones_material'::regclass) then
    alter table public.peticiones_material add constraint peticiones_material_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES auth.users(id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'peticiones_material_resuelto_por_fkey' and conrelid = 'public.peticiones_material'::regclass) then
    alter table public.peticiones_material add constraint peticiones_material_resuelto_por_fkey FOREIGN KEY (resuelto_por) REFERENCES auth.users(id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'peticiones_resuelta_con_articulo' and conrelid = 'public.peticiones_material'::regclass) then
    alter table public.peticiones_material add constraint peticiones_resuelta_con_articulo CHECK (((estado <> 'resuelta'::text) OR (articulo_id IS NOT NULL)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'peticiones_resuelta_con_fecha' and conrelid = 'public.peticiones_material'::regclass) then
    alter table public.peticiones_material add constraint peticiones_resuelta_con_fecha CHECK (((estado = 'pendiente'::text) = (resuelto IS NULL)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presupuesto_adjuntos_presupuesto_id_fkey' and conrelid = 'public.presupuesto_adjuntos'::regclass) then
    alter table public.presupuesto_adjuntos add constraint presupuesto_adjuntos_presupuesto_id_fkey FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presupuesto_envios_contacto_id_fkey' and conrelid = 'public.presupuesto_envios'::regclass) then
    alter table public.presupuesto_envios add constraint presupuesto_envios_contacto_id_fkey FOREIGN KEY (contacto_id) REFERENCES contactos(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presupuesto_envios_presupuesto_id_fkey' and conrelid = 'public.presupuesto_envios'::regclass) then
    alter table public.presupuesto_envios add constraint presupuesto_envios_presupuesto_id_fkey FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presupuesto_lineas_articulo_id_fkey' and conrelid = 'public.presupuesto_lineas'::regclass) then
    alter table public.presupuesto_lineas add constraint presupuesto_lineas_articulo_id_fkey FOREIGN KEY (articulo_id) REFERENCES articulos(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presupuesto_lineas_presupuesto_id_fkey' and conrelid = 'public.presupuesto_lineas'::regclass) then
    alter table public.presupuesto_lineas add constraint presupuesto_lineas_presupuesto_id_fkey FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presupuesto_visitas_presupuesto_id_fkey' and conrelid = 'public.presupuesto_visitas'::regclass) then
    alter table public.presupuesto_visitas add constraint presupuesto_visitas_presupuesto_id_fkey FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presupuestos_aviso_id_fkey' and conrelid = 'public.presupuestos'::regclass) then
    alter table public.presupuestos add constraint presupuestos_aviso_id_fkey FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presupuestos_cliente_id_fkey' and conrelid = 'public.presupuestos'::regclass) then
    alter table public.presupuestos add constraint presupuestos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presupuestos_contacto_id_fkey' and conrelid = 'public.presupuestos'::regclass) then
    alter table public.presupuestos add constraint presupuestos_contacto_id_fkey FOREIGN KEY (contacto_id) REFERENCES contactos(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presupuestos_convertido_aviso_fkey' and conrelid = 'public.presupuestos'::regclass) then
    alter table public.presupuestos add constraint presupuestos_convertido_aviso_fkey FOREIGN KEY (convertido_aviso) REFERENCES avisos(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presupuestos_puerta_id_fkey' and conrelid = 'public.presupuestos'::regclass) then
    alter table public.presupuestos add constraint presupuestos_puerta_id_fkey FOREIGN KEY (puerta_id) REFERENCES puertas(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'puertas_centro_id_fkey' and conrelid = 'public.puertas'::regclass) then
    alter table public.puertas add constraint puertas_centro_id_fkey FOREIGN KEY (centro_id) REFERENCES centros(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'puertas_cliente_id_fkey' and conrelid = 'public.puertas'::regclass) then
    alter table public.puertas add constraint puertas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'puertas_codigo_fkey' and conrelid = 'public.puertas'::regclass) then
    alter table public.puertas add constraint puertas_codigo_fkey FOREIGN KEY (codigo) REFERENCES etiquetas(codigo);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'puertas_desconocido_coherente' and conrelid = 'public.puertas'::regclass) then
    alter table public.puertas add constraint puertas_desconocido_coherente CHECK ((((anio_desconocido IS NOT TRUE) OR (anio IS NULL)) AND ((instalador_desconocido IS NOT TRUE) OR (COALESCE(btrim(instalador), ''::text) = ''::text))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'revisiones_aviso_id_fkey' and conrelid = 'public.revisiones'::regclass) then
    alter table public.revisiones add constraint revisiones_aviso_id_fkey FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'revisiones_puerta_id_fkey' and conrelid = 'public.revisiones'::regclass) then
    alter table public.revisiones add constraint revisiones_puerta_id_fkey FOREIGN KEY (puerta_id) REFERENCES puertas(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tarifas_una_fila' and conrelid = 'public.tarifas'::regclass) then
    alter table public.tarifas add constraint tarifas_una_fila CHECK ((id = 1));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tarifas_urgencia_x_validos' and conrelid = 'public.tarifas'::regclass) then
    alter table public.tarifas add constraint tarifas_urgencia_x_validos CHECK ((((urgencia_x_uno IS NULL) OR ((urgencia_x_uno >= (1)::numeric) AND (urgencia_x_uno <= (10)::numeric))) AND ((urgencia_x_dos IS NULL) OR ((urgencia_x_dos >= (1)::numeric) AND (urgencia_x_dos <= (10)::numeric)))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ubicaciones_nombre_con_cuerpo' and conrelid = 'public.ubicaciones'::regclass) then
    alter table public.ubicaciones add constraint ubicaciones_nombre_con_cuerpo CHECK ((length(btrim(nombre)) >= 2));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ubicaciones_perfil_id_fkey' and conrelid = 'public.ubicaciones'::regclass) then
    alter table public.ubicaciones add constraint ubicaciones_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES perfiles(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ubicaciones_tipo_valido' and conrelid = 'public.ubicaciones'::regclass) then
    alter table public.ubicaciones add constraint ubicaciones_tipo_valido CHECK ((tipo = ANY (ARRAY['nave'::text, 'furgoneta'::text, 'otro'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'valoraciones_aviso_id_fkey' and conrelid = 'public.valoraciones'::regclass) then
    alter table public.valoraciones add constraint valoraciones_aviso_id_fkey FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE CASCADE;
  end if;
end $$;


-- ==========================================================================
-- LOS ÍNDICES  ·  71
--
-- Los que hacen que buscar sea rápido cuando haya miles de filas. No cambian
-- lo que la aplicación hace: cambian lo que tarda.
-- ==========================================================================

create index if not exists articulos_familia_idx ON public.articulos USING btree (familia);

create index if not exists articulos_ubicacion_idx ON public.articulos USING btree (ubicacion_id);

create unique index if not exists articulos_codigo_idx ON public.articulos USING btree (codigo) WHERE (codigo IS NOT NULL);

create unique index if not exists articulos_desc_idx ON public.articulos USING btree (lower(descripcion));

create unique index if not exists articulos_ean_unico ON public.articulos USING btree (ean) WHERE ((ean IS NOT NULL) AND (btrim(ean) <> ''::text));

create index if not exists aviso_puertas_aviso_idx ON public.aviso_puertas USING btree (aviso_id, orden);

create index if not exists aviso_puertas_puerta_idx ON public.aviso_puertas USING btree (puerta_id);

create unique index if not exists aviso_puertas_par_idx ON public.aviso_puertas USING btree (aviso_id, puerta_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'aviso_tecnicos_pkey' and conrelid = 'public.aviso_tecnicos'::regclass) then
    alter table public.aviso_tecnicos add constraint aviso_tecnicos_pkey PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'aviso_tecnicos_aviso_fk' and conrelid = 'public.aviso_tecnicos'::regclass) then
    alter table public.aviso_tecnicos add constraint aviso_tecnicos_aviso_fk FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'aviso_tecnicos_perfil_fk' and conrelid = 'public.aviso_tecnicos'::regclass) then
    alter table public.aviso_tecnicos add constraint aviso_tecnicos_perfil_fk FOREIGN KEY (tecnico_id) REFERENCES perfiles(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_parte_lo_lleva_fk' and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos add constraint avisos_parte_lo_lleva_fk FOREIGN KEY (parte_lo_lleva) REFERENCES perfiles(id) ON DELETE SET NULL;
  end if;
end $$;

create unique index if not exists aviso_tecnicos_unico ON public.aviso_tecnicos USING btree (aviso_id, tecnico_id);
create index if not exists aviso_tecnicos_por_tecnico ON public.aviso_tecnicos USING btree (tecnico_id);

create index if not exists avisos_archivado_idx ON public.avisos USING btree (archivado);

create index if not exists avisos_cerrado_idx ON public.avisos USING btree (cerrado DESC);

create index if not exists avisos_cliente_idx ON public.avisos USING btree (cliente_id, creado DESC);

create index if not exists avisos_estado_el_idx ON public.avisos USING btree (estado_el) WHERE (cerrado IS NULL);

create index if not exists avisos_instalacion_idx ON public.avisos USING btree (instalacion_id);

create index if not exists avisos_movido_idx ON public.avisos USING btree (movido_el) WHERE (cerrado IS NULL);

create index if not exists avisos_presupuesto_idx ON public.avisos USING btree (presupuesto_id);

create index if not exists avisos_ruta_idx ON public.avisos USING btree (ruta);

create index if not exists avisos_tecnico_idx ON public.avisos USING btree (tecnico_id, creado DESC);

create index if not exists centros_cliente ON public.centros USING btree (cliente_id);

create index if not exists clientes_archivado_idx ON public.clientes USING btree (archivado);

create index if not exists clientes_nombre_idx ON public.clientes USING btree (lower(nombre));

create index if not exists componentes_puerta ON public.componentes USING btree (puerta_id);

create index if not exists conformidad_visita_aviso_idx ON public.conformidad_visita USING btree (aviso_id);

create index if not exists conformidad_visita_puerta_idx ON public.conformidad_visita USING btree (puerta_id, creado DESC);

create unique index if not exists conformidad_visita_unica ON public.conformidad_visita USING btree (aviso_id, puerta_id);

create index if not exists conjunto_lineas_idx ON public.conjunto_lineas USING btree (conjunto_id, orden);

create index if not exists conjuntos_idx ON public.conjuntos USING btree (activo, nombre);

create index if not exists contactos_cliente_idx ON public.contactos USING btree (cliente_id, activo);

create index if not exists contrato_puertas_puerta_idx ON public.contrato_puertas USING btree (puerta_id);

create index if not exists contratos_cliente_idx ON public.contratos USING btree (cliente_id);

create index if not exists contratos_venc_idx ON public.contratos USING btree (fecha_vencimiento) WHERE (estado = 'activo'::text);

create unique index if not exists contratos_token_idx ON public.contratos USING btree (token);

create index if not exists entregas_obra_idx ON public.entregas_obra USING btree (aviso_id, fecha DESC);

create index if not exists entregas_obra_puerta_idx ON public.entregas_obra USING btree (puerta_id, fecha DESC);

create index if not exists expediente_docs_exp_idx ON public.expediente_docs USING btree (expediente_id, orden);

create index if not exists expediente_fotos_exp_idx ON public.expediente_fotos USING btree (expediente_id, apartado, orden);

create index if not exists expedientes_archivado_idx ON public.expedientes USING btree (archivado);

create index if not exists expedientes_cliente_idx ON public.expedientes USING btree (cliente_id);

create index if not exists expedientes_puerta_idx ON public.expedientes USING btree (puerta_id);

create index if not exists fotos_aviso_idx ON public.fotos USING btree (aviso_id, creado);

create index if not exists jornadas_aviso_idx ON public.jornadas USING btree (aviso_id, fecha);

create index if not exists materiales_aviso_idx ON public.materiales USING btree (aviso_id);

create index if not exists materiales_desc_idx ON public.materiales USING btree (lower(descripcion));

create index if not exists materiales_previstos_aviso_idx ON public.materiales_previstos USING btree (aviso_id);

create index if not exists medidas_aviso_idx ON public.medidas USING btree (aviso_id, orden);

create index if not exists mensajes_aviso ON public.mensajes USING btree (aviso_id, creado);

create index if not exists mensajes_fijados ON public.mensajes USING btree (puerta_id, creado) WHERE fijado;

create index if not exists mensajes_puerta ON public.mensajes USING btree (puerta_id, creado);

create index if not exists movimientos_material_art_idx ON public.movimientos_material USING btree (articulo_id, creado DESC);

create index if not exists movimientos_material_aviso_idx ON public.movimientos_material USING btree (aviso_id);

create index if not exists movimientos_material_fecha_idx ON public.movimientos_material USING btree (creado DESC);

create index if not exists movimientos_material_por_quien ON public.movimientos_material USING btree (creado_por_id, creado DESC);

create index if not exists peticiones_material_pendientes ON public.peticiones_material USING btree (estado, creado DESC);

create index if not exists peticiones_material_por_aviso ON public.peticiones_material USING btree (aviso_id);

create index if not exists presupuesto_adjuntos_idx ON public.presupuesto_adjuntos USING btree (presupuesto_id, orden);

create index if not exists presupuesto_envios_idx ON public.presupuesto_envios USING btree (presupuesto_id, cuando DESC);

create index if not exists presupuesto_lineas_idx ON public.presupuesto_lineas USING btree (presupuesto_id, orden);

create index if not exists presupuesto_visitas_idx ON public.presupuesto_visitas USING btree (presupuesto_id, cuando DESC);

create index if not exists presupuestos_cliente_idx ON public.presupuestos USING btree (cliente_id);

create index if not exists presupuestos_estado_idx ON public.presupuestos USING btree (estado, creado DESC);

create unique index if not exists presupuestos_referencia_idx ON public.presupuestos USING btree (referencia) WHERE (referencia IS NOT NULL);

create unique index if not exists presupuestos_token_idx ON public.presupuestos USING btree (token) WHERE (token IS NOT NULL);

create unique index if not exists proveedores_nombre_idx ON public.proveedores USING btree (lower(btrim(nombre))) WHERE (nombre <> ''::text);

create index if not exists puertas_centro ON public.puertas USING btree (centro_id);

create index if not exists puertas_matricula_idx ON public.puertas USING btree (matricula) WHERE (matricula IS NOT NULL);

create index if not exists revisiones_aviso_idx ON public.revisiones USING btree (aviso_id);

create index if not exists revisiones_puerta_idx ON public.revisiones USING btree (puerta_id, fecha DESC);

create index if not exists textos_presu_idx ON public.textos_presu USING btree (destino, orden, titulo);

create index if not exists ubicaciones_perfil_idx ON public.ubicaciones USING btree (perfil_id);

create unique index if not exists ubicaciones_nombre_unico ON public.ubicaciones USING btree (lower(btrim(nombre))) WHERE activo;

create index if not exists valoraciones_por_facturar_idx ON public.valoraciones USING btree (facturado) WHERE (facturado = false);

create index if not exists valoraciones_vence_idx ON public.valoraciones USING btree (vence_el) WHERE (facturado AND (cobrado_el IS NULL));


-- ==========================================================================
-- LAS VISTAS  ·  24
--
-- Preguntas ya hechas: lo pendiente de facturar, los impagados, las visitas
-- paradas, las obras sin remate, el catálogo con sus existencias. La
-- aplicación las lee como si fueran tablas.
-- ==========================================================================

create or replace view public.avisos_parados as
 SELECT id,
    tipo,
    estado,
    prioridad,
    cliente_id,
    puerta_id,
    tecnico_id,
    GREATEST(COALESCE(movido_el, creado), COALESCE(estado_el, creado), COALESCE(( SELECT max(GREATEST(j.fecha::timestamp with time zone, j.creado)) AS max
           FROM jornadas j
          WHERE j.aviso_id = a.id), creado), creado) AS quieto_desde,
    creado,
        CASE
            WHEN tecnico_id IS NULL THEN 'sin asignar'::text
            WHEN estado = 'repuesto'::text THEN 'esperando repuesto'::text
            WHEN obra_larga THEN 'obra sin movimiento'::text
            ELSE 'abierto'::text
        END AS motivo
   FROM avisos a
  WHERE cerrado IS NULL AND NOT anulada;

create or replace view public.avisos_sin_subtipo as
 SELECT id AS aviso_id,
    tipo,
    creado,
    cerrado,
    cliente_id
   FROM avisos a
  WHERE (tipo = ANY (ARRAY['averia'::text, 'instalacion'::text])) AND COALESCE(subtipo, ''::text) = ''::text AND NOT COALESCE(anulada, false)
  ORDER BY creado DESC;

create or replace view public.bajas_material as
 SELECT m.id,
    m.creado,
    m.motivo,
        CASE m.motivo
            WHEN 'baja_roto'::text THEN 'Roto'::text
            WHEN 'baja_perdido'::text THEN 'Perdido'::text
            WHEN 'baja_otro'::text THEN 'Otro'::text
            ELSE 'Baja (antes del 08-11-2026)'::text
        END AS motivo_nombre,
    m.cantidad,
    m.nota,
    m.articulo_id,
    a.descripcion AS articulo,
    a.codigo AS articulo_codigo,
    a.unidad,
    a.familia,
    a.coste AS coste_unidad,
    round(COALESCE(a.coste, 0::numeric) * m.cantidad, 2) AS coste_total,
    m.desde AS ubicacion_id,
    u.nombre AS almacen,
    u.tipo AS almacen_tipo,
    m.creado_por,
    m.creado_por_id,
    p.nombre AS quien,
    m.aviso_id,
    m.puerta_id
   FROM movimientos_material m
     JOIN articulos a ON a.id = m.articulo_id
     LEFT JOIN ubicaciones u ON u.id = m.desde
     LEFT JOIN perfiles p ON p.id = m.creado_por_id
  WHERE (m.motivo = ANY (ARRAY['baja_roto'::text, 'baja_perdido'::text, 'baja_otro'::text, 'baja'::text])) AND es_gestion();

create or replace view public.catalogo as
 SELECT id,
    descripcion,
    referencia,
    unidad,
    codigo,
    token,
    familia,
    marca,
    proveedor,
    proveedor_id,
    minimo,
    ubicacion,
    ean,
    notas,
    activo,
    detalle,
    foto_ruta
   FROM articulos a;

create or replace view public.clientes_sin_ruta as
 SELECT c.id AS cliente_id,
    c.nombre,
    count(a.id) AS visitas,
    max(a.creado) AS ultima_visita,
    count(ce.id) FILTER (WHERE ce.ruta IS NOT NULL) AS centros_con_ruta,
    count(ce.id) AS centros
   FROM clientes c
     LEFT JOIN avisos a ON a.cliente_id = c.id AND NOT COALESCE(a.anulada, false)
     LEFT JOIN centros ce ON ce.cliente_id = c.id
  WHERE c.ruta IS NULL
  GROUP BY c.id, c.nombre
 HAVING count(a.id) > 0 AND count(ce.id) FILTER (WHERE ce.ruta IS NOT NULL) = 0
  ORDER BY (count(a.id)) DESC;

create or replace view public.comerciales_con_huecos_de_menos as
 SELECT id,
    cliente_id,
    cerrado,
    tecnico_id,
    COALESCE(( SELECT sum((e.value ->> 'uds'::text)::integer) AS sum
           FROM jsonb_array_elements(a.tipos_uds) e(value)), 0::bigint) AS puertas_ofertadas,
    ( SELECT count(*) AS count
           FROM medidas m
          WHERE m.aviso_id = a.id AND m.sin_medir IS NOT TRUE) AS huecos_medidos
   FROM avisos a
  WHERE tipo = 'comercial'::text AND cerrado IS NOT NULL AND anulada IS NOT TRUE AND tipos_uds IS NOT NULL AND COALESCE(( SELECT sum((e.value ->> 'uds'::text)::integer) AS sum
           FROM jsonb_array_elements(a.tipos_uds) e(value)), 0::bigint) > (( SELECT count(*) AS count
           FROM medidas m
          WHERE m.aviso_id = a.id AND m.sin_medir IS NOT TRUE))
  ORDER BY cerrado DESC;

create or replace view public.comerciales_sin_medidas as
 SELECT id,
    cliente_id,
    cerrado,
    tecnico_id,
    descripcion
   FROM avisos a
  WHERE tipo = 'comercial'::text AND cerrado IS NOT NULL AND anulada IS NOT TRUE AND NOT (EXISTS ( SELECT 1
           FROM medidas m
          WHERE m.aviso_id = a.id))
  ORDER BY cerrado DESC;

create or replace view public.existencias_material as
 SELECT articulo_id,
    ubicacion_id,
    sum(cant) AS cantidad
   FROM ( SELECT movimientos_material.articulo_id,
            movimientos_material.hasta AS ubicacion_id,
            movimientos_material.cantidad AS cant
           FROM movimientos_material
          WHERE movimientos_material.hasta IS NOT NULL
        UNION ALL
         SELECT movimientos_material.articulo_id,
            movimientos_material.desde AS ubicacion_id,
            - movimientos_material.cantidad AS cant
           FROM movimientos_material
          WHERE movimientos_material.desde IS NOT NULL) t
  GROUP BY articulo_id, ubicacion_id
 HAVING sum(cant) <> 0::numeric;

create or replace view public.falsos_pendientes as
 SELECT a.id,
    a.tipo,
    a.cliente_id,
    a.puerta_id,
    a.tecnico_id,
    a.tecnico,
    a.cerrado,
    a.falso_motivo,
    a.ruta,
    COALESCE(v.imp_desplazamiento, 0::numeric) AS se_cobra,
    COALESCE(v.coste_total, 0::numeric) AS nos_cuesta
   FROM avisos a
     LEFT JOIN valoraciones v ON v.aviso_id = a.id
  WHERE a.falso IS TRUE AND a.falso_resuelto IS NOT TRUE AND a.anulada IS NOT TRUE
  ORDER BY a.cerrado DESC NULLS LAST;

create or replace view public.falsos_resumen as
 SELECT date_trunc('month'::text, a.cerrado)::date AS mes,
    count(*) AS viajes,
    count(*) FILTER (WHERE a.falso_resuelto IS NOT TRUE) AS sin_volver_a_quedar,
    COALESCE(sum(v.imp_desplazamiento), 0::numeric) AS cobrado,
    COALESCE(sum(v.coste_total), 0::numeric) AS costado,
    COALESCE(sum(v.margen), 0::numeric) AS margen
   FROM avisos a
     LEFT JOIN valoraciones v ON v.aviso_id = a.id
  WHERE a.falso IS TRUE AND a.cerrado IS NOT NULL AND a.anulada IS NOT TRUE
  GROUP BY (date_trunc('month'::text, a.cerrado)::date)
  ORDER BY (date_trunc('month'::text, a.cerrado)::date) DESC;

create or replace view public.impagados as
 SELECT v.aviso_id,
    a.cliente_id,
    c.nombre AS cliente,
    v.factura_ref,
    v.facturado_el,
    v.vence_el,
    CURRENT_DATE - v.vence_el AS dias_de_retraso,
    v.imp_total,
    a.cobrado AS cobrado_en_obra,
    a.cobro_importe
   FROM valoraciones v
     JOIN avisos a ON a.id = v.aviso_id
     LEFT JOIN clientes c ON c.id = a.cliente_id
  WHERE v.facturado AND v.cobrado_el IS NULL AND v.vence_el IS NOT NULL AND v.vence_el < CURRENT_DATE AND NOT a.anulada;

create or replace view public.obras_con_remate_pendiente as
 SELECT id,
    cliente_id,
    puerta_id,
    cerrado,
    tecnico_id,
    pendiente_texto,
    subtipo,
    ( SELECT count(*) AS count
           FROM avisos ps
          WHERE ps.instalacion_id = a.id) AS remates
   FROM avisos a
  WHERE tipo = 'instalacion'::text AND cerrado IS NOT NULL AND anulada IS NOT TRUE AND pendiente IS TRUE AND NOT (EXISTS ( SELECT 1
           FROM avisos ps
          WHERE ps.instalacion_id = a.id AND ps.tipo = 'puesta_servicio'::text AND ps.cerrado IS NOT NULL AND ps.anulada IS NOT TRUE))
  ORDER BY cerrado;

create or replace view public.obras_contra_presupuesto as
 SELECT a.id AS aviso_id,
    a.tipo,
    a.cerrado,
    p.referencia,
    p.titulo,
    p.base AS pactado_sin_iva,
    v.imp_total AS valorado_sin_iva,
    COALESCE(p.base, 0::numeric) - COALESCE(v.imp_total, 0::numeric) AS diferencia,
    v.facturado
   FROM avisos a
     JOIN presupuestos p ON p.id = a.presupuesto_id
     LEFT JOIN valoraciones v ON v.aviso_id = a.id
  WHERE a.cerrado IS NOT NULL AND COALESCE(a.anulada, false) = false;

create or replace view public.obras_puertas as
 SELECT id AS aviso_id,
    tipo,
    cerrado,
    obra_larga,
    ( SELECT count(*) AS count
           FROM aviso_puertas ap
          WHERE ap.aviso_id = a.id) AS puertas,
    ( SELECT count(*) AS count
           FROM entregas_obra e
          WHERE e.aviso_id = a.id) AS actas,
    ( SELECT count(*) AS count
           FROM entregas_obra e
          WHERE e.aviso_id = a.id AND e.firma_el IS NOT NULL) AS actas_firmadas,
    ( SELECT string_agg(p.codigo, ' · '::text ORDER BY ap.orden, p.codigo) AS string_agg
           FROM aviso_puertas ap
             JOIN puertas p ON p.id = ap.puerta_id
          WHERE ap.aviso_id = a.id) AS codigos
   FROM avisos a;

create or replace view public.otros_trabajos as
 SELECT id,
    tipo,
    cliente_id,
    puerta_id,
    tecnico_id,
    creado,
    cerrado,
    subtipo_detalle
   FROM avisos a
  WHERE subtipo = 'otros'::text AND anulada IS NOT TRUE
  ORDER BY creado DESC;

create or replace view public.pendiente_de_facturar as
 SELECT v.aviso_id,
    a.cliente_id,
    c.nombre AS cliente,
    a.tipo,
    a.cerrado,
    v.imp_total,
    a.cobrado AS cobrado_en_obra,
    a.cobro_importe,
    a.cobro_forma
   FROM valoraciones v
     JOIN avisos a ON a.id = v.aviso_id
     LEFT JOIN clientes c ON c.id = a.cliente_id
  WHERE a.cerrado IS NOT NULL AND NOT a.anulada AND NOT a.sin_cargo AND NOT v.facturado;

create or replace view public.perifericos_mas_montados as
 SELECT k.k AS periferico,
    count(*) AS visitas,
    count(*) FILTER (WHERE a.tipo = 'averia'::text) AS como_averia,
    count(*) FILTER (WHERE a.tipo = 'instalacion'::text) AS como_instalacion,
    max(a.cerrado) AS ultima
   FROM avisos a
     CROSS JOIN LATERAL unnest(a.perifericos) k(k)
  WHERE a.perifericos IS NOT NULL AND a.anulada IS NOT TRUE
  GROUP BY k.k
  ORDER BY (count(*)) DESC, k.k;

create or replace view public.remates_por_causa as
 SELECT COALESCE(a.ps_causa, 'sin_indicar'::text) AS causa,
    count(*) AS visitas,
    count(*) FILTER (WHERE a.repercutible) AS repercutidas,
    round(COALESCE(sum(v.coste_total), 0::numeric), 2) AS coste,
    round(COALESCE(sum(v.imp_total), 0::numeric), 2) AS facturado
   FROM avisos a
     LEFT JOIN valoraciones v ON v.aviso_id = a.id
  WHERE a.tipo = 'puesta_servicio'::text AND a.anulada IS NOT TRUE
  GROUP BY (COALESCE(a.ps_causa, 'sin_indicar'::text))
  ORDER BY (round(COALESCE(sum(v.coste_total), 0::numeric), 2)) DESC;

create or replace view public.urgencias_por_modo as
 SELECT COALESCE(a.urgencia_modo, 'sin indicar'::text) AS modo,
    count(*) AS visitas,
    max(a.urgencia_factor) AS factor,
    COALESCE(sum(v.imp_total), 0::numeric) AS facturado,
    COALESCE(sum(v.margen), 0::numeric) AS margen
   FROM avisos a
     LEFT JOIN valoraciones v ON v.aviso_id = a.id
  WHERE a.tipo = 'urgencia'::text AND a.cerrado IS NOT NULL AND a.anulada IS NOT TRUE
  GROUP BY (COALESCE(a.urgencia_modo, 'sin indicar'::text))
  ORDER BY (count(*)) DESC;

create or replace view public.urgencias_sin_factor as
 SELECT a.id AS aviso_id,
    a.cliente_id,
    a.cerrado,
    a.hora_inicio,
    v.imp_total
   FROM avisos a
     LEFT JOIN valoraciones v ON v.aviso_id = a.id
  WHERE a.tipo = 'urgencia'::text AND a.urgencia_factor IS NULL AND a.cerrado IS NOT NULL AND NOT COALESCE(a.anulada, false)
  ORDER BY a.cerrado DESC;

create or replace view public.visitas_ruta_sin_valorar as
 SELECT a.id AS aviso_id,
    a.cliente_id,
    a.cerrado,
    a.ruta,
    v.imp_desplazamiento
   FROM avisos a
     JOIN valoraciones v ON v.aviso_id = a.id
     CROSS JOIN tarifas t
  WHERE t.id = 1 AND a.cerrado IS NOT NULL AND NOT a.anulada AND NOT a.sin_cargo AND a.ruta IS NOT NULL AND a.ruta <> 'km'::text AND COALESCE(v.imp_desplazamiento, 0::numeric) = 0::numeric AND
        CASE a.ruta
            WHEN 'ruta1'::text THEN COALESCE(t.ruta1_importe, t.desplazamiento_fijo)
            WHEN 'ruta2'::text THEN t.ruta2_importe
            WHEN 'ruta3'::text THEN t.ruta3_importe
            WHEN 'ruta4'::text THEN t.ruta4_importe
            WHEN 'ruta5'::text THEN t.ruta5_importe
            ELSE NULL::numeric
        END IS NULL;

create or replace view public.visitas_sin_ficha_de_puerta as
 SELECT id,
    tipo,
    cliente_id,
    tecnico_id,
    cerrado,
    descripcion
   FROM avisos a
  WHERE cerrado IS NOT NULL AND anulada IS NOT TRUE AND sin_puerta IS NOT TRUE AND (tipo <> ALL (ARRAY['comercial'::text, 'falso'::text])) AND puerta_id IS NULL AND NOT (EXISTS ( SELECT 1
           FROM aviso_puertas ap
          WHERE ap.aviso_id = a.id))
  ORDER BY cerrado DESC;

create or replace view public.visitas_sin_foto as
 SELECT id,
    tipo,
    cliente_id,
    puerta_id,
    tecnico,
    cerrado
   FROM avisos a
  WHERE cerrado IS NOT NULL AND anulada IS NOT TRUE AND COALESCE(falso, false) = false AND tipo <> 'falso'::text AND cerrado >= '2026-11-06 23:00:00+00'::timestamp with time zone AND NOT (EXISTS ( SELECT 1
           FROM fotos f
          WHERE f.aviso_id = a.id))
  ORDER BY cerrado DESC;

create or replace view public.visitas_sin_puerta as
 SELECT id,
    tipo,
    subtipo,
    cliente_id,
    tecnico_id,
    tecnico,
    cerrado,
    sin_puerta_motivo,
    descripcion
   FROM avisos a
  WHERE sin_puerta IS TRUE AND anulada IS NOT TRUE
  ORDER BY cerrado DESC NULLS LAST;


-- ==========================================================================
-- LOS DISPARADORES  ·  13
--
-- Lo que la base hace sola cuando pasa algo: sellar la hora en que una visita
-- cambia de estado, avisar al grupo cuando se escribe un mensaje, completar la
-- puerta de un mensaje que llega sin ella.
-- ==========================================================================

drop trigger if exists articulos_normaliza_ean on public.articulos;
CREATE TRIGGER articulos_normaliza_ean BEFORE INSERT OR UPDATE OF ean ON public.articulos FOR EACH ROW EXECUTE FUNCTION normaliza_ean();

drop trigger if exists avisos_avisar_cierre on public.avisos;
CREATE TRIGGER avisos_avisar_cierre AFTER UPDATE OF cerrado ON public.avisos FOR EACH ROW EXECUTE FUNCTION avisar_cierre();

drop trigger if exists avisos_avisar_llegada on public.avisos;
CREATE TRIGGER avisos_avisar_llegada AFTER UPDATE OF hora_inicio ON public.avisos FOR EACH ROW EXECUTE FUNCTION avisar_llegada();

drop trigger if exists avisos_dueno on public.avisos;
CREATE TRIGGER avisos_dueno BEFORE INSERT ON public.avisos FOR EACH ROW EXECUTE FUNCTION aviso_dueno();

drop trigger if exists avisos_notificar on public.avisos;
CREATE TRIGGER avisos_notificar AFTER INSERT OR UPDATE ON public.avisos FOR EACH ROW EXECUTE FUNCTION notificar_aviso();

drop trigger if exists avisos_sellar_alta on public.avisos;
CREATE TRIGGER avisos_sellar_alta BEFORE INSERT ON public.avisos FOR EACH ROW EXECUTE FUNCTION avisos_sellar_alta();

drop trigger if exists avisos_sellar_movimiento on public.avisos;
CREATE TRIGGER avisos_sellar_movimiento BEFORE UPDATE ON public.avisos FOR EACH ROW EXECUTE FUNCTION avisos_sellar_movimiento();

drop trigger if exists avisos_tras_cerrar on public.avisos;
CREATE TRIGGER avisos_tras_cerrar AFTER UPDATE ON public.avisos FOR EACH ROW EXECUTE FUNCTION tras_cerrar_preventiva();

drop trigger if exists contrato_puertas_suma on public.contrato_puertas;
CREATE TRIGGER contrato_puertas_suma AFTER INSERT OR DELETE OR UPDATE ON public.contrato_puertas FOR EACH ROW EXECUTE FUNCTION sumar_cuotas();

drop trigger if exists jornadas_avisar on public.jornadas;
CREATE TRIGGER jornadas_avisar AFTER INSERT ON public.jornadas FOR EACH ROW EXECUTE FUNCTION avisar_jornada();

drop trigger if exists mensajes_avisar on public.mensajes;
CREATE TRIGGER mensajes_avisar AFTER INSERT ON public.mensajes FOR EACH ROW EXECUTE FUNCTION avisar_mensaje();

drop trigger if exists mensajes_completa_puerta on public.mensajes;
CREATE TRIGGER mensajes_completa_puerta BEFORE INSERT ON public.mensajes FOR EACH ROW EXECUTE FUNCTION mensaje_completa_puerta();

drop trigger if exists perfiles_rol on public.perfiles;
CREATE TRIGGER perfiles_rol BEFORE INSERT OR UPDATE ON public.perfiles FOR EACH ROW EXECUTE FUNCTION rol_guard();


-- ==========================================================================
-- SEGURIDAD POR FILAS  ·  42
--
-- A partir de aquí, cada tabla deja de estar abierta: solo devuelve las filas
-- que las políticas de abajo permitan. Esto es lo que hace que un técnico no
-- vea los precios ni los márgenes.
-- ==========================================================================

alter table public.ajustes enable row level security;

alter table public.articulos enable row level security;

alter table public.aviso_puertas enable row level security;

alter table public.aviso_tecnicos enable row level security;

alter table public.avisos enable row level security;

alter table public.centros enable row level security;

alter table public.clientes enable row level security;

alter table public.componentes enable row level security;

alter table public.config_interna enable row level security;

alter table public.conformidad_visita enable row level security;

alter table public.conjunto_lineas enable row level security;

alter table public.conjuntos enable row level security;

alter table public.contactos enable row level security;

alter table public.contrato_puertas enable row level security;

alter table public.contratos enable row level security;

alter table public.documentos enable row level security;

alter table public.entregas_obra enable row level security;

alter table public.etiquetas enable row level security;

alter table public.expediente_docs enable row level security;

alter table public.expediente_fotos enable row level security;

alter table public.expedientes enable row level security;

alter table public.fotos enable row level security;

alter table public.jornadas enable row level security;

alter table public.materiales enable row level security;

alter table public.materiales_previstos enable row level security;

alter table public.medidas enable row level security;

alter table public.mensajes enable row level security;

alter table public.movimientos_material enable row level security;

alter table public.perfiles enable row level security;

alter table public.peticiones_material enable row level security;

alter table public.presupuesto_adjuntos enable row level security;

alter table public.presupuesto_envios enable row level security;

alter table public.presupuesto_lineas enable row level security;

alter table public.presupuesto_visitas enable row level security;

alter table public.presupuestos enable row level security;

alter table public.proveedores enable row level security;

alter table public.puertas enable row level security;

alter table public.revisiones enable row level security;

alter table public.tarifas enable row level security;

alter table public.telegram_enviados enable row level security;

alter table public.textos_presu enable row level security;

alter table public.ubicaciones enable row level security;

alter table public.valoraciones enable row level security;


-- ==========================================================================
-- LAS POLÍTICAS  ·  67
--
-- Quién puede ver y tocar qué, tabla por tabla. Es la parte que de verdad
-- protege los datos, y la que nunca hay que montar a ojo: estas son las que
-- tiene la base de producción, leídas de ella.
-- ==========================================================================

drop policy if exists "admin escribe ajustes" on public.ajustes;
create policy "admin escribe ajustes" on public.ajustes as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM perfiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = 'admin'::text) AND p.activo)))) with check ((EXISTS ( SELECT 1
   FROM perfiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = 'admin'::text) AND p.activo))));

drop policy if exists "equipo lee ajustes" on public.ajustes;
create policy "equipo lee ajustes" on public.ajustes as PERMISSIVE for SELECT to authenticated using (es_equipo());

drop policy if exists "gestion articulos" on public.articulos;
create policy "gestion articulos" on public.articulos as PERMISSIVE for ALL to authenticated using (es_gestion()) with check (es_gestion());

drop policy if exists "equipo aviso puertas" on public.aviso_puertas;
create policy "equipo aviso puertas" on public.aviso_puertas as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo aviso tecnicos" on public.aviso_tecnicos;
create policy "equipo aviso tecnicos" on public.aviso_tecnicos as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "admin borra avisos" on public.avisos;
create policy "admin borra avisos" on public.avisos as PERMISSIVE for DELETE to authenticated using (es_admin());

drop policy if exists "equipo cambia avisos" on public.avisos;
create policy "equipo cambia avisos" on public.avisos as PERMISSIVE for UPDATE to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo crea avisos" on public.avisos;
create policy "equipo crea avisos" on public.avisos as PERMISSIVE for INSERT to authenticated with check (es_equipo());

drop policy if exists "equipo ve avisos" on public.avisos;
create policy "equipo ve avisos" on public.avisos as PERMISSIVE for SELECT to authenticated using (es_equipo());

drop policy if exists "equipo centros" on public.centros;
create policy "equipo centros" on public.centros as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "admin borra clientes" on public.clientes;
create policy "admin borra clientes" on public.clientes as PERMISSIVE for DELETE to authenticated using (es_admin());

drop policy if exists "equipo cambia clientes" on public.clientes;
create policy "equipo cambia clientes" on public.clientes as PERMISSIVE for UPDATE to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo crea clientes" on public.clientes;
create policy "equipo crea clientes" on public.clientes as PERMISSIVE for INSERT to authenticated with check (es_equipo());

drop policy if exists "equipo ve clientes" on public.clientes;
create policy "equipo ve clientes" on public.clientes as PERMISSIVE for SELECT to authenticated using (es_equipo());

drop policy if exists "equipo componentes" on public.componentes;
create policy "equipo componentes" on public.componentes as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo conformidad visita" on public.conformidad_visita;
create policy "equipo conformidad visita" on public.conformidad_visita as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo conjunto lineas" on public.conjunto_lineas;
create policy "equipo conjunto lineas" on public.conjunto_lineas as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo conjuntos" on public.conjuntos;
create policy "equipo conjuntos" on public.conjuntos as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo contactos" on public.contactos;
create policy "equipo contactos" on public.contactos as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "gestion contrato puertas" on public.contrato_puertas;
create policy "gestion contrato puertas" on public.contrato_puertas as PERMISSIVE for ALL to authenticated using (es_gestion()) with check (es_gestion());

drop policy if exists "equipo contratos" on public.contratos;
create policy "equipo contratos" on public.contratos as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo documentos" on public.documentos;
create policy "equipo documentos" on public.documentos as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo entregas obra" on public.entregas_obra;
create policy "equipo entregas obra" on public.entregas_obra as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo etiquetas" on public.etiquetas;
create policy "equipo etiquetas" on public.etiquetas as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo docs expediente" on public.expediente_docs;
create policy "equipo docs expediente" on public.expediente_docs as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo fotos expediente" on public.expediente_fotos;
create policy "equipo fotos expediente" on public.expediente_fotos as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "admin borra expedientes" on public.expedientes;
create policy "admin borra expedientes" on public.expedientes as PERMISSIVE for DELETE to authenticated using (es_admin());

drop policy if exists "equipo cambia expedientes" on public.expedientes;
create policy "equipo cambia expedientes" on public.expedientes as PERMISSIVE for UPDATE to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo crea expedientes" on public.expedientes;
create policy "equipo crea expedientes" on public.expedientes as PERMISSIVE for INSERT to authenticated with check (es_equipo());

drop policy if exists "equipo ve expedientes" on public.expedientes;
create policy "equipo ve expedientes" on public.expedientes as PERMISSIVE for SELECT to authenticated using (es_equipo());

drop policy if exists "equipo fotos" on public.fotos;
create policy "equipo fotos" on public.fotos as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo jornadas" on public.jornadas;
create policy "equipo jornadas" on public.jornadas as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo materiales" on public.materiales;
create policy "equipo materiales" on public.materiales as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo materiales previstos" on public.materiales_previstos;
create policy "equipo materiales previstos" on public.materiales_previstos as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo medidas" on public.medidas;
create policy "equipo medidas" on public.medidas as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo escribe mensajes" on public.mensajes;
create policy "equipo escribe mensajes" on public.mensajes as PERMISSIVE for INSERT to authenticated with check (es_equipo());

drop policy if exists "equipo fija mensajes" on public.mensajes;
create policy "equipo fija mensajes" on public.mensajes as PERMISSIVE for UPDATE to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo lee mensajes" on public.mensajes;
create policy "equipo lee mensajes" on public.mensajes as PERMISSIVE for SELECT to authenticated using (es_equipo());

drop policy if exists "equipo borra lo del parte" on public.movimientos_material;
create policy "equipo borra lo del parte" on public.movimientos_material as PERMISSIVE for DELETE to authenticated using ((es_equipo() AND (motivo = ANY (ARRAY['obra'::text, 'averia'::text]))));

drop policy if exists "equipo crea movimientos" on public.movimientos_material;
create policy "equipo crea movimientos" on public.movimientos_material as PERMISSIVE for INSERT to authenticated with check (es_equipo());

drop policy if exists "equipo ve movimientos" on public.movimientos_material;
create policy "equipo ve movimientos" on public.movimientos_material as PERMISSIVE for SELECT to authenticated using (es_equipo());

drop policy if exists "nadie cambia movimientos" on public.movimientos_material;
create policy "nadie cambia movimientos" on public.movimientos_material as PERMISSIVE for UPDATE to authenticated using (false) with check (false);

drop policy if exists "alta propio perfil" on public.perfiles;
create policy "alta propio perfil" on public.perfiles as PERMISSIVE for INSERT to authenticated with check ((id = auth.uid()));

drop policy if exists "equipo perfiles" on public.perfiles;
create policy "equipo perfiles" on public.perfiles as PERMISSIVE for SELECT to authenticated using (true);

drop policy if exists "equipo ve perfiles" on public.perfiles;
create policy "equipo ve perfiles" on public.perfiles as PERMISSIVE for SELECT to authenticated using (es_equipo());

drop policy if exists "gestion cambia el nombre del equipo" on public.perfiles;
create policy "gestion cambia el nombre del equipo" on public.perfiles as PERMISSIVE for UPDATE to authenticated using (es_gestion()) with check (es_gestion());

drop policy if exists "gestion cambia perfiles" on public.perfiles;
create policy "gestion cambia perfiles" on public.perfiles as PERMISSIVE for UPDATE to authenticated using (es_gestion()) with check (es_gestion());

drop policy if exists "propio perfil" on public.perfiles;
create policy "propio perfil" on public.perfiles as PERMISSIVE for UPDATE to authenticated using ((id = auth.uid()));

drop policy if exists "equipo crea peticiones material" on public.peticiones_material;
create policy "equipo crea peticiones material" on public.peticiones_material as PERMISSIVE for INSERT to authenticated with check ((es_equipo() AND (estado = 'pendiente'::text)));

drop policy if exists "equipo ve peticiones material" on public.peticiones_material;
create policy "equipo ve peticiones material" on public.peticiones_material as PERMISSIVE for SELECT to authenticated using (es_equipo());

drop policy if exists "gestion borra peticiones material" on public.peticiones_material;
create policy "gestion borra peticiones material" on public.peticiones_material as PERMISSIVE for DELETE to authenticated using (es_gestion());

drop policy if exists "gestion resuelve peticiones material" on public.peticiones_material;
create policy "gestion resuelve peticiones material" on public.peticiones_material as PERMISSIVE for UPDATE to authenticated using (es_gestion()) with check (es_gestion());

drop policy if exists "gestion presupuesto adjuntos" on public.presupuesto_adjuntos;
create policy "gestion presupuesto adjuntos" on public.presupuesto_adjuntos as PERMISSIVE for ALL to authenticated using (es_gestion()) with check (es_gestion());

drop policy if exists "gestion presupuesto envios" on public.presupuesto_envios;
create policy "gestion presupuesto envios" on public.presupuesto_envios as PERMISSIVE for ALL to authenticated using (es_gestion()) with check (es_gestion());

drop policy if exists "gestion presupuesto lineas" on public.presupuesto_lineas;
create policy "gestion presupuesto lineas" on public.presupuesto_lineas as PERMISSIVE for ALL to authenticated using (es_gestion()) with check (es_gestion());

drop policy if exists "gestion presupuesto visitas" on public.presupuesto_visitas;
create policy "gestion presupuesto visitas" on public.presupuesto_visitas as PERMISSIVE for ALL to authenticated using (es_gestion()) with check (es_gestion());

drop policy if exists "gestion presupuestos" on public.presupuestos;
create policy "gestion presupuestos" on public.presupuestos as PERMISSIVE for ALL to authenticated using (es_gestion()) with check (es_gestion());

drop policy if exists "equipo proveedores" on public.proveedores;
create policy "equipo proveedores" on public.proveedores as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo puertas" on public.puertas;
create policy "equipo puertas" on public.puertas as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo revisiones" on public.revisiones;
create policy "equipo revisiones" on public.revisiones as PERMISSIVE for ALL to authenticated using (es_equipo()) with check (es_equipo());

drop policy if exists "admin cambia tarifas" on public.tarifas;
create policy "admin cambia tarifas" on public.tarifas as PERMISSIVE for ALL to authenticated using (es_admin()) with check (es_admin());

drop policy if exists "gestion lee tarifas" on public.tarifas;
create policy "gestion lee tarifas" on public.tarifas as PERMISSIVE for SELECT to authenticated using (es_gestion());

drop policy if exists "gestion textos presu" on public.textos_presu;
create policy "gestion textos presu" on public.textos_presu as PERMISSIVE for ALL to authenticated using (es_gestion()) with check (es_gestion());

drop policy if exists "equipo ve ubicaciones" on public.ubicaciones;
create policy "equipo ve ubicaciones" on public.ubicaciones as PERMISSIVE for SELECT to authenticated using (es_equipo());

drop policy if exists "gestion borra ubicaciones" on public.ubicaciones;
create policy "gestion borra ubicaciones" on public.ubicaciones as PERMISSIVE for DELETE to authenticated using (es_gestion());

drop policy if exists "gestion cambia ubicaciones" on public.ubicaciones;
create policy "gestion cambia ubicaciones" on public.ubicaciones as PERMISSIVE for UPDATE to authenticated using (es_gestion()) with check (es_gestion());

drop policy if exists "gestion crea ubicaciones" on public.ubicaciones;
create policy "gestion crea ubicaciones" on public.ubicaciones as PERMISSIVE for INSERT to authenticated with check (es_gestion());

drop policy if exists "gestion valoraciones" on public.valoraciones;
create policy "gestion valoraciones" on public.valoraciones as PERMISSIVE for ALL to authenticated using (es_gestion()) with check (es_gestion());


-- ============================================================================
-- LOS SIETE ALMACENES DE FICHEROS  ·  7
--
-- La aplicación usa siete, y hasta el 14-11-2026 el SQL solo creaba uno: los
-- otros seis se habían hecho a mano, pinchando en el panel de Supabase. Lo que
-- se hace a mano se hace mal un día, y además no falla al instalar: falla
-- semanas después, la primera vez que alguien sube una foto.
--
-- QUÉ ES PÚBLICO Y POR QUÉ
-- Un almacén público se abre con un enlace, sin haber entrado en la
-- aplicación. Solo lo son los dos que el CLIENTE tiene que poder abrir:
--
--   · publicos → lo que ve al escanear el QR de su puerta: el desbloqueo de
--                emergencia y las instrucciones de uso.
--   · ofertas  → los presupuestos que se le mandan por enlace.
--
-- Los otros cinco son PRIVADOS y se abren con enlaces firmados que caducan.
-- Ahí viven las fotos de las puertas de los clientes, sus documentos, los
-- expedientes y las firmas de los partes.
-- ============================================================================

insert into storage.buckets (id, name, public) values
  ('fotos',       'fotos',       false),
  ('documentos',  'documentos',  false),
  ('expedientes', 'expedientes', false),
  ('firmas',      'firmas',      false),
  ('equipo',      'equipo',      false),
  ('publicos',    'publicos',    true),
  ('ofertas',     'ofertas',     true)
on conflict (id) do nothing;


-- ==========================================================================
-- LAS POLÍTICAS DE LOS ALMACENES DE FICHEROS  ·  12
--
-- Las de verdad, leídas de producción. Cinco almacenes se abren solo a quien
-- es del equipo; las fotos del equipo las ve el equipo y las cambia la
-- oficina; y las ofertas las lee cualquiera con el enlace, porque para eso se
-- mandan.
-- ==========================================================================

drop policy if exists "equipo documentos storage" on storage.objects;
create policy "equipo documentos storage" on storage.objects as PERMISSIVE for ALL to authenticated using (((bucket_id = 'documentos'::text) AND es_equipo())) with check (((bucket_id = 'documentos'::text) AND es_equipo()));

drop policy if exists "equipo expedientes storage" on storage.objects;
create policy "equipo expedientes storage" on storage.objects as PERMISSIVE for ALL to authenticated using (((bucket_id = 'expedientes'::text) AND es_equipo())) with check (((bucket_id = 'expedientes'::text) AND es_equipo()));

drop policy if exists "equipo firmas storage" on storage.objects;
create policy "equipo firmas storage" on storage.objects as PERMISSIVE for ALL to authenticated using (((bucket_id = 'firmas'::text) AND es_equipo())) with check (((bucket_id = 'firmas'::text) AND es_equipo()));

drop policy if exists "equipo fotos storage" on storage.objects;
create policy "equipo fotos storage" on storage.objects as PERMISSIVE for ALL to authenticated using (((bucket_id = 'fotos'::text) AND es_equipo())) with check (((bucket_id = 'fotos'::text) AND es_equipo()));

drop policy if exists "equipo publicos storage" on storage.objects;
create policy "equipo publicos storage" on storage.objects as PERMISSIVE for ALL to authenticated using (((bucket_id = 'publicos'::text) AND es_equipo())) with check (((bucket_id = 'publicos'::text) AND es_equipo()));

drop policy if exists "equipo ve fotos equipo" on storage.objects;
create policy "equipo ve fotos equipo" on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'equipo'::text) AND es_equipo()));

drop policy if exists "gestion cambia fotos equipo" on storage.objects;
create policy "gestion cambia fotos equipo" on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'equipo'::text) AND es_gestion())) with check (((bucket_id = 'equipo'::text) AND es_gestion()));

drop policy if exists "gestion pone fotos equipo" on storage.objects;
create policy "gestion pone fotos equipo" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'equipo'::text) AND es_gestion()));

drop policy if exists "gestion quita fotos equipo" on storage.objects;
create policy "gestion quita fotos equipo" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'equipo'::text) AND es_gestion()));

drop policy if exists "ofertas borrado" on storage.objects;
create policy "ofertas borrado" on storage.objects as PERMISSIVE for DELETE to authenticated using ((bucket_id = 'ofertas'::text));

drop policy if exists "ofertas escritura" on storage.objects;
create policy "ofertas escritura" on storage.objects as PERMISSIVE for INSERT to authenticated with check ((bucket_id = 'ofertas'::text));

drop policy if exists "ofertas lectura" on storage.objects;
create policy "ofertas lectura" on storage.objects as PERMISSIVE for SELECT to anon, authenticated using ((bucket_id = 'ofertas'::text));


-- ==========================================================================
-- LOS PERMISOS  ·  349
--
-- Qué puede hacer cada papel con cada tabla, antes incluso de que las
-- políticas decidan qué filas. Son dos cerrojos distintos y hacen falta los
-- dos.
-- ==========================================================================

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.ajustes to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.ajustes to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.ajustes to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.articulos to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.articulos to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.articulos to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.aviso_puertas to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.aviso_tecnicos to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.aviso_puertas to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.aviso_tecnicos to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.aviso_puertas to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.aviso_tecnicos to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.avisos to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.avisos to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.avisos to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.avisos_parados to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.avisos_parados to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.avisos_parados to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.avisos_sin_subtipo to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.avisos_sin_subtipo to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.avisos_sin_subtipo to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bajas_material to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bajas_material to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bajas_material to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.catalogo to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.catalogo to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.catalogo to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.centros to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.centros to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.centros to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.clientes to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.clientes to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.clientes to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.clientes_sin_ruta to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.clientes_sin_ruta to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.clientes_sin_ruta to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.comerciales_con_huecos_de_menos to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.comerciales_con_huecos_de_menos to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.comerciales_con_huecos_de_menos to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.comerciales_sin_medidas to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.comerciales_sin_medidas to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.comerciales_sin_medidas to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.componentes to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.componentes to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.componentes to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.config_interna to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.config_interna to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.config_interna to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.conformidad_visita to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.conformidad_visita to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.conformidad_visita to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.conjunto_lineas to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.conjunto_lineas to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.conjunto_lineas to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.conjuntos to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.conjuntos to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.conjuntos to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.contactos to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.contactos to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.contactos to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.contrato_puertas to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.contrato_puertas to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.contrato_puertas to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.contratos to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.contratos to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.contratos to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.documentos to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.documentos to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.documentos to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.entregas_obra to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.entregas_obra to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.entregas_obra to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.etiquetas to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.etiquetas to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.etiquetas to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.existencias_material to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.existencias_material to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.existencias_material to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.expediente_docs to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.expediente_docs to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.expediente_docs to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.expediente_fotos to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.expediente_fotos to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.expediente_fotos to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.expedientes to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.expedientes to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.expedientes to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.falsos_pendientes to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.falsos_pendientes to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.falsos_pendientes to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.falsos_resumen to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.falsos_resumen to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.falsos_resumen to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.fotos to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.fotos to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.fotos to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.impagados to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.impagados to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.impagados to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.jornadas to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.jornadas to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.jornadas to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.materiales to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.materiales to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.materiales to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.materiales_previstos to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.materiales_previstos to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.materiales_previstos to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.medidas to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.medidas to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.medidas to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE on public.mensajes to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.mensajes to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.mensajes to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.movimientos_material to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.movimientos_material to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.movimientos_material to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.obras_con_remate_pendiente to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.obras_con_remate_pendiente to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.obras_con_remate_pendiente to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.obras_contra_presupuesto to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.obras_contra_presupuesto to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.obras_contra_presupuesto to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.obras_puertas to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.obras_puertas to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.obras_puertas to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.otros_trabajos to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.otros_trabajos to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.otros_trabajos to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pendiente_de_facturar to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pendiente_de_facturar to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pendiente_de_facturar to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.perfiles to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.perfiles to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.perfiles to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.perifericos_mas_montados to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.perifericos_mas_montados to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.perifericos_mas_montados to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.peticiones_material to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.peticiones_material to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.peticiones_material to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.presupuesto_adjuntos to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.presupuesto_adjuntos to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.presupuesto_adjuntos to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.presupuesto_envios to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.presupuesto_envios to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.presupuesto_envios to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.presupuesto_lineas to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.presupuesto_lineas to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.presupuesto_lineas to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.presupuesto_visitas to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.presupuesto_visitas to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.presupuesto_visitas to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.presupuestos to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.presupuestos to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.presupuestos to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.proveedores to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.proveedores to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.proveedores to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.puertas to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.puertas to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.puertas to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.remates_por_causa to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.remates_por_causa to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.remates_por_causa to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.revisiones to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.revisiones to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.revisiones to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.tarifas to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.tarifas to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.tarifas to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.telegram_enviados to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.telegram_enviados to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.telegram_enviados to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.textos_presu to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.textos_presu to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.textos_presu to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.ubicaciones to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.ubicaciones to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.ubicaciones to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.urgencias_por_modo to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.urgencias_por_modo to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.urgencias_por_modo to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.urgencias_sin_factor to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.urgencias_sin_factor to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.urgencias_sin_factor to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.valoraciones to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.valoraciones to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.valoraciones to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.visitas_ruta_sin_valorar to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.visitas_ruta_sin_valorar to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.visitas_ruta_sin_valorar to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.visitas_sin_ficha_de_puerta to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.visitas_sin_ficha_de_puerta to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.visitas_sin_ficha_de_puerta to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.visitas_sin_foto to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.visitas_sin_foto to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.visitas_sin_foto to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.visitas_sin_puerta to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.visitas_sin_puerta to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.visitas_sin_puerta to service_role;

grant UPDATE (fijado) on public.mensajes to authenticated;

grant execute on function public.admin_id() to anon;

grant execute on function public.admin_id() to authenticated;

grant execute on function public.admin_id() to service_role;

grant execute on function public.anular_asistencia(p_aviso uuid, p_motivo text) to anon;

grant execute on function public.anular_asistencia(p_aviso uuid, p_motivo text) to authenticated;

grant execute on function public.anular_asistencia(p_aviso uuid, p_motivo text) to service_role;

grant execute on function public.archivar_asistencia(p_aviso uuid, p_archivar boolean) to anon;

grant execute on function public.archivar_asistencia(p_aviso uuid, p_archivar boolean) to authenticated;

grant execute on function public.archivar_asistencia(p_aviso uuid, p_archivar boolean) to service_role;

grant execute on function public.archivar_cliente(p_cliente uuid, p_archivar boolean) to anon;

grant execute on function public.archivar_cliente(p_cliente uuid, p_archivar boolean) to authenticated;

grant execute on function public.archivar_cliente(p_cliente uuid, p_archivar boolean) to service_role;

grant execute on function public.articulo_por_barras(p_codigo text) to anon;

grant execute on function public.articulo_por_barras(p_codigo text) to authenticated;

grant execute on function public.articulo_por_barras(p_codigo text) to service_role;

grant execute on function public.avisar_cierre() to anon;

grant execute on function public.avisar_cierre() to authenticated;

grant execute on function public.avisar_cierre() to service_role;

grant execute on function public.avisar_grupo(p_cuerpo jsonb) to anon;

grant execute on function public.avisar_grupo(p_cuerpo jsonb) to authenticated;

grant execute on function public.avisar_grupo(p_cuerpo jsonb) to service_role;

grant execute on function public.avisar_jornada() to anon;

grant execute on function public.avisar_jornada() to authenticated;

grant execute on function public.avisar_jornada() to service_role;

grant execute on function public.avisar_llegada() to anon;

grant execute on function public.avisar_llegada() to authenticated;

grant execute on function public.avisar_llegada() to service_role;

grant execute on function public.avisar_mensaje() to anon;

grant execute on function public.avisar_mensaje() to authenticated;

grant execute on function public.avisar_mensaje() to service_role;

grant execute on function public.aviso_dueno() to anon;

grant execute on function public.aviso_dueno() to authenticated;

grant execute on function public.aviso_dueno() to service_role;

grant execute on function public.aviso_publico(p_codigo text, p_token text, p_tipo text, p_descripcion text, p_nombre text, p_telefono text, p_email text) to anon;

grant execute on function public.aviso_publico(p_codigo text, p_token text, p_tipo text, p_descripcion text, p_nombre text, p_telefono text, p_email text) to authenticated;

grant execute on function public.aviso_publico(p_codigo text, p_token text, p_tipo text, p_descripcion text, p_nombre text, p_telefono text, p_email text) to service_role;

grant execute on function public.avisos_sellar_alta() to anon;

grant execute on function public.avisos_sellar_alta() to authenticated;

grant execute on function public.avisos_sellar_alta() to service_role;

grant execute on function public.avisos_sellar_movimiento() to anon;

grant execute on function public.avisos_sellar_movimiento() to authenticated;

grant execute on function public.avisos_sellar_movimiento() to service_role;

grant execute on function public.borrar_asistencia(p_aviso uuid) to anon;

grant execute on function public.borrar_asistencia(p_aviso uuid) to authenticated;

grant execute on function public.borrar_asistencia(p_aviso uuid) to service_role;

grant execute on function public.borrar_cliente(p_cliente uuid) to anon;

grant execute on function public.borrar_cliente(p_cliente uuid) to authenticated;

grant execute on function public.borrar_cliente(p_cliente uuid) to service_role;

grant execute on function public.borrar_expediente(p_exp uuid) to anon;

grant execute on function public.borrar_expediente(p_exp uuid) to authenticated;

grant execute on function public.borrar_expediente(p_exp uuid) to service_role;

grant execute on function public.cliente_arrastra(p_cliente uuid) to anon;

grant execute on function public.cliente_arrastra(p_cliente uuid) to authenticated;

grant execute on function public.cliente_arrastra(p_cliente uuid) to service_role;

grant execute on function public.contrato_publico(p_token text) to anon;

grant execute on function public.contrato_publico(p_token text) to authenticated;

grant execute on function public.contrato_publico(p_token text) to service_role;

grant execute on function public.correo_del_parte(p_aviso uuid) to anon;

grant execute on function public.correo_del_parte(p_aviso uuid) to authenticated;

grant execute on function public.correo_del_parte(p_aviso uuid) to service_role;

grant execute on function public.crear_expediente(p_puerta uuid, p_situacion text, p_familia text, p_aviso uuid) to anon;

grant execute on function public.crear_expediente(p_puerta uuid, p_situacion text, p_familia text, p_aviso uuid) to authenticated;

grant execute on function public.crear_expediente(p_puerta uuid, p_situacion text, p_familia text, p_aviso uuid) to service_role;

grant execute on function public.duplicar_asistencia(p_aviso uuid) to anon;

grant execute on function public.duplicar_asistencia(p_aviso uuid) to authenticated;

grant execute on function public.duplicar_asistencia(p_aviso uuid) to service_role;

grant execute on function public.emitir_expediente(p_exp uuid, p_firmante text, p_cargo text) to anon;

grant execute on function public.emitir_expediente(p_exp uuid, p_firmante text, p_cargo text) to authenticated;

grant execute on function public.emitir_expediente(p_exp uuid, p_firmante text, p_cargo text) to service_role;

grant execute on function public.enviar_contrato(p_contrato uuid) to anon;

grant execute on function public.enviar_contrato(p_contrato uuid) to authenticated;

grant execute on function public.enviar_contrato(p_contrato uuid) to service_role;

grant execute on function public.enviar_parte(p_aviso uuid) to anon;

grant execute on function public.enviar_parte(p_aviso uuid) to authenticated;

grant execute on function public.enviar_parte(p_aviso uuid) to service_role;

grant execute on function public.es_admin() to anon;

grant execute on function public.es_admin() to authenticated;

grant execute on function public.es_admin() to service_role;

grant execute on function public.es_equipo() to anon;

grant execute on function public.tecnicos_de_aviso(p_aviso uuid) to anon;

grant execute on function public.es_equipo() to authenticated;

grant execute on function public.tecnicos_de_aviso(p_aviso uuid) to authenticated;

grant execute on function public.es_equipo() to service_role;

grant execute on function public.tecnicos_de_aviso(p_aviso uuid) to service_role;

grant execute on function public.es_gestion() to anon;

grant execute on function public.es_gestion() to authenticated;

grant execute on function public.es_gestion() to service_role;

grant execute on function public.ficha_publica(p_codigo text, p_token text) to anon;

grant execute on function public.ficha_publica(p_codigo text, p_token text) to authenticated;

grant execute on function public.ficha_publica(p_codigo text, p_token text) to service_role;

grant execute on function public.generar_preventivas(p_dias integer) to anon;

grant execute on function public.generar_preventivas(p_dias integer) to authenticated;

grant execute on function public.generar_preventivas(p_dias integer) to service_role;

grant execute on function public.marco_maquinas(p_fecha date) to anon;

grant execute on function public.marco_maquinas(p_fecha date) to authenticated;

grant execute on function public.marco_maquinas(p_fecha date) to service_role;

grant execute on function public.mensaje_completa_puerta() to anon;

grant execute on function public.mensaje_completa_puerta() to authenticated;

grant execute on function public.mensaje_completa_puerta() to service_role;

grant execute on function public.normaliza_ean() to anon;

grant execute on function public.normaliza_ean() to authenticated;

grant execute on function public.normaliza_ean() to service_role;

grant execute on function public.notificar_aviso() to anon;

grant execute on function public.notificar_aviso() to authenticated;

grant execute on function public.notificar_aviso() to service_role;

grant execute on function public.periodicidad_puerta(p_puerta uuid) to anon;

grant execute on function public.periodicidad_puerta(p_puerta uuid) to authenticated;

grant execute on function public.periodicidad_puerta(p_puerta uuid) to service_role;

grant execute on function public.presupuesto_publico(p_token text) to anon;

grant execute on function public.presupuesto_publico(p_token text) to authenticated;

grant execute on function public.presupuesto_publico(p_token text) to service_role;

grant execute on function public.reabrir_asistencia(p_aviso uuid) to anon;

grant execute on function public.reabrir_asistencia(p_aviso uuid) to authenticated;

grant execute on function public.reabrir_asistencia(p_aviso uuid) to service_role;

grant execute on function public.rentabilidad_contratos() to anon;

grant execute on function public.rentabilidad_contratos() to authenticated;

grant execute on function public.rentabilidad_contratos() to service_role;

grant execute on function public.responder_presupuesto(p_token text, p_acepta boolean, p_nombre text, p_motivo text) to anon;

grant execute on function public.responder_presupuesto(p_token text, p_acepta boolean, p_nombre text, p_motivo text) to authenticated;

grant execute on function public.responder_presupuesto(p_token text, p_acepta boolean, p_nombre text, p_motivo text) to service_role;

grant execute on function public.resumen_bajas(p_desde date, p_hasta date) to anon;

grant execute on function public.resumen_bajas(p_desde date, p_hasta date) to authenticated;

grant execute on function public.resumen_bajas(p_desde date, p_hasta date) to service_role;

grant execute on function public.resumen_gestion(p_desde date, p_hasta date) to anon;

grant execute on function public.resumen_gestion(p_desde date, p_hasta date) to authenticated;

grant execute on function public.resumen_gestion(p_desde date, p_hasta date) to service_role;

grant execute on function public.rls_auto_enable() to anon;

grant execute on function public.rls_auto_enable() to authenticated;

grant execute on function public.rls_auto_enable() to service_role;

grant execute on function public.rol_guard() to anon;

grant execute on function public.rol_guard() to authenticated;

grant execute on function public.rol_guard() to service_role;

grant execute on function public.siguiente_contrato() to anon;

grant execute on function public.siguiente_contrato() to authenticated;

grant execute on function public.siguiente_contrato() to service_role;

grant execute on function public.siguiente_expediente() to anon;

grant execute on function public.siguiente_expediente() to authenticated;

grant execute on function public.siguiente_expediente() to service_role;

grant execute on function public.sumar_cuotas() to anon;

grant execute on function public.sumar_cuotas() to authenticated;

grant execute on function public.sumar_cuotas() to service_role;

grant execute on function public.tipos_uds_valido(j jsonb) to anon;

grant execute on function public.tipos_uds_valido(j jsonb) to authenticated;

grant execute on function public.tipos_uds_valido(j jsonb) to service_role;

grant execute on function public.token_contrato() to anon;

grant execute on function public.token_contrato() to authenticated;

grant execute on function public.token_contrato() to service_role;

grant execute on function public.tras_cerrar_preventiva() to anon;

grant execute on function public.tras_cerrar_preventiva() to authenticated;

grant execute on function public.tras_cerrar_preventiva() to service_role;

grant execute on function public.valorar_aviso(p_aviso uuid) to anon;

grant execute on function public.valorar_aviso(p_aviso uuid) to authenticated;

grant execute on function public.valorar_aviso(p_aviso uuid) to service_role;


-- ==========================================================================
-- LOS COMENTARIOS  ·  157
--
-- En este proyecto los comentarios de las tablas y las columnas explican por
-- qué existe cada cosa, y varios cuentan qué se rompió el día que se añadió.
-- Son documentación, no decoración: se llevan también.
-- ==========================================================================

comment on table public.aviso_puertas is 'Las puertas de una obra. Una instalación de varios días suele llevar más de una, y antes solo cabía la de avisos.puerta_id: al dar de alta la segunda, la primera se soltaba sin avisar.';
comment on table public.aviso_tecnicos is 'Los técnicos asignados a una asistencia. El principal sigue estando en avisos.tecnico_id, y también aparece aquí.';

comment on view public.avisos_sin_subtipo is 'Asistencias de un tipo con subtipos que no lo tienen puesto. Lo anterior al 04-11-2026 sale aquí y es normal.';

comment on view public.bajas_material is 'Las bajas de material con su coste, para la oficina. Lleva precios, así que solo devuelve filas a gestión: el técnico la ve vacía.';

comment on table public.centros is 'El sitio donde están las puertas de un cliente: un portal, una nave, un local. Guarda cómo se entra, el horario de acceso, la persona de contacto en el sitio y los avisos de seguridad del sitio, una sola vez para todas sus puertas.';

comment on view public.clientes_sin_ruta is 'Clientes con visitas y sin ruta habitual, ni en su ficha ni en ningún centro suyo. Son los que siguen obligando a elegir la ruta visita a visita.';

comment on view public.comerciales_con_huecos_de_menos is 'Comerciales cerradas en las que se midieron menos huecos de los que la oficina había apuntado. O falta medir, o la oferta no era la que se creía.';

comment on view public.comerciales_sin_medidas is 'Visitas comerciales cerradas sin ninguna medida apuntada: viaje hecho y presupuesto que nadie puede redactar.';

comment on table public.componentes is 'Lo que hay montado en cada puerta, con su marca, modelo y número de serie. Cuelga de la puerta; el expediente guarda su propia copia al emitirse.';

comment on table public.conformidad_visita is 'Lo que el técnico vio de la normativa en una visita concreta: seis puntos críticos, contestados sí / no / no se ha podido comprobar. NO es el expediente de la puerta, que es un documento emitido y firmado: esto es lo que se vio ese día, y por eso lleva fecha y técnico. Desde el 09-11-2026.';

comment on table public.conjunto_lineas is 'Las piezas de la receta. NO guardan precio a propósito: el del material sale de su ficha el día que se use, y el de la hora de la tarifa que le toque a ese cliente. Un precio copiado aquí envejecería a escondidas.';

comment on table public.conjuntos is 'Recetas de venta: «Seccional 3x3 motorizada» con sus materiales y sus horas. No tienen existencias ni etiqueta: lo que se descuenta del almacén son sus materiales, uno a uno.';

comment on table public.contactos is 'Las personas de un cliente: jefe de obra, administrador, quien paga. La oferta va a una de ellas, y queda dicho a cuál.';

comment on table public.entregas_obra is 'La entrega de una puerta terminada: qué se entrega, qué se probó delante del cliente, si quedó conforme y su firma. Si tres meses después dice que el desbloqueo nunca fue, esto es lo que hay que enseñar.';

comment on view public.existencias_material is 'Cuánto hay de cada material en cada sitio. No se guarda: se suma.';

comment on view public.falsos_pendientes is 'Visitas que el técnico cerró como desplazamiento en falso y con las que todavía no se ha vuelto a quedar. Con lo que se le cobra al cliente y lo que le cuesta a la empresa.';

comment on view public.falsos_resumen is 'Los viajes en balde mes a mes: cuántos, cuánto se cobró, cuánto costaron y cuántos siguen sin volver a concertar. El margen sale negativo a propósito: un viaje en balde cuesta dinero aunque se cobre el desplazamiento.';

comment on table public.jornadas is 'Un día de trabajo en una obra que dura varios. No se firma: firmar cuatro veces la misma obra no prueba nada. Lo que se firma es el cierre.';

comment on table public.materiales_previstos is 'Lo que la oficina le dice al técnico que tiene que llevar y montar. El técnico lo ve en su parte y lo pasa a material usado de un toque.';

comment on table public.medidas is 'Toma de medidas de una visita comercial: un hueco por fila. Vive en el aviso, no en puertas: una oferta no vendida no es una puerta. Si se vende, estos datos rellenan el alta de la puerta.';

comment on table public.mensajes is 'Conversación del equipo anclada a una asistencia y a una puerta. No se edita ni se borra: lo único que cambia es la chincheta. El cliente no la ve nunca.';

comment on table public.movimientos_material is 'Toda entrada, salida y traspaso de material. Las existencias se calculan sumando esta tabla: así el número y su explicación no se separan nunca.';

comment on view public.obras_con_remate_pendiente is 'Instalaciones cerradas con algo pendiente y sin una puesta en servicio cerrada: obras entregadas a medias, con el remate sin hacer.';

comment on view public.obras_contra_presupuesto is 'Lo pactado contra lo valorado, trabajo por trabajo. La columna diferencia es lo que se dejaba de facturar cuando el precio del presupuesto no llegaba al circuito de cobro.';

comment on view public.obras_puertas is 'Cuántas puertas lleva cada obra y cuántas actas de entrega tiene firmadas. Para comprobar de un vistazo que no queda ninguna puerta sin entregar.';

comment on view public.otros_trabajos is 'Las visitas registradas como «otros trabajos», con lo que escribió la oficina. Si un trabajo se repite aquí, merece su propio subtipo en vez de seguir en el cajón.';

comment on view public.perifericos_mas_montados is 'Cuántas visitas montaron cada periférico, separando las que fueron avería de las que fueron instalación. Para decidir qué tener en el almacén y en la furgoneta.';

comment on table public.peticiones_material is 'Material que el técnico se ha encontrado y no está en el catálogo. El técnico no crea artículos: manda esto, con descripción, unidad y foto de la caja, y la oficina decide si es un artículo nuevo o uno que ya existía. Decisión de David, 08-11-2026.';

comment on table public.presupuesto_adjuntos is 'Los papeles que acompañan a la oferta: ficha técnica, plano, certificado, folleto. Lo que antes era un párrafo al final del documento.';

comment on table public.presupuesto_envios is 'Un presupuesto se manda más de una vez, y a veces a personas distintas. Cada salida queda apuntada; la nueva no borra la anterior.';

comment on table public.presupuesto_lineas is 'Cada línea guarda su precio, no una referencia al precio de hoy: un presupuesto mandado tiene que seguir diciendo lo que decía.';

comment on table public.presupuesto_visitas is 'Cada apertura del enlace del presupuesto. No dice QUIÉN lo abrió, porque no se puede saber sin pedir permiso: dice cuándo y cuántas veces, que para decidir si toca llamar es lo que hace falta.';

comment on table public.presupuestos is 'Ofertas a clientes. Los importes se congelan al emitir: una oferta mandada no puede cambiar sola porque cambie una tarifa.';

comment on table public.proveedores is 'A quién se le compra. Con su teléfono y su plazo: pedir no debería obligar a buscar el contacto en el correo de hace seis meses.';

comment on view public.remates_por_causa is 'Qué cuestan al año las puestas en servicio, agrupadas por la causa que dejó la obra sin terminar. El coste se apunta aunque no se facture.';

comment on table public.telegram_enviados is 'Qué avisos al grupo ya han salido, para no repetirlos. Lo escribe la función de avisos. Borrar una fila de aquí hace que ese aviso pueda volver a salir.';

comment on table public.textos_presu is 'Párrafos reutilizables para los presupuestos. Destino dice en qué campo se pegan: lo que propone, las condiciones comerciales o los anexos.';

comment on table public.ubicaciones is 'La nave y las furgonetas. Una existencia es una cantidad EN un sitio.';

comment on view public.urgencias_por_modo is 'Las urgencias cerradas, agrupadas por lo que eligió la oficina: cuántas, qué factor llevaban, cuánto se facturó y qué margen dejaron. Las de antes del 07-11-2026 salen como «sin indicar».';

comment on view public.urgencias_sin_factor is 'Urgencias cerradas sin factor de recargo. Las anteriores al 04-11-2026 salen aquí y es normal: se valoran con el porcentaje de antes.';

comment on view public.visitas_sin_ficha_de_puerta is 'Visitas cerradas sin ninguna puerta con ficha y sin declarar que no había puerta. Casi todas son de antes del 05-11-2026: son las puertas que se repararon y nunca entraron en la aplicación.';

comment on view public.visitas_sin_foto is 'Visitas cerradas desde el 07-11-2026 sin ninguna foto de la visita. Los viajes en balde no cuentan: ahí no se ha podido ver nada. Las anteriores tampoco, porque entonces no se pedían.';

comment on view public.visitas_sin_puerta is 'Visitas cerradas declarando que no se trabajó sobre ninguna puerta. Es la salida al alta obligatoria: se mira para que no se convierta en la norma.';

comment on column public.articulos.proveedor is 'El nombre escrito a mano, de antes de que los proveedores tuvieran ficha. Se conserva para no perder lo tecleado; lo que manda es proveedor_id.';

comment on column public.articulos.codigo is 'Código propio del material, formato MAT-0001. Es el número visible de su etiqueta QR y lo que se escanea para dar entrada o salida.';

comment on column public.articulos.token is 'Cuatro caracteres que van dentro del QR y no a la vista, igual que en las etiquetas de las puertas: sin ellos, cualquiera podría adivinar la URL.';

comment on column public.articulos.minimo is 'Existencias por debajo de las cuales el almacén avisa de que hay que comprar.';

comment on column public.articulos.ubicacion is 'En qué parte del almacén está guardado: «estantería B, balda 3», «cajón de la puerta izquierda». Antes decía «dónde está en la nave», y desde el 08-11-2026 el almacén va aparte, en ubicacion_id, porque ya no hay una sola nave: hay nave, furgonetas y los sitios que cree la oficina.';

comment on column public.articulos.ean is 'Código de barras del fabricante, el de la caja: EAN-13, EAN-8, UPC-A o Code 128. Se guarda normalizado, sin espacios ni guiones, y los EAN-13 siempre con sus trece cifras (un UPC-A de doce se rellena con un cero por delante, porque es el mismo código). Al leer una caja se busca por aquí.';

comment on column public.articulos.detalle is 'La explicación que lee el cliente en el presupuesto: marca, modelo, medidas, materiales, qué incluye y qué norma cumple. Se escribe una vez y se repite sola en cada oferta donde aparezca el artículo.';

comment on column public.articulos.foto_ruta is 'Foto del producto, en el cubo «ofertas». Va ahí y no en «fotos» porque la ve el cliente desde el enlace de su presupuesto, sin haber entrado en la aplicación.';

comment on column public.articulos.precio_venta is 'Precio de venta fijo. Si está puesto manda sobre el cálculo de coste más recargo: hay material que se vende a precio de tarifa del fabricante y no a lo que a ti te salga.';

comment on column public.articulos.ubicacion_id is 'En qué almacén se guarda habitualmente este material: la nave, una furgoneta, el taller. Lo pone la oficina en la ficha. NO es dónde está ahora: eso sale de los movimientos. Desde el 08-11-2026.';

comment on column public.aviso_puertas.orden is 'En qué orden se enseñan. La 1 es la principal, la que sigue estando en avisos.puerta_id y la que sale en la tarjeta y en los documentos.';

comment on column public.avisos.cobrado is 'El técnico cobró esta visita EN OBRA. No quiere decir que esté facturada: la factura la hace la oficina después.';

comment on column public.avisos.parte_enviado_el is 'Cuándo salió la copia del parte al cliente. Lo escribe la función de correo cuando el envío se acepta de verdad, no cuando se pide.';

comment on column public.avisos.obra_larga is 'La asistencia dura más de un día. Al marcarlo, el técnico cierra jornadas en vez de cerrar la visita, y la firma del cliente se guarda para el final.';

comment on column public.avisos.presupuesto_id is 'El presupuesto del que nació este trabajo. El importe no se copia: se lee del presupuesto, donde quedó congelado al emitirlo. Así el precio pactado y el calculado se ven juntos a la hora de facturar.';

comment on column public.avisos.ruta is 'ruta1..ruta5, o km para lo que cae fuera. Vacío en una visita nueva: se valora como ruta1, que es la decisión que tomó David el 02-11-2026.';

comment on column public.avisos.subtipo is 'Qué clase de trabajo es dentro de su tipo: averia/garantia en la correctiva; puerta_automatica, puerta_manual, puerta_peatonal, automatismo o normativa en la instalación. Vacío en los tipos que no tienen subtipo, y en todo lo anterior al 04-11-2026.';

comment on column public.avisos.tipos_puerta is 'Tipos de puerta sobre los que se trabaja, cuando no salen de una ficha: automatismo, normativa y comercial. No sustituye a las puertas dadas de alta de la asistencia: es para lo que todavía no existe en la aplicación.';

comment on column public.avisos.urgencia_factor is 'Por cuánto se multiplican la hora y el desplazamiento en esta urgencia: 2 en horario laboral, 3 fuera de horario, fin de semana y festivos. Vacío: se valora como antes del 04-11-2026, con el porcentaje de Tarifas.';

comment on column public.avisos.instalacion_id is 'En una puesta en servicio, la instalación de la que viene este remate. Vacío solo en las obras antiguas que no están en la aplicación.';

comment on column public.avisos.ps_causa is 'Por qué no se pudo terminar la obra en su día: sin_corriente, albanileria, remates, material_cli, nuestra, otra. Es lista cerrada para poder contar cuántas obras se retrasan por cada motivo.';

comment on column public.avisos.ps_causa_detalle is 'La causa en palabras. Obligatoria en la aplicación cuando la causa es «otra».';

comment on column public.avisos.repercutible is 'Solo en las puestas en servicio: la oficina dice que este viaje se le cobra al cliente, porque la obra se quedó parada por su causa. Sin esto, la puesta en servicio se valora en cero. Lo marca gestión a mano, nunca la aplicación.';

comment on column public.avisos.sin_puerta is 'El técnico declara que en esta visita no ha trabajado sobre ninguna puerta, así que no hay ficha que dar de alta. Es la única salida al bloqueo del cierre, y exige motivo en la aplicación.';

comment on column public.avisos.sin_puerta_motivo is 'Por qué no había puerta sobre la que trabajar. Sin esto, la casilla anterior sería un botón de saltarse el alta.';

comment on column public.avisos.tipos_uds is 'En una comercial, cuántas puertas de cada tipo entran en la oferta: [{"tipo":"Seccional","uds":3}]. Vacío significa una de cada tipo de avisos.tipos_puerta, que es lo que significaba antes del 06-11-2026. De aquí salen los huecos que el parte pide medir.';

comment on column public.avisos.perifericos is 'En el subtipo «perifericos», qué elementos se montan en esta visita. Varios a la vez, porque lo normal es montar dos fotocélulas y una banda en el mismo viaje. De aquí sale la cuenta de qué periférico se pone más.';

comment on column public.avisos.perifericos_otro is 'Qué es ese «otro periférico» que no está en la lista. Obligatorio en la aplicación cuando se marca «otro»: «otro» sin explicación no dice nada a nadie dentro de seis meses.';

comment on column public.avisos.subtipo_detalle is 'Lo que la oficina escribe cuando el subtipo es «otros trabajos». Es la salida para lo que no entra en ninguna de las opciones, no un cajón de sastre: si un trabajo se repite aquí, merece su propio subtipo.';

comment on column public.avisos.urgencia_modo is 'Qué eligió la oficina al crear una urgencia: fuera (fuera de horario), urgente (urgencia en horario) o ambas. De aquí sale urgencia_factor, que es lo que multiplica valorar_aviso. Las urgencias anteriores al 07-11-2026 no lo tienen: su factor lo había calculado la aplicación con la hora de llegada y se queda como estaba.';

comment on column public.avisos.falso is 'El técnico llegó y no se pudo trabajar: no había nadie, el acceso estaba cerrado, la puerta no era de ese cliente. Lo marca él al cerrar el parte, en cualquier tipo de visita. Se cobra el desplazamiento y nada más.';

comment on column public.avisos.falso_motivo is 'Qué se encontró, con las palabras del técnico. Obligatorio: un viaje en balde sin explicación no se le puede reclamar a nadie ni se puede evitar la próxima vez.';

comment on column public.avisos.falso_resuelto is 'La oficina ya ha vuelto a quedar con el cliente. Mientras esté en false, la visita sale en la lista de las que hay que volver a concertar.';

comment on column public.avisos.falso_nueva_id is 'La visita nueva que sustituye a esta, si se creó desde el panel. Deja el rastro de cuántos viajes costó de verdad ese trabajo.';

comment on column public.centros.ruta is 'Ruta de esta dirección concreta: ruta1..ruta5, o km. Vacío: se usa la del cliente. Manda sobre la del cliente porque la ruta depende de dónde se conduce, no de quién paga.';

comment on column public.clientes.plazo_pago_dias is 'Días desde la fecha de factura hasta su vencimiento, para este cliente. Vacío: al contado.';

comment on column public.clientes.ruta is 'Ruta habitual de este cliente: ruta1..ruta5, o km. Vacío: no tiene. Se propone al crear la asistencia y al cerrar el parte si no hay otra puesta; lo que se cobra sale siempre de avisos.ruta, no de aquí.';

comment on column public.conformidad_visita.puntos is 'Las respuestas, por clave de EXP_COMPROBACIONES: {"marcado":"si", "presencia":"no", "manual":"nd"}. «nd» es no se ha podido comprobar, y existe a propósito: sin esa salida el técnico con prisa marca «sí».';

comment on column public.conformidad_visita.fallos is 'Cuántos puntos se contestaron «no». Se guarda calculado para poder listar las puertas con incumplimientos sin abrir el jsonb de cada fila.';

comment on column public.conformidad_visita.quien is 'El nombre del técnico el día de la visita. Se guarda escrito, además del identificador, porque un parte entregado al cliente no se reescribe si mañana se corrige el nombre en Equipo.';

comment on column public.contactos.principal is 'El que sale propuesto al mandar. No impide elegir otro ni escribir una dirección a mano.';

comment on column public.entregas_obra.pruebas is 'Cada función probada con su resultado. El guión sale de los ajustes, por tipo de puerta, y se edita en Equipo.';

comment on column public.entregas_obra.conformidad is 'conforme | con_reparos | no_conforme. Con reparos existe a propósito: un cliente que firma con una pega anotada no es lo mismo que uno que no firma, y obligarle a elegir entre sí y no falsea las dos cosas.';

comment on column public.fotos.aviso_id is 'De qué visita es la foto. La misma foto puede llevar también puerta_id: así aparece en el parte y en la ficha de la puerta sin hacerla dos veces.';

comment on column public.fotos.etapa is 'Qué cuenta la foto: lo encontrado al llegar, lo hecho al terminar, la pieza sustituida, u otra cosa. De aquí sale el orden en que se enseñan.';

comment on column public.jornadas.proxima is 'Lo que hay que saber antes de volver: qué queda, qué falta traer, con quién hay que hablar. Sale en pantalla al abrir la asistencia.';

comment on column public.jornadas.km is 'Kilómetros de la salida de ese día. Se suman al cerrar la obra, igual que las horas: un desplazamiento por jornada, no uno por obra.';

comment on column public.materiales.articulo_id is 'Si la línea sale del almacén, de qué artículo. Lo que se escribe a mano sigue valiendo y va sin artículo: no todo lo que se usa está en el catálogo.';

comment on column public.materiales.jornada_id is 'En qué jornada se gastó. Vacío en las visitas de un solo día, que son la mayoría: ahí el material es de la visita y punto.';

comment on column public.medidas.ubicacion is 'Dónde está el hueco, en palabras del técnico. Ej.: «nave trasera, portón izquierdo». Es lo que distingue un hueco de otro en el presupuesto.';

comment on column public.medidas.tipo_puerta is 'Tipo de puerta previsto para ese hueco. Sale de los tipos que la oficina marcó al crear la visita, y el técnico lo puede cambiar delante del hueco.';

comment on column public.medidas.ancho_mm is 'Ancho del HUECO en mm, no de la hoja.';

comment on column public.medidas.alto_mm is 'Alto del HUECO en mm, no de la hoja.';

comment on column public.medidas.dintel_mm is 'Espacio libre por encima del hueco, en mm. Es lo que decide si cabe una seccional y con qué tipo de guía.';

comment on column public.medidas.lateral_mm is 'Espacio libre a un lado del hueco, en mm. Es lo que decide si cabe una corredera y hacia dónde abre.';

comment on column public.medidas.situacion is 'Qué hay hoy en el hueco: hueco vacío, puerta manual que se sustituye, puerta automática que se sustituye, u otra cosa. Cambia el precio: quitar lo viejo y llevárselo también se cobra.';

comment on column public.medidas.electricidad is 'Acometida eléctrica: existe, hay que llevarla, o por comprobar. Una acometida que hay que llevar y no se ofertó la paga la empresa.';

comment on column public.medidas.auxiliares is 'Lo que hace falta además de la puerta, en texto libre: fotocélulas, mandos, lector, semáforo, banda, electrocerradura, pulsador... Pasa al presupuesto tal y como lo escribe el técnico.';

comment on column public.medidas.sin_medir is 'El técnico no ha podido medir ese hueco. Con esto marcado se puede cerrar la visita sin ancho ni alto, pero hay que decir por qué.';

comment on column public.medidas.fijos is 'Qué fijos lleva el hueco además de la puerta: ninguno, fijo ciego, fijo practicable (se abre como una hoja más), fijo superior, o varios. En una peatonal es parte del precio y del montaje, y es lo que más se olvida ofertar.';

comment on column public.medidas.fijos_mm is 'Ancho total de los fijos, en mm. Se oferta aparte de la puerta, así que hace falta su medida, no solo saber que los lleva.';

comment on column public.mensajes.fijado is 'Mensaje que hay que saber antes de ir. Sale arriba del hilo, aparece en la Vida de la puerta y hace sonar el grupo de Telegram.';

comment on column public.mensajes.quien is 'El nombre escrito tal cual en el momento de enviarlo. Se guarda aparte del perfil a propósito: si mañana ese técnico se da de baja, el mensaje sigue diciendo quién lo escribió.';

comment on column public.movimientos_material.motivo is 'Qué movimiento es. Las bajas van separadas a propósito: baja_roto dice que el material no aguantó, baja_perdido que se quedó por el camino, y son dos problemas distintos que se arreglan de maneras distintas. «baja», sin más, es el motivo viejo de antes del 08-11-2026 y solo existe en el histórico.';

comment on column public.movimientos_material.creado_por_id is 'Quién hizo el movimiento, de verdad. «creado_por» guarda su nombre para leerlo de un vistazo; esta columna es la que aguanta si hay dos personas con el mismo nombre o alguien se lo cambia.';

comment on column public.perfiles.nombre is 'Como se llama esta persona. Sale en el parte que firma el cliente, en el reparto del calendario y en la columna «Quién» de los movimientos de almacén. Se puede cambiar desde Oficina > Equipo desde el 08-11-2026; lo ya guardado en partes y movimientos no cambia, porque allí quedó escrito.';

comment on column public.peticiones_material.ean is 'El código de barras que leyó el técnico, si lo leyó. Cuando la oficina crea el artículo, este código se le queda atado y la próxima caja igual se reconoce sola.';

comment on column public.peticiones_material.foto_ruta is 'La foto de la caja, en el almacén privado de fotos. Es obligatoria: sin ella la oficina no puede saber qué era sin llamar al técnico.';

comment on column public.peticiones_material.articulo_id is 'El artículo que ha salido de la petición: el nuevo que creó la oficina, o el que ya existía si era lo mismo con otro nombre.';

comment on column public.presupuesto_adjuntos.publico is 'true: el cliente lo ve y lo descarga desde su enlace. false: se queda en la oficina, por ejemplo el presupuesto del proveedor.';

comment on column public.presupuesto_lineas.tipo is 'material | mano_obra | desplazamiento | texto | capitulo. Un capítulo abre un grupo de líneas y lleva su propio subtotal en el documento.';

comment on column public.presupuesto_lineas.referencia is 'El código con el que se identifica: el del almacén, o el del fabricante.';

comment on column public.presupuesto_lineas.detalle is 'La explicación larga que va debajo del nombre, en letra más pequeña. Lo que convence al que lee, frente al concepto escueto que solo identifica.';

comment on column public.presupuesto_lineas.dto is 'Descuento de esta línea en tanto por ciento. El importe se guarda ya con él aplicado: el porcentaje está para que salga impreso, no para recalcular.';

comment on column public.presupuesto_lineas.variante is 'Para mano de obra: particular | retail | industria. Para desplazamiento: ruta1 | ruta2 | ruta3 | km. Guardar el importe sin guardar de dónde sale deja a cualquiera, medio año después, sin saber por qué se cobró eso.';

comment on column public.presupuesto_lineas.km is 'Kilómetros SOLO DE IDA cuando la variante es «km». El importe ya lleva la ida y la vuelta: se guarda la ida porque es el dato que se mira en el mapa.';

comment on column public.presupuestos.estado is 'borrador: se está montando. emitido: cerrado y con referencia, pero todavía no ha salido de la casa. enviado: ya se le mandó al cliente, y enviado_a dice a dónde. Luego aceptado | rechazado, y convertido cuando se abrió el trabajo. Caducado no se guarda: se mira la fecha.';

comment on column public.presupuestos.token is 'Lo que lleva el enlace y el QR que se le manda al cliente para que acepte. No es una contraseña: es lo único que hay, así que solo va en su correo.';

comment on column public.presupuestos.coste is 'Lo que cuesta a la empresa lo ofertado. Para ver el margen ANTES de mandarlo, que es cuando se puede corregir. No sale en el documento del cliente.';

comment on column public.presupuestos.anexos is 'SIN USO desde el 25-10-2026: los anexos pasaron a ser ficheros, en presupuesto_adjuntos. Lo que había escrito se movió a condiciones.';

comment on column public.presupuestos.enviado_a is 'A dónde se mandó: el correo, el teléfono o «entregado en mano». Si está vacío y el estado es enviado, es que se mandó antes de que esto existiera.';

comment on column public.presupuestos.firma_ruta is 'La firma del cliente en el cubo privado «firmas». Vale más que un nombre tecleado por quien recogió la aceptación, y por eso se guarda aparte.';

comment on column public.presupuestos.subtitulo is 'SIN USO desde el 25-10-2026: título y subtítulo decían lo mismo y se dejó uno solo. La columna se queda vacía para no borrar una columna por gusto.';

comment on column public.proveedores.plazo_dias is 'Lo que tarda en servir. Sirve para no prometer al cliente una fecha que depende de un material que todavía no ha salido de su almacén.';

comment on column public.puertas.peso_kg is 'Peso de la hoja. Ya NO se pide en la ficha desde el 01-11-2026: en obra no hay báscula y nadie lo rellenaba. Lo que esté anotado se conserva y se sigue imprimiendo; para saber si el motor va sobrado se usa arrastre_kg.';

comment on column public.puertas.centro_id is 'Centro (sitio) donde está la puerta. Opcional: una puerta suelta no lo necesita.';

comment on column public.puertas.matricula is 'Placa de características de la puerta, copiada tal cual: marca, modelo, número de serie y año. La del motor y la del cuadro van en «componentes».';

comment on column public.puertas.sin_matricula is 'Por qué no hay matrícula: sin placa, ilegible, pintada, perdida. Se exige escribir el motivo en vez de dejar el dato en blanco.';

comment on column public.puertas.modo is 'Modo de accionamiento de la puerta. Claves de la aplicación: hombre_presente, impulso_vista, impulso_sin_vista, automatico. Manda sobre lo que diga el expediente, que es la foto del día en que se emitió.';

comment on column public.puertas.usuarios is 'Tipo de usuario. Claves de la aplicación: informados_privado, informados_publico, no_informados.';

comment on column public.puertas.dintel_mm is 'Altura libre entre el hueco y el techo, en milímetros. Decide el tipo de guía en todo lo que sube: seccional, enrollable, vertical, rápida y basculante. En una corredera o una batiente no se pide, porque ahí no decide nada.';

comment on column public.puertas.ficha_tocada_por is 'Quién completó esta ficha DESPUÉS de que el cliente firmara un parte de esa puerta. Vacío en la mayoría: solo se escribe cuando había firma.';

comment on column public.puertas.ficha_tocada_el is 'Cuándo se completó. Sirve para distinguir lo que se tomó en obra de lo que se remató en la oficina.';

comment on column public.puertas.arrastre_kg is 'Arrastre máximo del motor, en kg, copiado de su placa o de su ficha. Sustituye al peso de la hoja, que en obra no se puede pesar.';

comment on column public.puertas.vueltas_muelle is 'Vueltas de los muelles de torsión. Se pide solo en las seccionales, que es donde decide el equilibrado y donde hace falta para pedir el repuesto. Admite medias vueltas.';

comment on column public.puertas.otros_elementos is 'Más elementos a identificar: lo que el técnico ve en su inspección y considera relevante de ESA puerta. Texto libre a propósito: desglosar herraje por herraje alargaba la gestión del documento sin añadir nada, porque la puerta sin automatismo se trata como un todo.';

comment on column public.puertas.anio_desconocido is 'El año de la puerta se preguntó y no se sabe. Es un dato tomado, no un hueco sin rellenar: con esto marcado la ficha deja de pedirlo.';

comment on column public.puertas.instalador_desconocido is 'Quién instaló la puerta se preguntó y no se sabe. Lo normal en puertas antiguas, sin placa y sin nadie que lo recuerde.';

comment on column public.tarifas.precio_hora is 'El precio de hora de siempre. Se conserva como el de referencia y como red de seguridad: si alguna de las tres tarifas está sin rellenar, se usa este.';

comment on column public.tarifas.desplazamiento_fijo is 'El importe de salida de siempre. Se conserva como red de seguridad cuando una ruta está sin rellenar.';

comment on column public.tarifas.precio_hora_particular is 'Lo que se cobra la hora en vivienda y comunidad.';

comment on column public.tarifas.precio_hora_retail is 'Lo que se cobra la hora en comercio, oficina y empresa de servicios.';

comment on column public.tarifas.precio_hora_industria is 'Lo que se cobra la hora en nave, polígono y administración.';

comment on column public.tarifas.ruta1_coste is 'Lo que cuesta esa salida en combustible, vehículo y tiempo muerto. Sin esto el margen sale más alto de lo que es.';

comment on column public.tarifas.ruta4_importe is 'Lo que se cobra por esa salida. Vacío: la ruta no está valorada y la aplicación no la ofrece.';

comment on column public.tarifas.urgencia_x_laboral is 'Por cuánto se multiplican hora y desplazamiento en una urgencia dentro del horario laboral. David, 04-11-2026: 2.';

comment on column public.tarifas.urgencia_x_fuera is 'Lo mismo fuera de horario, en fin de semana y en festivos. David: 3.';

comment on column public.tarifas.urgencia_desde is 'Hora a la que empieza el horario laboral, de lunes a viernes. David: 8.';

comment on column public.tarifas.urgencia_hasta is 'Hora a la que acaba. David: 18. A partir de ella, y hasta urgencia_desde del día siguiente, la urgencia va al factor de fuera de horario.';

comment on column public.tarifas.urgencia_x_uno is 'Multiplicador cuando la visita es urgente O fuera de horario, una de las dos cosas. Por defecto 2.';

comment on column public.tarifas.urgencia_x_dos is 'Multiplicador cuando es urgente Y fuera de horario a la vez. Por defecto 3.';

comment on column public.ubicaciones.nota is 'Para qué es este almacén, escrito por la oficina. Ej.: «contenedor de la obra de Jerez, hasta marzo».';

comment on column public.ubicaciones.orden is 'En qué orden se enseñan. La nave primero, las furgonetas después.';

comment on column public.valoraciones.vence_el is 'Fecha en que había que tener cobrada la factura. Sale del plazo del cliente, y se puede cambiar a mano.';

comment on column public.valoraciones.cobrado_el is 'Cuándo se cobró LA FACTURA. No es lo mismo que avisos.cobrado, que es lo que el técnico cobró en obra.';


-- ============================================================================
-- LA SEMILLA MÍNIMA  ·  2
--
-- Dos filas, y solo dos. No son datos de la empresa: son filas que la
-- aplicación da por hechas y sin las cuales no arranca del todo.
--
--   · tarifas, la fila 1. La aplicación lee UNA fila de tarifas; si no hay
--     ninguna, Gestión sale diciendo que no se han podido leer las tarifas y
--     no deja pasar de ahí. Se crea vacía: los precios los pones tú desde
--     Oficina → Gestión → Tarifas.
--
--   · ubicaciones, la nave. Una existencia de material es una cantidad EN un
--     sitio, y el sitio de partida es la nave. Sin ella el almacén no tiene
--     dónde meter nada.
--
-- Las dos son «si no existe ya»: ejecutar esto dos veces no duplica nada.
-- ============================================================================

insert into public.tarifas (id) values (1) on conflict (id) do nothing;

insert into public.ubicaciones (nombre, tipo)
select 'Nave', 'nave'
where not exists (select 1 from public.ubicaciones where tipo = 'nave');


-- ============================================================================
-- COMPROBACIÓN
--
-- Lo primero cuenta lo que ha quedado montado. Lo segundo enseña los siete
-- almacenes de ficheros, que tienen que salir los siete, con «publico» en true
-- SOLO en «publicos» y «ofertas».
--
-- Los números que tienen que salir están en el LEEME de la entrega. Si alguno
-- no cuadra, algo ha fallado por el camino: avísame antes de usar la base.
-- ============================================================================

select 'tablas'        as cosa, count(*) as cuantas from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'
union all select 'vistas',        count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'v'
union all select 'columnas',      count(*) from information_schema.columns where table_schema = 'public'
union all select 'funciones',     count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' and p.oid not in (select objid from pg_depend where deptype = 'e')
union all select 'indices',       count(*) from pg_indexes where schemaname = 'public'
union all select 'restricciones', count(*) from pg_constraint co join pg_class c on c.oid = co.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and co.contype in ('p','u','f','c')
union all select 'politicas',     count(*) from pg_policies where schemaname = 'public'
union all select 'disparadores',  count(*) from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not tg.tgisinternal
union all select 'comentarios',   count(*) from pg_description d join pg_class c on c.oid = d.objoid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
order by 1;

select
  b.id     as almacen,
  b.public as publico,
  (select count(*) from pg_policies p
    where p.schemaname = 'storage' and p.tablename = 'objects'
      and (coalesce(p.qual,'') like '%bucket_id = ''' || b.id || '''%'
        or coalesce(p.with_check,'') like '%bucket_id = ''' || b.id || '''%')) as politicas
from storage.buckets b
where b.id in ('fotos','documentos','expedientes','firmas','equipo','publicos','ofertas')
order by b.public desc, b.id;
