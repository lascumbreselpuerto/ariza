-- ============================================================================
-- ARIZA SAT · En qué almacén se guarda cada material, y dónde dentro
--                                                                  08-11-2026
-- POR QUÉ
-- David, el 08-11-2026, revisando la ficha de un material:
--
--   «En vez de preguntar dónde está en la nave, debería de preguntar en qué
--    almacén está y poder elegir uno de esos almacenes. Y luego preguntar en
--    qué parte de este almacén está guardado.»
--
-- Y tiene razón por una cosa concreta: desde que los almacenes los crea la
-- oficina (nave, Furgo 1, Furgo 2, el taller, un contenedor de obra), poner
-- «estantería B» sin decir de dónde no sirve para buscar nada. El técnico que
-- lee «balda 3» no sabe si es la balda 3 de la nave o la de la furgoneta del
-- compañero.
--
-- LO QUE YA HABÍA Y NO SE TIRA
-- La columna «articulos.ubicacion» existe desde el SQL del almacén y guarda un
-- texto libre. Ese texto NO se borra: pasa a ser «en qué parte», que es
-- exactamente para lo que se usaba. Lo que se añade es el almacén.
--
-- NO CONFUNDIR CON LAS EXISTENCIAS
-- Esto es dónde se GUARDA habitualmente el material, que lo decide la oficina
-- una vez. Dónde ESTÁ ahora mismo, y cuánto hay en cada sitio, sale de los
-- movimientos y eso no cambia. Un material puede estar guardado «en la nave,
-- estantería B» y tener tres unidades rodando en una furgoneta.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. El almacén donde se guarda
--
-- Apunta a «ubicaciones», que es la tabla de almacenes que gobierna la oficina.
-- Si alguien borra un almacén, el material no se pierde: se queda sin almacén
-- puesto y la oficina lo vuelve a colocar. Por eso «set null» y no «cascade».
-- ---------------------------------------------------------------------------
alter table public.articulos
  add column if not exists ubicacion_id uuid
  references public.ubicaciones(id) on delete set null;

create index if not exists articulos_ubicacion_idx
  on public.articulos (ubicacion_id);

comment on column public.articulos.ubicacion_id is
  'En qué almacén se guarda habitualmente este material: la nave, una '
  'furgoneta, el taller. Lo pone la oficina en la ficha. NO es dónde está '
  'ahora: eso sale de los movimientos. Desde el 08-11-2026.';

comment on column public.articulos.ubicacion is
  'En qué parte del almacén está guardado: «estantería B, balda 3», «cajón de '
  'la puerta izquierda». Antes decía «dónde está en la nave», y desde el '
  '08-11-2026 el almacén va aparte, en ubicacion_id, porque ya no hay una sola '
  'nave: hay nave, furgonetas y los sitios que cree la oficina.';

-- ---------------------------------------------------------------------------
-- 2. Lo que ya estaba escrito se queda donde estaba
--
-- Los materiales que tienen un sitio escrito y ningún almacén puesto se
-- colocan en la NAVE, que es lo que querían decir cuando se escribieron: hasta
-- hoy el campo se llamaba «dónde está en la nave».
--
-- Solo a los que NO tengan almacén puesto: lo que la oficina haya colocado a
-- mano no se toca. Y solo si hay una nave, claro.
-- ---------------------------------------------------------------------------
do $$
declare v_nave uuid; v_tocados int;
begin
  select id into v_nave from public.ubicaciones
   where tipo = 'nave' and coalesce(activo, true) order by creado limit 1;

  if v_nave is null then
    raise notice 'No hay ningún almacén de tipo nave: no se coloca nada.';
  else
    update public.articulos
       set ubicacion_id = v_nave
     where ubicacion_id is null
       and btrim(coalesce(ubicacion, '')) <> '';
    get diagnostics v_tocados = row_count;
    if v_tocados > 0 then
      raise notice 'Materiales colocados en la nave: %. Tenían sitio escrito y '
                   'ningún almacén, y hasta hoy ese campo decía «en la nave».', v_tocados;
    else
      raise notice 'No había materiales con sitio escrito y sin almacén.';
    end if;
  end if;
end $$;

-- ============================================================================
-- Comprobación. Debe devolver la columna nueva y cuántos materiales están ya
-- colocados en algún almacén.
--
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='articulos' and column_name='ubicacion_id';
--
-- select u.nombre as almacen, count(*) as materiales
--   from public.articulos a
--   left join public.ubicaciones u on u.id = a.ubicacion_id
--  where a.activo is distinct from false
--  group by u.nombre order by 2 desc;
-- ============================================================================
