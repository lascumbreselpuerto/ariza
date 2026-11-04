-- ============================================================================
-- Pruebas del subtipo de las asistencias
--
-- POR QUÉ EXISTEN
-- Garantía deja de ser un tipo y pasa a ser un subtipo de la correctiva. Eso
-- toca la única regla de la valoración que pone una visita a cero euros, así
-- que hay dos maneras de hacerlo mal, y las dos cuestan dinero:
--
--   · que una garantía nueva se facture, porque la regla solo mira el tipo;
--   · que una garantía vieja empiece a facturarse, porque la regla solo mira
--     el subtipo y el histórico no lo tiene.
--
-- Las dos están probadas aquí, una en cada dirección.
--
-- Los datos: 2 h, un técnico, ruta 2 (45 €), sin material.
--   precio_hora 45  →  mano de obra 90,00
--   ruta 2          →  desplazamiento 45,00
--   total normal    →  135,00
-- ============================================================================

update public.tarifas
   set precio_hora = 45, coste_hora = 22, minimo_horas = 1,
       desplazamiento_fijo = 30, precio_km = 0.45, coste_km = 0.2,
       recargo_material = 40, iva = 21,
       ruta1_nombre = 'El Puerto', ruta1_importe = 30, ruta1_coste = 10,
       ruta2_nombre = 'Jerez',     ruta2_importe = 45, ruta2_coste = 15
 where id = 1;

insert into public.clientes (id, nombre) values
  ('ffffffff-0000-0000-0000-000000000001', 'Cliente de los subtipos')
  on conflict (id) do nothing;

delete from public.valoraciones where aviso_id::text like 'ffffffff-0000-0000-0000-00000000000%';
delete from public.avisos      where id::text      like 'ffffffff-0000-0000-0000-00000000000%';

insert into public.avisos (id, tipo, subtipo, estado, cliente_id, horas, num_tecnicos, ruta, cerrado) values
  -- correctiva normal: se cobra
  ('ffffffff-0000-0000-0000-00000000000a','averia','averia','cerrado',
   'ffffffff-0000-0000-0000-000000000001',2,1,'ruta2', now()),
  -- correctiva en garantía: NO se cobra
  ('ffffffff-0000-0000-0000-00000000000b','averia','garantia','cerrado',
   'ffffffff-0000-0000-0000-000000000001',2,1,'ruta2', now()),
  -- garantía de las de antes, por tipo y sin subtipo: tampoco se cobra
  ('ffffffff-0000-0000-0000-00000000000c','garantia',null,'cerrado',
   'ffffffff-0000-0000-0000-000000000001',2,1,'ruta2', now()),
  -- normativa de las de antes: esa SÍ se cobra, y se seguía cobrando
  ('ffffffff-0000-0000-0000-00000000000d','normativa',null,'cerrado',
   'ffffffff-0000-0000-0000-000000000001',2,1,'ruta2', now()),
  -- instalación con su subtipo nuevo: se cobra como cualquier trabajo
  ('ffffffff-0000-0000-0000-00000000000e','instalacion','puerta_automatica','cerrado',
   'ffffffff-0000-0000-0000-000000000001',2,1,'ruta2', now());

select public.valorar_aviso('ffffffff-0000-0000-0000-00000000000a');
select public.valorar_aviso('ffffffff-0000-0000-0000-00000000000b');
select public.valorar_aviso('ffffffff-0000-0000-0000-00000000000c');
select public.valorar_aviso('ffffffff-0000-0000-0000-00000000000d');
select public.valorar_aviso('ffffffff-0000-0000-0000-00000000000e');

do $$
declare
  v public.valoraciones%rowtype;
  n integer;
