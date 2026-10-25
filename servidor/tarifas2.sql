-- ============================================================================
-- ARIZA SAT · Tres manos de obra y tres rutas
--
-- POR QUÉ
-- Había un solo precio por hora y un solo importe de salida. Pero una hora en
-- un chalet no se cobra como una hora en una nave, y salir al polígono de al
-- lado no es salir a Jerez. Con un único número, o se cobra de menos en lo
-- grande o se cobra de más en lo pequeño, y las dos cosas cuestan dinero.
--
-- QUÉ TRAE
--
--   1. Tres precios de hora: particulares, retail e industria. El COSTE de la
--      hora sigue siendo uno solo, porque el técnico cuesta lo mismo esté
--      donde esté: lo que cambia es lo que se cobra, no lo que se paga.
--
--   2. Tres rutas de desplazamiento, con nombre, importe y coste propios. El
--      coste va aparte porque sin él el margen del presupuesto sería una
--      estimación optimista, y para eso no hace falta una aplicación.
--
--   3. Cobro por kilómetros para lo que cae fuera de las rutas: no lleva
--      importe fijo, se multiplican los kilómetros de ida y vuelta por el
--      precio del kilómetro.
--
--   4. La línea del presupuesto guarda QUÉ tarifa y QUÉ ruta se usó. Hasta
--      ahora guardaba el importe pero no de dónde salía, y medio año después
--      nadie se acuerda de por qué aquella hora se cobró a 52.
--
-- Lo que ya había no se toca: el precio de hora de siempre pasa a ser el de
-- particulares, y el importe fijo de salida pasa a ser la ruta 1.
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Mano de obra por tipo de trabajo
-- ---------------------------------------------------------------------------
alter table public.tarifas add column if not exists precio_hora_particular numeric;
alter table public.tarifas add column if not exists precio_hora_retail     numeric;
alter table public.tarifas add column if not exists precio_hora_industria  numeric;

comment on column public.tarifas.precio_hora is
  'El precio de hora de siempre. Se conserva como el de referencia y como red '
  'de seguridad: si alguna de las tres tarifas está sin rellenar, se usa este.';
comment on column public.tarifas.precio_hora_particular is
  'Lo que se cobra la hora en vivienda y comunidad.';
comment on column public.tarifas.precio_hora_retail is
  'Lo que se cobra la hora en comercio, oficina y empresa de servicios.';
comment on column public.tarifas.precio_hora_industria is
  'Lo que se cobra la hora en nave, polígono y administración.';

-- El precio que había pasa a ser el de particulares, que es de donde venía
update public.tarifas
   set precio_hora_particular = coalesce(precio_hora_particular, precio_hora),
       precio_hora_retail     = coalesce(precio_hora_retail, precio_hora),
       precio_hora_industria  = coalesce(precio_hora_industria, precio_hora)
 where precio_hora is not null;

-- ---------------------------------------------------------------------------
-- 2. Las tres rutas
--
-- Con nombre propio porque «Ruta 2» no le dice nada a nadie dentro de un año;
-- «El Puerto y Jerez» sí.
-- ---------------------------------------------------------------------------
alter table public.tarifas add column if not exists ruta1_nombre  text;
alter table public.tarifas add column if not exists ruta1_importe numeric;
alter table public.tarifas add column if not exists ruta1_coste   numeric;
alter table public.tarifas add column if not exists ruta2_nombre  text;
alter table public.tarifas add column if not exists ruta2_importe numeric;
alter table public.tarifas add column if not exists ruta2_coste   numeric;
alter table public.tarifas add column if not exists ruta3_nombre  text;
alter table public.tarifas add column if not exists ruta3_importe numeric;
alter table public.tarifas add column if not exists ruta3_coste   numeric;

comment on column public.tarifas.ruta1_coste is
  'Lo que cuesta esa salida en combustible, vehículo y tiempo muerto. Sin '
  'esto el margen sale más alto de lo que es.';
comment on column public.tarifas.desplazamiento_fijo is
  'El importe de salida de siempre. Se conserva como red de seguridad cuando '
  'una ruta está sin rellenar.';

-- El importe fijo que había pasa a ser la ruta 1
update public.tarifas
   set ruta1_nombre  = coalesce(nullif(btrim(coalesce(ruta1_nombre, '')), ''), 'Ruta 1'),
       ruta1_importe = coalesce(ruta1_importe, desplazamiento_fijo),
       ruta2_nombre  = coalesce(nullif(btrim(coalesce(ruta2_nombre, '')), ''), 'Ruta 2'),
       ruta3_nombre  = coalesce(nullif(btrim(coalesce(ruta3_nombre, '')), ''), 'Ruta 3')
 where id is not null;

-- ---------------------------------------------------------------------------
-- 3. La línea recuerda de dónde salió su precio
-- ---------------------------------------------------------------------------
alter table public.presupuesto_lineas add column if not exists variante text;
alter table public.presupuesto_lineas add column if not exists km       numeric;

comment on column public.presupuesto_lineas.variante is
  'Para mano de obra: particular | retail | industria. Para desplazamiento: '
  'ruta1 | ruta2 | ruta3 | km. Guardar el importe sin guardar de dónde sale '
  'deja a cualquiera, medio año después, sin saber por qué se cobró eso.';
comment on column public.presupuesto_lineas.km is
  'Kilómetros SOLO DE IDA cuando la variante es «km». El importe ya lleva la '
  'ida y la vuelta: se guarda la ida porque es el dato que se mira en el mapa.';

-- ============================================================================
-- Comprobación rápida:
--
--   select precio_hora, precio_hora_particular, precio_hora_retail,
--          precio_hora_industria, ruta1_nombre, ruta1_importe
--     from public.tarifas;
--   select column_name from information_schema.columns
--    where table_name = 'presupuesto_lineas' and column_name in ('variante','km');
-- ============================================================================
