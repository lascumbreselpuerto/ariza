-- ============================================================================
-- ARIZA SAT · La urgencia se cobra según CUÁNDO se hace
--
-- POR QUÉ
-- David, 04-11-2026: «Para una urgencia en horario laboral el precio hora y el
-- desplazamiento sería por dos. Si esta urgencia hay que realizarla fuera del
-- horario, en un horario nocturno o en fin de semana, sería tanto hora como
-- desplazamiento por tres.»
--
-- Hasta hoy la urgencia llevaba un porcentaje fijo de recargo (Tarifas), el
-- mismo a las once de la mañana que a las tres de la madrugada de un domingo.
--
-- QUÉ CAMBIA
--   1. avisos.urgencia_factor: 2 o 3, el que le toca a esa visita.
--   2. tarifas: los dos factores y la franja de horario laboral, para poder
--      cambiarlos sin tocar la aplicación.
--   3. valorar_aviso multiplica por ese factor el precio de la hora, el coste
--      de la hora y el desplazamiento (importe y coste).
--
-- QUIÉN DECIDE EL FACTOR
-- Lo propone la aplicación mirando el día y la hora REALES de la visita, la
-- que sella el botón «He llegado», y la oficina lo puede cambiar. Decisión de
-- David el 04-11-2026 sobre tres opciones.
-- El cálculo vive en la aplicación y no aquí porque hace falta saber si ese día
-- era festivo, y eso solo lo sabe el calendario que mantiene la oficina.
--
-- EL COSTE SUBE CON EL MISMO FACTOR
-- También decisión suya: si al técnico se le paga más por salir de noche, un
-- margen que no lo cuente hace que las urgencias parezcan más rentables de lo
-- que son, y entonces se toman decisiones con un número falso.
--
-- LO YA CERRADO NO SE MUEVE NI UN CÉNTIMO
-- Las urgencias anteriores a hoy no tienen factor guardado, y sin factor la
-- función hace exactamente lo de antes: el porcentaje de Tarifas sobre el
-- precio, y el coste sin tocar. Volver a calcular una urgencia de octubre da
-- el mismo número que daba.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- ============================================================================

-- ---- 1. El factor de cada urgencia ----
alter table public.avisos add column if not exists urgencia_factor numeric;

comment on column public.avisos.urgencia_factor is
  'Por cuánto se multiplican la hora y el desplazamiento en esta urgencia: 2 en '
  'horario laboral, 3 fuera de horario, fin de semana y festivos. Vacío: se '
  'valora como antes del 04-11-2026, con el porcentaje de Tarifas.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_urgencia_factor_valido') then
    alter table public.avisos
      add constraint avisos_urgencia_factor_valido
      check (urgencia_factor is null or (urgencia_factor >= 1 and urgencia_factor <= 10));
  end if;
end $$;

-- ---- 2. Los factores y la franja, en Tarifas ----
-- Van aquí y no en el código porque son dinero, y el dinero lo pone
-- administración sin esperar a una versión nueva de la aplicación.
alter table public.tarifas add column if not exists urgencia_x_laboral numeric;
alter table public.tarifas add column if not exists urgencia_x_fuera   numeric;
alter table public.tarifas add column if not exists urgencia_desde     integer;
alter table public.tarifas add column if not exists urgencia_hasta     integer;

update public.tarifas
   set urgencia_x_laboral = coalesce(urgencia_x_laboral, 2),
       urgencia_x_fuera   = coalesce(urgencia_x_fuera,   3),
       urgencia_desde     = coalesce(urgencia_desde,     8),
       urgencia_hasta     = coalesce(urgencia_hasta,    18)
 where id = 1;

comment on column public.tarifas.urgencia_x_laboral is
  'Por cuánto se multiplican hora y desplazamiento en una urgencia dentro del '
  'horario laboral. David, 04-11-2026: 2.';
comment on column public.tarifas.urgencia_x_fuera is
  'Lo mismo fuera de horario, en fin de semana y en festivos. David: 3.';
comment on column public.tarifas.urgencia_desde is
  'Hora a la que empieza el horario laboral, de lunes a viernes. David: 8.';
comment on column public.tarifas.urgencia_hasta is
  'Hora a la que acaba. David: 18. A partir de ella, y hasta urgencia_desde del '
  'día siguiente, la urgencia va al factor de fuera de horario.';

-- ---- 3. La valoración aplica el factor ----
-- El cuerpo es el que había, con cinco cambios comprobados con un diff: las dos
-- variables nuevas, el precio de la hora, el coste de la hora, el
-- desplazamiento y el coste total.
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

grant execute on function public.valorar_aviso(uuid) to authenticated;

-- ---- 4. Las urgencias que se quedaron sin factor ----
-- Las cerradas desde hoy que no llevan factor: se están valorando con el
-- porcentaje viejo, y eso puede no ser lo que toca.
create or replace view public.urgencias_sin_factor as
select a.id as aviso_id, a.cliente_id, a.cerrado, a.hora_inicio, v.imp_total
  from public.avisos a
  left join public.valoraciones v on v.aviso_id = a.id
 where a.tipo = 'urgencia'
   and a.urgencia_factor is null
   and a.cerrado is not null
   and not coalesce(a.anulada, false)
 order by a.cerrado desc;

comment on view public.urgencias_sin_factor is
  'Urgencias cerradas sin factor de recargo. Las anteriores al 04-11-2026 salen '
  'aquí y es normal: se valoran con el porcentaje de antes.';

grant select on public.urgencias_sin_factor to authenticated;

select 'Listo: avisos.urgencia_factor, los factores y la franja en Tarifas, y '
    || 'valorar_aviso multiplicando hora, coste y desplazamiento. Lo ya cerrado '
    || 'no se ha movido.' as resultado;
