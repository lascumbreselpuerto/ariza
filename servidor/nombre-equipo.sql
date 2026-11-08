-- ============================================================================
-- ARIZA SAT · Cambiar el nombre de alguien del equipo desde la aplicación
--
-- POR QUÉ
-- David, 08-11-2026: «dime como miro y cambio el usuario
-- arizapuertasautomaticas». Había que entrar en el editor de tablas de
-- Supabase, porque el nombre se fijaba al dar de alta y la aplicación no tenía
-- dónde tocarlo.
--
-- Y ese nombre no es un detalle de nada: es el que sale en el parte que firma
-- el cliente, en el reparto del calendario y en la columna «Quién» de cada
-- movimiento de almacén y de cada baja de material. Un apellido que falta el
-- día del alta se quedaba para siempre.
--
-- QUÉ HACE ESTE SCRIPT
-- Asegurarse de que quien lleva la gestión puede cambiar ese nombre, y NADA
-- más. No crea columnas ni toca datos.
--
-- CUIDADO CON LO QUE NO HACE
--   · No reescribe el histórico. Los partes y los movimientos de almacén ya
--     guardados siguen con el nombre que tenían el día que se hicieron, porque
--     ahí el nombre se escribió como texto. Eso es correcto: un parte firmado
--     dice lo que decía cuando se firmó.
--   · No renombra la furgoneta de esa persona. Si se llama «Furgoneta de
--     Pepe», se cambia a mano en Almacén.
--
-- Y por esto mismo, desde el 08-11-2026 los movimientos guardan ADEMÁS quién
-- es de verdad (movimientos_material.creado_por_id), que es lo que aguanta
-- aunque el nombre cambie: servidor/almacenes.sql.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Un nombre con cuerpo
--
-- «a» no es un nombre, y vacío tampoco. La aplicación ya lo comprueba, pero la
-- aplicación no es el único camino a la base de datos.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfiles_nombre_con_cuerpo') then
    -- Solo se exige a partir de ahora: si alguna fila vieja tuviera el nombre
    -- vacío, la restricción se añade sin validar lo que ya hay, para no
    -- bloquear el script. Se valida después, y si algo falla se avisa.
    alter table public.perfiles
      add constraint perfiles_nombre_con_cuerpo
      check (nombre is null or length(btrim(nombre)) >= 2) not valid;
    begin
      alter table public.perfiles validate constraint perfiles_nombre_con_cuerpo;
      raise notice 'Regla puesta: un nombre del equipo tiene que tener cuerpo.';
    exception when others then
      raise warning 'Hay perfiles con el nombre vacío o de una letra. La regla queda puesta '
                    'para los cambios nuevos, pero revisa los que ya hay.';
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Que la gestión pueda cambiarlo
--
-- Las políticas de «perfiles» vienen de antes y no están todas en este
-- repositorio, así que aquí no se tira ninguna: se AÑADE una permisiva. En
-- Postgres las políticas permisivas se suman, de modo que esto no quita nada a
-- nadie; solo garantiza que gestión pueda cambiar el nombre aunque la política
-- de antes fuera más estrecha.
-- ---------------------------------------------------------------------------
alter table public.perfiles enable row level security;

drop policy if exists "gestion cambia el nombre del equipo" on public.perfiles;
create policy "gestion cambia el nombre del equipo" on public.perfiles
  for update to authenticated
  using (public.es_gestion()) with check (public.es_gestion());

-- Y el permiso de tabla, que es cosa aparte de las políticas: si en su día se
-- dieron permisos columna a columna, el nombre podría no estar entre ellos.
grant update (nombre) on public.perfiles to authenticated;

comment on column public.perfiles.nombre is
  'Como se llama esta persona. Sale en el parte que firma el cliente, en el '
  'reparto del calendario y en la columna «Quién» de los movimientos de '
  'almacén. Se puede cambiar desde Oficina > Equipo desde el 08-11-2026; lo ya '
  'guardado en partes y movimientos no cambia, porque allí quedó escrito.';

-- ============================================================================
-- Comprobación. Debe devolver la regla y la política.
--
-- select conname from pg_constraint where conname = 'perfiles_nombre_con_cuerpo';
-- select policyname from pg_policies
--  where schemaname='public' and tablename='perfiles'
--    and policyname='gestion cambia el nombre del equipo';
-- ============================================================================
