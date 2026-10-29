-- ============================================================================
-- ARIZA SAT · Una obra, varias puertas
--
-- POR QUÉ
-- Una asistencia tenía UNA puerta: la columna avisos.puerta_id. En una
-- instalación de varios días eso casi nunca es verdad. Se montan dos
-- seccionales y una peatonal en la misma nave, y la aplicación solo podía
-- guardar una.
--
-- Y lo hacía callando: al dar de alta la segunda puerta desde el parte, la
-- aplicación escribía su id en avisos.puerta_id y la primera se soltaba. Sin
-- aviso y sin rastro. La puerta seguía existiendo en su ficha, pero ya no
-- tenía nada que ver con la obra en la que se montó.
--
-- CÓMO SE RESUELVE
-- Una tabla de unión: aviso_puertas. Una fila por cada puerta que se monta o
-- se toca en esa obra.
--
-- avisos.puerta_id NO se quita, y se queda con la primera: es la puerta
-- principal de la obra. Hay más de treinta sitios en la aplicación que leen
-- esa columna (el QR de la tarjeta, los documentos, el expediente, la lista
-- de asistencias de una puerta), y cambiarlos todos de golpe para una obra de
-- tres puertas sería cambiar media aplicación por el caso raro. Así que la
-- columna sigue siendo la principal y la tabla es la lista completa.
--
-- Las ACTAS DE ENTREGA ya estaban preparadas para esto desde obra2.sql: una
-- fila por entrega, con su puerta. Aquí no hace falta tocarlas. Lo que cambia
-- es que ahora la aplicación sabe cuántas actas tiene que pedir.
--
-- Las JORNADAS siguen siendo de la obra, no de cada puerta: el técnico pasa el
-- día en la nave, no en una puerta concreta, y repartir las horas entre tres
-- puertas sería inventarse un dato que nadie ha medido.
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Las puertas de una obra
-- ---------------------------------------------------------------------------
create table if not exists public.aviso_puertas (
  id         uuid primary key default gen_random_uuid(),
  aviso_id   uuid not null references public.avisos(id)  on delete cascade,
  puerta_id  uuid not null references public.puertas(id) on delete cascade,
  -- en qué orden se montaron o se enseñan; la 1 es la principal
  orden      integer,
  creado     timestamptz not null default now(),
  creado_por text default ''
);

-- Si la tabla ya existía de una ejecución anterior, el create de arriba no la
-- toca. Las columnas que se hayan añadido después van aquí, ANTES de los
-- comentarios: un comentario sobre una columna que todavía no existe aborta el
-- script entero y deja la base a medias.
alter table public.aviso_puertas add column if not exists orden integer;
alter table public.aviso_puertas add column if not exists creado_por text default '';

comment on table public.aviso_puertas is
  'Las puertas de una obra. Una instalación de varios días suele llevar más '
  'de una, y antes solo cabía la de avisos.puerta_id: al dar de alta la '
  'segunda, la primera se soltaba sin avisar.';
comment on column public.aviso_puertas.orden is
  'En qué orden se enseñan. La 1 es la principal, la que sigue estando en '
  'avisos.puerta_id y la que sale en la tarjeta y en los documentos.';

-- La misma puerta no puede estar dos veces en la misma obra
create unique index if not exists aviso_puertas_par_idx
  on public.aviso_puertas (aviso_id, puerta_id);
create index if not exists aviso_puertas_aviso_idx
  on public.aviso_puertas (aviso_id, orden);
create index if not exists aviso_puertas_puerta_idx
  on public.aviso_puertas (puerta_id);

alter table public.aviso_puertas enable row level security;
drop policy if exists "equipo aviso puertas" on public.aviso_puertas;
create policy "equipo aviso puertas" on public.aviso_puertas for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

-- ---------------------------------------------------------------------------
-- 2. Lo que ya estaba
--
-- Cada asistencia que hoy tiene puerta pasa a tener su fila en la tabla, como
-- principal. Sin esto, abrir una obra antigua enseñaría cero puertas y
-- parecería que se han perdido.
-- ---------------------------------------------------------------------------
insert into public.aviso_puertas (aviso_id, puerta_id, orden, creado_por)
select a.id, a.puerta_id, 1, 'migración obra3'
  from public.avisos a
 where a.puerta_id is not null
   and not exists (
     select 1 from public.aviso_puertas ap
      where ap.aviso_id = a.id and ap.puerta_id = a.puerta_id);

-- Y las puertas que ya tienen acta de entrega en una obra, aunque no sean la
-- principal. Si alguien consiguió firmar dos actas en la misma asistencia
-- antes de esto, la segunda puerta no se queda fuera de la lista.
insert into public.aviso_puertas (aviso_id, puerta_id, orden, creado_por)
select e.aviso_id, e.puerta_id, 2, 'migración obra3'
  from public.entregas_obra e
 where e.aviso_id is not null
   and e.puerta_id is not null
   and not exists (
     select 1 from public.aviso_puertas ap
      where ap.aviso_id = e.aviso_id and ap.puerta_id = e.puerta_id);

-- ---------------------------------------------------------------------------
-- 3. Qué puertas lleva cada obra, de un vistazo
--
-- Para la oficina y para comprobar la migración. No la usa la aplicación.
-- ---------------------------------------------------------------------------
create or replace view public.obras_puertas as
select a.id as aviso_id,
       a.tipo,
       a.cerrado,
       a.obra_larga,
       (select count(*) from public.aviso_puertas ap
         where ap.aviso_id = a.id)                       as puertas,
       (select count(*) from public.entregas_obra e
         where e.aviso_id = a.id)                        as actas,
       (select count(*) from public.entregas_obra e
         where e.aviso_id = a.id and e.firma_el is not null) as actas_firmadas,
       (select string_agg(p.codigo, ' · ' order by ap.orden, p.codigo)
          from public.aviso_puertas ap
          join public.puertas p on p.id = ap.puerta_id
         where ap.aviso_id = a.id)                       as codigos
  from public.avisos a;

comment on view public.obras_puertas is
  'Cuántas puertas lleva cada obra y cuántas actas de entrega tiene firmadas. '
  'Para comprobar de un vistazo que no queda ninguna puerta sin entregar.';

-- ---------------------------------------------------------------------------
-- Comprobación
--
-- Después de ejecutar esto, estas dos consultas tienen que dar lo mismo:
--
--   select count(*) from public.avisos where puerta_id is not null;
--   select count(distinct aviso_id) from public.aviso_puertas;
--
-- Si la segunda es mayor, es porque alguna obra ya tiene actas de puertas que
-- no eran la principal, y eso es justo lo que venía a arreglarse.
-- ---------------------------------------------------------------------------
