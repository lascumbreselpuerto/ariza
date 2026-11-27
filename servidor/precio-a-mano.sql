-- ================================================================
-- SAFE2DOOR · EL PRECIO PUESTO A MANO POR LA OFICINA
--
-- QUÉ RESUELVE
--
-- David, 27-11-2026: «Si veo necesario que oficina pueda modificar el precio a
-- mano. Estos importes sumarán en ingresos positivos y se le calculará el
-- margen con los costes estipulados.»
--
-- Hasta hoy el importe de una visita era SIEMPRE el que salía del cálculo:
-- horas por la tarifa, el desplazamiento de su ruta y el material con su
-- recargo. Eso está bien el 95 % de las veces y mal el otro 5 %: un precio
-- acordado con el cliente, una visita que se cierra en redondo, un trabajo que
-- se cobra por lo pactado y no por lo que salga. Para esos casos no había nada,
-- y lo que se hacía era tocar las horas hasta que el total cuadrara, que es
-- mentir en el dato de lo que se tardó.
--
-- CÓMO QUEDA
--
--   · La oficina escribe el importe. Ese es el que se factura y el que suma en
--     los ingresos del mes.
--   · El cálculo se sigue guardando en sus tres partes, así que se ve de dónde
--     salía y cuánto se ha subido o bajado.
--   · El COSTE no se toca. Sale de las horas, la ruta y el material, igual que
--     siempre, y el margen se calcula contra ese coste real. Es lo que pidió
--     David: el ingreso lo pone la oficina, el margen sale de los costes de
--     verdad.
--   · Queda guardado quién lo puso, cuándo y por qué.
--
-- LO QUE MÁS IMPORTA DE ESTE FICHERO
--
-- Recalcular NO borra el importe a mano. Hay recálculos automáticos (al cerrar
-- la visita y al corregir el parte), y si cualquiera de ellos deshiciera la
-- decisión de la oficina, el importe cambiaría solo y nadie se enteraría hasta
-- ver la factura. Para volver al calculado hay que quitarlo a mano.
--
-- Por eso este fichero reescribe valorar_aviso: es la única manera de que el
-- importe a mano sobreviva a un recálculo. La cuenta no cambia en nada más.
--
-- QUIÉN PUEDE PONERLO
--
-- Solo la oficina y la administración, porque la tabla «valoraciones» solo la
-- leen y escriben ellos: es donde están los costes y los márgenes. Un técnico
-- no puede ni verla.
--
-- Se puede ejecutar las veces que haga falta.
--
-- 27-11-2026
-- ================================================================

alter table public.valoraciones add column if not exists imp_manual numeric;
alter table public.valoraciones add column if not exists manual_por text;
alter table public.valoraciones add column if not exists manual_en timestamptz;
alter table public.valoraciones add column if not exists manual_nota text;

comment on column public.valoraciones.imp_manual is
  'El importe que la oficina ha puesto a mano para esta visita, sin IVA. Cuando '
  'tiene valor, es el que se factura y el que suma en los ingresos: imp_total '
  'pasa a ser este. Vacío significa que vale el cálculo de siempre. Un recálculo '
  'NO lo borra, a propósito.';

comment on column public.valoraciones.manual_por is
  'Quién puso el importe a mano. Es una decisión de dinero y tiene que tener '
  'nombre.';

comment on column public.valoraciones.manual_en is 'Cuándo se puso a mano.';

comment on column public.valoraciones.manual_nota is
  'Por qué se puso a mano: precio acordado con el cliente, cerrado en redondo, '
  'lo pactado en el presupuesto… Sin esto, dentro de seis meses nadie sabe por '
  'qué esa visita valía otra cosa.';

-- Para la pregunta de la administración: ¿qué visitas llevan precio a mano?
-- Es la lista que se mira cuando el margen de un mes no cuadra con la tarifa.
create index if not exists valoraciones_manual_idx
  ON public.valoraciones USING btree (manual_en)
  WHERE (imp_manual IS NOT NULL);

-- ============================================================================
-- Y valorar_aviso, que es la que tiene que respetar ese importe.
-- Es la misma cuenta de siempre: lo único que cambia es el tramo final, donde
-- se decide qué se guarda como venta y cómo sale el margen.
-- ============================================================================

create or replace function public.valorar_aviso(p_aviso uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
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
  -- Añadidas el 27-11-2026 para el importe puesto a mano por la oficina
  v_manual  numeric;        -- el importe que escribió la oficina, si lo hay
  v_calc    numeric;        -- lo que sale del cálculo de siempre
  v_coste   numeric;        -- el coste real, que no cambia nunca
  v_venta   numeric;        -- lo que se factura: el manual si lo hay, y si no el calculado
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

  /* ---- El importe puesto a mano (27-11-2026) ----
     David: «Si veo necesario que oficina pueda modificar el precio a mano.
     Estos importes sumarán en ingresos positivos y se le calculará el margen
     con los costes estipulados.»

     Si la oficina ha escrito un importe a mano, ese es el que vale como venta.
     Lo demás no se toca:

       · El cálculo se sigue guardando en sus TRES PARTES (mano de obra,
         desplazamiento y material), así que se puede ver de dónde salía y
         cuánto se ha subido o bajado.
       · El COSTE no se toca nunca. Sale de las horas por el coste de la hora,
         la ruta y el material, y el margen se calcula contra ese coste real.
         Es lo que pidió David: ingresos los de la oficina, margen con los
         costes de verdad.

     Y recalcular NO borra el importe a mano. Esto es lo importante: hay
     recálculos automáticos (al cerrar la visita y al corregir el parte), y si
     cualquiera de ellos deshiciera la decisión de la oficina, el importe
     cambiaría solo y nadie se enteraría hasta ver la factura. Para volver al
     calculado hay que quitarlo a mano, que es una decisión y se toma. */
  select imp_manual into v_manual from public.valoraciones where aviso_id = p_aviso;
  v_calc  := round(v_mano + v_desp + v_mat, 2);
  v_coste := round(v_horas * coalesce(a.num_tecnicos, 1) * v_costeh + v_cdesp + v_cmat, 2);
  v_venta := coalesce(v_manual, v_calc);

  insert into public.valoraciones as v
    (aviso_id, imp_mano_obra, imp_desplazamiento, imp_materiales, imp_total, coste_total, margen, calculado)
  values (p_aviso, v_mano, v_desp, v_mat, v_venta, v_coste, round(v_venta - v_coste, 2), now())
  on conflict (aviso_id) do update set
    imp_mano_obra = excluded.imp_mano_obra,
    imp_desplazamiento = excluded.imp_desplazamiento,
    imp_materiales = excluded.imp_materiales,
    imp_total = excluded.imp_total,
    coste_total = excluded.coste_total,
    margen = excluded.margen,
    calculado = now();
  /* imp_manual, manual_por, manual_en y manual_nota NO están en esa lista a
     propósito: son de la oficina, no del cálculo, y un recálculo no los toca. */
end $function$;

-- ============================================================================
-- Comprobación rápida:
--
--   select column_name from information_schema.columns
--    where table_name = 'valoraciones'
--      and column_name in ('imp_manual','manual_por','manual_en','manual_nota');
--
--   -- y que la función respeta el importe a mano:
--   select pg_get_functiondef(p.oid) like '%coalesce(v_manual, v_calc)%' as respeta
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'valorar_aviso';
--   -- tiene que decir true
-- ============================================================================
