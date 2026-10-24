-- ============================================================================
-- ARIZA SAT · Contactos del cliente y seguimiento de la oferta
--
-- POR QUÉ
-- En una obra no hay un cliente, hay varios: el jefe de obra, el aparejador, el
-- administrador de la comunidad y el que acaba pagando. La oferta va a uno de
-- ellos, y a veces a otro distinto la semana siguiente. Hasta ahora el cliente
-- tenía un solo correo en su ficha, así que o se mandaba siempre al mismo o se
-- copiaba la dirección a mano sin que quedara constancia.
--
-- Y después de mandarla había un silencio: no se sabía si la habían abierto, ni
-- cuántas veces, ni cuándo. Llamar a ciegas a los tres días es perder el tiempo
-- la mitad de las veces; llamar al que la ha abierto dos veces esta mañana es
-- otra cosa.
--
-- QUÉ TRAE
--
--   1. Contactos por cliente: nombre, cargo, correo y teléfono. Uno puede ser
--      el principal, que es el que sale propuesto.
--
--   2. Historial de envíos del presupuesto: cada vez que sale, a quién y a qué
--      dirección. Mandarlo otra vez no borra la vez anterior.
--
--   3. Registro de aperturas: cada vez que alguien abre el enlace del
--      presupuesto queda la fecha y la hora.
--
-- UNA ACLARACIÓN IMPORTANTE SOBRE LO QUE ESTO NO ES
-- Esto NO dice si el cliente ha abierto el CORREO. Eso solo se puede intentar
-- con una imagen oculta dentro del mensaje, que Gmail y Apple Mail bloquean de
-- serie, que miente más de lo que acierta y que además hay que declarar en
-- protección de datos. Lo que se registra aquí es cuándo se ha abierto la
-- PÁGINA del presupuesto, que es un hecho, no una suposición.
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Contactos del cliente
-- ---------------------------------------------------------------------------
create table if not exists public.contactos (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nombre     text not null default '',
  cargo      text,
  email      text,
  telefono   text,
  -- el que sale propuesto al mandar algo
  principal  boolean not null default false,
  notas      text,
  activo     boolean not null default true,
  creado     timestamptz not null default now(),
  creado_por text default ''
);

comment on table public.contactos is
  'Las personas de un cliente: jefe de obra, administrador, quien paga. La '
  'oferta va a una de ellas, y queda dicho a cuál.';
comment on column public.contactos.principal is
  'El que sale propuesto al mandar. No impide elegir otro ni escribir una '
  'dirección a mano.';

create index if not exists contactos_cliente_idx on public.contactos (cliente_id, activo);

alter table public.contactos enable row level security;
drop policy if exists "equipo contactos" on public.contactos;
create policy "equipo contactos" on public.contactos for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

-- ---------------------------------------------------------------------------
-- 2. El presupuesto apunta a quién va, y con qué subtítulo
-- ---------------------------------------------------------------------------
alter table public.presupuestos add column if not exists contacto_id uuid
  references public.contactos(id) on delete set null;
alter table public.presupuestos add column if not exists subtitulo text;

comment on column public.presupuestos.subtitulo is
  'La línea que va bajo el título en el documento: de un vistazo dice de qué '
  'va la oferta sin tener que leer las líneas.';

-- ---------------------------------------------------------------------------
-- 3. Cada vez que sale, queda escrito
-- ---------------------------------------------------------------------------
create table if not exists public.presupuesto_envios (
  id             uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  contacto_id    uuid references public.contactos(id) on delete set null,
  -- a dónde fue: un correo, un teléfono, o «entregado en mano»
  destino        text not null default '',
  nombre         text,
  nota           text,
  cuando         timestamptz not null default now(),
  por            text default ''
);

comment on table public.presupuesto_envios is
  'Un presupuesto se manda más de una vez, y a veces a personas distintas. '
  'Cada salida queda apuntada; la nueva no borra la anterior.';

create index if not exists presupuesto_envios_idx
  on public.presupuesto_envios (presupuesto_id, cuando desc);

alter table public.presupuesto_envios enable row level security;
drop policy if exists "gestion presupuesto envios" on public.presupuesto_envios;
create policy "gestion presupuesto envios" on public.presupuesto_envios for all to authenticated
  using (public.es_gestion()) with check (public.es_gestion());

