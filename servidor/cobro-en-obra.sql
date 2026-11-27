-- ================================================================
-- SAFE2DOOR · LO QUE EL TÉCNICO TIENE QUE COBRAR, CON IVA
--
-- QUÉ RESUELVE
--
-- David, 25-11-2026: «Para un cobro en obra, al técnico le debe de sacar el
-- importe a pagar más IVA, en función de horas, desplazamiento y materiales
-- (en el caso de que existan).»
--
-- Hasta hoy el técnico que cobraba en obra escribía el importe a mano. Lo
-- sacaba de donde podía: de lo que le había dicho la oficina por teléfono, de
-- lo que cobró en una visita parecida, o de su cabeza. Y lo que cobraba no
-- tenía por qué coincidir con lo que la oficina iba a facturar, así que
-- después había que cuadrar la diferencia con el cliente delante.
--
-- POR QUÉ HACE FALTA UNA FUNCIÓN Y NO BASTA CON LEER LA TABLA
--
-- Porque el técnico NO puede leer los importes, y eso es a propósito: las
-- tablas «tarifas» y «valoraciones» solo las lee es_gestion(), o sea la oficina
-- y la administración. Ahí está el precio por hora, el coste por hora y el
-- margen de cada visita, y eso no es asunto del técnico.
--
-- Esta función es la excepción justa: devuelve lo que hay que pedirle al
-- cliente en esa visita, y nada más. No devuelve el coste, ni el margen, ni la
-- tarifa. Y solo de SU visita.
--
-- QUÉ DEVUELVE, Y QUÉ NO
--
--   SÍ:  mano de obra, desplazamiento y materiales, los tres a precio de VENTA,
--        la base, el tipo de IVA, el IVA y el total a cobrar.
--   NO:  coste_total ni margen. No se devuelven en ningún caso ni para nadie,
--        porque esta función es la que usa la pantalla del técnico y un dato
--        que no se manda no se puede filtrar por error.
--
-- QUIÉN PUEDE LLAMARLA
--
--   · La oficina y la administración, para cualquier visita.
--   · Un técnico, SOLO para una visita que tenga asignada: la que lleva su
--     nombre, o una en la que esté como segundo técnico. Si pregunta por otra,
--     devuelve nulo. Sin esto, la función sería una ventana a los importes de
--     toda la empresa desde cualquier móvil.
--
-- CÓMO CALCULA
--
-- No calcula: llama a valorar_aviso, que es la misma cuenta de siempre, y lee
-- el resultado. Eso es deliberado. Duplicar aquí las reglas (tarifa por
-- segmento, recargo de urgencia, desplazamiento por ruta, descuentos del
-- contrato, recargo de material) sería tener dos cuentas que el primer día dan
-- lo mismo y al cambiar una tarifa dejan de darlo: el técnico cobraría una cosa
-- y la oficina facturaría otra. Lo que el técnico ve es exactamente lo que se
-- va a facturar, porque es el mismo número.
--
-- Por eso la pantalla guarda el avance del parte antes de preguntar: las horas
-- y los materiales tienen que estar guardados para que la cuenta sea de verdad.
--
-- Se puede ejecutar las veces que haga falta.
--
-- 27-11-2026
-- ================================================================

create or replace function public.cobro_en_obra(p_aviso uuid)
returns json
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v        public.valoraciones%rowtype;
  v_iva    numeric;
  v_base   numeric;
  v_cuota  numeric;
  v_mio    boolean := false;
begin
  if not public.es_equipo() then return null; end if;

  -- De quién es esta visita. La oficina y la administración ven cualquiera; un
  -- técnico, solo la suya: la que tiene asignada o una en la que va de segundo.
  if public.es_gestion() then
    v_mio := true;
  else
    select exists (
      select 1 from public.avisos a where a.id = p_aviso and a.tecnico_id = auth.uid()
    ) or exists (
      select 1 from public.aviso_tecnicos t
       where t.aviso_id = p_aviso and t.tecnico_id = auth.uid()
    ) into v_mio;
  end if;
  if not v_mio then return null; end if;

  -- La misma cuenta que usa la oficina, no otra parecida
  perform public.valorar_aviso(p_aviso);

  select * into v from public.valoraciones where aviso_id = p_aviso;
  if v.aviso_id is null then return null; end if;

  select t.iva into v_iva from public.tarifas t where t.id = 1;
  v_iva  := coalesce(v_iva, 21);
  v_base := round(coalesce(v.imp_total, 0), 2);
  v_cuota := round(v_base * v_iva / 100, 2);

  -- Lo que sale de aquí es solo lo que hay que pedirle al cliente. El coste y
  -- el margen se quedan dentro a propósito: ver arriba.
  return json_build_object(
    'mano',           round(coalesce(v.imp_mano_obra, 0), 2),
    'desplazamiento', round(coalesce(v.imp_desplazamiento, 0), 2),
    'materiales',     round(coalesce(v.imp_materiales, 0), 2),
    'base',           v_base,
    'tipo_iva',       v_iva,
    'iva',            v_cuota,
    'total',          round(v_base + v_cuota, 2)
  );
end $function$;

comment on function public.cobro_en_obra(uuid) is
  'Lo que el técnico tiene que cobrarle al cliente en esa visita: mano de obra, '
  'desplazamiento y materiales a precio de venta, la base, el IVA y el total. '
  'NO devuelve coste ni margen, en ningún caso, porque la usa la pantalla del '
  'técnico. Un técnico solo puede preguntar por una visita que tenga asignada; '
  'la oficina y la administración, por cualquiera. El número sale de '
  'valorar_aviso, la misma cuenta que facturará la oficina, para que lo que se '
  'cobra en obra y lo que se factura no puedan separarse.';

grant execute on function public.cobro_en_obra(uuid) to authenticated;
grant execute on function public.cobro_en_obra(uuid) to anon;
grant execute on function public.cobro_en_obra(uuid) to service_role;

-- ============================================================================
-- Comprobación rápida:
--
--   select p.proname
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'cobro_en_obra';
--
--   -- y que NO devuelve coste ni margen. Se busca la CLAVE del json, con su
--   -- coma, no la palabra suelta: la palabra sale en los comentarios de aquí
--   -- arriba, que explican justo que no se devuelve.
--   select pg_get_functiondef(p.oid) like '%''margen'',%'
--       or pg_get_functiondef(p.oid) like '%''coste%'',%' as devuelve_de_mas
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'cobro_en_obra';
--   -- tiene que decir false
-- ============================================================================
