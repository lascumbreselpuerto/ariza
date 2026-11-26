-- ================================================================
-- SAFE2DOOR · UNA FOTO POR ELEMENTO, Y EL COMPONENTE CORREGIDO CON FIRMA
--
-- QUÉ RESUELVE
--
-- 1. David, 25-11-2026: «lo que sí es necesario cuando damos de alta la puerta
--    (en bloque) es fotos de todo lo seleccionado y anotado».
--
--    Hasta hoy las fotos de una puerta se subían a un montón común: estaban
--    todas juntas y no se sabía de qué elemento era cada una. Para el
--    expediente eso valía, porque allí cada foto se pide dentro de su
--    apartado. Para la ficha no: marcabas que la puerta lleva fotocélulas, le
--    hacías la foto, y seis meses después nadie sabía si esa foto de un poste
--    era la fotocélula, la banda o el pulsador.
--
--    Con esta columna la foto queda atada a su elemento. Y la aplicación puede
--    decir, sin adivinar, qué elementos marcados se han quedado sin foto.
--
--    No frena nada: David decidió el mismo día que las fotos SE RECLAMEN pero
--    NO impidan cerrar la visita. En una seccional pueden ser veinte
--    elementos, y un bloqueo de veinte fotos se sortea o para la reparación.
--
-- 2. Y el rastro de quién corrige un componente.
--
--    David: «los componentes se deben de solicitar con datos como marca,
--    referencia etc en el momento de crear la documentación. Que no es lo
--    mismo que la ficha de la puerta.»
--
--    Desde hoy el panel de componentes de la ficha es el ESPEJO de lo que se
--    registró al documentar, de solo lectura, y lo corrigen la oficina y el
--    administrador. Si lo corrigen, hay que poder decir quién fue y cuándo:
--    es el mismo criterio que ya rige para rematar la ficha de una puerta con
--    parte firmado.
--
-- QUÉ NO CAMBIA
-- Ninguna foto que ya esté subida. Las de antes se quedan sin elemento, que es
-- la verdad: nadie apuntó de qué eran. No se les inventa uno.
--
-- Se puede ejecutar las veces que haga falta.
--
-- 25-11-2026
-- ================================================================

alter table public.fotos add column if not exists elemento text;

comment on column public.fotos.elemento is
  'De qué elemento de la puerta es esta foto: la clave de ELEMENTOS_PUERTA '
  '(fotocelulas, banda, motor, cuadro, mastilel…). Vacío en las fotos de antes '
  'del 25-11-2026 y en las del conjunto de la puerta, y eso es la verdad: '
  'nadie apuntó de qué eran, así que no se les inventa un elemento. De aquí '
  'sale la cuenta de qué elementos marcados se han quedado sin foto.';

-- Para la pregunta que se hace en cada ficha: ¿qué elementos de esta puerta
-- tienen foto? Sin el índice son un recorrido de la tabla entera por puerta.
create index if not exists fotos_puerta_elemento_idx
  ON public.fotos USING btree (puerta_id, elemento);

alter table public.componentes add column if not exists actualizado_por text;

comment on column public.componentes.actualizado_por is
  'Quién tocó este componente la última vez. Desde el 25-11-2026 el panel de '
  'componentes de la ficha es el espejo de lo que se registró al documentar, y '
  'corregirlo es cosa de la oficina y del administrador: entonces hay que poder '
  'decir quién fue. Junto con «actualizado», que ya existía, da la firma '
  'completa de la corrección.';
