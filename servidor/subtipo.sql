-- ============================================================================
-- ARIZA SAT · Cada asistencia con su subtipo
--
-- POR QUÉ
-- David, 04-11-2026: «Al crear aviso deberíamos diferenciar cada tipo de avisos
-- en función de su forma y contenido.» Correctiva pasa a contener avería y
-- garantía; instalación pasa a contener puerta completa (automática, manual o
-- peatonal), automatismo y normativa y adecuación.
--
-- QUÉ CAMBIA
--   1. avisos.subtipo: qué clase de trabajo es dentro de su tipo.
--   2. avisos.tipos_puerta: sobre qué tipos de puerta se trabaja, cuando eso no
--      sale de una ficha. Lo piden el automatismo, la normativa y la comercial:
--      un automatismo «para corredera» no es el mismo trabajo que uno «para
--      seccional», y quien crea el aviso lo sabe.
--   3. valorar_aviso mira el subtipo para la garantía.
--
-- LO VIEJO NO SE TOCA, A PROPÓSITO
-- Las asistencias cerradas como tipo «garantía» o tipo «normativa» se quedan
-- como están, con su tipo de siempre. Decisión de David el 04-11-2026 sobre las
-- tres opciones que se le pusieron: ni se renombran ni se migran. Por eso
-- valorar_aviso sigue mirando TAMBIÉN el tipo viejo: si solo mirara el subtipo,
-- una garantía de octubre pasaría a facturarse.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- ============================================================================

-- ---- 1. El subtipo ----
alter table public.avisos add column if not exists subtipo text;

comment on column public.avisos.subtipo is
  'Qué clase de trabajo es dentro de su tipo: averia/garantia en la correctiva; '
  'puerta_automatica, puerta_manual, puerta_peatonal, automatismo o normativa en '
  'la instalación. Vacío en los tipos que no tienen subtipo, y en todo lo '
  'anterior al 04-11-2026.';

-- Que no entre un subtipo que no existe. Sin esto, un día entra «Garantia» con
-- mayúscula, la aplicación no lo reconoce, esa visita se factura y nadie sabe
-- por qué.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_subtipo_valido') then
    alter table public.avisos
      add constraint avisos_subtipo_valido
      check (subtipo is null or subtipo in (
        'averia','garantia',
        'puerta_automatica','puerta_manual','puerta_peatonal',
        'automatismo','normativa'));
  end if;
end $$;

-- ---- 2. Sobre qué tipos de puerta ----
-- Una lista, no un texto: una comercial puede ser de dos seccionales y una
-- peatonal, y eso no cabe en un campo suelto.
alter table public.avisos add column if not exists tipos_puerta text[];

comment on column public.avisos.tipos_puerta is
  'Tipos de puerta sobre los que se trabaja, cuando no salen de una ficha: '
  'automatismo, normativa y comercial. No sustituye a las puertas dadas de alta '
  'de la asistencia: es para lo que todavía no existe en la aplicación.';

-- ---- 3. La valoración mira el subtipo ----
-- El cuerpo de valorar_aviso es el que había, con UN cambio: la regla de lo que
-- no se cobra. Se ha sacado del propio rutas.sql y se ha comprobado con un diff
-- que no cambia nada más.
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
  v_precioh := t.precio_hora * (case when a.tipo = 'urgencia'
                                then 1 + t.recargo_urgencia / 100 else 1 end);
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

  -- las visitas comerciales, las de garantía y los desplazamientos en falso no se cobran
  /* Cambiado el 04-11-2026: garantía deja de ser un tipo y pasa a ser un
     subtipo de la correctiva. Lo viejo se sigue mirando por el tipo, para que
     el histórico cerrado como «garantía» siga valiendo cero. */
  if a.tipo in ('comercial','garantia')
     or coalesce(a.subtipo, '') = 'garantia'
     or a.sin_cargo then
    v_mano := 0; v_desp := 0; v_mat := 0;
  end if;

  insert into public.valoraciones as v
    (aviso_id, imp_mano_obra, imp_desplazamiento, imp_materiales, imp_total, coste_total, margen, calculado)
  values (
    p_aviso, v_mano, v_desp, v_mat,
    round(v_mano + v_desp + v_mat, 2),
    round(v_horas * coalesce(a.num_tecnicos, 1) * t.coste_hora
          + v_cdesp + v_cmat, 2),
    round(v_mano + v_desp + v_mat, 2)
      - round(v_horas * coalesce(a.num_tecnicos, 1) * t.coste_hora
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

grant execute on function public.valorar_aviso(uuid) to authenticated;

-- ---- 4. Para ver de un vistazo lo que quedó sin subtipo ----
-- Las asistencias nuevas de un tipo que SÍ tiene subtipos y que se quedaron sin
-- él. No es un error: lo anterior al 04-11-2026 no lo tiene y no pasa nada.
-- Sirve para que la oficina pueda rematarlo si quiere.
create or replace view public.avisos_sin_subtipo as
select a.id as aviso_id, a.tipo, a.creado, a.cerrado, a.cliente_id
  from public.avisos a
 where a.tipo in ('averia','instalacion')
   and coalesce(a.subtipo, '') = ''
   and not coalesce(a.anulada, false)
 order by a.creado desc;

comment on view public.avisos_sin_subtipo is
  'Asistencias de un tipo con subtipos que no lo tienen puesto. Lo anterior al '
  '04-11-2026 sale aquí y es normal.';

grant select on public.avisos_sin_subtipo to authenticated;

select 'Listo: avisos.subtipo, avisos.tipos_puerta y valorar_aviso mirando el '
    || 'subtipo para la garantía. El histórico no se ha tocado.' as resultado;
