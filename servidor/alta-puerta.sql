-- ============================================================================
-- ARIZA SAT · El alta de la puerta en todas las visitas, y la única salida
--
-- POR QUÉ
-- David, 05-11-2026: el alta de puerta es una de las cosas comunes a todas las
-- asistencias, no solo a las obras.
--
-- Hasta hoy documentar la puerta era obligatorio en cuatro tipos (instalación,
-- puesta en servicio, normativa y preventiva) y voluntario en los demás. Pero la
-- mayoría de las visitas son averías, y es en una avería donde se entra por
-- primera vez en casa de un cliente nuevo. Una puerta que no se da de alta ahí
-- no existe para la empresa: no tiene QR, no entra en ningún contrato de
-- mantenimiento, no se le puede ofrecer una revisión, y la siguiente avería
-- empieza otra vez de cero. El viaje ya estaba pagado y el dato estaba delante.
--
-- Decisión de David, 05-11-2026: en avería, urgencia y garantía se bloquea el
-- cierre igual que en una obra, es decir, hace falta la ficha y al menos una
-- foto. En comercial no se pide (ahí la puerta todavía no existe y tiene su
-- toma de medidas) y en el desplazamiento en falso tampoco (no se ha trabajado).
--
-- QUÉ AÑADE ESTE FICHERO: LA VÁLVULA
-- No todas las averías son de una puerta. Hay avisos de «revisar el cuadro
-- general», barreras que al final no eran del cliente, y visitas en las que el
-- técnico no llega a ver la puerta. Si el bloqueo no tuviera salida, el técnico
-- se quedaría sin poder cerrar un parte legítimo, y un bloqueo que no se puede
-- cumplir se acaba sorteando: es lo que ya pasó cuando bloqueaban los seis
-- puntos del mínimo de obra, y por eso el 01-11-2026 se bajaron a dos.
--
-- La salida tiene nombre y apellidos:
--   avisos.sin_puerta         el técnico dice que no ha trabajado sobre ninguna
--   avisos.sin_puerta_motivo  y por qué, obligatorio en la aplicación
--
-- Y se mira: la vista visitas_sin_puerta deja ver quién la usa y para qué. Una
-- válvula sin contador es un agujero.
--
-- QUÉ NO HACE
--   · No toca ninguna visita cerrada ni ninguna valoración. Esto no cambia un
--     solo importe.
--   · No da de alta ninguna puerta ni marca nada: las dos columnas nacen
--     vacías, y la de la válvula en false.
--   · No obliga a nada en la base de datos. El bloqueo está en la aplicación,
--     donde se puede explicar al técnico qué le falta y llevarlo hasta el campo.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- ============================================================================

-- 1. La válvula
alter table public.avisos add column if not exists sin_puerta boolean not null default false;
alter table public.avisos add column if not exists sin_puerta_motivo text;

comment on column public.avisos.sin_puerta is
  'El técnico declara que en esta visita no ha trabajado sobre ninguna puerta, '
  'así que no hay ficha que dar de alta. Es la única salida al bloqueo del '
  'cierre, y exige motivo en la aplicación.';
comment on column public.avisos.sin_puerta_motivo is
  'Por qué no había puerta sobre la que trabajar. Sin esto, la casilla anterior '
  'sería un botón de saltarse el alta.';

-- 2. Quién usa la válvula, y para qué
-- Una visita marcada «sin puerta» es legítima, pero si se repiten mucho en el
-- mismo técnico o con el mismo motivo copiado, lo que hay no es una excepción:
-- es que el alta de puerta no se está haciendo.
create or replace view public.visitas_sin_puerta as
  select a.id, a.tipo, a.subtipo, a.cliente_id, a.tecnico_id, a.tecnico,
         a.cerrado, a.sin_puerta_motivo, a.descripcion
    from public.avisos a
   where a.sin_puerta is true
     and a.anulada is not true
   order by a.cerrado desc nulls last;

comment on view public.visitas_sin_puerta is
  'Visitas cerradas declarando que no se trabajó sobre ninguna puerta. Es la '
  'salida al alta obligatoria: se mira para que no se convierta en la norma.';

-- 3. Las visitas que se cerraron sobre una puerta sin ficha
-- Las de antes de este cambio, que son las que explican por qué se hizo. No es
-- un reproche a nadie: es la lista de clientes a los que se les ha ido a una
-- puerta que la empresa no tiene documentada, y por tanto a la que no se le
-- puede ofrecer un mantenimiento.
create or replace view public.visitas_sin_ficha_de_puerta as
  select a.id, a.tipo, a.cliente_id, a.tecnico_id, a.cerrado, a.descripcion
    from public.avisos a
   where a.cerrado is not null
     and a.anulada is not true
     and a.sin_puerta is not true
     and a.tipo not in ('comercial','falso')
     and a.puerta_id is null
     and not exists (select 1 from public.aviso_puertas ap where ap.aviso_id = a.id)
   order by a.cerrado desc;

comment on view public.visitas_sin_ficha_de_puerta is
  'Visitas cerradas sin ninguna puerta con ficha y sin declarar que no había '
  'puerta. Casi todas son de antes del 05-11-2026: son las puertas que se '
  'repararon y nunca entraron en la aplicación.';

-- ============================================================================
-- Comprobación rápida:
--
--   select column_name from information_schema.columns
--    where table_name = 'avisos' and column_name in ('sin_puerta','sin_puerta_motivo');
--   select count(*) from public.visitas_sin_puerta;
--   select count(*) from public.visitas_sin_ficha_de_puerta;
-- ============================================================================
