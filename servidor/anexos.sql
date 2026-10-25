-- ============================================================================
-- ARIZA SAT · Anexos de verdad, y un solo título
--
-- POR QUÉ
-- Los «anexos» nacieron como un campo de texto al final del documento. Pero un
-- anexo, cuando se manda una oferta, es otra cosa: es la ficha técnica del
-- fabricante, el plano, el certificado de la banda, el folleto del modelo. Son
-- papeles, no párrafos.
--
-- Y el título del presupuesto se había partido en dos campos, título y
-- subtítulo, que acababan diciendo lo mismo con distintas palabras. Uno basta.
--
-- QUÉ HACE
--
--   1. Crea presupuesto_adjuntos: los documentos que acompañan a la oferta.
--
--   2. Recoge lo que hubiera escrito en el campo de texto «anexos» y lo pega al
--      final de las condiciones, que es donde encaja. No se pierde nada.
--
--   3. Si algún presupuesto tenía subtítulo y no título, el subtítulo pasa a
--      ser el título. El campo subtitulo se queda en la tabla, vacío y sin uso:
--      borrar una columna con datos dentro no se hace a la ligera.
--
-- SOBRE QUIÉN PUEDE VER LOS ADJUNTOS
-- Van a un cubo de lectura abierta, porque el cliente los abre desde el enlace
-- de su presupuesto y ahí no ha entrado con usuario ni contraseña. La ruta
-- lleva un token largo al azar, así que no se adivina, pero quien tenga el
-- enlace del fichero puede abrirlo. Para una ficha técnica o un folleto da
-- igual; para un plano con datos de otro cliente, no. La aplicación lo avisa
-- al adjuntar.
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Los documentos de la oferta
-- ---------------------------------------------------------------------------
create table if not exists public.presupuesto_adjuntos (
  id             uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  nombre         text not null default '',
  -- lo que se le enseña al cliente debajo del nombre
  descripcion    text,
  ruta           text not null,
  tipo           text,
  bytes          bigint,
  orden          integer not null default 0,
  -- false para un papel que es solo para la oficina
  publico        boolean not null default true,
  creado         timestamptz not null default now(),
  creado_por     text default ''
);

comment on table public.presupuesto_adjuntos is
  'Los papeles que acompañan a la oferta: ficha técnica, plano, certificado, '
  'folleto. Lo que antes era un párrafo al final del documento.';
comment on column public.presupuesto_adjuntos.publico is
  'true: el cliente lo ve y lo descarga desde su enlace. false: se queda en la '
  'oficina, por ejemplo el presupuesto del proveedor.';

create index if not exists presupuesto_adjuntos_idx
  on public.presupuesto_adjuntos (presupuesto_id, orden);

alter table public.presupuesto_adjuntos enable row level security;
drop policy if exists "gestion presupuesto adjuntos" on public.presupuesto_adjuntos;
create policy "gestion presupuesto adjuntos" on public.presupuesto_adjuntos for all to authenticated
  using (public.es_gestion()) with check (public.es_gestion());

-- ---------------------------------------------------------------------------
-- 2. El cubo donde viven esos ficheros
--
-- De lectura abierta, porque quien los abre es el cliente desde su enlace y no
-- ha entrado en la aplicación. Escribir solo puede quien ha entrado.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
     values ('ofertas', 'ofertas', true)
on conflict (id) do update set public = true;

drop policy if exists "ofertas lectura" on storage.objects;
create policy "ofertas lectura" on storage.objects for select to anon, authenticated
  using (bucket_id = 'ofertas');

drop policy if exists "ofertas escritura" on storage.objects;
create policy "ofertas escritura" on storage.objects for insert to authenticated
  with check (bucket_id = 'ofertas');

drop policy if exists "ofertas borrado" on storage.objects;
create policy "ofertas borrado" on storage.objects for delete to authenticated
  using (bucket_id = 'ofertas');

-- ---------------------------------------------------------------------------
-- 3. Lo escrito en el viejo campo de texto no se tira
-- ---------------------------------------------------------------------------
update public.presupuestos
   set condiciones = trim(both E'\n' from
         coalesce(condiciones, '') || E'\n\n' || anexos),
       anexos = null
 where anexos is not null and btrim(anexos) <> '';

-- Y los textos guardados que apuntaban a los anexos pasan a las condiciones
update public.textos_presu set destino = 'condiciones' where destino = 'anexos';

-- ---------------------------------------------------------------------------
-- 4. Un solo título
-- ---------------------------------------------------------------------------
update public.presupuestos
   set titulo = subtitulo
 where btrim(coalesce(titulo, '')) = '' and btrim(coalesce(subtitulo, '')) <> '';

update public.presupuestos set subtitulo = null where subtitulo is not null;

comment on column public.presupuestos.subtitulo is
  'SIN USO desde el 25-10-2026: título y subtítulo decían lo mismo y se dejó '
  'uno solo. La columna se queda vacía para no borrar una columna por gusto.';
comment on column public.presupuestos.anexos is
  'SIN USO desde el 25-10-2026: los anexos pasaron a ser ficheros, en '
  'presupuesto_adjuntos. Lo que había escrito se movió a condiciones.';

-- ---------------------------------------------------------------------------
-- 5. Lo que ve el cliente: ahora también sus documentos
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
  v_adj    jsonb;
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
           'tipo', l.tipo, 'nombre', l.nombre, 'referencia', l.referencia,
           'detalle', l.detalle, 'dto', l.dto) order by l.orden), '[]'::jsonb)
    into v_lineas
    from public.presupuesto_lineas l
   where l.presupuesto_id = p.id;

  -- Solo los marcados como públicos: lo de la oficina se queda en la oficina
  select coalesce(jsonb_agg(jsonb_build_object(
           'nombre', a.nombre, 'descripcion', a.descripcion,
           'ruta', a.ruta, 'tipo', a.tipo, 'bytes', a.bytes) order by a.orden), '[]'::jsonb)
    into v_adj
    from public.presupuesto_adjuntos a
   where a.presupuesto_id = p.id and a.publico;

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
    'adjuntos', v_adj,
    'lineas', v_lineas);
end;
$$;

grant execute on function public.presupuesto_publico(text) to anon, authenticated;

-- ============================================================================
-- Comprobación rápida:
--
--   select count(*) from public.presupuesto_adjuntos;
--   select id, public from storage.buckets where id = 'ofertas';
--   select count(*) from public.presupuestos where btrim(coalesce(anexos,'')) <> '';
--     -- tiene que devolver 0
-- ============================================================================
