-- ============================================================================
-- ARIZA SAT · Rastro de quién completa una ficha ya firmada
--
-- POR QUÉ
-- Desde el 01-11-2026 el parte de trabajo se cierra sin exigir que la ficha de
-- la puerta esté completa. Era necesario: en pruebas de campo el técnico se
-- quedaba sin poder cerrar por una medida o una matrícula, y el trabajo acababa
-- sin hacerse. Un bloqueo que la gente sortea no protege el dato.
--
-- A cambio, esas fichas se rematan después desde la oficina, y ahí aparece una
-- pregunta que antes no existía: si el cliente ya firmó el parte, ¿quién tocó la
-- ficha después de la firma?
--
-- El parte firmado NO se modifica nunca. Lo que se completa es la ficha de la
-- puerta, que es otra cosa: el inventario de la empresa. Pero conviene que quede
-- dicho quién lo hizo y cuándo, para que dentro de dos años se pueda distinguir
-- lo que se tomó en obra de lo que se completó en la oficina.
--
-- Estas dos columnas son solo eso: un rastro. No deciden nada.
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

alter table public.puertas add column if not exists ficha_tocada_por text;
alter table public.puertas add column if not exists ficha_tocada_el timestamptz;

comment on column public.puertas.ficha_tocada_por is
  'Quién completó esta ficha DESPUÉS de que el cliente firmara un parte de esa '
  'puerta. Vacío en la mayoría: solo se escribe cuando había firma.';
comment on column public.puertas.ficha_tocada_el is
  'Cuándo se completó. Sirve para distinguir lo que se tomó en obra de lo que '
  'se remató en la oficina.';

-- ---------------------------------------------------------------------------
-- Comprobación
--
-- Después de ejecutar esto, las fichas rematadas en oficina se ven así:
--
--   select codigo, ficha_tocada_por, ficha_tocada_el
--     from public.puertas
--    where ficha_tocada_por is not null
--    order by ficha_tocada_el desc;
--
-- Y las que todavía están a medias las enseña la propia aplicación, en
-- Gestión → «Fichas de puerta a medias». Esa lista no se guarda en ninguna
-- columna: se calcula sola, así que en cuanto el dato se rellena la puerta
-- desaparece de ella. Un campo «pendiente» que hubiera que apagar a mano
-- acabaría mintiendo.
-- ---------------------------------------------------------------------------
