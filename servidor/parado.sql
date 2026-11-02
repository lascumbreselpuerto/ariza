-- ============================================================================
-- ARIZA SAT · Desde cuándo está quieto
--
-- POR QUÉ
-- La aplicación sabe perfectamente lo que está abierto: avisos sin asignar,
-- obras a medias, avisos esperando un repuesto. Lo que no sabía es DESDE CUÁNDO
-- está así, y sin eso no se puede distinguir lo que lleva dos días de lo que
-- lleva siete semanas.
--
-- En la tabla de avisos solo había dos fechas: «creado» y «cerrado». Un aviso
-- que se recibió en marzo, se asignó en abril y se quedó esperando un repuesto
-- en mayo no tiene ninguna fecha de mayo guardada en ninguna parte: para la
-- base de datos sigue siendo un aviso de marzo. Y eso es justo lo que hace que
-- un aviso esperando repuesto se quede ahí para siempre, porque nada envejece.
--
-- CÓMO SE RESUELVE
-- Dos columnas y un disparador:
--
--   avisos.movido_el  → la última vez que alguien tocó ese aviso.
--   avisos.estado_el  → la última vez que CAMBIÓ de estado.
--
-- Las dos las sella el servidor, no la aplicación: una fecha que depende de que
-- el programa se acuerde de escribirla se queda sin escribir el día que alguien
-- añade un camino nuevo. El disparador no tiene ese problema.
--
-- LO QUE ESTO NO ARREGLA, Y CONVIENE SABERLO
-- La historia empieza hoy. Lo ya existente se rellena con la única fecha que de
-- verdad hay: la de cierre si está cerrado, y si no la de creación. Así que un
-- aviso que lleva tres meses esperando un repuesto va a aparecer, a partir de
-- ahora, como que lleva quieto desde el día en que se creó, que es lo más
-- parecido a la verdad que se puede afirmar con los datos que hay. De aquí en
-- adelante las dos fechas son exactas.
--
-- No cambia ninguna fórmula ni ningún importe. Solo añade dos fechas.
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

alter table public.avisos add column if not exists movido_el timestamptz;
alter table public.avisos add column if not exists estado_el timestamptz;

-- Relleno de lo que ya hay. Solo donde está vacío, para que volver a ejecutar
-- el fichero no borre las fechas de verdad que se hayan ido sellando. Van en
-- dos sentencias, una por columna, y no en una sola con las dos: así cada una
-- toca únicamente las filas que le faltan, y a la otra columna no se le pone
-- una fecha de hoy que no le corresponde.
update public.avisos set movido_el = coalesce(cerrado, creado) where movido_el is null;
update public.avisos set estado_el = coalesce(cerrado, creado) where estado_el is null;

-- El disparador. Dos reglas, y la segunda es la que importa:
--   · cualquier cambio sella movido_el;
--   · un cambio de ESTADO sella además estado_el.
-- Si una actualización no cambia nada de verdad, igual sella movido_el: alguien
-- ha estado ahí, y para esto eso cuenta como movimiento.
create or replace function public.avisos_sellar_movimiento()
returns trigger
language plpgsql
as $$
begin
  -- Se sella solo si quien hace el cambio NO ha puesto él la fecha. Si la pone
  -- (el relleno de más arriba, o una corrección a mano), manda la suya.
  -- Sin esta condición la columna sería imposible de rellenar: el disparador
  -- machacaría con la fecha de hoy el relleno del propio fichero, y el día que
  -- se ejecutara, TODO lo que está abierto parecería recién tocado. Es decir,
  -- el panel de lo parado saldría vacío y mintiendo.
  if new.movido_el is not distinct from old.movido_el then
    new.movido_el := now();
  end if;
  if new.estado is distinct from old.estado
     and new.estado_el is not distinct from old.estado_el then
    new.estado_el := now();
  end if;
  return new;
end;
$$;

drop trigger if exists avisos_sellar_movimiento on public.avisos;
create trigger avisos_sellar_movimiento
  before update on public.avisos
  for each row execute function public.avisos_sellar_movimiento();

-- Y al nacer, las dos fechas son la de creación.
create or replace function public.avisos_sellar_alta()
returns trigger
language plpgsql
as $$
begin
  new.movido_el := coalesce(new.movido_el, now());
  new.estado_el := coalesce(new.estado_el, now());
  return new;
end;
$$;

drop trigger if exists avisos_sellar_alta on public.avisos;
create trigger avisos_sellar_alta
  before insert on public.avisos
  for each row execute function public.avisos_sellar_alta();

-- Para buscar lo que lleva tiempo quieto sin leer la tabla entera.
create index if not exists avisos_movido_idx on public.avisos (movido_el)
  where cerrado is null;
create index if not exists avisos_estado_el_idx on public.avisos (estado_el)
  where cerrado is null;

-- ----------------------------------------------------------------------------
-- La vista de lo que está quieto. La aplicación no la necesita (lo calcula con
-- lo que ya tiene cargado), pero desde el editor de SQL es la manera de ver de
-- un tirón lo que nadie está tocando, y sirve para comprobar que lo que pinta
-- la pantalla y lo que dice la base de datos son lo mismo.
--
-- «quieto_desde» es la fecha más reciente de las que de verdad indican que algo
-- pasó: el último parte de obra, el cambio de estado, el movimiento, el alta.
-- ----------------------------------------------------------------------------
create or replace view public.avisos_parados as
select a.id,
       a.tipo,
       a.estado,
       a.prioridad,
       a.cliente_id,
       a.puerta_id,
       a.tecnico_id,
       greatest(
         coalesce(a.movido_el, a.creado),
         coalesce(a.estado_el, a.creado),
         -- de cada parte de obra, la fecha más reciente de las dos que tiene:
         -- el día que se trabajó y el día que se apuntó
         coalesce((select max(greatest(j.fecha::timestamptz, j.creado))
                     from public.jornadas j where j.aviso_id = a.id), a.creado),
         a.creado
       )                                        as quieto_desde,
       a.creado,
       case when a.tecnico_id is null then 'sin asignar'
            when a.estado = 'repuesto'  then 'esperando repuesto'
            when a.obra_larga           then 'obra sin movimiento'
            else 'abierto'
       end                                      as motivo
  from public.avisos a
 where a.cerrado is null
   and not a.anulada;

grant select on public.avisos_parados to authenticated;
