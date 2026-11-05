-- ============================================================================
-- ARIZA SAT · Avisar al grupo de la oficina cuando pasan cosas en obra
--
-- POR QUÉ
-- David, 03-11-2026: «Cuando se pulsa el botón de He llegado se le podría
-- enviar a la oficina un whatsapp o similar e incluso cuando cierre el parte
-- otro mensaje. De esta manera no tendrían que enviar un whatsapp al llegar y
-- otro al salir al grupo de técnicos, que es lo que deben hacer pero muchas
-- veces se les olvida.»
--
-- El dato ya estaba en la base desde el 03-11-2026: «He llegado» sella
-- avisos.hora_inicio y cerrar el parte sella avisos.cerrado. Lo que faltaba era
-- que saliera de aquí sin que nadie tuviera que mirar una pantalla.
--
-- QUÉ AVISA, Y CUÁNDO
--   1. llegada  → cuando se sella la hora de entrada de una visita abierta.
--   2. cierre   → cuando se cierra el parte, con lo que hay que rematar en
--                 oficina (material sin precio, ruta sin valorar).
--   3. jornada  → cuando se apunta una jornada, que es una obra que se queda
--                 sin terminar, con lo que el técnico deja dicho para el día
--                 siguiente.
--
-- POR DÓNDE SALE
-- Por la misma función de avisos que ya manda los correos (avisar), que es
-- quien tiene el token del bot de Telegram. La aplicación NO lo tiene y no
-- puede tenerlo: el index.html es público y cualquiera podría escribir en el
-- grupo. Aquí solo se pide el envío, igual que con enviar_parte.
--
-- LO QUE NO TOCA
--   · No cambia el disparador de correo que ya existe (avisos_notificar). El
--     aviso del cierre va por su propio disparador a propósito: así uno no se
--     lleva al otro por delante si algún día cambia.
--   · No cambia ninguna tabla de trabajo ni ninguna valoración.
--
-- SI ALGO FALLA, EL TÉCNICO NO SE ENTERA
-- Los tres disparadores se tragan cualquier error. Un aviso al grupo que no
-- sale es un fastidio; un «He llegado» que no se puede guardar porque el aviso
-- al grupo ha fallado es un técnico parado en la puerta de un cliente.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- Hace falta que estén puestas config_interna.avisos_url y avisos_secreto, que
-- ya lo están desde la fase 2, y subir la versión nueva de avisar.ts.
-- ============================================================================

-- ---- 1. Un aviso, una vez ----
-- Un disparador puede llamar más de una vez por el mismo hecho: un update que
-- vuelve a pasar por la misma condición, un reintento de la red. Un correo
-- repetido se perdona; un grupo que suena tres veces por la misma llegada se
-- silencia, y entonces no sirve de nada. Así que cada aviso se apunta aquí y
-- el segundo no sale. La clave la pone la función de avisos: 'llegada:<id>',
-- 'cierre:<id>', 'jornada:<id>'.
create table if not exists public.telegram_enviados (
  clave   text primary key,
  enviado timestamptz not null default now()
);

comment on table public.telegram_enviados is
  'Qué avisos al grupo ya han salido, para no repetirlos. Lo escribe la función '
  'de avisos. Borrar una fila de aquí hace que ese aviso pueda volver a salir.';

alter table public.telegram_enviados enable row level security;
-- Sin políticas a propósito: solo la función de avisos (service role) entra.
-- Nadie tiene por qué leer ni tocar esto desde la aplicación.

-- ---- 2. Pedir el aviso ----
-- Un solo sitio donde se decide cómo se pide, para que los tres disparadores
-- hagan exactamente lo mismo.
create or replace function public.avisar_grupo(p_cuerpo jsonb)
returns void language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_url text;
  v_sec text;
begin
  select valor into v_url from public.config_interna where clave = 'avisos_url';
  select valor into v_sec from public.config_interna where clave = 'avisos_secreto';
  if v_url is null or v_sec is null then return; end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-ariza-secreto', v_sec),
    body    := p_cuerpo
  );
exception when others then
  -- Que el aviso no salga no puede impedir guardar el trabajo. Nunca.
  return;
end $$;

-- ---- 3. Ha llegado ----
create or replace function public.avisar_llegada()
returns trigger language plpgsql security definer
set search_path = public, extensions as $$
begin
  /* Solo en el momento en que se sella la hora, y solo en una visita que está
     abierta: rellenar a mano la hora de una visita ya cerrada o anulada es
     papeleo de oficina, no una llegada que haya que anunciar. */
  if new.hora_inicio is not null
     and old.hora_inicio is null
     and new.cerrado is null
     and not coalesce(new.anulada, false) then
    perform public.avisar_grupo(
      jsonb_build_object('tipo','llegada','aviso_id', new.id));
  end if;
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists avisos_avisar_llegada on public.avisos;
create trigger avisos_avisar_llegada
  after update of hora_inicio on public.avisos
  for each row execute function public.avisar_llegada();

-- ---- 4. Parte cerrado ----
create or replace function public.avisar_cierre()
returns trigger language plpgsql security definer
set search_path = public, extensions as $$
begin
  if new.cerrado is not null
     and old.cerrado is null
     and not coalesce(new.anulada, false) then
    perform public.avisar_grupo(
      jsonb_build_object('tipo','cierre','aviso_id', new.id));
  end if;
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists avisos_avisar_cierre on public.avisos;
create trigger avisos_avisar_cierre
  after update of cerrado on public.avisos
  for each row execute function public.avisar_cierre();

-- ---- 5. Obra que se queda sin terminar ----
-- Una jornada se apunta cuando el técnico acaba el día y la obra sigue abierta.
-- Lo que deja dicho en «proxima» es lo que la oficina necesita para saber qué
-- hay que llevar al día siguiente, y hasta hoy solo lo veía quien abriera la
-- asistencia.
create or replace function public.avisar_jornada()
returns trigger language plpgsql security definer
set search_path = public, extensions as $$
begin
  perform public.avisar_grupo(
    jsonb_build_object('tipo','jornada','aviso_id', new.aviso_id, 'jornada_id', new.id));
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists jornadas_avisar on public.jornadas;
create trigger jornadas_avisar
  after insert on public.jornadas
  for each row execute function public.avisar_jornada();

select 'Listo: telegram_enviados, avisar_grupo() y los tres disparadores '
    || '(llegada, cierre y jornada). Ahora sube la versión nueva de avisar.ts '
    || 'y pon en ella TELEGRAM_TOKEN y TELEGRAM_CHAT.' as resultado;
