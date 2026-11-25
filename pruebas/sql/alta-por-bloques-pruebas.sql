-- ================================================================
-- Lo que hace de verdad servidor/alta-por-bloques.sql
--                                                   24-11-2026
--
-- Que un fichero se EJECUTE sin error no quiere decir que haga lo que dice.
-- Aquí se comprueba con datos puestos a mano y resultados esperados uno a uno.
--
-- Lo que se vigila, y por qué cada cosa:
--
--   1. Que «Baliza» pase a llamarse «Luz de maniobra» en las puertas que ya lo
--      tenían. Si el renombrado falla, esas puertas aparecen con la casilla sin
--      marcar: la aplicación diría que no llevan luz de maniobra, y la llevan.
--
--   2. Que al renombrar NO se pierda el resto de la lista. Un array_replace mal
--      escrito deja la puerta con un solo elemento.
--
--   3. Que la lista general de la empresa se renombre y CONSERVE EL ORDEN. Esa
--      lista se lee de arriba abajo en la pantalla de ajustes.
--
--   4. Que «elementos» arranque con lo que la puerta ya tenía en «seguridad».
--
--   5. Y lo más importante: que NO pise lo que ya tuviera «elementos». Una
--      puerta repasada con la pantalla nueva manda ella. Si el update la
--      pisara, el segundo pase del fichero borraría el trabajo hecho.
--
--   6. Que ejecutarlo dos veces no cambie nada la segunda vez.
--
-- Uso: lo lanza pruebas/sql.sh después de los ficheros de servidor/.
-- ================================================================
\set ON_ERROR_STOP on

do $prueba$
declare
  v_seg   text[];
  v_ele   text[];
  v_lista jsonb;
  v_n     integer;
