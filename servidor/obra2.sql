-- ============================================================================
-- ARIZA SAT · Obras de varios días y entrega en obra
--
-- POR QUÉ
-- Tres agujeros que se ven en cuanto se usa la aplicación en una obra de
-- verdad:
--
--   1. La seccional se registraba con ancho y alto. Falta el DINTEL, que es
--      lo que decide si la puerta entra o no entra, y el que hay que volver a
--      medir cuando no se anotó.
--
--   2. Una asistencia guardaba UNA jornada: hora de entrada, hora de salida y
--      horas a facturar. Una obra de cuatro días no cabía. El técnico tenía
--      que acordarse de lo que hizo el lunes para apuntarlo el jueves, o no
--      apuntarlo.
--
--   3. Al terminar una instalación se entrega la puerta y se prueba delante
--      del cliente: abre, cierra, invierte al topar, el desbloqueo funciona.
--      Eso no quedaba por escrito en ninguna parte, así que si tres meses
--      después el cliente dice que el desbloqueo nunca fue, no hay nada que
--      enseñar.
--
-- CÓMO SE RESUELVE
--
--   · Jornadas: cada día de trabajo es una fila con sus horas, lo que se hizo,
--     el material que se gastó y lo que hay que saber antes de volver. NO se
--     firma cada día: firmar cuatro veces la misma obra no prueba nada y
--     cansa al cliente. Se firma el cierre.
--
--   · Entrega en obra: la lista de funciones probadas, el conforme o no
--     conforme, lo que el cliente quiera escribir, y su firma. Esa lista sale
--     de un guión por tipo de puerta que se edita en Equipo, igual que los
--     guiones de revisión: la aplicación no decide por su cuenta qué hay que
--     probar en una barrera.
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. El dintel
-- ---------------------------------------------------------------------------
alter table public.puertas add column if not exists dintel_mm numeric;

comment on column public.puertas.dintel_mm is
  'Altura libre entre el hueco y el techo, en milímetros. Decide el tipo de '
  'guía en todo lo que sube: seccional, enrollable, vertical, rápida y '
  'basculante. En una corredera o una batiente no se pide, porque ahí no '
  'decide nada.';

-- ---------------------------------------------------------------------------
-- 2. Jornadas de una obra
--
-- Una asistencia puede durar varios días. Cada día deja su parte, y la suma
-- de las jornadas es lo que se factura.
-- ---------------------------------------------------------------------------
create table if not exists public.jornadas (
  id           uuid primary key default gen_random_uuid(),
  aviso_id     uuid not null references public.avisos(id) on delete cascade,
  fecha        date not null default current_date,
  hora_inicio  timestamptz,
  hora_fin     timestamptz,
  horas        numeric,
  num_tecnicos integer not null default 1,
  tecnico_id   uuid,
  -- kilómetros de esa salida: cuatro días de obra son cuatro desplazamientos,
  -- y cobrar uno solo es regalar tres
  km           numeric,
  -- lo que se hizo ese día
  trabajo      text,
  -- lo que hay que saber ANTES de volver: sin esto, el jueves se repite el
  -- trabajo del lunes o se vuelve sin la pieza que hacía falta
  proxima      text,
  creado       timestamptz not null default now(),
  creado_por   text default ''
);

comment on table public.jornadas is
  'Un día de trabajo en una obra que dura varios. No se firma: firmar cuatro '
  'veces la misma obra no prueba nada. Lo que se firma es el cierre.';
comment on column public.jornadas.km is
  'Kilómetros de la salida de ese día. Se suman al cerrar la obra, igual que '
  'las horas: un desplazamiento por jornada, no uno por obra.';
comment on column public.jornadas.proxima is
  'Lo que hay que saber antes de volver: qué queda, qué falta traer, con '
  'quién hay que hablar. Sale en pantalla al abrir la asistencia.';

