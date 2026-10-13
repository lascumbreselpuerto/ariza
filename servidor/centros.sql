-- ============================================================================
-- ARIZA SAT · Centros (el sitio donde está la puerta)
--
-- Hasta ahora la cadena era cliente → puerta, con la dirección escrita en cada
-- puerta. Con un cliente de una sola puerta eso funciona. Con una comunidad de
-- tres portales o un cliente con cuatro naves, no: la misma dirección se teclea
-- en cada puerta, cada una la escribe un poco distinta, y lo que el técnico
-- necesita saber antes de ir (por dónde se entra, a qué horas se puede entrar,
-- con quién hay que hablar allí y qué avisos de seguridad tiene el sitio) no
-- está en ningún lado o está repetido tantas veces como puertas haya.
--
-- Un centro es el sitio: un edificio, un portal, una nave, un local. Cuelga del
-- cliente y las puertas cuelgan de él. Los datos del sitio se escriben UNA vez
-- y valen para todas sus puertas.
--
-- El centro es OPCIONAL. Un particular con una puerta de garaje no necesita
-- ninguno, y su puerta sigue funcionando exactamente igual que hoy.
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

create table if not exists public.centros (
  id                 uuid primary key default gen_random_uuid(),
  cliente_id         uuid not null references public.clientes(id) on delete cascade,
  -- cómo lo llama el cliente: «Portal 3», «Nave 7», «Sede central», «Hotel»
  nombre             text not null default '',
  direccion          text,
  poblacion          text,
  cp                 text,
  provincia          text,

  -- ---- Lo que el técnico necesita saber antes de salir ----
  -- Por dónde se entra: la llave, el mando, el código, a quién se le pide,
  -- si hay que dejar el DNI en recepción, dónde se aparca la furgoneta.
  acceso             text,
  -- A qué horas se puede entrar. Una nave que cierra a las 14:00 o una
  -- comunidad que no deja trabajar antes de las 9:00 cambian la planificación.
  horario            text,
  -- Quién atiende allí. No es el cliente que factura: es el conserje, el
  -- encargado del muelle, el jefe de mantenimiento.
  contacto_nombre    text,
  contacto_telefono  text,
  -- Avisos de seguridad DEL SITIO, no de la puerta: carretillas en el pasillo,
  -- cámara frigorífica, trabajo en altura, obra en marcha, perro suelto.
  avisos_seguridad   text,

  notas              text,
  activo             boolean not null default true,
  creado             timestamptz not null default now(),
  creado_por         text default '',
  actualizado        timestamptz not null default now()
);

comment on table public.centros is
  'El sitio donde están las puertas de un cliente: un portal, una nave, un local. '
  'Guarda cómo se entra, el horario de acceso, la persona de contacto en el sitio '
  'y los avisos de seguridad del sitio, una sola vez para todas sus puertas.';

-- Los centros de un cliente es la consulta de todos los días
create index if not exists centros_cliente on public.centros (cliente_id);

-- La puerta apunta a su centro. Es opcional: una puerta sin centro sigue
-- valiendo. Si se borra el centro, la puerta NO se borra: se queda sin centro,
-- con su dirección escrita, igual que antes de existir los centros.
alter table public.puertas add column if not exists centro_id uuid
  references public.centros(id) on delete set null;

create index if not exists puertas_centro on public.puertas (centro_id);

comment on column public.puertas.centro_id is
  'Centro (sitio) donde está la puerta. Opcional: una puerta suelta no lo necesita.';

-- Mismo criterio que el resto de los datos de trabajo: lo ve y lo toca el equipo
alter table public.centros enable row level security;
drop policy if exists "equipo centros" on public.centros;
create policy "equipo centros" on public.centros for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

select 'Centros listos: tabla, columna en puertas, índices y permisos' as resultado;
