-- ============================================================================
-- Pruebas del recargo de urgencia
--
-- POR QUÉ EXISTEN
-- Esto multiplica por dos o por tres lo que se le cobra al cliente, así que los
-- números van calculados a mano, uno a uno, y no «parece que sale».
--
-- Y hay una comprobación que importa tanto como las cuentas: que una urgencia
-- de antes del 04-11-2026, que no tiene factor, siga valiendo EXACTAMENTE lo
-- que valía. Si al volver a calcularla cambiara de importe, estaríamos
-- cambiando facturas ya emitidas.
--
-- Los datos:
--   precio_hora 45   coste_hora 22   mínimo 1 h
--   recargo_urgencia 50 %  (el de antes)
--   ruta 2: cobra 45,00 y cuesta 15,00
--   Visita de 2 h, un técnico, sin material.
--
--   Normal      →  mano 90,00  desp 45,00  total 135,00
--                  coste 2×22 + 15 = 59,00
--   Urgencia ×2 →  mano 180,00 desp 90,00 total 270,00
--                  coste 2×44 + 30 = 118,00
--   Urgencia ×3 →  mano 270,00 desp 135,00 total 405,00
--                  coste 2×66 + 45 = 177,00
--   Urgencia vieja (sin factor, 50 %) → mano 135,00 desp 45,00 total 180,00
--                  coste 2×22 + 15 = 59,00   (al coste nunca se le aplicó)
-- ============================================================================

update public.tarifas
   set precio_hora = 45, coste_hora = 22, minimo_horas = 1, recargo_urgencia = 50,
       desplazamiento_fijo = 30, precio_km = 0.45, coste_km = 0.2,
       recargo_material = 40, iva = 21,
       ruta1_nombre = 'El Puerto', ruta1_importe = 30, ruta1_coste = 10,
       ruta2_nombre = 'Jerez',     ruta2_importe = 45, ruta2_coste = 15
 where id = 1;

insert into public.clientes (id, nombre) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'Cliente de las urgencias')
  on conflict (id) do nothing;

delete from public.valoraciones where aviso_id::text like 'aaaaaaaa-1111-0000-0000-00000000000%';
delete from public.avisos      where id::text      like 'aaaaaaaa-1111-0000-0000-00000000000%';

insert into public.avisos (id, tipo, estado, cliente_id, horas, num_tecnicos, ruta, urgencia_factor, cerrado) values
  ('aaaaaaaa-1111-0000-0000-00000000000a','averia',  'cerrado','aaaaaaaa-1111-0000-0000-000000000001',2,1,'ruta2',null, now()),
  ('aaaaaaaa-1111-0000-0000-00000000000b','urgencia','cerrado','aaaaaaaa-1111-0000-0000-000000000001',2,1,'ruta2',   2, now()),
  ('aaaaaaaa-1111-0000-0000-00000000000c','urgencia','cerrado','aaaaaaaa-1111-0000-0000-000000000001',2,1,'ruta2',   3, now()),
  -- la de antes: urgencia sin factor
  ('aaaaaaaa-1111-0000-0000-00000000000d','urgencia','cerrado','aaaaaaaa-1111-0000-0000-000000000001',2,1,'ruta2',null, now()),
  -- y un factor puesto en algo que NO es urgencia: no puede cobrar de más
  ('aaaaaaaa-1111-0000-0000-00000000000e','averia',  'cerrado','aaaaaaaa-1111-0000-0000-000000000001',2,1,'ruta2',   3, now());

select public.valorar_aviso('aaaaaaaa-1111-0000-0000-00000000000a');
select public.valorar_aviso('aaaaaaaa-1111-0000-0000-00000000000b');
select public.valorar_aviso('aaaaaaaa-1111-0000-0000-00000000000c');
select public.valorar_aviso('aaaaaaaa-1111-0000-0000-00000000000d');
select public.valorar_aviso('aaaaaaaa-1111-0000-0000-00000000000e');

do $$
declare
  v public.valoraciones%rowtype;
  n integer;
  t public.tarifas%rowtype;