-- ---------------------------------------------------------------------------
-- 4. Cada vez que lo abren, también
--
-- Lo escribe la función pública, no el navegador del cliente: así no hace
-- falta abrir la tabla a quien no ha entrado en la aplicación.
-- ---------------------------------------------------------------------------
create table if not exists public.presupuesto_visitas (
  id             uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  cuando         timestamptz not null default now()
);

comment on table public.presupuesto_visitas is
  'Cada apertura del enlace del presupuesto. No dice QUIÉN lo abrió, porque no '
  'se puede saber sin pedir permiso: dice cuándo y cuántas veces, que para '
  'decidir si toca llamar es lo que hace falta.';

create index if not exists presupuesto_visitas_idx
  on public.presupuesto_visitas (presupuesto_id, cuando desc);

alter table public.presupuesto_visitas enable row level security;
drop policy if exists "gestion presupuesto visitas" on public.presupuesto_visitas;
create policy "gestion presupuesto visitas" on public.presupuesto_visitas for all to authenticated
  using (public.es_gestion()) with check (public.es_gestion());

-- ---------------------------------------------------------------------------
-- 5. La función pública, que ahora además apunta la visita
--
-- Se mantiene todo lo de antes y se le añaden dos cosas: el subtítulo, y una
-- fila en presupuesto_visitas por cada apertura. Si ese apunte fallara, la
-- función sigue y el cliente ve su presupuesto igual: el seguimiento es útil,
-- pero no es más importante que la oferta.
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

  begin
    insert into public.presupuesto_visitas (presupuesto_id) values (p.id);
  exception when others then
    null;  -- que no se pueda apuntar la visita no impide ver la oferta
  end;

  select coalesce(nombre, '') into v_cliente from public.clientes where id = p.cliente_id;
  select coalesce(codigo, '') into v_puerta  from public.puertas  where id = p.puerta_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'descripcion', l.descripcion, 'cantidad', l.cantidad,
           'unidad', l.unidad, 'precio', l.precio, 'importe', l.importe,
           'tipo', l.tipo, 'nombre', l.nombre, 'referencia', l.referencia) order by l.orden), '[]'::jsonb)
    into v_lineas
    from public.presupuesto_lineas l
   where l.presupuesto_id = p.id;

  return jsonb_build_object(
    'ok', true,
    'referencia', p.referencia, 'titulo', p.titulo, 'subtitulo', p.subtitulo,
    'descripcion', p.descripcion,
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
-- 6. La línea, con nombre y descripción separados
--
-- En el papel, una línea es un código, un nombre corto en negrita y, debajo,
-- la explicación larga. Hasta ahora todo eso iba en un solo campo de 160
-- caracteres, y por eso el documento salía pobre.
--
-- 'descripcion' se queda como está y sigue siendo el nombre corto: lo que ya
-- hay escrito no se toca ni se mueve de sitio.
-- ---------------------------------------------------------------------------
alter table public.presupuesto_lineas add column if not exists nombre      text;
alter table public.presupuesto_lineas add column if not exists referencia  text;
alter table public.presupuesto_lineas add column if not exists detalle     text;
alter table public.presupuesto_lineas add column if not exists dto         numeric not null default 0;

comment on column public.presupuesto_lineas.dto is
  'Descuento de esta línea en tanto por ciento. El importe se guarda ya con él '
  'aplicado: el porcentaje está para que salga impreso, no para recalcular.';

comment on column public.presupuesto_lineas.detalle is
  'La explicación larga que va debajo del nombre, en letra más pequeña. Lo '
  'que convence al que lee, frente al concepto escueto que solo identifica.';
comment on column public.presupuesto_lineas.referencia is
  'El código con el que se identifica: el del almacén, o el del fabricante.';
comment on column public.presupuesto_lineas.tipo is
  'material | mano_obra | desplazamiento | texto | capitulo. Un capítulo abre '
  'un grupo de líneas y lleva su propio subtotal en el documento.';

-- ============================================================================
-- Comprobación rápida:
--
--   select count(*) from public.contactos;
--   select count(*) from public.presupuesto_envios;
--   select count(*) from public.presupuesto_visitas;
--   select column_name from information_schema.columns
--    where table_name = 'presupuesto_lineas'
--      and column_name in ('nombre','referencia','detalle');
-- ============================================================================
