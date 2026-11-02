-- ============================================================================
-- Pruebas del desplazamiento por ruta
--
-- POR QUÉ EXISTEN
-- Esto cambia cómo se cobra el desplazamiento de TODAS las visitas, así que los
-- números se comprueban uno a uno y calculados a mano, no «parece que sale».
--
-- Los datos del caso:
--   importe fijo de salida ... 30,00    precio por km ... 0,45
--   coste por km ............. 0,20
--   ruta 1 ... cobra 30,00  cuesta 10,00
--   ruta 2 ... cobra 45,00  cuesta 15,00
--   ruta 4 ... con nombre pero SIN importe: no está valorada todavía
-- ============================================================================

update public.tarifas
   set precio_hora = 45, coste_hora = 22, minimo_horas = 1, recargo_urgencia = 50,
       desplazamiento_fijo = 30, precio_km = 0.45, coste_km = 0.2,
       recargo_material = 40, iva = 21,
       ruta1_nombre = 'El Puerto', ruta1_importe = 30, ruta1_coste = 10,
       ruta2_nombre = 'Jerez',     ruta2_importe = 45, ruta2_coste = 15,
       ruta4_nombre = 'Huelva',    ruta4_importe = null, ruta4_coste = null
 where id = 1;

insert into public.clientes (id, nombre) values
  ('cccccccc-0000-0000-0000-000000000001', 'Cliente de las rutas')
  on conflict (id) do nothing;

delete from public.valoraciones where aviso_id in (
  'cccccccc-0000-0000-0000-00000000000a','cccccccc-0000-0000-0000-00000000000b',
  'cccccccc-0000-0000-0000-00000000000c','cccccccc-0000-0000-0000-00000000000d');
delete from public.avisos where id in (
  'cccccccc-0000-0000-0000-00000000000a','cccccccc-0000-0000-0000-00000000000b',
  'cccccccc-0000-0000-0000-00000000000c','cccccccc-0000-0000-0000-00000000000d');

-- Las cuatro visitas: dos horas, un técnico, sin material, para que el
-- desplazamiento sea lo único que cambie entre ellas.
insert into public.avisos (id, tipo, estado, cliente_id, horas, num_tecnicos, desplazamiento, ruta, cerrado) values
  ('cccccccc-0000-0000-0000-00000000000a','averia','cerrado','cccccccc-0000-0000-0000-000000000001',2,1,null,'ruta2', now()),
  ('cccccccc-0000-0000-0000-00000000000b','averia','cerrado','cccccccc-0000-0000-0000-000000000001',2,1,  20,'km',    now()),
  ('cccccccc-0000-0000-0000-00000000000c','averia','cerrado','cccccccc-0000-0000-0000-000000000001',2,1,null,null,    now()),
  ('cccccccc-0000-0000-0000-00000000000d','averia','cerrado','cccccccc-0000-0000-0000-000000000001',2,1,null,'ruta4', now());

select public.valorar_aviso('cccccccc-0000-0000-0000-00000000000a');
select public.valorar_aviso('cccccccc-0000-0000-0000-00000000000b');
select public.valorar_aviso('cccccccc-0000-0000-0000-00000000000c');
select public.valorar_aviso('cccccccc-0000-0000-0000-00000000000d');

do $$
declare
  v public.valoraciones%rowtype;
  n integer;
