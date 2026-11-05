-- ============================================================================
-- Pruebas del alta de puerta en todas las visitas
--
-- POR QUÉ EXISTEN
-- Este fichero no cambia ningún importe, así que lo que hay que vigilar es otra
-- cosa: que las dos listas de la oficina digan la verdad. Si la de «visitas sin
-- puerta» se queda corta, la válvula deja de verse y el alta de puerta se
-- convierte en opcional sin que nadie lo decida; y si saca visitas que sí
-- documentaron su puerta, nadie la mirará.
-- ============================================================================

insert into public.clientes (id, nombre) values
  ('cccccccc-0000-0000-0000-000000000001', 'Cliente del alta de puerta')
  on conflict (id) do nothing;

delete from public.aviso_puertas where aviso_id::text like 'cccccccc-0000-0000-0000-00000000000%';
delete from public.valoraciones  where aviso_id::text like 'cccccccc-0000-0000-0000-00000000000%';
delete from public.avisos        where id::text      like 'cccccccc-0000-0000-0000-00000000000%';
delete from public.puertas       where id::text      like 'cccccccc-1111-0000-0000-00000000000%';

insert into public.puertas (id, codigo, cliente_id, tipo) values
  ('cccccccc-1111-0000-0000-000000000001','AR-7001','cccccccc-0000-0000-0000-000000000001','Seccional');

insert into public.avisos (id, tipo, estado, cliente_id, puerta_id, horas, cerrado,
                           sin_puerta, sin_puerta_motivo, descripcion) values
  -- avería cerrada CON su puerta: no sale en ninguna de las dos listas
  ('cccccccc-0000-0000-0000-00000000000a','averia','cerrado',
   'cccccccc-0000-0000-0000-000000000001','cccccccc-1111-0000-0000-000000000001',
   2, now(), false, null, 'No cerraba'),
  -- avería cerrada declarando que no había puerta: sale en la de la válvula
  ('cccccccc-0000-0000-0000-00000000000b','averia','cerrado',
   'cccccccc-0000-0000-0000-000000000001', null,
   1, now(), true, 'Era el cuadro general del edificio, no una puerta', 'Revisar cuadro'),
  -- avería cerrada sin puerta y sin declarar nada: sale en la otra lista
  ('cccccccc-0000-0000-0000-00000000000c','averia','cerrado',
   'cccccccc-0000-0000-0000-000000000001', null,
   2, now(), false, null, 'Arreglada y nadie dio de alta la puerta'),
  -- comercial sin puerta: NO sale, ahí la puerta todavía no existe
  ('cccccccc-0000-0000-0000-00000000000d','comercial','cerrado',
   'cccccccc-0000-0000-0000-000000000001', null,
   1, now(), false, null, 'Fue a ofertar'),
  -- desplazamiento en falso: tampoco, no se trabajó
  ('cccccccc-0000-0000-0000-00000000000e','falso','cerrado',
   'cccccccc-0000-0000-0000-000000000001', null,
   1, now(), false, null, 'No había nadie'),
  -- avería ABIERTA sin puerta: todavía no se ha cerrado nada, no sale
  ('cccccccc-0000-0000-0000-00000000000f','averia','asignado',
   'cccccccc-0000-0000-0000-000000000001', null,
   null, null, false, null, 'Pendiente de ir');

do $$
declare
  n integer;
