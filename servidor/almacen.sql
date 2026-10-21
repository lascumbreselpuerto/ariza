-- ============================================================================
-- ARIZA SAT · Almacén de materiales
--
-- POR QUÉ
-- Hasta ahora el material de una visita se escribía a mano en el parte, con un
-- desplegable de sugerencias sacado de lo que ya se había escrito otras veces.
-- Eso vale para valorar la visita, pero no responde a las preguntas del día a
-- día: ¿queda banda de 2 m?, ¿la llevo yo en la furgoneta o paso por la nave?,
-- ¿qué hay que comprar esta semana?, ¿cuánto material se llevó aquella obra?
--
-- QUÉ AÑADE
--   1. Amplía «articulos», que ya existía, con lo que hace falta para manejarlo
--      como un almacén: código propio, etiqueta QR, familia, marca y mínimo.
--   2. «ubicaciones»: la nave y la furgoneta de cada técnico. Una existencia no
--      es un número suelto: es un número EN un sitio.
--   3. «movimientos_material»: toda entrada, salida o traspaso queda registrada,
--      con quién, cuándo y para qué obra. Las existencias NO se guardan: se
--      calculan sumando movimientos, que es la única forma de que el número y su
--      explicación no se separen nunca.
--   4. «materiales_previstos»: lo que la oficina le dice al técnico que tiene
--      que llevar y montar en una asistencia.
--   5. Enlaza las líneas de material del parte con el artículo del almacén, para
--      que cerrar la visita descuente de verdad.
--
-- LO QUE NO HACE
-- No guarda precios de venta ni presupuestos: eso viene en la siguiente entrega.
-- Los precios de compra siguen donde estaban, en «articulos», y el técnico sigue
-- sin verlos porque los lee por la vista «catalogo».
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. El artículo, ahora con lo que necesita un almacén
-- ---------------------------------------------------------------------------
alter table public.articulos add column if not exists codigo    text;
alter table public.articulos add column if not exists token     text;
alter table public.articulos add column if not exists familia   text;
alter table public.articulos add column if not exists marca     text;
alter table public.articulos add column if not exists minimo    numeric;
alter table public.articulos add column if not exists ubicacion text;
alter table public.articulos add column if not exists ean       text;
alter table public.articulos add column if not exists notas     text;
alter table public.articulos add column if not exists activo    boolean not null default true;

comment on column public.articulos.codigo is
  'Código propio del material, formato MAT-0001. Es el número visible de su '
  'etiqueta QR y lo que se escanea para dar entrada o salida.';
comment on column public.articulos.token is
  'Cuatro caracteres que van dentro del QR y no a la vista, igual que en las '
  'etiquetas de las puertas: sin ellos, cualquiera podría adivinar la URL.';
comment on column public.articulos.minimo is
  'Existencias por debajo de las cuales el almacén avisa de que hay que comprar.';
comment on column public.articulos.ubicacion is
  'Dónde está colocado dentro de la nave: estantería, cajón, estante.';

-- Un código no puede repetirse: es lo que identifica al material al escanear
create unique index if not exists articulos_codigo_idx
  on public.articulos (codigo) where codigo is not null;
create index if not exists articulos_familia_idx on public.articulos (familia);

-- ---------------------------------------------------------------------------
-- 2. Dónde está el material
-- ---------------------------------------------------------------------------
create table if not exists public.ubicaciones (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  -- 'nave' para el almacén, 'furgoneta' para la de cada técnico, 'otro' para
  -- lo que haga falta (un taller, un contenedor de obra)
  tipo        text not null default 'nave',
  -- si es la furgoneta de alguien, de quién
  perfil_id   uuid references public.perfiles(id) on delete set null,
  activo      boolean not null default true,
  creado      timestamptz not null default now()
);
comment on table public.ubicaciones is
  'La nave y las furgonetas. Una existencia es una cantidad EN un sitio.';

create index if not exists ubicaciones_perfil_idx on public.ubicaciones (perfil_id);

-- La nave, que siempre tiene que existir
insert into public.ubicaciones (nombre, tipo)
select 'Nave', 'nave'
where not exists (select 1 from public.ubicaciones where tipo = 'nave');

-- ---------------------------------------------------------------------------
-- 3. Los movimientos
--
-- desde / hasta dicen de dónde sale y a dónde va:
--   entrada de compra      desde NULL      hasta nave
--   traspaso a la furgoneta desde nave     hasta furgoneta
--   consumo en una obra    desde furgoneta hasta NULL
--   devolución a la nave   desde furgoneta hasta nave
--   ajuste de inventario   uno de los dos, según sobre o falte
-- ---------------------------------------------------------------------------
create table if not exists public.movimientos_material (
  id            uuid primary key default gen_random_uuid(),
  articulo_id   uuid not null references public.articulos(id) on delete cascade,
  cantidad      numeric not null check (cantidad > 0),
  desde         uuid references public.ubicaciones(id) on delete set null,
  hasta         uuid references public.ubicaciones(id) on delete set null,
  -- 'compra','obra','averia','traspaso','devolucion','ajuste','baja'
  motivo        text not null default 'ajuste',
  aviso_id      uuid references public.avisos(id) on delete set null,
  puerta_id     uuid references public.puertas(id) on delete set null,
  nota          text,
  creado        timestamptz not null default now(),
  creado_por    text default ''
);
comment on table public.movimientos_material is
  'Toda entrada, salida y traspaso de material. Las existencias se calculan '
  'sumando esta tabla: así el número y su explicación no se separan nunca.';