begin
  -- ---- 1. Con ruta, se cobra la ruta ------------------------------------
  select * into v from public.valoraciones where aviso_id = 'cccccccc-0000-0000-0000-00000000000a';
  if v.imp_desplazamiento is distinct from 45.00 then
    raise exception 'La ruta 2 cobra 45,00 y ha salido %', v.imp_desplazamiento;
  end if;
  -- coste: 2 h x 22 = 44 de mano de obra, más 15 de la ruta = 59
  if v.coste_total is distinct from 59.00 then
    raise exception 'El coste tenía que ser 59,00 (44 de horas + 15 de la ruta) y es %', v.coste_total;
  end if;

  -- ---- 2. Fuera de ruta, la cuenta de siempre ---------------------------
  -- 30 fijos + 20 km x 0,45 = 39,00 ; coste 20 x 0,20 = 4,00
  select * into v from public.valoraciones where aviso_id = 'cccccccc-0000-0000-0000-00000000000b';
  if v.imp_desplazamiento is distinct from 39.00 then
    raise exception 'Fuera de ruta, 30 fijos + 20 km a 0,45 son 39,00, y ha salido %', v.imp_desplazamiento;
  end if;
  if v.coste_total is distinct from 48.00 then
    raise exception 'El coste tenía que ser 48,00 (44 de horas + 4 de kilómetros) y es %', v.coste_total;
  end if;

  -- ---- 3. Sin ruta apuntada, se valora como ruta 1 ----------------------
  select * into v from public.valoraciones where aviso_id = 'cccccccc-0000-0000-0000-00000000000c';
  if v.imp_desplazamiento is distinct from 30.00 then
    raise exception 'Sin ruta se cobra la ruta 1, que son 30,00, y ha salido %', v.imp_desplazamiento;
  end if;

  -- ---- 4. Una ruta sin valorar no se inventa un importe -----------------
  select * into v from public.valoraciones where aviso_id = 'cccccccc-0000-0000-0000-00000000000d';
  if v.imp_desplazamiento is distinct from 0.00 then
    raise exception 'Una ruta sin importe puesto tiene que salir a cero, no inventarse un número, y ha salido %', v.imp_desplazamiento;
  end if;
  -- y se ve en la lista, que para eso está
  select count(*) into n from public.visitas_ruta_sin_valorar
   where aviso_id = 'cccccccc-0000-0000-0000-00000000000d';
  if n <> 1 then
    raise exception 'Esa visita tenía que salir en la lista de rutas sin valorar, y han salido % filas', n;
  end if;
  -- las que sí tienen ruta valorada, no
  select count(*) into n from public.visitas_ruta_sin_valorar
   where aviso_id in ('cccccccc-0000-0000-0000-00000000000a','cccccccc-0000-0000-0000-00000000000b');
  if n <> 0 then
    raise exception 'Una visita con su ruta valorada no es una ruta sin valorar, y han salido % filas', n;
  end if;

  -- ---- 5. Lo que ya estaba: el relleno no mueve el histórico ------------
  -- Una visita antigua con kilómetros se quedó en 'km', así que se le sigue
  -- cobrando lo mismo que antes. Se comprueba repitiendo el relleno: no puede
  -- cambiar nada de lo que ya tiene ruta.
  update public.avisos
     set ruta = case when coalesce(desplazamiento, 0) > 0 then 'km' else 'ruta1' end
   where ruta is null;
  select count(*) into n from public.avisos
   where id = 'cccccccc-0000-0000-0000-00000000000b' and ruta = 'km';
  if n <> 1 then
    raise exception 'La visita con kilómetros tenía que quedarse en «km»';
  end if;

  raise notice 'Con ruta se cobra el importe de la ruta, y su coste entra en el margen.';
  raise notice 'Fuera de ruta sigue siendo importe fijo más kilómetros, como siempre.';
  raise notice 'Sin ruta apuntada se valora como ruta 1.';
  raise notice 'Una ruta sin valorar sale a cero y aparece en su lista, sin inventar importes.';
end $$;

delete from public.valoraciones where aviso_id in (
  'cccccccc-0000-0000-0000-00000000000a','cccccccc-0000-0000-0000-00000000000b',
  'cccccccc-0000-0000-0000-00000000000c','cccccccc-0000-0000-0000-00000000000d');
delete from public.avisos where id in (
  'cccccccc-0000-0000-0000-00000000000a','cccccccc-0000-0000-0000-00000000000b',
  'cccccccc-0000-0000-0000-00000000000c','cccccccc-0000-0000-0000-00000000000d');
delete from public.clientes where id = 'cccccccc-0000-0000-0000-000000000001';
