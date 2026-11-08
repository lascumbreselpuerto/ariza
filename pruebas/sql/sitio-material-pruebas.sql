-- ============================================================================
-- Comprueba servidor/sitio-material.sql: en qué almacén se guarda cada
-- material y en qué parte de él.                                   08-11-2026
--
-- Lo que se vigila:
--   1. que exista la columna del almacén y apunte a la tabla de almacenes;
--   2. que al retirar un almacén el material NO se pierda: se queda sin
--      almacén puesto y la oficina lo vuelve a colocar;
--   3. que el texto de siempre («estantería B, balda 3») siga guardándose
--      aparte, porque es «en qué parte» y no se tira;
--   4. y que un material pueda estar GUARDADO en un sitio y tener unidades
--      rodando en otro, que es lo que pasa de verdad y es lo que más se
--      confunde.
-- ============================================================================
do $$
declare
  v_art uuid; v_nave uuid; v_furgo uuid; v_n int; v_txt text; v_ubi uuid;
begin
  -- 1. LA COLUMNA -------------------------------------------------------------
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'articulos'
     and column_name = 'ubicacion_id';
  if v_n <> 1 then raise exception 'falta la columna del almacen en articulos'; end if;
  raise notice 'la ficha del material puede decir en que almacen se guarda';

  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'articulos'
     and column_name = 'ubicacion';
  if v_n <> 1 then raise exception 'se ha perdido el campo de en que parte'; end if;
  raise notice 'y el de en que parte de ese almacen sigue estando';

  -- preparar
  insert into public.ubicaciones (nombre, tipo, activo)
       values ('Nave de prueba sitio', 'nave', true) returning id into v_nave;
  insert into public.ubicaciones (nombre, tipo, activo)
       values ('Furgo de prueba sitio', 'furgoneta', true) returning id into v_furgo;
  insert into public.articulos (descripcion, unidad, activo, ubicacion_id, ubicacion)
       values ('Muelle para probar el sitio', 'ud', true, v_nave, 'estantería B, balda 3')
    returning id into v_art;

  -- 3. LAS DOS COSAS, POR SEPARADO -------------------------------------------
  select ubicacion into v_txt from public.articulos where id = v_art;
  if v_txt <> 'estantería B, balda 3' then
    raise exception 'el sitio dentro del almacen deberia guardarse tal cual y es «%»', v_txt;
  end if;
  select ubicacion_id into v_ubi from public.articulos where id = v_art;
  if v_ubi <> v_nave then raise exception 'el almacen no se ha guardado'; end if;
  raise notice 'el almacen y el sitio dentro de el se guardan por separado';

  -- 4. GUARDADO EN UN SITIO, RODANDO EN OTRO ---------------------------------
  -- Esto es lo que más se confunde: la ficha dice donde se GUARDA; las
  -- existencias dicen donde ESTA. Son dos cosas y no tienen que coincidir.
  insert into public.movimientos_material (articulo_id, cantidad, hasta, motivo, creado_por)
       values (v_art, 3, v_furgo, 'compra', 'Prueba');
  select count(*) into v_n from public.existencias_material
   where articulo_id = v_art and ubicacion_id = v_furgo and cantidad = 3;
  if v_n <> 1 then raise exception 'las existencias deberian estar en la furgoneta'; end if;
  select ubicacion_id into v_ubi from public.articulos where id = v_art;
  if v_ubi <> v_nave then
    raise exception 'mover material NO debe cambiar donde se guarda el material';
  end if;
  raise notice 'se guarda en la nave y puede tener unidades rodando en la furgoneta: son dos cosas';

  -- 2. RETIRAR UN ALMACEN NO PIERDE EL MATERIAL -------------------------------
  delete from public.movimientos_material where articulo_id = v_art;
  delete from public.ubicaciones where id = v_nave;
  select count(*) into v_n from public.articulos where id = v_art;
  if v_n <> 1 then raise exception 'borrar un almacen se ha llevado el material por delante'; end if;
  select ubicacion_id into v_ubi from public.articulos where id = v_art;
  if v_ubi is not null then raise exception 'el material deberia quedarse sin almacen puesto'; end if;
  select ubicacion into v_txt from public.articulos where id = v_art;
  if v_txt <> 'estantería B, balda 3' then
    raise exception 'y el sitio escrito deberia quedarse: lo escribio una persona';
  end if;
  raise notice 'borrar un almacen no se lleva el material: se queda sin colocar y con su nota';

  -- limpiar
  delete from public.articulos where id = v_art;
  delete from public.ubicaciones where nombre in ('Nave de prueba sitio', 'Furgo de prueba sitio');
  raise notice 'TODO EN VERDE: donde se guarda cada material';
end $$;
