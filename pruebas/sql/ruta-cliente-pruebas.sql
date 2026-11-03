-- ============================================================================
-- Pruebas de la ruta habitual del cliente y del centro
--
-- POR QUÉ EXISTEN
-- Dejar la ruta puesta en la ficha del cliente ahorra toques, y por eso mismo es
-- peligroso: si esa ruta llegara a decidir lo que se cobra, se estaría
-- facturando un desplazamiento que nadie ha elegido en esa visita. La prueba que
-- más importa de este fichero es la 3: la ruta del cliente NO cambia ni un
-- céntimo de ninguna valoración.
--
-- Los datos del caso:
--   ruta 1 ... cobra 30,00    ruta 2 ... cobra 45,00
--   Cliente «Nave en Jerez» ....... ruta2 en su ficha, sin centros
--   Cliente «Dos direcciones» ..... ruta1 en su ficha, un centro con ruta2
--   Cliente «Sin ruta» ............ nada, ni en ficha ni en centro, con visita
-- ============================================================================

update public.tarifas
   set precio_hora = 45, coste_hora = 22, minimo_horas = 1,
       desplazamiento_fijo = 30, precio_km = 0.45, coste_km = 0.2,
       recargo_material = 40, iva = 21,
       ruta1_nombre = 'El Puerto', ruta1_importe = 30, ruta1_coste = 10,
       ruta2_nombre = 'Jerez',     ruta2_importe = 45, ruta2_coste = 15
 where id = 1;

delete from public.valoraciones where aviso_id in (
  'dddddddd-0000-0000-0000-00000000000a','dddddddd-0000-0000-0000-00000000000b');
delete from public.avisos where id in (
  'dddddddd-0000-0000-0000-00000000000a','dddddddd-0000-0000-0000-00000000000b');
delete from public.centros where id = 'dddddddd-0000-0000-0000-0000000000c1';
delete from public.clientes where id in (
  'dddddddd-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000002',
  'dddddddd-0000-0000-0000-000000000003');

insert into public.clientes (id, nombre, ruta) values
  ('dddddddd-0000-0000-0000-000000000001', 'Nave en Jerez',  'ruta2'),
  ('dddddddd-0000-0000-0000-000000000002', 'Dos direcciones','ruta1'),
  ('dddddddd-0000-0000-0000-000000000003', 'Sin ruta',        null);

insert into public.centros (id, cliente_id, nombre, direccion, ruta) values
  ('dddddddd-0000-0000-0000-0000000000c1','dddddddd-0000-0000-0000-000000000002',
   'Tienda de Jerez','Calle Larga 1','ruta2');

-- Dos visitas del cliente que tiene ruta2 en su ficha. Una SIN ruta apuntada en
-- la visita, y otra con la ruta 1 apuntada a mano.
insert into public.avisos (id, tipo, estado, cliente_id, horas, num_tecnicos, desplazamiento, ruta, cerrado) values
  ('dddddddd-0000-0000-0000-00000000000a','averia','cerrado','dddddddd-0000-0000-0000-000000000001',2,1,null,null,   now()),
  ('dddddddd-0000-0000-0000-00000000000b','averia','cerrado','dddddddd-0000-0000-0000-000000000001',2,1,null,'ruta1',now());

-- Y una visita del cliente sin ruta, para que salga en la lista
insert into public.avisos (id, tipo, estado, cliente_id, horas, num_tecnicos, creado) values
  ('dddddddd-0000-0000-0000-00000000000c','averia','asignado','dddddddd-0000-0000-0000-000000000003',1,1, now())
  on conflict (id) do nothing;

select public.valorar_aviso('dddddddd-0000-0000-0000-00000000000a');
select public.valorar_aviso('dddddddd-0000-0000-0000-00000000000b');

do $$
declare
  v public.valoraciones%rowtype;
  n integer;
  txt text;
