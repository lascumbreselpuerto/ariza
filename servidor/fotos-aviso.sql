-- ============================================================================
-- ARIZA SAT · Las fotos de la visita: lo encontrado, lo hecho, lo sustituido
--
-- POR QUÉ
-- David, 07-11-2026, probando las asistencias en campo:
--
--   «En cualquier asistencia, el técnico debe poder, desde la aplicación, hacer
--    fotos de la puerta, de lo encontrado, de lo reparado, de lo sustituido,
--    etc. Es importante como evidencia y referencia pasada para poder enviar al
--    cliente si lo solicita. Deben ser un mínimo de una foto obligatoria y un
--    máximo de 10.»
--
-- Hasta hoy las fotos existían, pero colgaban solo de la PUERTA: servían para
-- la ficha (el conjunto, la placa) y no para contar lo que pasó en una visita.
-- Una avería en la que se cambió un cuadro quemado no dejaba ninguna imagen de
-- cómo estaba antes, que es justo la que hace falta cuando el cliente discute
-- tres meses después lo que había.
--
-- QUÉ AÑADE
--   · fotos.aviso_id   de qué visita es la foto
--   · fotos.etapa      encontrado | hecho | sustituido | otra
--
-- UNA FOTO, DOS SITIOS. Decisión de David el 07-11-2026: la misma foto vale
-- para la visita y para la ficha de la puerta. Se guardan las dos referencias,
-- así que la foto que hace el técnico en el parte aparece también en la ficha,
-- y no hay que hacerla dos veces. Una exigencia, no dos.
--
-- Por eso puerta_id pasa a admitir vacío: hay visitas sin puerta (una comercial
-- de un hueco que todavía no existe) y esas fotos solo cuelgan del aviso.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- ============================================================================

alter table public.fotos add column if not exists aviso_id uuid references public.avisos(id) on delete set null;
alter table public.fotos add column if not exists etapa text;

-- Una foto de una visita sin puerta tiene que poder existir.
alter table public.fotos alter column puerta_id drop not null;

comment on column public.fotos.aviso_id is
  'De qué visita es la foto. La misma foto puede llevar también puerta_id: así '
  'aparece en el parte y en la ficha de la puerta sin hacerla dos veces.';
comment on column public.fotos.etapa is
  'Qué cuenta la foto: lo encontrado al llegar, lo hecho al terminar, la pieza '
  'sustituida, u otra cosa. De aquí sale el orden en que se enseñan.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fotos_etapa_valida') then
    alter table public.fotos
      add constraint fotos_etapa_valida check (
        etapa is null or etapa in ('encontrado','hecho','sustituido','otra'));
  end if;
  -- Una foto que no es de ninguna puerta Y de ninguna visita no es de nadie:
  -- ocuparía sitio en el almacén sin que nada la nombre.
  if not exists (select 1 from pg_constraint where conname = 'fotos_de_alguien') then
    alter table public.fotos
      add constraint fotos_de_alguien check (puerta_id is not null or aviso_id is not null);
  end if;
end $$;

create index if not exists fotos_aviso_idx on public.fotos (aviso_id, creado);

-- Las visitas cerradas sin ninguna foto
-- El mínimo es una, y el viaje en balde no cuenta: ahí no se ha podido ver
-- nada. Esta lista es el contador de la regla: una regla sin contador no se
-- cumple, solo se declara.
create or replace view public.visitas_sin_foto as
  select a.id, a.tipo, a.cliente_id, a.puerta_id, a.tecnico, a.cerrado
    from public.avisos a
   where a.cerrado is not null
     and a.anulada is not true
     and coalesce(a.falso, false) = false
     and a.tipo <> 'falso'
     and a.cerrado >= timestamptz '2026-11-07 00:00:00+01'
     and not exists (select 1 from public.fotos f where f.aviso_id = a.id)
   order by a.cerrado desc;

comment on view public.visitas_sin_foto is
  'Visitas cerradas desde el 07-11-2026 sin ninguna foto de la visita. Los '
  'viajes en balde no cuentan: ahí no se ha podido ver nada. Las anteriores '
  'tampoco, porque entonces no se pedían.';

-- ============================================================================
-- Comprobación rápida:
--
--   select column_name, is_nullable from information_schema.columns
--    where table_name = 'fotos' and column_name in ('aviso_id','etapa','puerta_id');
--   select * from public.visitas_sin_foto;
-- ============================================================================
