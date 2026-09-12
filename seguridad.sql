-- ARIZA SAT · segunda vuelta de seguridad
-- Deja el acceso limitado a los técnicos dados de alta y activos.

create or replace function public.es_equipo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles p where p.id = auth.uid() and p.activo);
$$;

-- Cada persona puede crear su propia ficha de técnico la primera vez que entra
drop policy if exists "alta propio perfil" on public.perfiles;
create policy "alta propio perfil" on public.perfiles
  for insert to authenticated with check (id = auth.uid());

-- El rol de administrador queda fijado al correo de David
create or replace function public.rol_guard() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if (select email from auth.users where id = new.id) = 'arizapuertasautomaticas@gmail.com' then
    new.rol := 'admin';
  elsif new.rol = 'admin' then
    new.rol := 'tecnico';
  end if;
  return new;
end $$;
drop trigger if exists perfiles_rol on public.perfiles;
create trigger perfiles_rol before insert or update on public.perfiles
  for each row execute function public.rol_guard();

-- Datos: solo técnicos activos
drop policy if exists "equipo puertas" on public.puertas;
create policy "equipo puertas" on public.puertas for all to authenticated
  using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo avisos" on public.avisos;
create policy "equipo avisos" on public.avisos for all to authenticated
  using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo fotos" on public.fotos;
create policy "equipo fotos" on public.fotos for all to authenticated
  using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo etiquetas" on public.etiquetas;
create policy "equipo etiquetas" on public.etiquetas for all to authenticated
  using (es_equipo()) with check (es_equipo());

drop policy if exists "equipo fotos storage" on storage.objects;
create policy "equipo fotos storage" on storage.objects for all to authenticated
  using (bucket_id = 'fotos' and public.es_equipo())
  with check (bucket_id = 'fotos' and public.es_equipo());
