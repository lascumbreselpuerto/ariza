-- ============================================================================
-- Comprueba servidor/barras.sql: el código de barras del fabricante y las
-- peticiones de material.                                        08-11-2026
--
-- Lo que se vigila, en orden de importancia:
--   1. que el código de barras se normalice, y que doce y trece cifras sean el
--      MISMO código: si no, la misma caja daría dos artículos en el catálogo;
--   2. que no quepan dos artículos con el mismo código de barras;
--   3. que una petición de material no pueda existir sin foto, ni sin
--      descripción con cuerpo;
--   4. que una petición no se pueda dar por resuelta sin decir qué artículo
--      salió de ella, que es lo que evita que se resuelvan «en el aire»;
--   5. que la búsqueda por código de barras encuentre el artículo tanto si el
--      lector devolvió doce cifras como trece.
-- ============================================================================
do $$
declare
  v_art uuid; v_art2 uuid; v_pet uuid; v_aviso uuid;
  v_n int; v_txt text; v_fallo boolean;
begin
  -- ---------------------------------------------------------------- preparar
  insert into public.articulos (descripcion, unidad, activo, ean)
       values ('Banda de prueba para barras', 'ud', true, ' 8412345678905 ')
    returning id into v_art;

  -- 1. NORMALIZACIÓN ---------------------------------------------------------
  -- Se comprueba con lo que se acaba de meter, no con lo que hubiera antes: la
  -- normalización tiene que ocurrir SIEMPRE, también cuando alguien importa un
  -- Excel o pega un código a mano meses después de ejecutar el script.
  select ean into v_txt from public.articulos where id = v_art;
  if v_txt <> '8412345678905' then
    raise exception 'el código de barras no se ha normalizado: «%»', v_txt;
  end if;
  raise notice 'el código de barras se guarda limpio, sin espacios';

  -- un UPC-A de doce cifras se guarda con trece
  insert into public.articulos (descripcion, unidad, activo, ean)
       values ('Fotocélula de prueba UPC', 'ud', true, '036000291452')
    returning id into v_art2;
  select ean into v_txt from public.articulos where id = v_art2;
  if v_txt <> '0036000291452' then
    raise exception 'el UPC-A de doce cifras debería guardarse con trece y es «%»', v_txt;
  end if;
  raise notice 'un UPC-A de doce cifras se guarda con sus trece, que es el mismo codigo';

  -- 2. UN CÓDIGO, UN ARTÍCULO ------------------------------------------------
  v_fallo := false;
  begin
    insert into public.articulos (descripcion, unidad, activo, ean)
         values ('Otra banda con el mismo código', 'ud', true, '8412345678905');
  exception when unique_violation then
    v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'ha dejado meter dos articulos con el mismo codigo de barras';
  end if;
  raise notice 'dos articulos no pueden llevar el mismo codigo de barras';

  -- y tampoco colándolo con espacios, que es por donde se escaparía
  v_fallo := false;
  begin
    insert into public.articulos (descripcion, unidad, activo, ean)
         values ('La misma con espacios', 'ud', true, ' 8412-345678905 ');
  exception when unique_violation then
    v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'el mismo codigo con espacios se ha colado como otro articulo';
  end if;
  raise notice 'ni colandolo con espacios o guiones: es el mismo codigo';

  -- un UPC-A de doce cifras tampoco puede duplicar al EAN-13 que ya existe
  v_fallo := false;
  begin
    insert into public.articulos (descripcion, unidad, activo, ean)
         values ('El mismo UPC con doce cifras', 'ud', true, '036000291452');
  exception when unique_violation then
    v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'el UPC-A de doce cifras ha entrado como articulo distinto del de trece';
  end if;
  raise notice 'y doce cifras no duplican a las trece del mismo codigo';

  -- pero dos artículos SIN código sí pueden existir: la mayoría no lo tiene
  insert into public.articulos (descripcion, unidad, activo) values ('Sin código 1', 'ud', true);
  insert into public.articulos (descripcion, unidad, activo) values ('Sin código 2', 'ud', true);
  raise notice 'y varios articulos sin codigo de barras conviven sin problema';

  -- 3. LA FOTO ES OBLIGATORIA ------------------------------------------------
  insert into public.avisos (tipo, estado, prioridad, creado)
       values ('averia', 'asignado', 'normal', now()) returning id into v_aviso;

  v_fallo := false;
  begin
    insert into public.peticiones_material (aviso_id, descripcion, unidad, foto_ruta)
         values (v_aviso, 'Banda que no está en el catálogo', 'ud', '');
  exception when check_violation then
    v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'ha dejado crear una peticion de material sin foto de la caja';
  end if;
  raise notice 'una peticion de material sin foto de la caja no entra';

  v_fallo := false;
  begin
    insert into public.peticiones_material (aviso_id, descripcion, unidad, foto_ruta)
         values (v_aviso, 'ab', 'ud', 'peticiones/x.jpg');
  exception when check_violation then
    v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'ha dejado crear una peticion con una descripcion de dos letras';
  end if;
  raise notice 'y tampoco entra con una descripcion que no dice nada';

  -- la buena sí entra
  insert into public.peticiones_material (aviso_id, descripcion, unidad, ean, foto_ruta)
       values (v_aviso, 'Banda de seguridad 2,5 m de un proveedor nuevo', 'ud',
               '8499999999993', 'peticiones/caja-1.jpg')
    returning id into v_pet;
  raise notice 'la peticion con descripcion, unidad y foto se guarda';

  -- 4. RESOLVER SIN DECIR QUÉ ARTÍCULO SALIÓ ---------------------------------
  v_fallo := false;
  begin
    update public.peticiones_material
       set estado = 'resuelta', resuelto = now()
     where id = v_pet;
  exception when check_violation then
    v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'ha dejado resolver una peticion sin decir que articulo salio de ella';
  end if;
  raise notice 'una peticion no se puede dar por resuelta sin decir que articulo salio';

  -- resolverla atándola a un artículo que ya existía: así se evitan duplicados
  update public.peticiones_material
     set estado = 'resuelta', resuelto = now(), articulo_id = v_art,
         nota = 'Es la misma banda que ya teníamos, con otro nombre'
   where id = v_pet;
  select count(*) into v_n from public.peticiones_material
   where id = v_pet and estado = 'resuelta' and articulo_id = v_art;
  if v_n <> 1 then
    raise exception 'la peticion resuelta no ha quedado atada al articulo';
  end if;
  raise notice 'resuelta y atada al articulo que ya existia, con su nota';

  -- y descartarla también deja fecha
  insert into public.peticiones_material (aviso_id, descripcion, unidad, foto_ruta)
       values (v_aviso, 'Material que resultó ser de otra obra', 'ud', 'peticiones/caja-2.jpg')
    returning id into v_pet;
  v_fallo := false;
  begin
    update public.peticiones_material set estado = 'descartada' where id = v_pet;
  exception when check_violation then
    v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'ha dejado descartar una peticion sin dejar la fecha';
  end if;
  update public.peticiones_material
     set estado = 'descartada', resuelto = now(), nota = 'No era material nuestro'
   where id = v_pet;
  raise notice 'una peticion descartada tambien deja fecha y motivo';

  -- 5. BUSCAR POR EL CÓDIGO DE LA CAJA ---------------------------------------
  select count(*) into v_n from public.articulo_por_barras('8412345678905');
  if v_n <> 1 then raise exception 'no encuentra el articulo por su codigo de trece cifras'; end if;
  raise notice 'leer la caja encuentra el articulo por sus trece cifras';

  select count(*) into v_n from public.articulo_por_barras('  8412-345678905 ');
  if v_n <> 1 then raise exception 'no encuentra el articulo si el codigo viene con adornos'; end if;
  raise notice 'y lo encuentra aunque el codigo venga con espacios o guiones';

  -- el UPC-A: el lector puede devolver doce cifras y el catálogo guarda trece
  select count(*) into v_n from public.articulo_por_barras('036000291452');
  if v_n <> 1 then
    raise exception 'no encuentra el UPC-A cuando el lector devuelve doce cifras';
  end if;
  raise notice 'un UPC-A leido con doce cifras encuentra el articulo guardado con trece';

  select count(*) into v_n from public.articulo_por_barras('0036000291452');
  if v_n <> 1 then
    raise exception 'no encuentra el UPC-A cuando el lector devuelve trece cifras';
  end if;
  raise notice 'y leido con trece, tambien: es el mismo codigo por las dos vias';

  -- una caja que no está en el catálogo no devuelve nada, y no se inventa
  select count(*) into v_n from public.articulo_por_barras('8499999999993');
  if v_n <> 0 then
    raise exception 'ha devuelto un articulo para un codigo que no esta en el catalogo';
  end if;
  raise notice 'una caja que no esta en el catalogo no devuelve nada, que es lo correcto';

  -- y un artículo dado de baja no se ofrece
  update public.articulos set activo = false where id = v_art;
  select count(*) into v_n from public.articulo_por_barras('8412345678905');
  if v_n <> 0 then raise exception 'ofrece un articulo dado de baja'; end if;
  raise notice 'un articulo dado de baja no se ofrece al leer su caja';
  update public.articulos set activo = true where id = v_art;

  -- ---------------------------------------------------------------- limpiar
  delete from public.peticiones_material where aviso_id = v_aviso;
  delete from public.avisos where id = v_aviso;
  delete from public.articulos
   where descripcion in ('Banda de prueba para barras', 'Fotocélula de prueba UPC',
                         'Sin código 1', 'Sin código 2', 'La misma con espacios',
                         'El mismo UPC con doce cifras');
  raise notice 'TODO EN VERDE: el codigo de barras y las peticiones de material';
end $$;