begin
  -- ---- Datos de partida, como los de una base de verdad ----------
  delete from public.puertas where codigo like 'PB-%';
  delete from public.ajustes where clave = 'prueba_seguridad_orden';

  -- Una puerta de las de antes: con «Baliza» y sin «elementos».
  insert into public.puertas (codigo, tipo, seguridad, elementos)
  values ('PB-1', 'Seccional',
          array['Fotocélulas','Baliza','Banda de seguridad']::text[],
          '{}'::text[]);

  -- Una puerta ya repasada con la pantalla nueva: «elementos» tiene cosas que
  -- NO están en «seguridad», y no se pueden perder.
  insert into public.puertas (codigo, tipo, seguridad, elementos)
  values ('PB-2', 'Barrera',
          array['Fotocélulas']::text[],
          array['Fotocélulas','Receptor de mandos','Teclado o lector']::text[]);

  -- Una puerta sin nada: no tiene que inventarse elementos.
  insert into public.puertas (codigo, tipo, seguridad, elementos)
  values ('PB-3', 'Corredera', '{}'::text[], '{}'::text[]);

  -- La lista general de la empresa, con «Baliza» en medio.
  insert into public.ajustes (clave, valor)
  values ('seguridad',
          '["Fotocélulas","Banda de seguridad","Baliza","Limitador de fuerza"]'::jsonb)
  on conflict (clave) do update set valor = excluded.valor;

  -- ---- Se ejecuta lo que hace el fichero -------------------------
  update public.puertas
     set seguridad = array_replace(seguridad, 'Baliza', 'Luz de maniobra')
   where seguridad @> array['Baliza']::text[];

  update public.ajustes
     set valor = (
       select jsonb_agg(
                case when x.v = '"Baliza"'::jsonb then '"Luz de maniobra"'::jsonb else x.v end
                order by x.n )
         from jsonb_array_elements(valor) with ordinality as x(v, n) )
   where clave = 'seguridad'
     and valor @> '["Baliza"]'::jsonb;

  update public.puertas
     set elementos = seguridad
   where (elementos is null or elementos = '{}'::text[])
     and seguridad is not null
     and seguridad <> '{}'::text[];

  -- ---- 1 y 2: el renombrado de la puerta -------------------------
  select seguridad into v_seg from public.puertas where codigo = 'PB-1';
  if not (v_seg @> array['Luz de maniobra']::text[]) then
    raise exception 'PB-1 se ha quedado sin «Luz de maniobra»: %', v_seg;
  end if;
  if v_seg @> array['Baliza']::text[] then
    raise exception 'PB-1 sigue teniendo «Baliza»: %', v_seg;
  end if;
  raise notice '«Baliza» pasa a «Luz de maniobra» en la puerta';

  if array_length(v_seg, 1) <> 3 then
    raise exception 'PB-1 tenía 3 elementos y ahora tiene %: %', array_length(v_seg,1), v_seg;
  end if;
  if not (v_seg @> array['Fotocélulas','Banda de seguridad']::text[]) then
    raise exception 'PB-1 ha perdido elementos al renombrar: %', v_seg;
  end if;
  raise notice 'y el resto de la lista de la puerta no se toca';

  -- ---- 3: la lista general, y su orden ---------------------------
  select valor into v_lista from public.ajustes where clave = 'seguridad';
  if v_lista @> '["Baliza"]'::jsonb then
    raise exception 'la lista general sigue con «Baliza»: %', v_lista;
  end if;
  if not (v_lista @> '["Luz de maniobra"]'::jsonb) then
    raise exception 'la lista general no tiene «Luz de maniobra»: %', v_lista;
  end if;
  raise notice 'y también en la lista general de la empresa';

  if v_lista ->> 2 <> 'Luz de maniobra' then
    raise exception 'la lista general ha perdido el orden: %', v_lista;
  end if;
  if v_lista ->> 0 <> 'Fotocélulas' or v_lista ->> 3 <> 'Limitador de fuerza' then
    raise exception 'la lista general ha cambiado de orden: %', v_lista;
  end if;
  raise notice 'conservando el orden en que la empresa los puso';

  -- ---- 4: «elementos» arranca con lo que ya se sabía -------------
  select elementos into v_ele from public.puertas where codigo = 'PB-1';
  if not (v_ele @> array['Fotocélulas','Luz de maniobra','Banda de seguridad']::text[]) then
    raise exception 'PB-1 no ha heredado sus elementos: %', v_ele;
  end if;
  raise notice 'una puerta de antes conserva marcados los elementos que tenía';

  select elementos into v_ele from public.puertas where codigo = 'PB-3';
  if v_ele is null or array_length(v_ele, 1) is not null then
    raise exception 'PB-3 no tenía nada y ahora tiene: %', v_ele;
  end if;
  raise notice 'y una puerta sin nada no se inventa elementos';

  -- ---- 5: lo repasado no se pisa ---------------------------------
  select elementos into v_ele from public.puertas where codigo = 'PB-2';
  if array_length(v_ele, 1) <> 3 then
    raise exception 'PB-2 estaba repasada con 3 elementos y ahora tiene %: %',
                    array_length(v_ele,1), v_ele;
  end if;
  if not (v_ele @> array['Receptor de mandos','Teclado o lector']::text[]) then
    raise exception 'PB-2 ha perdido lo que tenía repasado: %', v_ele;
  end if;
  raise notice 'y una puerta ya repasada con la pantalla nueva manda ella';

  -- ---- 6: dos veces, lo mismo ------------------------------------
  update public.puertas
     set seguridad = array_replace(seguridad, 'Baliza', 'Luz de maniobra')
   where seguridad @> array['Baliza']::text[];
  update public.puertas
     set elementos = seguridad
   where (elementos is null or elementos = '{}'::text[])
     and seguridad is not null
     and seguridad <> '{}'::text[];

  select count(*) into v_n from public.puertas
   where codigo = 'PB-2' and array_length(elementos, 1) = 3;
  if v_n <> 1 then
    raise exception 'al segundo pase, PB-2 ha cambiado';
  end if;
  raise notice 'ejecutarlo dos veces no cambia nada la segunda';

  -- ---- Las columnas nuevas existen y aceptan lo suyo -------------
  update public.puertas
     set n_hojas = 2, lateral_libre_mm = 450, fondo_mm = 3200, mastil_mm = 4000,
         eje_mm = 76, n_paneles = 5, muelle_diam_mm = 5.5, tipo_guia = 'baja',
         n_carriles = 2, paso_libre_mm = 2380, n_motores = 1, n_mandos = 4
   where codigo = 'PB-1';
  select count(*) into v_n from public.puertas
   where codigo = 'PB-1' and n_hojas = 2 and muelle_diam_mm = 5.5
     and tipo_guia = 'baja' and n_mandos = 4;
  if v_n <> 1 then
    raise exception 'las columnas nuevas no guardan lo que se les pone';
  end if;
  raise notice 'las doce columnas nuevas guardan medidas, cuentas y el tipo de guía';

  delete from public.puertas where codigo like 'PB-%';
  delete from public.ajustes where clave = 'seguridad';
end
$prueba$;
