-- ============================================================================
-- ARIZA SAT · El desplazamiento se cobra por ruta, no por kilómetros
--
-- POR QUÉ
-- El técnico tenía que escribir los kilómetros de cada visita. Ese número no lo
-- sabe: lo estima, y lo estima distinto cada día y cada técnico. Y el cálculo
-- del servidor lo cobraba como «importe fijo + kilómetros», de modo que el
-- importe del desplazamiento dependía de una cifra que nadie medía.
--
-- Las rutas ya existían desde tarifas2.sql, pero solo vivían en los
-- presupuestos: el parte de la visita no guardaba ninguna. Así que la misma
-- salida se presupuestaba por ruta y se facturaba por kilómetros.
--
-- QUÉ CAMBIA
--   1. Cinco rutas en vez de tres (David, 02-11-2026), con su nombre, su
--      importe y su coste, que los pone administración.
--   2. avisos.ruta: qué ruta se usó en esa visita. 'ruta1'..'ruta5', o 'km'
--      para lo que cae fuera de todas ellas.
--   3. valorar_aviso cobra el desplazamiento de la ruta. Solo con 'km' sigue
--      haciendo la cuenta de antes.
--
-- LO YA CERRADO NO SE MUEVE NI UN CÉNTIMO
-- A las visitas que ya existen se les pone:
--   · 'km'    si tenían kilómetros apuntados, que es exactamente lo que se les
--             cobró (importe fijo + kilómetros);
--   · 'ruta1' si no tenían, y la ruta 1 vale el importe fijo de siempre, porque
--             tarifas2.sql la rellenó con él.
-- Las dos salen al mismo importe que antes. El valor por defecto (ruta 1) solo
-- afecta a lo nuevo.
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

-- 1. Las dos rutas nuevas
alter table public.tarifas add column if not exists ruta4_nombre  text;
alter table public.tarifas add column if not exists ruta4_importe numeric;
alter table public.tarifas add column if not exists ruta4_coste   numeric;
alter table public.tarifas add column if not exists ruta5_nombre  text;
alter table public.tarifas add column if not exists ruta5_importe numeric;
alter table public.tarifas add column if not exists ruta5_coste   numeric;

update public.tarifas
   set ruta4_nombre = coalesce(nullif(btrim(coalesce(ruta4_nombre, '')), ''), 'Ruta 4'),
       ruta5_nombre = coalesce(nullif(btrim(coalesce(ruta5_nombre, '')), ''), 'Ruta 5')
 where id = 1;

comment on column public.tarifas.ruta4_importe is
  'Lo que se cobra por esa salida. Vacío: la ruta no está valorada y la aplicación no la ofrece.';

-- 2. La ruta de cada visita
alter table public.avisos add column if not exists ruta text;

comment on column public.avisos.ruta is
  'ruta1..ruta5, o km para lo que cae fuera. Vacío en una visita nueva: se '
  'valora como ruta1, que es la decisión que tomó David el 02-11-2026.';

-- El relleno que deja el histórico igual que estaba
update public.avisos
   set ruta = case when coalesce(desplazamiento, 0) > 0 then 'km' else 'ruta1' end
 where ruta is null;

create index if not exists avisos_ruta_idx on public.avisos (ruta);

-- 3. La valoración
-- Se reescribe entera la función porque hay que tocarle el desplazamiento, y
-- una función se sustituye completa: lo demás queda EXACTAMENTE como estaba.
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
  if a.tipo in ('comercial','garantia') or a.sin_cargo then
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

-- ----------------------------------------------------------------------------
-- Lo que se ha cerrado con una ruta que nadie ha valorado todavía. Sale a cero
-- euros de desplazamiento, y eso hay que verlo antes de facturar.
-- ----------------------------------------------------------------------------
create or replace view public.visitas_ruta_sin_valorar as
select a.id as aviso_id, a.cliente_id, a.cerrado, a.ruta, v.imp_desplazamiento
  from public.avisos a
  join public.valoraciones v on v.aviso_id = a.id
  cross join public.tarifas t
 where t.id = 1
   and a.cerrado is not null
   and not a.anulada
   and not a.sin_cargo
   and a.ruta is not null
   and a.ruta <> 'km'
   and coalesce(v.imp_desplazamiento, 0) = 0
   and (case a.ruta
          when 'ruta1' then coalesce(t.ruta1_importe, t.desplazamiento_fijo)
          when 'ruta2' then t.ruta2_importe
          when 'ruta3' then t.ruta3_importe
          when 'ruta4' then t.ruta4_importe
          when 'ruta5' then t.ruta5_importe
        end) is null;

grant select on public.visitas_ruta_sin_valorar to authenticated;
