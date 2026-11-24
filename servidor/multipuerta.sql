-- ================================================================
-- SAFE2DOOR · UN PARTE CON VARIAS PUERTAS
--
-- QUÉ RESUELVE
-- David: «a una misma asistencia se le podrían poner varias puertas, ya que
-- en una misma asistencia puede que se toquen varias puertas, y el hacer
-- varias asistencias implicaría varios desplazamientos. Por eso sería útil
-- un parte tipo multipuerta en el que a cada puerta se le pueda poner sus
-- comentarios y demás temas en un solo parte.»
--
-- Media pieza estaba hecha ya: la tabla «aviso_puertas» existe desde el
-- 04-11-2026 para las obras y las preventivas, y el alta de asistencia ya
-- deja marcar varias puertas. Lo que faltaba era el parte: cada puerta con
-- SU diagnóstico y SU trabajo.
--
-- QUÉ AÑADE
-- Dos columnas de texto en la tabla que ya enlaza la asistencia con cada
-- puerta. No hace falta tabla nueva: el sitio donde vive «esta puerta estuvo
-- en esta visita» es el mismo donde debe vivir «y esto es lo que se le hizo».
--
-- POR QUÉ NO SE TOCAN avisos.diagnostico NI avisos.trabajo
-- Porque los lee media aplicación: el parte impreso, el expediente de la
-- puerta, el correo al cliente, la propuesta de factura y el histórico.
--
-- Se quedan, y pasan a ser EL RESUMEN DE LA VISITA. Cuando hay varias
-- puertas, la aplicación los rellena sola juntando lo de cada una, con su
-- código delante. Así todo lo que ya los leía sigue diciendo la verdad sin
-- enterarse de que ahora hay detalle por puerta, y el cliente que recibe el
-- parte lee las dos puertas, no una.
--
-- Se puede ejecutar las veces que haga falta.
--
-- 24-11-2026
-- ================================================================

alter table public.aviso_puertas add column if not exists diagnostico text;
alter table public.aviso_puertas add column if not exists trabajo text;

comment on column public.aviso_puertas.diagnostico is
  'Qué se encontró en ESTA puerta de la visita. El resumen de toda la visita sigue en avisos.diagnostico.';
comment on column public.aviso_puertas.trabajo is
  'Qué se hizo en ESTA puerta de la visita. El resumen de toda la visita sigue en avisos.trabajo.';
