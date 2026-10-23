-- ============================================================================
-- ARIZA SAT · Presupuestos, segunda vuelta
--
-- POR QUÉ
-- La primera versión juntaba tres cosas que son distintas: terminar el
-- presupuesto, verlo en papel y mandárselo al cliente. Al pulsar «Emitir» se
-- hacían las tres de golpe, así que no había manera de repasar el documento
-- antes de que saliera, ni de imprimirlo sin mandarlo. Eso es exactamente lo
-- que hacía engorroso el trabajo.
--
-- Esta entrega separa los tres momentos y añade lo que faltaba para no tener
-- que reescribir las mismas condiciones en cada oferta.
--
-- QUÉ CAMBIA
--
--   1. Un estado nuevo: 'emitido'. El presupuesto queda cerrado, con su
--      referencia y su enlace, pero todavía en casa. 'enviado' pasa a
--      significar lo que dice: que ya salió. Nada que estuviera en 'enviado'
--      se toca, así que lo de antes sigue siendo verdad.
--
--   2. La firma del cliente. Hasta ahora la aceptación por teléfono era un
--      texto escrito por quien la recogía. Ahora, si el cliente está delante,
--      firma con el dedo y se guarda la firma, su nombre y su NIF, igual que
--      en el parte de una visita.
--
--   3. Anexos: el texto largo que va al final del documento (alcance,
--      exclusiones, garantía, normativa aplicable). Separado de las
--      condiciones, que son las comerciales.
--
--   4. Textos guardados. Las condiciones de pago y los anexos se repiten en
--      casi todas las ofertas. Se escriben una vez, se guardan con un nombre
--      y se meten en el presupuesto con un clic.
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Campos nuevos del presupuesto
-- ---------------------------------------------------------------------------
alter table public.presupuestos add column if not exists anexos       text;
alter table public.presupuestos add column if not exists emitido_el   timestamptz;
alter table public.presupuestos add column if not exists enviado_a    text;
alter table public.presupuestos add column if not exists firma_ruta   text;
alter table public.presupuestos add column if not exists firma_nombre text;
alter table public.presupuestos add column if not exists firma_nif    text;
alter table public.presupuestos add column if not exists firma_el     timestamptz;
alter table public.presupuestos add column if not exists firma_info   text;

comment on column public.presupuestos.estado is
  'borrador: se está montando. emitido: cerrado y con referencia, pero todavía '
  'no ha salido de la casa. enviado: ya se le mandó al cliente, y enviado_a '
  'dice a dónde. Luego aceptado | rechazado, y convertido cuando se abrió el '
  'trabajo. Caducado no se guarda: se mira la fecha.';
comment on column public.presupuestos.anexos is
  'Texto largo al final del documento: alcance, exclusiones, garantía, '
  'normativa. Separado de las condiciones, que son las comerciales.';
comment on column public.presupuestos.firma_ruta is
  'La firma del cliente en el cubo privado «firmas». Vale más que un nombre '
  'tecleado por quien recogió la aceptación, y por eso se guarda aparte.';
comment on column public.presupuestos.enviado_a is
  'A dónde se mandó: el correo, el teléfono o «entregado en mano». Si está '
  'vacío y el estado es enviado, es que se mandó antes de que esto existiera.';

-- Quien ya estaba enviado se queda enviado. Lo que sí se rellena es el momento
-- de emisión de los que lo tienen a la vista, para que la ficha no mienta.
update public.presupuestos
   set emitido_el = coalesce(emitido_el, enviado_el)
 where emitido_el is null and enviado_el is not null;

-- ---------------------------------------------------------------------------
-- 2. Textos guardados
--
-- No son plantillas del documento: son párrafos que se repiten. El documento
-- lo arma la aplicación; esto solo evita volver a teclear «ingreso del 50% al
-- aceptar» en la oferta número cuatrocientos.
-- ---------------------------------------------------------------------------
create table if not exists public.textos_presu (
  id       uuid primary key default gen_random_uuid(),
  -- 'descripcion' | 'condiciones' | 'anexos'
  destino  text not null default 'condiciones',
  titulo   text not null default '',
  cuerpo   text not null default '',
  orden    integer not null default 0,
  activo   boolean not null default true,
  creado   timestamptz not null default now(),
  creado_por text default ''
);

comment on table public.textos_presu is
  'Párrafos reutilizables para los presupuestos. Destino dice en qué campo se '
  'pegan: lo que propone, las condiciones comerciales o los anexos.';

create index if not exists textos_presu_idx
  on public.textos_presu (destino, orden, titulo);

alter table public.textos_presu enable row level security;

