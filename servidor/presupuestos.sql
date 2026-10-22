-- ============================================================================
-- ARIZA SAT · Presupuestos y ofertas
--
-- POR QUÉ
-- Hasta ahora lo que se ofertaba vivía en el correo de cada uno: un PDF hecho a
-- mano, un WhatsApp, una llamada. Y cuando el cliente decía «yo no dije que sí»,
-- o «eso no era lo que me ofreciste», no había nada que enseñar.
--
-- Esta entrega guarda el presupuesto como lo que es: un documento con sus
-- líneas, su validez, su estado y, si el cliente lo acepta, el rastro de quién
-- lo aceptó y cuándo.
--
-- TRES DECISIONES QUE EXPLICAN EL DISEÑO
--
--   1. Los importes se congelan al emitir. Una línea guarda su precio, no una
--      referencia al precio del material. Si mañana sube el coste, el
--      presupuesto que mandaste ayer sigue diciendo lo que decía: es una oferta,
--      y una oferta no puede cambiar sola después de mandarla.
--
--   2. El coste va en la línea, al lado del precio, pero NO sale nunca en el
--      documento del cliente. Está para saber el margen de lo que se oferta
--      antes de mandarlo, que es cuando se puede corregir.
--
--   3. La aceptación del cliente es pública y sin contraseña, como el QR de las
--      puertas: entra por un token que solo está en su enlace. Lo que ve es el
--      presupuesto sin costes; lo que puede hacer es aceptar o rechazar, nada
--      más. Lo hace una función del servidor, no la tabla: así no se abre la
--      tabla entera a quien no ha entrado.
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. El presupuesto
-- ---------------------------------------------------------------------------
create table if not exists public.presupuestos (
  id               uuid primary key default gen_random_uuid(),
  referencia       text,
  cliente_id       uuid references public.clientes(id) on delete set null,
  puerta_id        uuid references public.puertas(id) on delete set null,
  -- si nace de una visita, de cuál: así se sabe qué lo originó
  aviso_id         uuid references public.avisos(id) on delete set null,
  titulo           text not null default '',
  descripcion      text,

  -- borrador → enviado → aceptado | rechazado | caducado; convertido cuando ya
  -- se ha abierto el trabajo que sale de él
  estado           text not null default 'borrador',
  token            text,
  validez_dias     integer not null default 30,
  fecha            date,
  valido_hasta     date,

  -- importes, congelados al emitir
  materiales       numeric not null default 0,
  mano_obra        numeric not null default 0,
  desplazamiento   numeric not null default 0,
  descuento        numeric not null default 0,
  base             numeric not null default 0,
  tipo_iva         numeric not null default 21,
  iva              numeric not null default 0,
  total            numeric not null default 0,
  -- lo que cuesta a la empresa lo que se oferta: para el margen, nunca sale
  coste            numeric not null default 0,

  condiciones      text,
  notas_internas   text,

  enviado_el       timestamptz,
  aceptado_el      timestamptz,
  aceptado_por     text,
  rechazado_el     timestamptz,
  rechazado_motivo text,
  convertido_aviso uuid references public.avisos(id) on delete set null,

  creado           timestamptz not null default now(),
  creado_por       text default '',
  actualizado      timestamptz not null default now()
);

comment on table public.presupuestos is
  'Ofertas a clientes. Los importes se congelan al emitir: una oferta mandada no '
  'puede cambiar sola porque cambie una tarifa.';
comment on column public.presupuestos.token is
  'Lo que lleva el enlace y el QR que se le manda al cliente para que acepte. '
  'No es una contraseña: es lo único que hay, así que solo va en su correo.';
comment on column public.presupuestos.coste is
  'Lo que cuesta a la empresa lo ofertado. Para ver el margen ANTES de mandarlo, '
  'que es cuando se puede corregir. No sale en el documento del cliente.';

create unique index if not exists presupuestos_referencia_idx
  on public.presupuestos (referencia) where referencia is not null;
create unique index if not exists presupuestos_token_idx
  on public.presupuestos (token) where token is not null;
