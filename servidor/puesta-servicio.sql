-- ============================================================================
-- ARIZA SAT · La puesta en servicio: de qué obra viene, por qué se quedó
--             pendiente, y quién paga el segundo viaje
--
-- POR QUÉ
-- David, 05-11-2026: «La puesta en marcha no se hará siempre, es solo cuando no
-- se ha podido terminar por algún motivo. Pero no es algo que siempre va a
-- ocurrir y como tal no es facturable. Es un punto de finalización de un
-- proyecto o instalación que ya se debe de haber terminado y facturado, a
-- excepción de la puesta en servicio.»
--
-- Hasta hoy «puesta en servicio» era un tipo de visita como otro cualquiera:
-- se podía abrir sola, sin decir de qué obra venía ni por qué se había quedado
-- a medias, y se facturaba con sus horas y su desplazamiento. Así que el
-- segundo viaje a terminar una obra no se distinguía de una visita nueva, y la
-- pregunta que importa (¿cuántas obras se quedan sin terminar, y por culpa de
-- qué?) no se podía responder con números.
--
-- QUÉ AÑADE
--   · avisos.instalacion_id   de qué instalación viene este remate
--   · avisos.ps_causa         por qué se quedó pendiente, de lista cerrada
--   · avisos.ps_causa_detalle la explicación, en palabras
--   · avisos.repercutible     la oficina dice que este viaje se le cobra
--
-- LA LISTA DE CAUSAS, cerrada a propósito: en texto libre no se puede contar, y
-- lo que no se puede contar no se puede reclamar.
--   sin_corriente  No había corriente definitiva
--   albanileria    Albañilería u obra del cliente sin terminar
--   remates        Remates del cliente (pintura, solado, cerrajería)
--   material_cli   Falta material que pone el cliente
--   nuestra        Causa nuestra (material que no llegó, error de medida)
--   otra           Otra, explicada al lado
--
-- QUÉ NO HACE
--   · No toca ninguna visita cerrada. La regla nueva de valoración alcanza SOLO
--     a las puestas en servicio que se cierren a partir del 05-11-2026: las
--     anteriores siguen valiendo exactamente lo que valían, porque ya están
--     facturadas.
--   · No marca nada como repercutible. Eso lo decide la oficina, a mano.
--   · No obliga a nada en la base de datos: las comprobaciones de que hay que
--     decir de qué obra viene y por qué están en la aplicación, donde se puede
--     explicar. Aquí solo se impide guardar una causa que no existe.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- Hace falta urgencia.sql ejecutado antes (es el que define hoy valorar_aviso).
-- ============================================================================

-- 1. De qué instalación viene el remate
alter table public.avisos add column if not exists instalacion_id uuid
  references public.avisos(id) on delete set null;

comment on column public.avisos.instalacion_id is
  'En una puesta en servicio, la instalación de la que viene este remate. '
  'Vacío solo en las obras antiguas que no están en la aplicación.';

create index if not exists avisos_instalacion_idx on public.avisos (instalacion_id);

-- 2. Por qué se quedó pendiente
alter table public.avisos add column if not exists ps_causa text;
alter table public.avisos add column if not exists ps_causa_detalle text;

comment on column public.avisos.ps_causa is
  'Por qué no se pudo terminar la obra en su día: sin_corriente, albanileria, '
  'remates, material_cli, nuestra, otra. Es lista cerrada para poder contar '
  'cuántas obras se retrasan por cada motivo.';
comment on column public.avisos.ps_causa_detalle is
  'La causa en palabras. Obligatoria en la aplicación cuando la causa es «otra».';

-- Una causa mal escrita se guarda sin quejarse, no la reconoce nadie, y el día
-- que se cuentan los retrasos por motivo esa obra no aparece en ninguna fila.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_ps_causa_valida') then
    alter table public.avisos
      add constraint avisos_ps_causa_valida
      check (ps_causa is null or ps_causa in
        ('sin_corriente','albanileria','remates','material_cli','nuestra','otra'));
  end if;
end $$;

-- 3. El segundo viaje, cuando se le cobra al cliente
alter table public.avisos add column if not exists repercutible boolean not null default false;

comment on column public.avisos.repercutible is
  'Solo en las puestas en servicio: la oficina dice que este viaje se le cobra '
  'al cliente, porque la obra se quedó parada por su causa. Sin esto, la puesta '
  'en servicio se valora en cero. Lo marca gestión a mano, nunca la aplicación.';

-- 4. La valoración
-- Se cambia una sola cosa: la regla que pone una visita a cero euros. El resto
-- de la función es la de urgencia.sql, sin tocar.
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

-- 5. Las instalaciones que se quedaron sin terminar
-- Una obra cerrada con remate pendiente y sin su puesta en servicio es una
-- puerta entregada a medias. Hasta hoy eso solo se veía abriendo la obra.
create or replace view public.obras_con_remate_pendiente as
  select a.id, a.cliente_id, a.puerta_id, a.cerrado, a.tecnico_id,
         a.pendiente_texto, a.subtipo,
         (select count(*) from public.avisos ps where ps.instalacion_id = a.id) as remates
    from public.avisos a
   where a.tipo = 'instalacion'
     and a.cerrado is not null
     and a.anulada is not true
     and a.pendiente is true
     and not exists (select 1 from public.avisos ps
                      where ps.instalacion_id = a.id
                        and ps.tipo = 'puesta_servicio'
                        and ps.cerrado is not null
                        and ps.anulada is not true)
   order by a.cerrado;

comment on view public.obras_con_remate_pendiente is
  'Instalaciones cerradas con algo pendiente y sin una puesta en servicio '
  'cerrada: obras entregadas a medias, con el remate sin hacer.';

-- 6. Lo que cuestan los remates, por causa
-- La cuenta que no se podía hacer: cuántas obras se quedan sin terminar por
-- cada motivo y qué cuesta ir a rematarlas. El coste sale de la valoración, que
-- lo apunta aunque el importe sea cero.
create or replace view public.remates_por_causa as
  select coalesce(a.ps_causa, 'sin_indicar') as causa,
         count(*) as visitas,
         count(*) filter (where a.repercutible) as repercutidas,
         round(coalesce(sum(v.coste_total), 0), 2) as coste,
         round(coalesce(sum(v.imp_total), 0), 2)   as facturado
    from public.avisos a
    left join public.valoraciones v on v.aviso_id = a.id
   where a.tipo = 'puesta_servicio'
     and a.anulada is not true
   group by 1
   order by coste desc;

comment on view public.remates_por_causa is
  'Qué cuestan al año las puestas en servicio, agrupadas por la causa que dejó '
  'la obra sin terminar. El coste se apunta aunque no se facture.';

-- ============================================================================
-- Comprobación rápida:
--
--   select column_name from information_schema.columns
--    where table_name = 'avisos'
--      and column_name in ('instalacion_id','ps_causa','ps_causa_detalle','repercutible');
--   select * from public.obras_con_remate_pendiente;
--   select * from public.remates_por_causa;
-- ============================================================================
