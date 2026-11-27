-- ================================================================
-- Pruebas de servidor/cobro-en-obra.sql, contra Postgres de verdad.
--
-- QUÉ SE VIGILA, Y POR QUÉ CADA COSA
--
--  1. Que el total sea la base más su IVA, y que la base sea lo mismo que
--     tiene apuntado la valoración. Si esto se separa, el técnico cobra una
--     cantidad y la oficina factura otra, y la diferencia se descubre con el
--     cliente delante.
--
--  2. Que el desglose sean los tres conceptos de VENTA: mano de obra,
--     desplazamiento y materiales. Es lo que pidió David y es lo que el
--     cliente va a preguntar.
--
--  3. Que NO salga el coste ni el margen. Esto es lo que más importa de este
--     fichero. La función la llama la pantalla del técnico, y el técnico no
--     ve precios de coste ni márgenes: es una regla de la casa, no un detalle.
--     Se comprueba de dos maneras, por si una se queda corta: que el json no
--     traiga esas claves, y que no estén ni escritas en la definición de la
--     función.
--
--  4. Que un técnico NO pueda preguntar por una visita que no es suya. Sin
--     esto, la función sería una ventana a los importes de toda la empresa
--     desde cualquier móvil, y daría igual lo que esconda la pantalla.
--
--  5. Que una visita que se valora en cero (una comercial) devuelva cero y no
--     se invente nada.
--
-- 27-11-2026
-- ================================================================

do $$
declare
  v_cli uuid; v_pta uuid; v_av uuid; v_com uuid;
  v_tec uuid := '11111111-1111-1111-1111-111111111111';
  v_otro uuid := '22222222-2222-2222-2222-222222222222';
  j json; v_base numeric; v_total numeric; v_def text; n int;
