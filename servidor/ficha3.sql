-- ============================================================================
-- ARIZA SAT · La ficha de la puerta, como la rellena un técnico
--
-- POR QUÉ
-- Tres cosas vistas en pruebas de campo, las tres del mismo sitio: la ficha
-- pedía datos que nadie iba a rellenar y no pedía los que de verdad hacen
-- falta.
--
--   1. EL PESO DE LA HOJA. No es fácil de saber, en obra no hay báscula, y el
--      técnico no lo va a poner nunca. Lo que sí viene en la placa o en la
--      ficha de casi cualquier motor es el ARRASTRE MÁXIMO, y con ese dato
--      basta para lo que se usaba el peso: saber si el motor va sobrado o
--      justo para esa hoja.
--
--      La columna peso_kg NO se borra: lo que ya esté anotado se conserva y se
--      sigue imprimiendo. Lo que se quita es pedirlo.
--
--   2. LAS VUELTAS DE LOS MUELLES, en las seccionales. Es el dato que hace
--      falta para equilibrar la hoja y para pedir un muelle de repuesto, y no
--      estaba en ninguna parte. Se anota con media vuelta de precisión, porque
--      así se trabaja.
--
--   3. LOS HERRAJES Y COMPONENTES, al revés de lo que parecía. Cuando se habla
--      de la puerta sin automatismo se habla de UN TODO, así que desglosar
--      herraje por herraje solo alarga el tiempo de gestión del documento. En
--      su lugar, un apartado libre donde el técnico escribe lo que a su juicio
--      hay que identificar de esa puerta concreta.
--
--      El motor y el cuadro siguen siendo componentes con su número de serie:
--      eso no es papeleo, es lo que permite pedir un repuesto sin volver.
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

alter table public.puertas add column if not exists arrastre_kg numeric;
alter table public.puertas add column if not exists vueltas_muelle numeric;
alter table public.puertas add column if not exists otros_elementos text;

comment on column public.puertas.arrastre_kg is
  'Arrastre máximo del motor, en kg, copiado de su placa o de su ficha. '
  'Sustituye al peso de la hoja, que en obra no se puede pesar.';
comment on column public.puertas.vueltas_muelle is
  'Vueltas de los muelles de torsión. Se pide solo en las seccionales, que es '
  'donde decide el equilibrado y donde hace falta para pedir el repuesto. '
  'Admite medias vueltas.';
comment on column public.puertas.otros_elementos is
  'Más elementos a identificar: lo que el técnico ve en su inspección y '
  'considera relevante de ESA puerta. Texto libre a propósito: desglosar '
  'herraje por herraje alargaba la gestión del documento sin añadir nada, '
  'porque la puerta sin automatismo se trata como un todo.';
comment on column public.puertas.peso_kg is
  'Peso de la hoja. Ya NO se pide en la ficha desde el 01-11-2026: en obra no '
  'hay báscula y nadie lo rellenaba. Lo que esté anotado se conserva y se '
  'sigue imprimiendo; para saber si el motor va sobrado se usa arrastre_kg.';

-- ---------------------------------------------------------------------------
-- Comprobación
--
--   select codigo, tipo, arrastre_kg, vueltas_muelle, peso_kg
--     from public.puertas
--    order by codigo;
--
-- El peso que ya hubiera anotado tiene que seguir ahí: esta migración no
-- borra ni un dato.
-- ---------------------------------------------------------------------------
