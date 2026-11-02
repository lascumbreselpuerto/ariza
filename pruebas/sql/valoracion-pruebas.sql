-- ============================================================================
-- Pruebas de la función que valora una visita
--
-- POR QUÉ EXISTEN
-- valorar_aviso decide lo que se factura de cada visita, y hasta el 02-11-2026
-- nadie la había probado nunca: vivía dentro de Supabase y el banco de pruebas
-- solo comprobaba que los ficheros SQL se pudieran ejecutar, no que calcularan
-- bien.
--
-- Esto es distinto: mete datos de verdad, llama a la función y comprueba los
-- números uno a uno. Si algún día alguien toca un recargo o un redondeo sin
-- querer, salta aquí y no en una factura.
--
-- Cada comprobación dice el número que espera y por qué sale ese número.
-- ============================================================================

-- ---- Los datos del caso -------------------------------------------------
update public.tarifas set precio_hora = 45, coste_hora = 22, minimo_horas = 1,
       recargo_urgencia = 50, desplazamiento_fijo = 30, precio_km = 0.45,
       coste_km = 0.2, recargo_material = 40, iva = 21
 where id = 1;

insert into public.clientes (id, nombre) values
  ('11111111-1111-1111-1111-111111111111', 'Cliente de la prueba')
  on conflict (id) do nothing;

insert into public.articulos (id, descripcion, unidad, coste, recargo) values
  ('22222222-2222-2222-2222-222222222222', 'Banda de seguridad resistiva 2 m', 'ud', 38.5, null),
  ('33333333-3333-3333-3333-333333333333', 'Fotocélula de espejo', 'ud', 25, 60)
  on conflict (id) do nothing;

-- CAMBIO DEL 02-11-2026: la ruta decide el desplazamiento
-- Esta prueba comprueba, entre otras cosas, que el desplazamiento son 34,50:
-- 30 de importe fijo más 10 km a 0,45. Desde hoy ese cálculo solo se hace
-- cuando la visita va marcada como FUERA DE RUTA, que es lo que son esos
-- kilómetros. Antes no hacía falta decirlo porque era el único cálculo que
-- existía; ahora se dice, y la prueba sigue comprobando lo mismo.
insert into public.avisos (id, tipo, estado, cliente_id, horas, num_tecnicos, desplazamiento, ruta) values
  ('44444444-4444-4444-4444-444444444444', 'averia', 'cerrado',
   '11111111-1111-1111-1111-111111111111', 2, 1, 10, 'km')
  on conflict (id) do nothing;

delete from public.materiales where aviso_id = '44444444-4444-4444-4444-444444444444';

-- (a) escrito a mano, con la descripción EXACTA de un artículo: se enlaza solo
insert into public.materiales (aviso_id, descripcion, cantidad, unidad)
  values ('44444444-4444-4444-4444-444444444444',
          '  banda de seguridad RESISTIVA 2 m ', 1, 'ud');

-- (b) enlazado a mano desde la oficina y sin coste. ESTE es el caso que no
-- funcionaba: se quedaba enlazado y valiendo cero.
insert into public.materiales (aviso_id, articulo_id, descripcion, cantidad, unidad)
  values ('44444444-4444-4444-4444-444444444444',
          '33333333-3333-3333-3333-333333333333', 'Fotocelula espejo', 2, 'ud');

-- (c) no está en el almacén, pero alguien ha escrito lo que costó
insert into public.materiales (aviso_id, descripcion, cantidad, unidad, coste)
  values ('44444444-4444-4444-4444-444444444444', 'Tornillería varia', 1, 'ud', 10);

-- (d) ni artículo ni coste: se queda sin precio y vale cero
insert into public.materiales (aviso_id, descripcion, cantidad, unidad)
  values ('44444444-4444-4444-4444-444444444444', 'Pieza rara sin dar de alta', 1, 'ud');

select public.valorar_aviso('44444444-4444-4444-4444-444444444444');

-- ---- Lo que tiene que haber salido --------------------------------------
do $$
declare
  a numeric; b numeric; c numeric; d numeric;
  v public.valoraciones%rowtype;
  n_enlazada uuid;