begin
  -- Tarifa conocida: 45 la hora, 25 de desplazamiento, IVA 21
  insert into public.tarifas (id, precio_hora, coste_hora, desplazamiento_fijo, iva)
    values (1, 45, 25, 25, 21)
    on conflict (id) do update set precio_hora = 45, coste_hora = 25,
      desplazamiento_fijo = 25, iva = 21;

  -- Los dos técnicos de la prueba tienen que existir como perfiles: aviso_tecnicos
  -- lleva clave ajena a perfiles, y con razón.
  insert into public.perfiles (id, nombre, rol, activo)
    values (v_tec, 'Técnico de la visita', 'tecnico', true)
    on conflict (id) do nothing;
  insert into public.perfiles (id, nombre, rol, activo)
    values (v_otro, 'Otro técnico', 'tecnico', true)
    on conflict (id) do nothing;

  insert into public.clientes (nombre) values ('Cliente del cobro en obra')
    returning id into v_cli;
  insert into public.puertas (cliente_id, codigo) values (v_cli, 'AR-COBRO')
    returning id into v_pta;

  -- Una avería de dos horas, asignada al técnico de la prueba
  insert into public.avisos (tipo, subtipo, estado, cliente_id, puerta_id, tecnico_id,
                             horas, num_tecnicos, descripcion)
    values ('averia', 'averia', 'asignado', v_cli, v_pta, v_tec, 2, 1, 'No cierra')
    returning id into v_av;

  -- 1 y 2. El desglose y el IVA
  j := public.cobro_en_obra(v_av);
  if j is null then raise exception 'La función no ha devuelto nada para una visita normal'; end if;

  v_base  := (j->>'base')::numeric;
  v_total := (j->>'total')::numeric;

  select imp_total into v_base from public.valoraciones where aviso_id = v_av;
  if v_base is null then raise exception 'No se ha escrito la valoración'; end if;
  if (j->>'base')::numeric <> round(v_base, 2) then
    raise exception 'La base que se le da al técnico (%) no es la de la valoración (%)',
      j->>'base', v_base;
  end if;
  raise notice 'la base que ve el técnico es la misma que tiene la valoración';

  if (j->>'total')::numeric
     <> round(v_base + round(v_base * (j->>'tipo_iva')::numeric / 100, 2), 2) then
    raise exception 'El total (%) no es la base más su IVA', j->>'total';
  end if;
  raise notice 'y el total es la base más su IVA, al tipo de la tarifa';

  if (j->>'mano') is null or (j->>'desplazamiento') is null or (j->>'materiales') is null then
    raise exception 'Falta alguno de los tres conceptos del desglose';
  end if;
  if (j->>'desplazamiento')::numeric <= 0 then
    raise exception 'El desplazamiento tendría que venir con importe, y viene %',
      j->>'desplazamiento';
  end if;
  raise notice 'el desglose trae mano de obra, desplazamiento y materiales';

  -- 3. Ni coste ni margen. Primero, en lo que devuelve
  if (j->>'coste_total') is not null or (j->>'margen') is not null
     or (j->>'coste') is not null then
    raise exception 'La función le está dando al técnico el coste o el margen: %', j::text;
  end if;
  raise notice 'no devuelve ni coste ni margen';

  -- Y después, en la propia definición: que no estén ni escritos como clave
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'cobro_en_obra';
  if v_def like '%''margen'',%' or v_def like '%''coste%'',%' then
    raise exception 'La definición de la función devuelve coste o margen en el json';
  end if;
  raise notice 'y no están ni escritos como clave en la función';

  -- 4. La visita de otro. Se entra como técnico ajeno: ni gestión, ni el suyo
  create or replace function public.es_gestion() returns boolean
    language sql stable as $f$ select false $f$;
  perform set_config('request.jwt.claim.sub', v_otro::text, true);
  j := public.cobro_en_obra(v_av);
  if j is not null then
    raise exception 'Un técnico ajeno ha podido ver el importe de una visita que no es suya: %',
      j::text;
  end if;
  raise notice 'un técnico NO puede ver el importe de una visita que no es suya';

  -- Y el que la tiene asignada, sí
  perform set_config('request.jwt.claim.sub', v_tec::text, true);
  j := public.cobro_en_obra(v_av);
  if j is null then raise exception 'El técnico de la visita tendría que poder verlo'; end if;
  raise notice 'pero el técnico que la tiene asignada, sí';

  -- Y el segundo técnico de la visita, también
  perform set_config('request.jwt.claim.sub', v_otro::text, true);
  insert into public.aviso_tecnicos (aviso_id, tecnico_id) values (v_av, v_otro);
  j := public.cobro_en_obra(v_av);
  if j is null then raise exception 'El segundo técnico de la visita tendría que poder verlo'; end if;
  raise notice 'y el segundo técnico de esa visita, también';

  -- Se deja es_gestion como estaba en el andamio
  create or replace function public.es_gestion() returns boolean
    language sql stable as $f$ select true $f$;
  perform set_config('request.jwt.claim.sub', '', true);

  -- 5. Una comercial vale cero, y lo dice
  insert into public.avisos (tipo, estado, cliente_id, tecnico_id, horas, descripcion)
    values ('comercial', 'asignado', v_cli, v_tec, 2, 'Ofertar')
    returning id into v_com;
  j := public.cobro_en_obra(v_com);
  if j is null then raise exception 'Una comercial tendría que devolver cero, no nada'; end if;
  if (j->>'total')::numeric <> 0 then
    raise exception 'Una comercial no se cobra, y devuelve %', j->>'total';
  end if;
  raise notice 'una comercial devuelve cero, que es lo que se le cobra';

  -- Se deja limpio
  delete from public.aviso_tecnicos where aviso_id = v_av;
  delete from public.valoraciones where aviso_id in (v_av, v_com);
  delete from public.avisos where id in (v_av, v_com);
  delete from public.puertas where id = v_pta;
  delete from public.clientes where id = v_cli;
  delete from public.perfiles where id in (v_tec, v_otro);
end $$;
