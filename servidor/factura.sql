-- ============================================================================
-- ARIZA SAT · Cobrar no es facturar
--
-- POR QUÉ
-- Dos cosas que la aplicación trataba como una sola:
--
--   1. COBRAR en obra. El técnico cobra la visita en el momento, en efectivo o
--      con el datáfono, y lo apunta en el parte.
--   2. FACTURAR. La oficina emite la factura y se la manda al cliente.
--
-- La lista de «pendiente de facturar» excluía lo cobrado en obra, de modo que
-- esas visitas desaparecían de la lista y no las facturaba nadie. Dinero
-- cobrado del que no queda factura, que además de desorden es un problema de
-- IVA. Y la aplicación no lo decía en ninguna parte: simplemente no salían.
--
-- El arreglo de esa lista es de la aplicación. Lo que falta en la base son las
-- fechas para poder perseguir el cobro de la factura:
--
--   clientes.plazo_pago_dias  → de ahí sale el vencimiento de cada factura
--   clientes.forma_pago       → cómo paga habitualmente ese cliente
--   valoraciones.vence_el     → cuándo había que cobrar esa factura
--   valoraciones.cobrado_el   → cuándo se cobró de verdad
--   valoraciones.cobro_forma  → cómo
--   valoraciones.cobro_ref    → número de remesa, de transferencia, lo que sea
--
-- UNA DISTINCIÓN QUE NO HAY QUE MEZCLAR
-- avisos.cobrado y avisos.cobro_importe son lo que el técnico cobró EN OBRA.
-- valoraciones.cobrado_el es que la FACTURA está cobrada. Un cobro en obra no
-- marca la factura como cobrada, porque todavía no hay factura: la hace la
-- oficina después, y es entonces cuando ese cobro se da por aplicado.
--
-- LO QUE ESTE FICHERO NO HACE
-- No emite facturas ni las numera. Esta aplicación NO es un sistema informático
-- de facturación a efectos del Real Decreto 1007/2023: la factura se emite
-- fuera, y aquí se apunta su número para poder seguir el cobro. Por eso no hay
-- ninguna serie, ninguna numeración y ningún documento con validez fiscal.
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PRIMERO, UNA DEUDA DEL REPOSITORIO (encontrada el 02-11-2026)
--
-- Las cuatro columnas del cobro en obra existen en la base de producción y la
-- aplicación las usa a diario, pero NO estaban en ningún fichero de servidor/:
-- se crearon a mano en su día y nunca se escribieron. Es el mismo caso que la
-- función valorar_aviso, rescatada el 02-11-2026.
--
-- Eso significa que el repositorio no bastaba para levantar la base desde cero,
-- y que el banco de pruebas de SQL no podía probar nada que las nombrase. Aquí
-- quedan escritas. En la base de David no cambia nada: ya están, y el «if not
-- exists» las deja como están.
-- ---------------------------------------------------------------------------
alter table public.avisos add column if not exists cobrado boolean not null default false;
alter table public.avisos add column if not exists cobro_importe numeric;
alter table public.avisos add column if not exists cobro_forma text;
alter table public.avisos add column if not exists cobro_ref text;

comment on column public.avisos.cobrado is
  'El técnico cobró esta visita EN OBRA. No quiere decir que esté facturada: la factura la hace la oficina después.';

alter table public.clientes add column if not exists plazo_pago_dias integer;
alter table public.clientes add column if not exists forma_pago text;

alter table public.valoraciones add column if not exists vence_el date;
alter table public.valoraciones add column if not exists cobrado_el date;
alter table public.valoraciones add column if not exists cobro_forma text;
alter table public.valoraciones add column if not exists cobro_ref text;

comment on column public.clientes.plazo_pago_dias is
  'Días desde la fecha de factura hasta su vencimiento, para este cliente. Vacío: al contado.';
comment on column public.valoraciones.vence_el is
  'Fecha en que había que tener cobrada la factura. Sale del plazo del cliente, y se puede cambiar a mano.';
comment on column public.valoraciones.cobrado_el is
  'Cuándo se cobró LA FACTURA. No es lo mismo que avisos.cobrado, que es lo que el técnico cobró en obra.';

-- Para buscar lo vencido sin leer la tabla entera.
create index if not exists valoraciones_vence_idx on public.valoraciones (vence_el)
  where facturado and cobrado_el is null;

-- ----------------------------------------------------------------------------
-- Lo que está facturado, vencido y sin cobrar. La aplicación lo calcula con lo
-- que ya tiene cargado; esta vista es para mirarlo desde el editor de SQL y
-- para poder comprobar que las dos cosas dicen lo mismo.
-- ----------------------------------------------------------------------------
create or replace view public.impagados as
select v.aviso_id,
       a.cliente_id,
       c.nombre                            as cliente,
       v.factura_ref,
       v.facturado_el,
       v.vence_el,
       (current_date - v.vence_el)         as dias_de_retraso,
       v.imp_total,
       a.cobrado                           as cobrado_en_obra,
       a.cobro_importe
  from public.valoraciones v
  join public.avisos a   on a.id = v.aviso_id
  left join public.clientes c on c.id = a.cliente_id
 where v.facturado
   and v.cobrado_el is null
   and v.vence_el is not null
   and v.vence_el < current_date
   and not a.anulada;

grant select on public.impagados to authenticated;

-- ----------------------------------------------------------------------------
-- Y lo que está cerrado y todavía sin facturar, incluyendo lo cobrado en obra,
-- que es justo lo que se caía de la lista.
-- ----------------------------------------------------------------------------
create or replace view public.pendiente_de_facturar as
select v.aviso_id,
       a.cliente_id,
       c.nombre            as cliente,
       a.tipo,
       a.cerrado,
       v.imp_total,
       a.cobrado           as cobrado_en_obra,
       a.cobro_importe,
       a.cobro_forma
  from public.valoraciones v
  join public.avisos a   on a.id = v.aviso_id
  left join public.clientes c on c.id = a.cliente_id
 where a.cerrado is not null
   and not a.anulada
   and not a.sin_cargo
   and not v.facturado;

grant select on public.pendiente_de_facturar to authenticated;
