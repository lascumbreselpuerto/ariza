-- ============================================================================
-- ARIZA SAT · El código de barras del fabricante y las peticiones de material
--
-- POR QUÉ
-- David, 08-11-2026, al revisar el lector de códigos:
--
--   «Hemos contemplado la creación de nuevo producto de almacén (desde oficina
--    o calle) a través de la lectura del código del fabricante?»
--
-- No se había contemplado, y hacía falta: el técnico que se encuentra una caja
-- que no está en el catálogo se quedaba igual que antes, escribiendo el
-- material a mano y sin que nadie en la oficina se enterase de que hay un
-- material nuevo circulando.
--
-- DECISIONES DE DAVID, 08-11-2026
--   · El catálogo lo gobierna la OFICINA. El técnico NO crea artículos: avisa.
--   · Lo que manda el técnico lleva tres cosas obligatorias: descripción,
--     unidad y FOTO DE LA CAJA. Sin la foto, la oficina no puede identificar
--     después qué era aquello sin llamarle por teléfono.
--   · El mismo camino sirve leyendo el código de barras o escribiendo el
--     material a mano: son dos puertas al mismo sitio.
--
-- LO QUE YA HABÍA, Y NO SE TOCA
-- La columna «articulos.ean» existe desde el SQL del almacén, y la importación
-- por Excel ya la rellena con el rótulo «Código de barras». Lo que no había era
-- usarla para BUSCAR al leer una caja, ni impedir que dos artículos llevaran el
-- mismo código. Eso es lo que añade este script. No se crea ninguna columna
-- nueva para el código de barras: se usa la que ya está, que es lo correcto.
--
-- EL CERO DE DELANTE
-- Un EAN-13 que empieza por cero y un UPC-A de doce cifras son el MISMO código,
-- y los lectores lo devuelven unas veces con trece cifras y otras con doce. Si
-- no se normaliza, la misma caja leída dos veces puede dar de alta dos
-- artículos. Aquí se normaliza SIEMPRE a trece cifras, y los que ya estuvieran
-- cargados se normalizan también, diciendo cuántos se han tocado.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. El hueco del código de barras, por si la base es anterior al almacén
-- ---------------------------------------------------------------------------
alter table public.articulos add column if not exists ean text;

comment on column public.articulos.ean is
  'Código de barras del fabricante, el de la caja: EAN-13, EAN-8, UPC-A o '
  'Code 128. Se guarda normalizado, sin espacios ni guiones, y los EAN-13 '
  'siempre con sus trece cifras (un UPC-A de doce se rellena con un cero por '
  'delante, porque es el mismo código). Al leer una caja se busca por aquí.';

-- ---------------------------------------------------------------------------
-- 2. Normalizar lo que ya estuviera cargado
--
-- Solo se quitan espacios, guiones y puntos, y se rellena el UPC-A de doce
-- cifras a trece. No se inventa nada: lo que no parezca un código numérico se
-- deja exactamente como está, porque puede ser un Code 128 con letras.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tocados int := 0;
begin
  with limpio as (
    select id,
           ean as antes,
           regexp_replace(coalesce(ean, ''), '[^0-9A-Za-z]', '', 'g') as sin_adornos
      from public.articulos
     where ean is not null and btrim(ean) <> ''
  ), normal as (
    select id, antes,
           case
             when sin_adornos ~ '^[0-9]{12}$' then '0' || sin_adornos
             else sin_adornos
           end as despues
      from limpio
  )
  update public.articulos a
     set ean = n.despues
    from normal n
   where a.id = n.id and n.despues <> n.antes;
  get diagnostics v_tocados = row_count;
  if v_tocados > 0 then
    raise notice 'Códigos de barras normalizados: % artículos.', v_tocados;
  else
    raise notice 'No había códigos de barras que normalizar.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2 bis. Que se normalice SIEMPRE, y no solo al ejecutar este script
--
-- Esto lo encontró la prueba: normalizar una vez no basta. La importación por
-- Excel escribe directamente en «articulos», y mañana alguien pega un código
-- con espacios o un UPC-A de doce cifras. Si eso entra sin normalizar, pasan
-- dos cosas malas: el lector no encuentra la caja, y la regla de «un código,
-- un artículo» se puede saltar metiendo el mismo código con un espacio.
--
-- Así que la normalización va en un disparador, que es el único sitio donde
-- no se puede olvidar.
-- ---------------------------------------------------------------------------
create or replace function public.normaliza_ean() returns trigger
language plpgsql as $$
declare
  v text;
