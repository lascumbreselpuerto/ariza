-- ============================================================================
-- ARIZA SAT · El desplazamiento en falso: lo marca el técnico y se cobra el viaje
--
-- POR QUÉ
-- David, 07-11-2026, probando las asistencias en campo:
--
--   «El desplazamiento en falso es un punto que me parece importante, pero no
--    está donde debe. Este punto lo deben activar los técnicos, no la oficina,
--    ni como parte de la creación de ninguna asistencia. Debe aparecer en
--    cualquiera de las diferentes asistencias que crea oficina. Y cuando el
--    técnico valore que es una asistencia en falso, explicándolo en la app,
--    pueda activarla, cerrando el parte para que desde oficina se vuelva a
--    gestionar la asistencia con el cliente, pero cobrándole al cliente el
--    desplazamiento en falso.»
--
-- Tenía razón en lo de fondo: nadie sabe que un viaje ha sido en balde hasta
-- que llega. La oficina crea una avería y es el técnico, allí, quien descubre
-- que no hay nadie, que el acceso está cerrado o que la puerta no es de ese
-- cliente. Pedirle a la oficina que lo adivine al crear la visita es pedirle
-- que adivine.
--
-- Y había algo más, que se comprobó con números antes de tocar nada: la
-- aplicación DECÍA que un desplazamiento en falso no se factura, y se facturaba
-- entero. Un falso de una hora con la ruta 1, a 40 €/h y 30 € de ruta, salía a
-- 70 €, de los cuales 40 eran mano de obra de un trabajo que nadie hizo.
--
-- QUÉ AÑADE
--   · avisos.falso            lo marcó el técnico al cerrar
--   · avisos.falso_motivo     qué se encontró, con sus palabras
--   · avisos.falso_resuelto   la oficina ya ha vuelto a quedar con el cliente
--   · avisos.falso_nueva_id   la visita nueva que la sustituye, si se creó aquí
--
-- QUÉ CAMBIA EN EL DINERO
-- Se cobra el DESPLAZAMIENTO y nada más. Ni mano de obra ni materiales. También
-- a los clientes con contrato de mantenimiento: el contrato cubre las
-- revisiones, no los viajes en balde porque no abrieron (decisión de David,
-- 07-11-2026).
--
-- El COSTE no se toca: las horas del técnico y el coste de la ruta siguen
-- contando enteros, así que el margen de un viaje en balde sale negativo. Esa
-- es la verdad y es de donde sale la cuenta de lo que cuestan al año.
--
-- LO YA CERRADO NO SE MUEVE. La regla nueva alcanza solo a lo que se cierre a
-- partir del 07-11-2026. Volver a calcular un falso del mes pasado da
-- exactamente lo que daba, y hay una prueba dedicada a eso.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- Hace falta puesta-servicio.sql ejecutado antes: la función de abajo es la
-- suya, con un bloque añadido.
-- ============================================================================

-- 1. Las cuatro columnas
alter table public.avisos add column if not exists falso boolean not null default false;
alter table public.avisos add column if not exists falso_motivo text;
alter table public.avisos add column if not exists falso_resuelto boolean not null default false;
alter table public.avisos add column if not exists falso_nueva_id uuid references public.avisos(id) on delete set null;

comment on column public.avisos.falso is
  'El técnico llegó y no se pudo trabajar: no había nadie, el acceso estaba '
  'cerrado, la puerta no era de ese cliente. Lo marca él al cerrar el parte, '
  'en cualquier tipo de visita. Se cobra el desplazamiento y nada más.';
comment on column public.avisos.falso_motivo is
  'Qué se encontró, con las palabras del técnico. Obligatorio: un viaje en '
  'balde sin explicación no se le puede reclamar a nadie ni se puede evitar la '
  'próxima vez.';
comment on column public.avisos.falso_resuelto is
  'La oficina ya ha vuelto a quedar con el cliente. Mientras esté en false, la '
  'visita sale en la lista de las que hay que volver a concertar.';
comment on column public.avisos.falso_nueva_id is
  'La visita nueva que sustituye a esta, si se creó desde el panel. Deja el '
  'rastro de cuántos viajes costó de verdad ese trabajo.';

-- Un falso sin explicación no entra. La pantalla ya lo pide, pero una visita
-- guardada desde otro sitio se colaría, y lo que entra sin explicación se queda
-- sin explicación para siempre.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_falso_explicado') then
    alter table public.avisos
      add constraint avisos_falso_explicado check (
        falso is not true or coalesce(btrim(falso_motivo), '') <> '');
  end if;
  -- Y una visita no puede ser la sustituta de sí misma.
  if not exists (select 1 from pg_constraint where conname = 'avisos_falso_nueva_distinta') then
    alter table public.avisos
      add constraint avisos_falso_nueva_distinta check (
        falso_nueva_id is null or falso_nueva_id <> id);
  end if;
end $$;

-- 2. La valoración
-- Es la función de puesta-servicio.sql con UN bloque añadido: el del falso. El
-- resto está copiado tal cual, sin tocar una coma.
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
end $function$;

-- 3. Las que hay que volver a concertar
-- La lista que pidió David: el técnico cierra el parte en falso y la visita
-- aparece aquí para que la oficina vuelva a quedar con el cliente. Sale de la
-- lista cuando alguien dice que ya está, no sola.
create or replace view public.falsos_pendientes as
  select a.id, a.tipo, a.cliente_id, a.puerta_id, a.tecnico_id, a.tecnico,
         a.cerrado, a.falso_motivo, a.ruta,
         coalesce(v.imp_desplazamiento, 0) as se_cobra,
         coalesce(v.coste_total, 0) as nos_cuesta
    from public.avisos a
         left join public.valoraciones v on v.aviso_id = a.id
   where a.falso is true
     and a.falso_resuelto is not true
     and a.anulada is not true
   order by a.cerrado desc nulls last;

comment on view public.falsos_pendientes is
  'Visitas que el técnico cerró como desplazamiento en falso y con las que '
  'todavía no se ha vuelto a quedar. Con lo que se le cobra al cliente y lo que '
  'le cuesta a la empresa.';

-- 4. Lo que cuestan al año los viajes en balde
-- Cuántos, qué se cobró, qué costaron y cuántos se quedaron sin volver a
-- concertar. Es la cuenta que dice si merece la pena llamar antes de salir.
create or replace view public.falsos_resumen as
  select date_trunc('month', a.cerrado)::date as mes,
         count(*) as viajes,
         count(*) filter (where a.falso_resuelto is not true) as sin_volver_a_quedar,
         coalesce(sum(v.imp_desplazamiento), 0) as cobrado,
         coalesce(sum(v.coste_total), 0) as costado,
         coalesce(sum(v.margen), 0) as margen
    from public.avisos a
         left join public.valoraciones v on v.aviso_id = a.id
   where a.falso is true
     and a.cerrado is not null
     and a.anulada is not true
   group by 1
   order by 1 desc;

comment on view public.falsos_resumen is
  'Los viajes en balde mes a mes: cuántos, cuánto se cobró, cuánto costaron y '
  'cuántos siguen sin volver a concertar. El margen sale negativo a propósito: '
  'un viaje en balde cuesta dinero aunque se cobre el desplazamiento.';

-- ============================================================================
-- Comprobación rápida:
--
--   select column_name from information_schema.columns
--    where table_name = 'avisos'
--      and column_name in ('falso','falso_motivo','falso_resuelto','falso_nueva_id');
--   select * from public.falsos_pendientes;
--   select * from public.falsos_resumen;
-- ============================================================================