begin
  select precio into a from public.materiales
   where aviso_id = '44444444-4444-4444-4444-444444444444'
     and descripcion ilike '%banda%';
  select precio, articulo_id into b, n_enlazada from public.materiales
   where aviso_id = '44444444-4444-4444-4444-444444444444'
     and descripcion ilike '%Fotocelula%';
  select precio into c from public.materiales
   where aviso_id = '44444444-4444-4444-4444-444444444444'
     and descripcion ilike '%Torniller%';
  select precio into d from public.materiales
   where aviso_id = '44444444-4444-4444-4444-444444444444'
     and descripcion ilike '%Pieza rara%';
  select * into v from public.valoraciones
   where aviso_id = '44444444-4444-4444-4444-444444444444';

  -- (a) 38,50 de coste con el recargo general del 40 % = 53,90. Y se enlaza
  -- sola aunque venga con mayúsculas distintas y espacios de más.
  if a is distinct from 53.90 then
    raise exception 'El material escrito a mano con nombre exacto tenía que valer 53,90 y vale %', a;
  end if;

  -- (b) 25 de coste con el recargo PROPIO del artículo, 60 % = 40,00.
  -- Esta es la corrección del 02-11-2026: antes se quedaba a cero.
  if b is distinct from 40.00 then
    raise exception 'El material enlazado a mano tenía que valer 40,00 y vale %. Sin la corrección se queda sin precio.', b;
  end if;

  -- (c) 10 de coste con el recargo general = 14,00
  if c is distinct from 14.00 then
    raise exception 'El material con el coste puesto a mano tenía que valer 14,00 y vale %', c;
  end if;

  -- (d) sin artículo y sin coste: sin precio, y por tanto cero en la cuenta
  if d is not null then
    raise exception 'El material sin artículo ni coste tenía que quedarse sin precio, y vale %', d;
  end if;

  -- materiales: 53,90 x1 + 40,00 x2 + 14,00 x1 + nada = 147,90
  if v.imp_materiales is distinct from 147.90 then
    raise exception 'Los materiales tenían que sumar 147,90 y suman %', v.imp_materiales;
  end if;

  -- mano de obra: 2 h x 1 técnico x 45 = 90
  if v.imp_mano_obra is distinct from 90.00 then
    raise exception 'La mano de obra tenía que ser 90,00 y es %', v.imp_mano_obra;
  end if;

  -- desplazamiento: 30 fijos + 10 km x 0,45 = 34,50
  if v.imp_desplazamiento is distinct from 34.50 then
    raise exception 'El desplazamiento tenía que ser 34,50 y es %', v.imp_desplazamiento;
  end if;

  -- total: 90 + 34,50 + 147,90 = 272,40
  if v.imp_total is distinct from 272.40 then
    raise exception 'El total tenía que ser 272,40 y es %', v.imp_total;
  end if;

  -- coste: 2 h x 22 + 10 km x 0,2 + (38,5 + 25x2 + 10) = 44 + 2 + 98,5 = 144,50
  if v.coste_total is distinct from 144.50 then
    raise exception 'El coste tenía que ser 144,50 y es %', v.coste_total;
  end if;

  -- margen: 272,40 - 144,50 = 127,90
  if v.margen is distinct from 127.90 then
    raise exception 'El margen tenía que ser 127,90 y es %', v.margen;
  end if;

  raise notice 'Materiales, mano de obra, desplazamiento, total, coste y margen: los seis cuadran.';
end $$;

-- ---- El mínimo facturable manda sobre las horas reales -------------------
update public.avisos set horas = 0.25
 where id = '44444444-4444-4444-4444-444444444444';
select public.valorar_aviso('44444444-4444-4444-4444-444444444444');
do $$
declare v public.valoraciones%rowtype;
begin
  select * into v from public.valoraciones
   where aviso_id = '44444444-4444-4444-4444-444444444444';
  -- un cuarto de hora se cobra como el mínimo, que es 1 h: 45 €
  if v.imp_mano_obra is distinct from 45.00 then
    raise exception 'Con 15 minutos tenía que cobrarse el mínimo de 1 h (45,00) y sale %', v.imp_mano_obra;
  end if;
  raise notice 'El mínimo facturable manda sobre las horas reales.';
