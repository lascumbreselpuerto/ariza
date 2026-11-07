-- ============================================================================
-- ARIZA SAT · El recargo lo elige la oficina, al crear la visita
--
-- POR QUÉ
-- David, 07-11-2026, probando las asistencias en campo:
--
--   «El recargo de urgencia debe aparecer en la creación de la asistencia de
--    urgencia, no en el cierre. La oficina elige: primero, fuera de horario;
--    segundo, urgencia; tercero, fuera de horario más urgencia. Siendo un por
--    dos en fuera de horario, un por dos en urgencia y un por tres en fuera de
--    horario más urgencia. Esta info no es relevante para el técnico.»
--
-- Lo que había hasta hoy lo decidía el RELOJ: el factor salía de la hora a la
-- que el técnico sellaba «He llegado». Eso deja fuera la mitad del caso real,
-- porque una visita puede ser urgente sin ser de noche: el comercio que no
-- puede cerrar la persiana a las once de la mañana paga una urgencia, y el
-- reloj decía que era horario laboral.
--
-- Quien sabe lo que se le ha dicho al cliente es quien habla con él. Así que lo
-- elige la oficina al abrir la visita y queda cerrado desde el principio.
--
-- QUÉ AÑADE
--   · avisos.urgencia_modo      fuera | urgente | ambas
--   · tarifas.urgencia_x_uno    multiplicador de una sola cosa (2 por defecto)
--   · tarifas.urgencia_x_dos    multiplicador de las dos a la vez (3)
--
-- QUÉ NO CAMBIA, Y ESTO ES LO IMPORTANTE
-- valorar_aviso NO se toca. Ya multiplica por avisos.urgencia_factor la mano de
-- obra (precio y coste) y el desplazamiento (importe y coste), que es
-- exactamente lo que pide David. Lo único que cambia es QUIÉN escribe ese
-- factor y CUÁNDO: antes lo calculaba la aplicación al cerrar, con la hora de
-- llegada; ahora lo escribe la oficina al crear, con el modo que elige.
--
-- Por eso NINGUNA visita ya cerrada cambia de importe: su urgencia_factor sigue
-- guardado y valorar_aviso sigue leyendo el mismo número. No hace falta corte
-- por fecha, porque el que decide no es una regla nueva: es un dato que ya
-- estaba escrito en cada visita.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- Hace falta urgencia.sql ejecutado antes.
-- ============================================================================

-- 1. Qué eligió la oficina
alter table public.avisos add column if not exists urgencia_modo text;

comment on column public.avisos.urgencia_modo is
  'Qué eligió la oficina al crear una urgencia: fuera (fuera de horario), '
  'urgente (urgencia en horario) o ambas. De aquí sale urgencia_factor, que es '
  'lo que multiplica valorar_aviso. Las urgencias anteriores al 07-11-2026 no '
  'lo tienen: su factor lo había calculado la aplicación con la hora de llegada '
  'y se queda como estaba.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_urgencia_modo_valido') then
    alter table public.avisos
      add constraint avisos_urgencia_modo_valido check (
        urgencia_modo is null or urgencia_modo in ('fuera','urgente','ambas'));
  end if;
  -- Un modo elegido en una visita que no es urgencia no significa nada, y si se
  -- cambiara el tipo después quedaría ahí dentro diciendo algo que no es.
  if not exists (select 1 from pg_constraint where conname = 'avisos_urgencia_modo_solo_urgencia') then
    alter table public.avisos
      add constraint avisos_urgencia_modo_solo_urgencia check (
        urgencia_modo is null or tipo = 'urgencia');
  end if;
end $$;

-- 2. Los dos multiplicadores, para poder cambiarlos sin tocar el programa
alter table public.tarifas add column if not exists urgencia_x_uno numeric;
alter table public.tarifas add column if not exists urgencia_x_dos numeric;

update public.tarifas
   set urgencia_x_uno = coalesce(urgencia_x_uno, 2),
       urgencia_x_dos = coalesce(urgencia_x_dos, 3)
 where urgencia_x_uno is null or urgencia_x_dos is null;

comment on column public.tarifas.urgencia_x_uno is
  'Multiplicador cuando la visita es urgente O fuera de horario, una de las dos '
  'cosas. Por defecto 2.';
comment on column public.tarifas.urgencia_x_dos is
  'Multiplicador cuando es urgente Y fuera de horario a la vez. Por defecto 3.';

-- Que no entre un multiplicador imposible: un 20 donde iba un 2 convierte una
-- visita de 300 € en una de 3.000 y se descubre con la factura puesta.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tarifas_urgencia_x_validos') then
    alter table public.tarifas
      add constraint tarifas_urgencia_x_validos check (
        (urgencia_x_uno is null or (urgencia_x_uno >= 1 and urgencia_x_uno <= 10))
        and (urgencia_x_dos is null or (urgencia_x_dos >= 1 and urgencia_x_dos <= 10)));
  end if;
end $$;

-- 3. Qué se ha cobrado por cada motivo
-- Cuántas urgencias de cada clase se hacen al año y cuánto suman. Es la cuenta
-- que dice si sale a cuenta tener a alguien de guardia.
create or replace view public.urgencias_por_modo as
  select coalesce(a.urgencia_modo, 'sin indicar') as modo,
         count(*) as visitas,
         max(a.urgencia_factor) as factor,
         coalesce(sum(v.imp_total), 0) as facturado,
         coalesce(sum(v.margen), 0) as margen
    from public.avisos a
         left join public.valoraciones v on v.aviso_id = a.id
   where a.tipo = 'urgencia'
     and a.cerrado is not null
     and a.anulada is not true
   group by coalesce(a.urgencia_modo, 'sin indicar')
   order by count(*) desc;

comment on view public.urgencias_por_modo is
  'Las urgencias cerradas, agrupadas por lo que eligió la oficina: cuántas, qué '
  'factor llevaban, cuánto se facturó y qué margen dejaron. Las de antes del '
  '07-11-2026 salen como «sin indicar».';

-- ============================================================================
-- Comprobación rápida:
--
--   select column_name from information_schema.columns
--    where table_name = 'avisos' and column_name = 'urgencia_modo';
--   select urgencia_x_uno, urgencia_x_dos from public.tarifas;
--   select * from public.urgencias_por_modo;
-- ============================================================================
