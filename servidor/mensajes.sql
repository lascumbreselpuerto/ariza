-- ============================================================================
-- ARIZA SAT · El hilo de conversación de una asistencia y de una puerta
--
-- POR QUÉ
-- David, 12-11-2026, preguntando si meter un chat dentro de la aplicación:
-- un canal de todo el grupo, otro entre dos usuarios, y uno desde el QR para
-- el cliente.
--
-- Lo que se descartó, y por qué, para que quede escrito:
--   · Canal general y canal privado. Competían con Telegram y con WhatsApp,
--     que ya están en el móvil todo el día y avisan de verdad. La aplicación
--     NO tiene notificaciones push, así que un canal dentro habría sido un
--     buzón que nadie abre. Y lo que se habla en un canal suelto se pierde
--     igual que en un WhatsApp: a los tres meses no lo encuentra nadie.
--   · El chat con el cliente desde el QR. Abre una obligación nueva: si nadie
--     contesta en una hora, el cliente se enfada más que si no existiera. El
--     aviso desde el QR ya existe y resuelve el caso.
--
-- QUÉ SE HACE EN SU LUGAR
-- Conversación ANCLADA al trabajo, no un chat suelto. Un hilo dentro de cada
-- asistencia y otro en la ficha de la puerta que junta los de todas sus
-- asistencias. Así lo que se habla de una puerta queda pegado a esa puerta
-- para siempre, que es lo que hoy se pierde en el grupo de WhatsApp.
--
-- LAS REGLAS, QUE SON LO IMPORTANTE
--   1. No se edita y no se borra. Es un registro, no un chat. Quien se
--      equivoca escribe otro mensaje corrigiendo, igual que en un parte.
--      Aquí eso no es una costumbre: no hay política de borrado ni permiso
--      para cambiar el texto. La base no deja.
--   2. Lo único que se puede cambiar de un mensaje es la chincheta.
--   3. El cliente no lo ve NUNCA. No sale en el parte ni en ningún documento
--      que salga de la empresa. Por eso no hay ninguna función pública que
--      lea esta tabla, al contrario que ficha_publica o aviso_publico.
--
-- CUÁNDO SUENA EL GRUPO DE TELEGRAM
-- El bot escribe en UN grupo, no a personas: no hay chat_id por técnico. Con
-- eso, «que no te llegue eco de lo que acabas de escribir tú» no se puede
-- cumplir al pie de la letra. Lo que sí se puede, y es lo que hace:
--
--   · Alguien escribe en la asistencia de OTRO  → suena el grupo. Es el caso
--     en que se quiere que el otro se entere ya.
--   · El técnico escribe en SU asistencia       → no suena. Es una nota para
--     que quede, y la oficina la ve al abrir la ficha.
--   · El mensaje va fijado con chincheta        → suena siempre, lo escriba
--     quien lo escriba. La chincheta es la forma de decir «esto hay que
--     saberlo ahora».
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La tabla
--
-- Un mensaje cuelga de una asistencia, de una puerta, o de las dos. Cuando se
-- escribe en una asistencia que tiene puerta se rellenan las dos columnas a
-- propósito: así el hilo de la puerta se lee de un tirón, sin recorrer sus
-- asistencias una por una.
--
-- Si se borra la asistencia o la puerta, el mensaje se va con ellas. Es parte
-- de ese trabajo, no un documento que deba sobrevivir por su cuenta.
-- ---------------------------------------------------------------------------
create table if not exists public.mensajes (
  id         uuid primary key default gen_random_uuid(),
  aviso_id   uuid references public.avisos(id)   on delete cascade,
  puerta_id  uuid references public.puertas(id)  on delete cascade,
  texto      text not null,
  foto_ruta  text,
  fijado     boolean not null default false,
  perfil_id  uuid references public.perfiles(id) on delete set null,
  quien      text,
  creado     timestamptz not null default now(),
  -- Un mensaje que no cuelga de nada no se puede leer desde ningún sitio.
  constraint mensajes_de_algo check (aviso_id is not null or puerta_id is not null),
  -- Un mensaje vacío no es un mensaje. El límite de arriba es para que nadie
  -- pegue un documento entero aquí: para eso están los documentos.
  constraint mensajes_texto check (char_length(btrim(texto)) between 1 and 2000)
);

comment on table public.mensajes is
  'Conversación del equipo anclada a una asistencia y a una puerta. No se edita '
  'ni se borra: lo único que cambia es la chincheta. El cliente no la ve nunca.';
comment on column public.mensajes.fijado is
  'Mensaje que hay que saber antes de ir. Sale arriba del hilo, aparece en la '
  'Vida de la puerta y hace sonar el grupo de Telegram.';
comment on column public.mensajes.quien is
  'El nombre escrito tal cual en el momento de enviarlo. Se guarda aparte del '
  'perfil a propósito: si mañana ese técnico se da de baja, el mensaje sigue '
  'diciendo quién lo escribió.';

