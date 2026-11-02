-- ============================================================================
-- Pruebas de lo que entra y lo que no entra en pendiente de facturar y en
-- impagados
--
-- POR QUÉ EXISTEN
-- La lista de pendiente de facturar excluía lo cobrado en obra, y por eso esas
-- visitas no las facturaba nadie. Es un fallo de una sola condición, del tipo
-- que vuelve en cuanto alguien reordena un filtro, así que queda fijado aquí
-- con datos de verdad.
--
-- Lo que se comprueba:
--   1. Cobrada en obra y sin facturar: SÍ está pendiente de facturar.
--   2. Facturada: no.
--   3. Sin cargo o anulada: tampoco, que no se cobran.
--   4. Facturada, vencida y sin cobrar: sale como impagada, con sus días.
--   5. Facturada, vencida y COBRADA: no.
--   6. Facturada y sin vencimiento: tampoco. Sin saber cuándo vencía no se
--      puede decir que esté vencida, y un impagado inventado hace llamar a un
--      cliente que no debe nada.
-- ============================================================================

insert into public.clientes (id, nombre, plazo_pago_dias) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Cliente de la factura', 30)
  on conflict (id) do nothing;

delete from public.valoraciones where aviso_id in (
  'bbbbbbbb-0000-0000-0000-00000000000a','bbbbbbbb-0000-0000-0000-00000000000b',
  'bbbbbbbb-0000-0000-0000-00000000000c','bbbbbbbb-0000-0000-0000-00000000000d',
  'bbbbbbbb-0000-0000-0000-00000000000e','bbbbbbbb-0000-0000-0000-00000000000f',
  'bbbbbbbb-0000-0000-0000-000000000010');
delete from public.avisos where id in (
  'bbbbbbbb-0000-0000-0000-00000000000a','bbbbbbbb-0000-0000-0000-00000000000b',
  'bbbbbbbb-0000-0000-0000-00000000000c','bbbbbbbb-0000-0000-0000-00000000000d',
  'bbbbbbbb-0000-0000-0000-00000000000e','bbbbbbbb-0000-0000-0000-00000000000f',
  'bbbbbbbb-0000-0000-0000-000000000010');

-- a) cerrada, COBRADA EN OBRA, sin facturar  → pendiente de facturar
insert into public.avisos (id, tipo, estado, cliente_id, cerrado, cobrado, cobro_importe, cobro_forma)
  values ('bbbbbbbb-0000-0000-0000-00000000000a', 'averia', 'cerrado',
          'bbbbbbbb-0000-0000-0000-000000000001', now() - interval '3 days',
          true, 110, 'efectivo');
-- b) cerrada y ya facturada → no
insert into public.avisos (id, tipo, estado, cliente_id, cerrado)
  values ('bbbbbbbb-0000-0000-0000-00000000000b', 'averia', 'cerrado',
          'bbbbbbbb-0000-0000-0000-000000000001', now() - interval '20 days');
-- c) sin cargo → no
insert into public.avisos (id, tipo, estado, cliente_id, cerrado, sin_cargo)
  values ('bbbbbbbb-0000-0000-0000-00000000000c', 'averia', 'cerrado',
          'bbbbbbbb-0000-0000-0000-000000000001', now() - interval '5 days', true);
-- d) anulada → no
insert into public.avisos (id, tipo, estado, cliente_id, cerrado, anulada)
  values ('bbbbbbbb-0000-0000-0000-00000000000d', 'averia', 'cerrado',
          'bbbbbbbb-0000-0000-0000-000000000001', now() - interval '6 days', true);
-- e) facturada, vencida hace 15 días y sin cobrar → impagada
insert into public.avisos (id, tipo, estado, cliente_id, cerrado)
  values ('bbbbbbbb-0000-0000-0000-00000000000e', 'averia', 'cerrado',
          'bbbbbbbb-0000-0000-0000-000000000001', now() - interval '60 days');
-- f) facturada, vencida y COBRADA → no
insert into public.avisos (id, tipo, estado, cliente_id, cerrado)
  values ('bbbbbbbb-0000-0000-0000-00000000000f', 'averia', 'cerrado',
          'bbbbbbbb-0000-0000-0000-000000000001', now() - interval '60 days');
-- g) facturada y sin vencimiento puesto → no
insert into public.avisos (id, tipo, estado, cliente_id, cerrado)
  values ('bbbbbbbb-0000-0000-0000-000000000010', 'averia', 'cerrado',
          'bbbbbbbb-0000-0000-0000-000000000001', now() - interval '60 days');