begin
  if new.ean is null or btrim(new.ean) = '' then
    new.ean := null;                       -- vacío es no tener código, no cadena vacía
    return new;
  end if;
  v := regexp_replace(new.ean, '[^0-9A-Za-z]', '', 'g');
  -- Un UPC-A de doce cifras es el mismo código que el EAN-13 que empieza por
  -- cero: se guarda siempre con trece, para que la misma caja no dé dos
  -- artículos.
  if v ~ '^[0-9]{12}$' then
    v := '0' || v;
  end if;
  new.ean := upper(v);
  return new;
end $$;

comment on function public.normaliza_ean() is
  'Deja el código de barras como se guarda: sin espacios ni guiones, en '
  'mayúsculas, y los de doce cifras rellenados a trece. Va en disparador '
  'porque la importación por Excel escribe en la tabla sin pasar por la '
  'aplicación.';

drop trigger if exists articulos_normaliza_ean on public.articulos;
create trigger articulos_normaliza_ean
  before insert or update of ean on public.articulos
  for each row execute function public.normaliza_ean();

-- ---------------------------------------------------------------------------
-- 3. Que dos artículos no lleven el mismo código de barras
--
-- Si ya hubiera duplicados en la base, crear el índice único fallaría y
-- dejaría el script a medias. Así que primero se mira: si hay duplicados, se
-- crea un índice normal (para que la búsqueda sea rápida igual) y se avisa con
-- la lista, para que la oficina los arregle y se vuelva a ejecutar esto.
-- ---------------------------------------------------------------------------
do $$
declare
  v_dup int;
  v_lista text;
