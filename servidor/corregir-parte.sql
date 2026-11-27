-- ================================================================
-- SAFE2DOOR · CORREGIR UN PARTE YA CERRADO, CON RASTRO
--
-- QUÉ RESUELVE
--
-- David, 25-11-2026: «Poder editar una asistencia realizada… aun estando
-- firmadas. Siempre bajo la responsabilidad de la oficina y solo desde oficina
-- o administración.»
--
-- Y el 27-11-2026, al elegir cómo: editar en el sitio, sin versiones, con una
-- nota de quién lo tocó y cuándo.
--
-- Lo que pasaba hasta hoy: un parte cerrado se podía abrir y guardar, pero sin
-- revalidarlo, sin recalcular lo que cuesta y sin que quedara dicho en ninguna
-- parte que alguien lo había tocado. O se volvía a cerrar, y entonces el parte
-- cambiaba su fecha de cierre y parecía que la visita se hizo otro día.
--
-- QUÉ GUARDA, Y POR QUÉ CADA COLUMNA
--
--   corregido_en    cuándo se corrigió la última vez.
--   corregido_por   quién. Las dos juntas son la nota que pidió David.
--   corregido_nota  por qué. Un parte firmado que cambia sin decir por qué es
--                   justo lo que no se puede defender si el cliente reclama.
--   correcciones    cuántas veces. Sin esto, tres correcciones y una se ven
--                   igual: solo quedaría la última y nadie sabría que hubo más.
--                   No es un historial, que es lo que David decidió NO tener;
--                   es el aviso de que hay más de lo que se ve.
--
-- QUÉ NO CAMBIA
--
--   · La fecha de cierre y quién cerró: siguen siendo las del día en que el
--     técnico cerró el parte en la obra. Corregir no es volver a cerrar.
--   · La firma del cliente. No se borra ni se pide otra.
--   · Los avisos de Telegram y el correo del parte no se repiten: sus
--     disparadores miran el paso de abierto a cerrado, y una corrección no es
--     ese paso.
--
-- Se puede ejecutar las veces que haga falta.
--
-- 27-11-2026
-- ================================================================

alter table public.avisos add column if not exists corregido_en timestamptz;
alter table public.avisos add column if not exists corregido_por text;
alter table public.avisos add column if not exists corregido_nota text;
alter table public.avisos add column if not exists correcciones integer not null default 0;

comment on column public.avisos.corregido_en is
  'Cuándo se corrigió este parte por última vez, después de estar cerrado. No '
  'es la fecha de cierre: esa es la del día en que el técnico lo cerró en la '
  'obra y no se toca.';

comment on column public.avisos.corregido_por is
  'Quién hizo la última corrección. Solo la oficina y la administración pueden '
  'corregir un parte cerrado, por decisión de David del 25-11-2026.';

comment on column public.avisos.corregido_nota is
  'Por qué se corrigió. Hace falta: un parte firmado que cambia sin decir por '
  'qué es lo que no se puede defender si el cliente reclama.';

comment on column public.avisos.correcciones is
  'Cuántas veces se ha corregido este parte después de cerrarlo. Las columnas '
  'de arriba solo guardan la última, así que sin este número tres correcciones '
  'y una se verían igual. No es un historial (David decidió el 27-11-2026 '
  'corregir en el sitio, sin versiones): es el aviso de que hubo más.';

-- Para la pregunta de la oficina: ¿qué partes se han tocado después de
-- cerrarlos? Es la lista que se mira cuando un cliente discute una factura.
create index if not exists avisos_corregidos_idx
  ON public.avisos USING btree (corregido_en)
  WHERE (corregido_en IS NOT NULL);

-- ============================================================================
-- Comprobación rápida:
--
--   select column_name from information_schema.columns
--    where table_name = 'avisos'
--      and column_name in ('corregido_en','corregido_por','corregido_nota','correcciones');
--   -- tienen que salir las cuatro
-- ============================================================================
