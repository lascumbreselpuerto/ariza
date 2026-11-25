-- ================================================================
-- SAFE2DOOR · EL ALTA DE PUERTAS, POR BLOQUES Y POR FAMILIA
--
-- QUÉ RESUELVE
-- David, después de las primeras altas de verdad en la empresa:
-- «El dar de alta una puerta es lento y tedioso. Estructurarlo por bloques:
-- puerta, uso, motorización, seguridades y control de acceso.»
--
-- El problema de fondo no era el orden, era la cantidad: el formulario
-- preguntaba lo mismo a todas las puertas. A una barrera se le pedía el dintel
-- y las vueltas de los muelles; a una corredera, el diámetro del eje. Cuarenta
-- campos, de los que en cada puerta sobraban la mitad.
--
-- La tabla de qué se pregunta a cada familia la rellenó David en una hoja de
-- cálculo, familia por familia, marcando SÍ, OPCIONAL o NO. Vive en la
-- aplicación (CAMPOS_FAMILIA en index.html). Lo que hace falta aquí son las
-- columnas donde guardar lo que antes no se guardaba en ninguna parte.
--
-- QUÉ AÑADE
--
-- 1. Doce columnas de medidas y cuentas. Ninguna obligatoria: una puerta dada
--    de alta antes de hoy sigue valiendo igual, con esas columnas vacías.
--
-- 2. Una columna «elementos»: lo que la puerta lleva puesto, de las cuatro
--    familias de elementos (identificación, motorización, seguridades y
--    control de acceso). Hasta hoy solo había «seguridad», con ocho opciones y
--    todo lo demás escrito a mano por el técnico, que acabó con la misma cosa
--    anotada de cinco maneras distintas.
--
-- 3. «Baliza» pasa a llamarse «Luz de maniobra», que es como se llama en obra.
--    Decisión de David al revisar la tabla. Se renombra lo ya guardado, aquí y
--    en la aplicación.
--
-- POR QUÉ NO SE TOCA «seguridad»
-- Porque la leen el parte, el informe técnico, el expediente de la puerta, los
-- componentes y el guion de revisión. Se queda, y los elementos de seguridad
-- se siguen guardando ahí con su mismo nombre. «elementos» es más amplia: lo
-- contiene y añade lo que no es de seguridad.
--
-- Se puede ejecutar las veces que haga falta.
--
-- 24-11-2026
-- ================================================================

-- ---- Las medidas por familia ------------------------------------
-- Cuáles se piden a cada familia lo decide la aplicación, no la base: aquí
-- cabe todo y nada es obligatorio. Una puerta de 2019 dada de alta en octubre
-- no tiene por qué saber su paso libre.

alter table public.puertas add column if not exists n_hojas integer;
alter table public.puertas add column if not exists lateral_libre_mm numeric;
alter table public.puertas add column if not exists fondo_mm numeric;
alter table public.puertas add column if not exists mastil_mm numeric;
alter table public.puertas add column if not exists eje_mm numeric;
alter table public.puertas add column if not exists n_paneles integer;
alter table public.puertas add column if not exists muelle_diam_mm numeric;
alter table public.puertas add column if not exists tipo_guia text;
alter table public.puertas add column if not exists n_carriles integer;
alter table public.puertas add column if not exists paso_libre_mm numeric;

comment on column public.puertas.n_hojas is
  'Hojas que tiene la puerta. Una, dos, o las que sean.';
comment on column public.puertas.lateral_libre_mm is
  'Lo que queda al lado del hueco para que la hoja se recoja. Es el mismo dato '
  'que medidas.lateral_mm de una visita comercial: si la oferta se vende, de '
  'ahí sale.';
comment on column public.puertas.fondo_mm is
  'Lo que la puerta necesita hacia dentro del local para abrirse: el fondo de '
  'las guías horizontales, o el recorrido.';
comment on column public.puertas.mastil_mm is
  'Longitud del mástil de una barrera, del eje de giro a la punta.';
comment on column public.puertas.eje_mm is
  'Diámetro del eje de enrollar. Va en la referencia del repuesto.';
comment on column public.puertas.n_paneles is
  'Paneles o lamas que forman la hoja.';
comment on column public.puertas.muelle_diam_mm is
  'Diámetro del alambre del muelle. Con las vueltas, es lo que hace falta para '
  'pedir el repuesto correcto.';
comment on column public.puertas.tipo_guia is
  'Tal y como se llame en la casa: estándar, baja, alta, vertical, a medida. '
  'Texto libre a propósito: cada fabricante las llama de otra manera.';
comment on column public.puertas.n_carriles is
  'Carriles montados. En una corredera telescópica, más de uno.';
comment on column public.puertas.paso_libre_mm is
  'Altura que queda libre con la puerta abierta del todo. No es el alto del '
  'hueco: es lo que de verdad pasa por debajo.';

-- ---- Las cuentas de la motorización y del acceso ----------------

alter table public.puertas add column if not exists n_motores integer;
alter table public.puertas add column if not exists n_mandos integer;

comment on column public.puertas.n_motores is
  'Motores que lleva la puerta. Uno en casi todo; dos en las batientes de dos '
  'hojas. Decide cuántos repuestos hacen falta.';
comment on column public.puertas.n_mandos is
  'Mandos entregados al cliente. Queda escrito cuántos, que es la pregunta que '
  'más se repite meses después.';

-- ---- Lo que la puerta lleva puesto ------------------------------

alter table public.puertas add column if not exists elementos text[] default '{}'::text[];

comment on column public.puertas.elementos is
  'Lo que la puerta lleva puesto, de las cuatro familias: identificación '
  '(marcado CE, placa), motorización (desbloqueo manual), seguridades '
  '(fotocélulas, banda, protección de dedos, limitador, semáforo, luz de '
  'maniobra, pulsador de emergencia, seta de parada, central de incendios) y '
  'control de acceso (bucle, radar, sensor de apertura, receptor, teclado, '
  'portero, pulsador de pared, llave de emergencia). Es lo que LLEVA, no lo '
  'que debería llevar: lo que falte sale en el informe, no aquí. Los de '
  'seguridad se siguen guardando además en «seguridad», porque eso es lo que '
  'leen el parte, el informe, el expediente y los componentes.';

-- ---- «Baliza» pasa a ser «Luz de maniobra» ----------------------
-- Es un renombrado, no un dato nuevo: la puerta sigue llevando lo mismo.

update public.puertas
   set seguridad = array_replace(seguridad, 'Baliza', 'Luz de maniobra')
 where seguridad @> array['Baliza']::text[];

-- Y en la lista general de elementos de seguridad de la empresa, que vive en
-- ajustes con la clave «seguridad» y es un array de textos en jsonb.
-- Se reconstruye con «with ordinality» para no perder el orden en que la
-- empresa los puso: esa lista se lee de arriba abajo en la pantalla.
update public.ajustes
   set valor = (
     select jsonb_agg(
              case when x.v = '"Baliza"'::jsonb then '"Luz de maniobra"'::jsonb else x.v end
              order by x.n )
       from jsonb_array_elements(valor) with ordinality as x(v, n) )
 where clave = 'seguridad'
   and valor @> '["Baliza"]'::jsonb;

-- ---- Arrancar «elementos» con lo que ya se sabía ----------------
-- Una puerta que ya tenía fotocélulas y banda marcadas debe seguir
-- enseñándolas marcadas. Solo se rellenan las que están vacías: una puerta ya
-- repasada con la pantalla nueva manda ella.

update public.puertas
   set elementos = seguridad
 where (elementos is null or elementos = '{}'::text[])
   and seguridad is not null
   and seguridad <> '{}'::text[];
