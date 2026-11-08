-- ============================================================================
-- ARIZA SAT · Los almacenes los crea la oficina, y la baja de material deja
--             rastro completo
--
-- POR QUÉ
-- David, 08-11-2026:
--
--   «YA tenemos el como dar de alta al material, pero como lo damos de baja. Lo
--    debe de poder dar tanto ofi como los tecnicos. Siempre debe de quedar
--    marcado quien da de baja el material y de que almacen. General, furgo 1 y
--    furgo 2. Aunque se debe de crear almacen desde la ofi.»
--
-- Y al elegir que el técnico pueda sacar de cualquier almacén:
--
--   «pero que siempre se sepa quien dio de baja un material, de que almacen la
--    dio de baja, si se a perdido, roto o de que asistencia biene de baja, y lo
--    que valores basico para hacer el seguimiento del producto.»
--
-- LO QUE YA HABÍA, Y NO SE TOCA
--   · «ubicaciones» con la nave y una furgoneta por técnico;
--   · «movimientos_material» con desde, hasta, motivo, aviso_id, nota y
--     creado_por;
--   · la salida de material con motivo, de la que ya salía la baja.
-- Eso funciona y se queda.
--
-- QUÉ CAMBIA
--   1. Los almacenes los crea, nombra y retira la OFICINA. Hasta hoy la
--      furgoneta de un técnico nacía sola la primera vez que movía material,
--      con el nombre «Furgoneta de Juan». Eso se acaba: David quiere poder
--      llamarlas «Furgo 1» y «Furgo 2», y decidir él qué almacenes hay.
--   2. Se pueden crear almacenes que no son de nadie: un taller, un trastero,
--      un contenedor en una obra larga. Hasta hoy, o estaba en la nave o estaba
--      en una furgoneta, y el material de una obra de tres semanas no estaba en
--      ninguno de los dos.
--   3. La baja distingue ROTO de PERDIDO. Eran un solo motivo, y son dos cosas
--      distintas: una dice que el material no aguanta y la otra que se está
--      quedando por el camino.
--   4. La baja exige MOTIVO ESCRITO. Decisión de David.
--   5. Cada movimiento guarda ADEMÁS quién lo hizo de verdad, no solo cómo se
--      llama. Si un día hay dos Juan o alguien cambia de nombre, la traza no se
--      vuelve discutible.
--   6. Una baja NO SE PUEDE BORRAR. Si hay que corregirla, se mete una entrada
--      que la deshace, con su motivo. Un almacén donde las bajas se borran no
--      se puede auditar.
--   7. Y una vista de bajas CON SU COSTE, solo para gestión.
--
-- EL DINERO DE LAS ROTURAS, QUE HOY NO SE VE
-- Comprobado antes de escribir esto: la valoración de una asistencia lee las
-- líneas del parte («materiales»), no los movimientos de almacén. O sea que una
-- baja por rotura NO se factura al cliente, que es correcto, pero TAMPOCO entra
-- en el coste de ninguna visita ni del mes. El dinero que se rompe o se pierde
-- no aparece hoy en ninguna cuenta. Este script NO cambia eso: no se mueven
-- márgenes sin que David lo decida. Lo que hace es ponerle cifra, con la vista
-- «bajas_material», para que esa decisión se tome con el número delante.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Los almacenes: lo que le faltaba a la tabla para poder gobernarlos
-- ---------------------------------------------------------------------------
alter table public.ubicaciones add column if not exists nota text;
alter table public.ubicaciones add column if not exists orden int;
alter table public.ubicaciones add column if not exists creado_por text default '';

comment on column public.ubicaciones.nota is
  'Para qué es este almacén, escrito por la oficina. Ej.: «contenedor de la '
  'obra de Jerez, hasta marzo».';
comment on column public.ubicaciones.orden is
  'En qué orden se enseñan. La nave primero, las furgonetas después.';

-- Un almacén tiene que tener nombre con cuerpo: «a» no es un nombre.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ubicaciones_nombre_con_cuerpo') then
    alter table public.ubicaciones
      add constraint ubicaciones_nombre_con_cuerpo check (length(btrim(nombre)) >= 2);
  end if;
end $$;

-- Y los tipos son los tres que hay, no cualquier palabra. «otro» es el taller,
-- el trastero o el contenedor de obra que pidió David.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ubicaciones_tipo_valido') then
    alter table public.ubicaciones
      add constraint ubicaciones_tipo_valido check (tipo in ('nave', 'furgoneta', 'otro'));
  end if;
end $$;

-- Dos almacenes activos con el mismo nombre son una trampa: nadie sabe en cuál
-- está el material. Se compara sin distinguir mayúsculas ni espacios de sobra.
create unique index if not exists ubicaciones_nombre_unico
  on public.ubicaciones (lower(btrim(nombre))) where activo;

