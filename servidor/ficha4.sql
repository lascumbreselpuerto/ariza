-- ============================================================================
-- ARIZA SAT · «No se sabe» en el año y en quién la instaló
--
-- POR QUÉ
-- David, 07-11-2026, probando las asistencias en campo:
--
--   «En nueva puerta, cuando pregunta por quién ha sido instalada, deberíamos
--    poder escribir el nombre del instalador si lo desconocemos, o poder elegir
--    desconocido. Lo mismo valoramos en el año.»
--
-- Hasta hoy los dos campos se quedaban EN BLANCO cuando no se sabía, y en
-- blanco significan dos cosas muy distintas: «no lo he rellenado» y «he
-- preguntado y nadie lo sabe». La primera es trabajo pendiente; la segunda es
-- un dato tomado. Mezclarlas tiene dos consecuencias feas: la lista de fichas
-- incompletas nunca se vacía, porque hay puertas que no se podrán completar
-- jamás, y el técnico vuelve a preguntar en cada visita lo que ya se preguntó.
--
-- En una puerta de los años ochenta, sin placa y sin nadie que recuerde quién
-- la montó, «desconocido» es la verdad y hay que poder escribirla.
--
-- QUÉ AÑADE
--   · puertas.anio_desconocido        el año se preguntó y no se sabe
--   · puertas.instalador_desconocido  quién la instaló se preguntó y no se sabe
--
-- QUÉ NO HACE
--   · No cambia ninguna puerta que ya exista: todas nacen con las dos marcas a
--     false, que es lo que les corresponde (nadie ha dicho todavía que no se
--     sepan).
--   · No toca ningún importe ni ninguna valoración.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- ============================================================================

alter table public.puertas add column if not exists anio_desconocido boolean not null default false;
alter table public.puertas add column if not exists instalador_desconocido boolean not null default false;

comment on column public.puertas.anio_desconocido is
  'El año de la puerta se preguntó y no se sabe. Es un dato tomado, no un hueco '
  'sin rellenar: con esto marcado la ficha deja de pedirlo.';
comment on column public.puertas.instalador_desconocido is
  'Quién instaló la puerta se preguntó y no se sabe. Lo normal en puertas '
  'antiguas, sin placa y sin nadie que lo recuerde.';

-- Marcado «no se sabe» Y con valor escrito a la vez no puede ser: una de las
-- dos cosas es mentira, y la ficha enseñaría una y los papeles la otra.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'puertas_desconocido_coherente') then
    alter table public.puertas
      add constraint puertas_desconocido_coherente check (
        (anio_desconocido is not true or anio is null)
        and (instalador_desconocido is not true
             or coalesce(btrim(instalador), '') = '')
      );
  end if;
end $$;

-- ============================================================================
-- Comprobación rápida:
--
--   select column_name from information_schema.columns
--    where table_name = 'puertas'
--      and column_name in ('anio_desconocido','instalador_desconocido');
--   select codigo, anio, anio_desconocido, instalador, instalador_desconocido
--     from public.puertas limit 10;
-- ============================================================================
