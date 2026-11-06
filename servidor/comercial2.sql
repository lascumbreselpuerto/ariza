-- ============================================================================
-- ARIZA SAT · La comercial: cuántas puertas de cada tipo, y los fijos
--
-- POR QUÉ
-- David, 06-11-2026, tras revisar la creación de asistencias en campo:
--
--   · «Además, el poder elegir más de una unidad por tipo de puerta (aunque en
--     el cierre el técnico-comercial puede ampliar en puertas o huecos a
--     medir).»
--   · «Incluso un punto por si las puertas, sobre todo las peatonales, tienen
--     que llevar fijos, tanto practicables (como si fuera una hoja) o fijos.»
--
-- Hasta hoy, al crear una comercial se marcaban los tipos de puerta sobre los
-- que iba la oferta, pero no cuántas. Una nave con tres seccionales iguales y
-- una peatonal se marcaba «Seccional» y «Peatonal», y el número se perdía: en
-- el parte salía un hueco por tipo y el técnico tenía que añadir los que
-- faltaban a mano. El número lo sabe quien coge el teléfono, no quien va.
--
-- Y los fijos no estaban en ninguna parte. En una peatonal, los fijos laterales
-- o superiores son una parte importante del precio y del montaje, y si no se
-- ofertan se montan igual: los paga la empresa.
--
-- QUÉ AÑADE
--   · avisos.tipos_uds   cuántas puertas de cada tipo, en la oferta
--   · medidas.fijos      qué fijos lleva ese hueco
--   · medidas.fijos_mm   el ancho total de los fijos, para poder ofertarlos
--
-- POR QUÉ tipos_uds es jsonb y no otra columna de texto
-- avisos.tipos_puerta (de subtipo.sql) sigue siendo la lista de tipos y no se
-- toca: la leen el parte, el pintado de los huecos y las pruebas. Las unidades
-- van aparte, como [{"tipo":"Seccional","uds":3}]. Así una asistencia antigua,
-- sin unidades, se sigue leyendo como una de cada tipo, que es exactamente lo
-- que significaba antes. Nada que ya esté guardado cambia de sentido.
--
-- QUÉ NO HACE
--   · No toca valorar_aviso ni ningún importe.
--   · No rellena unidades en las comerciales que ya existen: sin unidades es
--     una de cada tipo, que es lo que querían decir.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- Hace falta medidas.sql ejecutado antes.
-- ============================================================================

-- 1. Cuántas puertas de cada tipo
alter table public.avisos add column if not exists tipos_uds jsonb;

comment on column public.avisos.tipos_uds is
  'En una comercial, cuántas puertas de cada tipo entran en la oferta: '
  '[{"tipo":"Seccional","uds":3}]. Vacío significa una de cada tipo de '
  'avisos.tipos_puerta, que es lo que significaba antes del 06-11-2026. De aquí '
  'salen los huecos que el parte pide medir.';

-- Que no entre una cantidad imposible. Los límites son holgados a propósito:
-- paran el error de dedo (un 30 donde iba un 3), no la nave grande de verdad.
--
-- Va en una función y no escrito dentro del check porque Postgres no admite
-- subconsultas en un check, y para recorrer una lista de jsonb hace falta una.
-- La función es inmutable: mira solo lo que se le pasa, así que vale para un
-- check. Si algún día se borra, hay que quitar el check con ella.
create or replace function public.tipos_uds_valido(j jsonb)
returns boolean
language sql
immutable
as $$
  select j is null or (
    jsonb_typeof(j) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(j) e
       where jsonb_typeof(e) <> 'object'
          or e->>'tipo' is null
          or e->>'tipo' = ''
          or (e->>'uds') is null
          or (e->>'uds') !~ '^[0-9]+$'
          or (e->>'uds')::int < 1
          or (e->>'uds')::int > 50
    )
  );
$$;

comment on function public.tipos_uds_valido(jsonb) is
  'Comprueba la forma de avisos.tipos_uds: una lista de objetos con tipo no '
  'vacío y uds entre 1 y 50. Existe porque un check no puede llevar '
  'subconsultas y recorrer una lista jsonb necesita una.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_tipos_uds_forma') then
    alter table public.avisos
      add constraint avisos_tipos_uds_forma check (public.tipos_uds_valido(tipos_uds));
  end if;
end $$;

-- 2. Los fijos de cada hueco
alter table public.medidas add column if not exists fijos text;
alter table public.medidas add column if not exists fijos_mm numeric;

comment on column public.medidas.fijos is
  'Qué fijos lleva el hueco además de la puerta: ninguno, fijo ciego, fijo '
  'practicable (se abre como una hoja más), fijo superior, o varios. En una '
  'peatonal es parte del precio y del montaje, y es lo que más se olvida '
  'ofertar.';
comment on column public.medidas.fijos_mm is
  'Ancho total de los fijos, en mm. Se oferta aparte de la puerta, así que hace '
  'falta su medida, no solo saber que los lleva.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'medidas_fijos_valido') then
    alter table public.medidas
      add constraint medidas_fijos_valido check (
        (fijos is null or fijos in ('ninguno','ciego','practicable','superior','varios'))
        and (fijos_mm is null or (fijos_mm > 0 and fijos_mm < 30000))
      );
  end if;
end $$;

-- 3. Las ofertas en las que se midió menos de lo que se dijo
-- Si la oficina apuntó tres seccionales y el parte trae un hueco, falta algo:
-- o se midió de menos, o la oferta era otra. Antes esto no se podía ni mirar.
create or replace view public.comerciales_con_huecos_de_menos as
  select a.id, a.cliente_id, a.cerrado, a.tecnico_id,
         coalesce((select sum((e->>'uds')::int)
                     from jsonb_array_elements(a.tipos_uds) e), 0) as puertas_ofertadas,
         (select count(*) from public.medidas m
           where m.aviso_id = a.id and m.sin_medir is not true) as huecos_medidos
    from public.avisos a
   where a.tipo = 'comercial'
     and a.cerrado is not null
     and a.anulada is not true
     and a.tipos_uds is not null
     and coalesce((select sum((e->>'uds')::int)
                     from jsonb_array_elements(a.tipos_uds) e), 0) >
         (select count(*) from public.medidas m
           where m.aviso_id = a.id and m.sin_medir is not true)
   order by a.cerrado desc;

comment on view public.comerciales_con_huecos_de_menos is
  'Comerciales cerradas en las que se midieron menos huecos de los que la '
  'oficina había apuntado. O falta medir, o la oferta no era la que se creía.';

-- ============================================================================
-- Comprobación rápida:
--
--   select column_name from information_schema.columns
--    where table_name = 'avisos' and column_name = 'tipos_uds';
--   select column_name from information_schema.columns
--    where table_name = 'medidas' and column_name in ('fijos','fijos_mm');
--   select * from public.comerciales_con_huecos_de_menos;
-- ============================================================================
