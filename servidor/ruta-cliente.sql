-- ============================================================================
-- ARIZA SAT · La ruta habitual del cliente y de cada uno de sus centros
--
-- POR QUÉ
-- David, 03-11-2026: «Desde oficina se puede dejar ya marcada la ruta. En la
-- oficina saben de primera mano dónde es la instalación. De esta manera el
-- técnico no tiene que marcarlo, ya que por experiencia, todo lo que se le deje
-- hecho al técnico mejor para él por ahorro de tiempo y disminución de errores.»
--
-- Desde rutas.sql la ruta se elige visita a visita. Pero la ruta no cambia de
-- una visita a otra: a la misma nave se conduce lo mismo hoy que el mes que
-- viene. Lo que cambiaba era quién se acordaba de ponerla.
--
-- DÓNDE VA, Y POR QUÉ EN DOS SITIOS
-- La ruta depende de dónde se conduce, no de quién paga. Un cliente con nave en
-- Jerez y tienda en Cádiz son dos rutas distintas, así que:
--   · centros.ruta  → la ruta de ESA dirección. Manda sobre la del cliente.
--   · clientes.ruta → la ruta del cliente, para el que tiene una sola dirección,
--                     que son la mayoría, y como respaldo del que tiene varias.
-- Decisión de David el 03-11-2026, sobre las tres opciones que se le pusieron.
--
-- QUÉ NO HACE ESTE FICHERO
--   · No toca ninguna visita, ni abierta ni cerrada: lo ya valorado se queda
--     exactamente como está. Esto solo rellena el desplegable de lo nuevo.
--   · No cambia valorar_aviso. Lo que se cobra sigue saliendo de avisos.ruta, la
--     ruta que quedó guardada en esa visita, y de ninguna otra parte. La ruta del
--     cliente es una propuesta en pantalla, no un importe.
--   · No pone ninguna ruta a nadie. Los dos campos nacen vacíos: una ruta puesta
--     por el ordenador es una ruta que nadie ha mirado, y se cobraría igual.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- Hace falta rutas.sql ejecutado antes (es el que crea las cinco rutas).
-- ============================================================================

-- 1. La ruta del cliente
alter table public.clientes add column if not exists ruta text;

comment on column public.clientes.ruta is
  'Ruta habitual de este cliente: ruta1..ruta5, o km. Vacío: no tiene. '
  'Se propone al crear la asistencia y al cerrar el parte si no hay otra puesta; '
  'lo que se cobra sale siempre de avisos.ruta, no de aquí.';

-- 2. La ruta de cada centro del cliente, que manda sobre la del cliente
alter table public.centros add column if not exists ruta text;

comment on column public.centros.ruta is
  'Ruta de esta dirección concreta: ruta1..ruta5, o km. Vacío: se usa la del '
  'cliente. Manda sobre la del cliente porque la ruta depende de dónde se '
  'conduce, no de quién paga.';

-- 3. Que no se pueda guardar una ruta que no existe
-- Sin esto, un día un nombre mal escrito ('ruta6', 'Ruta 2') se guarda sin
-- quejarse, la aplicación no lo reconoce, no propone nada y nadie sabe por qué.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_ruta_valida') then
    alter table public.clientes
      add constraint clientes_ruta_valida
      check (ruta is null or ruta in ('ruta1','ruta2','ruta3','ruta4','ruta5','km'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'centros_ruta_valida') then
    alter table public.centros
      add constraint centros_ruta_valida
      check (ruta is null or ruta in ('ruta1','ruta2','ruta3','ruta4','ruta5','km'));
  end if;
end $$;

-- 4. Para ver de un vistazo a quién le falta
-- Los clientes con visitas y sin ruta puesta en ninguna parte: son los que
-- siguen obligando al técnico a elegirla a mano.
create or replace view public.clientes_sin_ruta as
select c.id as cliente_id,
       c.nombre,
       count(a.id) as visitas,
       max(a.creado) as ultima_visita,
       count(ce.id) filter (where ce.ruta is not null) as centros_con_ruta,
       count(ce.id) as centros
  from public.clientes c
  left join public.avisos  a  on a.cliente_id = c.id and not coalesce(a.anulada, false)
  left join public.centros ce on ce.cliente_id = c.id
 where c.ruta is null
 group by c.id, c.nombre
having count(a.id) > 0
   and count(ce.id) filter (where ce.ruta is not null) = 0
 order by count(a.id) desc;

comment on view public.clientes_sin_ruta is
  'Clientes con visitas y sin ruta habitual, ni en su ficha ni en ningún centro '
  'suyo. Son los que siguen obligando a elegir la ruta visita a visita.';

grant select on public.clientes_sin_ruta to authenticated;