begin
  select count(*), string_agg(distinct ean, ', ')
    into v_dup, v_lista
    from (select ean from public.articulos
           where ean is not null and btrim(ean) <> ''
           group by ean having count(*) > 1) d;

  if v_dup > 0 then
    execute 'drop index if exists public.articulos_ean_unico';
    execute 'create index if not exists public.articulos_ean_idx on public.articulos (ean)';
    raise warning 'HAY % código(s) de barras repetido(s) en el catálogo: %', v_dup, v_lista;
    raise warning 'No se ha podido poner la regla de «un código, un artículo». '
                  'Arregla esos artículos en el catálogo y vuelve a ejecutar este script.';
  else
    execute 'drop index if exists public.articulos_ean_idx';
    execute 'create unique index if not exists articulos_ean_unico '
            'on public.articulos (ean) where ean is not null and btrim(ean) <> ''''';
    raise notice 'Regla puesta: un código de barras, un solo artículo.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Las peticiones de material
--
-- Una petición NO es un artículo. Es un aviso del técnico a la oficina: «he
-- gastado esto y no está en el catálogo». La oficina la resuelve de una de dos
-- maneras, y las dos quedan escritas:
--   · creando el artículo nuevo, y entonces el código de barras le queda
--     atado desde el primer día y la próxima caja ya se reconoce sola;
--   · diciendo que eso ya es un artículo que existía, y entonces se apunta
--     cuál era, que es lo que evita los duplicados en el catálogo.
-- ---------------------------------------------------------------------------
create table if not exists public.peticiones_material (
  id            uuid primary key default gen_random_uuid(),
  aviso_id      uuid references public.avisos(id) on delete set null,
  descripcion   text not null,
  unidad        text not null default 'ud',
  cantidad      numeric,
  ean           text,
  foto_ruta     text not null,
  estado        text not null default 'pendiente',
  articulo_id   uuid references public.articulos(id) on delete set null,
  nota          text,
  creado        timestamptz not null default now(),
  creado_por    uuid references auth.users(id) default auth.uid(),
  resuelto      timestamptz,
  resuelto_por  uuid references auth.users(id),
  constraint peticiones_estado_valido
    check (estado in ('pendiente', 'resuelta', 'descartada')),
  constraint peticiones_descripcion_con_cuerpo
    check (length(btrim(descripcion)) >= 3),
  constraint peticiones_con_foto
    check (length(btrim(foto_ruta)) > 0),
  -- una petición resuelta tiene que decir CUÁNDO y, si se resolvió atando o
  -- creando, QUÉ artículo salió de ella
  constraint peticiones_resuelta_con_fecha
    check ((estado = 'pendiente') = (resuelto is null)),
  constraint peticiones_resuelta_con_articulo
    check (estado <> 'resuelta' or articulo_id is not null)
);

comment on table public.peticiones_material is
  'Material que el técnico se ha encontrado y no está en el catálogo. El '
  'técnico no crea artículos: manda esto, con descripción, unidad y foto de la '
  'caja, y la oficina decide si es un artículo nuevo o uno que ya existía. '
  'Decisión de David, 08-11-2026.';
comment on column public.peticiones_material.foto_ruta is
  'La foto de la caja, en el almacén privado de fotos. Es obligatoria: sin '
  'ella la oficina no puede saber qué era sin llamar al técnico.';
comment on column public.peticiones_material.ean is
  'El código de barras que leyó el técnico, si lo leyó. Cuando la oficina crea '
  'el artículo, este código se le queda atado y la próxima caja igual se '
  'reconoce sola.';
comment on column public.peticiones_material.articulo_id is
  'El artículo que ha salido de la petición: el nuevo que creó la oficina, o '
  'el que ya existía si era lo mismo con otro nombre.';

create index if not exists peticiones_material_pendientes
  on public.peticiones_material (estado, creado desc);
create index if not exists peticiones_material_por_aviso
  on public.peticiones_material (aviso_id);

-- ---------------------------------------------------------------------------
-- 5. Permisos
--
-- Todo el equipo puede CREAR peticiones y verlas: el técnico tiene que poder
-- mandar la suya y comprobar que la mandó. Pero RESOLVERLAS y BORRARLAS es
-- solo de gestión, porque resolver una petición es tocar el catálogo, y el
-- catálogo lo gobierna la oficina. Eso es lo que decidió David.
-- ---------------------------------------------------------------------------
alter table public.peticiones_material enable row level security;

drop policy if exists "equipo ve peticiones material" on public.peticiones_material;
create policy "equipo ve peticiones material" on public.peticiones_material
  for select to authenticated using (public.es_equipo());

drop policy if exists "equipo crea peticiones material" on public.peticiones_material;
create policy "equipo crea peticiones material" on public.peticiones_material
  for insert to authenticated with check (public.es_equipo() and estado = 'pendiente');

drop policy if exists "gestion resuelve peticiones material" on public.peticiones_material;
create policy "gestion resuelve peticiones material" on public.peticiones_material
  for update to authenticated using (public.es_gestion()) with check (public.es_gestion());

drop policy if exists "gestion borra peticiones material" on public.peticiones_material;
create policy "gestion borra peticiones material" on public.peticiones_material
  for delete to authenticated using (public.es_gestion());

-- ---------------------------------------------------------------------------
-- 6. Buscar un artículo por el código de barras de su caja
--
-- Se hace con una función y no leyendo la tabla desde la aplicación porque el
-- técnico NO puede leer «articulos» (ahí están los precios): lee por la vista
-- «catalogo». La función devuelve solo lo que el técnico necesita saber.
-- ---------------------------------------------------------------------------
create or replace function public.articulo_por_barras(p_codigo text)
returns table (id uuid, descripcion text, unidad text, codigo text, token text)
language sql stable security definer set search_path = public as $$
  with limpio as (
    select regexp_replace(coalesce(p_codigo, ''), '[^0-9A-Za-z]', '', 'g') as c
  ), formas as (
    -- se busca por el código tal cual y por su forma de trece cifras, para que
    -- dé igual que el lector haya devuelto doce o trece
    select c as forma from limpio
    union
    select '0' || c from limpio where c ~ '^[0-9]{12}$'
    union
    select substring(c from 2) from limpio where c ~ '^0[0-9]{12}$'
  )
  select a.id, a.descripcion, a.unidad, a.codigo, a.token
    from public.articulos a
   where coalesce(a.activo, true)
     and a.ean is not null
     and regexp_replace(a.ean, '[^0-9A-Za-z]', '', 'g') in (select forma from formas)
   limit 1
$$;

revoke all on function public.articulo_por_barras(text) from public;
grant execute on function public.articulo_por_barras(text) to authenticated;

comment on function public.articulo_por_barras(text) is
  'Del código de barras de una caja al artículo del catálogo, sin enseñar los '
  'precios. Busca lo mismo si el lector devolvió doce cifras o trece.';

-- ---------------------------------------------------------------------------
-- 7. La vista del catálogo, con el código de barras
--
-- El técnico lee los materiales por esta vista, sin precios. Hay que rehacerla
-- para que traiga «ean», porque si no la aplicación no puede reconocer una caja
-- estando sin cobertura, con el catálogo ya descargado.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.views
              where table_schema = 'public' and table_name = 'catalogo') then
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'catalogo'
                  and column_name = 'ean') then
      raise notice 'La vista catalogo ya trae el código de barras.';
    else
      raise notice 'La vista catalogo no trae el código de barras: revísala.';
    end if;
  else
    raise notice 'No hay vista catalogo: revísalo a mano antes de seguir.';
  end if;
end $$;

-- ============================================================================
-- Comprobación. Debe devolver la columna, el índice, la tabla y la función.
--
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='articulos' and column_name='ean';
-- select indexname from pg_indexes
--  where schemaname='public' and indexname in ('articulos_ean_unico','articulos_ean_idx');
-- select table_name from information_schema.tables
--  where table_schema='public' and table_name='peticiones_material';
-- select proname from pg_proc where proname='articulo_por_barras';
-- ============================================================================
