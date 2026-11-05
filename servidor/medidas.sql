-- ============================================================================
-- ARIZA SAT · La toma de medidas de la visita comercial
--
-- POR QUÉ
-- David: la comercial es la visita de ir a ofertar, y lo que se trae de ella es
-- la toma de medidas y los auxiliares que hacen falta. Hasta hoy el técnico lo
-- escribía todo junto en «Qué has hecho», y en la oficina había que leer un
-- párrafo y adivinar qué medida era el ancho y cuál el alto. Lo que no se
-- apunta en un sitio fijo no se puede pasar a un presupuesto sin volver a
-- llamar al técnico.
--
-- DECISIONES, TOMADAS POR DAVID EL 05-11-2026
--   · Las medidas se guardan en el AVISO, no dando de alta la puerta. Una
--     oferta no vendida no es una puerta: si se diera de alta, el almacén de
--     puertas se llenaría de huecos que nunca se montaron y aparecerían
--     revisiones pendientes de puertas que no existen. Si la oferta se vende,
--     estos datos rellenan el alta de la puerta.
--   · Una visita puede llevar VARIOS huecos medidos, igual que una preventiva
--     lleva varias puertas. Una nave con tres portones se oferta en una visita.
--   · Los auxiliares (fotocélulas, mandos, lector, semáforo, banda,
--     electrocerradura...) van en texto libre. No se le monta al técnico una
--     lista que marcar.
--
-- QUÉ NO HACE ESTE FICHERO
--   · No toca valorar_aviso. La comercial se sigue valorando en cero: es una
--     visita de ir a ofertar, y eso no se factura.
--   · No toca ninguna visita cerrada ni ningún presupuesto ya hecho.
--   · No pone ninguna medida a nadie. La tabla nace vacía.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- ============================================================================

-- 1. La tabla
-- Los nombres de los tres campos que también existen en la ficha de la puerta
-- (ancho_mm, alto_mm, dintel_mm) son los MISMOS a propósito: el día que la
-- oferta se vende, el alta de la puerta se rellena copiando, sin traducir
-- nombres de un sitio a otro, que es donde se cuelan los errores.
create table if not exists public.medidas (
  id         uuid primary key default gen_random_uuid(),
  aviso_id   uuid references public.avisos(id) on delete cascade,
  orden      integer not null default 0,
  ubicacion  text,
  tipo_puerta text,
  ancho_mm   numeric,
  alto_mm    numeric,
  dintel_mm  numeric,
  lateral_mm numeric,
  situacion  text,
  electricidad text,
  auxiliares text,
  notas      text,
  sin_medir  boolean not null default false,
  sin_medir_motivo text,
  creado     timestamptz not null default now(),
  creado_por text default ''
);

comment on table public.medidas is
  'Toma de medidas de una visita comercial: un hueco por fila. Vive en el '
  'aviso, no en puertas: una oferta no vendida no es una puerta. Si se vende, '
  'estos datos rellenan el alta de la puerta.';

comment on column public.medidas.ubicacion is
  'Dónde está el hueco, en palabras del técnico. Ej.: «nave trasera, portón '
  'izquierdo». Es lo que distingue un hueco de otro en el presupuesto.';
comment on column public.medidas.tipo_puerta is
  'Tipo de puerta previsto para ese hueco. Sale de los tipos que la oficina '
  'marcó al crear la visita, y el técnico lo puede cambiar delante del hueco.';
comment on column public.medidas.ancho_mm is 'Ancho del HUECO en mm, no de la hoja.';
comment on column public.medidas.alto_mm  is 'Alto del HUECO en mm, no de la hoja.';
comment on column public.medidas.dintel_mm is
  'Espacio libre por encima del hueco, en mm. Es lo que decide si cabe una '
  'seccional y con qué tipo de guía.';
comment on column public.medidas.lateral_mm is
  'Espacio libre a un lado del hueco, en mm. Es lo que decide si cabe una '
  'corredera y hacia dónde abre.';
comment on column public.medidas.situacion is
  'Qué hay hoy en el hueco: hueco vacío, puerta manual que se sustituye, '
  'puerta automática que se sustituye, u otra cosa. Cambia el precio: quitar '
  'lo viejo y llevárselo también se cobra.';
comment on column public.medidas.electricidad is
  'Acometida eléctrica: existe, hay que llevarla, o por comprobar. Una '
  'acometida que hay que llevar y no se ofertó la paga la empresa.';
comment on column public.medidas.auxiliares is
  'Lo que hace falta además de la puerta, en texto libre: fotocélulas, mandos, '
  'lector, semáforo, banda, electrocerradura, pulsador... Pasa al presupuesto '
  'tal y como lo escribe el técnico.';
comment on column public.medidas.sin_medir is
  'El técnico no ha podido medir ese hueco. Con esto marcado se puede cerrar '
  'la visita sin ancho ni alto, pero hay que decir por qué.';

create index if not exists medidas_aviso_idx on public.medidas (aviso_id, orden);

-- 2. Que no se guarden medidas imposibles
-- Un ancho de 40 en vez de 4000 se pasa al presupuesto y nadie lo mira hasta
-- que el proveedor pregunta. Los límites son holgados a propósito: solo paran
-- el error de dedo, no el hueco raro.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'medidas_rango') then
    alter table public.medidas
      add constraint medidas_rango check (
        (ancho_mm  is null or (ancho_mm  > 100 and ancho_mm  < 30000)) and
        (alto_mm   is null or (alto_mm   > 100 and alto_mm   < 30000)) and
        (dintel_mm is null or (dintel_mm >= 0  and dintel_mm < 30000)) and
        (lateral_mm is null or (lateral_mm >= 0 and lateral_mm < 30000))
      );
  end if;
end $$;

-- 3. Quién puede verlas: el equipo, como todo lo demás
alter table public.medidas enable row level security;
drop policy if exists "equipo medidas" on public.medidas;
create policy "equipo medidas" on public.medidas for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

-- 4. Las comerciales cerradas de las que no se trajo ninguna medida
-- Una visita comercial sin medidas es un viaje pagado del que no sale
-- presupuesto. La oficina tiene que poder verlas sin ir una por una.
create or replace view public.comerciales_sin_medidas as
  select a.id, a.cliente_id, a.cerrado, a.tecnico_id, a.descripcion
    from public.avisos a
   where a.tipo = 'comercial'
     and a.cerrado is not null
     and a.anulada is not true
     and not exists (select 1 from public.medidas m where m.aviso_id = a.id)
   order by a.cerrado desc;

comment on view public.comerciales_sin_medidas is
  'Visitas comerciales cerradas sin ninguna medida apuntada: viaje hecho y '
  'presupuesto que nadie puede redactar.';

-- ============================================================================
-- Comprobación rápida:
--
--   select count(*) from public.medidas;
--   select column_name from information_schema.columns
--    where table_name = 'medidas' order by ordinal_position;
--   select * from public.comerciales_sin_medidas;
-- ============================================================================