-- ---------------------------------------------------------------------------
-- 2. Quién gobierna los almacenes: la oficina
--
-- Hasta hoy la política era una sola, «for all», y por eso un técnico podía
-- crear ubicaciones: de ahí que su furgoneta naciera sola. Ahora el técnico
-- LEE (las necesita para elegir de dónde saca el material) y la oficina es la
-- única que crea, renombra y retira. Decisión de David.
-- ---------------------------------------------------------------------------
drop policy if exists "equipo ubicaciones" on public.ubicaciones;

drop policy if exists "equipo ve ubicaciones" on public.ubicaciones;
create policy "equipo ve ubicaciones" on public.ubicaciones
  for select to authenticated using (public.es_equipo());

drop policy if exists "gestion crea ubicaciones" on public.ubicaciones;
create policy "gestion crea ubicaciones" on public.ubicaciones
  for insert to authenticated with check (public.es_gestion());

drop policy if exists "gestion cambia ubicaciones" on public.ubicaciones;
create policy "gestion cambia ubicaciones" on public.ubicaciones
  for update to authenticated using (public.es_gestion()) with check (public.es_gestion());

drop policy if exists "gestion borra ubicaciones" on public.ubicaciones;
create policy "gestion borra ubicaciones" on public.ubicaciones
  for delete to authenticated using (public.es_gestion());

-- ---------------------------------------------------------------------------
-- 3. Quién movió el material, sin lugar a dudas
--
-- «creado_por» guarda el nombre, y un nombre no identifica a nadie: puede
-- haber dos Juan, o alguien puede cambiárselo. Se guarda ADEMÁS quién es.
-- El nombre se queda, porque es lo que se lee de un vistazo en el historial.
-- ---------------------------------------------------------------------------
alter table public.movimientos_material
  add column if not exists creado_por_id uuid references public.perfiles(id) on delete set null;

comment on column public.movimientos_material.creado_por_id is
  'Quién hizo el movimiento, de verdad. «creado_por» guarda su nombre para '
  'leerlo de un vistazo; esta columna es la que aguanta si hay dos personas '
  'con el mismo nombre o alguien se lo cambia.';

create index if not exists movimientos_material_por_quien
  on public.movimientos_material (creado_por_id, creado desc);

-- ---------------------------------------------------------------------------
-- 4. Roto y perdido son dos cosas distintas
--
-- Los motivos que valen, con los viejos admitidos para no romper el histórico:
--   compra · obra · averia · traspaso · devolucion · ajuste   (como estaban)
--   baja_roto · baja_perdido · baja_otro                      (nuevos)
--   baja                                                      (el viejo, solo
--                                                              para lo ya hecho)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_motivo_valido') then
    alter table public.movimientos_material
      add constraint movimientos_motivo_valido check (motivo in (
        'compra', 'obra', 'averia', 'traspaso', 'devolucion', 'ajuste',
        'baja_roto', 'baja_perdido', 'baja_otro',
        'baja'));
  end if;
end $$;

comment on column public.movimientos_material.motivo is
  'Qué movimiento es. Las bajas van separadas a propósito: baja_roto dice que '
  'el material no aguantó, baja_perdido que se quedó por el camino, y son dos '
  'problemas distintos que se arreglan de maneras distintas. «baja», sin más, '
  'es el motivo viejo de antes del 08-11-2026 y solo existe en el histórico.';

-- ---------------------------------------------------------------------------
-- 5. Una baja sin explicar no entra
--
-- Decisión de David: motivo escrito obligatorio siempre. Una baja es material
-- que se ha pagado y que desaparece; sin motivo escrito, dentro de tres meses
-- nadie sabe si se rompió, se perdió o se quedó en una obra.
--
-- Solo se exige a las bajas NUEVAS: a las de antes no se les puede pedir lo
-- que no se pidió cuando se hicieron, y el histórico no se reescribe.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_baja_con_motivo') then
    alter table public.movimientos_material
      add constraint movimientos_baja_con_motivo check (
        motivo not in ('baja_roto', 'baja_perdido', 'baja_otro')
        or length(btrim(coalesce(nota, ''))) >= 3
      );
  end if;
end $$;

