-- ================================================================
-- SAFE2DOOR · VARIOS TÉCNICOS EN UNA ASISTENCIA
--
-- QUÉ RESUELVE
-- Hasta hoy una asistencia tenía UN técnico: la columna «tecnico_id».
-- Pero a una instalación van dos, y al segundo no le salía el trabajo en
-- su pantalla. Lo apañaban mirando la lista del equipo, que es como decir
-- que no estaba resuelto.
--
-- CÓMO SE RESUELVE
-- Con una tabla aparte, «aviso_tecnicos», igual que «aviso_puertas» hace
-- con las puertas de una asistencia. Una fila por técnico asignado.
--
-- POR QUÉ NO SE QUITA «tecnico_id»
-- Porque lo leen veinte sitios: la tarjeta de la asistencia, el parte, el
-- aviso al grupo, el calendario, las listas de la oficina. Quitarlo sería
-- tocar todo eso a la vez, y cada sitio que se toca es un sitio donde se
-- puede meter la pata.
--
-- Así que se queda, y pasa a significar EL PRINCIPAL: el primero de los
-- asignados. Todo lo que ya funcionaba sigue funcionando sin enterarse de
-- que ahora puede haber más.
--
-- LO QUE YA ESTÁ CARGADO NO SE TOCA
-- Al final de este fichero hay un volcado: cada asistencia que hoy tiene
-- un técnico asignado entra en la tabla nueva con ese mismo técnico. Las
-- asistencias de mañana siguen asignadas a quien lo estaban. Nadie tiene
-- que volver a asignar nada.
--
-- EL DUEÑO DEL PARTE
-- Dos columnas más en «avisos». No son un cerrojo: son un cartel que dice
-- quién lo lleva ahora mismo. La regla, de David:
--
--   «Si el parte está abierto, lo rellena quien lo abrió. Si no se cierra,
--    el siguiente que abra el parte es el que puede cerrarlo. Siempre que
--    sea uno de los asignados.»
--
-- O sea que abrir el parte es cogerlo. Lo escrito no se pierde: el parte
-- es un solo documento y el segundo sigue donde iba el primero.
--
-- LO QUE ESTE FICHERO NO HACE, Y HAY QUE SABERLO
-- NO cierra la puerta. La política «equipo cambia avisos» sigue dejando
-- que cualquiera del equipo modifique cualquier parte. Apretar eso es la
-- siguiente tanda, y se hace cuando esto haya rodado unos días: una
-- política mal puesta deja a un técnico delante de una puerta sin poder
-- cerrar, y eso es peor que lo que arregla.
--
-- Se puede ejecutar las veces que haga falta.
--
-- 22-11-2026
-- ================================================================

-- ---- 1. La tabla ------------------------------------------------------
create table if not exists public.aviso_tecnicos (
  id uuid not null default gen_random_uuid(),
  aviso_id uuid not null,
  tecnico_id uuid not null,
  creado timestamp with time zone not null default now(),
  creado_por text default ''::text
);

do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'aviso_tecnicos_pkey'
                    and conrelid = 'public.aviso_tecnicos'::regclass) then
    alter table public.aviso_tecnicos add constraint aviso_tecnicos_pkey primary key (id);
  end if;
end $$;

-- El mismo técnico dos veces en la misma asistencia no significa nada, y
-- además haría que saliera repetido en la pantalla.
create unique index if not exists aviso_tecnicos_unico
  on public.aviso_tecnicos (aviso_id, tecnico_id);

create index if not exists aviso_tecnicos_por_tecnico
  on public.aviso_tecnicos (tecnico_id);

do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'aviso_tecnicos_aviso_fk'
                    and conrelid = 'public.aviso_tecnicos'::regclass) then
    alter table public.aviso_tecnicos
      add constraint aviso_tecnicos_aviso_fk foreign key (aviso_id)
      references public.avisos(id) on delete cascade;
  end if;
end $$;

-- Si se le quita el acceso a alguien, su ficha se borra y la asignación
-- se va con ella. Quedaría una fila apuntando a nadie.
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'aviso_tecnicos_perfil_fk'
                    and conrelid = 'public.aviso_tecnicos'::regclass) then
    alter table public.aviso_tecnicos
      add constraint aviso_tecnicos_perfil_fk foreign key (tecnico_id)
      references public.perfiles(id) on delete cascade;
  end if;
end $$;

comment on table public.aviso_tecnicos is
  'Los técnicos asignados a una asistencia. El principal sigue estando en avisos.tecnico_id, y también aparece aquí.';

alter table public.aviso_tecnicos enable row level security;

drop policy if exists "equipo aviso tecnicos" on public.aviso_tecnicos;
create policy "equipo aviso tecnicos" on public.aviso_tecnicos
  as PERMISSIVE for ALL to authenticated
  using (es_equipo()) with check (es_equipo());

grant select, insert, update, delete on public.aviso_tecnicos to authenticated;


-- ---- 2. El dueño del parte -------------------------------------------
alter table public.avisos add column if not exists parte_lo_lleva uuid;
alter table public.avisos add column if not exists parte_lo_lleva_desde timestamp with time zone;

comment on column public.avisos.parte_lo_lleva is
  'Quién abrió el parte el último. No es un cerrojo: el siguiente asignado que lo abre pasa a llevarlo.';
comment on column public.avisos.parte_lo_lleva_desde is
  'Desde cuándo lo lleva. Sirve para decir «lo abrió Dani hace dos horas» en vez de solo «lo lleva Dani».';

do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'avisos_parte_lo_lleva_fk'
                    and conrelid = 'public.avisos'::regclass) then
    alter table public.avisos
      add constraint avisos_parte_lo_lleva_fk foreign key (parte_lo_lleva)
      references public.perfiles(id) on delete set null;
  end if;
end $$;


-- ---- 3. Quién está asignado, en una función --------------------------
-- Para no repetir en veinte sitios la misma consulta, y sobre todo para
-- que el día que cambie la regla cambie en uno.
create or replace function public.tecnicos_de_aviso(p_aviso uuid)
returns setof uuid
language sql stable security definer
set search_path to 'public'
as $$
  select t.tecnico_id from public.aviso_tecnicos t where t.aviso_id = p_aviso
  union
  select a.tecnico_id from public.avisos a
   where a.id = p_aviso and a.tecnico_id is not null;
$$;

comment on function public.tecnicos_de_aviso(uuid) is
  'Los asignados a una asistencia: los de aviso_tecnicos y el principal de avisos.tecnico_id, sin repetir. La union los junta y quita duplicados.';

grant execute on function public.tecnicos_de_aviso(uuid) to authenticated;
grant execute on function public.tecnicos_de_aviso(uuid) to anon;
grant execute on function public.tecnicos_de_aviso(uuid) to service_role;


-- ---- 4. Lo que ya está cargado ---------------------------------------
-- Cada asistencia con técnico entra en la tabla nueva con ese técnico.
-- Va al final y con on conflict, así que relanzar el fichero no duplica
-- nada ni deshace asignaciones hechas a mano después.
insert into public.aviso_tecnicos (aviso_id, tecnico_id, creado_por)
select a.id, a.tecnico_id, 'volcado 22-11-2026'
  from public.avisos a
 where a.tecnico_id is not null
   and exists (select 1 from public.perfiles p where p.id = a.tecnico_id)
on conflict (aviso_id, tecnico_id) do nothing;
