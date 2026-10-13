-- ============================================================================
-- ARIZA SAT · Componentes de la puerta
--
-- Hasta ahora la seguridad instalada de una puerta era una lista de casillas:
-- «Fotocélulas», «Banda de seguridad»... Eso vale para saber si las lleva, pero
-- no para saber CUÁLES lleva. Cuando hay que pedir un repuesto, justificar una
-- sustitución o rellenar el expediente, hace falta la marca, el modelo, el número
-- de serie, cuándo se puso y el papel que lo acompaña.
--
-- Esta tabla es el inventario de lo que hay montado en cada puerta. Cuelga de la
-- PUERTA, no del expediente: cuando se cambia una fotocélula, se cambia aquí y
-- vale para todos los expedientes futuros. Al emitir un expediente se guarda
-- dentro de él una copia de cómo estaban ese día, que es lo que se imprime.
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

create table if not exists public.componentes (
  id                uuid primary key default gen_random_uuid(),
  puerta_id         uuid not null references public.puertas(id) on delete cascade,
  -- clave del catálogo de la aplicación ('fotocelulas', 'banda', 'motor'...).
  -- Si alguien añade un componente que no está en el catálogo, va sin clave y
  -- con el nombre escrito a mano.
  clave             text,
  nombre            text not null default '',
  marca             text,
  modelo            text,
  num_serie         text,
  fecha_instalacion date,
  notas             text,
  -- foto del componente y documento que lo acompaña (declaración, manual, ficha)
  foto_ruta         text,
  doc_ruta          text,
  doc_nombre        text,
  -- un componente retirado no se borra: se marca, para que el historial no mienta
  activo            boolean not null default true,
  retirado_el       date,
  retirado_motivo   text,
  creado            timestamptz not null default now(),
  creado_por        text default '',
  actualizado       timestamptz not null default now()
);

comment on table public.componentes is
  'Lo que hay montado en cada puerta, con su marca, modelo y número de serie. '
  'Cuelga de la puerta; el expediente guarda su propia copia al emitirse.';

-- Buscar los componentes de una puerta es la consulta de todos los días
create index if not exists componentes_puerta on public.componentes (puerta_id);

-- Mismo criterio que fotos y documentos: lo ve y lo toca el equipo
alter table public.componentes enable row level security;
drop policy if exists "equipo componentes" on public.componentes;
create policy "equipo componentes" on public.componentes for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

-- Las fotos de componentes van al almacén de fotos, que ya existe, y los
-- documentos al de documentos. No hace falta almacén nuevo.

select 'Componentes listos: tabla, índice y permisos' as resultado;
