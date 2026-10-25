-- ============================================================================
-- ARIZA SAT · El almacén como catálogo de ventas
--
-- POR QUÉ
-- El almacén sabe lo que hay, lo que cuesta y dónde está. Lo que no sabe es
-- CÓMO SE VENDE. Por eso el presupuesto sale pobre: una línea con cuatro
-- palabras y un precio, cuando lo que convence al cliente es la foto del
-- producto y el párrafo que explica qué lleva dentro y qué norma cumple.
--
-- Eso se escribe una vez, en el artículo, y se repite solo en cada oferta
-- donde aparezca. Escribirlo en cada presupuesto es lo que hace que nadie lo
-- escriba nunca.
--
-- QUÉ TRAE
--
--   1. El artículo gana foto y explicación comercial, y puede llevar su propio
--      precio de venta en vez de salir siempre del coste más el recargo.
--
--   2. Conjuntos: «Seccional 3x3 motorizada» con sus materiales y sus horas
--      dentro. En el presupuesto se elige una vez y entran todas las líneas,
--      agrupadas en su capítulo. Las horas NO guardan precio: lo cogen de la
--      tarifa que le toque al cliente el día que se use, que es lo correcto.
--
--   3. Proveedores con ficha propia. Hasta ahora el proveedor era un texto
--      suelto repetido en cada artículo, así que ni se podía llamar sin
--      buscar el teléfono en otro sitio ni se sabía a quién reclamar.
--      Los nombres que ya estuvieran escritos se convierten en fichas solos.
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. El artículo, con lo que hace falta para venderlo
-- ---------------------------------------------------------------------------
alter table public.articulos add column if not exists detalle       text;
alter table public.articulos add column if not exists foto_ruta     text;
alter table public.articulos add column if not exists precio_venta  numeric;

comment on column public.articulos.detalle is
  'La explicación que lee el cliente en el presupuesto: marca, modelo, '
  'medidas, materiales, qué incluye y qué norma cumple. Se escribe una vez y '
  'se repite sola en cada oferta donde aparezca el artículo.';
comment on column public.articulos.foto_ruta is
  'Foto del producto, en el cubo «ofertas». Va ahí y no en «fotos» porque la '
  've el cliente desde el enlace de su presupuesto, sin haber entrado en la '
  'aplicación.';
comment on column public.articulos.precio_venta is
  'Precio de venta fijo. Si está puesto manda sobre el cálculo de coste más '
  'recargo: hay material que se vende a precio de tarifa del fabricante y no '
  'a lo que a ti te salga.';

-- ---------------------------------------------------------------------------
-- 2. Proveedores
-- ---------------------------------------------------------------------------
create table if not exists public.proveedores (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null default '',
  nif          text,
  contacto     text,
  telefono     text,
  email        text,
  direccion    text,
  web          text,
  -- días que tarda en servir, para saber si llega antes de la fecha prometida
  plazo_dias   integer,
  condiciones  text,
  notas        text,
  activo       boolean not null default true,
  creado       timestamptz not null default now(),
  creado_por   text default ''
);

comment on table public.proveedores is
  'A quién se le compra. Con su teléfono y su plazo: pedir no debería obligar '
  'a buscar el contacto en el correo de hace seis meses.';
comment on column public.proveedores.plazo_dias is
  'Lo que tarda en servir. Sirve para no prometer al cliente una fecha que '
  'depende de un material que todavía no ha salido de su almacén.';

create unique index if not exists proveedores_nombre_idx
  on public.proveedores (lower(btrim(nombre))) where nombre <> '';

alter table public.proveedores enable row level security;
drop policy if exists "equipo proveedores" on public.proveedores;
create policy "equipo proveedores" on public.proveedores for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

alter table public.articulos add column if not exists proveedor_id uuid
  references public.proveedores(id) on delete set null;

comment on column public.articulos.proveedor is
  'El nombre escrito a mano, de antes de que los proveedores tuvieran ficha. '
  'Se conserva para no perder lo tecleado; lo que manda es proveedor_id.';

-- Los nombres que ya estaban escritos pasan a ser fichas, sin duplicados
insert into public.proveedores (nombre, creado_por)
select distinct btrim(a.proveedor), 'migración'
  from public.articulos a
 where btrim(coalesce(a.proveedor, '')) <> ''
   and not exists (
     select 1 from public.proveedores p
      where lower(btrim(p.nombre)) = lower(btrim(a.proveedor)));