-- Un movimiento que no mueve nada no es un movimiento
alter table public.movimientos_material drop constraint if exists movimientos_material_mueve;
alter table public.movimientos_material add constraint movimientos_material_mueve
  check (desde is not null or hasta is not null);

create index if not exists movimientos_material_art_idx   on public.movimientos_material (articulo_id, creado desc);
create index if not exists movimientos_material_aviso_idx on public.movimientos_material (aviso_id);
create index if not exists movimientos_material_fecha_idx on public.movimientos_material (creado desc);

-- ---------------------------------------------------------------------------
-- 4. Las existencias, calculadas
-- ---------------------------------------------------------------------------
create or replace view public.existencias_material as
  select articulo_id, ubicacion_id, sum(cant)::numeric as cantidad
    from (
      select articulo_id, hasta as ubicacion_id,  cantidad as cant
        from public.movimientos_material where hasta is not null
      union all
      select articulo_id, desde as ubicacion_id, -cantidad as cant
        from public.movimientos_material where desde is not null
    ) t
   group by articulo_id, ubicacion_id
  having sum(cant) <> 0;

comment on view public.existencias_material is
  'Cuánto hay de cada material en cada sitio. No se guarda: se suma.';

-- ---------------------------------------------------------------------------
-- 5. Lo que la oficina manda llevar a una asistencia
-- ---------------------------------------------------------------------------
create table if not exists public.materiales_previstos (
  id           uuid primary key default gen_random_uuid(),
  aviso_id     uuid not null references public.avisos(id) on delete cascade,
  articulo_id  uuid references public.articulos(id) on delete set null,
  -- si lo previsto no está en el catálogo todavía, al menos su descripción
  descripcion  text not null default '',
  cantidad     numeric not null default 1,
  nota         text,
  creado       timestamptz not null default now(),
  creado_por   text default ''
);
comment on table public.materiales_previstos is
  'Lo que la oficina le dice al técnico que tiene que llevar y montar. El '
  'técnico lo ve en su parte y lo pasa a material usado de un toque.';

create index if not exists materiales_previstos_aviso_idx on public.materiales_previstos (aviso_id);

-- ---------------------------------------------------------------------------
-- 6. Las líneas de material del parte, enlazadas con el almacén
-- ---------------------------------------------------------------------------
alter table public.materiales add column if not exists articulo_id uuid
  references public.articulos(id) on delete set null;
comment on column public.materiales.articulo_id is
  'Si la línea sale del almacén, de qué artículo. Lo que se escribe a mano sigue '
  'valiendo y va sin artículo: no todo lo que se usa está en el catálogo.';

-- ---------------------------------------------------------------------------
-- 7. Permisos
--
-- El equipo entero maneja el almacén: el técnico tiene que poder dar salida a
-- lo que gasta sin llamar a la oficina. Los PRECIOS siguen fuera de su alcance,
-- porque están en «articulos» y el técnico lee por la vista «catalogo».
-- ---------------------------------------------------------------------------
alter table public.ubicaciones          enable row level security;
alter table public.movimientos_material enable row level security;
alter table public.materiales_previstos enable row level security;

drop policy if exists "equipo ubicaciones" on public.ubicaciones;
create policy "equipo ubicaciones" on public.ubicaciones for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

drop policy if exists "equipo movimientos material" on public.movimientos_material;
create policy "equipo movimientos material" on public.movimientos_material for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

drop policy if exists "equipo materiales previstos" on public.materiales_previstos;
create policy "equipo materiales previstos" on public.materiales_previstos for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

grant select on public.existencias_material to authenticated;

-- ---------------------------------------------------------------------------
-- 8. La vista del catálogo, con las columnas nuevas y sin los precios
--
-- OJO: esta es la parte delicada del script. «catalogo» es la vista por la que
-- el técnico lee los materiales sin ver lo que costaron. Al añadir columnas hay
-- que rehacerla, y una vista no se puede ampliar en caliente: hay que tirarla y
-- volver a crearla. Si en tu base «catalogo» no fuese una vista sino otra cosa,
-- este bloque no rompe nada: avisa y sigue.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.views
              where table_schema = 'public' and table_name = 'catalogo') then
    execute 'drop view public.catalogo';
    execute $v$
      create view public.catalogo as
        select id, descripcion, unidad, referencia, codigo, token, familia,
               marca, minimo, ubicacion, ean, notas, activo
          from public.articulos
         where coalesce(activo, true)
    $v$;
    execute 'grant select on public.catalogo to authenticated';
    raise notice 'Vista catalogo rehecha con las columnas del almacén.';
  else
    raise notice 'No hay vista catalogo: revísalo a mano antes de seguir.';
  end if;
end $$;

-- ============================================================================
-- Comprobación. Debe devolver: las columnas nuevas de articulos, las tres
-- tablas nuevas, la vista de existencias y la nave.
--
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='articulos'
--    and column_name in ('codigo','token','familia','marca','minimo','ubicacion');
-- select table_name from information_schema.tables
--  where table_schema='public'
--    and table_name in ('ubicaciones','movimientos_material','materiales_previstos');
-- select * from public.ubicaciones;
-- ============================================================================