begin
  -- ---- 1. Las dos columnas existen y nacen vacías -----------------------
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'clientes' and column_name = 'ruta';
  if n <> 1 then raise exception 'Falta clientes.ruta'; end if;
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'centros' and column_name = 'ruta';
  if n <> 1 then raise exception 'Falta centros.ruta'; end if;
  raise notice 'clientes.ruta y centros.ruta existen';

  select ruta into txt from public.clientes where id = 'dddddddd-0000-0000-0000-000000000003';
  if txt is not null then
    raise exception 'La ruta tiene que nacer vacía, y ha salido %', txt;
  end if;
  raise notice 'nadie nace con una ruta puesta por el ordenador';

  -- ---- 2. No se puede guardar una ruta que no existe --------------------
  begin
    update public.clientes set ruta = 'ruta6'
     where id = 'dddddddd-0000-0000-0000-000000000003';
    raise exception 'Se ha dejado guardar «ruta6» en el cliente, y no existe';
  exception when check_violation then null;
  end;
  begin
    update public.centros set ruta = 'Ruta 2'
     where id = 'dddddddd-0000-0000-0000-0000000000c1';
    raise exception 'Se ha dejado guardar «Ruta 2» en el centro, y la ruta se escribe ruta2';
  exception when check_violation then null;
  end;
  raise notice 'una ruta mal escrita no entra, ni en el cliente ni en el centro';

  -- ---- 3. LA QUE MÁS IMPORTA --------------------------------------------
  -- La ruta del cliente NO decide lo que se cobra. La visita sin ruta apuntada
  -- se sigue cobrando como ruta 1 (30,00), aunque su cliente tenga la ruta 2
  -- (45,00) en la ficha. Lo que se cobra sale de avisos.ruta y de nada más.
  select * into v from public.valoraciones where aviso_id = 'dddddddd-0000-0000-0000-00000000000a';
  if v.imp_desplazamiento is distinct from 30.00 then
    raise exception 'Una visita sin ruta se cobra la ruta 1 (30,00) aunque el cliente tenga la 2; ha salido %',
      v.imp_desplazamiento;
  end if;
  -- y la que sí tiene ruta apuntada, se cobra la apuntada, no la del cliente
  select * into v from public.valoraciones where aviso_id = 'dddddddd-0000-0000-0000-00000000000b';
  if v.imp_desplazamiento is distinct from 30.00 then
    raise exception 'Se cobra la ruta apuntada en la visita (ruta1 = 30,00) y ha salido %',
      v.imp_desplazamiento;
  end if;
  raise notice 'la ruta del cliente no cambia ni un centimo de lo que se cobra';

  -- ---- 4. La lista de a quién le falta ----------------------------------
  -- El cliente sin ruta y con visita, sale
  select count(*) into n from public.clientes_sin_ruta
   where cliente_id = 'dddddddd-0000-0000-0000-000000000003';
  if n <> 1 then
    raise exception 'El cliente sin ruta y con visitas tenía que salir en la lista, y han salido % filas', n;
  end if;
  -- el que tiene ruta en su ficha, no
  select count(*) into n from public.clientes_sin_ruta
   where cliente_id = 'dddddddd-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'El cliente con ruta en su ficha no le falta nada'; end if;
  -- el que no tiene ruta en la ficha pero sí en un centro, tampoco
  update public.clientes set ruta = null where id = 'dddddddd-0000-0000-0000-000000000002';
  select count(*) into n from public.clientes_sin_ruta
   where cliente_id = 'dddddddd-0000-0000-0000-000000000002';
  if n <> 0 then
    raise exception 'Un cliente con la ruta puesta en un centro suyo no es un cliente sin ruta';
  end if;
  raise notice 'la lista dice a quien le falta, y solo a quien le falta';

  -- ---- 5. Un cliente sin visitas no molesta en la lista -----------------
  -- Hay fichas de clientes de hace años sin ninguna visita: si salieran, la
  -- lista sería inútil el primer día.
  insert into public.clientes (id, nombre) values
    ('dddddddd-0000-0000-0000-000000000004','Ficha vieja sin visitas')
    on conflict (id) do nothing;
  select count(*) into n from public.clientes_sin_ruta
   where cliente_id = 'dddddddd-0000-0000-0000-000000000004';
  if n <> 0 then raise exception 'Un cliente sin visitas no tiene por qué salir en la lista'; end if;
  raise notice 'los clientes sin visitas no ensucian la lista';

  -- ---- 6. Dos veces seguidas no hace daño -------------------------------
  -- Se comprueba de verdad en las tres vueltas de sql.sh; aquí se deja dicho.
  raise notice 'el fichero se puede ejecutar dos veces (tres vueltas en sql.sh)';
end $$;