begin
  -- ---- 1. Lo que hay puesto ----------------------------------------------
  select * into t from public.tarifas where id = 1;
  if t.urgencia_x_laboral is distinct from 2 or t.urgencia_x_fuera is distinct from 3 then
    raise exception 'Los factores de fábrica tenían que ser 2 y 3, y son % y %',
      t.urgencia_x_laboral, t.urgencia_x_fuera;
  end if;
  if t.urgencia_desde is distinct from 8 or t.urgencia_hasta is distinct from 18 then
    raise exception 'La franja tenía que ser de 8 a 18, y es de % a %',
      t.urgencia_desde, t.urgencia_hasta;
  end if;
  raise notice 'los factores (2 y 3) y la franja (8 a 18) estan puestos';

  -- ---- 2. Una visita normal no cambia ------------------------------------
  select * into v from public.valoraciones where aviso_id = 'aaaaaaaa-1111-0000-0000-00000000000a';
  if v.imp_total is distinct from 135.00 or v.coste_total is distinct from 59.00 then
    raise exception 'Una correctiva normal son 135,00 y 59,00 de coste; han salido % y %',
      v.imp_total, v.coste_total;
  end if;
  raise notice 'una visita que no es urgencia no cambia nada';

  -- ---- 3. Urgencia ×2 -----------------------------------------------------
  select * into v from public.valoraciones where aviso_id = 'aaaaaaaa-1111-0000-0000-00000000000b';
  if v.imp_mano_obra is distinct from 180.00 then
    raise exception 'La mano de obra ×2 son 180,00 y ha salido %', v.imp_mano_obra;
  end if;
  if v.imp_desplazamiento is distinct from 90.00 then
    raise exception 'El desplazamiento ×2 son 90,00 y ha salido %', v.imp_desplazamiento;
  end if;
  if v.imp_total is distinct from 270.00 then
    raise exception 'El total ×2 son 270,00 y ha salido %', v.imp_total;
  end if;
  -- el coste también sube: 2 h × 44 + 30 de ruta = 118
  if v.coste_total is distinct from 118.00 then
    raise exception 'El coste ×2 son 118,00 (2×44 de horas + 30 de ruta) y ha salido %', v.coste_total;
  end if;
  raise notice 'urgencia en horario laboral: hora, desplazamiento Y coste, por dos';

  -- ---- 4. Urgencia ×3 -----------------------------------------------------
  select * into v from public.valoraciones where aviso_id = 'aaaaaaaa-1111-0000-0000-00000000000c';
  if v.imp_mano_obra is distinct from 270.00 or v.imp_desplazamiento is distinct from 135.00
     or v.imp_total is distinct from 405.00 then
    raise exception 'La urgencia ×3 tenía que ser 270 + 135 = 405 y ha salido % + % = %',
      v.imp_mano_obra, v.imp_desplazamiento, v.imp_total;
  end if;
  if v.coste_total is distinct from 177.00 then
    raise exception 'El coste ×3 son 177,00 (2×66 + 45) y ha salido %', v.coste_total;
  end if;
  -- y el margen sigue siendo la resta, no un número aparte
  if v.margen is distinct from (405.00 - 177.00) then
    raise exception 'El margen tenía que ser 228,00 y es %', v.margen;
  end if;
  raise notice 'urgencia fuera de horario: por tres, y el margen cuadra con la resta';

  -- ---- 5. LA QUE PROTEGE EL HISTÓRICO ------------------------------------
  -- Una urgencia de las de antes, sin factor: el porcentaje de siempre sobre el
  -- precio (45 × 1,5 = 67,50 la hora) y el coste SIN tocar.
  select * into v from public.valoraciones where aviso_id = 'aaaaaaaa-1111-0000-0000-00000000000d';
  if v.imp_mano_obra is distinct from 135.00 then
    raise exception 'Una urgencia vieja lleva el 50 %% de antes: 2 h × 67,50 = 135,00, y ha salido %',
      v.imp_mano_obra;
  end if;
  if v.imp_desplazamiento is distinct from 45.00 then
    raise exception 'A una urgencia vieja no se le tocaba el desplazamiento: 45,00, y ha salido %',
      v.imp_desplazamiento;
  end if;
  if v.coste_total is distinct from 59.00 then
    raise exception 'A una urgencia vieja no se le tocaba el coste: 59,00, y ha salido %', v.coste_total;
  end if;
  raise notice 'una urgencia anterior al 04-11-2026 vale EXACTAMENTE lo que valia';

  -- ---- 6. El factor solo manda en las urgencias --------------------------
  -- Si alguien pone un factor en una correctiva, no puede cobrar el triple.
  select * into v from public.valoraciones where aviso_id = 'aaaaaaaa-1111-0000-0000-00000000000e';
  if v.imp_total is distinct from 135.00 then
    raise exception 'Un factor en algo que no es urgencia no puede cobrar de más: 135,00 y ha salido %',
      v.imp_total;
  end if;
  raise notice 'un factor en algo que no es urgencia no cobra de mas';

  -- ---- 7. Un factor imposible no entra -----------------------------------
  begin
    update public.avisos set urgencia_factor = 50
     where id = 'aaaaaaaa-1111-0000-0000-00000000000b';
    raise exception 'Se ha dejado guardar un factor de 50: eso multiplica por cincuenta una factura';
  exception when check_violation then null;
  end;
  raise notice 'un factor disparatado no entra en la base';

  -- ---- 8. La lista de las que se quedaron sin factor ---------------------
  select count(*) into n from public.urgencias_sin_factor
   where aviso_id = 'aaaaaaaa-1111-0000-0000-00000000000d';
  if n <> 1 then raise exception 'La urgencia sin factor tenía que salir en su lista'; end if;
  select count(*) into n from public.urgencias_sin_factor
   where aviso_id = 'aaaaaaaa-1111-0000-0000-00000000000b';
  if n <> 0 then raise exception 'Una urgencia CON factor no puede salir en esa lista'; end if;
  raise notice 'la lista saca las urgencias sin factor, y solo esas';
end $$;