-- Y una baja sale de algún sitio: no se puede dar de baja material «de la nada»,
-- porque entonces no se sabe qué almacén queda descuadrado.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_baja_con_almacen') then
    alter table public.movimientos_material
      add constraint movimientos_baja_con_almacen check (
        motivo not in ('baja_roto', 'baja_perdido', 'baja_otro') or desde is not null
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Una baja no se borra
--
-- El cierre de una visita rehace sus propios movimientos de material, así que
-- el equipo tiene que poder borrar los de 'obra' y 'averia' de su visita: eso
-- es lo que evita que reabrir y volver a cerrar duplique el descuento.
-- Pero una BAJA no se borra nunca, ni la oficina. Si hay que corregirla, se
-- mete una entrada que la deshace, y las dos quedan a la vista.
-- ---------------------------------------------------------------------------
drop policy if exists "equipo movimientos material" on public.movimientos_material;

drop policy if exists "equipo ve movimientos" on public.movimientos_material;
create policy "equipo ve movimientos" on public.movimientos_material
  for select to authenticated using (public.es_equipo());

drop policy if exists "equipo crea movimientos" on public.movimientos_material;
create policy "equipo crea movimientos" on public.movimientos_material
  for insert to authenticated with check (public.es_equipo());

-- Cambiar un movimiento ya hecho tampoco: se corrige con otro movimiento.
drop policy if exists "nadie cambia movimientos" on public.movimientos_material;
create policy "nadie cambia movimientos" on public.movimientos_material
  for update to authenticated using (false) with check (false);

drop policy if exists "equipo borra lo del parte" on public.movimientos_material;
create policy "equipo borra lo del parte" on public.movimientos_material
  for delete to authenticated
  using (public.es_equipo() and motivo in ('obra', 'averia'));

-- ---------------------------------------------------------------------------
-- 7. Las bajas, con su coste, para la oficina
--
-- Esta es la vista que pone cifra a lo que hoy no se ve en ninguna cuenta.
-- Lleva el coste porque el coste es lo que convierte «se rompen bandas» en
-- «se han roto 340 euros de bandas este mes», que es con lo que se decide.
--
-- Va con seguridad de invocador y filtrando por gestión dentro: el técnico no
-- ve precios, y esta vista los lleva.
-- ---------------------------------------------------------------------------
create or replace view public.bajas_material as
  select m.id,
         m.creado,
         m.motivo,
         case m.motivo
           when 'baja_roto'     then 'Roto'
           when 'baja_perdido'  then 'Perdido'
           when 'baja_otro'     then 'Otro'
           else 'Baja (antes del 08-11-2026)'
         end                                   as motivo_nombre,
         m.cantidad,
         m.nota,
         m.articulo_id,
         a.descripcion                         as articulo,
         a.codigo                              as articulo_codigo,
         a.unidad,
         a.familia,
         a.coste                               as coste_unidad,
         round(coalesce(a.coste, 0) * m.cantidad, 2) as coste_total,
         m.desde                               as ubicacion_id,
         u.nombre                              as almacen,
         u.tipo                                as almacen_tipo,
         m.creado_por,
         m.creado_por_id,
         p.nombre                              as quien,
         m.aviso_id,
         m.puerta_id
    from public.movimientos_material m
    join public.articulos a on a.id = m.articulo_id
    left join public.ubicaciones u on u.id = m.desde
    left join public.perfiles p on p.id = m.creado_por_id
   where m.motivo in ('baja_roto', 'baja_perdido', 'baja_otro', 'baja')
     and public.es_gestion();

comment on view public.bajas_material is
  'Las bajas de material con su coste, para la oficina. Lleva precios, así que '
  'solo devuelve filas a gestión: el técnico la ve vacía.';

grant select on public.bajas_material to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Lo que se ha roto y perdido cada mes, en euros
--
-- El resumen que hace falta para decidir: por mes, por almacén y por motivo.
-- ---------------------------------------------------------------------------
create or replace function public.resumen_bajas(p_desde date default null,
                                                p_hasta date default null)
returns table (
  mes            text,
  almacen        text,
  motivo_nombre  text,
  cuantas        bigint,
  coste_total    numeric
)
language sql stable security invoker set search_path = public as $$
  select to_char(date_trunc('month', b.creado), 'YYYY-MM') as mes,
         coalesce(b.almacen, 'Sin almacén')                as almacen,
         b.motivo_nombre,
         count(*)                                          as cuantas,
         round(sum(b.coste_total), 2)                      as coste_total
    from public.bajas_material b
   where (p_desde is null or b.creado >= p_desde)
     and (p_hasta is null or b.creado < (p_hasta + 1))
   group by 1, 2, 3
   order by 1 desc, 5 desc nulls last
$$;

comment on function public.resumen_bajas(date, date) is
  'Lo que se ha dado de baja por mes, almacén y motivo, con el coste. Al leer '
  'por la vista bajas_material, un técnico lo recibe vacío.';

revoke all on function public.resumen_bajas(date, date) from public;
grant execute on function public.resumen_bajas(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Ordenar los almacenes que ya existen
--
-- La nave primero, luego las furgonetas, luego los demás. Solo a los que no
-- tengan orden puesto: lo que la oficina haya ordenado a mano no se toca.
-- ---------------------------------------------------------------------------
update public.ubicaciones
   set orden = case tipo when 'nave' then 10 when 'furgoneta' then 20 else 30 end
 where orden is null;

-- ============================================================================
-- Comprobación. Debe devolver las columnas nuevas, las restricciones, la vista
-- y la función.
--
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='ubicaciones'
--    and column_name in ('nota','orden','creado_por');
-- select conname from pg_constraint
--  where conname in ('movimientos_motivo_valido','movimientos_baja_con_motivo',
--                    'movimientos_baja_con_almacen','ubicaciones_tipo_valido');
-- select table_name from information_schema.views
--  where table_schema='public' and table_name='bajas_material';
-- select proname from pg_proc where proname='resumen_bajas';
-- ============================================================================
