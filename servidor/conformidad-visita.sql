-- ============================================================================
-- ARIZA SAT · La situación de la puerta frente a la normativa, en cada visita
--                                                                  09-11-2026
-- POR QUÉ
-- David, el 09-11-2026:
--
--   «Cada vez que tocamos una puerta existente debemos decir si esa puerta
--    cumple normativa o no, y debemos informar al cliente para que sepa en qué
--    situación legal está su puerta. Hace falta un punto dentro de todos los
--    partes que contengan una puerta, un botón que pregunte al técnico si la
--    puerta cumple con la normativa vigente, con cinco o seis puntos, y que
--    salga automáticamente en el parte de trabajo que recibe el cliente.»
--
-- LO QUE YA HABÍA, Y POR QUÉ NO BASTABA
-- Los puntos de cumplimiento existen desde el expediente: EXP_COMPROBACIONES,
-- con 21 puntos para industrial, 14 para peatonal, 9 para barrera y 11 para
-- cortafuegos. Y el guion de revisión ya pregunta por la seguridad y ya sale
-- impreso en el parte. El problema es que ese guion SOLO se rellena en las
-- preventivas: en una avería, una instalación, una urgencia o una puesta en
-- servicio no se le preguntaba nada al técnico sobre normativa, y son la
-- mayoría de las visitas y la puerta de entrada a casa de un cliente nuevo.
--
-- POR QUÉ UNA TABLA PROPIA Y NO DENTRO DEL EXPEDIENTE
-- Porque el expediente es la foto del día en que se emitió y no se toca: esa
-- es la regla de la casa desde que existe. Lo que el técnico ve en dos minutos
-- durante una avería es otra cosa, y tiene que poder decirse sin falsear un
-- documento que alguien firmó. Van separados a propósito: aquí queda lo visto
-- en campo, con su fecha y su técnico, y el expediente sigue siendo el
-- expediente. Cada visita deja su fila y así se puede ver cómo evoluciona una
-- puerta: lo que faltaba en marzo y sigue faltando en noviembre.
--
-- NO DICE NUNCA QUE UNA PUERTA CUMPLE
-- Son seis puntos de los nueve a once críticos que tiene cada familia, y de
-- los veintiún puntos que tiene el expediente de una industrial. Con seis
-- puntos se puede afirmar que algo NO cumple, nunca que cumple. El documento
-- que ve el cliente está redactado con esa limitación escrita.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La tabla
--
-- Una fila por visita y puerta. Si se borra la visita o la puerta, se va con
-- ella: es un dato de esa visita, no un documento que deba sobrevivir solo.
-- ---------------------------------------------------------------------------
create table if not exists public.conformidad_visita (
  id          uuid primary key default gen_random_uuid(),
  aviso_id    uuid not null references public.avisos(id)   on delete cascade,
  puerta_id   uuid not null references public.puertas(id)  on delete cascade,
  familia     text,
  puntos      jsonb not null default '{}'::jsonb,
  fallos      int  not null default 0,
  sin_mirar   int  not null default 0,
  nota        text,
  perfil_id   uuid references public.perfiles(id) on delete set null,
  quien       text,
  creado      timestamptz not null default now()
);

comment on table public.conformidad_visita is
  'Lo que el técnico vio de la normativa en una visita concreta: seis puntos '
  'críticos, contestados sí / no / no se ha podido comprobar. NO es el '
  'expediente de la puerta, que es un documento emitido y firmado: esto es lo '
  'que se vio ese día, y por eso lleva fecha y técnico. Desde el 09-11-2026.';

comment on column public.conformidad_visita.puntos is
  'Las respuestas, por clave de EXP_COMPROBACIONES: {"marcado":"si", '
  '"presencia":"no", "manual":"nd"}. «nd» es no se ha podido comprobar, y '
  'existe a propósito: sin esa salida el técnico con prisa marca «sí».';

comment on column public.conformidad_visita.fallos is
  'Cuántos puntos se contestaron «no». Se guarda calculado para poder listar '
  'las puertas con incumplimientos sin abrir el jsonb de cada fila.';

comment on column public.conformidad_visita.quien is
  'El nombre del técnico el día de la visita. Se guarda escrito, además del '
  'identificador, porque un parte entregado al cliente no se reescribe si '
  'mañana se corrige el nombre en Equipo.';

-- ---------------------------------------------------------------------------
-- 2. Para buscar
--
-- Las dos preguntas que se harán: «qué se vio en esta visita» y «cuál fue lo
-- último que se vio en esta puerta».
-- ---------------------------------------------------------------------------
create index if not exists conformidad_visita_aviso_idx
  on public.conformidad_visita (aviso_id);
create index if not exists conformidad_visita_puerta_idx
  on public.conformidad_visita (puerta_id, creado desc);

-- ---------------------------------------------------------------------------
-- 3. Una sola por visita y puerta
--
-- Si el técnico vuelve a entrar en el parte y lo cambia, se corrige la fila,
-- no se añade otra. Una visita dice una cosa de cada puerta.
-- ---------------------------------------------------------------------------
create unique index if not exists conformidad_visita_unica
  on public.conformidad_visita (aviso_id, puerta_id);

-- ---------------------------------------------------------------------------
-- 4. Quién puede verla y tocarla
--
-- Lo mismo que el resto de las tablas de trabajo: el equipo, con la función
-- es_equipo() que ya gobierna el almacén y los avisos. El reparto fino de qué
-- ve cada técnico lo hace la aplicación, no la base de datos.
-- ---------------------------------------------------------------------------
alter table public.conformidad_visita enable row level security;

drop policy if exists "equipo conformidad visita" on public.conformidad_visita;
create policy "equipo conformidad visita" on public.conformidad_visita
  for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

-- ============================================================================
-- Comprobación. Debe devolver la tabla y sus tres índices.
--
-- select column_name, data_type from information_schema.columns
--  where table_schema='public' and table_name='conformidad_visita'
--  order by ordinal_position;
--
-- select indexname from pg_indexes
--  where schemaname='public' and tablename='conformidad_visita';
--
-- Y, cuando haya visitas hechas, las puertas con incumplimientos apuntados:
--
-- select p.codigo, c.creado::date, c.fallos, c.puntos
--   from public.conformidad_visita c
--   join public.puertas p on p.id = c.puerta_id
--  where c.fallos > 0
--  order by c.creado desc;
-- ============================================================================
