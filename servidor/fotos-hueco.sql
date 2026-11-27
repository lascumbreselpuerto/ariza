-- ================================================================
-- SAFE2DOOR · UNA FOTO POR HUECO MEDIDO
--
-- QUÉ RESUELVE
--
-- David, 25-11-2026: «En la asistencia comercial, hay un sitio para poner
-- fotos, pero debería de aparecer un sitio para poner fotos por puerta que se
-- mida. Igual para el resto de asistencias, si es una asistencia multipuerta,
-- cada puerta debe de tener un sitio para poner fotos. Así cada puerta podrá
-- tener sus fotos en su histórico.»
--
-- La mitad de las puertas ya está hecha y no necesitó base: una foto se cuelga
-- de su puerta con puerta_id, que existe desde el principio. La comercial es
-- distinta, y por eso va aquí: en una visita de ofertar NO HAY PUERTA. Hay
-- huecos medidos, que son filas de «medidas», y de ahí sale el presupuesto. Una
-- foto del hueco no tiene dónde colgarse.
--
-- Con esta columna sí. Y eso cambia dos cosas en una comercial de tres huecos:
--
--   · Al presupuestar se ve cada hueco con sus fotos. Hasta hoy las fotos de
--     una comercial eran un montón común y nadie sabía qué foto era de qué
--     hueco, con lo que las medidas raras («un dintel de 180») no se podían
--     comprobar sin volver a ir.
--   · Cuando el cliente acepta y la puerta se instala, esas fotos son el antes
--     de esa puerta.
--
-- POR QUÉ NO HAY CLAVE AJENA A «medidas»
--
-- Los huecos de un parte se rehacen enteros al guardar: se borran y se vuelven
-- a meter con su mismo id. Una clave ajena con borrado en cascada se llevaría
-- por delante las fotos en ese borrado intermedio, que dura milisegundos pero
-- es real. Y si el técnico borra un hueco del parte, su foto no se pierde: se
-- queda con el aviso y sale en las fotos generales de la visita, que es mejor
-- que desaparecer sin avisar.
--
-- QUÉ NO CAMBIA
-- Ninguna foto que ya esté subida. Las de antes se quedan sin hueco, que es la
-- verdad: nadie apuntó de qué hueco eran. No se les inventa uno.
--
-- Se puede ejecutar las veces que haga falta.
--
-- 26-11-2026
-- ================================================================

alter table public.fotos add column if not exists medida_id uuid;

comment on column public.fotos.medida_id is
  'De qué hueco medido es esta foto, en una visita comercial: el id de la fila '
  'de «medidas». Vacío en todas las fotos de antes del 26-11-2026 y en las que '
  'no son de un hueco en concreto, y eso es la verdad: nadie apuntó de cuál '
  'eran. No lleva clave ajena a propósito: los huecos de un parte se borran y '
  'se vuelven a insertar al guardar, y una cascada se llevaría las fotos en ese '
  'borrado intermedio.';

-- Para la pregunta que se hace al pintar el parte y al presupuestar: ¿qué
-- fotos tiene este hueco? Sin el índice es un recorrido de la tabla entera.
create index if not exists fotos_medida_idx
  ON public.fotos USING btree (medida_id);