drop policy if exists "gestion textos presu" on public.textos_presu;
create policy "gestion textos presu" on public.textos_presu for all to authenticated
  using (public.es_gestion()) with check (public.es_gestion());

-- ---------------------------------------------------------------------------
-- 3. Lo que ve el cliente
--
-- Se rehace para que devuelva también los anexos y para que el enlace funcione
-- en cuanto el presupuesto está emitido. Antes solo quedaba fuera el borrador,
-- así que esto no abre nada que no estuviera abierto: lo deja dicho.
-- ---------------------------------------------------------------------------
create or replace function public.presupuesto_publico(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.presupuestos%rowtype;
  v_lineas jsonb;
  v_cliente text;
  v_puerta  text;
begin
  if p_token is null or length(p_token) < 8 then
    return jsonb_build_object('ok', false, 'motivo', 'sin_token');
  end if;
  select * into p from public.presupuestos where token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if p.estado = 'borrador' then
    return jsonb_build_object('ok', false, 'motivo', 'no_enviado');
  end if;

  select coalesce(nombre, '') into v_cliente from public.clientes where id = p.cliente_id;
  select coalesce(codigo, '') into v_puerta  from public.puertas  where id = p.puerta_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'descripcion', l.descripcion, 'cantidad', l.cantidad,
           'unidad', l.unidad, 'precio', l.precio, 'importe', l.importe,
           'tipo', l.tipo) order by l.orden), '[]'::jsonb)
    into v_lineas
    from public.presupuesto_lineas l
   where l.presupuesto_id = p.id;

  return jsonb_build_object(
    'ok', true,
    'referencia', p.referencia, 'titulo', p.titulo, 'descripcion', p.descripcion,
    'estado', p.estado, 'fecha', p.fecha, 'valido_hasta', p.valido_hasta,
    'caducado', (p.valido_hasta is not null and p.valido_hasta < current_date
                 and p.estado not in ('aceptado','convertido')),
    'cliente', v_cliente, 'puerta', v_puerta,
    'materiales', p.materiales, 'mano_obra', p.mano_obra,
    'desplazamiento', p.desplazamiento, 'descuento', p.descuento,
    'base', p.base, 'tipo_iva', p.tipo_iva, 'iva', p.iva, 'total', p.total,
    'condiciones', p.condiciones, 'anexos', p.anexos,
    'aceptado_el', p.aceptado_el, 'aceptado_por', p.aceptado_por,
    'rechazado_el', p.rechazado_el,
    'lineas', v_lineas);
end;
$$;

grant execute on function public.presupuesto_publico(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. La respuesta del cliente
--
-- Igual que antes, pero aceptando también el presupuesto emitido: si le has
-- pasado el enlace por WhatsApp sin registrar el envío, su «sí» vale lo mismo.
-- ---------------------------------------------------------------------------
create or replace function public.responder_presupuesto(
  p_token text, p_acepta boolean, p_nombre text, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.presupuestos%rowtype;
begin
  if p_token is null or length(p_token) < 8 then
    return jsonb_build_object('ok', false, 'motivo', 'sin_token');
  end if;
  select * into p from public.presupuestos where token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if p.estado not in ('emitido', 'enviado') then
    return jsonb_build_object('ok', false, 'motivo', 'ya_respondido');
  end if;
  if p.valido_hasta is not null and p.valido_hasta < current_date then
    return jsonb_build_object('ok', false, 'motivo', 'caducado');
  end if;
  if p_acepta and coalesce(trim(p_nombre), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sin_nombre');
  end if;

  if p_acepta then
    update public.presupuestos
       set estado = 'aceptado', aceptado_el = now(),
           aceptado_por = trim(p_nombre), actualizado = now()
     where id = p.id;
  else
    update public.presupuestos
       set estado = 'rechazado', rechazado_el = now(),
           rechazado_motivo = nullif(trim(coalesce(p_motivo, '')), ''),
           actualizado = now()
     where id = p.id;
  end if;

  return jsonb_build_object('ok', true, 'estado', case when p_acepta then 'aceptado' else 'rechazado' end);
end;
$$;

grant execute on function public.responder_presupuesto(text, boolean, text, text) to anon, authenticated;

-- ============================================================================
-- Comprobación rápida: debe devolver las ocho columnas nuevas y la tabla.
--
--   select column_name from information_schema.columns
--    where table_name = 'presupuestos'
--      and column_name in ('anexos','emitido_el','enviado_a','firma_ruta',
--                          'firma_nombre','firma_nif','firma_el','firma_info');
--   select count(*) from public.textos_presu;
-- ============================================================================