end $$;

-- ---- Una comercial se valora en cero ------------------------------------
update public.avisos set tipo = 'comercial', horas = 2
 where id = '44444444-4444-4444-4444-444444444444';
select public.valorar_aviso('44444444-4444-4444-4444-444444444444');
do $$
declare v public.valoraciones%rowtype;
begin
  select * into v from public.valoraciones
   where aviso_id = '44444444-4444-4444-4444-444444444444';
  if v.imp_total is distinct from 0.00 then
    raise exception 'Una comercial tenía que valer 0,00 y vale %', v.imp_total;
  end if;
  -- pero el coste sigue contando: una comercial cuesta dinero aunque no se cobre
  if v.coste_total <= 0 then
    raise exception 'El coste de una comercial no puede ser cero: es %', v.coste_total;
  end if;
  if v.margen >= 0 then
    raise exception 'El margen de una comercial tenía que salir negativo y es %', v.margen;
  end if;
  raise notice 'Una comercial se valora en cero, cuesta dinero y da margen negativo.';
end $$;

-- ---- Una urgencia lleva recargo -----------------------------------------
update public.avisos set tipo = 'urgencia'
 where id = '44444444-4444-4444-4444-444444444444';
select public.valorar_aviso('44444444-4444-4444-4444-444444444444');
do $$
declare v public.valoraciones%rowtype;
begin
  select * into v from public.valoraciones
   where aviso_id = '44444444-4444-4444-4444-444444444444';
  -- 2 h x 45 con el recargo del 50 % = 135
  if v.imp_mano_obra is distinct from 135.00 then
    raise exception 'Una urgencia tenía que cobrar 135,00 de mano de obra y cobra %', v.imp_mano_obra;
  end if;
  raise notice 'La urgencia lleva su recargo.';
end $$;

-- ---- Un contrato que incluye la preventiva ------------------------------
insert into public.contratos (id, cliente_id, estado, mano_obra_incluida,
                              desplazamiento_incluido, descuento_material)
  values ('55555555-5555-5555-5555-555555555555',
          '11111111-1111-1111-1111-111111111111', 'activo', true, true, 20)
  on conflict (id) do nothing;
update public.avisos set tipo = 'mantenimiento'
 where id = '44444444-4444-4444-4444-444444444444';
select public.valorar_aviso('44444444-4444-4444-4444-444444444444');
do $$
declare v public.valoraciones%rowtype;
begin
  select * into v from public.valoraciones
   where aviso_id = '44444444-4444-4444-4444-444444444444';
  if v.imp_mano_obra is distinct from 0.00 or v.imp_desplazamiento is distinct from 0.00 then
    raise exception 'Con la preventiva cubierta por contrato, mano de obra y desplazamiento tenían que ir a cero y van a % y %',
      v.imp_mano_obra, v.imp_desplazamiento;
  end if;
  if v.imp_materiales <= 0 then
    raise exception 'El material NO entra en la cuota del contrato: tenía que cobrarse y vale %', v.imp_materiales;
  end if;
  raise notice 'El contrato cubre la preventiva, y el material se sigue cobrando con su descuento.';
end $$;

-- ---- Y una avería NO entra en el contrato -------------------------------
update public.avisos set tipo = 'averia'
 where id = '44444444-4444-4444-4444-444444444444';
select public.valorar_aviso('44444444-4444-4444-4444-444444444444');
do $$
declare v public.valoraciones%rowtype;
begin
  select * into v from public.valoraciones
   where aviso_id = '44444444-4444-4444-4444-444444444444';
  if v.imp_mano_obra <= 0 then
    raise exception 'Una avería no entra en el contrato: la mano de obra tenía que cobrarse y vale %', v.imp_mano_obra;
  end if;
  raise notice 'Una avería no entra en el contrato, aunque el cliente lo tenga.';
end $$;
