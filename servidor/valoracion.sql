-- ============================================================================
-- ARIZA SAT · La valoración de una visita
--
-- POR QUÉ ESTE FICHERO EXISTE
-- Esta función es la que decide lo que se factura de cada visita, y hasta el
-- 02-11-2026 vivía SOLO dentro de Supabase. Se escribió en una migración que
-- nunca se guardó en servidor/, así que:
--
--   · no se podía leer sin entrar al panel de Supabase;
--   · no se podía probar en el banco de pruebas;
--   · y si se perdía el proyecto, se perdía con él. La copia de seguridad
--     guarda los DATOS de las valoraciones, no la fórmula que los calcula.
--
-- Aquí está, con lo que hace explicado, y con UNA corrección que se explica
-- abajo. Lo demás es exactamente lo que ya estaba funcionando: no se ha tocado
-- ni una fórmula ni un redondeo.
--
-- QUÉ HACE, EN ORDEN
--   1. Comprueba que quien la llama es del equipo. Si no, no hace nada.
--   2. Busca el contrato que cubre esa puerta; si no hay, el del cliente.
--   3. Si hay contrato Y la visita es una revisión periódica, aplica lo que el
--      contrato incluya (mano de obra, desplazamiento) y sus descuentos. Una
--      avería NO entra en el contrato aunque la puerta esté cubierta.
--   4. Pone precio a los materiales (ver abajo).
--   5. Mano de obra: el MÍNIMO FACTURABLE manda sobre las horas reales, se
--      multiplica por el número de técnicos y, si es urgencia, lleva recargo.
--   6. Desplazamiento: una parte fija más los kilómetros.
--   7. Las visitas comerciales, las de garantía y las marcadas «no se cobra»
--      se valoran en CERO.
--   8. Guarda el importe, el coste y el margen en valoraciones.
--
-- EL PRECIO DE LOS MATERIALES, QUE ES LO QUE MÁS CONFUNDE
-- El técnico no escribe precios: escribe qué ha puesto. El precio sale de aquí,
-- en tres pasos, y cada línea se queda en el primero que le valga:
--
--   a) Si la línea NO está enlazada con el almacén pero su descripción coincide
--      EXACTAMENTE con la de un artículo (sin mayúsculas ni espacios de más),
--      se enlaza sola y coge su coste y su recargo.
--   b) Si la línea YA está enlazada pero no tiene coste, lo coge de su artículo.
--      (Esto es la corrección del 02-11-2026; antes no existía y es la que
--      hacía que enlazar a mano desde la oficina no sirviera de nada: la línea
--      quedaba enlazada y seguía valiendo cero.)
--   c) Si la línea tiene coste pero no precio, el precio se calcula con el
--      recargo general y el descuento del contrato.
--
-- Una línea que no pasa por ninguno de los tres se queda SIN PRECIO, y eso
-- significa que entra en la cuenta a CERO EUROS: el importe sale corto y el
-- margen sale más alto que el real. Por eso la aplicación las lista aparte en
-- Gestión, en «Material sin precio», hasta que alguien las remata.
--
-- Se puede ejecutar varias veces sin romper nada: es un create or replace.
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
  if not v_dp_inc then
    v_desp := round(t.desplazamiento_fijo + coalesce(a.desplazamiento, 0) * t.precio_km, 2);
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
          + coalesce(a.desplazamiento, 0) * t.coste_km + v_cmat, 2),
    round(v_mano + v_desp + v_mat, 2)
      - round(v_horas * coalesce(a.num_tecnicos, 1) * t.coste_hora
              + coalesce(a.desplazamiento, 0) * t.coste_km + v_cmat, 2),
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

-- ---------------------------------------------------------------------------
-- Comprobación
--
-- Después de ejecutar esto, una línea de material enlazada a mano desde la
-- oficina tiene que coger precio al recalcular. Para verlo en una visita
-- concreta, antes y después de darle a «Volver a calcular»:
--
--   select descripcion, articulo_id, coste, precio, cantidad
--     from public.materiales where aviso_id = 'EL-ID-DE-LA-VISITA';
--
-- Las que se queden con precio nulo son las que valen cero, y son justo las
-- que la aplicación lista en Gestión → «Material sin precio».
-- ---------------------------------------------------------------------------