-- Los dos hilos que se leen de verdad, y los fijados de una puerta.
create index if not exists mensajes_aviso  on public.mensajes(aviso_id, creado);
create index if not exists mensajes_puerta on public.mensajes(puerta_id, creado);
create index if not exists mensajes_fijados on public.mensajes(puerta_id, creado)
  where fijado;

-- ---------------------------------------------------------------------------
-- 2. Quién entra
--
-- El mismo criterio que gobierna el almacén, los avisos y la conformidad: el
-- equipo. No hay reparto fino por técnico porque la conversación de una puerta
-- la tiene que poder leer cualquiera que vaya a ir a esa puerta, y mañana va
-- otro.
-- ---------------------------------------------------------------------------
alter table public.mensajes enable row level security;

drop policy if exists "equipo lee mensajes"     on public.mensajes;
drop policy if exists "equipo escribe mensajes" on public.mensajes;
drop policy if exists "equipo fija mensajes"    on public.mensajes;

create policy "equipo lee mensajes" on public.mensajes
  for select to authenticated using (public.es_equipo());

create policy "equipo escribe mensajes" on public.mensajes
  for insert to authenticated with check (public.es_equipo());

create policy "equipo fija mensajes" on public.mensajes
  for update to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

-- NO hay política de borrado, y es deliberado: nadie borra un mensaje, ni el
-- administrador desde la aplicación. Si algún día hiciera falta quitar uno por
-- una razón seria, se hace desde el panel de Supabase y queda constancia de
-- quién entró.

-- Y del update solo se permite la chincheta. La política de arriba deja pasar
-- la operación; esto decide QUÉ columna se puede tocar. Sin esto, cualquiera
-- podría reescribir el texto de un mensaje de otro y el registro no valdría
-- para nada.
revoke update on public.mensajes from authenticated;
grant  update (fijado) on public.mensajes to authenticated;

-- ---------------------------------------------------------------------------
-- 3. El hilo de una puerta se rellena solo
--
-- Quien escribe en una asistencia no tiene por qué saber de qué puerta es.
-- Esto lo completa al guardar, para que el hilo de la puerta esté siempre
-- entero sin que la aplicación tenga que acordarse.
-- ---------------------------------------------------------------------------
create or replace function public.mensaje_completa_puerta()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.puerta_id is null and new.aviso_id is not null then
    select a.puerta_id into new.puerta_id
      from public.avisos a where a.id = new.aviso_id;
  end if;
  return new;
end $$;

drop trigger if exists mensajes_completa_puerta on public.mensajes;
create trigger mensajes_completa_puerta
  before insert on public.mensajes
  for each row execute function public.mensaje_completa_puerta();

-- ---------------------------------------------------------------------------
-- 4. Cuándo suena el grupo
--
-- La regla está explicada arriba del todo. Aquí solo se aplica.
--
-- Como todos los disparadores de avisos de esta base, este se traga cualquier
-- error: que no suene el grupo es un fastidio; que no se pueda guardar un
-- mensaje porque el grupo no responde es un técnico escribiendo dos veces lo
-- mismo delante de un cliente.
-- ---------------------------------------------------------------------------
create or replace function public.avisar_mensaje()
returns trigger language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_tecnico uuid;
  v_cerrado timestamptz;
begin
  if new.aviso_id is null then return new; end if;

  select a.tecnico_id, a.cerrado into v_tecnico, v_cerrado
    from public.avisos a where a.id = new.aviso_id;

  /* Fijado: suena siempre, lo escriba quien lo escriba. Es la manera de decir
     «esto hay que saberlo ahora».
     Sin fijar: suena solo si quien escribe NO es el técnico que tiene esa
     asistencia. Escribir en la tuya propia es dejar una nota, no llamar a
     nadie. */
  if new.fijado
     or v_tecnico is null
     or new.perfil_id is null
     or new.perfil_id <> v_tecnico then
    perform public.avisar_grupo(jsonb_build_object(
      'tipo',       'mensaje',
      'aviso_id',   new.aviso_id,
      'mensaje_id', new.id));
  end if;
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists mensajes_avisar on public.mensajes;
create trigger mensajes_avisar
  after insert on public.mensajes
  for each row execute function public.avisar_mensaje();

-- ---------------------------------------------------------------------------
-- 5. Comprobación
--
-- Al terminar, esto tiene que devolver una fila con todo en true.
-- ---------------------------------------------------------------------------
select
  (to_regclass('public.mensajes') is not null)                        as tabla,
  (select count(*) = 3 from pg_policies
     where schemaname = 'public' and tablename = 'mensajes')          as politicas,
  (select count(*) = 0 from pg_policies
     where schemaname = 'public' and tablename = 'mensajes'
       and cmd = 'DELETE')                                            as nadie_borra,
  (to_regprocedure('public.avisar_mensaje()') is not null)            as disparador_aviso,
  (to_regprocedure('public.mensaje_completa_puerta()') is not null)   as completa_puerta;