begin
  -- ---- 1. Las columnas están ---------------------------------------------
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='avisos' and column_name='subtipo';
  if n <> 1 then raise exception 'Falta avisos.subtipo'; end if;
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='avisos' and column_name='tipos_puerta';
  if n <> 1 then raise exception 'Falta avisos.tipos_puerta'; end if;
  raise notice 'avisos.subtipo y avisos.tipos_puerta existen';

  -- ---- 2. Un subtipo inventado no entra ----------------------------------
  begin
    update public.avisos set subtipo = 'Garantia'
     where id = 'ffffffff-0000-0000-0000-00000000000a';
    raise exception 'Se ha dejado guardar «Garantia» con mayúscula: la regla no lo reconocería';
  exception when check_violation then null;
  end;
  raise notice 'un subtipo mal escrito no entra';

  -- ---- 3. La correctiva normal se cobra ----------------------------------
  select * into v from public.valoraciones where aviso_id = 'ffffffff-0000-0000-0000-00000000000a';
  if v.imp_total is distinct from 135.00 then
    raise exception 'Una correctiva de 2 h con ruta 2 son 135,00 y ha salido %', v.imp_total;
  end if;
  raise notice 'una correctiva normal se cobra entera';

  -- ---- 4. LA QUE IMPORTA (ida): la garantía NUEVA no se cobra ------------
  select * into v from public.valoraciones where aviso_id = 'ffffffff-0000-0000-0000-00000000000b';
  if v.imp_total is distinct from 0.00 then
    raise exception 'Una garantía por subtipo tiene que salir a cero y ha salido %', v.imp_total;
  end if;
  -- y aun así cuesta dinero: el margen tiene que ser negativo
  if v.coste_total <= 0 or v.margen >= 0 then
    raise exception 'Una garantía no se cobra pero cuesta: coste % y margen %', v.coste_total, v.margen;
  end if;
  raise notice 'una garantia por subtipo no se cobra, y su coste sigue contando';

  -- ---- 5. LA QUE IMPORTA (vuelta): la garantía VIEJA sigue sin cobrarse --
  select * into v from public.valoraciones where aviso_id = 'ffffffff-0000-0000-0000-00000000000c';
  if v.imp_total is distinct from 0.00 then
    raise exception 'Una garantía de las antiguas, por tipo, tiene que seguir a cero y ha salido %',
      v.imp_total;
  end if;
  raise notice 'una garantia de las antiguas sigue sin cobrarse';

  -- ---- 6. Y lo que nunca estuvo a cero, no se pone a cero ----------------
  select * into v from public.valoraciones where aviso_id = 'ffffffff-0000-0000-0000-00000000000d';
  if v.imp_total is distinct from 135.00 then
    raise exception 'Una normativa se cobra como siempre, 135,00, y ha salido %', v.imp_total;
  end if;
  select * into v from public.valoraciones where aviso_id = 'ffffffff-0000-0000-0000-00000000000e';
  if v.imp_total is distinct from 135.00 then
    raise exception 'Una instalación se cobra como siempre y ha salido %', v.imp_total;
  end if;
  raise notice 'normativa e instalacion se cobran como siempre: el subtipo no cambia su importe';

  -- ---- 7. La lista de lo que quedó sin subtipo ---------------------------
  -- La instalación de arriba tiene subtipo, así que no sale.
  select count(*) into n from public.avisos_sin_subtipo
   where aviso_id = 'ffffffff-0000-0000-0000-00000000000e';
  if n <> 0 then raise exception 'Una asistencia CON subtipo no puede salir en la lista de las que no lo tienen'; end if;
  -- una correctiva sin subtipo, sí
  insert into public.avisos (id, tipo, estado, cliente_id, creado)
   values ('ffffffff-0000-0000-0000-00000000000f','averia','asignado',
           'ffffffff-0000-0000-0000-000000000001', now());
  select count(*) into n from public.avisos_sin_subtipo
   where aviso_id = 'ffffffff-0000-0000-0000-00000000000f';
  if n <> 1 then raise exception 'Una correctiva sin subtipo tenía que salir en la lista'; end if;
  raise notice 'la lista saca lo que quedo sin subtipo, y solo eso';
end $$;
