-- ============================================================================
-- ARIZA SAT · Enviar el parte de la visita al cliente
--
-- Qué añade:
--   1. La columna avisos.parte_enviado_el, para saber cuándo salió el correo.
--   2. La función enviar_parte(aviso), que pide el envío a la función de correo.
--      Solo la pueden ejecutar la oficina y el administrador, igual que
--      enviar_contrato. El técnico no manda correos al cliente por su cuenta.
--
-- Lo que ya había y NO se toca:
--   · El disparador avisos_notificar (fase 2) llama a la función de correo con
--     tipo 'cerrado' cuando se cierra una visita. Esa llamada manda el parte a
--     la oficina y, si el técnico marcó la casilla, copia al cliente.
--   · enviar_parte es para mandarlo DESPUÉS: porque no se marcó la casilla en
--     obra, porque el cliente dice que no le ha llegado, o porque el correo se
--     puso en su ficha más tarde.
--
-- Se puede ejecutar varias veces sin romper nada.
--
-- Después de ejecutar esto hay que subir la versión nueva de la función de
-- correo (avisar.ts): sin ella, enviar_parte pide un envío que la función
-- todavía no sabe atender.
-- ============================================================================

-- ---- 1. Cuándo salió el correo del parte ----
alter table public.avisos
  add column if not exists parte_enviado_el timestamptz;

comment on column public.avisos.parte_enviado_el is
  'Cuándo salió la copia del parte al cliente. Lo escribe la función de correo '
  'cuando el envío se acepta de verdad, no cuando se pide.';

-- ---- 2. Enviar (o reenviar) el parte al cliente ----
-- La aplicación no conoce el secreto de la función de correo: se lo pide a la
-- base de datos, igual que con el contrato.
--
-- Devuelve:
--    true   se ha pedido el envío
--    false  no procede (no es gestión, la visita no está cerrada, o no hay
--           ningún correo al que mandarlo)
create or replace function public.enviar_parte(p_aviso uuid)
returns boolean language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_sec  text;
  v_url  text;
  v_mail text;
begin
  if not public.es_gestion() then return false; end if;

  -- Un parte es de una visita cerrada. De una abierta no hay nada que mandar.
  if not exists (select 1 from public.avisos
                  where id = p_aviso and cerrado is not null) then
    return false;
  end if;

  /* El correo: primero el contacto de esta asistencia y, si no hay, el de la
     ficha del cliente, sea el del aviso o el de la puerta. Es el mismo orden
     que sigue la función de correo y el que ofrece la aplicación. */
  select coalesce(
           nullif(btrim(a.contacto_email), ''),
           nullif(btrim(c1.email), ''),
           nullif(btrim(c2.email), '')
         )
    into v_mail
    from public.avisos a
    left join public.clientes c1 on c1.id = a.cliente_id
    left join public.puertas  pu on pu.id = a.puerta_id
    left join public.clientes c2 on c2.id = pu.cliente_id
   where a.id = p_aviso;

  if v_mail is null then return false; end if;

  select valor into v_url from public.config_interna where clave = 'avisos_url';
  select valor into v_sec from public.config_interna where clave = 'avisos_secreto';
  if v_url is null or v_sec is null then return false; end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-ariza-secreto', v_sec),
    body    := jsonb_build_object('tipo','parte','aviso_id', p_aviso)
  );
  return true;
end $$;

grant execute on function public.enviar_parte(uuid) to authenticated;

-- ---- 3. A qué correo iría el parte de cada visita ----
-- La aplicación la usa para enseñar el correo exacto al que va a salir, en vez
-- de adivinarlo: así lo que dice la pantalla y lo que hace el servidor es lo
-- mismo. Sin esta función la app seguiría funcionando, solo que enseñando su
-- propia suposición.
create or replace function public.correo_del_parte(p_aviso uuid)
returns text language sql stable security definer
set search_path = public as $$
  select coalesce(
           nullif(btrim(a.contacto_email), ''),
           nullif(btrim(c1.email), ''),
           nullif(btrim(c2.email), '')
         )
    from public.avisos a
    left join public.clientes c1 on c1.id = a.cliente_id
    left join public.puertas  pu on pu.id = a.puerta_id
    left join public.clientes c2 on c2.id = pu.cliente_id
   where a.id = p_aviso;
$$;

grant execute on function public.correo_del_parte(uuid) to authenticated;

select 'Listo: avisos.parte_enviado_el, enviar_parte() y correo_del_parte(). '
    || 'Ahora sube la versión nueva de la función de correo (avisar.ts).' as resultado;