-- Para quien ya ejecutó este fichero antes del 27-10-2026: la tabla ya existe,
-- así que el create de arriba no la toca y la columna hay que añadirla aparte.
alter table public.jornadas add column if not exists km numeric;

create index if not exists jornadas_aviso_idx on public.jornadas (aviso_id, fecha);

alter table public.jornadas enable row level security;
drop policy if exists "equipo jornadas" on public.jornadas;
create policy "equipo jornadas" on public.jornadas for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

-- El material gastado se apunta al día en que se gastó
alter table public.materiales add column if not exists jornada_id uuid
  references public.jornadas(id) on delete set null;

comment on column public.materiales.jornada_id is
  'En qué jornada se gastó. Vacío en las visitas de un solo día, que son la '
  'mayoría: ahí el material es de la visita y punto.';

-- Y la asistencia sabe que es una obra de varios días
alter table public.avisos add column if not exists obra_larga boolean not null default false;

comment on column public.avisos.obra_larga is
  'La asistencia dura más de un día. Al marcarlo, el técnico cierra jornadas '
  'en vez de cerrar la visita, y la firma del cliente se guarda para el final.';

-- ---------------------------------------------------------------------------
-- 3. Entrega en obra
--
-- Lo que se le entrega al cliente y lo que se prueba delante de él. Una fila
-- por entrega: una obra con dos puertas tiene dos entregas, porque cada
-- puerta se prueba y se acepta por separado.
-- ---------------------------------------------------------------------------
create table if not exists public.entregas_obra (
  id           uuid primary key default gen_random_uuid(),
  aviso_id     uuid references public.avisos(id) on delete set null,
  puerta_id    uuid references public.puertas(id) on delete set null,
  cliente_id   uuid references public.clientes(id) on delete set null,
  fecha        date not null default current_date,
  -- qué se entrega: tipo de puerta, motor, cuadro, accesorios
  entregado    text,
  -- las pruebas: [{clave, texto, resultado: 'bien'|'mal'|'na', nota}]
  pruebas      jsonb not null default '[]'::jsonb,
  -- conforme | con_reparos | no_conforme
  conformidad  text not null default 'conforme',
  comentario   text,
  formacion    boolean not null default false,
  documentacion boolean not null default false,
  firma_ruta   text,
  firma_nombre text,
  firma_nif    text,
  firma_el     timestamptz,
  entregado_por text,
  creado       timestamptz not null default now(),
  creado_por   text default ''
);

comment on table public.entregas_obra is
  'La entrega de una puerta terminada: qué se entrega, qué se probó delante '
  'del cliente, si quedó conforme y su firma. Si tres meses después dice que '
  'el desbloqueo nunca fue, esto es lo que hay que enseñar.';
comment on column public.entregas_obra.conformidad is
  'conforme | con_reparos | no_conforme. Con reparos existe a propósito: un '
  'cliente que firma con una pega anotada no es lo mismo que uno que no '
  'firma, y obligarle a elegir entre sí y no falsea las dos cosas.';
comment on column public.entregas_obra.pruebas is
  'Cada función probada con su resultado. El guión sale de los ajustes, por '
  'tipo de puerta, y se edita en Equipo.';

create index if not exists entregas_obra_idx on public.entregas_obra (aviso_id, fecha desc);
create index if not exists entregas_obra_puerta_idx on public.entregas_obra (puerta_id, fecha desc);

alter table public.entregas_obra enable row level security;
drop policy if exists "equipo entregas obra" on public.entregas_obra;
create policy "equipo entregas obra" on public.entregas_obra for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

-- ============================================================================
-- Comprobación rápida:
--
--   select column_name from information_schema.columns
--    where table_name = 'puertas' and column_name = 'dintel_mm';
--   select count(*) from public.jornadas;
--   select count(*) from public.entregas_obra;
--   select column_name from information_schema.columns
--    where table_name = 'avisos' and column_name = 'obra_larga';
-- ============================================================================
