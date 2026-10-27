-- ============================================================================
-- Andamio para probar los SQL fuera de Supabase
--
-- POR QUÉ
-- Los ficheros de servidor/ dan por hechas cosas que pone Supabase: los roles
-- anon y authenticated, el esquema auth con auth.uid(), el de storage con sus
-- buckets, y las tablas base de la aplicación, que se crearon hace tiempo.
--
-- Esto monta lo mínimo para que esos ficheros se puedan ejecutar contra un
-- Postgres vacío. NO pretende ser una copia de la base de producción: solo lo
-- justo para que un SQL roto se note aquí y no en la base de David.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---- Roles que Supabase trae de serie ----
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- ---- Esquema auth ----
create schema if not exists auth;
create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text
  language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;

-- ---- Esquema storage ----
create schema if not exists storage;
create table if not exists storage.buckets (
  id         text primary key,
  name       text not null,
  public     boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text,
  owner      uuid,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;

-- ---- Tablas base de la aplicación ----
-- Solo con lo que los ficheros de servidor/ necesitan ver.
create table if not exists public.perfiles (
  id      uuid primary key default gen_random_uuid(),
  nombre  text,
  rol     text not null default 'tecnico',
  activo  boolean not null default true
);

create table if not exists public.clientes (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null default '',
  nif       text,
  email     text,
  telefono  text,
  direccion text,
  poblacion text,
  tipo      text,
  notas     text,
  contrato  boolean not null default false,
  archivado boolean not null default false,
  creado    timestamptz not null default now(),
  creado_por text default ''
);

create table if not exists public.puertas (
  id         uuid primary key default gen_random_uuid(),
  codigo     text,
  token      text,
  cliente_id uuid references public.clientes(id) on delete set null,
  tipo       text,
  uso        text,
  marca      text,
  modelo     text,
  ancho_mm   numeric,
  alto_mm    numeric,
  peso_kg    numeric,
  direccion  text,
  ubicacion  text,
  seguridad  text[],
  creado     timestamptz not null default now(),
  creado_por text default ''
);

create table if not exists public.avisos (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null default 'averia',
  estado       text not null default 'recibido',
  prioridad    text not null default 'normal',
  origen       text,
  cliente_id   uuid references public.clientes(id) on delete set null,
  puerta_id    uuid references public.puertas(id) on delete set null,
  tecnico_id   uuid,
  descripcion  text,
  notas_oficina text,
  diagnostico  text,
  trabajo      text,
  hora_inicio  timestamptz,
  hora_fin     timestamptz,
  horas        numeric,
  num_tecnicos integer not null default 1,
  desplazamiento numeric,
  estado_final text,
  pendiente    boolean not null default false,
  pendiente_texto text,
  cerrado      timestamptz,
  anulada      boolean not null default false,
  contacto_nombre   text,
  contacto_telefono text,
  contacto_email    text,
  creado       timestamptz not null default now(),
  creado_por   text default ''
);

create table if not exists public.articulos (
  id          uuid primary key default gen_random_uuid(),
  descripcion text not null default '',
  referencia  text,
  unidad      text not null default 'ud',
  proveedor   text,
  coste       numeric,
  recargo     numeric,
  creado      timestamptz not null default now()
);

create table if not exists public.materiales (
  id          uuid primary key default gen_random_uuid(),
  aviso_id    uuid references public.avisos(id) on delete cascade,
  descripcion text not null default '',
  cantidad    numeric not null default 1,
  unidad      text not null default 'ud',
  creado      timestamptz not null default now()
);

create table if not exists public.componentes (
  id         uuid primary key default gen_random_uuid(),
  puerta_id  uuid references public.puertas(id) on delete cascade,
  clave      text,
  nombre     text,
  marca      text,
  modelo     text,
  num_serie  text,
  activo     boolean not null default true,
  creado     timestamptz not null default now(),
  actualizado timestamptz
);

create table if not exists public.expedientes (
  id         uuid primary key default gen_random_uuid(),
  puerta_id  uuid references public.puertas(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  familia    text,
  datos      jsonb not null default '{}'::jsonb,
  creado     timestamptz not null default now()
);

create table if not exists public.revisiones (
  id         uuid primary key default gen_random_uuid(),
  aviso_id   uuid references public.avisos(id) on delete cascade,
  puerta_id  uuid references public.puertas(id) on delete set null,
  tipo_puerta text,
  fecha      date,
  resultado  text,
  deficiencias text,
  recomendaciones text
);

create table if not exists public.contratos (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  referencia text,
  creado     timestamptz not null default now()
);

create table if not exists public.tarifas (
  id                 integer primary key,
  precio_hora        numeric,
  coste_hora         numeric,
  minimo_horas       numeric,
  recargo_urgencia   numeric,
  desplazamiento_fijo numeric,
  precio_km          numeric,
  coste_km           numeric,
  recargo_material   numeric,
  iva                numeric,
  actualizado        timestamptz,
  actualizado_por    text
);
insert into public.tarifas (id) values (1) on conflict (id) do nothing;

create table if not exists public.ajustes (
  clave text primary key,
  valor jsonb not null default '{}'::jsonb
);

-- ---- Los dos ayudantes de permisos ----
-- En producción miran el perfil de quien ha entrado. Aquí basta con que
-- existan y devuelvan algo: lo que se prueba es que los ficheros se ejecuten,
-- no quién puede ver qué.
create or replace function public.es_equipo() returns boolean
  language sql stable as $$ select true $$;
create or replace function public.es_gestion() returns boolean
  language sql stable as $$ select true $$;