create index if not exists presupuestos_cliente_idx on public.presupuestos (cliente_id);
create index if not exists presupuestos_estado_idx  on public.presupuestos (estado, creado desc);

-- ---------------------------------------------------------------------------
-- 2. Las líneas
-- ---------------------------------------------------------------------------
create table if not exists public.presupuesto_lineas (
  id              uuid primary key default gen_random_uuid(),
  presupuesto_id  uuid not null references public.presupuestos(id) on delete cascade,
  orden           integer not null default 0,
  -- 'material' | 'mano_obra' | 'desplazamiento' | 'texto'
  tipo            text not null default 'material',
  articulo_id     uuid references public.articulos(id) on delete set null,
  descripcion     text not null default '',
  cantidad        numeric not null default 1,
  unidad          text not null default 'ud',
  precio          numeric not null default 0,
  importe         numeric not null default 0,
  coste           numeric not null default 0,
  creado          timestamptz not null default now()
);

comment on table public.presupuesto_lineas is
  'Cada línea guarda su precio, no una referencia al precio de hoy: un '
  'presupuesto mandado tiene que seguir diciendo lo que decía.';

create index if not exists presupuesto_lineas_idx
  on public.presupuesto_lineas (presupuesto_id, orden);

-- ---------------------------------------------------------------------------
-- 3. Permisos
--
-- Los presupuestos llevan precios y costes, así que son de administrador y
-- oficina. El técnico no los ve: lo que él propone va en las recomendaciones de
-- su parte, y la oficina lo convierte en oferta.
-- ---------------------------------------------------------------------------
alter table public.presupuestos       enable row level security;
alter table public.presupuesto_lineas enable row level security;

drop policy if exists "gestion presupuestos" on public.presupuestos;
create policy "gestion presupuestos" on public.presupuestos for all to authenticated
  using (public.es_gestion()) with check (public.es_gestion());

drop policy if exists "gestion presupuesto lineas" on public.presupuesto_lineas;
create policy "gestion presupuesto lineas" on public.presupuesto_lineas for all to authenticated
  using (public.es_gestion()) with check (public.es_gestion());

-- ---------------------------------------------------------------------------
-- 4. Lo que ve el cliente
--
-- Sin contraseña y por token, igual que la ficha pública de una puerta. Devuelve
-- el presupuesto SIN costes y sin notas internas: lo que se le mandó, ni más ni
-- menos. Si está caducado lo dice, en vez de dejarlo aceptar.
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
    'condiciones', p.condiciones,
    'aceptado_el', p.aceptado_el, 'aceptado_por', p.aceptado_por,
    'rechazado_el', p.rechazado_el,
    'lineas', v_lineas);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. La aceptación
--
-- Un presupuesto caducado o ya resuelto no se acepta otra vez. El nombre de
-- quien acepta es obligatorio: sin él, la aceptación no vale para nada.
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
  select * into p from public.presupuestos where token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if p.estado = 'borrador' then
    return jsonb_build_object('ok', false, 'motivo', 'no_enviado');
  end if;
  if p.estado in ('aceptado','convertido') then
    return jsonb_build_object('ok', false, 'motivo', 'ya_aceptado');
  end if;
  if p.estado = 'rechazado' then
    return jsonb_build_object('ok', false, 'motivo', 'ya_rechazado');
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
           rechazado_motivo = nullif(trim(coalesce(p_motivo,'')), ''),
           actualizado = now()
     where id = p.id;
  end if;

  return jsonb_build_object('ok', true, 'estado', case when p_acepta then 'aceptado' else 'rechazado' end);
end;
$$;

grant execute on function public.presupuesto_publico(text) to anon, authenticated;
grant execute on function public.responder_presupuesto(text, boolean, text, text) to anon, authenticated;

-- ============================================================================
-- Comprobación:
-- select table_name from information_schema.tables
--  where table_schema='public' and table_name in ('presupuestos','presupuesto_lineas');
-- select routine_name from information_schema.routines
--  where routine_schema='public'
--    and routine_name in ('presupuesto_publico','responder_presupuesto');
-- ============================================================================