-- Y cada artículo queda enganchado a la suya
update public.articulos a
   set proveedor_id = p.id
  from public.proveedores p
 where a.proveedor_id is null
   and btrim(coalesce(a.proveedor, '')) <> ''
   and lower(btrim(p.nombre)) = lower(btrim(a.proveedor));

-- ---------------------------------------------------------------------------
-- 3. Conjuntos
--
-- Un conjunto no es un artículo: no tiene existencias ni se escanea. Es una
-- receta. Lo que el almacén descuenta cuando se instala son sus materiales,
-- uno a uno, no el conjunto.
-- ---------------------------------------------------------------------------
create table if not exists public.conjuntos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null default '',
  -- lo que se le enseña al cliente como encabezado del capítulo
  detalle     text,
  familia     text,
  notas       text,
  activo      boolean not null default true,
  creado      timestamptz not null default now(),
  creado_por  text default ''
);

comment on table public.conjuntos is
  'Recetas de venta: «Seccional 3x3 motorizada» con sus materiales y sus '
  'horas. No tienen existencias ni etiqueta: lo que se descuenta del almacén '
  'son sus materiales, uno a uno.';

create index if not exists conjuntos_idx on public.conjuntos (activo, nombre);

create table if not exists public.conjunto_lineas (
  id           uuid primary key default gen_random_uuid(),
  conjunto_id  uuid not null references public.conjuntos(id) on delete cascade,
  orden        integer not null default 0,
  -- 'material' | 'mano_obra' | 'texto'
  tipo         text not null default 'material',
  articulo_id  uuid references public.articulos(id) on delete set null,
  nombre       text not null default '',
  detalle      text,
  cantidad     numeric not null default 1,
  unidad       text not null default 'ud',
  creado       timestamptz not null default now()
);

comment on table public.conjunto_lineas is
  'Las piezas de la receta. NO guardan precio a propósito: el del material '
  'sale de su ficha el día que se use, y el de la hora de la tarifa que le '
  'toque a ese cliente. Un precio copiado aquí envejecería a escondidas.';

create index if not exists conjunto_lineas_idx
  on public.conjunto_lineas (conjunto_id, orden);

alter table public.conjuntos       enable row level security;
alter table public.conjunto_lineas enable row level security;

drop policy if exists "equipo conjuntos" on public.conjuntos;
create policy "equipo conjuntos" on public.conjuntos for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

drop policy if exists "equipo conjunto lineas" on public.conjunto_lineas;
create policy "equipo conjunto lineas" on public.conjunto_lineas for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

-- ---------------------------------------------------------------------------
-- 4. La línea del presupuesto recuerda su foto
--
-- Se guarda la ruta en la línea, no solo en el artículo: si mañana se cambia
-- la foto del catálogo, el presupuesto que mandaste ayer tiene que seguir
-- enseñando la que enseñaba. Es la misma razón por la que se congela el
-- precio.
-- ---------------------------------------------------------------------------
alter table public.presupuesto_lineas add column if not exists foto_ruta text;

-- ---------------------------------------------------------------------------
-- 5. La vista del catálogo, que es la que ve el técnico
--
-- Se rehace para que traiga la foto y la explicación, pero SIN coste ni
-- recargo: el técnico ve lo que hay y cómo es, no lo que vale.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.views
              where table_schema = 'public' and table_name = 'catalogo') then
    execute 'drop view public.catalogo';
  end if;
exception when others then null;
end $$;

create or replace view public.catalogo as
  select a.id, a.descripcion, a.referencia, a.unidad, a.codigo, a.token,
         a.familia, a.marca, a.proveedor, a.proveedor_id, a.minimo,
         a.ubicacion, a.ean, a.notas, a.activo, a.detalle, a.foto_ruta
    from public.articulos a;

grant select on public.catalogo to authenticated;

-- ============================================================================
-- Comprobación rápida:
--
--   select count(*) from public.proveedores;
--   select count(*) from public.articulos where proveedor_id is not null;
--   select count(*) from public.conjuntos;
--   select column_name from information_schema.columns
--    where table_name = 'articulos'
--      and column_name in ('detalle','foto_ruta','precio_venta','proveedor_id');
-- ============================================================================