insert into public.valoraciones (aviso_id, imp_total, facturado, factura_ref, facturado_el, vence_el, cobrado_el) values
  ('bbbbbbbb-0000-0000-0000-00000000000a', 110, false, null, null, null, null),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 200, true, 'F-2026-0100', current_date - 10, current_date + 20, null),
  ('bbbbbbbb-0000-0000-0000-00000000000c',   0, false, null, null, null, null),
  ('bbbbbbbb-0000-0000-0000-00000000000d', 150, false, null, null, null, null),
  ('bbbbbbbb-0000-0000-0000-00000000000e', 300, true, 'F-2026-0101', current_date - 45, current_date - 15, null),
  ('bbbbbbbb-0000-0000-0000-00000000000f', 400, true, 'F-2026-0102', current_date - 45, current_date - 15, current_date - 2),
  ('bbbbbbbb-0000-0000-0000-000000000010', 500, true, 'F-2026-0103', current_date - 45, null, null);

do $$
declare
  n integer; d integer; t numeric;
begin
  -- ---- 1. Lo cobrado en obra sigue pendiente de facturar -----------------
  select count(*) into n from public.pendiente_de_facturar
   where aviso_id = 'bbbbbbbb-0000-0000-0000-00000000000a';
  if n <> 1 then
    raise exception 'Una visita cobrada en obra y sin facturar TIENE que estar pendiente de facturar, y no está. Ese era el agujero: se cobraba y no la facturaba nadie.';
  end if;
  -- y se ve que está cobrada, para que la oficina sepa que no hay que volver a cobrar
  select cobro_importe into t from public.pendiente_de_facturar
   where aviso_id = 'bbbbbbbb-0000-0000-0000-00000000000a';
  if t is distinct from 110 then
    raise exception 'La lista tenía que decir que ya se cobraron 110 € en obra, y dice %', t;
  end if;

  -- ---- 2 y 3. Lo que no entra --------------------------------------------
  select count(*) into n from public.pendiente_de_facturar
   where aviso_id in ('bbbbbbbb-0000-0000-0000-00000000000b',
                      'bbbbbbbb-0000-0000-0000-00000000000c',
                      'bbbbbbbb-0000-0000-0000-00000000000d');
  if n <> 0 then
    raise exception 'Lo facturado, lo que no se cobra y lo anulado no está pendiente de facturar, y han salido % filas', n;
  end if;

  -- ---- 4. El impagado, con sus días de retraso ----------------------------
  select dias_de_retraso, imp_total into d, t from public.impagados
   where aviso_id = 'bbbbbbbb-0000-0000-0000-00000000000e';
  if d is distinct from 15 then
    raise exception 'Esa factura venció hace 15 días, y la vista dice %', d;
  end if;
  if t is distinct from 300 then
    raise exception 'El importe impagado tenía que ser 300 y es %', t;
  end if;

  -- ---- 5 y 6. Lo que NO es un impagado ------------------------------------
  select count(*) into n from public.impagados
   where aviso_id in ('bbbbbbbb-0000-0000-0000-00000000000f',
                      'bbbbbbbb-0000-0000-0000-000000000010');
  if n <> 0 then
    raise exception 'Una factura cobrada, y una sin fecha de vencimiento, no son impagados: han salido % filas', n;
  end if;

  raise notice 'Lo cobrado en obra sigue pendiente de facturar, y la lista dice cuánto se cobró.';
  raise notice 'Lo facturado, lo que no se cobra y lo anulado se quedan fuera.';
  raise notice 'Un impagado sale con sus días de retraso y su importe.';
  raise notice 'Y una factura cobrada, o sin vencimiento, no se inventa como impagada.';
end $$;

delete from public.valoraciones where aviso_id in (
  'bbbbbbbb-0000-0000-0000-00000000000a','bbbbbbbb-0000-0000-0000-00000000000b',
  'bbbbbbbb-0000-0000-0000-00000000000c','bbbbbbbb-0000-0000-0000-00000000000d',
  'bbbbbbbb-0000-0000-0000-00000000000e','bbbbbbbb-0000-0000-0000-00000000000f',
  'bbbbbbbb-0000-0000-0000-000000000010');
delete from public.avisos where id in (
  'bbbbbbbb-0000-0000-0000-00000000000a','bbbbbbbb-0000-0000-0000-00000000000b',
  'bbbbbbbb-0000-0000-0000-00000000000c','bbbbbbbb-0000-0000-0000-00000000000d',
  'bbbbbbbb-0000-0000-0000-00000000000e','bbbbbbbb-0000-0000-0000-00000000000f',
  'bbbbbbbb-0000-0000-0000-000000000010');
delete from public.clientes where id = 'bbbbbbbb-0000-0000-0000-000000000001';