begin
  -- ---- 1. Las dos columnas están --------------------------------------------
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='avisos'
     and column_name in ('sin_puerta','sin_puerta_motivo');
  if n <> 2 then raise exception 'Faltan columnas de la válvula: % de 2', n; end if;
  -- y la casilla nace en false: una válvula no puede venir abierta de fábrica
  select count(*) into n from public.avisos
   where id = 'cccccccc-0000-0000-0000-00000000000a' and sin_puerta is false;
  if n <> 1 then raise exception 'La casilla «sin puerta» no nace en false'; end if;
  raise notice 'las dos columnas de la valvula existen, y nace cerrada';

  -- ---- 2. La lista de la válvula saca solo a quien la usó --------------------
  select count(*) into n from public.visitas_sin_puerta
   where id = 'cccccccc-0000-0000-0000-00000000000b';
  if n <> 1 then raise exception 'La visita que declaró no tener puerta no sale en la lista'; end if;
  select count(*) into n from public.visitas_sin_puerta
   where id::text like 'cccccccc-0000-0000-0000-00000000000%'
     and id <> 'cccccccc-0000-0000-0000-00000000000b';
  if n <> 0 then raise exception 'La lista de la válvula saca % visitas que no la usaron', n; end if;
  raise notice 'la lista de la valvula saca solo a quien la uso, y con su motivo';

  -- ---- 3. Y el motivo viaja con ella ----------------------------------------
  select count(*) into n from public.visitas_sin_puerta
   where id = 'cccccccc-0000-0000-0000-00000000000b'
     and sin_puerta_motivo like '%cuadro general%';
  if n <> 1 then raise exception 'La lista no lleva el motivo, que es lo único que hace útil la válvula'; end if;
  raise notice 'el motivo viaja con la visita: una valvula sin motivo es un agujero';

  -- ---- 4. LA QUE IMPORTA: las puertas que nunca se documentaron -------------
  select count(*) into n from public.visitas_sin_ficha_de_puerta
   where id = 'cccccccc-0000-0000-0000-00000000000c';
  if n <> 1 then raise exception 'Una avería cerrada sin puerta y sin declararlo tiene que salir'; end if;
  -- la que sí tenía puerta, no
  select count(*) into n from public.visitas_sin_ficha_de_puerta
   where id = 'cccccccc-0000-0000-0000-00000000000a';
  if n <> 0 then raise exception 'Una avería con su puerta documentada no debe salir'; end if;
  -- la que declaró que no había puerta, tampoco: esa ya está en la otra lista
  select count(*) into n from public.visitas_sin_ficha_de_puerta
   where id = 'cccccccc-0000-0000-0000-00000000000b';
  if n <> 0 then raise exception 'La que declaró no tener puerta no debe salir aquí también'; end if;
  raise notice 'la lista de puertas sin documentar saca la averia que se cerro sin ficha, y solo esa';

  -- ---- 5. Los dos tipos a los que no se les pide -----------------------------
  select count(*) into n from public.visitas_sin_ficha_de_puerta
   where id in ('cccccccc-0000-0000-0000-00000000000d','cccccccc-0000-0000-0000-00000000000e');
  if n <> 0 then raise exception 'La comercial y el desplazamiento en falso no deben salir'; end if;
  raise notice 'la comercial y el desplazamiento en falso no se les pide, y no salen';

  -- ---- 6. Lo abierto no se juzga --------------------------------------------
  select count(*) into n from public.visitas_sin_ficha_de_puerta
   where id = 'cccccccc-0000-0000-0000-00000000000f';
  if n <> 0 then raise exception 'Una visita todavía abierta no puede salir: nadie la ha cerrado mal'; end if;
  raise notice 'una visita abierta no sale: todavia puede dar de alta su puerta';

  -- ---- 7. Y una puerta enganchada por la lista de la obra también cuenta -----
  -- Una obra de varias puertas no tiene por qué llevar puerta principal: las
  -- lleva en aviso_puertas. Si la vista mirara solo puerta_id, esas obras
  -- saldrían señaladas teniendo sus fichas hechas.
  insert into public.aviso_puertas (aviso_id, puerta_id)
    values ('cccccccc-0000-0000-0000-00000000000c','cccccccc-1111-0000-0000-000000000001');
  select count(*) into n from public.visitas_sin_ficha_de_puerta
   where id = 'cccccccc-0000-0000-0000-00000000000c';
  if n <> 0 then raise exception 'Una visita con su puerta en la lista de la obra no debe salir'; end if;
  raise notice 'una puerta enganchada por la lista de la obra cuenta igual que la principal';
end $$;
